import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const out=resolve('artifacts/native-composer-backdrop');mkdirSync(out,{recursive:true});
const compiled=await build({entryPoints:['packages/explorer-ui/src/native-composer-backdrop.ts'],bundle:true,format:'iife',globalName:'backdrop',write:false});
writeFileSync(resolve(out,'production.js'),compiled.outputFiles[0].text);
writeFileSync(resolve(out,'fixture.html'),`<!doctype html><style>
body{margin:0;background:seagreen;color:white}main{height:400px;position:relative;background:rgba(11,12,15,var(--alpha,0))}.thread-scroll-container{height:100%}
.footer-random{position:absolute;bottom:0;width:100%;height:120px}.footer-random::before{content:'';position:absolute;inset:0;background-image:linear-gradient(transparent,var(--native, rgb(24,24,24)) calc(100% - 22px))}
.footer-random::after{content:'';position:absolute;bottom:0;height:22px;width:100%;background:var(--native, rgb(24,24,24))}
[data-thread-scroll-footer]{position:relative;height:120px}input{position:absolute;bottom:15px;left:25%;height:50px;width:50%;background:rgba(30,31,35,.7);color:white}
.card::before{content:'';background:rgb(80,60,40)}.outside::before{content:'';background-image:linear-gradient(red,blue)}
</style><main data-app-shell-main-surface="default"><div class="thread-scroll-container"><div class="card">Native content</div><div class="footer-random pointer-events-none"><div data-thread-scroll-footer="true"><input value="Preserved draft"></div></div></div></main><div class="outside pointer-events-none"><div data-thread-scroll-footer="true" style="height:30px">Outside main</div></div><script src="production.js"></script>`);
const b=await launchFixture(new URL('file:///'+resolve(out,'fixture.html').replaceAll('\\','/')).href),checks=[];
const read=()=>b.evaluate('backdrop.inspectComposerBackdrop(document)');
try{
 assert.equal((await read()).status,'manual');
 await b.evaluate(`document.documentElement.setAttribute('data-code-codex-ui-mask-active','true')`);
 assert.equal((await read()).status,'issue');checks.push('Original footer pseudo-gradient is detected despite transparent elements and zero mask');
 await b.evaluate(`window.style=document.createElement('style');style.textContent=backdrop.NATIVE_COMPOSER_BACKDROP_CSS;document.head.append(style)`);
 for(const theme of ['dark','light'])for(const alpha of [0,.35,1])for(const folded of [false,true,false]){
  await b.evaluate(`(()=>{document.body.style.setProperty('--native','${theme==='dark'?'rgb(24,24,24)':'rgb(255,255,255)'}');document.body.style.setProperty('--alpha','${alpha}');document.querySelector('main').style.width='${folded?800:540}px';const f=document.querySelector('.footer-random');f.replaceWith(f.cloneNode(true))})()`);
  assert.equal((await read()).status,'passed');
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('input')).backgroundColor`),'rgba(30, 31, 35, 0.7)');
  assert.equal(await b.evaluate(`document.querySelector('input').value`),'Preserved draft');
  checks.push(`${theme}, alpha${alpha}, folded${folded}: remounted decoration cleared; independent composer/draft preserved`);
 }
 assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.card'),'::before').backgroundColor`),'rgb(80, 60, 40)');
 assert.notEqual(await b.evaluate(`getComputedStyle(document.querySelector('.outside'),'::before').backgroundImage`),'none');checks.push('Unrelated native content and out-of-scope footer remain native');
 const shot=await b.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'transparent-footer.png'),Buffer.from(shot.data,'base64'));
 await b.evaluate(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);
 assert.equal((await read()).status,'manual');assert.notEqual(await b.evaluate(`getComputedStyle(document.querySelector('.footer-random'),'::before').backgroundImage`),'none');checks.push('Inactive opacity restores native footer without preference changes');
 await b.evaluate(`document.documentElement.setAttribute('data-code-codex-ui-mask-active','true');style.remove()`);assert.equal((await read()).status,'issue');checks.push('Removing owned stylesheet restores original decoration');
 await b.evaluate(`document.head.append(style);document.querySelector('main').setAttribute('data-app-shell-active-page','false')`);assert.equal((await read()).status,'manual');checks.push('Cached inactive pages are not accepted as live appearance evidence');
 await b.evaluate(`document.querySelector('main').removeAttribute('data-app-shell-active-page');document.querySelector('.footer-random').replaceWith(document.querySelector('[data-thread-scroll-footer]'));document.querySelector('main').style.background='rgb(11,12,15)'`);
 assert.equal((await read()).status,'passed');checks.push('Legacy direct footer does not mistake conversation mask for redundant paint');
 await b.evaluate(`document.querySelector('[data-thread-scroll-footer]').style.background='black'`);assert.equal((await read()).status,'issue');checks.push('Element background regression is detected as well as generated pseudo paint');
 const result={scope:'Production CSS and read-only inspector in isolated Chromium; simulated fold/remount, no real update/uninstall',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
