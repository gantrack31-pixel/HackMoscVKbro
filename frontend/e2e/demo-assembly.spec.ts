import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

class DemoPage extends DecklyPage {
  scene = this.page.getByTestId("presentation-space");
  async open() {
    await this.page.goto("/");
    await this.register();
    await this.page.goto("/#demo");
    await expect(
      this.page.getByRole("heading", { name: "От идеи до последнего слайда" }),
    ).toBeVisible();
    await expect(this.scene).toBeVisible();
    await this.scene.scrollIntoViewIfNeeded();
  }
}

test("assembly has a composed static poster for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const app = new DemoPage(page);
  await app.open();
  await expect(app.scene.getByTestId("assembly-poster")).toBeVisible();
  await expect(app.scene.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Повторить сборку" }).click();
  await expect(app.scene.getByTestId("assembly-poster")).toBeVisible();
});

test("assembly stays usable after a desktop-to-mobile resize and WebGL loss", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = new DemoPage(page);
  await app.open();
  const canvas = app.scene.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await app.scene.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      canvas.evaluate((el: HTMLCanvasElement) =>
        Math.abs(el.clientWidth - el.parentElement!.clientWidth),
      ),
    )
    .toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await canvas.evaluate((el) =>
    el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(app.scene.getByTestId("assembly-poster")).toBeVisible();
  await expect(canvas).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("assembled slide keeps its blue artwork stable during the handoff", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const app = new DemoPage(page);
  await app.open();
  const canvas = app.scene.locator("canvas");
  await expect(canvas).toBeVisible();
  await page
    .getByRole("button", { name: "Повторить сборку" })
    .evaluate((button: HTMLButtonElement) => button.click());
  // Sample the real WebGL transition; GSAP lag smoothing makes a mocked clock unsuitable.
  await page.waitForTimeout(4250);
  const samples: number[][] = [];
  for (let frame = 0; frame < 13; frame++) {
    const png = await canvas.screenshot({
      path: testInfo.outputPath(`handoff-${frame}.png`),
    });
    samples.push(
      await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const surface = document.createElement("canvas");
        surface.width = image.width;
        surface.height = image.height;
        const context = surface.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return [
          ...context.getImageData(
            Math.floor(image.width * 0.6),
            Math.floor(image.height * 0.62),
            1,
            1,
          ).data,
        ];
      }, png.toString("base64")),
    );
    await page.waitForTimeout(16);
  }
  await testInfo.attach("blue samples", {
    body: JSON.stringify(samples),
    contentType: "application/json",
  });
  // The saturated blue area is stationary here; overlapping white card backs must not wash it out.
  expect(
    Math.max(...samples.map(([red]) => red)) -
      Math.min(...samples.map(([red]) => red)),
  ).toBeLessThan(15);
});
