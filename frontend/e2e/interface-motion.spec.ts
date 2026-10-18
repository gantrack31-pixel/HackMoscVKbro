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
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await expect(cover).toBeFocused();
  await expect(cover.locator(":scope > :first-child")).toBeVisible();
});

test("switching to reduced motion cancels tilt and shared cover motion", async ({
  page,
}) => {
  const app = new MotionPage(page);
  await app.openCatalog();
  await app.cover().hover({ position: { x: 20, y: 20 } });
  await expect(app.cover().locator(".template-glare")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(app.cover()).toHaveCSS("transform", "none");
  await expect(app.cover().locator(".template-glare")).toBeHidden();
  await app.cover().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("[data-shared-cover]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
    await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(app.cover()).toBeFocused();
});
