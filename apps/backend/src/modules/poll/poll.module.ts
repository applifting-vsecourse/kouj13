import { PrismaModule } from '@/core/prisma/prisma.module';
import { AuthModule } from '@/shared/auth/auth.module';
import { Module } from '@nestjs/common';
import { PollsController } from './controllers/polls.controller';
import { PollRepository } from './repositories/poll.repository';
import { PollsService } from './services/polls.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PollsController],
  providers: [PollsService, PollRepository],
})
export class PollModule {}
