import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

const api = process.env.E2E_API_URL ?? 'http://localhost:4050/api';

async function signIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/quacks$/);
  await expect(page.getByRole('textbox', { name: 'New quack' })).toBeVisible();
  return { context, page };
}

const article = (page: Page, text: string) =>
  page.getByRole('article').filter({ hasText: text });

async function confirmDelete(page: Page, text: string) {
  await article(page, text)
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete quack', exact: true })
    .click();
  await expect(article(page, text)).toHaveCount(0);
}

test('author, another user, admin, and Swagger enforce moderation permissions', async ({
  browser,
}) => {
  const author = await signIn(
    browser,
    'caffeinatedduck@example.com',
    'password1',
  );
  const other = await signIn(
    browser,
    'deepduckthoughts@example.com',
    'password2',
  );
  const admin = await signIn(browser, 'admin@example.com', 'adminpassword');
  const ids: string[] = [];
  const create = async () => {
    const text = `Browser moderation ${randomUUID()}`;
    await author.page.getByRole('textbox', { name: 'New quack' }).fill(text);
    const posted = author.page.waitForResponse(
      (response) =>
        response.url() === `${api}/quacks` &&
        response.request().method() === 'POST',
    );
    await author.page
      .getByRole('button', { name: 'Quack', exact: true })
      .click();
    const response = await posted;
    expect(response.status()).toBe(201);
    const quack = await response.json();
    ids.push(quack.id);
    await expect(article(author.page, text)).toBeVisible();
    return { ...quack, text };
  };
  try {
    const owned = await create();
    await article(author.page, owned.text)
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await author.page
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(article(author.page, owned.text)).toBeVisible();
    await confirmDelete(author.page, owned.text);

    const moderated = await create();
    await other.page.reload();
    await expect(article(other.page, moderated.text)).toBeVisible();
    await expect(
      article(other.page, moderated.text).getByRole('button', {
        name: 'Delete',
        exact: true,
      }),
    ).toHaveCount(0);
    const denied = await other.context.request.delete(
      `${api}/quacks/${moderated.id}`,
    );
    expect(
      denied.status(),
      'A regular user cannot bypass the hidden Delete button',
    ).toBe(404);
    await author.page.reload();
    await expect(article(author.page, moderated.text)).toBeVisible();

    await admin.page.reload();
    await expect(
      article(admin.page, moderated.text).getByRole('button', {
        name: 'Delete',
        exact: true,
      }),
    ).toBeVisible();
    await confirmDelete(admin.page, moderated.text);
    await author.page.reload();
    await expect(article(author.page, moderated.text)).toHaveCount(0);

    const swaggerQuack = await create();
    const swagger = await admin.context.newPage();
    await swagger.goto(`${api}/docs`);
    const operation = swagger
      .locator('.opblock-delete')
      .filter({ hasText: '/api/quacks/{id}' });
    await expect(operation).toContainText(
      'Delete a quack as its author or an admin',
    );
    await operation.locator('.opblock-summary').click();
    await operation.getByRole('button', { name: 'Try it out' }).click();
    await operation.getByRole('textbox').fill(swaggerQuack.id);
    const deleted = swagger.waitForResponse(
      (response) =>
        response.url() === `${api}/quacks/${swaggerQuack.id}` &&
        response.request().method() === 'DELETE',
    );
    await operation
      .getByRole('button', { name: 'Execute', exact: true })
      .click();
    expect((await deleted).status()).toBe(204);
    await expect(operation.locator('.responses-inner')).toContainText('204');
    await author.page.reload();
    await expect(article(author.page, swaggerQuack.text)).toHaveCount(0);
  } finally {
    for (const id of ids) {
      const response = await author.context.request.delete(
        `${api}/quacks/${id}`,
      );
      expect([204, 404]).toContain(response.status());
    }
    await Promise.all([
      author.context.close(),
      other.context.close(),
      admin.context.close(),
    ]);
  }
});
