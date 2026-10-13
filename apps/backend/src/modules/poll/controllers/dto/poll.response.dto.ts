import { ApiProperty } from '@nestjs/swagger';

class PollOptionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() position!: number;
  @ApiProperty() voteCount!: number;
}
export class PollResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: [PollOptionResponseDto] })
  options!: PollOptionResponseDto[];
  @ApiProperty() totalVotes!: number;
  @ApiProperty({ type: String, nullable: true }) myOptionId!: string | null;
}
