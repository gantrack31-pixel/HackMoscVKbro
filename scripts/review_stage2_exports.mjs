// Review standalone exports without starting a server or touching user sessions.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'frontend','package.json'));
const {chromium}=require('@playwright/test');
const folder=path.join(root,'examples','brands','rendered');
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1968,height:1240}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.route(/^https?:/,route=>route.abort());
const reports=[];
for(const variant of ['a','b','c']){
  await page.goto(pathToFileURL(path.join(folder,`analytics-${variant}.html`)).href);
  await page.evaluate(()=>document.fonts.ready);
  const overflows=await page.evaluate(()=>[...document.querySelectorAll('section svg')].flatMap((svg,index)=>{
    const {width,height}=svg.viewBox.baseVal;
    return [...svg.querySelectorAll('text')].flatMap(text=>{
      const box=text.getBBox();
      return box.x<-.5||box.y<-.5||box.x+box.width>width+.5||box.y+box.height>height+.5
        ? [{slide:index+1,text:text.textContent,bounds:{x:box.x,y:box.y,w:box.width,h:box.height}}]:[];
    });
  }));
  reports.push({variant,slides:await page.locator('section').count(),overflows});
  await page.evaluate(()=>{
    document.body.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px;background:#dce4ef';
    document.querySelectorAll('section').forEach(section=>{section.style.cssText='margin:0;max-width:none;box-shadow:0 2px 10px #142a4518'});
  });
  await page.screenshot({path:path.join(folder,`preview-${variant}.png`),fullPage:true});
}
await browser.close();
const result={checked_at:new Date().toISOString(),offline:true,renderer:'Chromium HTML/SVG (not PowerPoint)',reports,errors};
await fs.writeFile(path.join(folder,'browser-review.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
if(errors.length||reports.some(report=>report.overflows.length))process.exitCode=1;
