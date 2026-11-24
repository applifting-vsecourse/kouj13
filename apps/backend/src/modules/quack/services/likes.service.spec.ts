import { LikesRepository } from '@/modules/quack/repositories/likes.repository';
import { Identity } from '@/shared/auth/domain/identity';
import { NotFoundException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { LikesService } from './likes.service';

const alice = new Identity('alice', 'alice@example.com', 'Alice', 'user');

describe('Likes rules (cases.md)', () => {
  it('U1: likes using session identity and returns the saved state', async () => {
    const repository = mock<LikesRepository>();
    repository.setLike.mockResolvedValue({ likeCount: 3, likedByMe: true });
    await expect(
      new LikesService(repository).setLike(alice, 'quack', true),
    ).resolves.toEqual({ likeCount: 3, likedByMe: true });
    expect(repository.setLike).toHaveBeenCalledWith({
      quackId: 'quack',
      userId: 'alice',
      liked: true,
    });
  });

  it('U2: unlikes using session identity and returns remaining likes', async () => {
    const repository = mock<LikesRepository>();
    repository.setLike.mockResolvedValue({ likeCount: 2, likedByMe: false });
    await expect(
      new LikesService(repository).setLike(alice, 'quack', false),
    ).resolves.toEqual({ likeCount: 2, likedByMe: false });
    expect(repository.setLike).toHaveBeenCalledWith({
      quackId: 'quack',
      userId: 'alice',
      liked: false,
    });
  });

  it.each(['own-quack', 'own-reply', 'other-reply'])(
    'U3: applies the same like and unlike rules to %s',
    async (quackId) => {
      const repository = mock<LikesRepository>();
      const service = new LikesService(repository);
      for (const role of ['user', 'admin']) {
        const user = new Identity('alice', 'alice@example.com', 'Alice', role);
        for (const liked of [true, false]) {
          const state = { likeCount: liked ? 1 : 0, likedByMe: liked };
          repository.setLike.mockResolvedValue(state);
          await expect(service.setLike(user, quackId, liked)).resolves.toEqual(
            state,
          );
          expect(repository.setLike).toHaveBeenLastCalledWith({
            quackId,
            userId: 'alice',
            liked,
          });
        }
      }
    },
  );

  it.each([true, false])(
    'U4: reports not found for unavailable targets (liked=%s)',
    async (liked) => {
      const repository = mock<LikesRepository>();
      repository.setLike.mockResolvedValue(null);
      await expect(
        new LikesService(repository).setLike(alice, 'unavailable', liked),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('U5: reads quack and reply states for the current viewer', async () => {
    const repository = mock<LikesRepository>();
    const states = [
      { quackId: 'parent', likeCount: 2, likedByMe: false },
      { quackId: 'reply', likeCount: 1, likedByMe: true },
    ];
    repository.read.mockResolvedValue(states);
    await expect(
      new LikesService(repository).read(alice, ['parent', 'reply']),
    ).resolves.toEqual(states);
    expect(repository.read).toHaveBeenCalledWith({
      quackIds: ['parent', 'reply'],
      userId: 'alice',
    });
  });
});
