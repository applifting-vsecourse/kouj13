import { expect, test } from "@playwright/test"

test("a signed-in user opens the feed", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("textbox", { name: "Email" }).fill("caffeinatedduck@example.com")
  await page.getByLabel("Password", { exact: true }).fill("password1")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/\/quacks$/)
  await expect(page.getByRole("textbox", { name: "New quack" })).toBeVisible()
  await expect(page.getByRole("article").first()).toBeVisible()
})
