import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

for (const mode of ["add", "delete", "reorder"] as const) {
  test(`AI ${mode} proposal previews safely and keeps the editor selection valid`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/health", async route => {
      const response = await route.fetch();
      await route.fulfill({ json: { ...await response.json(), mode: "live", llm_configured: true } });
    });
    let proposed: any = null;
    await page.route("**/api/projects/*/assistant", async route => {
      const input = route.request().postDataJSON();
      expect(input.slide).toBeNull();
      expect(input.allow_structure).toBe(true);
      proposed = structuredClone(input.content);
      if (mode === "add") proposed.slides.push({ ...structuredClone(proposed.slides[0]), title: "Новый вывод AI" });
      else if (mode === "delete") proposed.slides.pop();
      else proposed.slides.reverse();
      const index = mode === "add" ? proposed.slides.length - 1 : input.content.slides.length - 1;
      await route.fulfill({ json: { project: null, summary: "Предложение структуры", changed_slides: [index], issues: [], proposal: {
        id: "structural", content: proposed, base_updated_at: input.base_updated_at,
        expires_at: new Date(Date.now() + 60000).toISOString(), changes: [{slide: index, field: "slide",
          before: mode !== "add" ? input.content.slides[index] : null, after: mode !== "delete" ? proposed.slides[index] : null}],
      } } });
    });
    await page.route("**/api/projects/*/assistant/proposals/structural/apply", async route => {
      const url = route.request().url().replace(/\/assistant\/proposals\/.*$/, "");
      const input = route.request().postDataJSON();
      const response = await page.request.put(url, { headers: route.request().headers(), data: { ...input, content: proposed } });
      expect(response.ok()).toBeTruthy();
      await route.fulfill({ json: { project: await response.json(), proposal: null, summary: "Структура сохранена", changed_slides: [], issues: [],
        ...(mode === "reorder" ? {slide_order: [...Array(8).keys()].reverse()} : {}),
      } });
    });
    await page.goto("/");
    const app = new DecklyPage(page);
    await app.register();
    await app.createPresentation();
    await page.getByRole("button", { name: /^Слайд 8:/ }).click();
    if (mode === "reorder") {
      await page.locator(".assistant-context > summary").click();
      await page.getByRole("checkbox", {name: "Заголовок", exact: true}).check();
    }
    await page.getByLabel("Область изменений").selectOption("all");
    await page.getByLabel("Что изменить с помощью AI?").fill(mode === "add" ? "Добавь вывод" : mode === "delete" ? "Удали последний слайд" : "Обрати порядок слайдов");
    await page.getByRole("button", { name: "Предложить изменения", exact: true }).click();
    await expect(page.getByRole("region", { name: "Сравнение предложения AI" })).toContainText(mode === "add" ? "Новый слайд" : mode === "delete" ? "Слайд удалён" : "После принятия");
    await expect(page.locator(".slide-rail .thumbnail")).toHaveCount(8);
    await page.getByRole("button", { name: "Принять изменения", exact: true }).click();
    await expect(page.locator(".slide-rail .thumbnail")).toHaveCount(mode === "add" ? 9 : mode === "delete" ? 7 : 8);
    await expect(page.getByRole("region", { name: "Редактор презентации", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    if (mode === "reorder") {
      await page.getByRole("button", { name: /^Слайд 1:/ }).click();
      await page.locator(".assistant-context > summary").click();
      await expect(page.getByRole("checkbox", {name: "Заголовок", exact: true})).toBeChecked();
    }
    await page.getByRole("button", { name: "Отменить изменение", exact: true }).click();
    await expect(page.locator(".slide-rail .thumbnail")).toHaveCount(8);
  });
}
