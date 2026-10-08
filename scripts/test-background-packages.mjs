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
const tag='code-codex-v'+version.replaceAll('.','-');
const directory=resolve(ui,'dist/plugins');
for(const p of catalog){for(const asset of [p,...p.resources]){const b=readFileSync(pluginAssetPath(directory,p,asset));assert.equal(b.length,asset.size);assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);assert.ok(asset.size<=4*1024*1024);}}
assert.equal(catalog.length,24);assert.deepEqual(Object.fromEntries(['appearance','file-preview','developer-tools'].map(category=>[category,catalog.filter(p=>p.category===category).length])),{appearance:13,'file-preview':10,'developer-tools':1});assert.ok(readFileSync(resolve(ui,'dist/startup-early.js')).length<40*1024);
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const report={version,mode:'production UI / native-package mock fixture',checks:[],failures:[]};
try{
browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
const e=browser.evaluate;const s=`document.querySelector('${tag}').shadowRoot`;
const wait=async(expression,label)=>{for(let i=0;i<250;i++){if(await e(expression))return;await delay(40);}throw Error(label);};
const check=async(name,expression)=>{const actual=await e(expression);report.checks.push({name,actual});assert.ok(actual,name);};
await wait(`document.querySelector('${tag}')?.dataset.state==='ready'`,'tree ready');await e(`document.querySelector('textarea').value='Native draft';document.querySelector('${tag}').openPreviewMarket()`);
await wait(`[...${s}.querySelectorAll('.preview-extension-action')].every(button=>button.textContent==='Download')`,'all cold catalog actions settled');
await check('all 24 cards start with Download',`${s}.querySelectorAll('.preview-extension').length===24&&[...${s}.querySelectorAll('.preview-extension-action')].every(button=>button.textContent==='Download')`);
const glow=`${s}.querySelector('[data-appearance-plugin="code-codex.glow-horizon-background"]')`;
await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Download'`,'cold package Download');
await check('cold settings disabled',`${glow}.querySelector('.particle-settings-trigger').disabled`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await check('pending cancel',`${glow}.querySelector('.preview-extension-action').textContent==='Cancel'`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await delay(1000);await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Download'`,'cancel returns Download');
await check('cancel did not install',`!installed.has('glow-horizon')`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Enable'`,'download returns Enable');
await check('download does not autoenable',`${glow}.querySelector('.preview-extension-action').getAttribute('aria-pressed')==='false'`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Disable'`,'hot Enable');
await check('enabled without reload',`document.querySelector('${tag}').dataset.state==='ready'&&!!document.querySelector('[data-code-codex-glow-horizon-background]')`);
await check('native draft preserved',`document.querySelector('textarea').value==='Native draft'`);
await check('settings did not autoopen',`!${s}.querySelector('#cle-glow-horizon-settings').matches(':popover-open')`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Enable'`,'Disable');
await check('second enable no second download',`calls.filter(c=>c.method==='explorer.plugins.install'&&c.params.id==='glow-horizon').length===2`);
await e(`${glow}.querySelector('.preview-extension-action').click()`);await wait(`${glow}.querySelector('.preview-extension-action').textContent==='Disable'`,'cached Enable');
await check('cached module loaded once',`calls.filter(c=>c.method==='explorer.plugins.load'&&c.params.id==='glow-horizon').length===1`);
report.errors=await e('errors');assert.deepEqual(report.errors,[]);
const screenshot=await browser.command('Page.captureScreenshot');mkdirSync(resolve(root,'artifacts/background-packages'),{recursive:true});writeFileSync(resolve(root,'artifacts/background-packages/market.png'),Buffer.from(screenshot.data,'base64'));
}catch(error){report.failures.push(error.stack??String(error));if(browser)report.debug=await browser.evaluate(`({errors:window.errors,cards:[...document.querySelector('${tag}')?.shadowRoot?.querySelectorAll('[data-appearance-plugin]')??[]].map(x=>({id:x.dataset.appearancePlugin,text:x.textContent})),calls:window.calls})`).catch(()=>{});}
finally{await browser?.close();await new Promise(r=>server.close(r));mkdirSync(resolve(root,'artifacts/background-packages'),{recursive:true});writeFileSync(resolve(root,'artifacts/background-packages/fixture.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({version,checks:report.checks,failures:report.failures,errors:report.errors}));assert.deepEqual(report.failures,[]);
