import { LikeState } from '@/modules/quack/domain/like';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import { Controller, Delete, HttpCode, Put, UseGuards } from '@nestjs/common';

@Controller('quacks')
@UseGuards(AuthenticatedUserGuard)
export class LikesController {
  @Put(':quackId/like')
  @HttpCode(200)
  async like(): Promise<LikeState> {
    throw new Error('not implemented');
  }

  @Delete(':quackId/like')
  @HttpCode(200)
  async unlike(): Promise<LikeState> {
    throw new Error('not implemented');
  }
}
