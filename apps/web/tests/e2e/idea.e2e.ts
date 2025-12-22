import { expect, test } from "@playwright/test";
import { disableMotion, mockApiForIdea } from "./mocks";

test("страница idea показывает совпадения и рекомендации", async ({ page }) => {
  await mockApiForIdea(page);
  await page.goto("/idea");
  await disableMotion(page);

  await expect(
    page.getByRole("heading", { name: "Идея нового видео" })
  ).toBeVisible();

  const textarea = page.getByLabel("Мои теги");
  await textarea.fill("food, travel, unknown-tag");

  const matches = page
    .getByRole("heading", { name: "Совпадения" })
    .locator("..");
  await expect(matches).toBeVisible();
  await expect(matches.getByText("food", { exact: true })).toBeVisible();
  await expect(matches.getByText("travel", { exact: true })).toBeVisible();

  const recommendations = page
    .getByRole("heading", { name: "Рекомендации" })
    .locator("..");
  await expect(recommendations).toBeVisible();
  await expect(
    recommendations.getByText("street-food", { exact: true })
  ).toBeVisible();

  await expect(page).toHaveScreenshot("idea.png", { fullPage: true });
});
