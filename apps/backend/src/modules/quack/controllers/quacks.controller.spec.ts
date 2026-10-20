import { Quack } from '@/modules/quack/domain/quack';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { QuacksService } from '@/modules/quack/services/quacks.service';
import { Identity } from '@/shared/auth/domain/identity';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import {
  BadRequestException,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
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
  it('protects the feed and DELETE /quacks/:id with authentication and returns 204', async () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, QuacksController)).toContain(
      AuthenticatedUserGuard,
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, QuacksController.prototype.delete),
    ).toBe(':id');
    expect(
      Reflect.getMetadata(METHOD_METADATA, QuacksController.prototype.delete),
    ).toBe(RequestMethod.DELETE);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        QuacksController.prototype.delete,
      ),
    ).toBe(204);
    const repository = mock<QuackRepository>();
    repository.deleteQuack.mockResolvedValue(true);
    const controller = new QuacksController(new QuacksService(repository));
    await expect(
      controller.delete({ id: 'u1' } as Identity, 'q1'),
    ).resolves.toBeUndefined();
    expect(repository.deleteQuack).toHaveBeenCalledWith('q1', 'u1');
    repository.deleteQuack.mockResolvedValue(false);
    await expect(
      controller.delete({ id: 'u2' } as Identity, 'q1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
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
      await expect(controller.list({ id: 'u1' } as Identity)).resolves.toEqual([
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
