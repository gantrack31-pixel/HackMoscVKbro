import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {startBridge} from './bridge.mjs';
const root='C:/Users/GT/Desktop/HackMoscVKbro-updated-2026-10-18/HackMoscVKbro-main';
const require=createRequire(root+'/frontend/package.json'),{chromium,expect}=require('@playwright/test');
const bridge=await startBridge(),browser=await chromium.launch();
try{
const page=await browser.newPage({reducedMotion:'reduce'});await bridge.attach(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
const post=async(path,data,csrf)=>{const r=await bridge.call('POST',path,Buffer.from(JSON.stringify(data||{})),{'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})});if(r.status>=400)throw Error(Buffer.from(r.body,'base64').toString());return r.status===204?null:JSON.parse(Buffer.from(r.body,'base64'));};
await page.goto('http://127.0.0.1:8183/#create');const prompt=page.locator('.wizard-grid textarea').first();await expect(prompt).toBeVisible();await prompt.fill('Черновик первого аккаунта: сохранить число 123.');await page.reload();await expect(prompt).toHaveValue('Черновик первого аккаунта: сохранить число 123.');
await post('/api/auth/logout',{},bridge.auth.csrf);const second=await post('/api/auth/register',{email:'second-owner@example.test',password:'Second-owner-2026!test',first_name:'Второй',last_name:'Пользователь'});
await page.reload();await expect(prompt).toHaveValue('');await prompt.fill('Черновик второго аккаунта: сохранить число 456.');await page.reload();await expect(prompt).toHaveValue('Черновик второго аккаунта: сохранить число 456.');
await post('/api/auth/logout',{},second.csrf);await post('/api/auth/login',{email:'end-to-end@example.test',password:'Deckly-demo-2026!test'});await page.reload();await expect(prompt).toHaveValue('Черновик первого аккаунта: сохранить число 123.');expect(errors).toEqual([]);
const report={transport:'Real authenticated ASGI sessions in one temporary database, same browser storage, no mocked responses.',twoDistinctUsers:true,switchDoesNotLeakDraft:true,reloadPreservesBothDrafts:true,originalOwnerRecoversOriginalDraft:true,errors};writeFileSync(root+'/examples/outputs/acceptance/account-draft-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();bridge.close();}
