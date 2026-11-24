import { LikeState, QuackLikeState } from '@/modules/quack/domain/like';
import { LikesRepository } from '@/modules/quack/repositories/likes.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class LikesService {
  constructor(private readonly repository: LikesRepository) {}

  async setLike(
    user: Identity,
    quackId: string,
    liked: boolean,
  ): Promise<LikeState> {
    const state = await this.repository.setLike({
      quackId,
      userId: user.id,
      liked,
    });
    if (!state) throw new NotFoundException('Quack not found');
    return state;
  }

  async read(user: Identity, quackIds: string[]): Promise<QuackLikeState[]> {
    return this.repository.read({ quackIds, userId: user.id });
  }
}
