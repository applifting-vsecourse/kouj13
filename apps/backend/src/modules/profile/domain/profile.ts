import { QuackMood } from '@/modules/quack/domain/quack';

export type Profile = {
  id: string;
  username: string;
  name: string;
  bio: string;
  defaultMood: QuackMood | null;
};

export type ProfileSettings = Omit<Profile, 'id'>;
