import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PollRepository } from '@/modules/poll/repositories/poll.repository';
import { QuacksController } from '@/modules/quack/controllers/quacks.controller';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { QuacksService } from '@/modules/quack/services/quacks.service';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// Same harness as polls.integration.ts: a throwaway database on the local
// PostgreSQL container, migrated with `prisma migrate deploy`.
const database = `replies_test_${randomUUID().replace(/-/g, '')}`;
const container = process.env.POLLS_TEST_CONTAINER ?? 'backend-db-1';
const adminUrl = new URL(
  process.env.POLLS_TEST_ADMIN_URL ??
    'postgresql://quacker:quacker@localhost:5433/quacker',
);
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${database}`;
let prisma: PrismaService;
let app: INestApplication;
let origin: string;
let repository: QuackRepository;
let polls: PollRepository;
const auth = { api: { getSession: jest.fn() } };
jest.mock('@/shared/auth/providers/better-auth.provider', () => ({
  InjectBetterAuth: jest
    .requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    .Inject('BetterAuth'),
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: unknown): unknown => headers,
}));

const psql = (sql: string): void => {
  execFileSync('docker', [
    'exec',
    container,
    'psql',
    '-U',
    adminUrl.username,
    '-d',
    adminUrl.pathname.slice(1),
    '-c',
    sql,
  ]);
};

beforeAll(async () => {
  psql(`CREATE DATABASE "${database}"`);
  process.env.DATABASE_URL = testUrl.toString();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
  prisma = new PrismaService();
  await prisma.$connect();
  await prisma.user.createMany({
    data: ['author', 'replier', 'stranger', 'admin', 'leaver'].map((id) => ({
      id,
      email: `${id}@test.example`,
      name: `Name of ${id}`,
      username: id,
      emailVerified: true,
      role: id === 'admin' ? 'admin' : 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  });
  repository = new QuackRepository(prisma);
  polls = new PollRepository(prisma);
  const module = await Test.createTestingModule({
    controllers: [QuacksController],
    providers: [
      QuacksService,
      AuthenticatedUserGuard,
      { provide: QuackRepository, useValue: repository },
      { provide: 'BetterAuth', useValue: auth },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
}, 60000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  psql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
});

const as = (id: string): void => {
  auth.api.getSession.mockResolvedValue({
    user: { id, role: id === 'admin' ? 'admin' : 'user' },
  });
};
const request = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown; raw: string }> => {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  return { status: response.status, raw, json: raw ? JSON.parse(raw) : null };
};
type Item = {
  id: string;
  text: string;
  deleted: boolean;
  replyCount: number;
  parentId: string | null;
  user: { id: string } | null;
};
const feed = async (): Promise<Item[]> =>
  (await request('GET', '/quacks')).json as Item[];
const post = async (
  user: string,
  body: Record<string, unknown>,
): Promise<Item> => {
  as(user);
  const response = await request('POST', '/quacks', body);
  expect(response.status).toBe(201);
  return response.json as Item;
};

describe('Replies over HTTP against PostgreSQL', () => {
  it('posts a reply that appears under its parent, not in the feed', async () => {
    const parent = await post('author', { text: `Parent ${randomUUID()}` });
    const first = await post('replier', {
      text: 'First reply',
      parentId: parent.id,
    });
    const second = await post('stranger', {
      text: 'Second reply',
      mood: 'happy',
      parentId: parent.id,
    });
    expect(first).toMatchObject({ parentId: parent.id, deleted: false });

    as('author');
    const items = await feed();
    expect(items.map((item) => item.id)).not.toContain(first.id);
    expect(items.find((item) => item.id === parent.id)).toMatchObject({
      replyCount: 2,
    });
    const replies = await request('GET', `/quacks/${parent.id}/replies`);
    expect(replies.status).toBe(200);
    expect((replies.json as Item[]).map((reply) => reply.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect((await request('GET', '/quacks/missing/replies')).status).toBe(404);
  });

  it('rejects replies to replies, missing quacks and replies with polls', async () => {
    const parent = await post('author', { text: 'Parent' });
    const reply = await post('replier', { text: 'Reply', parentId: parent.id });
    const before = await prisma.quack.count();
    as('replier');
    for (const [body, status] of [
      [{ text: 'Nested', parentId: reply.id }, 404],
      [{ text: 'Orphan', parentId: 'missing' }, 404],
      [
        { text: 'Poll?', parentId: parent.id, poll: { options: ['A', 'B'] } },
        400,
      ],
      [{ text: 'Bad', parentId: '' }, 400],
    ] as const) {
      expect((await request('POST', '/quacks', body)).status).toBe(status);
    }
    expect(await prisma.quack.count()).toBe(before);
  });
});

describe('Deleting quacks (ADR 0001) against PostgreSQL', () => {
  it('hard-deletes a quack without replies', async () => {
    const quack = await post('author', { text: 'Lonely quack' });
    as('author');
    expect((await request('DELETE', `/quacks/${quack.id}`)).status).toBe(204);
    expect(
      await prisma.quack.findUnique({ where: { id: quack.id } }),
    ).toBeNull();
  });

  it('turns a quack with replies into a tombstone whose content is gone everywhere', async () => {
    const secret = `Secret ${randomUUID()}`;
    const parent = await post('author', {
      text: secret,
      mood: 'angry',
      poll: { options: ['Yes', 'No'] },
    });
    const pollId = (
      await prisma.poll.findUniqueOrThrow({
        where: { quackId: parent.id },
      })
    ).id;
    const option = await prisma.pollOption.findFirstOrThrow({
      where: { pollId },
    });
    await polls.vote(pollId, 'replier', option.id);
    const reply = await post('replier', {
      text: 'My reply',
      parentId: parent.id,
    });

    as('stranger');
    expect((await request('DELETE', `/quacks/${parent.id}`)).status).toBe(404);
    as('author');
    expect((await request('DELETE', `/quacks/${parent.id}`)).status).toBe(204);

    expect(
      await prisma.quack.findUniqueOrThrow({ where: { id: parent.id } }),
    ).toMatchObject({ text: '', mood: null, deletedAt: expect.any(Date) });
    expect(await prisma.poll.count({ where: { id: pollId } })).toBe(0);
    expect(await prisma.pollVote.count({ where: { pollId } })).toBe(0);
    expect(await prisma.pollOption.count({ where: { pollId } })).toBe(0);

    const feedResponse = await request('GET', '/quacks');
    const repliesResponse = await request(
      'GET',
      `/quacks/${parent.id}/replies`,
    );
    expect(feedResponse.raw).not.toContain(secret);
    expect(repliesResponse.raw).not.toContain(secret);
    expect(
      (feedResponse.json as Item[]).find((item) => item.id === parent.id),
    ).toEqual(
      expect.objectContaining({
        deleted: true,
        text: '',
        user: null,
        userId: null,
        mood: null,
        poll: null,
        replyCount: 1,
      }),
    );
    expect(repliesResponse.json).toEqual([
      expect.objectContaining({
        id: reply.id,
        text: 'My reply',
        user: expect.objectContaining({ id: 'replier' }),
      }),
    ]);

    as('replier');
    expect(
      (await request('POST', '/quacks', { text: 'Late', parentId: parent.id }))
        .status,
    ).toBe(404);
    as('author');
    expect((await request('DELETE', `/quacks/${parent.id}`)).status).toBe(404);
    as('admin');
    expect((await request('DELETE', `/quacks/${parent.id}`)).status).toBe(404);
  });

  it('lets an admin tombstone someone else’s quack and hides a tombstone once its replies are gone', async () => {
    const parent = await post('author', { text: 'Moderate me' });
    const reply = await post('replier', { text: 'Reply', parentId: parent.id });
    as('admin');
    expect((await request('DELETE', `/quacks/${parent.id}`)).status).toBe(204);
    expect((await feed()).find((item) => item.id === parent.id)).toMatchObject({
      deleted: true,
    });

    as('replier');
    expect((await request('DELETE', `/quacks/${reply.id}`)).status).toBe(204);
    expect(
      await prisma.quack.findUnique({ where: { id: reply.id } }),
    ).toBeNull();
    expect((await feed()).map((item) => item.id)).not.toContain(parent.id);
  });

  it('refuses at the database level to hard-delete a quack that has replies', async () => {
    const parent = await post('leaver', { text: 'Replied to' });
    await post('replier', { text: 'Reply', parentId: parent.id });
    await expect(
      prisma.quack.delete({ where: { id: parent.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.user.delete({ where: { id: 'leaver' } }),
    ).rejects.toBeDefined();
    expect(await prisma.quack.count({ where: { parentId: parent.id } })).toBe(
      1,
    );
  });

  it('keeps reply and delete consistent when they race', async () => {
    for (let round = 0; round < 15; round++) {
      const parent = await repository.createQuack({
        userId: 'author',
        text: `Race ${round}`,
      });
      const [replied, deleted] = await Promise.allSettled([
        repository.createQuack({
          userId: 'replier',
          text: 'Racing reply',
          parentId: parent.id,
        }),
        repository.deleteQuack(parent.id, 'author'),
      ]);
      expect(deleted).toEqual({ status: 'fulfilled', value: true });
      const stored = await prisma.quack.findUnique({
        where: { id: parent.id },
      });
      if (replied.status === 'fulfilled') {
        // The reply won the lock: the parent must have become a tombstone.
        expect(stored).toMatchObject({ text: '', deletedAt: expect.any(Date) });
      } else {
        // The delete won: the parent is gone and the reply was refused.
        expect(replied.reason).toMatchObject({ status: 404 });
        expect(stored).toBeNull();
      }
    }
  });
});
