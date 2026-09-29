import { expect, test, type Page, type Route } from "@playwright/test";
import { DecklyPage } from "./pages";

// Hold a direct inference response; cancellation still goes to the real owner-scoped API.
async function holdDirect(page:Page, pattern:string) {
  let id="";let release:()=>void=()=>{};
  await page.route(pattern,async route=>{
    id=route.request().headers()["x-ai-operation-id"];
    await new Promise<void>(resolve=>{release=resolve;});
    await route.abort().catch(()=>{});
  });
  return {id:()=>id,release:()=>release()};
}

async function confirmStop(page:Page,id:()=>string) {
  await expect.poll(id).not.toBe("");
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const cancel=async(route:Route)=>{await gate;await route.continue();};
  await page.route("**/api/jobs/*/cancel",cancel);
  await page.getByRole("button",{name:"Стоп",exact:true}).click();
  await expect(page.getByText("Останавливаем…",{exact:true})).toBeVisible();
  release();
  await expect(page.getByText("Остановлено",{exact:true}).last()).toBeVisible();
  expect((await (await page.request.get(`/api/jobs/${id()}`)).json()).state).toBe("cancelled");
  await page.unroute("**/api/jobs/*/cancel",cancel);
}

test("outline Stop is confirmed by the backend and keeps the material",async({page})=>{
  await page.goto("/");const app=new DecklyPage(page);await app.register();
  await page.getByRole("button",{name:"Создать презентацию",exact:true}).click();
  const material=page.getByLabel("Опишите идею и добавьте материалы");
  await material.fill("Материал, который нельзя потерять при отмене.");
  const held=await holdDirect(page,"**/api/outline");
  await page.getByRole("button",{name:"Создать структуру",exact:true}).click();
  await confirmStop(page,held.id);held.release();
  await expect(material).toHaveValue("Материал, который нельзя потерять при отмене.");
  await expect(page.getByRole("button",{name:"Создать структуру",exact:true})).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("assistant and image Stop retain unsaved edits",async({page})=>{
  await page.route("**/api/health",async route=>{
    const response=await route.fetch();
    await route.fulfill({json:{...await response.json(),mode:"live",llm_configured:true,image_generation:true}});
  });
  await page.goto("/");const app=new DecklyPage(page);await app.register();await app.createPresentation();
  const text=page.getByRole("textbox",{name:"Основной текст"});
  await text.fill("Моя несохранённая правка.");
  const assistant=await holdDirect(page,"**/api/projects/*/assistant");
  await page.getByLabel("Что изменить с помощью AI?").fill("Сократи текст");
  await page.getByRole("button",{name:"Применить запрос AI",exact:true}).click();
  await confirmStop(page,assistant.id);assistant.release();
  await expect(text).toHaveValue("Моя несохранённая правка.");
  await page.getByRole("combobox",{name:"Тип слайда",exact:true}).selectOption("image");
  await page.getByLabel("Описание иллюстрации").fill("Светлая мастерская");
  const image=await holdDirect(page,"**/api/images/generate");
  await page.getByRole("button",{name:"Создать иллюстрацию",exact:true}).click();
  await expect(page.getByRole("button",{name:"Применить запрос AI",exact:true})).toBeDisabled();
  await confirmStop(page,image.id);image.release();
  await expect(text).toHaveValue("Моя несохранённая правка.");
  await expect(page.getByRole("button",{name:"Создать иллюстрацию",exact:true})).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("wizard cancels queued builds and keeps the previous variants on regeneration",async({page})=>{
  let jobId="";
  const queued=async(route:Route)=>{
    const reserved=await page.request.post("/api/ai/operations",{headers:route.request().headers()});
    const result=await reserved.json();jobId=result.job_id;
    await route.fulfill({status:202,json:result});
  };
  await page.goto("/");const app=new DecklyPage(page);await app.register();
  await page.getByRole("button",{name:"Создать презентацию",exact:true}).click();
  await page.getByLabel("Опишите идею и добавьте материалы").fill("План развития команды и обучения.");
  await page.getByRole("button",{name:"Создать структуру",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Сначала — история"})).toBeVisible();
  await page.route("**/api/generate",queued);
  await page.getByRole("button",{name:"Создать презентацию",exact:true}).click();
  await confirmStop(page,()=>jobId);
  await expect(page.getByRole("heading",{name:"Сначала — история"})).toBeVisible();
  await page.unroute("**/api/generate",queued);
  await page.getByRole("button",{name:"Создать презентацию",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Одна история. Три способа рассказать."})).toBeVisible();
  const before=await (await page.request.get('/api/projects')).json();
  jobId="";await page.route("**/api/projects/*/regenerate",queued);
  await page.getByPlaceholder("Например: больше воздуха, крупнее заголовки, выразительнее акценты").fill("Больше воздуха");
  await page.getByRole("button",{name:"Новые композиции",exact:true}).click();
  await confirmStop(page,()=>jobId);
  await expect(page.getByRole("button",{name:"Открыть презентацию",exact:true})).toBeEnabled();
  expect(await (await page.request.get('/api/projects')).json()).toEqual(before);
  await expect(page.getByRole("button",{name:"Выбрать акцентный вариант"})).toBeVisible();
});
