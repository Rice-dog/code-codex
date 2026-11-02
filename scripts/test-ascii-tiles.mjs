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
const server=createServer((req,res)=>{if(req.url==='/app-initial-startup-source.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`);return;}let file;if(req.url==='/explorer.js')file=resolve(ui,'dist/explorer.js');if(req.url?.startsWith('/plugins/')){const p=catalog.find(p=>'/plugins/'+p.asset===req.url);if(p)file=pluginAssetPath(resolve(ui,'dist/plugins'),p);}if(file){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={version,mode:'ASCII production UI and GPU / native RPC mock fixture',checks:[],failures:[]};

const output=resolve(root,'artifacts/ascii-tiles-'+version);mkdirSync(output,{recursive:true});
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
 const e=browser.evaluate,s=`document.querySelector('${tag}').shadowRoot`;
 const wait=async(expr,label)=>{for(let i=0;i<300;i++){if(await e(expr))return;await delay(40);}throw Error(label+' '+JSON.stringify(await e('window.errors')));};
 const check=async(name,expr)=>{const actual=await e(expr);report.checks.push({name,actual});assert.ok(actual,name);};
 await wait(`document.querySelector('${tag}')?.dataset.state==='ready'`,'tree ready');
 await e(`document.querySelector('${tag}').openPreviewMarket()`);
 const card=`${s}.querySelector('[data-appearance-plugin="code-codex.ascii-tiles-background"]')`,button=`${card}.querySelector('.preview-extension-action')`;
 await wait(`${button}.textContent==='Download'`,'cold Download');
 await e(`${button}.click()`);await wait(`${button}.textContent==='Enable'`,'verified download');
 await check('Download does not activate',`!document.querySelector('[data-code-codex-ascii-tiles-layer]')`);
 await e(`${button}.click()`);await wait(`document.querySelector('[data-code-codex-ascii-tiles-layer] canvas')&&${button}.getAttribute('aria-pressed')==='true'&&!${button}.disabled`,'enable terminates');
 await check('Cold initialization uses all tuned defaults in actual controls',`(()=>{const expected=${JSON.stringify({...DEFAULTS,paused:false})},inputs=[...${s}.querySelectorAll('[data-ascii-control]')];return inputs.length===29&&inputs.every(i=>{const value=i.type==='checkbox'?i.checked:i.type==='color'?i.value:Number(i.value);return value===expected[i.dataset.asciiControl];});})()`);
 await delay(300);await e(`window.asciiCanvas=document.querySelector('[data-code-codex-ascii-tiles-layer] canvas');window.asciiContext=asciiCanvas.getContext('webgl2');window.draws=0;window.originalDraw=asciiContext.drawArrays.bind(asciiContext);asciiContext.drawArrays=(...args)=>{draws++;originalDraw(...args);const p=new Uint8Array(256*256*4);asciiContext.readPixels(Math.floor(asciiContext.drawingBufferWidth/2)-128,Math.floor(asciiContext.drawingBufferHeight/2)-128,256,256,asciiContext.RGBA,asciiContext.UNSIGNED_BYTE,p);window.asciiPixels=p;window.painted=p.some((v,i)=>i%4!==3&&v>0);window.drawError=asciiContext.getError();};`);
 await delay(700);console.log('GPU snapshot',await e('({draws:window.draws,painted:window.painted,error:window.drawError,rect:asciiCanvas.getBoundingClientRect().toJSON(),hidden:document.hidden,errors:window.errors})'));await check('WebGL2 actively draws nonblack pixels',`draws>0&&window.painted&&window.drawError===0`);
 await e(`window.setAsciiFixtureValue=(key,value)=>{const i=${s}.querySelector('[data-ascii-control="'+key+'"]');if(i.type==='checkbox')i.checked=value;else i.value=String(value);i.dispatchEvent(new Event('input',{bubbles:true}));};setAsciiFixtureValue('tileDensity',6);setAsciiFixtureValue('tileShear',-.31);setAsciiFixtureValue('tileGap',18.5);setAsciiFixtureValue('bevelWidth',.025);setAsciiFixtureValue('outlineStrength',.6);setAsciiFixtureValue('refractionStrength',46);setAsciiFixtureValue('specularExponent',256);setAsciiFixtureValue('patternFreqX',9.4);setAsciiFixtureValue('glyphColor','#ffffff');`);
 await wait(`asciiCanvas.dataset.introProgress==='1.0000'`,'entrance completes before normal press check');
 report.motion=await measureAsciiInteraction(browser);console.log('White glyph local interaction',report.motion);
 report.checks.push({name:'White glyphs visibly deform locally, distant grid stays fixed and waves recover',actual:report.motion});
 writeFileSync(resolve(output,'motion.json'),JSON.stringify(report.motion,null,2));
 assert.ok(report.motion.active.changed/report.motion.active.pixels>.02,'At least2percent of the local white-glyph patch must visibly respond');
 assert.ok(report.motion.active.introduced/report.motion.active.pixels>.005,'Local refraction must move visible glyph edges, not merely brighten already white pixels');
 assert.equal(report.motion.active.farChanged,0,'Distant grid must remain anchored');
 assert.ok(report.motion.active.farPainted>100,'Distant reference contains visible glyphs');
 assert.ok(report.motion.active.minCenterBrightnessRatio>.9,'Local interaction must not create a broad dark shadow');
 assert.ok(report.motion.active.frames>2&&report.motion.active.error===0&&report.motion.active.sameCanvas);
 assert.equal(report.motion.recovered.changed,0,'Local field must fully recover after input ends');
 await e(`${card}.querySelector('.ascii-tiles-settings').click()`);await check('Panel anchored beside corresponding card',`(()=>{const panel=${s}.querySelector('.ascii-tiles-panel'),r=panel.getBoundingClientRect(),c=${card}.getBoundingClientRect();return panel.matches(':popover-open')&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&Math.abs(r.left-c.right-8)<2;})()`);
 await check('All original parameters and per-group Reset',`${s}.querySelectorAll('[data-ascii-control]').length===29&&${s}.querySelectorAll('[data-ascii-reset]').length===4`);
 await e(`${s}.querySelector('[data-ascii-control="waveHeight"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true}))`);
 await check('Panel interaction does not dismiss its own popover',`${s}.querySelector('.ascii-tiles-panel').matches(':popover-open')`);
 await check('Enable typography matches reference',`(()=>{const a=getComputedStyle(${button}),b=getComputedStyle(${s}.querySelector('.surface-opacity-enable'));return a.fontFamily===b.fontFamily&&a.fontSize===b.fontSize&&a.fontWeight===b.fontWeight;})()`);
 await e(`window.pointer=new PointerEvent('pointermove',{clientX:700,clientY:450,bubbles:true});dispatchEvent(pointer);dispatchEvent(new PointerEvent('pointermove',{clientX:780,clientY:470,bubbles:true}));`);
 for(let i=0;i<3;i++){await e(`${s}.querySelector('.ascii-tiles-close').click();${card}.querySelector('.ascii-tiles-settings').click()`);}
 await check('Reopen keeps canvas and context identity',`document.querySelector('[data-code-codex-ascii-tiles-layer] canvas')===asciiCanvas&&asciiCanvas.getContext('webgl2')===asciiContext`);
 await e(`(()=>{const input=${s}.querySelector('[data-ascii-control="waveHeight"]');input.value='57';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await check('Parameters persist without canvas replacement',`JSON.parse(localStorage.getItem('code-codex:ascii-tiles-background:v1')).waveHeight===57&&document.querySelector('[data-code-codex-ascii-tiles-layer] canvas')===asciiCanvas`);
 await e(`${s}.querySelector('[data-ascii-reset="0"]').click()`);await check('Group reset preserves unrelated parameters',`JSON.parse(localStorage.getItem('code-codex:ascii-tiles-background:v1')).waveHeight===57`);
 await e(`${s}.querySelector('[data-ascii-reset="3"]').click()`);await check('Interaction reset restores source default',`JSON.parse(localStorage.getItem('code-codex:ascii-tiles-background:v1')).waveHeight===36`);
 await e(`for(const i of ${s}.querySelectorAll('[data-ascii-reset]'))i.click()`);
 await check('All group resets restore the complete tuned defaults',`(()=>{const expected=${JSON.stringify({...DEFAULTS,paused:false})},actual=JSON.parse(localStorage.getItem('code-codex:ascii-tiles-background:v1'));return Object.entries(expected).every(([k,v])=>actual[k]===v);})()`);
 await e(`window.localeService=window[Symbol.for('code-codex:language-service:v1')];localeService.applyLanguage({schema:1,locale:'zh-CN',revision:100,source:'menu'})`);await delay(100);
 await check('Chinese labels/actions and translated plugin name',`${button}.textContent==='停用'&&${s}.querySelector('[data-ascii-label="waveHeight"]').textContent==='波纹高度'&&${card}.querySelector('h4').textContent==='字符玻璃砖'`);
 await e(`localeService.applyLanguage({schema:1,locale:'en',revision:101,source:'menu'})`);await delay(100);
 await browser.command('Page.captureScreenshot',{format:'png'}).then(image=>writeFileSync(resolve(output,'panel-en.png'),Buffer.from(image.data,'base64')));
 await e(`window.restoreExtension=asciiContext.getExtension('WEBGL_lose_context');restoreExtension.loseContext()`);await delay(150);await e(`restoreExtension.restoreContext()`);await delay(800);
 await check('Graphics context restore retains active canvas',`document.querySelector('[data-code-codex-ascii-tiles-layer] canvas')===asciiCanvas&&!asciiContext.isContextLost()&&${button}.getAttribute('aria-pressed')==='true'`);
 await e(`${s}.querySelector('.ascii-tiles-close').click();${button}.click()`);await wait(`!document.querySelector('[data-code-codex-ascii-tiles-layer]')&&!${button}.disabled&&${button}.getAttribute('aria-pressed')==='false'`,'disable terminates');
 await check('Disable removes shared presentation marker',`!document.documentElement.hasAttribute('data-code-codex-particle-image-background')`);
 await e(`${button}.click()`);await wait(`${button}.getAttribute('aria-pressed')==='true'&&!${button}.disabled`,'second enable');
 await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(250);
 await e(`${card}.querySelector('.ascii-tiles-settings').click()`);await browser.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
 await check('Narrow panel stays in viewport',`(()=>{const r=${s}.querySelector('.ascii-tiles-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})()`);
 await e(`${s}.querySelector('.ascii-tiles-close').click();${button}.click()`);await wait(`!document.querySelector('[data-code-codex-ascii-tiles-layer]')`,'final cleanup');
 await check('Unavailable WebGL2 rejects activation with an English diagnostic',`(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:original.call(this,kind,...args);};try{const C=window[Symbol.for('code-codex:background-modules:v1')].get('ascii-tiles').exports.AsciiTilesRenderer;try{new C(document.body,document.createElement('canvas'),{});return false;}catch(error){return error.message.startsWith('ASCII_WEBGL_UNAVAILABLE:')&&!/[\u4e00-\u9fff]/.test(error.message);}}finally{HTMLCanvasElement.prototype.getContext=original;}})()`);
 await check('No unhandled errors',`window.errors.length===0`);
 writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
