import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'artifacts');mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'runtime-information-test-entry.ts'),`export {reconcileApplicationMenu} from '../packages/explorer-ui/src/application-menu';export {connectRuntimeInformation,openRuntimeInformation,observeCodexRuntime,observePluginControls,flushRuntimeEvents} from '../packages/explorer-ui/src/runtime-information';export {runtimeEvent} from '../packages/explorer-ui/src/runtime-events';`);
const code=buildSync({entryPoints:[join(dir,'runtime-information-test-entry.ts')],bundle:true,write:false,format:'iife',globalName:'RuntimeTest'}).outputFiles[0].text;
const file=join(dir,'runtime-information-test.html');
writeFileSync(file,`<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px system-ui;background:#fafafa;color:#222}header{display:flex}button{padding:8px}nav{padding:16px}</style></head><body><header><div role="menubar"><button id="application-menu-trigger-file-menu">文件</button><button id="application-menu-trigger-help-menu">帮助</button></div></header><nav data-app-navigation-rail><button data-sidebar-destination="builtin:home" aria-current="page">Home</button><button data-sidebar-destination="builtin:library">Library</button></nav><button data-app-shell-sidebar-trigger hidden></button><aside class="app-shell-left-panel"></aside><div id="plugins"></div><script>${code}</script><script>
const events=[];window.savedEvents=events;window.copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
const current='1790900000000-1',old='1790800000000-2';
RuntimeTest.connectRuntimeInformation(async(method,params)=>{
 if(method==='explorer.runtime.append'){if(window.rejectLogs)throw Error('Temporary connection failure');if(new TextEncoder().encode(JSON.stringify(params)).length>96*1024)throw Error('Binding payload too large');events.push(...params.events);return {accepted:params.events.length};}
 if(method==='explorer.runtime.list')return {currentRun:current,runs:[{id:current,current:true,bytes:100},{id:old,current:false,bytes:100}]};
 if(method==='explorer.runtime.read'){const e=params.id===current?events:[{source:'launcher',action:'previous launch',outcome:'failed',details:{supportCode:'CC-START-CDP-014',accessToken:'SENTINEL_OLD_TOKEN',reason:'Error at C:\\\\Users\\\\SENTINEL_OLD_PATH\\\\file',content:'SENTINEL_OLD_CHAT'}}];return {text:JSON.stringify({version:'0.3.87',droppedEvents:0})+'\\n'+e.map((e,i)=>JSON.stringify({sequence:i+1,elapsedMs:i*100,...e})).join('\\n')+'\\n'};}
 throw Error(method);
});
RuntimeTest.observeCodexRuntime();
RuntimeTest.reconcileApplicationMenu({isExplorerVisible:()=>true,toggleExplorer:()=>{},openPreviewMarket:()=>{},checkForUpdates:()=>{},openRuntimeInformation:()=>RuntimeTest.openRuntimeInformation()});
const shadow=document.querySelector('#plugins').attachShadow({mode:'open'});shadow.innerHTML='<article class="preview-extension" data-appearance-plugin="code-codex.fixture"><h4>Fixture Plugin</h4><button class="preview-extension-action" aria-pressed="false">Enable</button></article>';RuntimeTest.observePluginControls(shadow);shadow.querySelector('button').onclick=e=>e.target.setAttribute('aria-pressed',e.target.getAttribute('aria-pressed')==='true'?'false':'true');
window.fixtureShadow=shadow;window.errors=[];addEventListener('error',e=>errors.push(e.message));
</script></body></html>`);
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--allow-file-access-from-files','--window-size=1300,950','--remote-debugging-port=0','--user-data-dir='+join(dir,'runtime-browser-'+Date.now()),'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const browserUrl=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);child.stderr.on('data',chunk=>{text+=chunk;const match=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});child.once('error',reject);});
const ws=new WebSocket(browserUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const cmd=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
let session;
const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
try {
 const {targetInfos}=await cmd('Target.getTargets');({sessionId:session}=await cmd('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true}));await cmd('Page.enable',{},session);await cmd('Page.navigate',{url:pathToFileURL(file).href},session);await new Promise(r=>setTimeout(r,600));
 await evaluate(`document.querySelector('#code-codex-application-menu-trigger').click();[...document.querySelectorAll('[role=menuitem]')].find(x=>x.textContent==='Runtime Information').click()`);await new Promise(r=>setTimeout(r,400));
 assert.equal(await evaluate(`document.querySelector('dialog').open`),true);
 assert.equal(await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('h2').textContent`),'Runtime Information');
 await evaluate(`fixtureShadow.querySelector('button').click();document.querySelector('[data-sidebar-destination="builtin:home"]').removeAttribute('aria-current');document.querySelector('[data-sidebar-destination="builtin:library"]').setAttribute('aria-current','page')`);await new Promise(r=>setTimeout(r,500));
 await evaluate(`RuntimeTest.flushRuntimeEvents()`);
 assert.ok(await evaluate(`savedEvents.some(e=>e.action==='plugin state'&&e.details.enabled===true)`));
 assert.ok(await evaluate(`savedEvents.some(e=>e.source==='codex-observed'&&e.details.to==='builtin:library')`));
 await evaluate(`window.rejectLogs=true;RuntimeTest.runtimeEvent('renderer','retry marker','queued');RuntimeTest.flushRuntimeEvents()`);
 assert.equal(await evaluate(`savedEvents.some(e=>e.action==='retry marker')`),false);
 await evaluate(`window.rejectLogs=false;RuntimeTest.flushRuntimeEvents()`);
 assert.equal(await evaluate(`savedEvents.filter(e=>e.action==='retry marker').length`),1);
 await evaluate(`for(let i=0;i<500;i++)RuntimeTest.runtimeEvent('renderer','large event','observed',{n:i,message:'x'.repeat(3000)});RuntimeTest.flushRuntimeEvents()`);
 assert.equal(await evaluate(`savedEvents.filter(e=>e.action==='large event').length`),500);
 await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.refresh').click()`);await new Promise(r=>setTimeout(r,150));
 await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.copy').click()`);await new Promise(r=>setTimeout(r,100));assert.ok(await evaluate(`copied.includes('code-codex.fixture')&&copied.includes('builtin:library')`));
 const shot=await cmd('Page.captureScreenshot',{format:'png'},session);writeFileSync(join(dir,'runtime-information.png'),Buffer.from(shot.data,'base64'));
 await evaluate(`var s=document.querySelector('dialog').firstElementChild.shadowRoot;s.querySelector('select').value='1790800000000-2';s.querySelector('select').dispatchEvent(new Event('change'))`);await new Promise(r=>setTimeout(r,100));assert.ok(await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.events').textContent.includes('previous launch')`));
 await evaluate(`var s=document.querySelector('dialog').firstElementChild.shadowRoot;s.querySelector('input').value='absent';s.querySelector('input').dispatchEvent(new Event('input'))`);assert.equal(await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.events').textContent`),'No matching events.');
 await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.copy').click()`);await new Promise(r=>setTimeout(r,100));assert.equal(await evaluate(`copied.includes('SENTINEL')`),false);assert.equal(await evaluate(`copied.includes('CC-START-CDP-014')`),true);
 await cmd('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.export').click()`);await new Promise(r=>setTimeout(r,300));const exported=readFileSync(join(dir,'CodeCodex-runtime-1790800000000-2.jsonl'),'utf8');assert.ok(exported.includes('previous launch'));assert.ok(!exported.includes('SENTINEL'));assert.ok(exported.includes('CC-START-CDP-014'));
 await cmd('Emulation.setDeviceMetricsOverride',{width:500,height:760,deviceScaleFactor:1,mobile:false},session);assert.ok(await evaluate(`(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`));
 await evaluate(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.close').click()`);await new Promise(r=>setTimeout(r,80));assert.equal(await evaluate(`!!document.querySelector('dialog')`),false);assert.deepEqual(await evaluate('errors'),[]);
 console.log('Runtime information: English menu after localized native menus, top-layer dialog, plugin events, native page observation, current/history selection, filter, full copy, export, responsive bounds, close passed.');
} finally {await cmd('Browser.close').catch(()=>{});ws.close();}
