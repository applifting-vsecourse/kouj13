import { QUACK_MOODS, QuackMood } from '@/modules/quack/domain/quack';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreatePollDto {
  @ApiProperty({
    type: [String],
    minItems: 2,
    maxItems: 6,
    description: '2–6 distinct answers, 1–80 trimmed characters each',
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((label: unknown) =>
          typeof label === 'string' ? label.trim() : label,
        )
      : value,
  )
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  @ArrayUnique((label: unknown) =>
    typeof label === 'string' ? label.toLowerCase() : label,
  )
  options!: string[];
}

export class CreateQuackDto {
  @ApiProperty({
    description: 'Body of the quack',
    example: 'Hello, world!',
    maxLength: 280,
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(280)
  text!: string;

  @ApiPropertyOptional({ enum: QUACK_MOODS, nullable: true })
  @IsOptional()
  @IsIn(QUACK_MOODS)
  mood?: QuackMood | null;

  @ApiPropertyOptional({ type: CreatePollDto })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;
}
