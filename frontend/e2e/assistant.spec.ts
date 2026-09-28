import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("AI edits include the manual draft, save a revision and can be undone", async ({ page }) => {
  await page.route("**/api/health", async route => {
    const original = await route.fetch();
    await route.fulfill({ json: { ...await original.json(), mode: "live", llm_configured: true } });
  });
  let calls = 0;
  await page.route("**/api/projects/*/assistant", async route => {
    const input = route.request().postDataJSON();
    expect(input.content.slides[0].body).toContain("Ручной текст");
    expect(input.slide).toBe(0);
    expect(input.instruction).toBe("Сократи мой текст");
    calls++;
    const content = structuredClone(input.content);
    content.slides[0].body = "AI сократил текст.";
    // Deterministic model substitute; persist through the real authenticated API.
    const url = route.request().url().replace(/\/assistant$/, "");
    const saved = await page.request.put(url, { headers: route.request().headers(), data: { content, variant: input.variant } });
    expect(saved.ok()).toBeTruthy();
    await route.fulfill({ json: { project: await saved.json(), summary: "Текст сокращён.", changed_slides: [0], before: 2, issues: [] } });
  });
  await page.goto("/");
  const app = new DecklyPage(page);
  await app.register();
  await app.createPresentation();
  const text = page.getByRole("textbox", { name: "Основной текст" });
  await text.fill("Ручной текст с подробностями, который нужно сократить.");
  await page.getByLabel("Что изменить с помощью AI?").fill("Сократи мой текст");
  await page.getByRole("button", { name: "Применить запрос AI", exact: true }).click();
  await expect(text).toHaveValue("AI сократил текст.");
  await expect(page.getByText("Правки сохранены", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByRole("button", { name: "Вернуть версию", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Вернуть версию", exact: true }).click();
  await expect(text).not.toHaveValue("AI сократил текст.");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Исправить презентацию с AI", exact: true })).toBeVisible();
  await expect(page.getByLabel("Область изменений")).toHaveValue("all");
  await expect(page.getByRole("button", { name: "Исправить автоматически с AI", exact: true })).toBeEnabled();
});

test("AI failure leaves the unsaved text editable", async ({ page }) => {
  await page.route("**/api/health", async route => {
    const original = await route.fetch();
    await route.fulfill({ json: { ...await original.json(), mode: "live", llm_configured: true } });
  });
  await page.route("**/api/projects/*/assistant", route => route.fulfill({ status: 502, json: { detail: "Модель временно недоступна" } }));
  await page.goto("/");
  const app = new DecklyPage(page); await app.register(); await app.createPresentation();
  const text = page.getByRole("textbox", { name: "Основной текст" });
  await text.fill("Моя работа не должна исчезнуть.");
  await page.getByRole("button", { name: "Исправить автоматически с AI", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Модель временно недоступна");
  await expect(text).toHaveValue("Моя работа не должна исчезнуть.");
  await expect(page.getByRole("button", { name: "Сохранить изменения", exact: true })).toBeEnabled();
});
