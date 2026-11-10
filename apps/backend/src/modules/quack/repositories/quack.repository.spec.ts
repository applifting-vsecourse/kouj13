import { PrismaService } from '@/core/prisma/prisma.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { QuackRepository } from './quack.repository';

type Setup = {
  prisma: DeepMockProxy<PrismaService>;
  repository: QuackRepository;
};

const setup = (locked: { id: string }[], replies: number): Setup => {
  const prisma = mockDeep<PrismaService>();
  prisma.$transaction.mockImplementation(((
    callback: (tx: unknown) => unknown,
  ) => callback(prisma)) as never);
  prisma.$queryRaw.mockResolvedValue(locked);
  prisma.quack.count.mockResolvedValue(replies);
  return { prisma, repository: new QuackRepository(prisma) };
};

const lockQuery = (
  prisma: Setup['prisma'],
): { sql: string; values: unknown[] } => {
  const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return { sql: strings.join('?'), values };
};

describe('QuackRepository deletion (ADR 0001)', () => {
  it('hard-deletes a quack without replies', async () => {
    const { prisma, repository } = setup([{ id: 'q1' }], 0);

    await expect(repository.deleteQuack('q1', 'u1')).resolves.toBe(true);

    expect(prisma.quack.count).toHaveBeenCalledWith({
      where: { parentId: 'q1' },
    });
    expect(prisma.quack.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
    expect(prisma.quack.update).not.toHaveBeenCalled();
  });

  it('turns a quack with replies into a tombstone and erases its content and poll', async () => {
    const { prisma, repository } = setup([{ id: 'q1' }], 2);

    await expect(repository.deleteQuack('q1', 'u1')).resolves.toBe(true);

    expect(prisma.quack.delete).not.toHaveBeenCalled();
    expect(prisma.poll.deleteMany).toHaveBeenCalledWith({
      where: { quackId: 'q1' },
    });
    expect(prisma.quack.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { text: '', mood: null, deletedAt: expect.any(Date) as Date },
    });
  });

  it('locks only a live quack of the session author', async () => {
    const { prisma, repository } = setup([], 0);

    await expect(repository.deleteQuack('q1', 'u1')).resolves.toBe(false);

    const { sql, values } = lockQuery(prisma);
    expect(sql).toMatch(/"deletedAt" IS NULL/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(values[1]).toMatchObject({
      strings: ['AND "userId" = ', ''],
      values: ['u1'],
    });
    expect(prisma.quack.delete).not.toHaveBeenCalled();
    expect(prisma.quack.update).not.toHaveBeenCalled();
  });

  it('omits the author restriction for the admin scope', async () => {
    const { prisma, repository } = setup([{ id: 'q1' }], 0);

    await expect(repository.deleteQuack('q1', undefined)).resolves.toBe(true);

    const { values } = lockQuery(prisma);
    expect(JSON.stringify(values)).not.toContain('userId');
  });
});
