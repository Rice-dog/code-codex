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
for(const p of catalog){for(const asset of [p,...p.resources]){const b=readFileSync(pluginAssetPath(directory,p,asset));assert.equal(b.length,asset.size);assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);const sizeMiB=p.id==='lan-remote'&&asset.kind==='native'?64:4;assert.ok(asset.size<=sizeMiB*1024*1024,asset.asset);}}
assertCatalogMatchesDeclarations(catalog,root);assert.ok(readFileSync(resolve(ui,'dist/startup-early.js')).length<40*1024);
const packageSources=Object.fromEntries(catalog.filter(p=>!p.resources.some(asset=>asset.kind==='native')).map(p=>[p.id,verifiedPluginSources(directory,p)]));
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={version,mode:'Liquid ASCII production UI/Worker with mocked native bridge',checks:[],failures:[]};


const output=resolve(root,'artifacts/liquid-ascii');mkdirSync(output,{recursive:true});
try {
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
 const e=browser.evaluate,s=`document.querySelector('${tag}').shadowRoot`;
 const wait=async(expr,label)=>{for(let i=0;i<250;i++){if(await e(expr))return;await delay(40);}throw Error(label+' '+JSON.stringify(await e('window.errors')));};
 const check=async(name,expr)=>{const actual=await e(expr);report.checks.push({name,actual});assert.ok(actual,name);};
 await wait(`document.querySelector('${tag}')?.dataset.state==='ready'`,'tree ready');
 await e(`document.querySelector('${tag}').openPreviewMarket()`);
 const card=`${s}.querySelector('[data-appearance-plugin="code-codex.liquid-ascii-background"]')`,button=`${card}.querySelector('.preview-extension-action')`,runtime=`window[Symbol.for('code-codex:liquid-ascii-background-controller:v1')]`;
 await wait(`${button}.textContent==='Download'`,'cold download');
 await e(`${button}.click()`);await wait(`${button}.textContent==='Enable'`,'installed');
 await check('download keeps effect disabled',`!${runtime}.enabled`);
 await e(`${button}.click()`);
 await wait(`${runtime}.enabled&&${runtime}.diagnostics?.frames>5`,'first real 2D worker frame');
 await check('worker owns drawing without errors',`${runtime}.diagnostics.mode==='worker'&&!${runtime}.error`);
 await e(`${s}.querySelector('.liquid-ascii-settings').click()`);
 await check('21 shared parameter controls in four groups',`${s}.querySelectorAll('[data-liquid-control]').length===21&&${s}.querySelectorAll('[data-liquid-reset]').length===4`);
 await check('character ramp uses text input',`${s}.querySelector('[data-liquid-control="characters"]').type==='text'`);
 await e(`(()=>{const i=${s}.querySelector('[data-liquid-control="introDuration"]');i.value='1.2';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await check('opening time persists',`JSON.parse(localStorage.getItem('code-codex:liquid-ascii-background:v1')).introDuration===1.2`);
 await e(`${runtime}.updateSettings({... ${runtime}.settings,introEnabled:false,paused:true});`);
 await delay(500);const f=await e(`${runtime}.diagnostics.frames`);await delay(1200);
 assert.equal(await e(`${runtime}.diagnostics.frames`),f);report.checks.push({name:'pause sleeps drawing worker',actual:true});
 await e(`${runtime}.updateSettings({... ${runtime}.settings,paused:false,introEnabled:true,introDuration:1.2});`);
 await wait(`${runtime}.diagnostics.frames>${f}+5`,'resume opening');
 await delay(500);
 await browser.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(output,'opening.png'),Buffer.from(r.data,'base64')));
 await e(`${s}.querySelector('.liquid-ascii-close').click();document.querySelector('${tag}').closePreviewMarket?.()`);
 await delay(1800);
 await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:900,y:600});
 await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:700,y:500});
 await browser.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(output,'background.png'),Buffer.from(r.data,'base64')));
 await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await delay(1200);const reduced=await e(`${runtime}.diagnostics.frames`);await delay(1100);
 assert.equal(await e(`${runtime}.diagnostics.frames`),reduced);report.checks.push({name:'reduced motion stops at complete composition',actual:true});
 await e(`document.querySelector('${tag}').openPreviewMarket();${s}.querySelector('.liquid-ascii-settings').click()`);
 await browser.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await e(`if(!${s}.querySelector('.liquid-ascii-panel').matches(':popover-open'))${s}.querySelector('.liquid-ascii-settings').click()`);
 await check('mobile shared panel fits viewport',`(()=>{const r=${s}.querySelector('.liquid-ascii-panel').getBoundingClientRect();return r.width>200&&r.right<=innerWidth+1&&r.left>=0&&r.top>=0&&r.bottom<=innerHeight+1;})()`);
 await e(`window[Symbol.for('code-codex:language-service:v1')].applyLanguage({schema:1,locale:'zh-CN',revision:100,source:'menu'})`);
 await wait(`${s}.querySelector('[data-liquid-label="introDuration"]').textContent==='开场时长'`,'Chinese labels');
 await browser.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(output,'settings-mobile.png'),Buffer.from(r.data,'base64')));
 await e(`${s}.querySelector('.liquid-ascii-close').click();${button}.click()`);
 await wait(`!${runtime}.enabled&&window[Symbol.for('code-codex:background-isolation:v1')].size===0`,'worker and resources released');
 await e(`window.target=document.createElement('div');target.style.cssText='position:fixed;inset:0';document.body.append(target);window.startup=window[Symbol.for('code-codex:background-modules:v1')].get('liquid-ascii').startup(target,e=>errors.push(e));startup.ready`);
 await check('independent startup copy paints while normal effect is off',`!${runtime}.enabled&&startup.diagnostics.frames>0`);
 await e(`startup.dispose();target.remove()`);
 await wait(`window[Symbol.for('code-codex:background-isolation:v1')].size===0`,'startup release');
 await check('no unhandled errors',`window.errors.length===0`);
 report.passed=true;
} catch(error){report.failures.push(String(error));report.diagnostic=await browser?.evaluate(`(()=>{const r=window[Symbol.for('code-codex:liquid-ascii-background-controller:v1')];return {error:r?.error,pending:r?.pending,enabled:r?.enabled,diagnostic:r?.diagnostics,notices:[...document.querySelectorAll('[role=status]')].map(n=>n.textContent),};})()`);throw error;}
finally {
 writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));
 await browser?.close();await new Promise(r=>server.close(r));
 console.log(JSON.stringify(report));
}
