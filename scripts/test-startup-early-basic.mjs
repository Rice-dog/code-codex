import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build,stop} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),version=JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version,out=resolve(root,`artifacts/startup-basic-v${version}`);mkdirSync(out,{recursive:true});
const pkg=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8')).find(p=>p.id==='codex-startup-transition');
const player=readFileSync(resolve(ui,'dist/plugins',pkg.category,pkg.id,pkg.asset),'utf8'),entry=readFileSync(resolve(ui,'src/startup-transition-early.ts'),'utf8').replace(/const valid = [\s\S]*?;\r?\nconst state/,'const valid = window === window.top;\nconst state');
const early=(await build({stdin:{contents:entry,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body><main class="main-surface" style="height:300px"></main>Loading</body>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`,browser=await launchFixture(url),report={version,checks:[],classification:'Production early/player in isolated new renderer documents, original WebM library and actual decoded dimensions; no full UI or official cold launch'};
const ev=x=>browser.evaluate(`(async()=>{${x.trim().startsWith('(')||!x.includes(';')?'return('+x+')':x}})()`);async function wait(x){for(let n=0;n<400;n++){if(await ev(x))return;await delay(40);}throw Error('Timeout '+x);}
try{
 await wait("document.readyState==='complete'");await ev(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,160,90);const stream=c.captureStream(15),parts=[],r=new MediaRecorder(stream,{mimeType:'video/webm'});const blob=await new Promise(ok=>{r.ondataavailable=e=>parts.push(e.data);r.onstop=()=>{clearInterval(t);stream.getTracks().forEach(t=>t.stop());ok(new Blob(parts,{type:'video/webm'}))};const t=setInterval(()=>x.fillRect(0,0,160,90),60);r.start();setTimeout(()=>r.stop(),1600)});const db=await new Promise(ok=>{const r=indexedDB.open('code-codex-startup-transition',1);r.onupgradeneeded=()=>r.result.createObjectStore('video',{keyPath:'id'});r.onsuccess=()=>ok(r.result)});await new Promise(ok=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'selected',blob,name:'Original.webm',duration:1.6,size:blob.size,type:'video/webm'});tx.oncomplete=ok});db.close();window.profile={clipStart:.2,clipEnd:1.5,playbackRate:1.5,videoBrightness:.8,videoFit:'cover',minimumVisiblePercent:0,fadePercent:50};})()`);
 await browser.command('Page.enable');
 await browser.command('Page.addScriptToEvaluateOnNewDocument',{source:player+'\n'+early});
 for(const oldFlag of [false,true]){
  await ev(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,advancedOptions:${oldFlag},project:{version:1,tracks:[[],[]]},...profile,selectedVideoId:'selected',nextVideoId:'selected',videoOrder:['selected'],videoProfiles:{selected:profile}}))`);
  await browser.command('Page.navigate',{url});await wait(`!!document.querySelector('.code-codex-startup-host')?.shadowRoot.querySelector('video')?.videoWidth`);
  const value=await ev(`(()=>{const v=document.querySelector('.code-codex-startup-host').shadowRoot.querySelector('video');return{width:v.videoWidth,height:v.videoHeight,rate:v.playbackRate,fit:getComputedStyle(v).objectFit,videoCount:document.querySelector('.code-codex-startup-host').shadowRoot.querySelectorAll('video').length}})()`);
  assert.deepEqual(value,{width:160,height:90,rate:1.5,fit:'cover',videoCount:1});report.checks.push(`old advanced=${oldFlag}: early startup uses only the original video and basic profile without a derived cache`);
  await ev(`document.querySelector('main').append(Object.assign(document.createElement('form'),{textContent:'Ready'}));const nav=document.createElement('nav');nav.setAttribute('data-app-navigation-rail','');document.body.append(nav);`);await wait(`window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage==='complete'`);
  assert.equal(await ev(`!document.querySelector('.code-codex-startup-host')&&!window[Symbol.for('code-codex:background-startup-hold:v1')].active`),true);report.checks.push(`old advanced=${oldFlag}: native-ready fade and background handoff complete without a file-tree UI`);
  // Per-document helper variables disappear on navigation; only persistent basic profile is needed.
  await ev(`window.profile=window[Symbol.for('code-codex:plugin-modules:v1')].get('codex-startup-transition').exports.readStartupTransitionSettings()`);
 }
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error);report.snapshot=await ev(`({status:window.__CODE_CODEX_EARLY_STARTUP_STATUS__,settings:localStorage.getItem('code-codex:startup-transition:v1'),events:window[Symbol.for('code-codex:runtime-events:v1')]?.events})`).catch(()=>null);throw error;}finally{writeFileSync(resolve(out,'early-basic.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));stop();}
