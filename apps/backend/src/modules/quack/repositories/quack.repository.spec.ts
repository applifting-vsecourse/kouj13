import { PrismaService } from '@/core/prisma/prisma.service';
import { mockDeep } from 'jest-mock-extended';
import { QuackRepository } from './quack.repository';

describe('QuackRepository deletion', () => {
  it.each([0, 1])(
    'requires both the quack id and session author in the delete (%s matches)',
    async (count) => {
      const prisma = mockDeep<PrismaService>();
      prisma.quack.deleteMany.mockResolvedValue({ count });
      const repository = new QuackRepository(prisma);

      await expect(repository.deleteQuack('q1', 'u1')).resolves.toBe(
        count === 1,
      );
      expect(prisma.quack.deleteMany).toHaveBeenCalledWith({
        where: { id: 'q1', userId: 'u1' },
      });
    },
  );
});
