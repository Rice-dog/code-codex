import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {installedBackgroundFixture} from './background-package-fixture.mjs';
import {openBrowser,root} from './fixtures/browser-fixture.mjs';

const version=JSON.parse(readFileSync(join(root,'packages/explorer-ui/package.json'),'utf8')).version;
const directory=join(root,'artifacts','appearance-adapter-'+Date.now());mkdirSync(directory,{recursive:true});
const report={version,checks:[],limits:['Browser fixture uses controlled official actions; actual Codex integration is a separate delivery check.']};
const seam=installedBackgroundFixture(root,['blinking-squares'])+buildSync({stdin:{contents:`import * as theme from './host/appearance/theme-lease';import * as probe from './host/appearance/theme-probe';import {BlinkingSquaresBackgroundController} from './plugin-host/backgrounds/blinking-squares';import {connectBackgroundPackages} from './background-plugin-runtime';window.fixture={...theme,...probe,BlinkingSquaresBackgroundController,connectBackgroundPackages};`,resolveDir:join(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,write:false,format:'iife',target:'chrome120',define:{__CODE_CODEX_VERSION__:JSON.stringify(version),__CODE_CODEX_PLUGIN_CATALOG__:readFileSync(join(root,'packages/explorer-ui/dist/plugins/catalog.json'),'utf8')}}).outputFiles[0].text;
// Same call signature as the official split module, including optional context.
const dispatcher=`function dispatch(action,{sourceHostId,sourceThreadId}={}){const service=window.fixtureServices.appActions;return service.runInPrimaryWindow({action:action,sourceHostId,sourceThreadId});}`;
const legacy=`export const namespace={appActions:window.fixtureServices.appActions,clientCoordination:{invalidateQueryCache:async()=>{}}};`;
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://fixture'),scenario=url.searchParams.get('case')||'split';
 if(url.pathname==='/seam.js'){res.setHeader('Content-Type','text/javascript');res.end(seam);return;}
 if(url.pathname.endsWith('.js')){
  res.setHeader('Content-Type','text/javascript');
  if(url.pathname.includes('run-app-action-in-primary-window-'))res.end(dispatcher+'export{dispatch as differentName,dispatch as alias};');
  else if(scenario==='legacy')res.end(legacy);
  else if(scenario==='initial-dispatch')res.end(dispatcher+'export{dispatch as renamed};');
  else if(scenario==='ambiguous')res.end(legacy+'export const other={...namespace};');
  else res.end('export const unrelated=()=>{};');
  return;
 }
 res.setHeader('Content-Type','text/html');
 const split=['split','no-initial','two-modules','reject-set','invalid-response','late'].includes(scenario);
 const link=name=>`<link rel="modulepreload" href="/${name}.js">`;
 res.end(`<!doctype html><html data-theme="light"><head>${scenario==='no-initial'?'':`<link rel="modulepreload" href="/app-initial-fixture.js?case=${scenario}">`}${split&&scenario!=='late'?link('run-app-action-in-primary-window-fixture'):''}${scenario==='two-modules'?link('run-app-action-in-primary-window-second'):''}<style>html,body{margin:0;width:100%;height:100%}</style></head><body><script>
 window.mode='light';window.calls=[];window.fixtureServices={appActions:{runInPrimaryWindow:async({action})=>{calls.push(action);if(action.type==='app.appearance.set_mode'){if(${JSON.stringify(scenario)}==='reject-set')throw Error('Official setting rejected');mode=action.mode;document.documentElement.dataset.theme=mode==='system'?'light':mode;}return {mode:${JSON.stringify(scenario)}==='invalid-response'?'unsupported':mode};}}};
 </script><script src="/seam.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const check=(name,condition)=>{report.checks.push({name,passed:!!condition});assert.ok(condition,name);};
try{
 browser=await openBrowser('<title>Appearance adapter</title>');const {cmd,ev,wait}=browser;
 const page=async scenario=>{await cmd('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?case=${scenario}`});await wait('!!window.fixture','Appearance fixture ready');};
 // The old detector cannot see the split module; its only app-initial exports are unrelated.
 for(const scenario of ['legacy','initial-dispatch','split','no-initial']){
  await page(scenario);
  check(scenario+' reads the official light preference',await ev(`fixture.readCodexAppearanceTheme().then(x=>x==='light')`));
  check(scenario+' confirms set and subsequent read',await ev(`(async()=>{await fixture.writeCodexAppearanceTheme('dark');return (await fixture.readCodexAppearanceTheme())==='dark'&&document.documentElement.dataset.theme==='dark';})()`));
 }
 for(const scenario of ['ambiguous','two-modules','missing']){
  await page(scenario);const r=await ev(`fixture.readCodexAppearanceTheme().then(()=>({ok:true}),e=>({error:e.message,calls:calls.length}))`);
  check(scenario+' rejects without executing an action',!!r.error&&r.calls===0);
 }
 await page('split');
 check('duplicate exported function identity is accepted once',await ev(`fixture.discoverCodexAppearanceAdapter().then(x=>!!x.runAction)`));
 check('foreign, queried and unrelated module URLs are excluded',await ev(`(()=>{for(const href of ['https://untrusted.invalid/run-app-action-in-primary-window-other.js','/run-app-action-in-primary-window-queried.js?x=1','/similar-action.js']){const x=document.createElement('link');x.rel='modulepreload';x.href=href;document.head.append(x);}return fixture.findCodexAppearanceActionModules().length===1;})()`));
 check('multiple dispatch functions reject before execution',await ev(`(()=>{function a(action){return fixtureServices.appActions.runInPrimaryWindow({action:action});}function b(action){return fixtureServices.appActions.runInPrimaryWindow({action:action});}try{fixture.selectCodexAppearanceAdapter({a,b});return false;}catch(e){return e.message.includes('CC-APPEARANCE-ADAPTER-002');}})()`));
 await page('late');
 check('missing adapter is not permanently cached',await ev(`(async()=>{try{await fixture.readCodexAppearanceTheme();return false;}catch{}const x=document.createElement('link');x.rel='modulepreload';x.href='/run-app-action-in-primary-window-late.js';document.head.append(x);return (await fixture.readCodexAppearanceTheme())==='light';})()`));
 for(const scenario of ['invalid-response','reject-set']){
  await page(scenario);const expression=scenario==='invalid-response'?`fixture.readCodexAppearanceTheme()`:`fixture.writeCodexAppearanceTheme('dark')`;
  check(scenario+' propagates official failure',await ev(`${expression}.then(()=>false,e=>!!e.message)`));
 }
 // Real controller and pinned renderer prove direct activation, lease restore,
 // repeated use and failure cleanup, not just a successful adapter probe.
 for(const mode of ['light','system','dark']){
  await page('split');
  const result=await ev(`(async()=>{window.mode=${JSON.stringify(mode)};document.documentElement.dataset.theme=mode==='system'?'light':mode;fixture.connectBackgroundPackages(async()=>({loaded:true}));const controller=new fixture.BlinkingSquaresBackgroundController();await controller.enable();const enabled=controller.enabled&&!controller.pending&&fixture.codexDarkThemeApplied()&&!!document.querySelector('[data-code-codex-blinking-squares-layer]');await controller.disable();const restored=window.mode===${JSON.stringify(mode)}&&!controller.enabled&&!fixture.readParticleThemeLease();controller.dispose();return{enabled,restored};})()`);
  check(mode+' one Enable automatically applies dark',result.enabled);check(mode+' Disable restores original preference',result.restored);
 }
 await page('missing');
 check('failed Enable leaves no theme lease or background and no restart advice',await ev(`(async()=>{fixture.connectBackgroundPackages(async()=>({loaded:true}));const controller=new fixture.BlinkingSquaresBackgroundController();let error;try{await controller.enable();}catch(e){error=e;}const ok=!!error&&!/Restart Codex/.test(error.message)&&error.cause?.message.includes('CC-APPEARANCE-ADAPTER-001')&&!controller.enabled&&!controller.pending&&!fixture.readParticleThemeLease()&&!document.querySelector('[data-code-codex-blinking-squares-layer]');controller.dispose();return ok;})()`));
 console.log('Appearance adapter: '+report.checks.length+' checks passed');
}catch(error){report.error=String(error);throw error;}finally{writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2));await browser?.close();server.close();}
