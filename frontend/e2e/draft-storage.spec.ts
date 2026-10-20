import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("wizard autosave avoids a false storage warning when only one draft fits", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", error => consoleErrors.push(error.message));
  await page.goto("/");
  await new DecklyPage(page).register();
  await page.getByRole("button", { name: "Создать презентацию", exact: true }).click();
  const material = page.getByLabel("Опишите идею и добавьте материалы");
  const original = "Материал A. ".repeat(1_500);
  const edited = "Материал B. " + original.slice("Материал A. ".length);
  const recoveryPrompt = () => page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.includes(":wizard-draft:recovery:")) return JSON.parse(localStorage.getItem(key)!).value.prompt;
    }
    return null;
  });
  await material.fill(original);
  await expect.poll(recoveryPrompt).toBe(original);

  // Exhaust the real browser quota while retaining the wizard's own snapshot.
  await page.evaluate(() => {
    let index = 0;
    for (let size = 65_536; size >= 16; size = Math.floor(size / 2)) {
      while (true) {
        try { localStorage.setItem(`quota-fixture:${index}`, "x".repeat(size)); index++; }
        catch (error) {
          if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") throw error;
          break;
        }
      }
    }
  });
  await material.fill(edited);

  await expect.poll(recoveryPrompt).toBe(edited);
  await expect(page.locator(".error-banner")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);

  // Remove only test filler, then verify that recovery uses the edited snapshot.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("quota-fixture:")) localStorage.removeItem(key);
    sessionStorage.clear();
  });
  await page.reload();
  await expect(material).toHaveValue(edited);
});
