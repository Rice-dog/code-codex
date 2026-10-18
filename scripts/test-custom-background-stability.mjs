import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const out=resolve(root,process.env.CODE_CODEX_TEST_OUTPUT??'artifacts/custom-background-stability');mkdirSync(out,{recursive:true});
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
 await ev(`window.active=document.querySelector('[data-code-codex-custom-layer] video');window.layer=active.parentElement;window.thumbs=[...q('.particle-library-grid').children];window.source=active.src;window.resets=0;active.addEventListener('emptied',()=>resets++);active.addEventListener('loadstart',()=>resets++);window.nodesRemoved=0;window.observer=new MutationObserver(records=>{for(const r of records)nodesRemoved+=r.removedNodes.length});observer.observe(q('.particle-library-grid'),{childList:true});window.timeBefore=active.currentTime;q('.custom-background-settings').click();`);
 await check('Opening settings retains the active video, layer and original source',`document.querySelector('[data-code-codex-custom-layer] video')===active&&active.parentElement===layer&&active.src===source`);
 await check('Opening settings retains every library card',`thumbs.every((n,i)=>q('.particle-library-grid').children[i]===n)`);
 await wait(`q('.custom-background-preview video')?.readyState>=2`);
 await ev(`window.preview=q('.custom-background-preview video');window.previewSource=preview.src;window.createdBefore=created;`);
 for(let i=0;i<6;i++){await ev(`controller.close();q('.custom-background-settings').click()`);await delay(100);}
 await ev(`for(let i=0;i<20;i++){controller.close();q('.custom-background-settings').click();}`);
 await delay(100);
 await check('Rapid close/reopen suppresses only obsolete play attempts without reporting intentional pauses',`errors.length===0&&!active.paused&&q('.custom-background-preview video')===preview`);
 await check('Six reopen cycles retain preview DOM and URL without creating new object URLs',`q('.custom-background-preview video')===preview&&preview.src===previewSource&&created===createdBefore`);
 await check('Library is never cleared during reopen and active video receives no load/reset event',`nodesRemoved===0&&resets===0&&document.querySelector('[data-code-codex-custom-layer] video')===active&&!active.paused&&active.currentTime!==timeBefore`);
 await ev(`controller.close()`);
 await check('Closing pauses only the preview and preserves active playback',`preview.paused&&!active.paused&&active.isConnected`);
 await ev(`q('.custom-background-settings').click();q('.particle-library-select').click();`);
 await wait(`document.querySelector('[data-code-codex-custom-layer] img')?.complete`);
 await ev(`active.onerror?.(new Event('error'));preview.onerror?.(new Event('error'))`);
 await check('Late decoder errors from replaced media cannot overwrite current status',`errors.length===0`);
 await ev(`window.image=document.querySelector('[data-code-codex-custom-layer] img');window.imageSource=image.src;window.imagePreview=q('.custom-background-preview img');window.createdBefore=created;`);
 for(let i=0;i<4;i++){await ev(`controller.close();q('.custom-background-settings').click()`);await delay(50);}
 await check('Image background and preview also survive repeated reopen with no URL allocation',`document.querySelector('[data-code-codex-custom-layer] img')===image&&image.src===imageSource&&q('.custom-background-preview img')===imagePreview&&created===createdBefore`);
 await ev(`q('.particle-library-select').click();const scale=q('[data-custom-setting=scale]');scale.value='150';scale.dispatchEvent(new Event('input',{bubbles:true}));`);
 await check('Selecting the current item and changing parameters retain image and thumbnail identities',`document.querySelector('[data-code-codex-custom-layer] img')===image&&image.style.transform.includes('1.5')&&thumbs.every((n,i)=>q('.particle-library-grid').children[i]===n)`);
 await ev(`q('.particle-library-item:nth-child(2) .particle-library-delete').click()`);
 await wait(`q('.particle-source-count').textContent==='1 / 32'`);
 await check('Deleting another material does not restart the selected background',`document.querySelector('[data-code-codex-custom-layer] img')===image`);
 await ev(`q('.custom-background-enable').click()`);
 await check('Disabling removes only the active layer, keeping the open preview',`!document.querySelector('[data-code-codex-custom-layer]')&&q('.custom-background-preview img')===imagePreview`);
 await ev(`q('.custom-background-enable').click()`);
 await wait(`!!document.querySelector('[data-code-codex-custom-layer]')`);
 await ev(`window.dispatchEvent(new Event('code-codex:custom-background-stop'))`);
 await check('External background stop releases the active layer but retains preview',`!document.querySelector('[data-code-codex-custom-layer]')&&q('.custom-background-preview img')===imagePreview`);
 await ev(`controller.dispose();observer.disconnect()`);
 await check('Dispose releases all object URLs and media, without intentional-pause errors',`urls.size===0&&!document.querySelector('[data-code-codex-custom-layer]')&&q('.custom-background-preview').childElementCount===0&&errors.length===0`);
 report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.errors=await ev('errors').catch(()=>[]);throw e;}
finally{writeFileSync(resolve(out,'stability-result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(report,null,2));
