import { PrismaService } from '@/core/prisma/prisma.service';
import {
  Prisma,
  Quack as PrismaQuack,
  User as PrismaUser,
} from '@/generated/prisma/client';
import { readPolls } from '@/modules/poll/repositories/poll.repository';
import { Quack, QuackMood } from '@/modules/quack/domain/quack';
import { Injectable } from '@nestjs/common';

const mapPrismaQuackToDomain = (
  quack: PrismaQuack & { user?: PrismaUser },
): Quack => ({
  id: quack.id,
  text: quack.text,
  mood: quack.mood,
  userId: quack.userId,
  createdAt: quack.createdAt,
  updatedAt: quack.updatedAt,
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

  async deleteQuack(id: string, userId: string | undefined): Promise<boolean> {
    // The service omits the author constraint only for an authenticated admin.
    const { count } = await this.prisma.quack.deleteMany({
      where: { id, ...(userId === undefined ? {} : { userId }) },
    });
    return count > 0;
  }

  async getQuacks(userId: string): Promise<Quack[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const quacks = await tx.quack.findMany({
          include: { user: true, poll: true },
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

  async createQuack(createQuackData: {
    text: string;
    mood?: QuackMood | null;
    userId: string;
    poll?: { options: string[] };
  }): Promise<Quack> {
    return this.prisma.$transaction(async (tx) => {
      const quack = await tx.quack.create({
        data: {
          text: createQuackData.text,
          mood: createQuackData.mood,
          user: { connect: { id: createQuackData.userId } },
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
      return { ...mapPrismaQuackToDomain(quack), poll: poll ?? null };
    });
  }
}
