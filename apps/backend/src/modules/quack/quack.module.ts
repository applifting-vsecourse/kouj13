import { PrismaModule } from '@/core/prisma/prisma.module';
import { AuthModule } from '@/shared/auth/auth.module';
import { Module } from '@nestjs/common';
import { LikesController } from './controllers/likes.controller';
import { QuacksController } from './controllers/quacks.controller';
import { LikesRepository } from './repositories/likes.repository';
import { QuackRepository } from './repositories/quack.repository';
import { LikesService } from './services/likes.service';
import { QuacksService } from './services/quacks.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [QuacksController, LikesController],
  providers: [QuacksService, QuackRepository, LikesService, LikesRepository],
  exports: [QuacksService],
})
export class QuackModule {}
