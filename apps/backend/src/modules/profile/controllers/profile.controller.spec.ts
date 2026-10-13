import { Prisma } from '@/generated/prisma/client';
import { ProfileRepository } from '@/modules/profile/repositories/profile.repository';
import { ProfileService } from '@/modules/profile/services/profile.service';
import { Identity } from '@/shared/auth/domain/identity';
import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileController } from './profile.controller';

jest.mock('@/shared/auth/guards/authenticated-user.guard', () => ({
  AuthenticatedUserGuard: class {},
}));

const settings = {
  username: 'duck.name_1',
  name: 'Duck',
  bio: '',
  defaultMood: null,
};
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const validateBody = (body: unknown): Promise<UpdateProfileDto> =>
  pipe.transform(body, { type: 'body', metatype: UpdateProfileDto });

describe('Profile settings', () => {
  it.each(['abc', 'a'.repeat(30), 'Duck.Name_123'])(
    'accepts valid username %s',
    async (username) => {
      await expect(
        validateBody({ ...settings, username }),
      ).resolves.toMatchObject({ username });
    },
  );

  it.each([
    'ab',
    'a'.repeat(31),
    'duck name',
    'duck-name',
    '@duck',
    'dúčk',
    'duck\n',
    null,
  ])('rejects invalid username %s', async (username) => {
    await expect(
      validateBody({ ...settings, username }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { name: '' },
    { name: '   ' },
    { bio: 'a'.repeat(161) },
    { bio: null },
    { defaultMood: 'excited' },
    { defaultMood: undefined },
    { id: 'another-user' },
  ])('rejects invalid settings %s', async (invalid) => {
    await expect(
      validateBody({ ...settings, ...invalid }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([null, 'happy', 'sad', 'angry', 'silly'])(
    'saves mood %s for the session user',
    async (defaultMood) => {
      const repository = mock<ProfileRepository>();
      const controller = new ProfileController(new ProfileService(repository));
      const body = await validateBody({
        ...settings,
        username: 'Duck.Name_1',
        name: ' Duck ',
        bio: 'a'.repeat(160),
        defaultMood,
      });
      repository.updateProfile.mockResolvedValue({
        id: 'me',
        ...body,
        username: 'duck.name_1',
      });
      await expect(
        controller.update({ id: 'me' } as Identity, body),
      ).resolves.toMatchObject({ id: 'me', name: 'Duck', defaultMood });
      expect(repository.updateProfile).toHaveBeenCalledWith('me', {
        ...body,
        username: 'duck.name_1',
      });
    },
  );

  it('turns a database uniqueness conflict into a field-specific error', async () => {
    const repository = mock<ProfileRepository>();
    repository.updateProfile.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate username', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    const service = new ProfileService(repository);
    try {
      await service.updateProfile('me', settings);
      throw new Error('Expected a conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        message: 'This username is already taken',
        field: 'username',
      });
    }
  });

  it('preserves unexpected database failures', async () => {
    const repository = mock<ProfileRepository>();
    const error = new Error('Database unavailable');
    repository.updateProfile.mockRejectedValue(error);
    await expect(
      new ProfileService(repository).updateProfile('me', settings),
    ).rejects.toBe(error);
  });
});
