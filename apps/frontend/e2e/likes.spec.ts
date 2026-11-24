import { randomUUID } from "node:crypto"
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test"

const api = process.env.E2E_API_URL ?? "http://localhost:4050/api"
type Created = { id: string; text: string }

async function signIn(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "Email" }).fill("caffeinatedduck@example.com")
  await page.getByLabel("Password", { exact: true }).fill("password1")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/quacks$/)
}

async function create(request: APIRequestContext, parentId?: string): Promise<Created> {
  const text = `Likes acceptance ${randomUUID()}`
  const response = await request.post(`${api}/quacks`, {
    data: { text, ...(parentId ? { parentId } : {}) },
  })
  expect(response.status()).toBe(201)
  return { ...(await response.json()), text } as Created
}

const article = (page: Page, text: string): Locator =>
  page
    .getByRole("article")
    .filter({ has: page.getByText(text, { exact: true }) })
    .last()
const button = (item: Locator, liked = false): Locator =>
  item.getByRole("button", { name: liked ? /^Unlike\b/i : /^Like\b/i })
const count = (item: Locator): Locator => item.getByLabel("Like count", { exact: true })

async function cleanup(request: APIRequestContext, ids: string[]): Promise<void> {
  for (const id of [...ids].reverse()) {
    const response = await request.delete(`${api}/quacks/${id}`)
    expect([204, 404]).toContain(response.status())
  }
}

test("E1: keyboard like/unlike shows confirmed count, selection and persistence", async ({
  page,
  context,
}) => {
  await signIn(page)
  const quack = await create(context.request)
  try {
    await page.reload()
    const item = article(page, quack.text)
    await expect(count(item)).toHaveText("0")
    await expect(button(item)).toHaveAttribute("aria-pressed", "false")
    await button(item).focus()
    await page.keyboard.press("Enter")
    await expect(count(item)).toHaveText("1")
    await expect(button(item, true)).toHaveAttribute("aria-pressed", "true")
    await page.reload()
    await expect(count(item)).toHaveText("1")
    await expect(button(item, true)).toHaveAttribute("aria-pressed", "true")
    await button(item, true).focus()
    await page.keyboard.press("Space")
    await expect(count(item)).toHaveText("0")
    await expect(button(item)).toHaveAttribute("aria-pressed", "false")
    await page.reload()
    await expect(count(item)).toHaveText("0")
    await expect(button(item)).toHaveAttribute("aria-pressed", "false")
  } finally {
    await cleanup(context.request, [quack.id])
  }
})

test("E2: replies keep independent likes when the parent becomes a tombstone", async ({
  page,
  context,
}) => {
  await signIn(page)
  const parent = await create(context.request)
  const ids = [parent.id]
  try {
    const reply = await create(context.request, parent.id)
    ids.push(reply.id)
    await page.reload()
    const parentItem = article(page, parent.text)
    await expect(button(parentItem)).toBeVisible()
    await button(parentItem).click()
    await expect(count(parentItem)).toHaveText("1")
    await parentItem.getByRole("button", { name: "1 reply", exact: true }).click()
    const replyItem = article(page, reply.text)
    await expect(count(replyItem)).toHaveText("0")
    await button(replyItem).click()
    await expect(count(replyItem)).toHaveText("1")
    await page.reload()
    await parentItem.getByRole("button", { name: "1 reply", exact: true }).click()
    await expect(count(replyItem)).toHaveText("1")
    await expect(button(replyItem, true)).toHaveAttribute("aria-pressed", "true")
    // The parent's own Delete is the first; the reply also has a Delete button.
    await parentItem.getByRole("button", { name: "Delete", exact: true }).first().click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete quack", exact: true })
      .click()
    const tombstone = page
      .getByRole("article")
      .filter({ hasText: "This quack was deleted" })
      .first()
    await expect(tombstone).toBeVisible()
    const showReplies = tombstone.getByRole("button", { name: "1 reply", exact: true })
    if (await showReplies.isVisible()) await showReplies.click()
    await expect(count(replyItem)).toHaveText("1")
    await expect(button(replyItem, true)).toHaveAttribute("aria-pressed", "true")
    // Only the surviving reply has a like control/count inside this thread.
    await expect(tombstone.getByRole("button", { name: /^(Like|Unlike)\b/i })).toHaveCount(1)
    await expect(count(tombstone)).toHaveCount(1)
  } finally {
    await cleanup(context.request, ids)
  }
})

test("E3: pending writes retain confirmed values and disable the control", async ({
  page,
  context,
}) => {
  await signIn(page)
  const quack = await create(context.request)
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await page.reload()
    const item = article(page, quack.text)
    await expect(button(item)).toBeVisible()
    for (const liked of [false, true]) {
      let acknowledge: (() => void) | undefined
      const received = new Promise<void>((resolve) => {
        acknowledge = resolve
      })
      let allowResponse: (() => void) | undefined
      const responseGate = new Promise<void>((resolve) => {
        allowResponse = resolve
      })
      await page.route(`${api}/quacks/${quack.id}/like`, async (route) => {
        acknowledge?.()
        await Promise.race([responseGate, gate])
        await route.continue()
      })
      await button(item, liked).click()
      await received
      await expect(button(item, liked)).toBeDisabled()
      await expect(button(item, liked)).toHaveAttribute("aria-busy", "true")
      await expect(button(item, liked)).toHaveAttribute("aria-pressed", String(liked))
      await expect(count(item)).toHaveText(liked ? "1" : "0")
      allowResponse?.()
      await expect(count(item)).toHaveText(liked ? "0" : "1")
      await expect(button(item, !liked)).toBeEnabled()
      await page.unroute(`${api}/quacks/${quack.id}/like`)
    }
  } finally {
    release?.()
    await page.unrouteAll({ behavior: "wait" })
    await cleanup(context.request, [quack.id])
  }
})

test("E3: a rejected write shows an error, refreshes and allows retry", async ({
  page,
  context,
}) => {
  await signIn(page)
  const quack = await create(context.request)
  try {
    await page.reload()
    const item = article(page, quack.text)
    await expect(button(item)).toBeVisible()
    await page.route(`${api}/quacks/${quack.id}/like`, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Like unavailable" }),
      }),
    )
    const refreshed = page.waitForResponse(
      (response) => response.url() === `${api}/quacks` && response.request().method() === "GET",
    )
    await button(item).click()
    await expect(item.getByRole("alert")).toBeVisible()
    expect((await refreshed).status()).toBe(200)
    await expect(count(item)).toHaveText("0")
    await expect(button(item)).toHaveAttribute("aria-pressed", "false")
    await expect(button(item)).toBeEnabled()
    await page.unroute(`${api}/quacks/${quack.id}/like`)
    await button(item).click()
    await expect(count(item)).toHaveText("1")
  } finally {
    await page.unrouteAll({ behavior: "wait" })
    await cleanup(context.request, [quack.id])
  }
})

test("E3: a lost response reconciles the server write and handles a failed refresh", async ({
  page,
  context,
}) => {
  await signIn(page)
  const quack = await create(context.request)
  try {
    await page.reload()
    const item = article(page, quack.text)
    await expect(button(item)).toBeVisible()
    // Commit the real write, then lose its response. The server's saved state is true.
    await page.route(`${api}/quacks/${quack.id}/like`, async (route) => {
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort("connectionreset")
    })
    await page.route(`${api}/quacks`, (route) =>
      route.request().method() === "GET" ? route.abort("connectionreset") : route.continue(),
    )
    await button(item).click()
    await expect(item.getByRole("alert")).toBeVisible()
    await expect(button(item)).toBeDisabled()
    await expect(item.getByRole("button", { name: /retry/i })).toBeVisible()
    await page.unroute(`${api}/quacks`)
    await page.unroute(`${api}/quacks/${quack.id}/like`)
    await item.getByRole("button", { name: /retry/i }).click()
    await expect(count(item)).toHaveText("1")
    await expect(button(item, true)).toHaveAttribute("aria-pressed", "true")
    await expect(button(item, true)).toBeEnabled()
    await button(item, true).click()
    await expect(count(item)).toHaveText("0")
  } finally {
    await page.unrouteAll({ behavior: "wait" })
    await cleanup(context.request, [quack.id])
  }
})
