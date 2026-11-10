import { PollResponseDto } from '@/modules/poll/controllers/dto/poll.response.dto';
import { Quack, QUACK_MOODS, QuackMood } from '@/modules/quack/domain/quack';
import { ApiProperty } from '@nestjs/swagger';

class QuackUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  username!: string;
}

export class QuackResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'Empty for a deleted quack' })
  text!: string;

  @ApiProperty({ enum: QUACK_MOODS, nullable: true })
  mood!: QuackMood | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null for a deleted quack',
  })
  userId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: QuackUserDto,
    nullable: true,
    description: 'Null for a deleted quack',
  })
  user!: QuackUserDto | null;

  @ApiProperty({ type: PollResponseDto, nullable: true })
  poll!: PollResponseDto | null;

  @ApiProperty({ type: String, nullable: true, description: 'Set on replies' })
  parentId!: string | null;

  @ApiProperty({
    description:
      'A deleted quack kept only because it has replies; its content and author are gone (ADR 0001)',
  })
  deleted!: boolean;

  @ApiProperty()
  replyCount!: number;

  static fromDomain(quack: Quack): QuackResponseDto {
    const common = {
      id: quack.id,
      createdAt: quack.createdAt,
      parentId: quack.parentId,
      replyCount: quack.replyCount ?? 0,
    };
    // Tombstones expose nothing about the deleted post or its author.
    if (quack.deletedAt) {
      return {
        ...common,
        text: '',
        mood: null,
        userId: null,
        user: null,
        poll: null,
        deleted: true,
      };
    }
    if (!quack.user) {
      throw new Error(
        `QuackResponseDto.fromDomain expected quack.user to be loaded for quack ${quack.id}`,
      );
    }
    return {
      ...common,
      text: quack.text,
      mood: quack.mood,
      userId: quack.userId,
      poll: quack.poll ?? null,
      deleted: false,
      user: {
        id: quack.user.id,
        name: quack.user.name,
        username: quack.user.username,
      },
    };
  }
}
