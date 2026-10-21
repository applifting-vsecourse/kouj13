import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

// Run against the local, seeded app: pnpm test:e2e
// Creates unique posts and only deletes posts created by this test.
const base = process.env.E2E_API_URL ?? 'http://localhost:4050/api';
const origin = process.env.E2E_FRONTEND_URL ?? 'http://localhost:3050';

async function login(email, password) {
  const response = await fetch(`${base}/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `Login ${email}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert.ok(cookie, 'Authentication must return a session cookie');
  return (path, options = {}) =>
    fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
        ...options.headers,
      },
    });
}

test('only the author or an authenticated admin can delete a quack', async () => {
  const author = await login('caffeinatedduck@example.com', 'password1');
  const other = await login('deepduckthoughts@example.com', 'password2');
  const admin = await login('admin@example.com', 'adminpassword');
  const created = [];
  const create = async () => {
    const response = await author('/quacks', {
      method: 'POST',
      body: JSON.stringify({
        text: `Moderation E2E ${randomUUID()}`,
        poll: { options: ['Yes', 'No'] },
      }),
    });
    assert.equal(response.status, 201);
    const quack = await response.json();
    created.push(quack.id);
    return quack;
  };
  const exists = async (client, id) => {
    const response = await client('/quacks');
    assert.equal(response.status, 200);
    return (await response.json()).some((quack) => quack.id === id);
  };
  try {
    const owned = await create();
    assert.equal(
      (await author(`/quacks/${owned.id}`, { method: 'DELETE' })).status,
      204,
      'Author deletes own post',
    );
    assert.equal(await exists(other, owned.id), false);

    const quack = await create();
    assert.equal(
      (await fetch(`${base}/quacks/${quack.id}`, { method: 'DELETE' })).status,
      401,
    );
    assert.equal(
      (await other(`/quacks/${quack.id}`, { method: 'DELETE' })).status,
      404,
      'Another user must be denied',
    );
    assert.equal(
      (
        await other(`/quacks/${quack.id}`, {
          method: 'DELETE',
          headers: { 'X-Role': 'admin' },
          body: JSON.stringify({ role: 'admin', userId: quack.userId }),
        })
      ).status,
      404,
      'Client-supplied role must not grant permission',
    );
    assert.equal(
      await exists(author, quack.id),
      true,
      'Unauthorized attempts preserve the post',
    );

    const vote = await other(`/polls/${quack.poll.id}/vote`, {
      method: 'PUT',
      body: JSON.stringify({ optionId: quack.poll.options[0].id }),
    });
    assert.equal(vote.status, 200);
    assert.equal(
      (await admin(`/quacks/${quack.id}`, { method: 'DELETE' })).status,
      204,
      "Admin deletes another author's post",
    );
    for (const client of [author, other, admin])
      assert.equal(await exists(client, quack.id), false);
    assert.equal(
      (
        await other(`/polls/${quack.poll.id}/vote`, {
          method: 'PUT',
          body: JSON.stringify({ optionId: quack.poll.options[0].id }),
        })
      ).status,
      404,
      'Deleted poll is no longer available',
    );
    assert.equal(
      (await admin(`/quacks/${quack.id}`, { method: 'DELETE' })).status,
      404,
    );

    const docs = await fetch(`${base}/docs-json`);
    assert.equal(docs.status, 200);
    const operation = (await docs.json()).paths['/api/quacks/{id}'].delete;
    assert.match(operation.summary, /author or an admin/);
    for (const status of ['204', '401', '404'])
      assert.ok(operation.responses[status]);
    assert.ok(operation.security.some((entry) => 'cookie' in entry));
  } finally {
    for (const id of created) {
      const response = await author(`/quacks/${id}`, { method: 'DELETE' });
      assert.ok([204, 404].includes(response.status), `Cleanup ${id}`);
    }
  }
});
