import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build,stop} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture,delay} from './browser-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),src=resolve(ui,'src');
const out=resolve(root,'artifacts/native-login-startup');mkdirSync(out,{recursive:true});
const descriptor=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8')).find(p=>p.id==='codex-startup-transition');
const player=readFileSync(resolve(ui,'dist/plugins',descriptor.category,descriptor.id,descriptor.asset),'utf8');
assert.equal(createHash('sha256').update(player).digest('hex'),descriptor.sha256);
const entry=readFileSync(resolve(src,'startup-transition-early.ts'),'utf8').replace(/const valid = [\s\S]*?;\r?\nconst state/,'const valid = window === window.top;\nconst state');
const early=(await build({stdin:{contents:entry,resolveDir:src,loader:'ts'},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const login=(await build({stdin:{contents:`import * as login from './native-login';import {observeNativeLogin} from './native-login-observation';window.auditLogin={...login,observeNativeLogin};`,resolveDir:src,loader:'ts'},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
// Current layouts are extracted from installed official LoginRoute / GatewayOAuth;
// authentication is synthetic and no real account, URL, or API is accessed.
const controls='<svg aria-hidden="true"></svg><button id="sign-in">Sign in</button>';
const layouts=[
 ['compact','<div class="flex h-full w-full items-center justify-center overflow-hidden bg-surface pb-12 text-default"><div class="flex w-[340px] flex-col items-center gap-8">'+controls+'</div></div>'],
 ['column','<div class="flex h-full w-full scroll-pt-(--height-toolbar-sm) flex-col overflow-y-auto bg-surface pb-6 text-default"><div class="flex w-[340px] max-w-full shrink-0 grow flex-col items-center justify-center gap-8 self-center py-(--height-toolbar-sm)">'+controls+'</div></div>'],
 ['browser-fallback','<div class="flex h-full w-full flex-col overflow-y-auto bg-surface text-default select-none"><main class="flex w-full shrink-0 grow flex-col items-center justify-center px-6 py-4"><div class="flex w-full max-w-sm flex-col gap-5">'+controls+'</div></main></div>'],
 ['gateway-oauth','<div class="flex h-full w-full justify-center overflow-y-auto bg-surface px-6 py-12 text-default"><div class="my-auto flex w-full max-w-sm flex-col items-center gap-8">'+controls+'</div></div>'],
];
const css='html,body{height:100%;margin:0;background:#202020;color:white}.flex{display:flex}.h-full{height:100%}.w-full{width:100%}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}main{flex:1}button{width:220px;height:44px;background:#fff;color:#000;border:0;border-radius:20px}svg{width:40px;height:40px}#native{position:fixed;inset:0}';
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><style>${css}</style></head><body><div id="native">${req.url==='/already-ready'?layouts[1][1]:'Native loading placeholder'}</div></body></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`,browser=await launchFixture(url);
const report={classification:'Isolated production player and early entry (localhost gate adapted), native DOM fixtures; no actual authentication/cold launch.',descriptor,checks:[]};
const ev=x=>browser.evaluate(x),check=name=>report.checks.push(name);
const module=`window[Symbol.for('code-codex:plugin-modules:v1')].get('codex-startup-transition').exports`;
async function wait(x){for(let i=0;i<240;i++){try{if(await ev(x))return;}catch(e){if(!/context|Cannot find/i.test(String(e)))throw e;}await delay(50);}throw Error('Timeout: '+x);}
async function native(html){await ev(`document.getElementById('native').innerHTML=${JSON.stringify(html)};window.auditLogin.reconcileLoginBackground();`);}
async function observation(){return ev(`(()=>{const s=window.auditLogin.observeNativeLogin();return{layout:s.layout,candidates:s.candidates,enabled:s.enabledControls,reason:s.reason,surface:!!s.surface,ready:${module}.startupContentVisible(),backdrop:!!document.querySelector('[data-code-codex-login-surface]')};})()`);}
async function clickNative(){const p=await ev(`(()=>{window.nativeClicks=0;const b=document.getElementById('sign-in');b.onclick=()=>window.nativeClicks++;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};})()`);assert.equal(p.hit,true);await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});assert.equal(await ev('window.nativeClicks'),1);}
try{
 await ev(`(async()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#147894';ctx.fillRect(0,0,160,90);const stream=canvas.captureStream(15),chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm'});const blob=await new Promise(ok=>{rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());ok(new Blob(chunks,{type:'video/webm'}));};const timer=setInterval(()=>ctx.fillRect(0,0,160,90),60);rec.start();setTimeout(()=>rec.stop(),1600);});const db=await new Promise(ok=>{const req=indexedDB.open('code-codex-startup-transition',1);req.onupgradeneeded=()=>req.result.createObjectStore('video',{keyPath:'id'});req.onsuccess=()=>ok(req.result);});await new Promise(ok=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'audit',blob,name:'Audit.webm',duration:1.6,size:blob.size,type:'video/webm'});tx.oncomplete=ok;});db.close();localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'video',selectedVideoId:'audit',clipStart:0,clipEnd:1.5,playbackRate:1,minimumVisiblePercent:0,fadePercent:10,videoBrightness:1,videoFit:'cover'}));})()`);
 await browser.command('Page.enable');
 await browser.command('Page.addScriptToEvaluateOnNewDocument',{source:player+'\n'+login+'\n'+early});
 for(const [name,html] of layouts){
  await browser.command('Page.navigate',{url:url+'/'+name});await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='playing'`);
  await native(html);await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='complete'`);
  const actual=await observation();assert.equal(actual.ready,true);assert.equal(actual.layout,name);assert.equal(actual.backdrop,true);
  await clickNative();check(`${name}: opening releases native pointer input and login backdrop is qualified`);
  assert.ok(await ev(`window[Symbol.for('code-codex:runtime-events:v1')].events.some(e=>e.action==='readiness evidence'&&e.details.loginLayout===${JSON.stringify(name)}&&e.details.loginEnabledControls===1)`));check(`${name}: English readiness evidence includes layout and enabled controls`);
 }
 const current=layouts[1][1],legacy=layouts[0][1],main='<main class="main-surface" style="height:300px"><form>Ready</form></main><nav data-app-navigation-rail></nav>';
 const cases=[
  ['inactive cached login and navigation ignored',`<div data-app-shell-active-page="false">${legacy}<nav data-app-navigation-rail></nav></div>${current}`,true,'column'],
  ['hidden old login ignored',`<div hidden>${legacy}</div>${current}`,true,'column'],
  ['inert login excluded',`<div inert>${current}</div>`,false,'none'],
  ['aria-hidden login excluded',`<div aria-hidden="true">${current}</div>`,false,'none'],
  ['transparent ancestor excluded',`<div style="opacity:0">${current}</div>`,false,'none'],
  ['hidden ancestor excluded',`<div style="visibility:hidden">${current}</div>`,false,'none'],
  ['ambiguous visible login surfaces rejected',`<div style="position:fixed;inset:0">${legacy}</div><div style="position:fixed;inset:0">${current}</div>`,false,'none'],
  ['logo-only game control does not qualify',current.replace('<button id="sign-in">Sign in</button>','<button style="width:32px;height:32px"><svg></svg></button>'),false,'none'],
  ['disabled authentication remains unready',current.replace('id="sign-in"','id="sign-in" disabled'),false,'column'],
  ['aria-disabled authentication remains unready',current.replace('id="sign-in"','id="sign-in" aria-disabled="true"'),false,'column'],
  ['generic button container rejected','<div class="flex h-full w-full bg-surface"><svg></svg><button>Other action</button></div>',false,'none'],
  ['login route without controls stays unready',current.replace('<button id="sign-in">Sign in</button>',''),false,'none'],
  ['active native workspace suppresses stale login',main+current,true,'none'],
  ['hidden cached workspace does not block current workspace',`<div data-app-shell-active-page="false">${main}</div>${main}`,true,'none'],
 ];
 for(const [name,html,ready,layout] of cases){await native(html);const actual=await observation();assert.equal(actual.ready,ready,JSON.stringify({name,actual}));assert.equal(actual.layout,layout,name);check(name);}
 await native(current);await ev(`document.documentElement.setAttribute('data-code-codex-particle-image-background','');const style=document.createElement('style');style.textContent=window.auditLogin.LOGIN_BACKGROUND_CSS;document.head.append(style);`);await clickNative();assert.equal(await ev(`getComputedStyle(document.querySelector('[data-code-codex-login-surface]')).backgroundColor`),'rgba(11, 12, 15, 0.58)');check('Saved login background mask changes surface only and preserves native input');
 await browser.command('Page.navigate',{url:url+'/disabled'});await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='playing'`);await native(current.replace('id="sign-in"','id="sign-in" disabled'));await delay(1200);assert.equal(await ev(`window[Symbol.for('code-codex:startup-transition:controller:v1')].phase`),'loading');await ev(`document.getElementById('sign-in').disabled=false`);await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='complete'`);await clickNative();check('Disabled-to-enabled authentication transition releases opening without reload');
 await browser.command('Page.navigate',{url:url+'/already-ready'});await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='skipped'`);assert.ok(await ev(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__.reason.includes('native document already ready')`));await clickNative();check('Already painted current login skips startup cover at early entry');
 report.passed=true;console.log(JSON.stringify({passed:true,checks:report.checks.length,plugin:descriptor.version}));
}catch(e){report.passed=false;report.error=String(e);report.observation=await observation().catch(()=>null);throw e;}
finally{writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));stop();}
