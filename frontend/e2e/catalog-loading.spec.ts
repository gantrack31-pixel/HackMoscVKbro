import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

class CatalogLoadingPage extends DecklyPage {
  async openPreview() {
    await this.page.getByRole("link", { name: "Шаблоны", exact: true }).click();
    await this.page
      .getByRole("region", { name: "Пространственная подборка шаблонов" })
      .locator(".is-active .gallery-cover")
      .click();
    await expect(this.page.getByRole("dialog")).toBeVisible();
  }
}

test("light catalog keeps real covers and loads passport images only when opened", async ({
  page,
}) => {
  test.skip(
    !process.env.DECKLY_E2E_BASE_URL,
    "Production fixture supplies the original PPTX artwork.",
  );
  const errors: string[] = [];
  const imageRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/api\/templates\/[^/]+\/assets\//.test(request.url()))
      imageRequests.push(request.url());
  });
  const catalog = await page.request.get("/api/public/templates?summary=true");
  expect(catalog.ok()).toBe(true);
  const templates = await catalog.json();
  const template = templates.find(
    (item: { metadata: { source: string } }) => item.metadata.source === "pptx",
  );
  expect(template).toBeTruthy();
  expect(template.metadata.manifest).toBeUndefined();
  expect(template.metadata.package).toBeUndefined();
  expect(
    template.metadata.assets.some((asset: { data: string }) =>
      asset.data.startsWith("/api/templates/"),
    ),
  ).toBe(true);
  const cover = await page.request.get(template.preview_url);
  expect(cover.ok()).toBe(true);
  expect(cover.headers()["content-type"]).toBe("image/webp");
  const app = new CatalogLoadingPage(page);
  await page.goto("/");
  await app.register();
  await app.openPreview();
  expect(imageRequests).toEqual([]);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Правила и токены шаблона", { exact: true }).click();
  const image = dialog.locator(".template-assets img").first();
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      image.evaluate(
        (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(imageRequests.length).toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
