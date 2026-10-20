import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DecklyPage } from "./pages";

test("uploaded brand font loads in the browser and SVG logo appears on the slide", async ({ page }) => {
  const root = resolve(import.meta.dirname, "../..");
  const python = process.env.DECKLY_TEST_PYTHON || resolve(root, "backend/.venv", ...(process.platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]));
  const buffer = execFileSync(python, ["-B", "-c", `
import json,sys
sys.path.insert(0,'tests')
from test_brand_assets import editable_font,package,SVG,FAMILY
sys.stdout.buffer.write(package([('style.json',json.dumps({'typography':{'heading':FAMILY,'body':FAMILY}}).encode()),('Regular.ttf',editable_font('Vera.ttf')),('Bold.ttf',editable_font('VeraBd.ttf')),('logo.svg',SVG)]))
`], { cwd: resolve(root, "backend"), env: { ...process.env, PYTHON_DOTENV_DISABLED: "1", PYTHONDONTWRITEBYTECODE: "1" } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await new DecklyPage(page).register();
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
  await page.locator('.brand-panel input[type="file"]').setInputFiles({ name: "brand.zip", mimeType: "application/zip", buffer });
  await expect(page.locator(".brand-receipt")).toContainText("Bitstream Vera Sans");
  const brand = await page.locator(".brand-panel select").inputValue();
  const session = await (await page.request.get("/api/auth/me")).json();
  const response = await page.request.post("/api/generate", {
    headers: { "X-CSRF-Token": session.csrf },
    data: { template_id: "tech", content: { title: "Brand example", brand_style_id: brand,
      slides: [{ title: "Brand title", body: "Measured English body text" }] } },
  });
  expect(response.status()).toBe(202);
  const { job_id } = await response.json();
  const job = () => page.request.get(`/api/jobs/${job_id}`).then(r => r.json());
  await expect.poll(async () => (await job()).state).toBe("complete");
  const project = (await job()).project_id;
  await page.evaluate(({ account, project }) => localStorage.setItem(`deckly:${encodeURIComponent(account)}:active-project`, JSON.stringify(project)), { account: session.user.id, project });
  await page.goto("/#editor");
  await page.reload();
  const editor = page.getByRole("region", { name: "Редактор презентации", exact: true });
  await expect(editor).toBeVisible();
  const title = editor.locator(".deck-slide text").filter({ hasText: "Brand title" }).first();
  await expect(title).toHaveAttribute("font-family", /^DecklyBrand/);
  const family = await title.getAttribute("font-family");
  const loaded = await page.evaluate(async family => {
    const faces = await document.fonts.load(`700 32px "${family}"`, "Brand title");
    return faces.length > 0 && faces.every(face => face.status === "loaded");
  }, family);
  expect(loaded).toBe(true);
  await expect(editor.locator('.deck-slide image[href^="data:image/png"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});
