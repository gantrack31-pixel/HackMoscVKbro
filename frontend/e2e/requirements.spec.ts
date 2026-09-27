import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("import a packet, create ten slides, edit diagrams and inspect the generation passport", async ({ page }) => {
  await page.goto("/");
  await new DecklyPage(page).register();
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
  await page.locator('input[type="file"][multiple]').setInputFiles([
    { name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Пилот проекта Навигатор. Цель — сократить время поиска документов.") },
    { name: "metrics.csv", mimeType: "text/csv", buffer: Buffer.from("Период;Минуты\nДо;12\nПосле;8") },
  ]);
  await expect(page.getByRole("list", { name: "Импортированные документы" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByLabel("Опишите идею и добавьте материалы")).toHaveValue(/Источник: brief.txt[\s\S]*Источник: metrics.csv/);
  await page.getByLabel("Назначение презентации").selectOption("initiative");
  await expect(page.getByRole("radio", { name: "10", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Создать структуру", exact: true }).click();
  await expect(page.getByText("10 слайдов", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Одна история. Три способа рассказать." })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Открыть презентацию", exact: true }).click();

  await page.locator(".generation-passport > summary").click();
  await expect(page.locator(".generation-passport")).toContainText("Демонстрационный режим");
  await expect(page.locator(".generation-passport")).toContainText("Соблюдён");
  const fields = page.locator(".inspector");
  await fields.getByRole("combobox", { name: "Тип слайда", exact: true }).selectOption("diagram");
  await fields.getByRole("combobox", { name: /^Тип схемы/ }).selectOption("cycle");
  await fields.getByLabel("Узлы схемы", { exact: false }).fill("Сбор\nПроверка\nПубликация");
  const saved = page.waitForResponse(r => r.request().method() === "PUT" && /\/api\/projects\/[^/]+$/.test(r.url()));
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  const project = await (await saved).json();
  expect(project.content.slides[0].diagram_type).toBe("cycle");
  expect(project.content.slides[0].bullets).toEqual(["Сбор", "Проверка", "Публикация"]);
  await expect(page.getByRole("status").filter({ hasText: "Сохранено" })).toBeVisible();

  await fields.getByRole("combobox", { name: "Тип слайда", exact: true }).selectOption("icons");
  const labels = fields.getByLabel("Подписи пиктограмм", { exact: false });
  await labels.fill("1\n2\n3\n4\n5\n6\n7");
  await expect(page.getByRole("button", { name: "Сохранить изменения", exact: true })).toBeDisabled();
  await labels.fill("Команда\nЦель\nРезультат");
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Сохранено" })).toBeVisible();
  await fields.getByRole("combobox", { name: "Тип слайда", exact: true }).selectOption("image");
  await fields.getByLabel("Описание иллюстрации").fill("Светлая мастерская без надписей");
  await expect(fields.getByRole("button", { name: "Создать иллюстрацию" })).toBeDisabled();
  await expect(fields).toContainText("Генерация изображений пока не подключена");
});

test("requirements page exposes the pipeline and fits a mobile viewport", async ({ page }) => {
  await page.goto("/");
  await new DecklyPage(page).register();
  await page.goto("/#requirements");
  await expect(page.getByRole("heading", { name: "Как устроен Deckly", exact: true })).toBeVisible();
  await expect(page.locator(".workflow-stages > li")).toHaveCount(8);
  await expect(page.locator(".requirement-examples > article")).toHaveCount(3);
  await expect(page.getByText("GPU-сервис не подключён", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
