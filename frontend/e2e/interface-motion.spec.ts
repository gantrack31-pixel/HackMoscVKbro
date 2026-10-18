import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

class MotionPage extends DecklyPage {
  gallery = this.page.getByRole("region", {
    name: "Пространственная подборка шаблонов",
  });
  async openCatalog() {
    await this.page.goto("/");
    await this.register();
    await this.page.getByRole("link", { name: "Шаблоны", exact: true }).click();
    await expect(this.gallery).toBeVisible();
  }
  cover() {
    return this.gallery.locator(".is-active .gallery-cover");
  }
}

test("preview cover travels back to its card and restores focus", async ({
  page,
}) => {
  const app = new MotionPage(page);
  await app.openCatalog();
  const cover = app.cover();
  await cover.click();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(1);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await dialog.locator("summary").first().click();
  await expect(dialog.locator("details").first()).toHaveAttribute("open", "");
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await expect(cover).toBeFocused();
  await expect(cover.locator(":scope > :first-child")).toBeVisible();
});

test("return flight hides the stationary preview shell on a scrolled catalog", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 850 });
  const app = new MotionPage(page);
  await app.openCatalog();
  await app.gallery.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await app.cover().click();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  const image = page.locator("[data-preview-cover] img");
  if (await image.count()) {
    await expect
      .poll(
        () =>
          image.evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  }
  const duringReturn = await page.locator("dialog[open]").evaluate((dialog) => {
    const artwork = dialog
      .querySelector<HTMLElement>("[data-preview-cover]")!
      .getBoundingClientRect();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    const clone = dialog.querySelector<HTMLElement>("[data-shared-cover]")!;
    const bounds = clone.getBoundingClientRect();
    return {
      shellBackground: getComputedStyle(dialog).backgroundColor,
      shellShadow: getComputedStyle(dialog).boxShadow,
      backdropVisibility: getComputedStyle(dialog, "::backdrop").visibility,
      headingVisibility: getComputedStyle(
        dialog.querySelector(".modal-heading")!,
      ).visibility,
      cloneVisibility: getComputedStyle(clone).visibility,
      overflow: getComputedStyle(dialog).overflow,
      startDelta:
        Math.abs(bounds.x - artwork.x) + Math.abs(bounds.y - artwork.y),
    };
  });
  await page.screenshot({ path: testInfo.outputPath("return-flight.png") });
  expect(duringReturn).toMatchObject({
    shellBackground: "rgba(0, 0, 0, 0)",
    shellShadow: "none",
    backdropVisibility: "visible",
    headingVisibility: "hidden",
    cloneVisibility: "visible",
    overflow: "visible",
  });
  expect(duringReturn.startDelta).toBeLessThan(2);
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await expect(app.cover()).toBeFocused();
});

test("return handoff closes the native dialog before revealing the deck card", async ({
  page,
}) => {
  const app = new MotionPage(page);
  await app.openCatalog();
  await app.cover().click();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await page.getByRole("dialog").evaluate((dialog) => {
    const state = window as typeof window & {
      returnHandoff?: Promise<{
        open: boolean;
        originHidden: boolean;
        scrollLocked: boolean;
      }>;
    };
    state.returnHandoff = new Promise((resolve) => {
      const observer = new MutationObserver((records) => {
        if (
          !records.some((record) =>
            [...record.removedNodes].some(
              (node) =>
                node instanceof HTMLElement &&
                node.hasAttribute("data-shared-cover"),
            ),
          )
        )
          return;
        observer.disconnect();
        const origin = document.querySelector<HTMLElement>(
          ".spatial-gallery .is-active .gallery-cover > :first-child",
        );
        resolve({
          open: (dialog as HTMLDialogElement).open,
          originHidden: origin?.style.visibility === "hidden",
          scrollLocked: document.body.style.overflow === "hidden",
        });
      });
      observer.observe(dialog, { childList: true });
    });
  });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  const handoff = await page.evaluate(
    () =>
      (
        window as typeof window & {
          returnHandoff: Promise<{
            open: boolean;
            originHidden: boolean;
            scrollLocked: boolean;
          }>;
        }
      ).returnHandoff,
  );
  expect(handoff).toEqual({
    open: false,
    originHidden: false,
    scrollLocked: false,
  });
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(app.cover()).toBeFocused();
});

test("template covers stay still on hover and reduced motion skips shared cover motion", async ({
  page,
}) => {
  const app = new MotionPage(page);
  await app.openCatalog();
  await expect(app.cover()).toHaveCSS("transform", "none");
  await app.cover().hover({ position: { x: 20, y: 20 } });
  await expect(app.cover()).toHaveCSS("transform", "none");
  await expect(page.locator(".template-glare")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(app.cover()).toHaveCSS("transform", "none");
  await app.cover().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(app.cover()).toBeFocused();
});

test("variant depth and slide changes preserve editing and keyboard navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const app = new DecklyPage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await app.register();
  await app.createPresentation("VK Education", undefined, async () => {
    const selected = page.locator(".variant-card.selected");
    await expect(selected).not.toHaveCSS("transform", "none");
    await page
      .getByRole("button", { name: "Выбрать минималистичный вариант" })
      .click();
    await expect(page.locator(".variant-card.selected h3")).toHaveText(
      "Минималистичный",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".variant-card.selected")).toHaveCSS(
      "transform",
      "none",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  const slide = page.locator(".slide-canvas .deck-slide");
  await page.locator(".slide-rail .thumbnail").nth(1).click();
  await expect(slide).not.toHaveCSS("transform", "none");
  await expect(slide).toHaveCSS("transform", "none");
  await page
    .getByLabel("Заголовок", { exact: true })
    .fill("Текст остаётся неподвижным");
  await expect(slide).toHaveCSS("transform", "none");
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(page.locator(".editor-save-status")).toHaveAttribute(
    "data-save-state",
    "saved",
  );
  await page.getByRole("button", { name: "Смотреть", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".presentation-viewer-slide")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rapid preview cancellation and keyboard disclosures leave no hidden content", async ({
  page,
}) => {
  const app = new MotionPage(page);
  await app.openCatalog();
  const jumps: number[] = [];
  for (let i = 0; i < 2; i++) {
    await app.cover().click();
    // Read both positions in one task; the transient copy may finish between protocol calls.
    const jump = await page.evaluate(() => {
      const before = document
        .querySelector("[data-shared-cover]")
        ?.getBoundingClientRect();
      document
        .querySelector("dialog")
        ?.dispatchEvent(new Event("cancel", { cancelable: true }));
      const after = document
        .querySelector("[data-shared-cover]")
        ?.getBoundingClientRect();
      return before && after ? Math.abs(before.y - after.y) : null;
    });
    if (jump !== null) jumps.push(jump);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(app.cover().locator(":scope > :first-child")).toBeVisible();
  }
  expect(jumps.length).toBeGreaterThan(0);
  expect(Math.max(...jumps)).toBeLessThan(2);
  await app.cover().click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  const summary = page.getByRole("dialog").locator("summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog").locator("details").first();
  await expect(details).toHaveAttribute("open", "");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect
    .poll(() => details.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  expect(await details.evaluate((el) => el.style.height)).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(
    await page.locator("body").evaluate((el) => el.style.overflow),
  ).not.toBe("hidden");
});

test("mobile preview returns to its card without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const app = new MotionPage(page);
  await app.openCatalog();
  await app.cover().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  const artwork = page.locator("[data-preview-cover]");
  await expect(artwork).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(app.cover()).toBeFocused();
});
