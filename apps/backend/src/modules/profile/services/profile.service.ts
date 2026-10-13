import { Prisma } from '@/generated/prisma/client';
import { Profile, ProfileSettings } from '@/modules/profile/domain/profile';
import { ProfileRepository } from '@/modules/profile/repositories/profile.repository';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  async getProfile(userId: string): Promise<Profile> {
    return this.repository.getProfile(userId);
  }

  async updateProfile(
    userId: string,
    settings: ProfileSettings,
  ): Promise<Profile> {
    try {
      return await this.repository.updateProfile(userId, {
        ...settings,
        username: settings.username.toLowerCase(),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'This username is already taken',
          field: 'username',
        });
      }
      throw error;
    }
  }
}
