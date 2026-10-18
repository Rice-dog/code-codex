import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {launchFixture,delay} from './browser-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/conversation-mask-v0.4.70');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(root,'packages/explorer-ui/package.json'))('esbuild');
const bundle=await build({stdin:{contents:`import {SurfaceOpacityPlugin,MASK_REGIONS} from './surface-opacity-runtime';window.SurfaceOpacityPlugin=SurfaceOpacityPlugin;window.regions=MASK_REGIONS;`,resolveDir:resolve(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,format:'iife',write:false});
// Native semantic structure and helper class stems observed in the real host.
// Hash suffixes deliberately differ; unrelated surface content must survive.
const html=`<!doctype html><html><head><style>
body{margin:0;background:rgb(40,160,100);--native-surface:rgb(24,24,24)}
html.light body{--native-surface:rgb(255,255,255)}
main{position:relative;width:600px;height:420px;background:transparent}
.top{position:absolute;top:0;width:100%;height:40px;background-image:linear-gradient(var(--native-surface),transparent);z-index:20}
[data-thread-scroll-footer]{position:absolute;bottom:0;width:100%;height:100px}
.fade{position:absolute;top:-32px;height:32px;width:100%;background-image:linear-gradient(to top,var(--native-surface),transparent)}
.surface{position:absolute;inset:0;background:var(--native-surface)}
[data-composer-layout]{position:absolute;bottom:16px;left:200px;width:200px;height:60px;z-index:10;background:var(--native-surface)}
.content-card{position:absolute;top:100px;left:200px;width:200px;height:40px;background:rgb(90,80,70)}
</style></head><body><main data-app-shell-main-surface="default" data-pip-anchor-host="codex-main-thread">
<div class="top _MainContentTopFade_fixture _background_top"></div>
<div class="content-card _background_content">Retained content</div>
<div class="sticky bottom-0" style="position:absolute;bottom:100px;width:100%"><div class="fade pointer-events-none _background_sticky _fade_sticky"></div></div><div data-thread-scroll-footer="true"><div class="fade _background_fixture _fade_fixture"></div><div class="surface _background_fixture _surface_fixture"></div><div data-composer-layout="multiline">Composer</div></div>
</main><div id="plugin"></div><script src="/test.js"></script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`),ev=e=>browser.evaluate(e),result={checks:[],samples:[]};
const check=async(name,e)=>{assert.equal(await ev(e),true,name);result.checks.push(name);};
try{
 for(let i=0;i<100&&!await ev(`!!document.querySelector('#plugin')&&typeof SurfaceOpacityPlugin==='function'`);i++)await delay(50);
 await ev(`window.s=document.querySelector('#plugin').attachShadow({mode:'open'});s.innerHTML='<div data-appearance-plugin="code-codex.surface-opacity"><h4></h4></div><span class="surface-opacity-status"></span><button class="surface-opacity-enable"></button><button class="surface-opacity-settings-trigger"></button><div class="surface-opacity-panel particle-settings-panel" popover="manual"><button class="surface-opacity-close"></button><p class="surface-opacity-message"></p>'+regions.map(r=>'<input id="mask-'+r.key+'" type="range" min="0" max="100" data-mask-region="'+r.key+'"><output for="mask-'+r.key+'"></output><button data-mask-reset="'+r.key+'"></button>').join('')+'<button class="surface-opacity-reset"></button></div>';window.q=x=>s.querySelector(x);document.documentElement.setAttribute('data-code-codex-custom-background','true');window.plugin=new SurfaceOpacityPlugin(s,(zh,en)=>en,()=>{});plugin.start();q('.surface-opacity-enable').click();window.setMask=(key,value)=>{const i=q('[data-mask-region="'+key+'"]');i.value=String(value);i.dispatchEvent(new Event('input',{bubbles:true}));};setMask('composer',70);`);
 await check('Existing nine controls only, with independent composer',`s.querySelectorAll('[data-mask-region]').length===9&&getComputedStyle(document.querySelector('[data-composer-layout]')).backgroundColor==='rgba(30, 31, 35, 0.7)'`);
 for(const theme of ['dark','light']){
  await ev(`document.documentElement.classList.toggle('light',${theme==='light'})`);
  for(const value of [0,35,100]){
   await ev(`setMask('conversation',${value})`);
   await check(`${theme} ${value}% uses one conversation mask and clears all three helpers`, `(()=>{const main=getComputedStyle(document.querySelector('main'));return main.backgroundColor==='${value===100?'rgb(11, 12, 15)':`rgba(11, 12, 15, ${value/100})`}'&&[...document.querySelectorAll('.top,.fade,.surface')].every(e=>{const s=getComputedStyle(e);return s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.backgroundImage==='none'})&&getComputedStyle(document.querySelector('[data-composer-layout]')).backgroundColor==='rgba(30, 31, 35, 0.7)'&&getComputedStyle(document.querySelector('.content-card')).backgroundColor==='rgb(90, 80, 70)'})()`);
   await delay(25);
   const shot=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,`mask-${theme}-${value}.png`),Buffer.from(shot.data,'base64'));result.samples.push({theme,value,file:`mask-${theme}-${value}.png`});
  }
 }
 await ev(`document.querySelectorAll('.fade').forEach(e=>e.replaceWith(e.cloneNode(true)));document.querySelector('.surface').replaceWith(document.querySelector('.surface').cloneNode(true));setMask('conversation',35);`);
 await check('Recreated native footer and independent sticky fade inherit coverage without remounting the plugin',`getComputedStyle(document.querySelector('.surface')).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.querySelector('.fade')).backgroundImage==='none'`);
 await ev(`q('.surface-opacity-enable').click()`);
 await check('Disabling restores native light footer and both gradients',`getComputedStyle(document.querySelector('.surface')).backgroundColor==='rgb(255, 255, 255)'&&getComputedStyle(document.querySelector('.fade')).backgroundImage!=='none'&&getComputedStyle(document.querySelector('.top')).backgroundImage!=='none'`);
 await ev(`q('.surface-opacity-enable').click();document.documentElement.removeAttribute('data-code-codex-custom-background');`);await delay(60);
 await check('Removing background pauses and restores native paint without changing saved values',`!document.documentElement.hasAttribute('data-code-codex-ui-mask-active')&&getComputedStyle(document.querySelector('.surface')).backgroundColor==='rgb(255, 255, 255)'&&JSON.parse(localStorage.getItem('code-codex.surface-opacity.v1')).values.conversation===35`);
 await ev(`document.documentElement.setAttribute('data-code-codex-custom-background','true')`);await delay(60);
 await check('Re-enabling background resumes saved conversation alpha',`document.documentElement.style.getPropertyValue('--code-codex-mask-conversation')==='0.35'&&getComputedStyle(document.querySelector('.surface')).backgroundColor==='rgba(0, 0, 0, 0)'`);
 await ev(`plugin.stop()`);
 await check('Dispose restores native paint and removes active variables',`!document.documentElement.hasAttribute('data-code-codex-ui-mask-active')&&!document.documentElement.style.getPropertyValue('--code-codex-mask-conversation')&&getComputedStyle(document.querySelector('.top')).backgroundImage!=='none'`);
 result.passed=true;
}catch(e){result.passed=false;result.error=String(e);throw e;}finally{writeFileSync(resolve(out,'mask-browser-result.json'),JSON.stringify(result,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(result);
