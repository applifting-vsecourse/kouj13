import { Profile } from '@/modules/profile/domain/profile';
import { QUACK_MOODS, QuackMood } from '@/modules/quack/domain/quack';
import { ApiProperty } from '@nestjs/swagger';

export class ProfileResponseDto implements Profile {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ maxLength: 160 })
  bio!: string;

  @ApiProperty({ enum: QUACK_MOODS, nullable: true })
  defaultMood!: QuackMood | null;
}
