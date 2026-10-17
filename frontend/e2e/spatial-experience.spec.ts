import { expect, test, type Page } from "@playwright/test";
import { DecklyPage } from "./pages";

class SpatialPage extends DecklyPage {
  constructor(page: Page) {
    super(page);
  }
  async settleScene(frames = 125) {
    await this.page.evaluate(async (count) => {
      for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
    }, frames);
  }
  scene() {
    return this.page.getByTestId("presentation-space");
  }
  async openCatalog() {
    await this.page.goto("/#templates");
  }
}

test("spatial home keeps creation accessible and releases its canvas on navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const app = new SpatialPage(page);
  await page.goto("/");
  await app.register();
  await expect(app.scene()).toBeVisible();
  await expect(app.scene().locator("canvas")).toBeVisible();
  await page.mouse.move(1000, 400);
  await page.mouse.wheel(0, 500);
  await page
    .getByRole("button", { name: "Создать презентацию", exact: true })
    .click();
  await expect(
    page.getByLabel("Опишите идею и добавьте материалы"),
  ).toBeEditable();
  await expect(app.scene()).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("reduced motion keeps real template previews and creation actions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = new SpatialPage(page);
  await page.goto("/");
  await app.register();
  await expect(app.scene().locator("canvas")).toHaveCount(0);
  await expect(app.scene().getByTestId("spatial-fallback")).toBeVisible();
  await page
    .getByRole("button", { name: "Начать работу", exact: true })
    .click();
  await expect(
    page.getByLabel("Опишите идею и добавьте материалы"),
  ).toBeEditable();
});

test("mobile gallery preserves preview, favorites, search and template selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = new SpatialPage(page);
  await page.goto("/");
  await app.register();
  await app.openCatalog();
  await page.getByLabel("Поиск шаблонов").fill("Education");
  await page
    .getByRole("button", { name: "Посмотреть шаблон VK Education" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить в избранное: VK Education" })
    .click();
  await expect(
    page.getByRole("button", { name: "Убрать из избранного: VK Education" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("WebGL failure leaves the HTML fallback usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      ...args: unknown[]
    ) {
      if (
        kind === "webgl" ||
        kind === "webgl2" ||
        kind === "experimental-webgl"
      )
        return null;
      return original.apply(this, [kind, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  const app = new SpatialPage(page);
  await page.goto("/");
  await app.register();
  await expect(app.scene().getByTestId("spatial-fallback")).toBeVisible();
  await page
    .getByRole("button", { name: "Начать работу", exact: true })
    .click();
  await expect(
    page.getByLabel("Опишите идею и добавьте материалы"),
  ).toBeEditable();
});

test("scene, gallery and assembly remain legible in both themes", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const app = new SpatialPage(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await app.register();
  await expect(app.scene().locator("canvas")).toBeVisible();
  await app.settleScene();
  await page.screenshot({
    path: testInfo.outputPath("home-light.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await page.screenshot({
    path: testInfo.outputPath("home-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await app.openCatalog();
  const carousel = page.getByRole("region", {
    name: "Пространственная подборка шаблонов",
  });
  const firstTitle = await carousel
    .getByTestId("gallery-active-template")
    .getByRole("heading")
    .textContent();
  await carousel.getByRole("button", { name: "Следующий шаблон" }).click();
  await expect(
    carousel.getByTestId("gallery-active-template").getByRole("heading"),
  ).not.toHaveText(firstTitle!);
  await page.screenshot({
    path: testInfo.outputPath("gallery-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/#demo");
  await expect(app.scene().locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Повторить сборку" }).click();
  await expect(
    page.getByText("Визуальная демонстрация · не статус генерации"),
  ).toBeVisible();
  await app.settleScene(380);
  await page.screenshot({
    path: testInfo.outputPath("assembly-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#home");
  await expect(app.scene().locator("canvas")).toBeVisible();
  await app.settleScene();
  await page.screenshot({
    path: testInfo.outputPath("home-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("WebGL sleeps at rest and renders cursor and scroll changes with capped resolution", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const metrics = window as Window & { spatialDraws: number };
    metrics.spatialDraws = 0;
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const original = prototype.drawElements;
      prototype.drawElements = function (...args: Parameters<typeof original>) {
        metrics.spatialDraws++;
        return original.apply(this, args);
      };
    }
  });
  const app = new SpatialPage(page);
  await page.goto("/");
  await app.register();
  await expect(app.scene().locator("canvas")).toBeVisible();
  await app.settleScene(150);
  const draws = () =>
    page.evaluate(
      () => (window as Window & { spatialDraws: number }).spatialDraws,
    );
  const idle = await draws();
  expect(idle).toBeGreaterThan(0);
  await app.settleScene(35);
  expect(await draws()).toBe(idle);
  const bounds = await app.scene().boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width * 0.8,
    bounds!.y + bounds!.height * 0.35,
  );
  await expect.poll(draws).toBeGreaterThan(idle);
  await app.settleScene(130);
  const pointerDraws = await draws();
  await page.mouse.wheel(0, 380);
  await expect.poll(draws).toBeGreaterThan(pointerDraws);
  const ratio = await app
    .scene()
    .locator("canvas")
    .evaluate(
      (canvas) => (canvas as HTMLCanvasElement).width / canvas.clientWidth,
    );
  expect(ratio).toBeLessThanOrEqual(1.66);
});

test("hero orbit returns after scrolling away and keeps its visibility in every quality tier", async ({
  page,
}) => {
  const app = new SpatialPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await app.register();
  const scene = app.scene();
  const canvas = scene.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-orbit-visible", "true");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await app.settleScene(12);
  await page.evaluate(() => window.scrollTo(0, 0));
  await app.settleScene(20);
  await expect(canvas).toHaveAttribute("data-orbit-visible", "true");
  await expect(canvas).toHaveAttribute("data-quality", /^(high|medium|low)$/);
});
