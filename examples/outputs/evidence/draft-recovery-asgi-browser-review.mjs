import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {startBridge} from './bridge.mjs';

const require=createRequire('C:/Users/GT/Desktop/HackMoscVKbro-updated-2026-10-18/HackMoscVKbro-main/frontend/package.json');
const {chromium,expect}=require('@playwright/test');
const base='C:/Temp/deckly-implementation-qa-20261019';
const bridge=await startBridge(),browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[];
const key=name=>'deckly:'+encodeURIComponent(bridge.auth.user.id)+':'+name;
const headers={'content-type':'application/json','x-csrf-token':bridge.auth.csrf};
async function api(method,path,data){
 const r=await bridge.call(method,path,data===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(data)),headers);
 if(r.status>=400)throw new Error(r.status+': '+Buffer.from(r.body,'base64').toString());
 return r.status===204?null:JSON.parse(Buffer.from(r.body,'base64').toString());
}
async function newPage(){const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await bridge.attach(page);return page;}
try{
 const generated=await api('POST','/api/generate',{template_id:'tech',source_text:'Synthetic material contains a verified total of 123.',content:{title:'Recovery QA',slides:[{title:'Initial finding',body:'Synthetic material contains a verified total of 123.',source_quote:'This deliberately unmatched quote creates an audit issue.'},{title:'Second finding',body:'Preserve this slide during recovery.'}]}});
 const job=await api('GET','/api/jobs/'+generated.job_id);if(job.state!=='complete')throw new Error(JSON.stringify(job));
 let project=await api('GET','/api/projects/'+job.project_id);
 const page=await newPage();
 await page.goto('http://127.0.0.1:8183/#home');
 const auditDraft={...project.content.slides[0],title:'Recovered audit draft'};
 await page.evaluate(({activeKey,draftKey,pid,draft,version})=>{
  localStorage.setItem(activeKey,JSON.stringify(pid));
  sessionStorage.setItem(draftKey,JSON.stringify({draft,index:0,baseVersion:version,focus:'issue-that-no-longer-exists'}));
 },{activeKey:key('active-project'),draftKey:key('audit-draft:'+project.id),pid:project.id,draft:auditDraft,version:project.updated_at});
 await page.goto('http://127.0.0.1:8183/#audit');await page.reload();
 const fallback=page.getByRole('region',{name:'Восстановленный черновик'});
 await expect(fallback).toBeVisible();
 await expect(fallback.getByLabel('Заголовок',{exact:true})).toHaveValue('Recovered audit draft');
 await fallback.getByLabel('Заголовок',{exact:true}).fill('Audit edit after restore');
 await page.reload();
 await expect(fallback.getByLabel('Заголовок',{exact:true})).toHaveValue('Audit edit after restore');
 await fallback.getByRole('button',{name:'Сохранить и проверить',exact:true}).click();
 await expect(fallback).toHaveCount(0);
 project=await api('GET','/api/projects/'+project.id);
 if(project.content.slides[0].title!=='Audit edit after restore')throw new Error('Restored audit draft did not save');
 if(project.content.slides[1].title!=='Second finding')throw new Error('Audit save lost other slide');

 // The editor stays on its old prop while another client changes the server.
 await page.goto('http://127.0.0.1:8183/#editor');
 const title=page.getByLabel('Название презентации',{exact:true});
 await expect(title).toHaveValue(project.content.title);
 await title.fill('Local unsaved editor work');
 const originalVersion=project.updated_at;
 const newer=structuredClone(project.content);newer.title='Newer server version';
 const updated=await api('PUT','/api/projects/'+project.id,{content:newer,variant:project.variant,base_updated_at:originalVersion});
 await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
 const recovery=page.getByRole('button',{name:'Скачать черновик и открыть актуальную версию',exact:true});
 await expect(recovery).toBeVisible();
 await expect(title).toHaveValue('Local unsaved editor work');
 await page.screenshot({path:base+'/editor-conflict-recovery.png',fullPage:true});
 await page.setViewportSize({width:320,height:900});
 await expect(recovery).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 if(overflow>1)throw new Error('Recovery UI overflows at 320px: '+overflow);
 await page.screenshot({path:base+'/editor-conflict-recovery-320.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 const downloaded=page.waitForEvent('download');await recovery.click();
 const download=await downloaded;const backup=JSON.parse(await fs.readFile(await download.path(),'utf8'));
 if(backup.content.title!=='Local unsaved editor work'||backup.base_updated_at!==originalVersion||backup.content.slides.length!==2||!backup.source_text)throw new Error('Incomplete local JSON backup');
 await download.saveAs(base+'/editor-recovery-backup.json');
 await expect(title).toHaveValue('Newer server version');await expect(recovery).toHaveCount(0);
 const unchanged=await api('GET','/api/projects/'+project.id);
 if(unchanged.updated_at!==updated.updated_at)throw new Error('Recovery overwrote the server');
 await title.fill('Fresh edit after recovery');
 await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();
 await expect(page.getByText('Всё сохранено',{exact:true})).toBeVisible();
 project=await api('GET','/api/projects/'+project.id);
 if(project.content.title!=='Fresh edit after recovery')throw new Error('Fresh edit used stale version');

 // An Audit draft from an old version can be discarded, then a new issue edited.
 await page.evaluate(({draftKey,draft,version})=>sessionStorage.setItem(draftKey,JSON.stringify({draft,index:0,baseVersion:version})),{draftKey:key('audit-draft:'+project.id),draft:{...project.content.slides[0],title:'Stale audit work'},version:originalVersion});
 await page.goto('http://127.0.0.1:8183/#audit');
 await expect(fallback).toBeVisible();await expect(recovery).toBeVisible();
 await fallback.getByRole('button',{name:'Отменить',exact:true}).click();
 await expect(fallback).toHaveCount(0);await expect(recovery).toHaveCount(0);
 const open=page.getByRole('button',{name:'Открыть и исправить',exact:true}).first();
 await expect(open).toBeEnabled();await open.click();
 const issueEditor=page.locator('.issue-editor').first();
 await issueEditor.getByLabel('Заголовок',{exact:true}).fill('Audit edit after stale cancel');
 await issueEditor.getByRole('button',{name:'Сохранить и проверить',exact:true}).click();
 await expect(page.getByText('Изменения сохранены. Список замечаний обновляется по новым данным.',{exact:true})).toBeVisible();
 project=await api('GET','/api/projects/'+project.id);
 if(project.content.slides[0].title!=='Audit edit after stale cancel')throw new Error('Audit cancel retained a stale baseVersion');
 if(errors.length)throw new Error(errors.join('\n'));
 await fs.writeFile(base+'/draft-recovery-asgi-browser-report.json',JSON.stringify({transport:'Real current ASGI handlers over stdio bridge; existing8183 serves built frontend. Only sessionStorage setup seeds a recoverable draft.',auditMissingIssueFallback:true,auditDraftReloadAndSave:true,editor409WithoutRefreshedProp:true,completeJsonBackup:true,recoveryReadOnly:true,editorFreshSaveAfterRecovery:true,auditStaleCancelResetsVersion:true,mobile320NoOverflow:true,pageErrors:errors},null,2));
 console.log(JSON.stringify({auditReloadSave:true,editor409BackupFreshSave:true,auditCancelFreshSave:true,pageErrors:errors}));
}finally{await context.close();await browser.close();bridge.close();}
