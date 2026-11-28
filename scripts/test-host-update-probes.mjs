import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const ui=resolve('packages/explorer-ui'),{build}=createRequire(resolve(ui,'package.json'))('esbuild');
const out=resolve('artifacts/host-update-probes-test');mkdirSync(out,{recursive:true});
await build({entryPoints:[resolve(ui,'src/host-update-probes.ts')],bundle:true,format:'iife',globalName:'probe',outfile:resolve(out,'probe.js'),define:{__CODE_CODEX_VERSION__:JSON.stringify('0.0.1'),'location.href':JSON.stringify('app://-/index.html'),'location.protocol':JSON.stringify('app:'),'location.host':JSON.stringify('-')}});
const manager=`class Manager{getConversation(){} startTurn(){} getStreamRole(){} onNotification(){} onRequest(){} executeTurnStart(){} sendAppServerResponse(){}}`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
 if(req.url==='/probe.js')res.end(readFileSync(resolve(out,'probe.js')));
 else if(req.url==='/assets/app-initial-good.js')res.end(manager+';export {Manager};');
 else if(req.url==='/assets/app-initial-bad.js')res.end('export class Missing{}');
 else if(req.url==='/assets/app-shared-good.js')res.end('export const dispatcher={subscribe(){window.rpc++;},dispatchMessage(){window.rpc++;}}');
 else res.end('<!doctype html><style>:root{--color-text:#123}</style><button data-app-shell-sidebar-trigger>Sidebar</button><header><div role="menubar"><button id="application-menu-trigger-file-menu">File</button></div></header><div><aside class="app-shell-left-panel"></aside><main class="main-surface"></main></div><script>window.rpc=0;window.originalProfile={initial:"./assets/app-initial-good.js",shared:"./assets/app-shared-good.js"};window[Symbol.for("code-codex:account-host-profile:v1")]=originalProfile;</script><script src="/probe.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
try{
 const run=(version)=>browser.evaluate(`probe.probeHostUpdate({version:'unknown-compatible',initial:[window[Symbol.for('code-codex:account-host-profile:v1')].initial],shared:['./assets/app-shared-good.js']},${version?JSON.stringify({version,background:[]}):'undefined'})`);
 const before=await browser.evaluate('document.documentElement.outerHTML');
 let r=await run();
 for(const id of ['regression.interfaces','regression.layout','regression.tree-route-mount','regression.models','regression.account-quota-card','regression.account-api-continuation','regression.official-update-handoff','regression.tree-version-startup','regression.tree-version-manual','regression.tree-version-install','regression.startup-video-selection','regression.startup-video-timeline'])assert.equal(r.checks.find(c=>c.id===id)?.status,'passed',id);
 const state=(id,result=r)=>result.checks.find(c=>c.id===id)?.status;
 assert.equal(state('host.interfaces'),'passed');checks.push('Production qualifier accepts real imported fixture modules independently of a version floor');
 assert.equal(state('host.layout'),'passed');checks.push('Production layout adapter executes on mounted fixture DOM');
 assert.equal(state('host.menu'),'passed');assert.equal(state('host.theme'),'passed');checks.push('Native menu/theme probes execute without clicking or modifying theme');
 assert.equal(state('host.composer'),'manual');assert.equal(state('host.quota'),'manual');checks.push('Absent composer/uninitialized quota roles remain unavailable, never passed or falsely broken');
 assert.equal(await browser.evaluate('window.rpc'),0);assert.equal(await browser.evaluate('window[Symbol.for("code-codex:account-host-profile:v1")]===originalProfile'),true);assert.equal(await browser.evaluate('document.documentElement.outerHTML'),before);checks.push('No native RPC, profile publication or DOM mutation');
 const observe=async(binding,retained,actual,sendBlocked,adapterBinding,nativeRouting)=>{
  await browser.evaluate(`(()=>{const owner={nativeBinding:'new',retainedAccounts:${JSON.stringify(retained?{nativeBinding:'old'}:null)}};const request=()=>{window.rpc++;throw Error('never call');};request.runtimeIdentity=${JSON.stringify(binding)};window[Symbol.for('code-codex:document-connection-owner:v2')]=owner;window[Symbol.for('code-codex:accounts-capability:v1')]={request};window[Symbol.for('code-codex:multi-account-runtime:v1')]={enabled:true,adapter:{request:{runtimeIdentity:${JSON.stringify(adapterBinding??binding)}},status:()=>({active:true,supported:true,conversationId:'fixture',sendBlocked:${sendBlocked}}),info:{nativeRouting:${nativeRouting??true},selected:{fixture:'api'},nativeRoutes:{fixture:${JSON.stringify(actual)}}}}};})()`);
  return await run();
 };
 for(const [binding,retained,actual,blocked,ownerStatus,routeStatus,adapterBinding,nativeRouting] of [
  ['new',false,'api',false,'passed','passed'],['new',false,'host',true,'passed','manual'],['new',false,'host',false,'passed','issue'],
  ['old',true,'api',false,'manual','manual'],['old',false,'api',false,'issue','manual'],
  ['new',false,'api',false,'issue','manual','old'],['new',false,'host',false,'passed','manual','new',false]]){
  const observed=await observe(binding,retained,actual,blocked,adapterBinding,nativeRouting);
  assert.equal(state('host.account-execution-owner',observed),ownerStatus);
  assert.equal(state('host.account-execution-route',observed),routeStatus);
 }
 assert.equal(await browser.evaluate('window.rpc'),0);
 await browser.evaluate(`for(const name of ['document-connection-owner:v2','accounts-capability:v1','multi-account-runtime:v1'])delete window[Symbol.for('code-codex:'+name)]`);
 checks.push('Account endpoint and saved-route observations catch stale ownership and unsafe fallback without calling native services');
 assert.equal(state('host.welcome-surface'),'manual');
 await browser.evaluate(`document.querySelector('main').innerHTML='<form><input></form>'`);
 const visibleHome=await browser.evaluate('document.documentElement.outerHTML');
 assert.equal(state('host.welcome-surface',await run()),'passed');
 assert.equal(await browser.evaluate('document.documentElement.outerHTML'),visibleHome);
 await browser.evaluate(`document.querySelector('main').innerHTML='<div data-codex-composer-root><button data-composer-navigation-target="reasoning">Model</button></div>'`);
 assert.equal(state('host.welcome-surface',await run()),'issue');
 await browser.evaluate(`document.querySelector('main').replaceChildren()`);
 checks.push('Welcome uses the mounted production gate, reports an unrecognized mounted composer, and does not open a dialog or write state');
 assert.equal(state('host.quick-tour-targets',await run()),'manual');
 await browser.evaluate(`window.tree=document.createElement('div');tree.dataset.codeCodexOwned='true';document.body.append(tree);window.treeRoot=tree.attachShadow({mode:'open'});treeRoot.innerHTML='<div class="preview-market-popover"></div><button class="preview-market-button"></button><button class="status-code"></button>';document.querySelector('header').insertAdjacentHTML('beforeend','<span data-code-codex-application-menu><button id="code-codex-application-menu-trigger"></button></span>');`);
 assert.equal(state('host.quick-tour-targets',await run()),'passed');
 await browser.evaluate(`treeRoot.append(treeRoot.querySelector('.status-code').cloneNode());`);
 assert.equal(state('host.quick-tour-targets',await run()),'issue');
 await browser.evaluate(`treeRoot.innerHTML='<div class="preview-market-popover"></div><footer><button class="status-code" aria-label="Check for updates" aria-controls="update-dialog">LOADING</button></footer><div id="update-dialog" role="dialog"><button class="update-install"></button><button class="update-later"></button></div>';window.versionButton=treeRoot.querySelector('.status-code');window[Symbol.for('code-codex:document-connection-owner:v2')]={version:'0.6.65'};`);
 for(const [workspace,label,disabled,feedback,expected] of [
  ['loading','LOADING',true,'','manual'],['ready','LOADING',true,'','issue'],
  ['ready','v0.6.65',false,'','passed'],['ready','v0.6.64',false,'','issue'],
  ['ready','↑ v0.7.0',false,'update','passed'],['ready','v0.6.65',false,'error','passed']]){
  await browser.evaluate(`Object.assign(versionButton,{textContent:${JSON.stringify(label)},disabled:${disabled}});versionButton.dataset.feedback=${JSON.stringify(feedback)};tree.dataset.state=${JSON.stringify(workspace)};`);
  assert.equal(state('host.tree-version-control',await run('0.6.65')),expected,`${workspace}: ${label}`);
 }
 await browser.evaluate(`treeRoot.querySelector('.update-later').remove();tree.dataset.state='loading';`);
 assert.equal(state('host.tree-version-control',await run('0.6.65')),'issue');
 await browser.evaluate(`delete window[Symbol.for('code-codex:document-connection-owner:v2')]`);
 checks.push('Tree version control distinguishes workspace loading, valid feedback, stale caption, and missing dialog controls');
 await browser.evaluate(`tree.remove();document.querySelector('[data-code-codex-application-menu]').remove()`);
 checks.push('Quick tour target probe distinguishes qualified, ambiguous and unmounted targets without starting the tour');
 await browser.evaluate(`window[Symbol.for('code-codex:account-host-profile:v1')]={initial:'./assets/app-initial-bad.js',shared:'./assets/app-shared-good.js'};`);
 r=await run();assert.equal(state('host.interfaces'),'issue');checks.push('Initialized incompatible native role reports an actual contract issue');
 await browser.evaluate(`window[Symbol.for('code-codex:account-host-profile:v1')]=undefined;`);
 r=await browser.evaluate(`probe.probeHostUpdate({version:'new',initial:['./assets/app-initial-never-loaded.js'],shared:['./assets/app-shared-good.js']})`);
 assert.equal(state('host.interfaces'),'manual');checks.push('Unobserved official module is never executed merely to run a test');
 assert.equal(state('host.split-layout'), 'manual');
 await browser.evaluate(`window[Symbol.for('code-codex:account-host-profile:v1')]=originalProfile`);
 await browser.evaluate(`document.querySelector('main').innerHTML='<div data-app-shell-workspace-layout="split" data-app-shell-right-panel-full-width="false" style="width:240px;overflow:hidden"><div class="MainContentFrame-fixture" style="width:520px;min-width:100%;margin-left:-280px"><p>Native transcript</p></div></div><aside data-app-shell-focus-area="right-panel">Panel</aside>'`);
 r=await run();assert.equal(state('host.split-layout'),'issue');
 await browser.evaluate(`const f=document.querySelector('.MainContentFrame-fixture');f.style.maxWidth='100%';f.style.marginLeft='0px'`);
 r=await run();assert.equal(state('host.split-layout'),'passed');checks.push('Mounted native split geometry distinguishes clipping, fitting and unmounted cases without mutation');
 await browser.evaluate(`document.querySelector('main').innerHTML='<div class="thread-scroll-container"><div class="pointer-events-none"><div data-thread-scroll-footer="true" style="height:80px">Footer</div></div></div>';document.documentElement.setAttribute('data-code-codex-ui-mask-active','true');document.head.insertAdjacentHTML('beforeend','<style id="footer-style">.pointer-events-none::before{content: "";background-image:linear-gradient(transparent,black)}</style>')`);
 r=await run();assert.equal(state('host.composer-backdrop'),'issue');
 await browser.evaluate(`document.querySelector('#footer-style').textContent='.pointer-events-none::before{content:"";background:none}'`);
 r=await run();assert.equal(state('host.composer-backdrop'),'passed');
 const paintBefore=await browser.evaluate('document.documentElement.outerHTML');await run();assert.equal(await browser.evaluate('document.documentElement.outerHTML'),paintBefore);assert.equal(await browser.evaluate('window.rpc'),0);
 checks.push('Mounted footer pseudo paint distinguishes issue/passed with no RPC or document mutation');
 await browser.evaluate(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);r=await run();assert.equal(state('host.composer-backdrop'),'manual');checks.push('Inactive surface opacity never falsely certifies transparency');
 assert.equal(state('regression.account-behavior'),'passed');checks.push('Production quota and continuation decision scenarios execute without account RPC');
 await browser.evaluate(`document.documentElement.setAttribute('data-code-codex-particle-image-background','true');document.querySelector('main').innerHTML='<div data-app-shell-focus-area="main"><div class="electron:bg-surface rounded-tl-lg" style="height:100px;background:black"><button style="background:black">Native control</button></div></div>'`);
 r=await run();assert.equal(state('host.settings-paint'),'issue');
 await browser.evaluate(`document.querySelector('[class~="electron:bg-surface"]').style.background='transparent'`);
 r=await run();assert.equal(state('host.settings-paint'),'passed');
 await browser.evaluate(`document.head.insertAdjacentHTML('beforeend','<style id="settings-paint">[class~="electron:bg-surface"]::after{content:"";background:linear-gradient(transparent,black)}</style>')`);
 r=await run();assert.equal(state('host.settings-paint'),'issue');
 await browser.evaluate(`document.querySelector('#settings-paint').remove();const n=document.querySelector('[class~="electron:bg-surface"]');n.replaceWith(n.cloneNode(true))`);
 r=await run();assert.equal(state('host.settings-paint'),'passed');
 const settingsBefore=await browser.evaluate('document.documentElement.outerHTML');await run();assert.equal(await browser.evaluate('document.documentElement.outerHTML'),settingsBefore);assert.equal(await browser.evaluate('window.rpc'),0);
 checks.push('Shared Settings paint detects element/pseudo regressions across remount without modifying controls or making RPC');
 await browser.evaluate(`document.documentElement.removeAttribute('data-code-codex-particle-image-background')`);r=await run();assert.equal(state('host.settings-paint'),'manual');
 await browser.evaluate(`document.querySelector('main').remove();document.querySelector('[role=menubar]').remove();document.documentElement.style.setProperty('--color-text','');document.querySelector('style').remove();`);
 r=await browser.evaluate(`probe.probeHostUpdate({initial:[],shared:[]})`);assert.equal(state('host.layout'),'manual');assert.equal(state('host.menu'),'manual');assert.equal(state('host.theme'),'manual');checks.push('Unmounted views and unavailable theme tokens stay manual');
 const backgroundIds=['background.market-layout','background.split-layout','background.composer-backdrop','background.conversation-top-paint','background.side-panel-paint','background.tree-rail-paint','background.settings-paint','background.nav-page-paint','background.surface-transitions'];
 const shellCSS=readFileSync(resolve(ui,'src/inject.ts'),'utf8');
 const productionMarket=readFileSync(resolve(ui,'src/components/styles/status-and-market.ts'),'utf8').split('`')[1];
 const productionSide=readFileSync(resolve(ui,'src/native-side-panel-opacity.ts'),'utf8');
 assert.match(shellCSS,/max-width: 100% !important/);
 assert.match(productionSide,/background-color:transparent !important/);
 const backgroundSetup=await build({stdin:{resolveDir:ui,contents:`import {styles} from './src/styles';import {NATIVE_COMPOSER_BACKDROP_CSS} from './src/native-composer-backdrop';import {NATIVE_SIDE_PANEL_OPACITY_CSS} from './src/native-side-panel-opacity';import {NATIVE_WORKSPACE_BACKGROUND_CSS} from './src/native-workspace-background';window.updateFixtureStyles={styles,NATIVE_COMPOSER_BACKDROP_CSS,NATIVE_SIDE_PANEL_OPACITY_CSS,NATIVE_WORKSPACE_BACKGROUND_CSS};`},bundle:true,format:'iife',write:false});
 await browser.evaluate(backgroundSetup.outputFiles[0].text);
 await browser.evaluate(`(()=>{const owner=Symbol.for('code-codex:document-connection-owner:v2');window[owner]={version:'test',pending:false};const host=document.createElement('div');host.dataset.codeCodexOwned='true';host.attachShadow({mode:'open'});const styles=window.updateFixtureStyles;const css=document.createElement('style');css.textContent=styles.styles;host.shadowRoot.append(css);host.shadowRoot.innerHTML += '<button class="collapsed-tab">Expand</button><div class="preview-market-popover" hidden><div class="preview-market-list">'+['appearance','file-preview','developer-tools'].map(value=>'<section data-preview-market-section="'+value+'" class="preview-market-section"><div style="height:450px">Fixture cards</div></section>').join('')+'</div></div>';document.body.append(host);const shell=document.createElement('style');shell.dataset.codeCodexShellLayout='test';shell.textContent=styles.NATIVE_COMPOSER_BACKDROP_CSS+styles.NATIVE_SIDE_PANEL_OPACITY_CSS+'[data-code-codex-owned][data-placement=inline]+div main [data-app-shell-workspace-layout=split]>[class*=MainContentFrame-]{max-width:100%!important}';document.head.append(shell);window.probeTree=host;})()`);
 assert.ok(productionMarket.includes('overflow: auto'));
 const beforeBackground=await browser.evaluate(`({dom:document.documentElement.outerHTML,market:probeTree.shadowRoot.innerHTML,scroll:window.scrollY})`);
 const runBackground=(ids=backgroundIds)=>browser.evaluate(`probe.probeHostUpdate({initial:[],shared:[]},{version:'test',background:${JSON.stringify(ids)}})`);
 assert.equal(state('background.nav-page-paint',await runBackground(['background.nav-page-paint'])),'issue');
 await browser.evaluate(`document.querySelector('[data-code-codex-shell-layout]').textContent+=updateFixtureStyles.NATIVE_WORKSPACE_BACKGROUND_CSS`);
 beforeBackground.dom=await browser.evaluate('document.documentElement.outerHTML');
 r=await runBackground();
 for(const id of backgroundIds)assert.equal(state(id),'passed',JSON.stringify(r.checks.find(c=>c.id===id)));
 assert.equal(state('host.market-scroll'),'manual');assert.equal(state('host.split-layout'),'manual');
 const sceneEvidence=r.checks.filter(check=>check.scope==='isolated-mounted-regression'&&check.evidenceFor?.startsWith('host.'));
 assert.equal(sceneEvidence.length,19);
 assert.equal(new Set(sceneEvidence.map(item=>item.evidenceFor)).size,19);
 for(const item of sceneEvidence){
  assert.equal(item.status,item.evidenceFor==='host.menu-closed-indicators'?'manual':'passed',JSON.stringify(item));
 }
 assert.deepEqual(await browser.evaluate(`({dom:document.documentElement.outerHTML,market:probeTree.shadowRoot.innerHTML,scroll:window.scrollY})`),beforeBackground);
 assert.equal(await browser.evaluate(`document.querySelectorAll('[data-code-codex-update-sandbox]').length`),0);
 checks.push('Isolated mounts cover background, opacity, tree fold/reopen, split and summary states without changing user UI');
 await browser.evaluate(`document.body.insertAdjacentHTML('beforeend','<div id="code-codex-language-popup" popover="manual" hidden><button role="menuitemradio">English</button></div><style data-code-codex-application-menu-style>[data-code-codex-menu-check]{display:inline-flex}</style>')`);
 r=await runBackground(['background.surface-transitions']);
 assert.equal(state('host.menu-closed-indicators'),'manual');
 assert.equal(state('isolated.host.menu-closed-indicators'),'passed');
 await browser.evaluate(`document.querySelector('#code-codex-language-popup').remove();document.querySelector('style[data-code-codex-application-menu-style]').remove();`);
 checks.push('All 19 isolated interface scenarios have individual evidence, including the closed language indicator');
 await browser.evaluate(`(()=>{
  const doc=window[Symbol.for('code-codex:document-connection-owner:v2')];
  doc.nativeBinding='new';doc.retainedAccounts={nativeBinding:'old'};
  window[Symbol.for('code-codex:accounts-capability:v1')]={request:{runtimeIdentity:'old'}};
  window[Symbol.for('code-codex:multi-account-runtime:v1')]={enabled:true,adapter:{
   request:{runtimeIdentity:'new'},info:{owner:{id:'owner',label:'isolated@example.test'},connections:[],activeConversations:[],nativeRouting:true,selected:{fixture:'host'}},
   status:()=>({supported:true,active:true,conversationId:'fixture'}),
   usage:{remaining:()=>({fiveHour:0,weekly:99.2}),resetTimes:()=>({fiveHour:null,weekly:null}),diagnostics:()=>{window.accountCacheObserved=true;return {phase:'ready'};}}
  }};
  window.accountHandoffProbe=probe.probeHostUpdate({initial:[],shared:[]},{version:'test',background:[]}).then(value=>{window.accountProbeDone=true;return value;});
 })()`);
 assert.equal(await browser.evaluate(`(async()=>{for(let i=0;i<60&&!window.accountCacheObserved;i++)await new Promise(requestAnimationFrame);return !!window.accountCacheObserved&&!window.accountProbeDone;})()`),true);
 await browser.evaluate(`delete window[Symbol.for('code-codex:document-connection-owner:v2')].retainedAccounts;window[Symbol.for('code-codex:accounts-capability:v1')].request.runtimeIdentity='new';window.dispatchEvent(new Event('code-codex:account-handoff-committed'));`);
 const finishedAccount=await browser.evaluate('window.accountHandoffProbe');
 for(const id of ['host.account-execution-owner','host.account-execution-route','isolated.host.account-panel-identity','isolated.host.account-panel-quota']){
  assert.equal(state(id,finishedAccount),'passed',JSON.stringify(finishedAccount.checks.find(c=>c.id===id)));
 }
 await browser.evaluate(`delete window[Symbol.for('code-codex:accounts-capability:v1')];delete window[Symbol.for('code-codex:multi-account-runtime:v1')];`);
 checks.push('Cached account identity and quota render without opening the panel, and the handoff event triggers the route read');
 await browser.evaluate(`(()=>{
  const stage=document.createElement('div');stage.id='pixel-stage';stage.style.cssText='position:fixed;left:12px;top:12px;width:320px;height:120px;background:rgb(247,230,24);z-index:9999';
  stage.innerHTML='<main class="main-surface" style="position:relative;height:120px"><div data-app-shell-main-content-layout="default"><div data-app-shell-focus-area="main"><div data-app-shell-inline-page-header><div data-sticky data-expand-search id="pixel-header" style="height:24px"></div></div></div></div></main><style>#pixel-header::before{content:"";position:absolute;inset:0 0 auto;height:24px;background:black}</style>';
  document.body.append(stage);document.documentElement.setAttribute('data-code-codex-glow-horizon-background','');
 })()`);
 const pixel = async () => {
  const shot = await browser.command('Page.captureScreenshot', {format:'png',clip:{x:22,y:19,width:1,height:1,scale:1}});
  return browser.evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,${shot.data}';await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [...ctx.getImageData(0,0,1,1).data];})()`);
 };
 assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('#pixel-header'),'::before').backgroundColor`),'rgba(0, 0, 0, 0)','production CSS clears the header pseudo element');
 assert.deepEqual(await pixel(),[247,230,24,255],'recognized header preserves the actual contrast pixel');
 await browser.evaluate(`document.querySelector('#pixel-header').removeAttribute('data-expand-search');`);
 assert.deepEqual(await pixel(),[0,0,0,255],'an unrecognized painted header obscures the actual contrast pixel');
 await browser.evaluate(`document.querySelector('#pixel-stage').remove();document.documentElement.removeAttribute('data-code-codex-glow-horizon-background');const shell=document.querySelector('[data-code-codex-shell-layout]');shell.textContent=shell.textContent.replace(updateFixtureStyles.NATIVE_WORKSPACE_BACKGROUND_CSS,'');`);
 checks.push('Browser screenshot corroborates transparent and unrecognized opaque pseudo-element paint');
 await browser.evaluate(`probeTree.shadowRoot.querySelector('style').textContent += '.preview-market-list[data-preview-market-category=developer-tools]{overflow-y:hidden!important}'`);
 r=await runBackground(['background.market-layout']);assert.equal(state('background.market-layout'),'issue');assert.equal(r.checks.filter(c=>c.scope==='isolated-mounted-regression').length,1);checks.push('One blocked market category fails, and unrelated isolated checks are not run');
 await browser.evaluate(`window[Symbol.for('code-codex:document-connection-owner:v2')].pending=true;window.delayedProbe=probe.probeHostUpdate({initial:[],shared:[]},{version:'test',background:[]}).then(r=>{window.delayedDone=true;return r;});void 0;`);
 assert.notEqual(await browser.evaluate('window.delayedDone'),true);
 await browser.evaluate(`window[Symbol.for('code-codex:document-connection-owner:v2')].pending=false;window.dispatchEvent(new Event('code-codex:update-mount-ready'));`);
 r=await browser.evaluate('window.delayedProbe');assert.equal(state('host.ownership'),'passed');checks.push('A late owner is validated once when its existing mount signal arrives');
 const workspaceStyles=await build({stdin:{resolveDir:ui,contents:`import {NATIVE_WORKSPACE_BACKGROUND_CSS} from './src/native-workspace-background';window.workspacePaintCSS=NATIVE_WORKSPACE_BACKGROUND_CSS;`},bundle:true,format:'iife',write:false});
 await browser.evaluate(workspaceStyles.outputFiles[0].text);
 await browser.evaluate(`(()=>{
  const row=document.createElement('section');row.dataset.appShellWorkspace='true';row.style.cssText='height:180px;display:flex;position:relative';
  row.innerHTML='<div data-app-shell-surface-backing="true" class="pointer-events-none" style="position:absolute;inset:0;background:rgb(24,24,24)"></div><main data-app-shell-main-surface="default" style="margin-top:8px;height:100px"><button style="background:black">Native control</button></main>';
  document.body.append(row);row.insertBefore(probeTree,row.lastElementChild);probeTree.dataset.placement='inline';probeTree.dataset.mountStrategy='known:workspace-row';
  probeTree.style.cssText='height:100px;margin-top:8px';document.documentElement.setAttribute('data-code-codex-particle-image-background','true');
 })()`);
 r=await runBackground([]);
 assert.equal(state('host.tree-top-alignment'),'issue');
 assert.equal(state('host.workspace-backing-paint'),'issue');
 await browser.evaluate(`(()=>{const style=document.createElement('style');style.id='verified-workspace-paint';style.textContent=workspacePaintCSS;document.head.append(style);probeTree.style.marginTop='0';})()`);
 r=await runBackground([]);
 assert.equal(state('host.tree-top-alignment'),'passed');
 assert.equal(state('host.workspace-backing-paint'),'passed');
 assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('main button')).backgroundColor`),'rgb(0, 0, 0)');
 await browser.evaluate(`document.documentElement.removeAttribute('data-code-codex-particle-image-background')`);
 r=await runBackground([]);
 assert.equal(state('host.workspace-backing-paint'),'manual');
 assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('[data-app-shell-surface-backing]')).backgroundColor`),'rgb(24, 24, 24)');
 checks.push('Native workspace backing and the former 8px tree gap fail independently; the production CSS preserves background-off paint and nested controls');
 await browser.evaluate(`(()=>{
  const top=document.createElement('div');top.dataset.appShellMainContentLayout='thread-edge-scroll';
  top.innerHTML='<div id="official-top-fade" class="pointer-events-none absolute top-0 h-[var(--app-shell-content-fade-height)]" style="height:40px;background:linear-gradient(black,transparent)"></div><button class="top-0" id="top-control" style="background:black">Menu</button><div class="MainContentTopFade_legacy" style="height:16px;background:black"></div>';
  document.querySelector('main[data-app-shell-main-surface]').append(top);
  document.documentElement.setAttribute('data-code-codex-ui-mask-active','');
  document.getElementById('verified-workspace-paint').disabled=true;
 })()`);
 r=await runBackground([]);
 assert.equal(state('host.conversation-top-paint'),'issue');
 await browser.evaluate(`document.getElementById('verified-workspace-paint').disabled=false`);
 for (const alpha of [0,.5,1]){
  await browser.evaluate(`document.documentElement.style.setProperty('--code-codex-mask-conversation','${alpha}')`);
  r=await runBackground([]);
  assert.equal(state('host.conversation-top-paint'),'passed',`conversation alpha ${alpha}`);
 }
 assert.equal(await browser.evaluate(`getComputedStyle(document.getElementById('top-control')).backgroundColor`),'rgb(0, 0, 0)');
 await browser.evaluate(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);
 r=await runBackground([]);
 assert.equal(state('host.conversation-top-paint'),'manual');
 assert.match(await browser.evaluate(`getComputedStyle(document.getElementById('official-top-fade')).backgroundImage`),/linear-gradient/);
 await browser.evaluate(`document.documentElement.setAttribute('data-code-codex-transparent-background','')`);
 r=await runBackground([]);
 assert.equal(state('host.conversation-top-paint'),'passed');
 await browser.evaluate(`document.querySelector('[data-code-codex-shell-layout]').textContent += workspacePaintCSS`);
 r=await runBackground(['background.conversation-top-paint']);
 assert.equal(state('background.conversation-top-paint'),'passed');
 checks.push('Current and legacy top fades are diagnosed, cleared across the conversation range and restored on deactivate; native controls remain styled');
 await browser.evaluate(`(()=>{
  const main=document.querySelector('main[data-app-shell-main-surface]');
  const frame=main.closest('[data-app-shell-workspace]');
  frame.dataset.appShellFrame='true';
  frame.dataset.appShellPageSurface='true';
  frame.style.backgroundImage='linear-gradient(rgba(24,24,24,.5),rgba(24,24,24,.5))';
  main.insertAdjacentHTML('beforeend','<div><div class="group/turn-diff-header">Changes</div><div class="group/turn-diff-file-row"><div data-state="closed"><button id="wrapped-row" style="background-color:rgba(24,24,24,.7)">File</button></div></div></div><button data-state="closed" id="unrelated-row" style="background-color:black">Unrelated</button>');
  document.documentElement.setAttribute('data-code-codex-ui-mask-active','');
  document.documentElement.style.setProperty('--code-codex-mask-changes','0');
  const shell=document.querySelector('[data-code-codex-shell-layout]');
  shell.textContent=shell.textContent.replace(workspacePaintCSS,'');
  document.getElementById('verified-workspace-paint').disabled=true;
 })()`);
 r=await runBackground([]);
 assert.equal(state('host.page-frame-paint'),'issue');
 assert.equal(state('host.turn-change-paint'),'issue');
 await browser.evaluate(`document.getElementById('verified-workspace-paint').disabled=false`);
 r=await runBackground([]);
 assert.equal(state('host.page-frame-paint'),'passed');
 assert.equal(state('host.turn-change-paint'),'passed');
 assert.equal(await browser.evaluate(`getComputedStyle(document.getElementById('unrelated-row')).backgroundColor`),'rgb(0, 0, 0)');
 await browser.evaluate(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);
 assert.match(await browser.evaluate(`getComputedStyle(document.querySelector('[data-app-shell-frame]')).backgroundImage`),/linear-gradient/);
 assert.equal(await browser.evaluate(`getComputedStyle(document.getElementById('wrapped-row')).backgroundColor`),'rgba(24, 24, 24, 0.7)');
 r=await runBackground([]);
 assert.equal(state('host.page-frame-paint'),'manual');
 assert.equal(state('host.turn-change-paint'),'manual');
 checks.push('Independent page-frame and wrapped change-row paint catches 50% and 70% native masks, preserves unrelated controls and restores native paint when inactive');
 const declared=JSON.parse(readFileSync(resolve(ui,'../../resources/plugin-definitions.json'),'utf8')).plugins;
 await browser.evaluate(`(()=>{
  for(const [id,category] of ${JSON.stringify(declared.map(plugin=>[plugin.id,plugin.category]))}){
   const section=probeTree.shadowRoot.querySelector('[data-preview-market-section="'+category+'"]');
   section.insertAdjacentHTML('beforeend','<article class="preview-extension"><span data-plugin-icon="'+id+'"></span><h4>'+id+'</h4><button class="preview-extension-action">Enable</button></article>');
  }
 })()`);
 r=await runBackground([]);
 const checkFor=plugin=>`host.plugin-${plugin.capabilities.includes('background')?'backgrounds':plugin.id}`;
 for (const plugin of declared){
  const check=r.checks.find(check=>check.id===checkFor(plugin));
  assert.equal(check?.status,'passed',plugin.id);
  assert.match(check.detail,new RegExp(`\\b${plugin.id}\\b`));
 }
 await browser.evaluate(`(()=>{
  const root=probeTree.shadowRoot;
  root.querySelector('[data-plugin-icon="pdf-preview"]').closest('article').remove();
  root.querySelector('[data-preview-market-section="appearance"]').append(root.querySelector('[data-plugin-icon="git-history"]').closest('article'));
  const card=root.querySelector('[data-plugin-icon="shallow-ocean"]').closest('article');
  card.after(card.cloneNode(true));
 })()`);
 r=await runBackground([]);
 for (const id of ['pdf-preview','git-history','backgrounds']) assert.equal(state('host.plugin-'+id),'issue');
 for (const id of ['markdown-preview','lan-remote','multi-account','surface-opacity','codex-startup-transition','transparent-background']) assert.equal(state('host.plugin-'+id),'passed');
 assert.match(r.checks.find(check=>check.id==='host.plugin-backgrounds').detail,/shallow-ocean/);
 checks.push('All catalog cards resolve individually or to the shared backgrounds group; omissions, duplicates and misplaced cards fail only their own checks');
 await browser.evaluate(`(()=>{
  probeTree.style.cssText='position:fixed;left:100px;width:140px;height:150px';
  const title=document.createElement('header');
  title.id='viewport-title';title.dataset.appShellTitlebar='true';title.dataset.pipObstacle='app-shell-header';
  title.style.cssText='position:fixed;left:100px;width:300px;height:30px';
  document.body.append(title);
 })()`);
 assert.equal(state('host.tree-titlebar-clearance',await runBackground([])),'issue');
 await browser.evaluate(`document.getElementById('viewport-title').style.left=(probeTree.getBoundingClientRect().right+2)+'px'`);
 assert.equal(state('host.tree-titlebar-clearance',await runBackground([])),'passed');
 await browser.evaluate(`(()=>{
  const title=document.getElementById('viewport-title');
  title.removeAttribute('data-pip-obstacle');title.removeAttribute('data-app-shell-titlebar');title.innerHTML='<span data-app-shell-titlebar-content>Legacy</span>';
 })()`);
 assert.equal(state('host.tree-titlebar-clearance',await runBackground([])),'passed');
 checks.push('Current and legacy fixed titlebars are measured against the tree edge; actual overlap fails');
 await browser.evaluate(`(()=>{const edit=document.createElement('button');edit.className='edit-mode-toggle';edit.setAttribute('aria-pressed','false');edit.disabled=true;edit.textContent='Read only';probeTree.shadowRoot.append(edit);})()`);
 assert.equal(state('host.tree-edit',await runBackground([])),'passed');
 await browser.evaluate(`probeTree.shadowRoot.querySelector('.edit-mode-toggle').textContent=''`);
 assert.equal(state('host.tree-edit',await runBackground([])),'issue');
 await browser.evaluate(`probeTree.shadowRoot.querySelector('.edit-mode-toggle').textContent='Read only'`);
 checks.push('A disabled editing-mode button still has an accessible visible name; losing that name fails');
 await browser.evaluate(`(()=>{
  const node=document.createElement('section');node.className='accounts-panel';node.popover='manual';
  node.innerHTML='<article class="accounts-connection" data-host="true" data-signed="true"><span class="accounts-login-dot" aria-label="Signed in"></span><span class="account-quota" data-quota-resets><b class="account-quota-value">—</b><b class="account-quota-value">—</b><b class="account-quota-reset"></b><b class="account-quota-reset"></b><button data-account-asset="credit"></button><button data-account-asset="reset"></button></span></article>';
  probeTree.shadowRoot.append(node);node.showPopover();
 })()`);
 r=await runBackground([]);
 assert.equal(state('host.account-panel-identity'),'passed');
 assert.equal(state('host.account-panel-quota'),'issue');
 await browser.evaluate(`(()=>{
  const quota=probeTree.shadowRoot.querySelector('.account-quota');
  quota.dataset.quotaPhase='unavailable';
 })()`);
 assert.equal(state('host.account-panel-quota',await runBackground([])),'manual');
 await browser.evaluate(`(()=>{
  const quota=probeTree.shadowRoot.querySelector('.account-quota');quota.dataset.quotaPhase='ready';
  const [first,second]=quota.querySelectorAll('.account-quota-value');first.textContent='0%';second.textContent='97.5%';
 })()`);
 assert.equal(state('host.account-panel-quota',await runBackground([])),'passed');
 checks.push('A signed-in card without a read is a failure; provider unavailable stays unverified; zero and decimal quota pass with both valid windows');
 await browser.evaluate(`(()=>{
  document.getElementById('viewport-title').remove();
  const header=document.createElement('header');header.dataset.appShellTitlebar='true';header.dataset.pipObstacle='app-shell-header';
  header.style.cssText='position:fixed;top:0;left:600px;width:230px;height:50px';
  header.innerHTML='<div data-app-shell-focus-area="main" style="display:flex;gap:5px"><button aria-label="Share" style="width:28px;height:28px"></button><button aria-label="Toggle pinned summary" aria-pressed="false" style="width:28px;height:28px"></button><button data-app-shell-workspace-layout-toggle="main" aria-label="Show tabs" style="width:28px;height:28px"></button></div>';
  document.body.append(header);
  const rail=document.createElement('nav');rail.dataset.appNavigationRail='';rail.innerHTML='<button data-sidebar-destination="builtin:space">Space</button>';document.body.append(rail);
  document.documentElement.setAttribute('data-code-codex-glow-horizon-background','');
 })()`);
 r=await runBackground([]);
 for(const id of ['host.nav-space','host.toolbar-share','host.toolbar-summary','host.toolbar-tabs','host.toolbar-share-paint']) assert.equal(state(id),'passed',id);
 assert.equal(state('host.nav-scheduled'),'manual');
 await browser.evaluate(`document.querySelector('button[aria-label="Show tabs"]').style.width='10px';document.querySelector('[data-app-shell-titlebar] > div').style.background='black'`);
 r=await runBackground([]);
 assert.equal(state('host.toolbar-tabs'),'issue');
 assert.equal(state('host.toolbar-share-paint'),'issue');
 assert.equal(state('host.toolbar-summary'),'passed');
 checks.push('Named rail destinations, cramped toolbar controls and repeated toolbar paint have independent outcomes');
 const result={scope:'isolated browser fixtures; not real-host acceptance',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
