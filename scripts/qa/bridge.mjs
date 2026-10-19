import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
export async function startBridge() {
 const child=spawn(process.env.DECKLY_QA_PYTHON || join(root,'backend','.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-u',fileURLToPath(new URL('./asgi-worker.py',import.meta.url))],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});
 const pending=new Map();let serial=0,readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});let stderr='';child.stderr.on('data',d=>{stderr+=d.toString();});
 createInterface({input:child.stdout}).on('line',line=>{let r;try{r=JSON.parse(line);}catch{console.error(line);return;}if(r.ready)return readyResolve(r.auth);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error)):p.resolve(r);}});
 child.on('exit',code=>{for(const p of pending.values())p.reject(new Error('QA worker exited '+code+': '+stderr));if(code)readyReject(new Error(stderr));});
 const auth=await ready;
 const call=(method,path,body=Buffer.alloc(0),headers={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,method,path,body:body.toString('base64'),headers})+'\n');});
 return {auth,call,async attach(page){
 // Preserve binary multipart bodies: Chromium's request interception can omit file bytes.
 await page.exposeFunction('__decklyAsgiFetch', async data=>call(data.method,data.path,Buffer.from(data.body,'base64'),data.headers));
 await page.addInitScript(()=>{
 const nativeFetch=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
 const request=new Request(input,init),url=new URL(request.url);
 if(!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
 const bytes=new Uint8Array(await request.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const result=await window.__decklyAsgiFetch({method:request.method,path:url.pathname+url.search,body:btoa(binary),headers:Object.fromEntries(request.headers.entries())});
 const decoded=atob(result.body),body=Uint8Array.from(decoded,c=>c.charCodeAt(0));
 return new Response([204,205,304].includes(result.status)?null:body,{status:result.status,headers:result.headers});
 };
 });
 await page.route('**/api/**',async route=>{try{const req=route.request(),url=new URL(req.url());const r=await call(req.method(),url.pathname+url.search,req.postDataBuffer()||Buffer.alloc(0),await req.allHeaders());await route.fulfill({status:r.status,headers:r.headers,body:Buffer.from(r.body,'base64')});}catch(e){console.error(e);await route.fulfill({status:500,json:{detail:String(e)}});}});},close(){child.stdin.end();},stderr:()=>stderr};
}
