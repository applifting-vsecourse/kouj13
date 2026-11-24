import { PrismaService } from '@/core/prisma/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { LikeState, QuackLikeState } from '@/modules/quack/domain/like';
import { Injectable } from '@nestjs/common';

// One snapshot for both the count and viewer membership; never load liker lists.
export async function readLikes(
  tx: Prisma.TransactionClient,
  quackIds: string[],
  userId: string,
): Promise<QuackLikeState[]> {
  if (!quackIds.length) return [];
  return tx.$queryRaw<QuackLikeState[]>`
    SELECT q.id AS "quackId", COUNT(l."userId")::int AS "likeCount",
      COALESCE(BOOL_OR(l."userId" = ${userId}), false) AS "likedByMe"
    FROM quack q LEFT JOIN "like" l
      ON l."quackId" = q.id AND q."deletedAt" IS NULL
    WHERE q.id IN (${Prisma.join(quackIds)})
    GROUP BY q.id`;
}

@Injectable()
export class LikesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async setLike(input: {
    quackId: string;
    userId: string;
    liked: boolean;
  }): Promise<LikeState | null> {
    const { quackId, userId, liked } = input;
    return this.prisma.$transaction(async (tx) => {
      // Serialize changes with each other and with deletion. A waiter rechecks
      // deletedAt after the deleting transaction commits its tombstone.
      const [target] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM quack WHERE id = ${quackId} AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (!target) return null;
      if (liked) {
        await tx.like.createMany({
          data: [{ quackId, userId }],
          skipDuplicates: true,
        });
      } else {
        await tx.like.deleteMany({ where: { quackId, userId } });
      }
      const [state] = await readLikes(tx, [quackId], userId);
      return { likeCount: state.likeCount, likedByMe: state.likedByMe };
    });
  }

  async read(input: {
    quackIds: string[];
    userId: string;
  }): Promise<QuackLikeState[]> {
    return readLikes(this.prisma, input.quackIds, input.userId);
  }
}
