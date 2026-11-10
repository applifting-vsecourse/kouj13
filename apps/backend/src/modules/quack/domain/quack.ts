import { Poll } from '@/modules/poll/domain/poll';

export const QUACK_MOODS = ['happy', 'sad', 'angry', 'silly'] as const;
export type QuackMood = (typeof QUACK_MOODS)[number];

export type QuackAuthor = {
  id: string;
  name: string;
  username: string;
};

export type Quack = {
  id: string;
  text: string;
  mood: QuackMood | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  user?: QuackAuthor;
  poll?: Poll | null;
  parentId: string | null;
  // Set on tombstones: a deleted quack kept only because it has replies (ADR 0001).
  deletedAt: Date | null;
  replyCount?: number;
};
