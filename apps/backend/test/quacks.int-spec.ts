import { PrismaService } from '../src/core/prisma/prisma.service';

import request = require('supertest');

const api = process.env.TEST_API_URL!;
const prisma = new PrismaService();

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

describe('GET /api/quacks against Postgres and real authentication', () => {
  it('returns 401 to a signed-out visitor', async () => {
    await request(api).get('/api/quacks').expect(401);
  });

  it('returns 200 and persisted quacks to a signed-in user', async () => {
    const user = request.agent(api);
    await user
      .post('/api/auth/sign-up/email')
      .send({
        name: 'Integration Duck',
        email: 'integration@example.com',
        password: 'integration-password',
      })
      .expect(200);
    await user
      .post('/api/auth/sign-in/email')
      .send({
        email: 'integration@example.com',
        password: 'integration-password',
      })
      .expect(200);
    const created = await user
      .post('/api/quacks')
      .send({ text: 'Database-backed feed' })
      .expect(201);
    const feed = await user.get('/api/quacks').expect(200);
    expect(feed.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          text: 'Database-backed feed',
        }),
      ]),
    );
    expect(await prisma.quack.count()).toBe(1);
  });
});
