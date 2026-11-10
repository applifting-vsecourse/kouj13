import { PrismaService } from '@/core/prisma/prisma.service';
import {
  Prisma,
  Quack as PrismaQuack,
  User as PrismaUser,
} from '@/generated/prisma/client';
import { readPolls } from '@/modules/poll/repositories/poll.repository';
import { Quack, QuackMood } from '@/modules/quack/domain/quack';
import { Injectable, NotFoundException } from '@nestjs/common';

const mapPrismaQuackToDomain = (
  quack: PrismaQuack & { user?: PrismaUser; _count?: { replies: number } },
): Quack => ({
  id: quack.id,
  text: quack.text,
  mood: quack.mood,
  userId: quack.userId,
  createdAt: quack.createdAt,
  updatedAt: quack.updatedAt,
  parentId: quack.parentId,
  deletedAt: quack.deletedAt,
  ...(quack._count ? { replyCount: quack._count.replies } : {}),
  user: quack.user
    ? {
        id: quack.user.id,
        name: quack.user.name,
        username: quack.user.username ?? '',
      }
    : undefined,
});

/**
 * If you decide to choose a different ORM or database, you should only need to change the repository files methods implementation.
 * Inject what you need instead of PrismaService and re-implement the methods and model mapping.
 */
@Injectable()
export class QuackRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ADR 0001: a quack with replies becomes a content-free tombstone, one
   * without replies is hard-deleted. Returns false when there is nothing the
   * caller may delete (missing, already deleted, or someone else's).
   */
  async deleteQuack(id: string, userId: string | undefined): Promise<boolean> {
    // The service omits the author constraint only for an authenticated admin.
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE conflicts with the FOR SHARE lock taken when replying, so no
      // reply can appear between counting replies and deleting.
      const [target] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM quack
        WHERE id = ${id} AND "deletedAt" IS NULL
        ${userId === undefined ? Prisma.empty : Prisma.sql`AND "userId" = ${userId}`}
        FOR UPDATE`;
      if (!target) return false;

      const replies = await tx.quack.count({ where: { parentId: id } });
      if (replies === 0) {
        await tx.quack.delete({ where: { id } });
        return true;
      }

      await tx.poll.deleteMany({ where: { quackId: id } });
      await tx.quack.update({
        where: { id },
        data: { text: '', mood: null, deletedAt: new Date() },
      });
      return true;
    });
  }

  async getQuacks(userId: string): Promise<Quack[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const quacks = await tx.quack.findMany({
          // Top-level only; a tombstone stays visible while it still has replies.
          where: {
            parentId: null,
            OR: [{ deletedAt: null }, { replies: { some: {} } }],
          },
          include: {
            user: true,
            poll: true,
            _count: { select: { replies: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        const polls = await readPolls(
          tx,
          quacks.flatMap((quack) => (quack.poll ? [quack.poll.id] : [])),
          userId,
        );
        return quacks.map((quack) => ({
          ...mapPrismaQuackToDomain(quack),
          poll: polls.find((poll) => poll.id === quack.poll?.id) ?? null,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Replies to a top-level quack, oldest first, or null when it doesn't exist. */
  async getReplies(parentId: string): Promise<Quack[] | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const parent = await tx.quack.findFirst({
          where: { id: parentId, parentId: null },
          select: { id: true },
        });
        if (!parent) return null;
        const replies = await tx.quack.findMany({
          where: { parentId },
          include: { user: true, _count: { select: { replies: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return replies.map((reply) => ({
          ...mapPrismaQuackToDomain(reply),
          poll: null,
        }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async createQuack(createQuackData: {
    text: string;
    mood?: QuackMood | null;
    userId: string;
    poll?: { options: string[] };
    parentId?: string;
  }): Promise<Quack> {
    const { parentId } = createQuackData;
    return this.prisma.$transaction(async (tx) => {
      if (parentId !== undefined) {
        // Only live top-level quacks accept replies. FOR SHARE waits for a
        // concurrent delete, re-checks the row it left behind, and then keeps
        // the parent from being deleted until this reply is committed.
        const [parent] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM quack
          WHERE id = ${parentId} AND "parentId" IS NULL AND "deletedAt" IS NULL
          FOR SHARE`;
        if (!parent) throw new NotFoundException('Quack not found');
      }
      const quack = await tx.quack.create({
        data: {
          text: createQuackData.text,
          mood: createQuackData.mood,
          user: { connect: { id: createQuackData.userId } },
          ...(parentId !== undefined
            ? { parent: { connect: { id: parentId } } }
            : {}),
          ...(createQuackData.poll
            ? {
                poll: {
                  create: {
                    options: {
                      create: createQuackData.poll.options.map(
                        (label, position) => ({ label, position }),
                      ),
                    },
                  },
                },
              }
            : {}),
        },
        include: { user: true, poll: true },
      });
      const [poll] = await readPolls(
        tx,
        quack.poll ? [quack.poll.id] : [],
        createQuackData.userId,
      );
      return {
        ...mapPrismaQuackToDomain(quack),
        replyCount: 0,
        poll: poll ?? null,
      };
    });
  }
}
