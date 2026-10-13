import { PrismaService } from '@/core/prisma/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { Poll } from '@/modules/poll/domain/poll';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

// Aggregate counts and the viewer's choice without loading or exposing voter lists.
export async function readPolls(
  tx: Prisma.TransactionClient,
  pollIds: string[],
  userId: string,
): Promise<Poll[]> {
  if (!pollIds.length) return [];
  const rows = await tx.$queryRaw<
    {
      pollId: string;
      id: string;
      label: string;
      position: number;
      voteCount: number;
      myOptionId: string | null;
    }[]
  >`
    SELECT o."pollId", o.id, o.label, o.position,
      COUNT(v."userId")::int AS "voteCount",
      MAX(CASE WHEN v."userId" = ${userId} THEN v."optionId" END) AS "myOptionId"
    FROM poll_option o LEFT JOIN poll_vote v ON v."pollId" = o."pollId" AND v."optionId" = o.id
    WHERE o."pollId" IN (${Prisma.join(pollIds)})
    GROUP BY o."pollId", o.id, o.label, o.position ORDER BY o.position`;
  return pollIds.map((id) => {
    const options = rows.filter((row) => row.pollId === id);
    return {
      id,
      options: options.map(({ id, label, position, voteCount }) => ({
        id,
        label,
        position,
        voteCount,
      })),
      totalVotes: options.reduce((sum, option) => sum + option.voteCount, 0),
      myOptionId:
        options.find((option) => option.myOptionId)?.myOptionId ?? null,
    };
  });
}

@Injectable()
export class PollRepository {
  constructor(private readonly prisma: PrismaService) {}

  async vote(pollId: string, userId: string, optionId: string): Promise<Poll> {
    const saved = await this.prisma.$executeRaw`
      INSERT INTO poll_vote ("pollId", "userId", "optionId", "createdAt", "updatedAt")
      SELECT ${pollId}, ${userId}, id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM poll_option WHERE id = ${optionId} AND "pollId" = ${pollId}
      ON CONFLICT ("pollId", "userId") DO UPDATE
      SET "optionId" = EXCLUDED."optionId", "updatedAt" = CASE
        WHEN poll_vote."optionId" = EXCLUDED."optionId" THEN poll_vote."updatedAt"
        ELSE EXCLUDED."updatedAt" END`;
    if (!saved) {
      if (!(await this.prisma.poll.findUnique({ where: { id: pollId } })))
        throw new NotFoundException('Poll not found');
      throw new BadRequestException('Choose an answer from this poll');
    }
    // This single aggregate statement reads one consistent committed snapshot.
    const [poll] = await readPolls(this.prisma, [pollId], userId);
    return poll;
  }
}
