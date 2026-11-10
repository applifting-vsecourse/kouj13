import { QuacksService } from '@/modules/quack/services/quacks.service';
import { User } from '@/shared/auth/decorators/user.decorator';
import { Identity } from '@/shared/auth/domain/identity';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateQuackDto } from './dto/create-quack.dto';
import { QuackResponseDto } from './dto/quack.response.dto';

@ApiTags('quacks')
@Controller('quacks')
@UseGuards(AuthenticatedUserGuard)
@ApiCookieAuth()
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class QuacksController {
  constructor(private readonly quacksService: QuacksService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a quack as its author or an admin',
    description:
      'A quack without replies is deleted permanently. A quack with replies becomes a tombstone: its text, mood, poll and author are erased and its replies stay (ADR 0001).',
  })
  @ApiResponse({ status: 204, description: 'Quack deleted' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({
    status: 404,
    description: 'Quack not found, already deleted, or not yours',
  })
  async delete(@User() user: Identity, @Param('id') id: string): Promise<void> {
    await this.quacksService.deleteQuack(user, id);
  }

  @Get()
  @ApiOperation({
    summary: 'List top-level quacks',
    description:
      'Replies are not included; each quack carries its replyCount. Deleted quacks appear only while they still have replies.',
  })
  @ApiResponse({ status: 200, type: [QuackResponseDto] })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  async list(@User() user: Identity): Promise<QuackResponseDto[]> {
    const quacks = await this.quacksService.getQuacks(user);
    return quacks.map(QuackResponseDto.fromDomain);
  }

  @Get(':id/replies')
  @ApiOperation({ summary: 'List replies to a quack, oldest first' })
  @ApiResponse({ status: 200, type: [QuackResponseDto] })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({ status: 404, description: 'Quack not found' })
  async replies(@Param('id') id: string): Promise<QuackResponseDto[]> {
    const replies = await this.quacksService.getReplies(id);
    return replies.map(QuackResponseDto.fromDomain);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a quack, or a reply when parentId is set',
  })
  @ApiResponse({ status: 201, type: QuackResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid question, mood, or poll answers, or a reply with a poll',
  })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  @ApiResponse({
    status: 404,
    description: 'Replied-to quack not found, deleted, or itself a reply',
  })
  async create(
    @User() user: Identity,
    @Body() body: CreateQuackDto,
  ): Promise<QuackResponseDto> {
    const quack = await this.quacksService.createQuack(user, {
      text: body.text,
      mood: body.mood,
      ...(body.poll ? { poll: body.poll } : {}),
      ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
    });
    return QuackResponseDto.fromDomain(quack);
  }
}
