import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

for (const path of ["/login", "/register"]) {
  test(`auth theme persists on ${path} and synchronizes tabs`, async ({ page, context }) => {
    await page.goto(path);
    await expect(page.getByRole("button", { name: path === "/login" ? "Войти" : "Зарегистрироваться", exact: true })).toBeVisible();
    await expect(page.locator(".auth-left")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Включить тёмную тему" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".auth-left")).toHaveCSS("background-color", "rgb(20, 30, 48)");
    await expect(page.locator(".auth-logo")).toHaveCSS("color", "rgb(237, 243, 255)");
    await page.screenshot({path:`test-results/theme-${path.slice(1)}-dark.png`});
    const second = await context.newPage();
    await second.goto(path);
    await second.getByRole("button", { name: "Включить светлую тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator(".auth-left")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(page.locator(".auth-logo")).toHaveCSS("color", "rgb(15, 23, 42)");
    await page.screenshot({path:`test-results/theme-${path.slice(1)}.png`});
  });
}

test("history boundaries, unified audit and matching action dimensions", async ({ page }) => {
  await page.goto("/");
  const app = new DecklyPage(page); await app.register(); await app.createPresentation();
  const undo = page.getByRole("button", {name:"Отменить изменение",exact:true});
  const redo = page.getByRole("button", {name:"Повторить изменение",exact:true});
  // The wizard records the selected variant as the first revision.
  await expect(redo).toBeDisabled();
  await undo.click(); await expect(undo).toBeDisabled();
  await redo.click(); await expect(redo).toBeDisabled();
  const check = await page.getByRole("button", {name:"Проверить",exact:true}).boundingBox();
  const finish = await page.getByRole("button", {name:"Завершить",exact:true}).boundingBox();
  expect(check!.width).toBe(finish!.width); expect(check!.height).toBe(finish!.height);
  const text=page.getByRole("textbox", {name:"Основной текст"});
  await text.fill("Сохранённая правка");
  await page.getByRole("button", {name:"Сохранить изменения",exact:true}).click();
  await undo.click(); await expect(redo).toBeEnabled();
  await redo.click(); await expect(text).toHaveValue("Сохранённая правка");
  await expect(redo).toBeDisabled();
  await undo.click(); await text.fill("Новая ветка");
  await page.getByRole("button", {name:"Сохранить изменения",exact:true}).click();
  await expect(redo).toBeDisabled();
  await page.getByRole("button", {name:"Проверить",exact:true}).click();
  await expect(page.getByRole("button", {name:"Проверить смысл с LLM"})).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Повторить проверку",exact:true})).toBeEnabled();
  await page.screenshot({path:"test-results/unified-audit.png",fullPage:true});
});
