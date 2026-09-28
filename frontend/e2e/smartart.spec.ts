import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("diagram types survive save and source notices stay separate", async ({page}) => {
  await page.goto("/");
  const app=new DecklyPage(page); await app.register(); await app.createPresentation();
  await page.getByRole("combobox",{name:"Тип слайда",exact:true}).selectOption("diagram");
  await page.getByRole("textbox",{name:/Узлы схемы/}).fill("Исследование\nРазработка\nПроверка\nЗапуск");
  await page.getByRole("textbox",{name:"Основной текст"}).fill("Четыре этапа работы команды.");
  const type=page.getByRole("combobox",{name:/^Тип схемы/});
  for(const value of ["process","vertical","hierarchy","cycle","matrix","pyramid","honeycomb","comparison","kpi"]) {
    await type.selectOption(value);
    await expect(type).toHaveValue(value);
  }
  await type.selectOption("honeycomb");
  await page.getByRole("button",{name:"Сохранить изменения",exact:true}).click();
  await page.reload();
  await expect(type).toHaveValue("honeycomb");
  await expect(page.locator(".slide-canvas polygon")).toHaveCount(4);
  await page.screenshot({path:"test-results/smartart-editor.png",fullPage:true});
  await page.getByRole("button",{name:"Проверить",exact:true}).click();
  await expect(page.locator(".audit-summary")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Повторить проверку",exact:true})).toHaveCount(0);
  await expect(page.locator(".audit-issue.info")).toHaveCount(0);
  await page.screenshot({path:"test-results/smartart-audit.png",fullPage:true});
});
