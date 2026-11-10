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
import { QuackResponseDto } from './dto/quack.response.dto';
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
        parentId: null,
        deletedAt: null,
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

describe('Replies and tombstones', () => {
  const quack = (overrides: Partial<Quack> = {}): Quack => ({
    id: 'q1',
    text: 'secret original text',
    mood: 'happy',
    userId: 'u1',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    user: { id: 'u1', name: 'Duck', username: 'duck' },
    parentId: null,
    deletedAt: null,
    ...overrides,
  });

  it('serves a tombstone without its content or author', () => {
    const response = QuackResponseDto.fromDomain(
      quack({ deletedAt: new Date(), replyCount: 2 }),
    );
    expect(response).toEqual({
      id: 'q1',
      createdAt: new Date('2026-01-01T12:00:00Z'),
      parentId: null,
      replyCount: 2,
      text: '',
      mood: null,
      userId: null,
      user: null,
      poll: null,
      deleted: true,
    });
    expect(JSON.stringify(response)).not.toMatch(/secret|Duck|u1/);
  });

  it('serves a live quack with its reply count', () => {
    expect(QuackResponseDto.fromDomain(quack({ replyCount: 3 }))).toMatchObject(
      {
        text: 'secret original text',
        deleted: false,
        replyCount: 3,
        user: { name: 'Duck' },
      },
    );
  });

  it('exposes GET /quacks/:id/replies and passes parentId from the body', async () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, QuacksController.prototype.replies),
    ).toBe(':id/replies');
    expect(
      Reflect.getMetadata(METHOD_METADATA, QuacksController.prototype.replies),
    ).toBe(RequestMethod.GET);
    const repository = mock<QuackRepository>();
    repository.getReplies.mockResolvedValue([
      quack({ id: 'r1', parentId: 'q1' }),
    ]);
    repository.createQuack.mockResolvedValue(
      quack({ id: 'r2', parentId: 'q1' }),
    );
    const controller = new QuacksController(new QuacksService(repository));

    await expect(controller.replies('q1')).resolves.toEqual([
      expect.objectContaining({ id: 'r1', parentId: 'q1' }),
    ]);
    await controller.create(
      { id: 'u2' } as Identity,
      await validateBody({ text: 'reply', parentId: 'q1' }),
    );
    expect(repository.createQuack).toHaveBeenCalledWith({
      text: 'reply',
      mood: null,
      parentId: 'q1',
      userId: 'u2',
    });
  });

  it.each(['', 1, null, {}])(
    'rejects an invalid parentId (%j)',
    async (parentId) => {
      await expect(
        validateBody({ text: 'reply', parentId }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
