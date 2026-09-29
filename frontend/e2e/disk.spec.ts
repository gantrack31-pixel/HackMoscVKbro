import { expect, test } from "@playwright/test";
import { DecklyPage } from "./pages";

test("Disk save requires connection and displays only confirmed provider receipt", async ({page}) => {
  let connected=false, saved=false;
  await page.route("**/api/disk/status",route=>route.fulfill({json:{configured:true,ready:connected,provider:"yandex_disk"}}));
  await page.route("**/api/disk/files",route=>route.fulfill({json:[]}));
  await page.route("**/api/projects/*/disk",route=> {
    saved=true;
    return route.fulfill({json:{name:"Test-deck.pptx",saved_at:"2026-09-29T12:00:00Z",provider:"yandex_disk"}});
  });
  const app=new DecklyPage(page);
  await page.goto("/"); await app.register(); await app.createPresentation();
  await page.getByRole("button",{name:"Завершить",exact:true}).click();
  await expect(page.getByRole("button",{name:"Подключить Яндекс.Диск",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Сохранить на Яндекс.Диск",exact:true})).toBeDisabled();
  expect(saved).toBe(false);
  connected=true;
  await page.getByRole("button",{name:"Проверить подключение снова"}).click();
  await page.getByRole("button",{name:"Сохранить на Яндекс.Диск",exact:true}).click();
  await expect(page.getByText("Сохранено на Яндекс.Диске",{exact:true})).toBeVisible();
  await expect(page.getByText(/Test-deck.pptx/)).toBeVisible();
  expect(saved).toBe(true);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
