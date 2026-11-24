import { LikeState } from '@/modules/quack/domain/like';
import { LikesService } from '@/modules/quack/services/likes.service';
import { User } from '@/shared/auth/decorators/user.decorator';
import { Identity } from '@/shared/auth/domain/identity';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('quacks')
@ApiCookieAuth()
@Controller('quacks')
@UseGuards(AuthenticatedUserGuard)
export class LikesController {
  constructor(private readonly service: LikesService) {}

  private validateBody(body: unknown): void {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new BadRequestException('Like requests accept no body fields');
    }
  }

  @Put(':quackId/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'Like a live quack or reply as the session user' })
  async like(
    @User() user: Identity,
    @Param('quackId') quackId: string,
    @Body() body?: unknown,
  ): Promise<LikeState> {
    this.validateBody(body);
    return this.service.setLike(user, quackId, true);
  }

  @Delete(':quackId/like')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove the session user’s like' })
  async unlike(
    @User() user: Identity,
    @Param('quackId') quackId: string,
    @Body() body?: unknown,
  ): Promise<LikeState> {
    this.validateBody(body);
    return this.service.setLike(user, quackId, false);
  }
}
