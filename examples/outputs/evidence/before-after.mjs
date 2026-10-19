import {createRequire} from 'node:module';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {startBridge} from './bridge.mjs';
const root='C:/Users/GT/Desktop/HackMoscVKbro-updated-2026-10-18/HackMoscVKbro-main';
const before='C:/Users/GT/Documents/Codex/2026-09-16/deckly-implementation-2026-10-19/checkpoint/frontend/dist';
const dir=root+'/examples/outputs/acceptance';mkdirSync(dir,{recursive:true});
const require=createRequire(root+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const bridge=await startBridge(),browser=await chromium.launch();
try {
const request=async(method,path,data)=>{const r=await bridge.call(method,path,data?Buffer.from(JSON.stringify(data)):Buffer.alloc(0),{'content-type':'application/json','x-csrf-token':bridge.auth.csrf});if(r.status>=400)throw Error(Buffer.from(r.body,'base64').toString());return JSON.parse(Buffer.from(r.body,'base64'));};
const job=await request('POST','/api/generate',{template_id:'workspace',source_text:'Материалы уже есть. Нужно проверить структуру и сохранить результат.',content:{title:'От материалов к презентации',slides:[{title:'Начните с главного',body:'Материалы уже есть. Нужно проверить структуру и сохранить результат.',kind:'text',source_quote:'Материалы уже есть.'},{title:'Проверьте логику',body:'Уточните заголовки, порядок и тезисы.',kind:'text'},{title:'Сохраните результат',body:'Скачайте редактируемую презентацию.',kind:'text'}]}});
let status;for(let i=0;i<30;i++){status=await request('GET','/api/jobs/'+job.job_id);if(status.state==='complete')break;await new Promise(r=>setTimeout(r,100));}if(!status.project_id)throw Error(JSON.stringify(status));
for(const version of ['before','after']){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();await bridge.attach(page);
 if(version==='before')await page.route('http://127.0.0.1:8183/**',async route=>{const url=new URL(route.request().url());if(url.pathname.startsWith('/api/'))return route.fallback();const file=resolve(before,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(resolve(before))||!existsSync(file))return route.abort();const type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.woff2':'font/woff2','.ttf':'font/ttf'}[extname(file)]||'application/octet-stream';return route.fulfill({body:readFileSync(file),contentType:type});});
 await page.addInitScript(({id,uid})=>{localStorage.setItem('deckly-theme','light');localStorage.setItem('deckly-active-project',id);localStorage.setItem(`deckly:${encodeURIComponent(uid)}:active-project`,JSON.stringify(id));},{id:status.project_id,uid:bridge.auth.user.id});
 await page.goto('http://127.0.0.1:8183/#editor');await expect(page.locator('.editor-page')).toBeVisible();await page.screenshot({path:dir+'/'+version+'-editor.png'});
 await page.goto('http://127.0.0.1:8183/#create');await expect(page.locator('.wizard-modern')).toBeVisible();await page.screenshot({path:dir+'/'+version+'-create.png'});
 await context.close();
}
console.log('Before/after actual checkpoint and current frontend captured against identical temporary demo project.');
}finally{await browser.close();bridge.close();}
