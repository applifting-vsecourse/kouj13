// Example unit test — the pattern to copy for your own services.
// The repository is mocked, so the test exercises the service in isolation.
import { Quack } from '@/modules/quack/domain/quack';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { QuacksService } from './quacks.service';

const aQuack = (overrides: Partial<Quack> = {}): Quack => ({
  id: 'q1',
  text: 'quack quack',
  mood: null,
  userId: 'u1',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  updatedAt: new Date('2026-01-01T12:00:00Z'),
  user: { id: 'u1', name: 'Caffeinated Duck', username: 'CaffeinatedDuck' },
  parentId: null,
  deletedAt: null,
  ...overrides,
});

describe('QuacksService', () => {
  it('allows an admin to delete regardless of author', async () => {
    const repository = mock<QuackRepository>();
    repository.deleteQuack.mockResolvedValue(true);
    const service = new QuacksService(repository);
    await expect(
      service.deleteQuack({ id: 'admin', role: 'admin' } as Identity, 'q1'),
    ).resolves.toBeUndefined();
    expect(repository.deleteQuack).toHaveBeenCalledWith('q1', undefined);
  });

  it('returns 404 for an admin deleting a missing quack', async () => {
    const repository = mock<QuackRepository>();
    repository.deleteQuack.mockResolvedValue(false);
    await expect(
      new QuacksService(repository).deleteQuack(
        { id: 'admin', role: 'admin' } as Identity,
        'missing',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes using the signed-in author identity', async () => {
    const repository = mock<QuackRepository>();
    repository.deleteQuack.mockResolvedValue(true);
    const service = new QuacksService(repository);

    await expect(
      service.deleteQuack({ id: 'u1' } as Identity, 'q1'),
    ).resolves.toBeUndefined();
    expect(repository.deleteQuack).toHaveBeenCalledWith('q1', 'u1');
  });

  it('rejects deletion of missing quacks and quacks belonging to someone else', async () => {
    const repository = mock<QuackRepository>();
    repository.deleteQuack.mockResolvedValue(false);
    const service = new QuacksService(repository);

    await expect(
      service.deleteQuack({ id: 'u2' } as Identity, 'q1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.deleteQuack).toHaveBeenCalledWith('q1', 'u2');
  });
  it('returns quacks from the repository', async () => {
    const quacks = [aQuack()];
    const repository = mock<QuackRepository>();
    repository.getQuacks.mockResolvedValue(quacks);

    const service = new QuacksService(repository);

    await expect(service.getQuacks({ id: 'u1' } as Identity)).resolves.toEqual(
      quacks,
    );
    expect(repository.getQuacks).toHaveBeenCalledTimes(1);
  });

  it('creates a quack owned by the signed-in user', async () => {
    const created = aQuack({ id: 'q2', text: 'hello' });
    const repository = mock<QuackRepository>();
    repository.createQuack.mockResolvedValue(created);

    const service = new QuacksService(repository);
    const user = { id: 'u1' } as Identity;

    await expect(service.createQuack(user, { text: 'hello' })).resolves.toEqual(
      created,
    );
    // the author comes from the session, not from the caller's payload
    expect(repository.createQuack).toHaveBeenCalledWith({
      text: 'hello',
      mood: null,
      userId: 'u1',
    });
  });

  it('creates a reply owned by the signed-in user under the given parent', async () => {
    const repository = mock<QuackRepository>();
    repository.createQuack.mockResolvedValue(aQuack({ parentId: 'q1' }));

    await new QuacksService(repository).createQuack({ id: 'u2' } as Identity, {
      text: 'reply',
      parentId: 'q1',
    });

    expect(repository.createQuack).toHaveBeenCalledWith({
      text: 'reply',
      mood: null,
      parentId: 'q1',
      userId: 'u2',
    });
  });

  it('rejects a reply with a poll before touching storage', async () => {
    const repository = mock<QuackRepository>();

    await expect(
      new QuacksService(repository).createQuack({ id: 'u1' } as Identity, {
        text: 'reply',
        parentId: 'q1',
        poll: { options: ['A', 'B'] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createQuack).not.toHaveBeenCalled();
  });

  it('returns replies and 404s for a quack that does not exist', async () => {
    const repository = mock<QuackRepository>();
    const replies = [aQuack({ id: 'r1', parentId: 'q1' })];
    repository.getReplies.mockResolvedValueOnce(replies);
    repository.getReplies.mockResolvedValueOnce(null);
    const service = new QuacksService(repository);

    await expect(service.getReplies('q1')).resolves.toEqual(replies);
    await expect(service.getReplies('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
