import { expect, test } from "@playwright/test";

const routes: string[] = ["/dashboard", "/scraper", "/analyzer"];

test("неизвестные страницы возвращают 404", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);

    await expect(
      page.getByRole("heading", { name: "Страница не найдена" })
    ).toBeVisible();
  }

  await expect(page).toHaveScreenshot("not-found.png", { fullPage: true });
});
