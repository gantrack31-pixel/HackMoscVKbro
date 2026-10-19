import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("AI free colors, positioning and new elements render before acceptance and survive saving", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/health", async route => {
    const response = await route.fetch();
    await route.fulfill({json: {...await response.json(), mode: "live", llm_configured: true}});
  });
  let proposed: any;
  await page.route("**/api/projects/*/assistant", async route => {
    const input = route.request().postDataJSON();
    expect(input.preserve_facts).toBe(false);
    proposed = structuredClone(input.content);
    const slide = proposed.slides[0];
    const before = structuredClone(slide);
    const design = {...slide.designs?.[input.variant], background_color: "#112233", objects: {
      title: {x: 90, y: 20, w: 800, h: 110, font_size: 46, color: "#FF0000"}, body: {hidden: true},
    }};
    slide.design = design;
    slide.designs = {...slide.designs, [input.variant]: design};
    slide.elements = [
      {id: "custom-card", type: "rect", x: 100, y: 220, w: 400, h: 140, fill: "#00FF88", z_index: 80},
      {id: "custom-caption", type: "text", x: 120, y: 250, w: 340, h: 80, text: "Свободная композиция", color: "#112233", z_index: 90},
    ];
    await route.fulfill({json: {project: null, summary: "Новые цвета и композиция", changed_slides: [0], issues: [], proposal: {
      id: "canvas", content: proposed, base_updated_at: input.base_updated_at, expires_at: new Date(Date.now()+60000).toISOString(),
      changes: [{slide: 0, field: "design", before: before.design, after: design}, {slide: 0, field: "elements", before: [], after: slide.elements}],
    }}});
  });
  await page.route("**/api/projects/*/assistant/proposals/canvas/apply", async route => {
    const input = route.request().postDataJSON();
    const url = route.request().url().replace(/\/assistant\/proposals\/.*$/, "");
    const response = await page.request.put(url, {headers: route.request().headers(), data: {...input, content: proposed}});
    expect(response.ok()).toBeTruthy();
    await route.fulfill({json: {project: await response.json(), proposal: null, summary: "Сохранено", changed_slides: [0], issues: []}});
  });
  await page.goto("/");
  const app = new DecklyPage(page);
  await app.register();
  await app.createPresentation();
  await page.getByLabel("Что изменить с помощью AI?").fill("Синий фон, красный заголовок сверху, добавь зелёную карточку с подписью");
  await page.getByRole("button", {name: "Предложить изменения", exact: true}).click();
  const preview = page.locator(".assistant-visual-pair > div:last-child svg");
  await expect(preview.locator('rect[fill="#112233"]').first()).toBeVisible();
  await expect(preview.locator('text[fill="#FF0000"] tspan').first()).toHaveAttribute("x", "90");
  await expect(preview.getByText("Свободная композиция", {exact: true})).toBeVisible();
  await expect(page.locator('.slide-canvas rect[fill="#00FF88"]')).toHaveCount(0);
  await page.getByRole("button", {name: "Принять изменения", exact: true}).click();
  await expect(page.locator('.slide-canvas rect[fill="#00FF88"]')).toBeVisible();
  await expect(page.locator('.slide-canvas text[fill="#FF0000"] tspan').first()).toHaveAttribute("x", "90");
  expect(errors).toEqual([]);
  await page.getByRole("button", {name: "Отменить изменение", exact: true}).click();
  await expect(page.locator('.slide-canvas rect[fill="#00FF88"]')).toHaveCount(0);
});
