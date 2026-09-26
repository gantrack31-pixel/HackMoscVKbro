import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("register, create, edit, save, audit and export a presentation", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  await app.assertAccessibleMainLandmarks();
  await app.createPresentation();

  await app.changeSlideTitle("E2E — материал сохранён");
  await expect(page.getByRole("status").filter({ hasText: "Есть изменения" })).toBeVisible();
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Сохранено" })).toBeVisible();

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.getByRole("region", { name: "Проверка презентации" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Замечаний:/ })).toBeVisible();

  await page.getByRole("link", { name: "Завершить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ваша история готова к выходу" })).toBeVisible();
  await page.getByRole("button", { name: /На устройство/ }).click();

  const downloadResponse = page.waitForResponse((response) =>
    response.url().includes("/export/pptx") && response.status() === 200,
  );
  await page.getByRole("button", { name: /PowerPoint/ }).click();
  await downloadResponse;
  await expect(page.getByText("Файл передан браузеру для скачивания")).toBeVisible();
});

test("warn before discarding unsaved editor changes and allow staying", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  await app.createPresentation();
  await app.changeSlideTitle("Несохранённый вариант");

  await page.getByRole("link", { name: "Мои презентации" }).click();
  const dialog = page.getByRole("dialog", { name: "Изменения ещё не сохранены" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Сохраните изменения на текущей странице", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Остаться на странице" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Редактор презентации" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Есть изменения" })).toBeVisible();
});

test("keyboard navigation, visible focus, theme persistence and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toHaveCount(1);
  await expect(page.locator(":focus-visible")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Регистрация" }).click();
  await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();

  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("workspace navigation opens and closes with keyboard and traps focus", async ({ page }) => {
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  const trigger = page.getByRole("button", { name: "Раскрыть навигацию Deckly.Ai" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("button", { name: "Свернуть навигацию Deckly.Ai" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Раскрыть навигацию Deckly.Ai" })).toBeFocused();
});

test("authentication errors are announced accessibly", async ({ page }) => {
  await page.goto("/#login");
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();
  await page.getByLabel("Электронная почта").fill("missing@example.test");
  await page.getByLabel("Пароль", { exact: true }).fill("no-such-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Неверная почта или пароль");
});