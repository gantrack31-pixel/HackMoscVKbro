import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { DecklyPage } from "./pages";

for (const background of ["FFFFFF", "151515"]) {
  test(`unknown ${background} template survives UI theme changes and preview failure`, async ({page}) => {
    const app=new DecklyPage(page);
    await page.goto("/"); await app.register();
    const python=process.env.DECKLY_TEST_PYTHON || resolve("../backend/.venv",process.platform==="win32"?"Scripts/python.exe":"bin/python");
    const buffer=execFileSync(python,["-c",`from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches
from io import BytesIO
import sys
p=Presentation();s=p.slides.add_slide(p.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=RGBColor.from_string('${background}')
s.shapes.add_textbox(Inches(1),Inches(1),Inches(8),Inches(1)).text='Title'
s.shapes.add_textbox(Inches(1),Inches(2.5),Inches(8),Inches(3)).text='Body'
b=BytesIO();p.save(b);sys.stdout.buffer.write(b.getvalue())`]);
    const auth=await (await page.request.get("/api/auth/me")).json();
    const name=`Unknown ${background}`;
    const upload=await page.request.post("/api/templates",{headers:{"X-CSRF-Token":auth.csrf},multipart:{file:{name:name+".pptx",mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation",buffer}}});
    expect(upload.status()).toBe(201);
    const template=await upload.json();
    await page.route(`**/api/templates/${template.id}/thumbnail?*`,route=>route.fulfill({status:404,body:""}));
    await page.reload();
    await app.createPresentation(name,async()=>{
      await expect(page.locator(".outline-summary").getByText("Новый шаблон",{exact:true})).toBeVisible();
      await expect(page.getByText("Предпросмотр первого слайда недоступен")).toHaveCount(0);
    });
    const slide=page.locator(".slide-canvas .deck-slide");
    await expect(slide.locator("rect").first()).toHaveAttribute("fill","#"+background);
    const colors=()=>slide.locator("rect,text,line,image").evaluateAll(nodes=>nodes.map(n=>({fill:getComputedStyle(n).fill,stroke:getComputedStyle(n).stroke,href:n.getAttribute("href")})));
    const before=await colors();
    await page.getByRole("button",{name:"Включить тёмную тему"}).click();
    expect(await colors()).toEqual(before);
    await page.getByRole("button",{name:"Включить светлую тему"}).click();
    expect(await colors()).toEqual(before);
    // A working real image is retained, not replaced globally with placeholders.
    await page.unroute(`**/api/templates/${template.id}/thumbnail?*`);
    const response=await page.request.get(template.preview_url);
    expect(response.ok()).toBe(true);
    await page.goto("/#templates");
    await expect(page.getByAltText(`Первый слайд: ${name}`)).toBeVisible();
    await expect.poll(()=>page.getByAltText(`Первый слайд: ${name}`).evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  });
}
