import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const out=resolve(root,process.env.CODE_CODEX_TEST_OUTPUT??'artifacts/custom-background-sync');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({entryPoints:[resolve(ui,'src/custom-background.ts')],bundle:true,format:'iife',globalName:'TestCustom',outfile:resolve(out,'custom.js')});
const html=`<!doctype html><body><div id="fixture"></div><script src="/custom.js"></script></body>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/custom.js'?'text/javascript':'text/html');res.end(req.url==='/custom.js'?readFileSync(resolve(out,'custom.js')):html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),ev=e=>browser.evaluate(e),report={checks:[]};
async function check(name,expression){assert.equal(await ev(expression),true,name);report.checks.push(name);}
async function wait(expression){for(let i=0;i<160;i++){if(await ev(expression))return;await delay(50);}throw Error('Timed out: '+expression);}
try{
 await wait(`!!document.querySelector('#fixture')&&!!window.TestCustom`);
 await ev(`(async()=>{
  window.errors=[];window.urls=new Set();window.created=0;const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=b=>{const u=create(b);urls.add(u);created++;return u;};URL.revokeObjectURL=u=>{urls.delete(u);revoke(u);};
  window.s=document.querySelector('#fixture').attachShadow({mode:'open'});
  s.innerHTML='<article class="preview-extension" data-appearance-plugin="code-codex.custom-background-background"><button class="custom-background-enable">Enable</button><span class="custom-background-status"></span><button class="custom-background-settings">Settings</button></article><section class="particle-settings-panel custom-background-panel" popover="manual" hidden></section>';
  window.q=selector=>s.querySelector(selector);window.controller=new TestCustom.CustomBackground(s,async()=>{},(code,e)=>errors.push(code+': '+e));await controller.ready;
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#bf583e';ctx.fillRect(0,0,160,90);
  const image=await new Promise(r=>canvas.toBlob(r));const stream=canvas.captureStream(12),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
  const done=new Promise(r=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=r;});recorder.start();const draw=setInterval(()=>{ctx.fillStyle='#457785';ctx.fillRect(Math.random()*100,25,40,40);},60);await new Promise(r=>setTimeout(r,2200));clearInterval(draw);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  await controller.importFiles([new File([image],'Image.png',{type:'image/png'}),new File(chunks,'Video.webm',{type:'video/webm'})]);
  q('.custom-background-enable').click();
 })()`);
 await wait(`document.querySelector('[data-code-codex-custom-layer] video')?.readyState>=2`);
 await ev(`window.active=document.querySelector('[data-code-codex-custom-layer] video');window.source=active.src;window.resets=0;window.backgroundWrites=0;const timeProperty=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');Object.defineProperty(active,'currentTime',{get(){return timeProperty.get.call(this)},set(v){backgroundWrites++;timeProperty.set.call(this,v)},configurable:true});active.addEventListener('emptied',()=>resets++);active.addEventListener('loadstart',()=>resets++);`);
 await delay(1100);
 await ev(`q('.custom-background-settings').click()`);
 await wait(`q('.custom-background-preview video')?.readyState>=2`);
 await delay(180);
 report.firstOpen=await ev(`({background:active.currentTime,preview:q('.custom-background-preview video').currentTime})`);
 await check('First open follows the already playing background instead of starting at zero',`Math.abs(active.currentTime-q('.custom-background-preview video').currentTime)<.16`);
 await ev(`window.preview=q('.custom-background-preview video');window.previewSource=preview.src;window.cards=[...q('.particle-library-grid').children];controller.close()`);
 await delay(850);
 await ev(`q('.custom-background-settings').click()`);await delay(200);
 await check('Reopen catches up to background without replacing either player or cards',`document.querySelector('[data-code-codex-custom-layer] video')===active&&active.src===source&&q('.custom-background-preview video')===preview&&preview.src===previewSource&&cards.every((c,i)=>q('.particle-library-grid').children[i]===c)&&Math.abs(active.currentTime-preview.currentTime)<.16`);
 await check('Opening and reopening never reload or seek the background to match the preview',`resets===0&&backgroundWrites===0`);
 await ev(`active.pause();active.currentTime=.65`);await delay(250);
 await check('Preview follows background seek and pause, without restarting the background',`preview.paused&&Math.abs(active.currentTime-preview.currentTime)<.12&&document.querySelector('[data-code-codex-custom-layer] video')===active`);
 await ev(`active.currentTime=1.7;const speed=q('[data-custom-setting=speed]');speed.value='2';speed.dispatchEvent(new Event('input',{bubbles:true}));active.play()`);
 report.samples=[];
 for(let i=0;i<16;i++){await delay(140);report.samples.push(await ev(`({background:active.currentTime,preview:preview.currentTime,rate:preview.playbackRate,drift:Math.abs(active.currentTime-preview.currentTime)})`));}
 assert.ok(report.samples.slice(2).every(s=>s.drift<.18&&s.rate===2),'Ongoing playback and loops stay within180ms');report.checks.push('Preview follows2x playback across loops with bounded drift');
 await ev(`controller.close();window.pausedTime=preview.currentTime`);await delay(300);
 await check('Closing leaves background running and preview paused',`!active.paused&&preview.paused&&preview.currentTime===pausedTime`);
 await ev(`q('.custom-background-settings').click();q('.custom-background-enable').click()`);await delay(100);
 await check('Disabled background still permits the retained preview to play independently',`!document.querySelector('[data-code-codex-custom-layer]')&&q('.custom-background-preview video')===preview&&!preview.paused`);
 await ev(`q('.custom-background-enable').click()`);await wait(`!!document.querySelector('[data-code-codex-custom-layer] video')`);await delay(200);
 await check('Re-enabling follows the new authoritative background clock',`q('.custom-background-preview video')===preview&&Math.abs(document.querySelector('[data-code-codex-custom-layer] video').currentTime-preview.currentTime)<.16`);
 await ev(`q('.particle-library-select').click()`);
 await check('Actual material selection replaces image sources and leaves no video synchronization active',`!!document.querySelector('[data-code-codex-custom-layer] img')&&!!q('.custom-background-preview img')&&!active.isConnected`);
 await ev(`controller.dispose()`);await delay(120);
 await check('Disposal releases all URLs and produces no late sync/play errors',`urls.size===0&&!document.querySelector('[data-code-codex-custom-layer]')&&errors.length===0`);
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.errors=await ev('errors').catch(()=>[]);throw e;}
finally{writeFileSync(resolve(out,'sync-result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(report,null,2));
