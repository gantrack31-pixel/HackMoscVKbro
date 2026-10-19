import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {startBridge} from './bridge.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\\/g,'/').replace(/\/$/,'');
const require=createRequire(root+'/frontend/package.json');const {chromium,expect}=require('@playwright/test');
const dir=root+'/examples/outputs/acceptance';mkdirSync(dir,{recursive:true});
const bridge=await startBridge();const browser=await chromium.launch();
const context=await browser.newContext({baseURL:process.env.DECKLY_QA_STATIC_URL || 'http://127.0.0.1:8003',viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(25000);const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));await bridge.attach(page);
await page.addInitScript(()=>localStorage.setItem('deckly-theme','light'));
const started=Date.now(); const durations={exports:{}}; async function shot(options){await page.evaluate(()=>{const c=document.getElementById("qa-caption");if(c)c.style.visibility="hidden";});await page.screenshot(options);await page.evaluate(()=>{const c=document.getElementById("qa-caption");if(c)c.style.visibility="visible";});}
async function caption(text){await page.evaluate(text=>{let label=document.getElementById('qa-caption');if(!label){label=document.createElement('div');label.id='qa-caption';label.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:1000px;width:max-content;background:#10213ded;color:white;border:1px solid #326ab0;border-radius:16px;padding:14px 22px;z-index:999999;font:600 15px/1.5 Manrope,Arial;box-shadow:0 5px 25px #0003;pointer-events:none;';document.body.append(label);}label.textContent=text;},text);}
await page.goto('/#templates');await page.locator('input[accept=".pptx"]').waitFor({state:'attached'});await caption('Проверка текущей локальной версии · синтетические данные · реальный деморежим');
await page.locator('input[accept=".pptx"]').setInputFiles(root+'/examples/brands/sample-slide.pptx');
await page.getByRole('button',{name:'Выбрать вариант',exact:true}).click();await expect(page.locator('.wizard-modern')).toBeVisible();checks.push('Uploaded a new PPTX template through actual authenticated API');
await caption('Шаблон задаёт основу. Брендбук уточняет палитру, типографику и правила логотипа.');
await page.locator('.brand-panel input[type=file]').setInputFiles(root+'/examples/brands/north-brand-package.zip');await expect(page.locator('.brand-receipt')).toBeVisible();await page.locator('.brand-panel').scrollIntoViewIfNeeded();await shot({path:dir+'/brand-preview.png'});await page.waitForTimeout(5000);checks.push('Uploaded real brand package; effective style and conflicts shown');
const panel=page.locator('.analysis-panel');
for(const [file,intent,explanation] of [
 ['01_synthetic_trend.csv','Показать рост выручки','Временная ось → линейный график. Рост вычисляется по первой и последней точке; причины не выдумываются.'],
 ['02_synthetic_comparison.csv','Сравнить регионы по выручке','Категории → сравнение столбцами. Одинаковые единицы измерения, вывод на основе максимального значения.'],
 ['03_synthetic_shares.csv','Показать структуру долей','Части общего итога → круговая диаграмма. Знаменатель и доли проверяются по исходным числам.']]){
 await panel.getByLabel('Какой вопрос нужно раскрыть?').fill(intent);
 await panel.locator('input[type=file]').setInputFiles(root+'/examples/analytics/'+file);
 await expect(panel.getByRole('heading',{name:file,exact:true})).toBeVisible();
 await caption(explanation);await panel.getByRole('button',{name:'Проверить и подготовить слайды',exact:true}).click();
 await expect(panel.locator('.analysis-plan')).toBeVisible();await panel.locator('.analysis-plan').scrollIntoViewIfNeeded();await shot({path:dir+'/'+file.replace('.csv','')+'.png'});await page.waitForTimeout(6500);
}
checks.push('Uploaded 3 dataset types and reviewed real deterministic previews');
await caption('Собираем общий план: три разных вопроса, проверяемые выводы, единое оформление.');
await page.getByRole('button',{name:'Создать структуру',exact:true}).click();await expect(page.locator('.outline-item')).toHaveCount(3);await shot({path:dir+'/approved-outline.png'});
const generationStart=Date.now(); await page.getByRole('button',{name:'Создать презентацию',exact:true}).click();await expect(page.getByRole('button',{name:'Открыть презентацию',exact:true})).toBeVisible();durations.generationSeconds=(Date.now()-generationStart)/1000;checks.push('Real job created all 3 presentation variants');
await caption('Три композиции сохраняют одни и те же факты. Открываем результат в редакторе.');await shot({path:dir+'/generation-result.png'});await page.waitForTimeout(5000);
await page.getByRole('button',{name:'Открыть презентацию',exact:true}).click();await expect(page.locator('.editor-page')).toBeVisible();
for(let index=0;index<3;index++){await page.locator('.thumbnail').nth(index).click();await page.locator('.slide-canvas').scrollIntoViewIfNeeded();await caption(['Динамика: выручка выросла на 23%. База сравнения и даты сохранены.','Сравнение регионов: лидер определяется из таблицы, значения не заменены моделью.','Доли: все части и общий итог сохранены. Исходные данные доступны для проверки.'][index]);await shot({path:dir+`/editor-slide-${index+1}.png`});await page.waitForTimeout(6500);}
await page.getByRole('button',{name:'Проверить',exact:true}).click();await expect(page.locator('.audit-page')).toBeVisible();await caption('Проверка использует ту же геометрию, что предпросмотр и экспорт. Замечания можно изучить до скачивания.');await shot({path:dir+'/audit.png'});await page.waitForTimeout(5000);checks.push('Actual editor and audit received generated analytical content');
await page.goto('/#finish');await expect(page.getByRole('heading',{name:'Ваша история готова к выходу'})).toBeVisible();await caption('Скачиваем редактируемый PowerPoint, PDF и автономный HTML текущей сохранённой версии.');
await page.getByRole('button',{name:/На устройство|Скачать файл|Скачать на/}).first().click().catch(async()=>{await page.locator('.save-method').last().click();});
for(const format of ['pptx','pdf','html']){const exportStart=Date.now();const download=page.waitForEvent('download');await page.locator('.export-option').filter({has:page.locator('.format-'+format)}).click();const file=await download;await file.saveAs(dir+'/deckly-demo.'+format);durations.exports[format]=(Date.now()-exportStart)/1000;}
checks.push('Actual version-bound PPTX/PDF/HTML exports downloaded');await shot({path:dir+'/export.png'});await page.waitForTimeout(5000);
const projectResponse=await bridge.call('GET','/api/projects');const projects=JSON.parse(Buffer.from(projectResponse.body,'base64'));const current=projects[0];writeFileSync(dir+'/project-id.txt',current.id); const audit=await bridge.call('GET','/api/projects/'+current.id+'/audit?variant=a');writeFileSync(dir+'/demo-audit.json',Buffer.from(audit.body,'base64')); const project=await bridge.call('GET','/api/projects/'+current.id);writeFileSync(dir+'/demo-content.json',JSON.stringify(JSON.parse(Buffer.from(project.body,'base64')).content,null,2));
writeFileSync(dir+'/acceptance-results.json',JSON.stringify({transport:'Real FastAPI ASGI TestClient, temporary SQLite; browser static assets from the configured local address. No simulated API payloads and no external model calls.',checks,errors,durations,elapsedSeconds:(Date.now()-started)/1000,projectId:current.id},null,2));expect(errors).toEqual([]);
const video=page.video();await context.close();await video.saveAs(dir+'/Deckly-local-demo.webm');await browser.close();bridge.close();console.log(JSON.stringify({checks,errors,durations,elapsedSeconds:(Date.now()-started)/1000}));
