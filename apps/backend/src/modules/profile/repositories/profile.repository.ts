import { PrismaService } from '@/core/prisma/prisma.service';
import { Profile, ProfileSettings } from '@/modules/profile/domain/profile';
import { Injectable } from '@nestjs/common';

const select = {
  id: true,
  username: true,
  name: true,
  bio: true,
  defaultMood: true,
} as const;

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select,
    });
    return { ...user, username: user.username ?? '' };
  }

  async updateProfile(
    userId: string,
    settings: ProfileSettings,
  ): Promise<Profile> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...settings, displayUsername: settings.username },
      select,
    });
    return { ...user, username: user.username ?? '' };
  }
}
