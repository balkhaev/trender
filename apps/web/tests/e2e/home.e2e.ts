import { expect, test } from "@playwright/test";
import { disableMotion, mockApiForHome } from "./mocks";

const TAB_ALL = /Все/i;
const TAB_FOUND = /Найдены/i;

test("главная страница рендерится и показывает ключевые секции", async ({
  page,
}) => {
  await mockApiForHome(page);
  await page.goto("/");
  await disableMotion(page);

  await expect(page.getByRole("link", { name: "Trender" })).toBeVisible();
  await expect(page.getByText("Всего рилов")).toBeVisible();

  await expect(page.getByRole("tab", { name: TAB_ALL })).toBeVisible();
  await expect(page.getByRole("tab", { name: TAB_FOUND })).toBeVisible();

  await expect(page.locator('a[href="/reel/test-reel"]')).toBeVisible();

  await expect(page).toHaveScreenshot("home.png", { fullPage: true });
});
