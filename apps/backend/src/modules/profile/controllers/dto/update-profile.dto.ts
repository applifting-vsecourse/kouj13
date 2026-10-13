import { QUACK_MOODS, QuackMood } from '@/modules/quack/domain/quack';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9._]+$' })
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9._]+$/)
  username!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ maxLength: 160 })
  @IsString()
  @MaxLength(160)
  bio!: string;

  @ApiProperty({ enum: QUACK_MOODS, nullable: true })
  @IsIn([...QUACK_MOODS, null])
  defaultMood!: QuackMood | null;
}
