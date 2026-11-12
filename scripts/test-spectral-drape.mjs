import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {builtExplorerTag} from './ui-build-identity.mjs';
import {measureAsciiInteraction} from './ascii-interaction-probe.mjs';
import {DEFAULTS} from '../packages/explorer-ui/src/effects/ascii-tiles/options.mjs';
import {assertCatalogMatchesDeclarations} from './plugin-catalog-contract.mjs';
import {pluginAssetPath,verifiedPluginSources} from './plugin-package-files.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const catalog=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8'));
const version=JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version;
const tag=builtExplorerTag(root);
const directory=resolve(ui,'dist/plugins');
for(const p of catalog){for(const asset of [p,...p.resources]){const b=readFileSync(pluginAssetPath(directory,p,asset));assert.equal(b.length,asset.size);assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);assert.ok(asset.size<=4*1024*1024);}}
assertCatalogMatchesDeclarations(catalog,root);assert.ok(readFileSync(resolve(ui,'dist/startup-early.js')).length<40*1024);
const packageSources=Object.fromEntries(catalog.map(p=>[p.id,verifiedPluginSources(directory,p)]));
const setup=`window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.calls=[];window.packages=${JSON.stringify(catalog)};window.packageSources=${JSON.stringify(packageSources)};window.packageJobs={};window.installed=new Set(JSON.parse(localStorage.getItem('fixture-packages')||'[]'));window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.930.7945.0',supported:true};window.__codeCodex={request:async({method,params})=>{
calls.push({method,params});
if(method==='explorer.window.transparency.set')return {enabled:params.enabled,background:'transparent'};
if(method==='explorer.plugins.status')return packages.map(p=>({id:p.id,installed:installed.has(p.id),phase:packageJobs[p.id]?.phase,downloaded:packageJobs[p.id]?.bytes??0,total:p.size}));
if(method==='explorer.plugins.cancel'){if(packageJobs[params.id])packageJobs[params.id].cancelled=true;return {};}
if(method==='explorer.plugins.install'){const job=packageJobs[params.id]={phase:'downloading',bytes:0};await new Promise(r=>setTimeout(r,800));if(job.cancelled){job.phase='cancelled';throw Error('Download cancelled');}job.bytes=packages.find(p=>p.id===params.id).size;installed.add(params.id);localStorage.setItem('fixture-packages',JSON.stringify([...installed]));job.phase='installed';return {installed:true};}
if(method==='explorer.plugins.load'){if(!installed.has(params.id))throw Error('Download plugin first');for(const source of packageSources[params.id])(0,eval)(source);return {loaded:true};}
if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};
if(method==='explorer.context')return {threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};
if(method==='explorer.list')return {entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};
if(method==='explorer.watch.start')return {watching:true};return {};}};`;
const home=`<nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home" aria-current="page">Home</button></nav><button hidden data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_startup_source_001">Fixture project</button></div></aside><div data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_fixture" data-app-shell-page-surface="true"><header data-app-shell-titlebar="true"><span data-app-shell-titlebar-content>Fixture conversation</span></header><div class="_MainContentClip_fixture"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_fixture"><article data-response-annotation-conversation="thread_startup_source_001">Fixture contents</article><div data-thread-scroll-footer="true"><div data-above-composer-conversation-id="thread_startup_source_001"></div><form data-codex-composer><textarea aria-label="Message"></textarea><button>Send</button></form></div></div></main></div></div></div></div>`;
const html=`<!doctype html><html data-theme="dark"><meta charset="utf-8"><link rel="modulepreload" href="/app-initial-startup-source.js"><style>html,body{margin:0;height:100%;background:#181818;color:#eee}main{height:95vh}textarea{width:400px}</style><body>${home}<script>${setup}</script><script src="/explorer.js"></script></body></html>`;
const kernelProbe=(await build({stdin:{contents:`import {SpectralDrapeRenderer} from './effects/spectral-drape/renderer.js';import {DEFAULT_SPECTRAL_DRAPE_SETTINGS} from './effects/spectral-drape/model';window.clickPositionProbe=async()=>{const root=document.createElement('div'),canvas=document.createElement('canvas');root.style.cssText='position:fixed;left:80px;top:100px;width:260px;height:240px';canvas.style.cssText='width:100%;height:100%';root.append(canvas);document.body.append(root);let uploaded;const original=WebGL2RenderingContext.prototype.uniform4fv;WebGL2RenderingContext.prototype.uniform4fv=function(location,value,...rest){uploaded=Array.from(value);return original.call(this,location,value,...rest);};const r=new SpectralDrapeRenderer(root,canvas,{...DEFAULT_SPECTRAL_DRAPE_SETTINGS,introEnabled:false,paused:true,brush:0},()=>{});try{let slot=0;for(const [x,y]of [[.2,.25],[.75,.8],[.5,.5]]){const e=new Event('pointerdown');Object.defineProperties(e,{clientX:{value:80+x*260},clientY:{value:100+y*240}});root.dispatchEvent(e);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(!uploaded||Math.abs(uploaded[slot*4]-(x*2-1))>1e-6||Math.abs(uploaded[slot*4+1]-(1-y*2))>1e-6)return false;slot++;}return true;}finally{r.dispose();root.remove();WebGL2RenderingContext.prototype.uniform4fv=original;}};window.contextLossProbe=()=>{const root=document.createElement('div'),canvas=document.createElement('canvas');root.style.cssText='width:300px;height:200px';root.append(canvas);document.body.append(root);const errors=[];const r=new SpectralDrapeRenderer(root,canvas,{...DEFAULT_SPECTRAL_DRAPE_SETTINGS,introEnabled:false},e=>errors.push(e));const event=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(event);r.dispose();canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));root.remove();return event.defaultPrevented&&errors.length===1&&errors[0].startsWith('SPECTRAL_CONTEXT_LOST:');};`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',write:false})).outputFiles[0].text;
const server=createServer((req,res)=>{if(req.url==='/kernel-probe.js'){res.setHeader('Content-Type','text/javascript');res.end(kernelProbe);return;}if(req.url==='/app-initial-startup-source.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`);return;}let file;if(req.url==='/explorer.js')file=resolve(ui,'dist/explorer.js');if(req.url?.startsWith('/plugins/')){const p=catalog.find(p=>'/plugins/'+p.asset===req.url);if(p)file=pluginAssetPath(resolve(ui,'dist/plugins'),p);}if(file){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={version,mode:'Spectral production UI/Worker with mocked native bridge',checks:[],failures:[]};


const output=resolve(root,'artifacts/spectral-drape');mkdirSync(output,{recursive:true});
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
 const e=browser.evaluate,s=`document.querySelector('${tag}').shadowRoot`;
 const wait=async(expr,label)=>{for(let i=0;i<300;i++){if(await e(expr))return;await delay(40);}throw Error(label+' '+JSON.stringify(await e('window.errors')));};
 const check=async(name,expr)=>{const actual=await e(expr);report.checks.push({name,actual});assert.ok(actual,name);};
 await wait(`document.querySelector('${tag}')?.dataset.state==='ready'`,'tree ready');
 await e(`document.querySelector('${tag}').openPreviewMarket()`);
 const card=`${s}.querySelector('[data-appearance-plugin="code-codex.spectral-drape-background"]')`,button=`${card}.querySelector('.preview-extension-action')`,runtime=`window[Symbol.for('code-codex:spectral-drape-background-controller:v1')]`;
 await wait(`${button}.textContent==='Download'`,'cold download');await e(`${button}.click()`);await wait(`${button}.textContent==='Enable'`,'download complete');
 await check('download does not enable',`!document.querySelector('[data-code-codex-spectral-drape-layer]')`);
 await e(`${button}.click()`);await wait(`${runtime}.enabled&&${runtime}.diagnostics?.frames>3`,'worker paints');
 await check('one Worker and no runtime failure',`${runtime}.diagnostics.mode==='worker'&&!${runtime}.error`);
 await check('all30controls and4reset groups',`${s}.querySelectorAll('[data-spectral-control]').length===30&&${s}.querySelectorAll('[data-spectral-reset]').length===4`);
 await e(`window.savedWorker=${runtime}.diagnostics;${s}.querySelector('.spectral-drape-settings').click()`);
 await check('panel opens independently',`${s}.querySelector('.spectral-drape-panel').matches(':popover-open')&&${runtime}.enabled`);
 await e(`(()=>{const i=${s}.querySelector('[data-spectral-control="density"]');i.value='1.5';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await check('density persists',`JSON.parse(localStorage.getItem('code-codex:spectral-drape-background:v1')).density===1.5`);
 await e(`${s}.querySelector('[data-spectral-reset="0"]').click()`);
 await check('group reset preserves other parameters',`${runtime}.settings.density===1&&${runtime}.settings.tilt===-40`);
 await e(`${runtime}.updateSettings({...${runtime}.settings,introEnabled:false,paused:true,interactive:false,clickRipples:false});`);await delay(500);
 const a=await e(`${runtime}.diagnostics.frames`);await delay(500);const b=await e(`${runtime}.diagnostics.frames`);assert.equal(a,b);report.checks.push({name:'paused noninteractive idle stops frames',actual:true});
 await e(`${runtime}.updateSettings({...${runtime}.settings,paused:false,interactive:true,clickRipples:true})`);await wait(`${runtime}.diagnostics.frames>${b}+3`,'resume');
 await e(`${s}.querySelector('.spectral-drape-close').click();document.querySelector('${tag}').closePreviewMarket?.()`);
 await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:1100,y:400});await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',x:1100,y:400,button:'left',clickCount:1});await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:1100,y:400,button:'left',clickCount:1});
 await browser.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(output,'background.png'),Buffer.from(r.data,'base64')));
 await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(350);
 const c=await e(`${runtime}.diagnostics.frames`);await delay(350);assert.equal(await e(`${runtime}.diagnostics.frames`),c);report.checks.push({name:'reduced motion idle',actual:true});
 await browser.command('Emulation.setEmulatedMedia',{features:[]});
 await e(`document.querySelector('${tag}').openPreviewMarket();${s}.querySelector('.spectral-drape-settings').click()`);
 await browser.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(100);await e(`if(!${s}.querySelector('.spectral-drape-panel').matches(':popover-open'))${s}.querySelector('.spectral-drape-settings').click()`);
 await check('narrow panel fits viewport',`(()=>{const r=${s}.querySelector('.spectral-drape-panel').getBoundingClientRect();return ${s}.querySelector('.spectral-drape-panel').matches(':popover-open')&&r.width>200&&r.height>200&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()`);
 await browser.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(output,'settings-mobile.png'),Buffer.from(r.data,'base64')));
 await e(`window[Symbol.for('code-codex:language-service:v1')].applyLanguage({schema:1,locale:'zh-CN',revision:100,source:'menu'})`);
 await wait(`${s}.querySelector('[data-spectral-label="density"]').textContent==='密度'`,'Chinese controls');
 await check('global Chinese name and parameter labels',`${card}.querySelector('[data-plugin-name]').textContent==='光谱点阵帷幕'&&${s}.querySelector('[data-spectral-reset]').textContent==='重置'`);
 await e(`window[Symbol.for('code-codex:language-service:v1')].applyLanguage({schema:1,locale:'en',revision:101,source:'menu'})`);

 await e(`${s}.querySelector('.spectral-drape-close').click();${button}.click()`);await wait(`!document.querySelector('[data-code-codex-spectral-drape-layer]')`,'disabled');
 await wait(`window[Symbol.for('code-codex:background-isolation:v1')].size===0`,'worker disposed');
 await check('startup animation selector contains spectral option',`${s}.querySelector('#cle-startupTransition-background option[value="spectral-drape"]')!==null`);
 await check('startup factory exists',`typeof window[Symbol.for('code-codex:background-modules:v1')].get('spectral-drape').startup==='function'`);
 await e(`window.startupTarget=document.createElement('div');startupTarget.style.cssText='position:fixed;inset:0;pointer-events:none';document.body.append(startupTarget);window.startupRenderer=window[Symbol.for('code-codex:background-modules:v1')].get('spectral-drape').startup(startupTarget,e=>errors.push(e));startupRenderer.ready`);
 await check('startup copy independent',`!${runtime}.enabled&&startupRenderer.diagnostics.frames>0`);
 await e(`startupRenderer.dispose();startupTarget.remove()`);await wait(`window[Symbol.for('code-codex:background-isolation:v1')].size===0`,'startup disposed');
 // Existing ASCII now delegates the same panel controller; regression excludes retired main-thread GPU inspection.
 const ac=`${s}.querySelector('[data-appearance-plugin="code-codex.ascii-tiles-background"] .preview-extension-action')`;
 await e(`${ac}.click()`);await wait(`${ac}.textContent==='Enable'`,'ASCII download');await e(`${ac}.click()`);await wait(`${ac}.getAttribute('aria-pressed')==='true'`,'ASCII enable');
 await e(`${s}.querySelector('.ascii-tiles-settings').click()`);await check('shared ASCII panel retains29controls',`${s}.querySelector('.ascii-tiles-panel').matches(':popover-open')&&${s}.querySelectorAll('[data-ascii-control]').length===29`);
 await e(`${s}.querySelector('.ascii-tiles-close').click();${ac}.click()`);await wait(`window[Symbol.for('code-codex:background-isolation:v1')].size===0`,'final cleanup');
 await e(`new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/kernel-probe.js';script.onload=resolve;script.onerror=reject;document.body.append(script);})`);
 await check('offset canvas clicks map to exact visible NDC at three positions',`clickPositionProbe()`);
 await check('context loss reports once and dispose removes listener',`contextLossProbe()`);
 await check('no unhandled errors',`window.errors.length===0`);
 report.passed=true;writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
