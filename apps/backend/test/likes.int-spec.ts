import { PrismaService } from '../src/core/prisma/prisma.service';

import request = require('supertest');

const api = process.env.TEST_API_URL!;
const prisma = new PrismaService();
type Agent = ReturnType<typeof request.agent>;
type WireQuack = {
  id: string;
  likeCount: number;
  likedByMe: boolean;
  deleted: boolean;
};

async function signIn(name: string): Promise<{ agent: Agent; id: string }> {
  const agent = request.agent(api);
  const result = await agent
    .post('/api/auth/sign-up/email')
    .send({
      name,
      email: `${name}@likes.example.com`,
      password: 'likes-test-password',
    })
    .expect(200);
  await agent
    .post('/api/auth/sign-in/email')
    .send({
      email: `${name}@likes.example.com`,
      password: 'likes-test-password',
    })
    .expect(200);
  return { agent, id: result.body.user.id as string };
}

async function create(agent: Agent, parentId?: string): Promise<WireQuack> {
  const response = await agent
    .post('/api/quacks')
    .send({
      text: parentId ? 'A reply' : 'A quack',
      ...(parentId ? { parentId } : {}),
    })
    .expect(201);
  return response.body as WireQuack;
}

async function feed(agent: Agent): Promise<WireQuack[]> {
  return (await agent.get('/api/quacks').expect(200)).body as WireQuack[];
}

async function replies(agent: Agent, id: string): Promise<WireQuack[]> {
  return (await agent.get(`/api/quacks/${id}/replies`).expect(200))
    .body as WireQuack[];
}

const path = (id: string): string => `/api/quacks/${id}/like`;
async function storedCount(id: string): Promise<number> {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) FROM "like" WHERE "quackId" = ${id}`;
  return Number(row.count);
}

beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== '/quacker_test') {
    throw new Error('Refusing to clean a database other than quacker_test');
  }
  await prisma.$connect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "user", "verification" RESTART IDENTITY CASCADE',
  );
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('Likes HTTP and PostgreSQL contract (cases.md)', () => {
  it('A1: new quacks and replies expose zero likes on create and reads', async () => {
    const { agent } = await signIn('alice');
    const parent = await create(agent);
    const reply = await create(agent, parent.id);
    for (const quack of [
      parent,
      reply,
      ...(await feed(agent)),
      ...(await replies(agent, parent.id)),
    ]) {
      expect(quack).toMatchObject({ likeCount: 0, likedByMe: false });
    }
  });

  it('A2/A4: like, repeat, unlike, repeat and like again on an own quack', async () => {
    const { agent } = await signIn('alice');
    const quack = await create(agent);
    for (const [liked, count] of [
      [true, 1],
      [true, 1],
      [false, 0],
      [false, 0],
      [true, 1],
    ] as const) {
      const response = await (
        liked ? agent.put(path(quack.id)) : agent.delete(path(quack.id))
      ).expect(200);
      expect(response.body).toEqual({ likeCount: count, likedByMe: liked });
      expect(await storedCount(quack.id)).toBe(count);
    }
  });

  it('A3: two users share a persisted count but have separate viewer states', async () => {
    const alice = await signIn('alice');
    const bob = await signIn('bob');
    const quack = await create(alice.agent);
    await alice.agent.put(path(quack.id)).expect(200);
    await bob.agent.put(path(quack.id)).expect(200);
    expect((await feed(alice.agent))[0]).toMatchObject({
      likeCount: 2,
      likedByMe: true,
    });
    await alice.agent.delete(path(quack.id)).expect(200);
    for (let read = 0; read < 2; read++) {
      expect((await feed(alice.agent))[0]).toMatchObject({
        likeCount: 1,
        likedByMe: false,
      });
      expect((await feed(bob.agent))[0]).toMatchObject({
        likeCount: 1,
        likedByMe: true,
      });
    }
    expect(await storedCount(quack.id)).toBe(1);
  });

  it('A5: own and other-user reply likes are independent of the parent', async () => {
    const alice = await signIn('alice');
    const bob = await signIn('bob');
    const parent = await create(alice.agent);
    const reply = await create(bob.agent, parent.id);
    await bob.agent.put(path(reply.id)).expect(200);
    expect((await replies(alice.agent, parent.id))[0]).toMatchObject({
      likeCount: 1,
      likedByMe: false,
    });
    expect((await replies(bob.agent, parent.id))[0]).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
    await alice.agent.put(path(reply.id)).expect(200);
    expect((await replies(bob.agent, parent.id))[0]).toMatchObject({
      likeCount: 2,
      likedByMe: true,
    });
    await bob.agent.delete(path(reply.id)).expect(200);
    expect((await replies(bob.agent, parent.id))[0]).toMatchObject({
      likeCount: 1,
      likedByMe: false,
    });
    expect((await feed(alice.agent))[0]).toMatchObject({
      likeCount: 0,
      likedByMe: false,
    });
  });

  it('A6: signed-out and invalid-session visitors cannot read or mutate likes', async () => {
    const { agent } = await signIn('alice');
    const parent = await create(agent);
    const before = await feed(agent);
    for (const cookie of ['', 'better-auth.session_token=invalid']) {
      for (const method of ['put', 'delete'] as const) {
        await request(api)
          [method](path(parent.id))
          .set('Cookie', cookie)
          .expect(401);
      }
      await request(api).get('/api/quacks').set('Cookie', cookie).expect(401);
      await request(api)
        .get(`/api/quacks/${parent.id}/replies`)
        .set('Cookie', cookie)
        .expect(401);
    }
    expect(await feed(agent)).toEqual(before);
  });

  it('A7: rejects body fields and never changes another user’s like', async () => {
    const alice = await signIn('alice');
    const bob = await signIn('bob');
    const quack = await create(alice.agent);
    await bob.agent.put(path(quack.id)).expect(200);
    for (const method of ['put', 'delete'] as const) {
      for (const body of [{ userId: bob.id }, { extra: true }]) {
        await alice.agent[method](path(quack.id)).send(body).expect(400);
      }
    }
    const response = await alice.agent.delete(path(quack.id)).expect(200);
    expect(response.body).toEqual({ likeCount: 1, likedByMe: false });
    expect((await feed(bob.agent))[0]).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
  });

  it('A8: rejects missing IDs, deleted quacks, deleted replies and tombstones', async () => {
    const { agent } = await signIn('alice');
    const gone = await create(agent);
    await agent.delete(`/api/quacks/${gone.id}`).expect(204);
    const parent = await create(agent);
    const reply = await create(agent, parent.id);
    await agent.delete(`/api/quacks/${reply.id}`).expect(204);
    await create(agent, parent.id);
    await agent.delete(`/api/quacks/${parent.id}`).expect(204);
    for (const id of ['missing', gone.id, reply.id, parent.id]) {
      await agent.put(path(id)).expect(404);
      await agent.delete(path(id)).expect(404);
    }
  });

  it('A9: concurrent duplicates are idempotent; distinct users count separately', async () => {
    const alice = await signIn('alice');
    const bob = await signIn('bob');
    const quack = await create(alice.agent);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => alice.agent.put(path(quack.id))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(8).fill(200),
    );
    expect(responses.map((response) => response.body)).toEqual(
      Array(8).fill({ likeCount: 1, likedByMe: true }),
    );
    expect(await storedCount(quack.id)).toBe(1);
    await expect(prisma.$executeRaw`
      INSERT INTO "like" ("quackId", "userId", "createdAt") VALUES (${quack.id}, ${alice.id}, NOW())
    `).rejects.toThrow();
    expect(await storedCount(quack.id)).toBe(1);
    const removed = await Promise.all(
      Array.from({ length: 8 }, () => alice.agent.delete(path(quack.id))),
    );
    expect(removed.map((response) => response.status)).toEqual(
      Array(8).fill(200),
    );
    expect(removed.map((response) => response.body)).toEqual(
      Array(8).fill({ likeCount: 0, likedByMe: false }),
    );
    expect(await storedCount(quack.id)).toBe(0);
    const distinct = await Promise.all([
      alice.agent.put(path(quack.id)),
      bob.agent.put(path(quack.id)),
    ]);
    expect(distinct.map((response) => response.status)).toEqual([200, 200]);
    expect(await storedCount(quack.id)).toBe(2);
  });

  it.each(['author', 'admin'])(
    'A10: %s deletion removes target likes but preserves reply likes',
    async (role) => {
      const alice = await signIn('alice');
      const moderator = role === 'author' ? alice : await signIn('moderator');
      if (role === 'admin') {
        await prisma.user.update({
          where: { id: moderator.id },
          data: { role: 'admin' },
        });
      }
      const standalone = await create(alice.agent);
      await alice.agent.put(path(standalone.id)).expect(200);
      await moderator.agent.delete(`/api/quacks/${standalone.id}`).expect(204);
      expect(await storedCount(standalone.id)).toBe(0);
      const parent = await create(alice.agent);
      const reply = await create(alice.agent, parent.id);
      await alice.agent.put(path(parent.id)).expect(200);
      await alice.agent.put(path(reply.id)).expect(200);
      await moderator.agent.delete(`/api/quacks/${parent.id}`).expect(204);
      expect(await storedCount(parent.id)).toBe(0);
      expect(
        (await feed(alice.agent)).find((item) => item.id === parent.id),
      ).toMatchObject({
        deleted: true,
        likeCount: 0,
        likedByMe: false,
      });
      expect((await replies(alice.agent, parent.id))[0]).toMatchObject({
        id: reply.id,
        likeCount: 1,
        likedByMe: true,
      });
      await moderator.agent.delete(`/api/quacks/${reply.id}`).expect(204);
      expect(await storedCount(reply.id)).toBe(0);
    },
  );

  it.each([false, true])(
    'A11: deletion racing with a like leaves no likes (hasReply=%s)',
    async (hasReply) => {
      const { agent } = await signIn('alice');
      // Repeat actual overlapping HTTP requests; no sleeps or ordering assumptions.
      for (let iteration = 0; iteration < 4; iteration++) {
        const quack = await create(agent);
        if (hasReply) await create(agent, quack.id);
        const [liked, deleted] = await Promise.all([
          agent.put(path(quack.id)),
          agent.delete(`/api/quacks/${quack.id}`),
        ]);
        expect(deleted.status).toBe(204);
        expect([200, 404]).toContain(liked.status);
        expect(await storedCount(quack.id)).toBe(0);
        await agent.put(path(quack.id)).expect(404);
      }
    },
  );
});
