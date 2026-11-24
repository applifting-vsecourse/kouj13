import { LikeState, QuackLikeState } from '@/modules/quack/domain/like';
import { LikesRepository } from '@/modules/quack/repositories/likes.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LikesService {
  constructor(private readonly repository: LikesRepository) {}

  async setLike(
    user: Identity,
    quackId: string,
    liked: boolean,
  ): Promise<LikeState> {
    void user;
    void quackId;
    void liked;
    throw new Error('not implemented');
  }

  async read(user: Identity, quackIds: string[]): Promise<QuackLikeState[]> {
    void user;
    void quackIds;
    throw new Error('not implemented');
  }
}
