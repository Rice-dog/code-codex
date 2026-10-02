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
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0','--user-data-dir='+process.cwd()+'/artifacts/early-navigation-'+Date.now(),'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
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
 const loading=await evaluate(`({status:window.__CODE_CODEX_EARLY_STARTUP_STATUS__,hosts:document.querySelectorAll('body>.code-codex-startup-host').length,events:window[Symbol.for('code-codex:runtime-events:v1')].events.map(e=>e.action)})`);
 assert.equal(loading.status.stage,'playing');assert.equal(loading.hosts,1);assert.ok(loading.events.includes('first painted frame'));
 await evaluate(source);assert.equal(await evaluate(`document.querySelectorAll('body>.code-codex-startup-host').length`),1);
 await evaluate(`document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await wait(2300);assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'complete');
 await command('Page.navigate',{url},session);await wait(800);assert.equal(await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage'),'playing');
 await evaluate(`document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await wait(2300);
 writeFileSync('artifacts/startup-078-early-navigation.json',JSON.stringify(loading,null,2));
 console.log('Early startup: new-document loading playback, real video first frame, duplicate guard, native-ready fade and navigation replay passed.');
} finally {await command('Browser.close').catch(()=>{});ws.close();server.close();}
