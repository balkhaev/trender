import { expect, test } from "@playwright/test";
import { disableMotion, mockApiForReel } from "./mocks";

test("страница рила рендерится и показывает отладку", async ({ page }) => {
  const reelId = "test-reel";

  await mockApiForReel(page, reelId);
  await page.goto(`/reel/${reelId}`);
  await disableMotion(page);

  await expect(page.getByText(reelId)).toBeVisible();
  await expect(page.getByText("Отладка")).toBeVisible();
  await expect(page.getByText("Логов пока нет")).toBeVisible();

  await page.getByRole("tab", { name: "Статистика" }).click();
  await expect(page.getByText("Статистики пока нет")).toBeVisible();

  await expect(page).toHaveScreenshot("reel.png", { fullPage: true });
});
