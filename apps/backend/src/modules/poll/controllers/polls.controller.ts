import { PollResponseDto } from '@/modules/poll/controllers/dto/poll.response.dto';
import { PollsService } from '@/modules/poll/services/polls.service';
import { User } from '@/shared/auth/decorators/user.decorator';
import { Identity } from '@/shared/auth/domain/identity';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import {
  Body,
  Controller,
  Param,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  optionId!: string;
}
@ApiTags('polls')
@Controller('polls')
@UseGuards(AuthenticatedUserGuard)
@ApiCookieAuth()
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class PollsController {
  constructor(private readonly service: PollsService) {}
  @Put(':pollId/vote')
  @ApiOperation({ summary: 'Select or change your single poll answer' })
  @ApiResponse({ status: 200, type: PollResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Malformed input or answer outside this poll',
  })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({ status: 404, description: 'Poll not found' })
  vote(
    @User() user: Identity,
    @Param('pollId') pollId: string,
    @Body() body: VoteDto,
  ): Promise<PollResponseDto> {
    return this.service.vote(user, pollId, body.optionId);
  }
}
