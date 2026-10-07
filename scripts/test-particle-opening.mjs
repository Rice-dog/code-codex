import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import { openBrowser, root, sleep } from './fixtures/browser-fixture.mjs';

// Separate origin/profile, real renderer and production UI; no user media/settings.
const label=process.argv[2]??`${Date.now()}`;
assert.match(label,/^[a-zA-Z0-9_-]+$/);
const directory=join(root,'artifacts',`particle-opening-${label}`);
assert.ok(!existsSync(join(directory,'results.json')),'use a new evidence label');
mkdirSync(directory,{recursive:true});
const bundle=readFileSync(join(root,'packages/explorer-ui/dist/explorer.js'));
const version=JSON.parse(readFileSync(join(root,'packages/explorer-ui/package.json'),'utf8')).version;
const tag=`code-codex-v${version.replaceAll('.','-')}`;
const seam=buildSync({stdin:{contents:`import * as particle from './particle-image-startup'; import * as hold from './background-startup-hold'; window.fixture={...particle,...hold};`,resolveDir:join(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,write:false,format:'iife',target:'chrome120'}).outputFiles[0].text;
const report={version,at:new Date().toISOString(),bundleSha256:createHash('sha256').update(bundle).digest('hex'),checks:[],failures:[],limitations:['Isolated production-renderer/UI fixture with software WebGL and repository sample image','No official Codex cold restart, user account changes, or physical-GPU certification']};
const check=(name,value,passed)=>{report.checks.push({name,value,passed});if(!passed)report.failures.push(name)};
const scaffold=readFileSync(join(root,'scripts/test-startup-image-backgrounds.mjs'),'utf8');
// Reuse the audited synthetic native shell and guarded theme adapter fixture.
const home=scaffold.match(/const home = (`[^\n]+`);/)[1];
const homeMarkup=JSON.parse(JSON.stringify(home.slice(1,-1)));
const bridge=scaffold.match(/const bridge = (`[^\n]+`);/)[1].slice(1,-1).replace('return {};','if(method==="explorer.window.transparency.set")return {enabled:params.enabled,background:"transparent"};return {};');
const css=`*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#111;color:#ddd;font:13px 'Segoe UI'}#preview{position:relative;width:800px;height:500px}canvas{width:100%;height:100%}#native-root{display:flex;height:100%}nav{width:50px;flex:none}aside{width:220px;flex:none}[data-app-shell-workspace-row]{display:flex;flex:1;min-width:0;height:100%}._Workspace_fixture{display:contents}._MainContentClip_fixture{display:flex;flex:1;min-width:0}main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column}header[data-app-shell-titlebar]{position:fixed;left:270px;top:8px;height:52px;right:0;pointer-events:none}._WorkspaceContent_fixture{flex:1;display:flex;flex-direction:column;min-height:0;padding-top:52px}article{flex:1;padding:25px}textarea{height:80px;width:100%}form{padding:12px;margin:10px;border:1px solid #444;border-radius:12px}`;
const html=ui=>`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="modulepreload" href="/app-initial-particle-opening.js"><style>${css}</style></head><body>${ui?`<div id="native-root">${homeMarkup}</div>`:'<div id="preview"><canvas></canvas></div>'}<script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));${ui?bridge:''}</script><script src="/seam.js"></script>${ui?'<script src="/ui.js"></script>':''}</body></html>`;
const server=createServer((req,res)=>{
 if(req.url==='/seam.js'){res.setHeader('Content-Type','text/javascript');res.end(seam)}
 else if(req.url==='/ui.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle)}
 else if(req.url==='/photo.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(join(root,'packages/explorer-ui/src/pixel-sculpt-default.png')))}
 else if(req.url==='/app-initial-particle-opening.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`)}
 else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(req.url==='/ui'))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await openBrowser('<!doctype html><title>Particle opening fixture</title>');
 const {ev,cmd,wait}=browser;
 const navigate=async route=>{await cmd('Page.navigate',{url:origin+route});await wait(uiReady(route),'page ready')};
 const shot=async name=>{const {data}=await cmd('Page.captureScreenshot',{format:'png'});writeFileSync(join(directory,name+'.png'),Buffer.from(data,'base64'))};
 function uiReady(route){return route==='/ui'?`document.querySelector('${tag}')?.dataset.state==='ready'`:'!!window.fixture'}
 await navigate('/bare');
 const normalized=await ev(`({legacy:fixture.normalizeParticleSettings({particleCount:10000}),bad:fixture.normalizeParticleSettings({introDuration:999,introSpread:-1,introEnabled:'false'}),missing:fixture.normalizeParticleSettings({introDuration:'bad',introSpread:NaN})})`);
 check('legacy settings migrate without dropping saved fields',normalized.legacy,normalized.legacy.introEnabled&&normalized.legacy.introDuration===4&&normalized.legacy.introSpread===1&&normalized.legacy.particleCount===10000);
 check('opening values are bounded and invalid values recover defaults',normalized.bad,normalized.bad.introDuration===12&&normalized.bad.introSpread===.2&&normalized.bad.introEnabled&&normalized.missing.introDuration===4&&normalized.missing.introSpread===1);
 await ev(`(async()=>{const blob=await(await fetch('/photo.png')).blob();window.record={id:'fixture',name:'fixture.png',type:'image/png',size:blob.size,createdAt:1,blob,thumbnail:blob,positionX:50,positionY:50,zoom:1};window.cache=new fixture.ParticleImagePreparationCache();window.prepared=await cache.prepare(record,20000);window.settings=fixture.normalizeParticleSettings({particleCount:20000,introDuration:3,particleSize:3,speed:0,noiseStrength:0,cursorInteraction:false});window.progress=[];window.renderer=new fixture.ParticleImageRenderer(document.querySelector('canvas'),m=>errors.push(m),settings,()=>{},p=>progress.push(p));await renderer.setPreparedImage(prepared,record);renderer.setPaused(true);})()`);
 check('first prepared image starts at the gathering pose',await ev('renderer.openingProgress'),await ev('renderer.openingProgress')<.05);
 await shot('01-scattered');
 await ev('renderer.setPaused(false)');await sleep(900);
 const middle=await ev('renderer.openingProgress');
 check('opening progresses even when ambient speed is zero',middle,middle>.12&&middle<.65);
 await ev('renderer.setPaused(true)');await shot('02-gathering');
 const paused=await ev('renderer.openingProgress');await sleep(250);
 check('pause freezes gathering progress',await ev('renderer.openingProgress'),await ev('renderer.openingProgress')===paused);
 await ev('renderer.setRenderSettings({...settings,introDuration:1.5,introSpread:1.5})');
 check('live edits preserve progress instead of replaying',await ev('renderer.openingProgress'),await ev('renderer.openingProgress')===paused);
 await ev('renderer.setPaused(false)');await wait('renderer.openingProgress===1','opening completes');
 await ev('renderer.setPaused(true)');await shot('03-assembled');
 await ev(`window.snapshot=()=>{renderer.renderPreparedFrame();const c=document.querySelector('canvas'),g=c.getContext('webgl'),b=new Uint8Array(c.width*c.height*4);g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,b);let h=2166136261;for(const v of b)h=Math.imul(h^v,16777619);return h>>>0};window.finishedPixels=snapshot();renderer.setRenderSettings({...settings,introEnabled:false});`);
 const steady=await ev('({finished:finishedPixels,disabled:snapshot(),progress:renderer.openingProgress})');
 check('completed pose is pixel-identical to disabled opening',steady,steady.finished===steady.disabled&&steady.progress===1);
 await ev('renderer.setRenderSettings(settings);renderer.replayOpening()');
 check('replay reuses renderer and restarts without rereading media',await ev('({count:renderer.count,progress:renderer.openingProgress})'),await ev('renderer.count===20000&&renderer.openingProgress<.05'));
 await ev('renderer.setPaused(false)');await sleep(200);await ev('renderer.setRenderSettings({...settings,introEnabled:false})');
 check('disabling mid-opening immediately restores the complete pose',await ev('renderer.openingProgress'),await ev('renderer.openingProgress')===1);
 await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(100);await ev('renderer.setRenderSettings(settings);renderer.replayOpening()');
 check('reduced motion skips gathering and restores source image multiplier',await ev('renderer.openingProgress'),await ev('renderer.openingProgress===1&&fixture.particleOpeningImageOpacity(renderer.openingProgress)===1'));
 await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await sleep(100);
 await ev(`(async()=>{renderer.dispose();document.querySelector('canvas').replaceWith(document.createElement('canvas'));document.querySelector('#preview').setAttribute('data-code-codex-particle-layer','v1');fixture.setStartupBackgroundHold(true);renderer=new fixture.ParticleImageRenderer(document.querySelector('canvas'),m=>errors.push(m),settings,()=>{});fixture.registerBackgroundOpening(document.querySelector('#preview'),renderer);await renderer.setPreparedImage(prepared,record);})()`);
 await sleep(250);const held=await ev('renderer.openingProgress');await sleep(350);
 check('normal gathering stays held under startup cover',await ev('renderer.openingProgress'),await ev('renderer.openingProgress')===held&&held<.15);
 await ev('fixture.setStartupBackgroundHold(false)');await sleep(350);
 check('cover release begins the normal opening visibly from its start',await ev('renderer.openingProgress'),await ev('renderer.openingProgress>.02&&renderer.openingProgress<.3'));
 await ev(`(async()=>{const transition=renderer.setPreparedImage({...prepared,imageId:'next'},record);renderer.setPaused(true);await transition})()`);
 check('later photo activation does not replay the opening',await ev('renderer.openingProgress'),await ev('renderer.openingProgress>.02'));
 check('renderer fixture has no unhandled errors',await ev('errors'),await ev('errors.length===0'));
 await ev(`(async()=>{renderer.dispose();cache.dispose();localStorage.setItem(fixture.PARTICLE_BACKGROUND_SETTINGS_KEY,JSON.stringify({...settings,selectedImageIds:['fixture'],activeImageId:'fixture',autoSwitch:false}));const db=await fixture.openParticleImageDatabase(()=>{});await new Promise((r,j)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(record);tx.oncomplete=r;tx.onerror=j});db.close()})()`);
 await navigate('/ui');
 const shadow=`document.querySelector('${tag}').shadowRoot`;
 await ev(`document.querySelector('${tag}').openPreviewMarket();${shadow}.querySelector('[data-appearance-plugin="code-codex.particle-image-background"] .particle-settings-trigger').click()`);
 check('opening controls use bilingual unified panel',await ev(`${shadow}.querySelector('.particle-opening-replay').textContent`),await ev(`${shadow}.querySelectorAll('#cle-particle-settings [id^="cle-particle-intro-"]').length===5`));
 await ev(`${shadow}.querySelector('[data-appearance-plugin="code-codex.particle-image-background"] .preview-extension-action').click()`);
 await wait(`document.documentElement.hasAttribute('data-code-codex-particle-image-background')&&!${shadow}.querySelector('.particle-opening-replay').disabled`,'normal activation');
 await ev(`if(!${shadow}.querySelector('#cle-particle-settings').matches(':popover-open'))${shadow}.querySelector('[data-appearance-plugin="code-codex.particle-image-background"] .particle-settings-trigger').click()`);
 await ev(`${shadow}.querySelector('.particle-opening-replay').click()`);await sleep(150);
 const source=await ev(`({opacity:Number(document.querySelector('.code-codex-particle-source-current').style.opacity),events:window[Symbol.for('code-codex:runtime-events:v1')].events.filter(e=>e.action==='opening replay').length})`);
 check('replay button starts gathering and hides the full source underlay',source,source.opacity<.02&&source.events>0);
 const duration=await ev(`(()=>{const s=${shadow},input=s.querySelector('#cle-particle-intro-duration');input.value='2.5';input.dispatchEvent(new Event('input',{bubbles:true}));return JSON.parse(localStorage.getItem(fixture.PARTICLE_BACKGROUND_SETTINGS_KEY)).introDuration})()`);
 check('duration edits persist via production settings handlers',duration,duration===2.5);
 await ev(`${shadow}.querySelector('#cle-particle-intro-enabled').click()`);
 const disabled=await ev(`({disabled:${shadow}.querySelector('.particle-opening-replay').disabled,opacity:Number(document.querySelector('.code-codex-particle-source-current').style.opacity),saved:JSON.parse(localStorage.getItem(fixture.PARTICLE_BACKGROUND_SETTINGS_KEY)).introEnabled})`);
 check('UI disable restores source and disables replay',disabled,disabled.disabled&&!disabled.saved&&disabled.opacity===1);
 for(const width of [1500,800,500]){
   await cmd('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await sleep(150);
   await ev(`if(!${shadow}.querySelector('#cle-particle-settings').matches(':popover-open'))${shadow}.querySelector('[data-appearance-plugin="code-codex.particle-image-background"] .particle-settings-trigger').click()`);await sleep(150);
   const bounds=await ev(`(()=>{const p=${shadow}.querySelector('#cle-particle-settings'),r=p.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth}})()`);
   check('unified settings fit viewport '+width,bounds,bounds.clientWidth>250&&bounds.left>=-1&&bounds.right<=width+1&&bounds.top>=-1&&bounds.bottom<=901&&bounds.scrollWidth<=bounds.clientWidth+1);
   const control=await ev(`(()=>{const e=${shadow}.querySelector('#cle-particle-intro-spread');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,before:e.value}})()`);
   await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x:control.x+control.w*.25,y:control.y+control.h/2,button:'left',buttons:1,clickCount:1});
   await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:control.x+control.w*.7,y:control.y+control.h/2,button:'left',buttons:1});
   await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:control.x+control.w*.7,y:control.y+control.h/2,button:'left',buttons:0,clickCount:1});
   const after=await ev(`${shadow}.querySelector('#cle-particle-intro-spread').value`);
   check('spread slider responds to a real pointer drag '+width,{before:control.before,after},Number(after)>1.2&&Number(after)<1.8);
   await shot('settings-'+width);
 }
 await cmd('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
 await cmd('Page.reload');await sleep(450);await wait(uiReady('/ui'),'reload ready');await ev(`document.querySelector('${tag}').openPreviewMarket();${shadow}.querySelector('[data-appearance-plugin="code-codex.particle-image-background"] .particle-settings-trigger').click()`);
 check('reload preserves duration and disabled opening preference',await ev(`({duration:${shadow}.querySelector('#cle-particle-intro-duration').value,enabled:${shadow}.querySelector('#cle-particle-intro-enabled').checked})`),await ev(`${shadow}.querySelector('#cle-particle-intro-duration').value==='2.5'&&!${shadow}.querySelector('#cle-particle-intro-enabled').checked`));
 check('production UI fixture has no unhandled errors',await ev('errors'),await ev('errors.length===0'));
}catch(error){report.error=String(error.stack??error);report.failures.push('execution');if(browser)report.observations=await browser.ev(`({errors:window.errors,attributes:[...document.documentElement.attributes].map(a=>[a.name,a.value]),events:window[Symbol.for('code-codex:runtime-events:v1')]?.events?.slice(-10)})`).catch(()=>null)}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));report.passed=report.failures.length===0;writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,failures:report.failures,...report.error?{error:report.error}:{}},null,2));
if(!report.passed)process.exitCode=1;
