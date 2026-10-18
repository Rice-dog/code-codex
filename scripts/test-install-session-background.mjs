import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {installedBackgroundFixture} from './background-package-fixture.mjs';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),out=resolve(root,'artifacts/install-session-custom-background');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import {ExplorerBridge} from './bridge';window.TestBridge=ExplorerBridge;`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',write:true,outfile:resolve(out,'bridge-test.js')});
const fixture=readFileSync(resolve(root,'scripts/test-startup-source-settings.mjs'),'utf8'),home=fixture.match(/const home = `([^`]+)`;/)[1],css=fixture.match(/<style>([\s\S]*?)<\/style>/)[1];
const setup=`window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.calls=[];window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.1007.2314.0',supported:true};window.__codeCodex={request:async({method,params})=>{calls.push(method);if(method==='explorer.context')return{threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};if(method==='explorer.list')return{entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};if(method==='explorer.settings.get')return{panelWidth:260};return{};}};`;
const html=`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="native-root">${home}</div><script>${setup}</script><script src="/plugins.js"></script><script src="/explorer.js"></script><script src="/bridge-test.js"></script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url?.endsWith('.js')?'text/javascript':'text/html');res.end(req.url==='/plugins.js'?installedBackgroundFixture(root):req.url==='/explorer.js'?readFileSync(resolve(ui,'dist/explorer.js')):req.url==='/bridge-test.js'?readFileSync(resolve(out,'bridge-test.js')):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`),ev=e=>browser.evaluate(e),report={checks:[]};
async function wait(expression){for(let i=0;i<160;i++){if(await ev(expression))return;await delay(50);}throw Error('Timed out: '+expression);}
async function check(name,expression){assert.equal(await ev(expression),true,name);report.checks.push(name);}
try{
 await wait(`document.querySelector('[data-code-codex-owned]')?.dataset.state==='ready'`);
 await ev(`window.host=document.querySelector('[data-code-codex-owned]');window.s=host.shadowRoot;window.q=selector=>s.querySelector(selector);window.beforeContext=calls.filter(v=>v==='explorer.context').length;history.replaceState(null,'','#/login');window.__codeCodexInject();`);
 await check('Login hides and disables the retained tree',`host.hasAttribute('inert')&&host.hasAttribute('data-home-view-hidden')`);
 await ev(`history.replaceState(null,'','/');window.__codeCodexInject();`);
 await wait(`host.dataset.state==='ready'&&calls.filter(v=>v==='explorer.context').length>beforeContext`);
 await check('Returning from login reinitializes the same tree and native context',`document.querySelector('[data-code-codex-owned]')===host&&!host.hasAttribute('inert')`);
 await ev(`s.querySelector('.preview-market-button').click()`);
 await check('Preview Market still opens after account boundary',`q('.preview-market-popover').hidden===false`);
 await ev(`q('.custom-background-settings').click()`);await wait(`!!q('.custom-background-file')&&!q('.custom-background-panel').hidden`);
 await ev(`(async()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#bf583e';ctx.fillRect(0,0,160,90);ctx.fillStyle='#efe6d5';ctx.fillRect(25,15,110,60);const image=await new Promise(r=>canvas.toBlob(r,'image/png'));const stream=canvas.captureStream(12),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});const done=new Promise(r=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=r;});recorder.start();const draw=setInterval(()=>{ctx.fillStyle='#457785';ctx.fillRect(50,25,60,40);},65);await new Promise(r=>setTimeout(r,1400));clearInterval(draw);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());const dt=new DataTransfer();dt.items.add(new File([image],'Image.png',{type:'image/png'}));dt.items.add(new File(chunks,'Video.webm',{type:'video/webm'}));q('.custom-background-file').files=dt.files;q('.custom-background-file').dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`q('.custom-background-panel .particle-source-count').textContent==='2 / 32'`);
 await check('Images and videos share compact Startup library cards and add card',`q('.custom-background-panel .particle-library-grid').children.length===3&&q('.custom-background-panel .startupTransition-add-card')!==null`);
 await ev(`const x=q('[data-custom-setting="x"]');x.value='23';x.dispatchEvent(new Event('input',{bubbles:true}));q('.custom-background-enable').click();`);
 await wait(`document.querySelector('[data-code-codex-custom-layer] video')!==null`);
 await check('Selected video is muted, looping and positioned without re-encoding',`(()=>{const v=document.querySelector('[data-code-codex-custom-layer] video');return v.muted&&v.loop&&v.style.transform.includes('23%')&&v.src.startsWith('blob:')})()`);
 await ev(`q('.custom-background-panel .particle-library-select').click()`);
 await check('Selecting an image restores its own parameters',`q('[data-custom-setting="x"]').value==='0'&&!!document.querySelector('[data-code-codex-custom-layer] img')`);
 await ev(`q('.custom-background-panel .particle-library-item:nth-child(2) .particle-library-select').click()`);
 await check('Selecting video restores its saved independent position',`q('[data-custom-setting="x"]').value==='23'`);
 const shot=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'custom-background-panel.png'),Buffer.from(shot.data,'base64'));
 await ev(`q('.custom-background-panel .particle-library-delete').click()`);await wait(`q('.custom-background-panel .particle-source-count').textContent==='1 / 32'`);
 await ev(`q('.custom-background-close').click();q('.custom-background-enable').click()`);
 await check('Disabling removes the media layer and restores native presentation',`!document.querySelector('[data-code-codex-custom-layer]')&&!document.documentElement.hasAttribute('data-code-codex-custom-background')`);
 const multiplex=await ev(`(async()=>{window.__testNative=encoded=>{const r=JSON.parse(encoded);setTimeout(()=>window.__testReplies({id:r.id,ok:true,result:r.method}),10);};const a=new TestBridge('test','__testNative','__testReplies',200),b=new TestBridge('test','__testNative','__testReplies',200);const values=await Promise.all([a.request('explorer.first'),b.request('explorer.second')]);a.dispose();values.push(await b.request('explorer.third'));b.dispose();return values;})()`);
 assert.deepEqual(multiplex,['explorer.first','explorer.second','explorer.third']);report.checks.push('Multiple Bridge clients receive their own replies and survive peer disposal');
 report.errors=await ev('errors');assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=String(e);report.panel=await ev(`({error:q('.custom-background-error')?.textContent,count:q('.custom-background-panel .particle-source-count')?.textContent})`).catch(()=>null);report.errors=await ev('errors').catch(()=>[]);throw e;}finally{writeFileSync(resolve(out,'browser-result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(report);
