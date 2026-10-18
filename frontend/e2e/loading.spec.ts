import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("navigation intent loads the page code without fetching its data", async ({
  page,
}) => {
  const app = new DecklyPage(page);
  const recent = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/projects",
  );
  await page.goto("/");
  await app.register();
  await recent;
  let pageModules = 0;
  let dataRequests = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      /\/(?:src\/pages\/Projects\.tsx|assets\/Projects-[^/]+\.js)$/.test(path)
    )
      pageModules++;
    if (path === "/api/projects") dataRequests++;
  });

  const projects = page.getByRole("link", {
    name: "Мои презентации",
    exact: true,
  });
  await projects.focus();

  await expect.poll(() => pageModules).toBe(1);
  expect(dataRequests).toBe(0);
  await projects.click();
  await expect(
    page.getByRole("heading", { name: "Мои презентации", exact: true }),
  ).toBeVisible();
  await expect.poll(() => dataRequests).toBe(1);
  expect(pageModules).toBe(1);
});

test("data saver suppresses speculative page downloads", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    }),
  );
  const app = new DecklyPage(page);
  await page.goto("/");
  await app.register();
  const modules: string[] = [];
  page.on("request", (request) => {
    if (
      /\/(?:src\/pages\/Projects\.tsx|assets\/Projects-[^/]+\.js)$/.test(
        new URL(request.url()).pathname,
      )
    )
      modules.push(request.url());
  });

  const projects = page.getByRole("link", {
    name: "Мои презентации",
    exact: true,
  });
  await projects.focus();
  await projects.hover();
  await page.evaluate(() => new Promise(requestAnimationFrame));

  expect(modules).toEqual([]);
  await projects.click();
  await expect(
    page.getByRole("heading", { name: "Мои презентации", exact: true }),
  ).toBeVisible();
});

test("replaying the assembly retains its canvas and GPU textures", async ({
  page,
}) => {
  const app = new DecklyPage(page);
  await page.addInitScript(() => {
    const metrics = window as Window & {
      createdTextures: number;
      spatialDraws: number;
    };
    metrics.createdTextures = 0;
    metrics.spatialDraws = 0;
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const draw = prototype.drawElements;
      prototype.drawElements = function (...args: Parameters<typeof draw>) {
        metrics.spatialDraws++;
        return draw.apply(this, args);
      };
      const original = prototype.createTexture;
      prototype.createTexture = function () {
        metrics.createdTextures++;
        return original.call(this);
      };
    }
  });
  await page.goto("/");
  await app.register();
  await page.goto("/#demo");
  const canvas = page.getByTestId("presentation-space").locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  });
  await page
    .getByRole("button", { name: "Повторить сборку", exact: true })
    .hover();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const metrics = window as Window & { spatialDraws: number };
        const before = metrics.spatialDraws;
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        return before === metrics.spatialDraws;
      }),
    )
    .toBe(true);
  const settledFrame = await canvas.screenshot();
  const handle = await canvas.elementHandle();
  const textures = await page.evaluate(
    () => (window as Window & { createdTextures: number }).createdTextures,
  );

  await page
    .getByRole("button", { name: "Повторить сборку", exact: true })
    .click();

  expect(await handle!.evaluate((element) => element.isConnected)).toBe(true);
  expect(
    await page.evaluate(
      () => (window as Window & { createdTextures: number }).createdTextures,
    ),
  ).toBe(textures);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(settledFrame))
    .toBe(false);
});

test("in-flight thumbnails are shared across HTML and WebGL", async ({
  page,
}) => {
  test.skip(
    !process.env.DECKLY_E2E_BASE_URL,
    "Uses the Docker fixture with real PPTX thumbnails.",
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Keep the first image pending: completed no-cache images may legitimately revalidate.
  await page.route("**/api/templates/*/thumbnail?*", async (route) => {
    await pending;
    await route.continue();
  });
  const registered = await page.request.post("/api/auth/register", {
    data: {
      email: `images-${Date.now()}@example.test`,
      password: "Thumbnail-Test-1947!",
      first_name: "Images",
      last_name: "Test",
    },
  });
  expect(registered.status()).toBe(201);
  const requests = new Map<string, number>();
  page.on("request", (request) => {
    if (/\/api\/templates\/[^/]+\/thumbnail\?/.test(request.url())) {
      requests.set(request.url(), (requests.get(request.url()) || 0) + 1);
    }
  });
  try {
    await page.goto("/#home");
    await expect(
      page.locator(".presentation-space.is-ready canvas"),
    ).toBeVisible();
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    });
    expect(requests.size).toBeGreaterThan(0);
    expect([...requests.values()]).toEqual([...requests.values()].map(() => 1));
  } finally {
    release();
  }
  await page.waitForLoadState("networkidle");
});
