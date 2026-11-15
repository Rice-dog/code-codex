import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const out=resolve('artifacts/collapsed-tree-opacity');mkdirSync(out,{recursive:true});
const compiled=await build({stdin:{contents:`export {style0} from './components/styles/tokens-and-host';export {style6} from './components/styles/git-history';export {SURFACE_OPACITY_TREE_CSS} from './surface-opacity-runtime';export {inspectCollapsedTreePaint} from './host-update-probes';`,resolveDir:resolve('packages/explorer-ui/src')},bundle:true,format:'iife',globalName:'rail',write:false});
writeFileSync(resolve(out,'production.js'),compiled.outputFiles[0].text);
writeFileSync(resolve(out,'fixture.html'),`<!doctype html><style>body{background:teal}.outside{background:black}</style><div class="outside">Outside</div><script src="production.js"></script><script>
customElements.define('test-tree',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style></style><div class="frame">Tree</div><button class="collapsed-tab" aria-label="Open Code-Codex"><svg width="16" height="16"></svg></button>';}});
window.host=document.createElement('test-tree');host.dataset.codeCodexOwned='true';host.dataset.collapsed='true';host.style.height='500px';document.body.append(host);
window.sheet=host.shadowRoot.querySelector('style');sheet.textContent=rail.style0+rail.style6+rail.SURFACE_OPACITY_TREE_CSS;
</script>`);
const b=await launchFixture(new URL('file:///'+resolve(out,'fixture.html').replaceAll('\\','/')).href),checks=[];
try{
 const probe=()=>b.evaluate('rail.inspectCollapsedTreePaint(document)');
 const paint=()=>b.evaluate(`(()=>{const s=getComputedStyle(host.shadowRoot.querySelector('.collapsed-tab'));return {color:s.backgroundColor,image:s.backgroundImage,width:host.getBoundingClientRect().width}})()`);
 assert.equal((await probe()).status,'manual');
 await b.evaluate(`document.documentElement.setAttribute('data-code-codex-particle-image-background','');document.documentElement.setAttribute('data-code-codex-ui-mask-active','');document.documentElement.style.setProperty('--code-codex-mask-tree','0');window.fixed=sheet.textContent;sheet.textContent=fixed.replace(/:host-context\\(html\\[data-code-codex-ui-mask-active\\]\\[data-code-codex-ui-mask-active\\]\\) \\.collapsed-tab\\s*\\{[^}]+\\}/,'')`);
 assert.equal((await probe()).status,'issue');assert.match((await paint()).color,/0\.58/);checks.push('Original fixed 58% rail detected with tree alpha zero');
 await b.evaluate('sheet.textContent=fixed');
 for(const theme of ['light','dark'])for(const alpha of [0,.5,1]){
  await b.evaluate(`host.dataset.theme='${theme}';document.documentElement.style.setProperty('--code-codex-mask-tree','${alpha}');document.documentElement.style.setProperty('--code-codex-mask-conversation','${1-alpha}');host.dataset.collapsed='false';host.dataset.collapsed='true';host.shadowRoot.querySelector('.collapsed-tab').replaceWith(host.shadowRoot.querySelector('.collapsed-tab').cloneNode(true))`);
  assert.equal((await probe()).status,'passed');assert.equal((await paint()).width,40);
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.outside')).backgroundColor`),'rgb(0, 0, 0)');
  assert.equal(await b.evaluate(`host.shadowRoot.querySelector('.collapsed-tab svg').getAttribute('width')`),'16');
  checks.push(`${theme} alpha${alpha}: fold/reopen/remount, tree value independent of conversation; geometry/icon/outside preserved`);
 }
 await b.evaluate(`document.documentElement.style.setProperty('--code-codex-mask-tree','0');const x=host.shadowRoot.querySelector('.collapsed-tab');x.style.setProperty('background','black','important')`);assert.equal((await probe()).status,'issue');
 await b.evaluate(`host.shadowRoot.querySelector('.collapsed-tab').style.setProperty('background','linear-gradient(transparent,black)','important')`);assert.equal((await probe()).status,'issue');checks.push('Opaque and gradient regressions detected');
 await b.evaluate(`host.shadowRoot.querySelector('.collapsed-tab').removeAttribute('style');host.dataset.collapsed='false'`);assert.equal((await probe()).status,'manual');
 await b.evaluate(`host.dataset.collapsed='true';document.documentElement.removeAttribute('data-code-codex-ui-mask-active')`);assert.equal((await probe()).status,'manual');assert.match((await paint()).color,/0\.58/);
 await b.evaluate(`document.documentElement.removeAttribute('data-code-codex-particle-image-background')`);assert.equal((await paint()).color,'rgb(36, 36, 36)');checks.push('Expanded/inactive manual; background-only and native paint restored');
 const result={scope:'Isolated Chromium production shared shadow CSS and on-demand rail inspector',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
