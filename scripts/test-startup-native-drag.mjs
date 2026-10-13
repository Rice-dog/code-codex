import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build,stop} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {installedBackgroundFixture} from './background-package-fixture.mjs';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const version=JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version;
const out=resolve(root,`artifacts/startup-panel-v${version}`);mkdirSync(out,{recursive:true});
const helper=(await build({bundle:true,write:false,format:'iife',stdin:{contents:"import * as settings from './startup-transition-settings';window.librarySettings=settings;",resolveDir:resolve(ui,'src'),loader:'ts'}})).outputFiles[0].text;
const original=readFileSync(resolve(root,'scripts/test-startup-source-settings.mjs'),'utf8');
const home=original.match(/const home = `([^`]+)`;/)[1],css=original.match(/<style>([\s\S]*?)<\/style>/)[1];
const bundle=installedBackgroundFixture(root)+readFileSync(resolve(ui,'dist/explorer.js'),'utf8')+'\n'+helper;
const html=`<!doctype html><html data-theme="dark"><meta charset="utf-8"><style>${css}</style><body><div id="native-root">${home}</div><script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.1007.2314.0',supported:true};window.__codeCodex={request:async({method,params})=>{if(method==='explorer.settings.get'||method==='explorer.settings.set')return{collapsed:false,panelWidth:260,startupTransitionEnabled:false};if(method==='explorer.context')return{threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};if(method==='explorer.list')return{entries:[]};if(method==='explorer.watch.start')return{watching:true};if(method==='explorer.storage.request'){if(params.action==='settings.read')return{};if(params.action==='media.list')return[];}return{};}};</script><script src="/core.js"></script></body></html>`;
const server=createServer((req,res)=>{if(req.url==='/core.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);}else if(req.url?.endsWith('.js')){res.setHeader('Content-Type','text/javascript');res.end('export const adapter={appActions:{runInPrimaryWindow:async()=>({mode:"dark"})},clientCoordination:{invalidateQueryCache:async()=>({})}};');}else{res.setHeader('Content-Type','text/html');res.end(html);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/index.html`);const ev=expression=>browser.evaluate(`(async()=>{${expression.includes(';')?expression:'return ('+expression+')'}})()`);
const report={version,classification:'Real production core and downloaded player; generated WebM, actual IndexedDB and mouse/keyboard; simulated native bridge, no official account touched',checks:[]};
async function wait(expr,budget=12000){for(let i=0;i<budget;i+=40){if(await ev(expr))return;await delay(40);}throw Error('Timeout: '+expr);}
async function check(name,expr){assert.equal(await browser.evaluate(`(async()=>(${expr}))()`),true,name);report.checks.push(name);}
async function screenshot(name){const s=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,name+'.png'),Buffer.from(s.data,'base64'));}
try{
 await browser.command('Page.enable');await browser.command('Page.bringToFront');await wait('!!window.librarySettings');
 await ev(`window.viewer=document.querySelector('code-codex-v${version.replaceAll('.','-')}');window.q=s=>viewer.shadowRoot.querySelector(s);window.api=window[Symbol.for('code-codex:plugin-modules:v1')].get('codex-startup-transition').exports;window.s=librarySettings;`);
 await ev(`window.openVideoDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('code-codex-startup-transition',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('video'))r.result.createObjectStore('video',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});window.fixtureBlob=await new Promise(resolve=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');let t=0;const draw=()=>{ctx.fillStyle='#2955e9';ctx.fillRect(0,0,320,180);ctx.fillStyle='#ffca62';ctx.fillRect((t++%20)*10,40,40,100)};draw();const stream=c.captureStream(15),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm'});r.ondataavailable=e=>chunks.push(e.data);r.onstop=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());resolve(new Blob(chunks,{type:'video/webm'}))};const timer=setInterval(draw,60);r.start();setTimeout(()=>r.stop(),1400)});const db=await openVideoDB();await new Promise((resolve,reject)=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'selected',blob:fixtureBlob,name:'Legacy.webm',duration:1.4,size:fixtureBlob.size,type:'video/webm'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();s.writeStartupTransitionSettings({...s.readStartupTransitionSettings(),source:'video',clipStart:.2,clipEnd:1.1,fadePercent:8,minimumVisiblePercent:0});`);

 await ev(`viewer.openPreviewMarket()`);await delay(100);await ev(`q('.startupTransition-settings-trigger').click()`);
 await wait(`q('.startupTransition-video-still').readyState>=2`);

 await ev(`q('.startupTransition-settings-trigger').click();s.writeStartupTransitionSettings({...s.readStartupTransitionSettings(),advancedOptions:true,project:{version:1,tracks:[[],[]]}});q('.startupTransition-settings-trigger').click()`);
 await wait(`!!q('.startup-video-editor')?.querySelector('.particle-library-select img[src]')`);
 await ev(`window.e=s=>q('.startup-video-editor').querySelector(s);window.dragTrace=[];for(const type of ['dragstart','dragenter','dragover','drop','dragend']){q('.startup-video-editor').addEventListener(type,event=>dragTrace.push({type,target:event.target.tagName,types:Array.from(event.dataTransfer?.types??[]),effect:event.dataTransfer?.dropEffect,prevented:event.defaultPrevented,x:event.clientX,y:event.clientY}),true);viewer.addEventListener(type,event=>dragTrace.push({phase:'host',type,types:Array.from(event.dataTransfer?.types??[]),effect:event.dataTransfer?.dropEffect,prevented:event.defaultPrevented}))}e('.se-timeline').scrollIntoView({block:'start'})`);
 await delay(200);
 async function nativeDrag(track,part='img',end='lane'){
   await ev(`e('.se-timeline').scrollIntoView({block:'start'})`);await delay(100);
   const points=await browser.evaluate(`(()=>{const card=e('.particle-library-select[aria-pressed="true"] ${part}').getBoundingClientRect(),lane=e('.se-track[data-track="${track}"] .se-lane').getBoundingClientRect();return{source:{x:card.left+card.width/2,y:card.top+card.height/2},target:{x:lane.left,y:lane.top+lane.height/2}}})()`);
   if(end==='outside'){points.target.x=130;points.target.y=60;}
   report.geometry=points;
   await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...points.source});
   await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',...points.source,button:'left',buttons:1,clickCount:1});
   for(let n=1;n<=12;n++){await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.source.x+(points.target.x-points.source.x)*n/12,y:points.source.y+(points.target.y-points.source.y)*n/12,button:'left',buttons:1});await delay(25);}
   for(let n=0;n<3;n++){await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.target.x+2,y:points.target.y,button:'left',buttons:1});await delay(50);}
   await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.target.x+2,y:points.target.y,button:'left',clickCount:1});await delay(400);
 }
 await nativeDrag(0);
 report.trace=await ev('dragTrace');report.project=await ev('s.readStartupTransitionSettings().project');
 await screenshot('native-library-drag');
 await check('Native mouse thumbnail drag inserts into empty V1',`s.readStartupTransitionSettings().project.tracks[0].length===1`);
 await check('Thumbnail is non-draggable and card drag payload excludes Files and image URL',`(()=>{const start=dragTrace.find(e=>e.type==='dragstart'),over=dragTrace.filter(e=>e.type==='dragover');return !e('.particle-library-thumb').draggable&&start.target==='BUTTON'&&over.length>0&&over.every(e=>!e.types.includes('Files')&&!e.types.includes('text/uri-list'))&&dragTrace.some(e=>e.type==='drop')})()`);
 await nativeDrag(1,'.particle-library-name');
 await check('Real filename drag inserts V2 with independent clip id and same source',`(()=>{const p=s.readStartupTransitionSettings().project;return p.tracks[1].length===1&&p.tracks[0][0].id!==p.tracks[1][0].id&&p.tracks[0][0].videoId===p.tracks[1][0].videoId})()`);
 await ev(`window.beforeRejected=JSON.stringify(s.readStartupTransitionSettings().project)`);await nativeDrag(0);
 await check('Occupied native drop rejects without changing clips or leaving feedback',`JSON.stringify(s.readStartupTransitionSettings().project)===beforeRejected&&!e('.se-lane[data-drop-state]')&&e('.se-snap-line').hidden`);
 await nativeDrag(1,'img','outside');
 await check('Real drag cancelled outside timeline leaves clips and media unchanged',`JSON.stringify(s.readStartupTransitionSettings().project)===beforeRejected&&(await api.listStartupVideos()).length===1&&!e('.se-lane[data-drop-state]')&&e('.se-snap-line').hidden`);
 async function reopenEmpty(){await ev(`q('.startupTransition-settings-trigger').click();s.writeStartupTransitionSettings({...s.readStartupTransitionSettings(),project:{version:1,tracks:[[],[]]}});q('.startupTransition-settings-trigger').click()`);await wait(`!!e('.particle-library-thumb[src]')`);}
 await reopenEmpty();
 await ev(`window.savedSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='code-codex:startup-transition:v1')throw new DOMException('Fixture quota','QuotaExceededError');return savedSet.call(this,k,v)}`);await nativeDrag(0);await ev(`Storage.prototype.setItem=savedSet`);
 await check('Native drag save failure rolls back instead of silently inserting',`s.readStartupTransitionSettings().project.tracks.flat().length===0&&!e('.se-clip')&&q('.startup-video-editor').dataset.statusError==='true'`);
 await nativeDrag(0);
 await check('Native drag retry after save failure inserts and clears old error',`s.readStartupTransitionSettings().project.tracks[0].length===1&&q('.startup-video-editor').dataset.statusError==='false'`);
 await ev(`window.mixed=new DataTransfer();mixed.setData('application/x-codecodex-video','selected');mixed.items.add(new File(['image'],'thumbnail.png',{type:'image/png'}));const lane=e('.se-track[data-track="1"] .se-lane'),r=lane.getBoundingClientRect();window.hostOver=0;viewer.addEventListener('dragover',()=>hostOver++);lane.dispatchEvent(new DragEvent('dragover',{bubbles:true,composed:true,cancelable:true,dataTransfer:mixed,clientX:r.left,clientY:r.top+24}));window.mixedEffect=mixed.dropEffect;lane.dispatchEvent(new DragEvent('drop',{bubbles:true,composed:true,cancelable:true,dataTransfer:mixed,clientX:r.left,clientY:r.top+24}));`);
 await check('Mixed internal video plus Files payload stays owned by editor and inserts',`hostOver===0&&s.readStartupTransitionSettings().project.tracks[1].length===1`);
 await ev(`window.beforeExternal=JSON.stringify(s.readStartupTransitionSettings().project);const dt=new DataTransfer();dt.items.add(new File(['text'],'external.txt',{type:'text/plain'}));const lane=e('.se-lane'),r=lane.getBoundingClientRect();lane.dispatchEvent(new DragEvent('dragover',{bubbles:true,composed:true,cancelable:true,dataTransfer:dt,clientX:r.left,clientY:r.top+24}));window.externalEffect=dt.dropEffect;lane.dispatchEvent(new DragEvent('drop',{bubbles:true,composed:true,cancelable:true,dataTransfer:dt,clientX:r.left,clientY:r.top+24}));`);
 await check('External file drop still reaches original file-tree guard and cannot become a video clip',`hostOver===1&&externalEffect==='none'&&JSON.stringify(s.readStartupTransitionSettings().project)===beforeExternal`);
 await wait(`e('video[data-track=V1]').readyState>=2&&e('video[data-track=V2]').readyState>=2`);
 await ev(`e('[data-action=play]').click()`);await delay(100);
 await check('Play works immediately after native drag insertion',`e('[data-action=play]').getAttribute('aria-pressed')==='true'&&!e('video[data-track=V1]').paused`);
 await ev(`e('[data-action=play]').click()`);
 await check('Pause works after native drag insertion',`e('[data-action=play]').getAttribute('aria-pressed')==='false'&&e('video[data-track=V1]').paused`);
 await ev(`window.second=await api.saveStartupVideo(new File([fixtureBlob],'Second.webm',{type:'video/webm'}))`);await reopenEmpty();
 await ev(`e('[data-media="'+second.id+'"]').click()`);await wait(`!!e('.particle-library-select[aria-pressed="true"] img[src]')`);
 await nativeDrag(1);
 await check('Second library video uses its own id when dragged into an empty timeline',`s.readStartupTransitionSettings().project.tracks[1][0].videoId===second.id&&s.readStartupTransitionSettings().project.tracks[0].length===0&&(await api.listStartupVideos()).length===2`);
 await ev(`e('[data-media="selected"]').click()`);await nativeDrag(0);
 await check('Both different videos stay on their assigned tracks without losing library media',`s.readStartupTransitionSettings().project.tracks[0][0].videoId==='selected'&&s.readStartupTransitionSettings().project.tracks[1][0].videoId===second.id&&(await api.listStartupVideos()).length===2`);
 await screenshot('native-library-two-videos');
 report.finalProject=await ev('s.readStartupTransitionSettings().project');
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error);report.trace=await ev('dragTrace').catch(()=>[]);report.project=await ev('s.readStartupTransitionSettings().project').catch(()=>null);throw error;}finally{writeFileSync(resolve(out,'native-drag-result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));stop();}
