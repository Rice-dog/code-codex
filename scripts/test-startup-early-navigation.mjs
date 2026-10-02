import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
// Only replace the app:// origin gate for this isolated HTTP fixture; player is unchanged.
const entry=readFileSync('packages/explorer-ui/src/startup-transition-early.ts','utf8').replace(/const valid = [\s\S]*?;\r?\nconst state/, 'const valid = window === window.top;\nconst state');
const source=buildSync({stdin:{contents:entry,resolveDir:'packages/explorer-ui/src',loader:'ts'},bundle:true,write:false,format:'iife',define:{__CODE_CODEX_STARTUP_TRANSITION_CSS__:JSON.stringify(readFileSync('packages/explorer-ui/src/startup-transition.css','utf8'))}}).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><main class="main-surface"></main><div id="loading">Loading</div></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/index.html`;
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+process.cwd()+'/artifacts/early-navigation-'+Date.now(),'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const browser=await new Promise((resolve,reject)=>{let log='';child.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});child.once('error',reject);});
const ws=new WebSocket(browser);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});let session;
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
 const targets=await command('Target.getTargets');({sessionId:session}=await command('Target.attachToTarget',{targetId:targets.targetInfos.find(t=>t.type==='page').targetId,flatten:true}));await command('Page.enable',{},session);await command('Page.navigate',{url},session);await wait(300);
 await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,160,90);const stream=c.captureStream(20),r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];r.ondataavailable=e=>chunks.push(e.data);const done=new Promise(ok=>r.onstop=ok);r.start();const timer=setInterval(()=>{x.fillStyle='blue';x.fillRect(0,0,160,90)},40);await new Promise(ok=>setTimeout(ok,2100));r.stop();await done;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:'video/webm'});await new Promise((ok,bad)=>{const q=indexedDB.open('code-codex-startup-transition',1);q.onupgradeneeded=()=>q.result.createObjectStore('video',{keyPath:'id'});q.onerror=()=>bad(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'selected',blob,name:'fixture.webm',duration:2,size:blob.size,type:blob.type});tx.oncomplete=()=>{db.close();ok()};}});localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,clipStart:0,clipEnd:2,minimumVisiblePercent:0,fadePercent:20,playbackRate:1}));})()`);
 await command('Page.addScriptToEvaluateOnNewDocument',{source},session);
 await command('Page.navigate',{url},session);await wait(1000);
 const loading=await evaluate(`({status:window.__CODE_CODEX_EARLY_STARTUP_STATUS__,hosts:document.querySelectorAll('body>.code-codex-startup-host').length,events:window[Symbol.for('code-codex:runtime-events:v1')].events})`);
 assert.equal(loading.status.stage,'playing');assert.equal(loading.hosts,1);assert.ok(loading.events.some(e=>e.action==='first painted frame'));
 await evaluate(source);assert.equal(await evaluate(`document.querySelectorAll('body>.code-codex-startup-host').length`),1);
 await evaluate(`document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await wait(2300);assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'complete');
 await command('Page.navigate',{url},session);await wait(800);assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'playing');
 await evaluate(`document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await wait(2300);
 const backgroundResults=[];
 await evaluate(`(async()=>{await new Promise((ok,bad)=>{const q=indexedDB.open('code-codex-startup-transition',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('video','readwrite');tx.objectStore('video').clear();tx.oncomplete=()=>{db.close();ok()};tx.onerror=()=>bad(tx.error);};});})()`);
 for(const backgroundId of ['glow-horizon','black-hole','heavenly-cloud','aurora-ionosphere','milky-way','mountain','cloud-train','blinking-squares']) {
   await evaluate(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:${JSON.stringify(backgroundId)},backgroundDuration:1,minimumVisiblePercent:0,fadePercent:20,backgroundFadeSeconds:2}))`);
   const before=await evaluate(`JSON.stringify(Object.entries(localStorage).filter(([key])=>key!=='code-codex:startup-transition:v1').sort())`);
   await command('Page.navigate',{url},session);await wait(1100);
   const result=await evaluate(`({status:window.__CODE_CODEX_EARLY_STARTUP_STATUS__,events:window[Symbol.for('code-codex:runtime-events:v1')].events,host:!!document.querySelector('body>.code-codex-startup-host')})`);
   assert.equal(result.status.stage,'playing',backgroundId+JSON.stringify(result));assert.equal(result.host,true);
   assert.ok(result.events.some(e=>e.action==='background renderer'&&e.outcome==='started'));assert.ok(!result.events.some(e=>e.action==='video lookup'));
   await evaluate(`document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await wait(500);assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'playing','background remains visible for at least four seconds even when already ready');await wait(2600);
   if(backgroundId==='glow-horizon') {
     for(let retry=0;retry<30&&await evaluate(`window[Symbol.for('code-codex:startup-transition:controller:v1')].phase`)!=='exiting';retry++)await wait(100);
     await wait(400);
     const fade=await evaluate(`(()=>{const h=document.querySelector('body>.code-codex-startup-host'),o=h?.shadowRoot.querySelector('.codex-startup'),events=window[Symbol.for('code-codex:runtime-events:v1')].events;return {opacity:o?Number(getComputedStyle(o).opacity):null,events:events.filter(e=>e.action==='fade')};})()`);
     assert.ok(fade.opacity>0&&fade.opacity<1,JSON.stringify(fade));assert.ok(fade.events.some(e=>e.details.durationMs===2000&&e.details.minimumVisibleMs===4000),JSON.stringify(fade));
   }
   for(let retry=0;retry<50&&await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage')!=='complete';retry++)await wait(100);
   assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'complete');assert.equal(await evaluate(`!!document.querySelector('body>.code-codex-startup-host')`),false);
   assert.equal(await evaluate(`JSON.stringify(Object.entries(localStorage).filter(([key])=>key!=='code-codex:startup-transition:v1').sort())`),before,'regular background preferences unchanged');backgroundResults.push(backgroundId);
 }
 console.log('Background loading startup, no-video path, readiness fade, cleanup and unchanged background preferences passed:',backgroundResults);
 writeFileSync('artifacts/startup-078-early-navigation.json',JSON.stringify(loading,null,2));
 console.log('Early startup: new-document loading playback, real video first frame, duplicate guard, native-ready fade and navigation replay passed.');
} finally {await Promise.race([command('Browser.close').catch(()=>{}),new Promise(r=>setTimeout(r,2000))]);ws.close();child.kill();server.close();}
