import { LikeState, QuackLikeState } from '@/modules/quack/domain/like';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LikesRepository {
  async setLike(input: {
    quackId: string;
    userId: string;
    liked: boolean;
  }): Promise<LikeState | null> {
    void input;
    throw new Error('not implemented');
  }

  async read(input: {
    quackIds: string[];
    userId: string;
  }): Promise<QuackLikeState[]> {
    void input;
    throw new Error('not implemented');
  }
}
