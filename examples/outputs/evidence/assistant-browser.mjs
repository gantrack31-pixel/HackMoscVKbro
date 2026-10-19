import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire('C:/Users/GT/Desktop/HackMoscVKbro-updated-2026-10-18/HackMoscVKbro-main/frontend/package.json');
const {chromium,expect}=require('@playwright/test');
const dir='C:/Temp/deckly-implementation-qa-20261019';
const browser=await chromium.launch();
const context=await browser.newContext({baseURL:'http://127.0.0.1:8183',storageState:'C:/Temp/deckly-visual-review-574c0d6c/browser-state.json',viewport:{width:1440,height:1080},reducedMotion:'reduce'});
const id='e74968f7-1193-48fd-8d45-877e4475262c';
let project=await(await context.request.get('/api/projects/'+id)).json();
const initial=structuredClone(project);const errors=[],checks=[];let applied=0,proposed=0,proposal,networkError=null;
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 if(path==='/api/health'){const response=await route.fetch();return route.fulfill({json:{...await response.json(),mode:'live',llm_configured:true}});}
 if(path==='/api/projects/'+id&&req.method()==='GET')return route.fulfill({json:project});
 if(path==='/api/ai/operations')return route.fulfill({status:201,json:{job_id:'review-operation'}});
 if(path.endsWith('/assistant')){const data=req.postDataJSON();expect(data.base_updated_at).toBe(project.updated_at);expect(data.pinned_brief).toBe('Сохрани факты, пиши для руководителя');expect(data.locked_facts).toEqual(['100 → 123']);proposed++;const proposedContent=structuredClone(data.content);proposedContent.slides[0].title='Понятный заголовок после проверки';proposal={id:'proposal-1',content:proposedContent,base_updated_at:project.updated_at,state:'pending',changes:[{slide:0,field:'title',before:data.content.slides[0].title,after:proposedContent.slides[0].title}],expires_at:'2099-01-01T00:00:00Z'};return route.fulfill({json:{project:null,proposal,summary:'Предложен новый заголовок, цифры сохранены.',changed_slides:[0],before:0,issues:[]}});}
 if(path.endsWith('/proposals/proposal-1/apply')){expect(req.postDataJSON().base_updated_at).toBe(project.updated_at);applied++;project={...project,content:proposal.content,updated_at:new Date().toISOString(),can_undo:true};return route.fulfill({json:{project,proposal:null,summary:'Изменения сохранены',changed_slides:[0],before:0,issues:[]}});}
 if(path.endsWith('/proposals/proposal-1/reject'))return route.fulfill({json:{state:'rejected'}});
 if(path==='/api/projects/'+id&&req.method()==='PUT'){if(networkError)return route.fulfill({status:409,json:networkError});expect(req.postDataJSON().base_updated_at).toBe(project.updated_at);project={...project,...req.postDataJSON(),updated_at:new Date().toISOString()};return route.fulfill({json:project});}
 if(path.endsWith('/preview')){const headers=await req.allHeaders();delete headers.origin;delete headers['sec-fetch-site'];const response=await page.request.fetch(req.url(),{method:'POST',headers,data:req.postDataBuffer()});return route.fulfill({response});}
 if(!['GET','HEAD','OPTIONS'].includes(req.method()))throw new Error('Unexpected mutation '+path);
 return route.continue();
});
const me=await(await context.request.get('/api/auth/me')).json();
await page.addInitScript(({uid,id})=>localStorage.setItem(`deckly:${encodeURIComponent(uid)}:active-project`,JSON.stringify(id)),{uid:me.user.id,id});
await page.goto('/#editor');await expect(page.locator('.editor-page')).toBeVisible();
await page.locator('.assistant-context > summary').click();
await page.getByLabel('Закреплённое задание').fill('Сохрани факты, пиши для руководителя');
await page.getByLabel('Факты, которые нельзя менять').fill('100 → 123');
await page.getByLabel('Что изменить с помощью AI?').fill('Сделай заголовок понятнее');
await page.getByRole('button',{name:'Предложить изменения',exact:true}).click();
await expect(page.getByRole('button',{name:'Принять изменения',exact:true})).toBeVisible();expect(applied).toBe(0);expect(project.content).toEqual(initial.content);checks.push('Proposal shows before/after without saving');
await page.screenshot({path:dir+'/assistant-proposal-light.png',fullPage:false});
await page.getByRole('button',{name:'Принять изменения',exact:true}).click();await expect(page.locator('.assistant-result')).toContainText('Правки сохранены');expect(applied).toBe(1);checks.push('Explicit apply publishes proposal using current version');
await page.getByLabel('Название презентации').fill('Несохранённый локальный черновик');
await page.reload();await expect(page.getByLabel('Название презентации')).toHaveValue('Несохранённый локальный черновик');checks.push('Editor draft survives reload');
await page.locator('.assistant-context > summary').click();await expect(page.getByLabel('Закреплённое задание')).toHaveValue('Сохрани факты, пиши для руководителя');checks.push('Pinned brief and facts survive reload');
networkError={detail:{code:'VERSION_CONFLICT',message:'Версия изменилась. Черновик сохранён.'}};
await page.getByRole('button',{name:/Сохранить/}).last().click();await expect(page.getByRole('alert').filter({hasText:'Версия изменилась'})).toBeVisible();await expect(page.getByLabel('Название презентации')).toHaveValue('Несохранённый локальный черновик');checks.push('Structured conflict error preserves local draft');
networkError=null;
for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:960});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:dir+`/editor-review-${width}.png`,fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
checks.push('Editor review responsive at 320/390/768/1440');expect(errors).toEqual([]);
writeFileSync(dir+'/assistant-browser-results.json',JSON.stringify({checks,errors,proposed,applied,note:'Browser endpoint mocks for proposal/version protocol; actual backend protocol validated by pytest.'},null,2));console.log(JSON.stringify({checks,errors}));
await browser.close();
