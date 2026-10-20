import { expect, test, type Locator, type Page } from "@playwright/test";
import { DecklyPage } from "./pages";

async function drag(
  page: Page,
  target: Locator,
  dx: number,
  dy: number,
  cancel = false,
) {
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  const x = box!.x + box!.width / 2,
    y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

test("mouse layout changes survive save/reload, export and history; audit also edits layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const app = new DecklyPage(page);
  await app.register();
  await app.createPresentation();
  const overlay = page.locator(".slide-layout-overlay");
  const title = overlay.locator('[data-object-id="title"]');
  await expect(title).toHaveAttribute("aria-disabled", "false");
  const originalX = Number(await title.getAttribute("x"));
  const originalY = Number(await title.getAttribute("y"));
  const originalW = Number(await title.getAttribute("width"));

  // Selecting and cancelling a gesture must leave the saved state untouched.
  await title.click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();
  await drag(page, title, 18, 12, true);
  await expect(title).toHaveAttribute("x", String(originalX));
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();

  let previewRequests = 0;
  page.on("request", (request) => {
    if (/\/preview$/.test(new URL(request.url()).pathname)) previewRequests++;
  });
  await drag(page, title, 22, 16);
  await expect(title).toHaveAttribute("aria-disabled", "false");
  const movedX = Number(await title.getAttribute("x"));
  const movedY = Number(await title.getAttribute("y"));
  expect(movedX).toBeGreaterThan(originalX);
  expect(movedY).toBeGreaterThan(originalY);
  expect(previewRequests).toBe(1);

  await drag(page, overlay.locator('[data-handle="se"]'), -20, -10);
  await expect(title).toHaveAttribute("aria-disabled", "false");
  const resizedW = Number(await title.getAttribute("width"));
  expect(resizedW).toBeLessThan(originalW);
  await page.screenshot({
    path: test.info().outputPath("layout-editor.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();
  const projects = await (await page.request.get("/api/projects")).json();
  const projectId = projects[0].id;
  const saved = await (
    await page.request.get(`/api/projects/${projectId}`)
  ).json();
  const object = saved.variants[saved.variant][0].objects.find(
    (item: any) => item.id === "title",
  );
  expect(object.x).toBeCloseTo(movedX);
  expect(object.y).toBeCloseTo(movedY);
  expect(object.w).toBeCloseTo(resizedW);
  const html = await page.request.get(`/api/projects/${projectId}/export/html`);
  expect(html.ok()).toBeTruthy();
  expect(await html.text()).toContain(`x="${object.x}"`);
  const pptx = await page.request.get(`/api/projects/${projectId}/export/pptx`);
  expect(pptx.ok()).toBeTruthy();
  expect((await pptx.body()).subarray(0, 2).toString()).toBe("PK");
  await page.reload();
  await expect(title).toHaveAttribute("x", String(movedX));
  await expect(title).toHaveAttribute("width", String(resizedW));
  await page
    .getByRole("button", { name: "Отменить изменение", exact: true })
    .click();
  await expect(title).toHaveAttribute("x", String(originalX));
  await page
    .getByRole("button", { name: "Повторить изменение", exact: true })
    .click();
  await expect(title).toHaveAttribute("x", String(movedX));

  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page
    .getByRole("button", { name: "Править макет", exact: true })
    .click();
  await expect(title).toHaveAttribute("aria-disabled", "false");
  await drag(page, title, 12, 8);
  await page
    .getByRole("button", { name: "Сохранить и проверить", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Сохранить и проверить", exact: true }),
  ).toHaveCount(0);
  expect(Number(await title.getAttribute("x"))).toBeGreaterThan(movedX);
  expect(errors).toEqual([]);
});

test("custom shapes and complete charts remain editable when the canvas changes size", async ({
  page,
}) => {
  await page.goto("/");
  const app = new DecklyPage(page);
  await app.register();
  await app.createPresentation();
  const projects = await (await page.request.get("/api/projects")).json();
  const project = await (
    await page.request.get(`/api/projects/${projects[0].id}`)
  ).json();
  const auth = await (await page.request.get("/api/auth/me")).json();
  const content = structuredClone(project.content);
  content.slides[0].elements = [
    {
      id: "custom-test-chart",
      type: "chart",
      x: 100,
      y: 350,
      w: 600,
      h: 220,
      chart: { labels: ["Alpha", "Beta"], values: [10, 20], unit: "" },
    },
    {
      id: "custom-test-card",
      type: "ellipse",
      x: 900,
      y: 300,
      w: 100,
      h: 100,
      fill: "#FF9900",
    },
  ];
  const response = await page.request.put(`/api/projects/${project.id}`, {
    headers: { "X-CSRF-Token": auth.csrf },
    data: {
      content,
      variant: project.variant,
      base_updated_at: project.updated_at,
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  const overlay = page.locator(".slide-layout-overlay");
  const chart = overlay.locator('[data-object-id="custom-test-chart"]');
  const label = page
    .locator(".slide-canvas .deck-slide")
    .getByText("Alpha", { exact: true });
  await expect(chart).toBeVisible();
  const oldLabelX = Number(await label.getAttribute("x"));
  await page.setViewportSize({ width: 1100, height: 900 });
  await drag(page, chart, 20, -12);
  await expect(chart).toHaveAttribute("aria-disabled", "false");
  const chartX = Number(await chart.getAttribute("x"));
  expect(chartX).toBeGreaterThan(100);
  expect(Number(await label.getAttribute("x")) - oldLabelX).toBeCloseTo(
    chartX - 100,
  );
  await drag(page, overlay.locator('[data-handle="se"]'), -15, -10);
  await expect(chart).toHaveAttribute("aria-disabled", "false");
  expect(Number(await chart.getAttribute("width"))).toBeLessThan(600);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const card = overlay.locator('[data-object-id="custom-test-card"]');
  await card.focus();
  await card.press("Shift+ArrowRight");
  await expect(card).toHaveAttribute("aria-disabled", "false");
  await expect(card).toHaveAttribute("x", "910");
  // Pointer capture keeps the drag active when the cursor leaves the slide.
  await drag(page, card, 2000, 0);
  await expect(card).toHaveAttribute("aria-disabled", "false");
  await expect(card).toHaveAttribute("x", "1180");
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page.locator('[data-save-state="saved"]')).toBeVisible();
});
