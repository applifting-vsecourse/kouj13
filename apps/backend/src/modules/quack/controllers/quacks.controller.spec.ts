import { Quack } from '@/modules/quack/domain/quack';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { QuacksService } from '@/modules/quack/services/quacks.service';
import { Identity } from '@/shared/auth/domain/identity';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { CreateQuackDto } from './dto/create-quack.dto';
import { QuacksController } from './quacks.controller';

jest.mock('@/shared/auth/guards/authenticated-user.guard', () => ({
  AuthenticatedUserGuard: class {},
}));

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validateBody = (body: unknown): Promise<CreateQuackDto> =>
  pipe.transform(body, { type: 'body', metatype: CreateQuackDto });

describe('Quack moods', () => {
  it.each(['happy', 'sad', 'angry', 'silly'] as const)(
    'passes %s from the validated request to storage and feed responses',
    async (mood) => {
      const quack: Quack = {
        id: 'q1',
        text: 'hello',
        mood,
        userId: 'u1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'u1', name: 'Duck', username: 'duck' },
      };
      const repository = mock<QuackRepository>();
      repository.createQuack.mockResolvedValue(quack);
      repository.getQuacks.mockResolvedValue([quack]);
      const controller = new QuacksController(new QuacksService(repository));
      const body = await validateBody({ text: 'hello', mood });

      await expect(
        controller.create({ id: 'u1' } as Identity, body),
      ).resolves.toMatchObject({ mood });
      expect(repository.createQuack).toHaveBeenCalledWith({
        text: 'hello',
        mood,
        userId: 'u1',
      });
      await expect(controller.list()).resolves.toEqual([
        expect.objectContaining({ mood }),
      ]);
    },
  );

  it.each([undefined, null])('accepts an absent mood (%s)', async (mood) => {
    await expect(validateBody({ text: 'hello', mood })).resolves.toMatchObject({
      text: 'hello',
    });
  });

  it.each(['excited', '', 1, [], {}])(
    'rejects an invalid mood (%s)',
    async (mood) => {
      await expect(
        validateBody({ text: 'hello', mood }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
