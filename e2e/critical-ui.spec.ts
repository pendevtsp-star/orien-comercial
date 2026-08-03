import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD;
const email = process.env.E2E_EMAIL ?? "admin@example.com";

test.describe("critical customer browser flows", () => {
  test.skip(!password, "Set E2E_PASSWORD to run the authenticated browser suite.");

  test("logs in and keeps the main operational screens usable across breakpoints", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "E-mail" }).fill(email);
    await page.locator("input[name=password]").fill(password!);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/(store-central|dashboard)/);

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/integrations");
      await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
    }
  });
});
