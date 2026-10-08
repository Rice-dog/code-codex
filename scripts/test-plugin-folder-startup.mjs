import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
import {verifiedPluginSources} from './plugin-package-files.mjs';
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'packages/explorer-ui/dist/plugins');
const catalog=JSON.parse(readFileSync(resolve(directory,'catalog.json'),'utf8'));
const early=readFileSync(resolve(root,'packages/explorer-ui/dist/startup-early.js'),'utf8');
const player=catalog.find(p=>p.id==='codex-startup-transition');
assert.equal(player.category,'appearance');assert.equal(player.networkDuringStartup,false);
const playerSources=verifiedPluginSources(directory,player);
assert.ok(early.length<40*1024);assert.ok(!early.includes('code-codex-startup-host'));
const gate='window===window.top&&location.protocol==="app:"&&location.host==="-"&&location.pathname==="/index.html"&&!location.search';
assert.equal(early.split(gate).length,2);
const fixture=early.replace(gate,'window===window.top');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><style>html,body{margin:0;width:100%;height:100%}</style><body><main class="main-surface"></main><div>Loading</div><script>window.errors=[];addEventListener("error",e=>errors.push(e.message));addEventListener("unhandledrejection",e=>errors.push(String(e.reason)));</script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={mode:'downloaded startup player, production early dispatcher and verified raw PNG assets; only app-origin gate adapted for isolated browser',checks:[],limitations:['No official Codex cold restart; ongoing user session preserved']};
let browser;
try{
 for(const id of ['particle-image','pixel-sculpt']){
  browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
  for(let i=0;i<200;i++){
   if(await browser.evaluate('location.protocol==="http:" && document.readyState==="complete" && Array.isArray(window.errors)'))break;
   await delay(40);
  }
  const p=catalog.find(p=>p.id===id),sources=verifiedPluginSources(directory,p);
  await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:${JSON.stringify(id)},backgroundFadeSeconds:.6}))`);
  // Match native startup order: cached verified player, selected media/factory, early dispatcher.
  for(const source of playerSources)await browser.evaluate(source);
  for(const source of sources)await browser.evaluate(source);
  await browser.evaluate(fixture);
  for(let i=0;i<250;i++){
   if(await browser.evaluate(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='playing'`))break;
   await delay(40);
  }
  const state=await browser.evaluate(`({stage:window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage,phase:window[Symbol.for('code-codex:startup-transition:controller:v1')]?.phase,minimum:window[Symbol.for('code-codex:startup-transition:controller:v1')]?.minimumRemainingMs,host:!!document.querySelector('body>.code-codex-startup-host'),canvas:!!document.querySelector('body>.code-codex-startup-host')?.shadowRoot.querySelector('canvas'),home:!!document.querySelector('[data-app-navigation-rail]'),gallery:window[Symbol.for('code-codex:default-galleries:v1')]?.get(${JSON.stringify(id)})?.images.size,errors})`);
  report.checks.push({id,state,scriptCount:playerSources.length+sources.length,earlyDispatcherBytes:Buffer.byteLength(early),playerBytes:player.size});
  assert.equal(state.stage,'playing');assert.equal(state.phase,'loading');assert.ok(state.host&&state.canvas&&!state.home);assert.ok(state.minimum>0);assert.equal(state.gallery,p.defaultImageCount);assert.deepEqual(state.errors,[]);
  await delay(1200); // Capture after the intentional opening has advanced visibly.
  const screenshot=await browser.command('Page.captureScreenshot');mkdirSync(resolve(root,'artifacts/plugin-folder-startup'),{recursive:true});writeFileSync(resolve(root,`artifacts/plugin-folder-startup/${id}.png`),Buffer.from(screenshot.data,'base64'));
  await browser.close();browser=null;
 }
}catch(error){report.failure=error.stack;throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));mkdirSync(resolve(root,'artifacts/plugin-folder-startup'),{recursive:true});writeFileSync(resolve(root,'artifacts/plugin-folder-startup/result.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
