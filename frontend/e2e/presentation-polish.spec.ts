import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("themes, narrow outline, aligned actions and enlarged audit", async ({page}) => {
  const name="Мой_Портфель_презентация_фон_сохранён";
  await page.route("**/api/templates",async route=>{
    const response=await route.fetch();
    const templates=await response.json();
    await route.fulfill({json:templates.map((t:any)=>t.id==="education"?{...t,name}:t)});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/");
  const app=new DecklyPage(page); await app.register();
  await page.getByRole("tab",{name:"Быстрый старт",exact:true}).click();
  const active=page.locator(".home-tabs button.active");
  await expect(active.locator(".icon")).toHaveCSS("color","rgb(255, 255, 255)");
  await page.getByRole("button",{name:"Включить тёмную тему"}).click();
  await expect(active.locator(".icon")).toHaveCSS("color","rgb(255, 255, 255)");
  await app.createPresentation(name, async()=>{
    for(const width of [1440,1100,768,390]) {
      await page.setViewportSize({width,height:1000});
      const panel=page.locator(".outline-summary");
      const box=await panel.boundingBox();
      expect(box).not.toBeNull();
      for(const child of await panel.locator(":scope > *").all()) {
        const item=await child.boundingBox();
        if(item) expect(item.x+item.width).toBeLessThanOrEqual(box!.x+box!.width+1);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:"test-results/polish-outline-dark.png",fullPage:true,animations:"disabled"});
  });
  const title=await page.getByLabel("Название презентации").boundingBox();
  for(const label of ["Проверить","Завершить"]) {
    const box=await page.getByRole("button",{name:label,exact:true}).boundingBox();
    expect(Math.abs(box!.y-title!.y)).toBeLessThan(2);
    expect(Math.abs(box!.height-title!.height)).toBeLessThan(2);
  }
  await page.getByRole("combobox",{name:"Тип слайда",exact:true}).selectOption("icons");
  await page.getByRole("textbox",{name:/Подписи пиктограмм/}).fill("Гигиена рук\nОбучение команды\nПроверка качества");
  await page.getByRole("textbox",{name:"Основной текст"}).fill("");
  await page.getByRole("combobox",{name:"Иконка для тезиса 1"}).selectOption("heart");
  await page.getByRole("button",{name:"Сохранить изменения",exact:true}).click();
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Иконка для тезиса 1"})).toHaveValue("heart");
  await expect(page.locator(".slide-canvas image")).toHaveCount(3);
  await page.getByRole("button",{name:"Проверить",exact:true}).click();
  await expect(page.locator(".audit-summary")).toHaveCount(0);
  const canvas=await page.locator(".audit-slide-wrap").boundingBox();
  expect(canvas!.width).toBeGreaterThan(850);
  const assistant=await page.getByRole("region",{name:"AI-помощник",exact:true}).boundingBox();
  expect(assistant!.height).toBeLessThan(255);
  await page.screenshot({path:"test-results/polish-audit-dark.png",fullPage:true,animations:"disabled"});
  await page.getByRole("button",{name:"Включить светлую тему"}).click();
  await expect(page.locator("body")).toHaveCSS("background-color","rgb(248, 250, 252)");
  await page.screenshot({path:"test-results/polish-audit-light.png",fullPage:true,animations:"disabled"});
  for(const width of [768,390]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  }
});
