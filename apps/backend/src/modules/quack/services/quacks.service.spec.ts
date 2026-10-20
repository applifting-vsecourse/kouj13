// Example unit test — the pattern to copy for your own services.
// The repository is mocked, so the test exercises the service in isolation.
import { Quack } from '@/modules/quack/domain/quack';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { NotFoundException } from '@nestjs/common';
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
  ...overrides,
});

describe('QuacksService', () => {
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
});
