import { Quack, QuackMood } from '@/modules/quack/domain/quack';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class QuacksService {
  constructor(private readonly quackRepository: QuackRepository) {}

  async getQuacks(user: Identity): Promise<Quack[]> {
    return this.quackRepository.getQuacks(user.id);
  }

  async createQuack(
    user: Identity,
    quackData: {
      text: string;
      mood?: QuackMood | null;
      poll?: { options: string[] };
    },
  ): Promise<Quack> {
    return this.quackRepository.createQuack({
      text: quackData.text,
      mood: quackData.mood ?? null,
      ...(quackData.poll ? { poll: quackData.poll } : {}),
      // the author is taken from the session, never from the request body
      userId: user.id,
    });
  }
}
