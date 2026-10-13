import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/core/prisma/prisma.service';
import { PollsController } from '@/modules/poll/controllers/polls.controller';
import { Poll } from '@/modules/poll/domain/poll';
import { PollRepository } from '@/modules/poll/repositories/poll.repository';
import { PollsService } from '@/modules/poll/services/polls.service';
import { ProfileController } from '@/modules/profile/controllers/profile.controller';
import { ProfileRepository } from '@/modules/profile/repositories/profile.repository';
import { ProfileService } from '@/modules/profile/services/profile.service';
import { CreateQuackDto } from '@/modules/quack/controllers/dto/create-quack.dto';
import { QuacksController } from '@/modules/quack/controllers/quacks.controller';
import { QuackRepository } from '@/modules/quack/repositories/quack.repository';
import { QuacksService } from '@/modules/quack/services/quacks.service';
import { AuthenticatedUserGuard } from '@/shared/auth/guards/authenticated-user.guard';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// A fresh database on the existing local PostgreSQL container; never reset app data.
// Override POLLS_TEST_ADMIN_URL / POLLS_TEST_CONTAINER for another test server.
const database = `polls_test_${randomUUID().replace(/-/g, '')}`;
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
// Keep BetterAuth a black box; exercise the real session guard against its API boundary.
jest.mock('@/shared/auth/providers/better-auth.provider', () => ({
  InjectBetterAuth: jest
    .requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    .Inject('BetterAuth'),
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: unknown): unknown => headers,
}));
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const body = (input: unknown): Promise<CreateQuackDto> =>
  pipe.transform(input, { type: 'body', metatype: CreateQuackDto });

beforeAll(async () => {
  execFileSync('docker', [
    'exec',
    container,
    'psql',
    '-U',
    adminUrl.username,
    '-d',
    adminUrl.pathname.slice(1),
    '-c',
    `CREATE DATABASE "${database}"`,
  ]);
  process.env.DATABASE_URL = testUrl.toString();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
  prisma = new PrismaService();
  await prisma.$connect();
  await prisma.user.createMany({
    data: ['a', 'b'].map((id) => ({
      id,
      email: `${id}@test.example`,
      name: id,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  });
  repository = new QuackRepository(prisma);
  polls = new PollRepository(prisma);
  const module = await Test.createTestingModule({
    controllers: [QuacksController, PollsController, ProfileController],
    providers: [
      QuacksService,
      PollsService,
      ProfileService,
      AuthenticatedUserGuard,
      { provide: QuackRepository, useValue: repository },
      { provide: PollRepository, useValue: polls },
      { provide: ProfileRepository, useValue: new ProfileRepository(prisma) },
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
  execFileSync('docker', [
    'exec',
    container,
    'psql',
    '-U',
    adminUrl.username,
    '-d',
    adminUrl.pathname.slice(1),
    '-c',
    `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
  ]);
});

const create = async (options = ['First', 'Second']): Promise<Poll> => {
  const result = await repository.createQuack({
    userId: 'a',
    text: 'Question?',
    poll: { options },
  });
  return result.poll!;
};

describe('PostgreSQL polls and HTTP contract', () => {
  it('persists Settings across fresh reads while preserving poll data', async () => {
    auth.api.getSession.mockResolvedValue({ user: { id: 'a' } });
    const poll = await create();
    const settings = {
      username: 'duck.test',
      name: 'Updated Duck',
      bio: 'Lunch enthusiast',
      defaultMood: 'silly',
    };
    const saved = await fetch(`${origin}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    expect(saved.status).toBe(200);
    expect(await (await fetch(`${origin}/profile`)).json()).toMatchObject(
      settings,
    );
    const feed = (await (await fetch(`${origin}/quacks`)).json()) as {
      user: { name: string };
      poll: Poll | null;
    }[];
    expect(feed.find((quack) => quack.poll?.id === poll.id)).toMatchObject({
      user: { name: 'Updated Duck' },
      poll: { totalVotes: 0, myOptionId: null },
    });
  });
  it('serializes concurrent first votes and keeps exactly one row', async () => {
    const poll = await create();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        polls.vote(poll.id, 'a', poll.options[index % 2].id),
      ),
    );
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(1);
    const state = (await repository.getQuacks('a')).find(
      (quack) => quack.poll?.id === poll.id,
    )!.poll!;
    expect(state.totalVotes).toBe(1);
    expect(
      state.options.reduce((sum, option) => sum + option.voteCount, 0),
    ).toBe(1);
    const stored = await prisma.pollVote.findUniqueOrThrow({
      where: { pollId_userId: { pollId: poll.id, userId: 'a' } },
    });
    expect(state.myOptionId).toBe(stored.optionId);
  });

  it('changes votes, repeats idempotently, counts both accounts, and isolates viewer choices', async () => {
    const poll = await create(['First', 'Second', 'Third']);
    const first = await polls.vote(poll.id, 'b', poll.options[0].id);
    expect(first.options.map((option) => option.voteCount)).toEqual([1, 0, 0]);
    const changed = await polls.vote(poll.id, 'b', poll.options[1].id);
    expect(changed.options.map((option) => option.voteCount)).toEqual([
      0, 1, 0,
    ]);
    expect(changed.totalVotes).toBe(1);
    const timestamp = (
      await prisma.pollVote.findFirstOrThrow({ where: { pollId: poll.id } })
    ).updatedAt;
    expect(await polls.vote(poll.id, 'b', poll.options[1].id)).toEqual(changed);
    expect(
      (await prisma.pollVote.findFirstOrThrow({ where: { pollId: poll.id } }))
        .updatedAt,
    ).toEqual(timestamp);
    expect(
      (await repository.getQuacks('a')).find(
        (quack) => quack.poll?.id === poll.id,
      )!.poll!.myOptionId,
    ).toBeNull();
    const both = await polls.vote(poll.id, 'a', poll.options[0].id);
    expect(both.totalVotes).toBe(2);
    expect(both.options.map((option) => option.voteCount)).toEqual([1, 1, 0]);
  });

  it('rejects direct duplicates and cross-poll references at the database boundary', async () => {
    const poll = await create();
    const other = await create();
    await polls.vote(poll.id, 'a', poll.options[0].id);
    await expect(
      prisma.pollVote.create({
        data: { pollId: poll.id, userId: 'a', optionId: poll.options[0].id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.pollVote.create({
        data: { pollId: poll.id, userId: 'b', optionId: other.options[0].id },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      polls.vote(poll.id, 'b', other.options[0].id),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      polls.vote('missing', 'a', other.options[0].id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    { text: '   ', poll: { options: ['A', 'B'] } },
    { text: 'a'.repeat(281), poll: { options: ['A', 'B'] } },
    ...[
      [],
      ['A'],
      Array(7).fill('A'),
      ['A', ' a '],
      [' ', 'B'],
      ['a'.repeat(81), 'B'],
      [1, 'B'],
    ].map((options) => ({ text: 'Question', poll: { options } })),
    { text: 'Question', poll: null },
    { text: 'Question', poll: {} },
  ])('rejects invalid creation without leaving a post (%j)', async (input) => {
    auth.api.getSession.mockResolvedValue({ user: { id: 'a' } });
    const before = await prisma.quack.count();
    const response = await fetch(`${origin}/quacks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(400);
    expect(await prisma.quack.count()).toBe(before);
  });

  it('rolls back nested creation when storage fails', async () => {
    const before = await prisma.quack.count();
    await expect(
      repository.createQuack({
        userId: 'a',
        text: 'Question',
        poll: { options: ['a'.repeat(81), 'B'] },
      }),
    ).rejects.toBeDefined();
    expect(await prisma.quack.count()).toBe(before);
  });

  it('trims labels, preserves order, serves poll:null for ordinary posts and guards signed-out writes', async () => {
    const validated = await body({
      text: ' Question? ',
      poll: { options: [' A ', ' B '] },
    });
    expect(validated.text).toBe('Question?');
    const created = await repository.createQuack({ ...validated, userId: 'a' });
    expect(created.poll!.options.map((option) => option.label)).toEqual([
      'A',
      'B',
    ]);
    expect(
      (await repository.createQuack({ text: 'Normal post', userId: 'a' })).poll,
    ).toBeNull();
    auth.api.getSession.mockResolvedValue(null);
    for (const [path, method, data] of [
      ['/quacks', 'POST', { text: 'Signed out' }],
      [
        `/polls/${created.poll!.id}/vote`,
        'PUT',
        { optionId: created.poll!.options[0].id },
      ],
    ] as const) {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      expect(response.status).toBe(401);
    }
  });

  it('validates vote bodies and returns authoritative session-owned state over HTTP', async () => {
    const poll = await create();
    auth.api.getSession.mockResolvedValue({ user: { id: 'b' } });
    for (const input of [
      {},
      { optionId: 1 },
      { optionId: '' },
      { optionId: poll.options[0].id, userId: 'a' },
    ]) {
      expect(
        (
          await fetch(`${origin}/polls/${poll.id}/vote`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        ).status,
      ).toBe(400);
    }
    const response = await fetch(`${origin}/polls/${poll.id}/vote`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId: poll.options[0].id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      totalVotes: 1,
      myOptionId: poll.options[0].id,
    });
    expect(
      await prisma.pollVote.findUnique({
        where: { pollId_userId: { pollId: poll.id, userId: 'a' } },
      }),
    ).toBeNull();
  });

  it('cascades owned records when a post or voter is deleted', async () => {
    const poll = await create();
    await polls.vote(poll.id, 'a', poll.options[0].id);
    await prisma.quack.delete({
      where: {
        id: (await prisma.poll.findUniqueOrThrow({ where: { id: poll.id } }))
          .quackId,
      },
    });
    expect(await prisma.pollVote.count({ where: { pollId: poll.id } })).toBe(0);
    expect(await prisma.pollOption.count({ where: { pollId: poll.id } })).toBe(
      0,
    );
    const remaining = await create();
    await polls.vote(remaining.id, 'b', remaining.options[0].id);
    await prisma.user.delete({ where: { id: 'b' } });
    expect(
      (await repository.getQuacks('a')).find(
        (quack) => quack.poll?.id === remaining.id,
      )!.poll!.totalVotes,
    ).toBe(0);
  });
});
