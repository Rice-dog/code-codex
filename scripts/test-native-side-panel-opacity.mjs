import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const out=resolve('artifacts/native-side-panel-opacity');mkdirSync(out,{recursive:true});
const compiled=await build({entryPoints:['packages/explorer-ui/src/native-side-panel-opacity.ts'],bundle:true,format:'iife',globalName:'panel',write:false});
writeFileSync(resolve(out,'production.js'),compiled.outputFiles[0].text);
writeFileSync(resolve(out,'fixture.html'),`<!doctype html><style>
body{background:teal}aside{width:400px;height:240px;background:rgba(16,17,20,.66)}[data-app-shell-compact-page-gutter]{height:100%;background:var(--app-shell-panel-background,var(--native,#181818))}[data-new-tab-scroll-root]{height:100%;background:var(--native,#181818)}[data-summary-panel-variant]{width:300px;height:200px;background:var(--native,#2d2d2d)}button,.media{background:rgb(80,60,40)}.outside{background:black}
</style><aside data-app-shell-focus-area="right-panel"><div data-app-shell-compact-page-gutter="false"><div data-new-tab-scroll-root="true"><button>Native action</button><div class="media">External pixels</div></div></div></aside><div data-summary-panel-variant="summary" data-summary-panel-density="default">PR list</div><div class="outside" data-app-shell-compact-page-gutter="false">Outside</div><script src="production.js"></script>`);
const b=await launchFixture(new URL('file:///'+resolve(out,'fixture.html').replaceAll('\\','/')).href),checks=[];
try{
 const probe=()=>b.evaluate('panel.inspectSidePanelOpacity(document)');
 assert.equal((await probe()).status,'manual');
 await b.evaluate(`document.documentElement.setAttribute('data-code-codex-ui-mask-active','');document.documentElement.style.setProperty('--code-codex-mask-utility','0')`);
 assert.equal((await probe()).status,'issue');checks.push('Original opaque summary and inner panel detected at zero');
 await b.evaluate(`window.fix=document.createElement('style');fix.textContent=panel.NATIVE_SIDE_PANEL_OPACITY_CSS;document.head.append(fix)`);
 for(const theme of ['#181818','#ffffff'])for(const alpha of [0,.42,1]){
  await b.evaluate(`document.body.style.setProperty('--native','${theme}');document.documentElement.style.setProperty('--code-codex-mask-utility','${alpha}');(()=>{const a=document.querySelector('aside');a.replaceWith(a.cloneNode(true))})()`);
  assert.equal((await probe()).status,'passed');
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('button')).backgroundColor`),'rgb(80, 60, 40)');
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.media')).backgroundColor`),'rgb(80, 60, 40)');
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.outside')).backgroundColor`),'rgb(0, 0, 0)');
  checks.push(`Theme ${theme} alpha${alpha}: remount follows utility once; controls/media/outside preserved`);
 }
 await b.evaluate(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);
 assert.equal((await probe()).status,'manual');assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-summary-panel-variant]')).backgroundColor`),'rgb(255, 255, 255)');checks.push('Deactivation restores native panel');
 await b.evaluate(`document.documentElement.setAttribute('data-code-codex-ui-mask-active','');document.querySelector('[data-new-tab-scroll-root]').style.setProperty('background','black','important')`);
 assert.equal((await probe()).status,'issue');checks.push('Remounted inner opaque regression detected');
 const result={scope:'Isolated Chromium production CSS/inspector; no external webview or provider invocation',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
