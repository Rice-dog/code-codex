import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const source=readFileSync('packages/explorer-ui/src/inject.ts','utf8');
const adapter=readFileSync('packages/explorer-ui/src/adapters/codex-26.715.ts','utf8');
const selector=name=>adapter.match(new RegExp(`const ${name} = '([^']+)'`))[1];
const owned='[data-code-codex-owned="true"]',main='main:is(.main-surface, [data-app-shell-main-surface="default"])';
const css=source.match(/const SHELL_LAYOUT_CSS = `([\s\S]*?)`;/)[1]
 .replaceAll('${NATIVE_SIDE_PANEL_OPACITY_CSS}','') // Independently exercised by test-native-side-panel-opacity.mjs.
 .replaceAll('${NATIVE_COMPOSER_BACKDROP_CSS}','') // Independently exercised by test-native-composer-backdrop.mjs.
 .replaceAll('${NATIVE_WORKSPACE_BACKGROUND_CSS}','') // Exercised by test-host-update-probes.mjs.
 .replaceAll('${SPLIT_MAIN_VIEW_SELECTOR}',selector('SPLIT_MAIN_VIEW_SELECTOR'))
 .replaceAll('${SPLIT_MAIN_FRAME_SELECTOR}',selector('SPLIT_MAIN_FRAME_SELECTOR'))
 .replaceAll('${NATIVE_FIXED_TITLEBAR_SELECTOR}',selector('NATIVE_FIXED_TITLEBAR_SELECTOR'))
 .replaceAll('${CURRENT_LAYOUT_EXPLORER_SELECTOR}',owned+'[data-placement="inline"][data-mount-strategy="known:workspace-row"]')
 .replaceAll('${OWNED_EXPLORER_SELECTOR}',owned).replaceAll('${MAIN_SURFACE_SELECTOR}',main).replaceAll('${CURRENT_LAYOUT_HEADER_LEFT_PROPERTY}','--code-codex-current-layout-header-left');
assert(!css.includes('${'));
const out=resolve('artifacts/native-split-layout');mkdirSync(out,{recursive:true});
const html=`<!doctype html><style>body{margin:0}.row{display:flex;width:1100px}.tree{flex:none;width:287px}.workspace{flex:1;min-width:0}main{display:flex}.viewport{display:flex;flex-direction:column;overflow:hidden;flex:1;min-width:0}.MainContentFrame-native{min-width:100%;flex:1;align-self:flex-end;container-type:inline-size}p{margin:0 26px}.composer{margin:0 26px;width:calc(100% - 52px)}.side{width:480px;flex:none}</style>
<div class="row"><section class="tree" data-code-codex-owned="true" data-placement="inline" data-mount-strategy="known:workspace-row"></section><div class="workspace"><main data-app-shell-main-surface="default"><div class="viewport" data-app-shell-workspace-layout="split" data-app-shell-right-panel-full-width="false"><div class="MainContentFrame-native" style="width:620px"><p>First characters of the native conversation</p><div class="composer"><input style="box-sizing:border-box;width:100%"></div></div></div><div class="side">Side chat</div></main></div></div>`;
writeFileSync(resolve(out,'fixture.html'),html);
const b=await launchFixture(new URL('file:///'+resolve(out,'fixture.html').replaceAll('\\','/')).href),checks=[];
const measure=()=>b.evaluate(`(()=>{const v=document.querySelector('.viewport').getBoundingClientRect(),f=document.querySelector('.MainContentFrame-native').getBoundingClientRect(),p=document.querySelector('p').getBoundingClientRect(),c=document.querySelector('.composer').getBoundingClientRect();return {v:{left:v.left,right:v.right,width:v.width},f:{left:f.left,right:f.right,width:f.width},p:p.left,c:{left:c.left,right:c.right}}})()`);
try{
 const broken=await measure();assert(broken.f.right>broken.v.right+10||broken.f.left<broken.v.left-10);checks.push('Original native stale width reproduces clipping');
 await b.evaluate(`const s=document.createElement('style');s.id='production';s.textContent=${JSON.stringify(css)};document.head.append(s)`);
 for(const dpr of [1,1.5,2]){
  await b.command('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:dpr,mobile:false});
  for(const tree of [287,40])for(const side of [360,480,610]){
   await b.evaluate(`document.querySelector('.tree').style.width='${tree}px';document.querySelector('.side').style.width='${side}px'`);
   const m=await measure();assert(Math.abs(m.f.left-m.v.left)<=1);assert(m.f.right<=m.v.right+1);assert(m.p>=m.v.left);assert(m.c.left>=m.v.left&&m.c.right<=m.v.right);checks.push(`Native main frame/text/composer fit tree=${tree}, side=${side}, DPR=${dpr}`);
  }
 }
 for(const scenario of ['single','full','no-tree','dispose']){
  await b.evaluate(`document.querySelector('.tree').setAttribute('data-placement','inline');document.querySelector('.viewport').setAttribute('data-app-shell-workspace-layout','split');document.querySelector('.viewport').setAttribute('data-app-shell-right-panel-full-width','false');document.querySelector('.side').style.width='480px'`);
  await b.evaluate(scenario==='single'?`document.querySelector('.viewport').setAttribute('data-app-shell-workspace-layout','single')`:scenario==='full'?`document.querySelector('.viewport').setAttribute('data-app-shell-right-panel-full-width','true')`:scenario==='no-tree'?`document.querySelector('.tree').setAttribute('data-placement','overlay')`:`document.querySelector('#production').remove()`);
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.MainContentFrame-native')).maxWidth`),'none');checks.push(`Native sizing retained/restored: ${scenario}`);
 }
 await b.evaluate(`document.querySelector('.tree').setAttribute('data-placement','inline');
  const updatedFrame=document.querySelector('.MainContentFrame-native');
  updatedFrame.style.cssText+=';min-width:100%;flex:1;align-self:flex-end';
  updatedFrame.querySelector('.composer').setAttribute('data-app-shell-focus-area','main');
  updatedFrame.removeAttribute('class');
  const replacement=document.createElement('style');replacement.textContent=${JSON.stringify(css)};document.head.append(replacement);`);
 assert(await b.evaluate(`(()=>{const view=document.querySelector('.viewport'),box=view.getBoundingClientRect(),frame=view.firstElementChild.getBoundingClientRect();return frame.left>=box.left-1&&frame.right<=box.right+1;})()`));
 checks.push('Semantic main focus-area keeps the new class-free native frame inside the split');
 const result={scope:'Production injected CSS in Chromium fixtures; live host verified separately',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();}
