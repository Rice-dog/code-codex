import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const out=resolve(root,process.env.CODE_CODEX_TEST_OUTPUT??'artifacts/plugin-action-lifecycle');mkdirSync(out,{recursive:true});
const catalog=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8')).filter(p=>p.id==='custom-background');
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import './core/localization/runtime';import {BackgroundPackageMarket} from './background-package-market';import {connectPluginPackages,isPluginPackageLoaded,ensurePluginPackage} from './plugin-runtime';import {localizeOwnedUi,applyLanguage} from './i18n';import {CustomBackground} from './custom-background';window.TestActions={BackgroundPackageMarket,connectPluginPackages,isPluginPackageLoaded,ensurePluginPackage,localizeOwnedUi,applyLanguage,CustomBackground};`,loader:'ts',resolveDir:resolve(ui,'src')},bundle:true,format:'iife',define:{__CODE_CODEX_PLUGIN_CATALOG__:JSON.stringify(catalog)},outfile:resolve(out,'actions.js')});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/actions.js'?'text/javascript':'text/html');res.end(req.url==='/actions.js'?readFileSync(resolve(out,'actions.js')):'<!doctype html><body><div id="fixture"></div><script src="/actions.js"></script></body>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),ev=e=>browser.evaluate(e),report={checks:[]};
async function wait(expression){for(let i=0;i<200;i++){if(await ev(expression))return;await delay(25);}throw Error('Timed out: '+expression);}
async function check(name,expression){assert.equal(await ev(expression),true,name);report.checks.push(name);}
try{
 await wait(`!!window.TestActions&&!!document.querySelector('#fixture')`);
 await ev(`(()=>{window.errors=[];window.notices=[];addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.s=document.querySelector('#fixture').attachShadow({mode:'open'});s.innerHTML='<article class="preview-extension" data-appearance-plugin="code-codex.custom-background-background"><div class="preview-extension-copy"><h4 data-plugin-name>Custom Background</h4><span class="preview-extension-status">Disabled</span></div><div class="preview-extension-actions"><button class="preview-extension-action" aria-pressed="false" data-enabled="false">Enable</button><button class="particle-settings-trigger">Settings</button></div></article>';window.button=s.querySelector('.preview-extension-action');window.cardStatus=s.querySelector('.preview-extension-status');window.loadCalls=0;window.actionCalls=0;window.revision=1;window.catalog=${JSON.stringify(catalog)};TestActions.applyLanguage({schema:1,locale:'zh-CN',revision:revision++,source:'menu'});window.stopLocalization=TestActions.localizeOwnedUi(s);window.request=async method=>{if(method==='explorer.plugins.status')return[{id:'custom-background',installed:true}];if(method==='explorer.plugins.load'){loadCalls++;await new Promise((resolve,reject)=>{window.resolveLoad=()=>{window[Symbol.for('code-codex:background-modules:v1')]??=new Map();window[Symbol.for('code-codex:background-modules:v1')].set('custom-background',{id:'custom-background',api:1,version:catalog[0].version,exports:{}});resolve();};window.rejectLoad=()=>reject(Error('Fixture plugin load failed'));});return{};}return{};};TestActions.connectPluginPackages(request);window.makeMarket=()=>new TestActions.BackgroundPackageMarket(s,{request},v=>notices.push(v));window.market=makeMarket();s.addEventListener('click',e=>{if(e.target!==button)return;actionCalls++;const active=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(active));button.dataset.enabled=String(active);button.textContent=active?'Disable':'Enable';cardStatus.textContent=active?'Enabled':'Disabled';});})()`);
 await wait(`button.textContent==='启用'&&!button.disabled`);
 await ev(`button.click()`);await wait(`button.disabled&&button.textContent.includes('加载')&&typeof resolveLoad==='function'`);
 // An auto-restored runtime becomes active while the previous coordinator owns Loading.
 // Replace that coordinator as native reconnect does; localized text must not act as state.
 await ev(`window.addEventListener('code-codex:plugin-loaded',()=>{button.setAttribute('aria-pressed','true');button.dataset.enabled='true';cardStatus.textContent='Enabled';market.render();TestActions.applyLanguage({schema:1,locale:'zh-CN',revision:revision++,source:'menu'});market.dispose();window.market=makeMarket();},{once:true});resolveLoad();`);
 await wait(`TestActions.isPluginPackageLoaded('custom-background')`);await delay(80);await ev(`market.render()`);await delay(30);
 report.afterReconnect=await ev(`({text:button.textContent,disabled:button.disabled,pressed:button.getAttribute('aria-pressed'),status:cardStatus.textContent})`);
 await check('Chinese active card recovers from translated Loading after coordinator replacement',`button.textContent==='停用'&&!button.disabled&&button.getAttribute('aria-pressed')==='true'`);
 await check('Disposed load completion never replays an obsolete enable',`actionCalls===0`);
 await ev(`button.click()`);await delay(30);
 await check('Recovered active plugin can be stopped immediately',`actionCalls===1&&button.getAttribute('aria-pressed')==='false'&&button.textContent==='启用'&&!button.disabled`);
 await ev(`button.click()`);await delay(30);
 await check('Cached module enables directly without another loading transaction',`actionCalls===2&&loadCalls===1&&button.textContent==='停用'&&!button.disabled`);
 await ev(`TestActions.applyLanguage({schema:1,locale:'en',revision:revision++,source:'menu'});market.render()`);await delay(30);
 await check('English uses the same actionable Disable state',`button.textContent==='Disable'&&!button.disabled`);
 await ev(`TestActions.applyLanguage({schema:1,locale:'zh-CN',revision:revision++,source:'menu'});market.render()`);await delay(30);
 await check('Repeated language/render cycles cannot restore a translated Loading lease',`button.textContent==='停用'&&!button.disabled&&cardStatus.textContent==='已启用'`);
 await ev(`market.dispose();stopLocalization();window[Symbol.for('code-codex:verified-plugin-modules:v1')].clear();window[Symbol.for('code-codex:background-modules:v1')].clear();button.dataset.enabled='false';button.setAttribute('aria-pressed','false');button.textContent='Enable';window.stopLocalization=TestActions.localizeOwnedUi(s);window.market=makeMarket()`);await delay(50);
 await ev(`button.click()`);await wait(`loadCalls===2&&button.disabled`);await ev(`rejectLoad()`);await delay(80);
 await check('Failed package load releases the action and permits retry',`!button.disabled&&button.textContent==='启用'&&notices.some(v=>v.includes('Fixture plugin load failed'))`);
 await ev(`button.click()`);await wait(`loadCalls===3&&button.disabled`);await ev(`resolveLoad()`);await delay(80);
 await check('Retry replays exactly one current action after failure',`actionCalls===3&&button.textContent==='停用'&&!button.disabled`);
 await ev(`market.dispose();stopLocalization();window.second=document.createElement('div');document.body.append(second);window.cs=second.attachShadow({mode:'open'});cs.innerHTML='<article class="preview-extension" data-appearance-plugin="code-codex.custom-background-background"><button class="custom-background-enable">Enable</button><span class="custom-background-status"></span><button class="custom-background-settings">Settings</button></article><section class="custom-background-panel" popover="manual" hidden></section>';window.stopCustomLocalization=TestActions.localizeOwnedUi(cs);window.beforeEnableCalls=0;window.delayEnable=false;window.reported=[];window.custom=new TestActions.CustomBackground(cs,async()=>{beforeEnableCalls++;if(delayEnable)await new Promise((resolve,reject)=>{window.finishEnable=resolve;window.failEnable=()=>reject(Error('Fixture enable prerequisite failed'));});},(code,e)=>reported.push(code+': '+e));`);
 await ev(`custom.ready`);await ev(`window.delayEnable=true;cs.querySelector('.custom-background-enable').click()`);
 await wait(`typeof finishEnable==='function'`);
 await check('Only a genuine runtime transaction disables its action with an explicit pending state',`cs.querySelector('.custom-background-enable').disabled&&cs.querySelector('.custom-background-enable').dataset.runtimePending==='true'`);
 await ev(`cs.querySelector('.custom-background-enable').dispatchEvent(new MouseEvent('click',{bubbles:true}));finishEnable();window.delayEnable=false`);await delay(50);
 await check('Real Custom controller uses common Chinese Stop and ignores duplicate pending clicks',`cs.querySelector('.custom-background-enable').textContent==='停用'&&!cs.querySelector('.custom-background-enable').disabled&&beforeEnableCalls===1`);
 await ev(`cs.querySelector('.custom-background-enable').click()`);await delay(30);await ev(`window.delayEnable=true;cs.querySelector('.custom-background-enable').click()`);await delay(30);await ev(`window.dispatchEvent(new Event('code-codex:custom-background-stop'));finishEnable()`);await delay(50);
 await check('External stop cancels a pending enable and releases the runtime action',`cs.querySelector('.custom-background-enable').textContent==='启用'&&!cs.querySelector('.custom-background-enable').disabled&&cs.querySelector('.custom-background-enable').getAttribute('aria-pressed')==='false'`);
 await ev(`cs.querySelector('.custom-background-enable').click()`);await delay(30);await ev(`failEnable()`);await delay(50);
 await check('Failed enable prerequisites restore an actionable Enable and preserve the original English error',`cs.querySelector('.custom-background-enable').textContent==='启用'&&!cs.querySelector('.custom-background-enable').disabled&&reported.some(v=>v.includes('Fixture enable prerequisite failed'))`);
 await ev(`custom.dispose();stopCustomLocalization()`);
 await check('Cleanup has no unhandled failures',`errors.length===0`);report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error;}
finally{writeFileSync(resolve(out,'action-result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(report,null,2));
