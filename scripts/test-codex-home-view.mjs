import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const tag = 'code-codex-v' + JSON.parse(readFileSync(join(root, 'packages/explorer-ui/package.json'), 'utf8')).version.replaceAll('.', '-');
const home = `<div id="home" data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_new"><header><span data-app-shell-titlebar-content>Home title</span></header><div class="_MainContentClip_new"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_new"><div data-app-shell-workspace-layout="split"><article data-response-annotation-conversation="thread_home_001">Conversation</article><div data-above-composer-conversation-id="thread_home_001"><textarea>Native draft</textarea></div></div></div></main></div></div></div>`;
const setup = `
const calls=[];const listeners=new Set();let changed=false;
window.__CODE_CODEX_BOOTSTRAP__={token:'test',codexVersion:'26.928.2636.0',supported:true};
window.__codeCodex={subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},request:async({method,params})=>{
 calls.push({method,params});
 if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};
 if(method==='explorer.context')return {threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};
 if(method==='explorer.list')return {entries:params.relativePath==='src'?[{name:'child.ts',relativePath:'src/child.ts',kind:'file'}]:[
  {name:'src',relativePath:'src',kind:'directory'},
  {name:'README.md',relativePath:'README.md',kind:'file'},
  ...Array.from({length:55},(_,i)=>({name:'file'+String(i).padStart(2,'0')+'.ts',relativePath:'file'+String(i).padStart(2,'0')+'.ts',kind:'file'})),
  ...(changed?[{name:'watched.ts',relativePath:'watched.ts',kind:'file'}]:[])]};
 if(method==='explorer.preview')return {kind:'text',text:'# Preview',sizeBytes:9,truncated:false,editable:true,version:'a'.repeat(64),lineEnding:'lf'};
 if(method==='explorer.watch.start')return {watching:true};
 return {};
}};
const errors=[];addEventListener('error',event=>errors.push(event.message));
`;
const checks = `
(async()=>{const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<150&&!fn();i++)await delay(20);if(!fn())throw Error(label);};
const result={};
try{
 await wait(()=>document.querySelector('${tag}')?.dataset.state==='ready','tree ready');await delay(200);
 const e=document.querySelector('${tag}'),s=e.shadowRoot;
 let marker=document.querySelector('[data-app-action-sidebar-thread-id]');
 const homeButton=document.querySelector('[data-sidebar-destination="builtin:home"]');
 let row=document.querySelector('[data-app-shell-workspace-row]');
 let feature=document.querySelector('#feature');
 const count=method=>calls.filter(c=>c.method===method).length;
 const selectFeature=destination=>{
  homeButton.removeAttribute('aria-current');
  document.querySelectorAll('[data-sidebar-destination]').forEach(b=>b.removeAttribute('aria-current'));
  document.querySelector('[data-sidebar-destination="'+destination+'"]')?.setAttribute('aria-current','page');
  const h=document.querySelector('#home');h.dataset.appShellActivePage='false';h.style.display='none';
  feature.dataset.appShellActivePage='true';feature.style.display='contents';marker.removeAttribute('data-app-action-sidebar-thread-active');
 };
 const selectHome=()=>{
  document.querySelectorAll('[data-sidebar-destination]').forEach(b=>b.removeAttribute('aria-current'));
  homeButton.setAttribute('aria-current','page');
  feature.dataset.appShellActivePage='false';feature.style.display='none';
  const h=document.querySelector('#home');h.dataset.appShellActivePage='true';h.style.display='contents';marker.setAttribute('data-app-action-sidebar-thread-active','true');
 };
 s.querySelector('[role=treeitem][data-path="src"] [data-action="toggle"]').click();
 await wait(()=>s.querySelector('[role=treeitem][data-path="src/child.ts"]'),'expanded directory');
 s.querySelector('[role=treeitem][data-path="src/child.ts"]').click();
 await wait(()=>document.querySelector('#home main [data-code-codex-owned]')?.state.tabs[0]?.kind==='text','file preview');
 const preview=document.querySelector('#home main [data-code-codex-owned]');
 s.querySelector('.edit-mode-toggle').click();
 await wait(()=>preview.state.editor,'editor');
 const editor=preview.shadowRoot.querySelector('.code-editor');editor.value='Unsaved Home draft';editor.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(()=>editor.value==='Unsaved Home draft','edit draft');
 const scroller=s.querySelector('.tree-shell');scroller.scrollTop=240;await delay(70);
 const scroll=scroller.scrollTop;
 const baseline={context:count('explorer.context'),list:count('explorer.list'),start:count('explorer.watch.start'),stop:count('explorer.watch.stop'),clear:count('explorer.context.clear')};
 e.openPreviewMarket();await delay(50);
 selectFeature('builtin:library');
 await wait(()=>e.hasAttribute('data-home-view-hidden'),'Home hidden');await delay(100);
 result.hidden=e.parentElement===document.body&&getComputedStyle(e).display==='none'&&e.inert;
 result.previewHidden=preview.parentElement===document.body&&getComputedStyle(preview).display==='none';
 result.nativePage=feature.querySelector('main').getBoundingClientRect().left===document.querySelector('aside').getBoundingClientRect().right&&!feature.querySelector('[inert]');
 result.popoverClosed=!s.querySelector(':popover-open');
 result.retainedAway=e.dataset.state==='ready'&&count('explorer.context')===baseline.context&&count('explorer.watch.stop')===baseline.stop&&count('explorer.context.clear')===baseline.clear;
 // The native watcher must still update the retained model while Home is hidden.
 changed=true;listeners.forEach(listener=>listener({method:'explorer.changed',params:{changes:[{kind:'added',relativePath:'watched.ts',entry:{name:'watched.ts',relativePath:'watched.ts',kind:'file'}}]}}));
 await delay(260);const afterWatch=count('explorer.list');
 selectHome();await wait(()=>!e.hasAttribute('data-home-view-hidden')&&preview.parentElement===document.querySelector('#home main'),'Home restored');await delay(180);
 result.noReconnect=count('explorer.context')===baseline.context&&count('explorer.watch.start')===baseline.start&&count('explorer.watch.stop')===baseline.stop&&count('explorer.context.clear')===baseline.clear&&count('explorer.list')===afterWatch;
 result.scrollRetained=scroller.scrollTop===scroll&&scroll>0;
 result.draftRetained=preview.state.editor?.draft==='Unsaved Home draft';
 result.expansionRetained=Boolean(s.querySelector('[role=treeitem][data-path="src"][aria-expanded="true"]'));
 scroller.scrollTop=scroller.scrollHeight;await delay(50);
 result.watchRetained=Boolean(s.querySelector('[role=treeitem][data-path="watched.ts"]'))&&listeners.size===1;
 // Native Home can be evicted from its Activity cache. Keep our tree and editor alive.
 for(const destination of ['builtin:automations','builtin:images','settings']){
  selectFeature(destination);await wait(()=>e.hasAttribute('data-home-view-hidden'),'hidden on '+destination);
  document.querySelector('#home').remove();
  row.insertAdjacentHTML('beforeend',${JSON.stringify(home)});
  selectHome();await wait(()=>preview.parentElement===document.querySelector('#home main')&&!e.hasAttribute('data-home-view-hidden'),'remount on '+destination);
 }
 result.cacheEvictionRetained=preview.state.editor?.draft==='Unsaved Home draft'&&count('explorer.context')===baseline.context&&count('explorer.watch.start')===baseline.start;
 // Settings replaces the whole native workspace before observers run and has
 // no sidebar trigger. Disposal must wait until that React commit is visible.
 selectFeature('settings');
 homeButton.setAttribute('aria-current','page'); // Selection can lag the row replacement.
 const settingsRow=document.createElement('div');settingsRow.dataset.appShellWorkspaceRow='true';
 settingsRow.innerHTML='<aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="false" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_home_001">Project</button></div></aside><div id="feature" data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_new"><div class="_MainContentClip_new"><main data-app-shell-main-surface="default"><div data-app-shell-focus-area="main">Native settings</div></main></div></div></div>';
 row.replaceWith(settingsRow);row=settingsRow;feature=row.querySelector('#feature');marker=row.querySelector('[data-app-action-sidebar-thread-id]');
 document.querySelector('[data-app-shell-sidebar-trigger]').remove();
 await delay(30);homeButton.removeAttribute('aria-current');
 await wait(()=>e.isConnected&&e.hasAttribute('data-home-view-hidden')&&preview.isConnected,'retain after native row replacement');
 const trigger=document.createElement('button');trigger.hidden=true;trigger.dataset.appShellSidebarTrigger='';document.body.append(trigger);
 row.insertAdjacentHTML('beforeend',${JSON.stringify(home)});selectHome();
 await wait(()=>preview.parentElement===document.querySelector('#home main')&&!e.hasAttribute('data-home-view-hidden'),'restore replaced workspace');await delay(120);
 result.nativeRowReplacementRetained=preview.state.editor?.draft==='Unsaved Home draft'&&e.dataset.state==='ready'&&count('explorer.context')===baseline.context&&count('explorer.watch.stop')===baseline.stop&&count('explorer.watch.start')===baseline.start;
 result.inlineRestored=e.dataset.placement==='inline'&&e.getBoundingClientRect().left>=document.querySelector('aside').getBoundingClientRect().right&&document.querySelector('#home main').getBoundingClientRect().left>=e.getBoundingClientRect().right;
 // Every Appearance toggle, including future cards, uses the existing active style.
 e.openPreviewMarket();await delay(70);
 const buttons=[...s.querySelectorAll('[data-appearance-plugin] .preview-extension-action')];
 const future=document.createElement('button');future.className='preview-extension-action';future.setAttribute('aria-pressed','false');s.querySelector('.preview-extension-actions').append(future);buttons.push(future);
 const saved=buttons.map(b=>[b.getAttribute('data-enabled'),b.getAttribute('aria-pressed')]);
 const appearance=buttons.map(b=>b===future?'future':b.closest('[data-appearance-plugin]').dataset.appearancePlugin);
 const style=b=>{const c=getComputedStyle(b);return [c.backgroundColor,c.color,c.borderTopColor];};
 buttons.forEach(b=>{b.removeAttribute('data-enabled');b.setAttribute('aria-pressed','false');});await delay(220);
 const disabled=buttons.map(style);
 buttons.forEach(b=>b.setAttribute('aria-pressed','true'));await delay(220);
 const enabled=buttons.map(style);
 const reference=s.querySelector('.git-history-open');reference.dataset.enabled='true';await delay(220);
 result.buttonStyles=appearance.map((id,i)=>({id,changed:JSON.stringify(disabled[i])!==JSON.stringify(enabled[i]),shared:JSON.stringify(enabled[i])===JSON.stringify(style(reference))}));
 document.documentElement.dataset.theme='light';await delay(120);
 buttons.forEach(b=>b.setAttribute('aria-pressed','false'));await delay(220);const lightDisabled=buttons.map(style);
 buttons.forEach(b=>b.setAttribute('aria-pressed','true'));await delay(220);const lightEnabled=buttons.map(style);
 result.lightButtonStyles=appearance.map((id,i)=>({id,changed:JSON.stringify(lightDisabled[i])!==JSON.stringify(lightEnabled[i]),shared:JSON.stringify(lightEnabled[i])===JSON.stringify(style(reference))}));
 document.documentElement.dataset.theme='dark';
 buttons.forEach((b,i)=>{for(const [attribute,value] of [['data-enabled',saved[i][0]],['aria-pressed',saved[i][1]]])value===null?b.removeAttribute(attribute):b.setAttribute(attribute,value);});future.remove();reference.dataset.enabled='false';
 // A genuine project change still reconnects (navigation alone never does).
 preview.dispatchEvent(new CustomEvent('cle-main-preview-draft',{detail:{path:'src/child.ts',text:'# Preview'}}));
 marker.dataset.appActionSidebarThreadId='local:thread_home_002';
 document.querySelector('[data-above-composer-conversation-id]').dataset.aboveComposerConversationId='thread_home_002';
 document.querySelector('[data-response-annotation-conversation]').dataset.responseAnnotationConversation='thread_home_002';
 await wait(()=>count('explorer.context')===baseline.context+1&&e.dataset.state==='ready','real project switch');
 result.realProjectSwitch=count('explorer.watch.stop')===baseline.stop+1&&count('explorer.watch.start')===baseline.start+1;
 result.errors=errors;result.calls=calls;
}catch(error){result.error=String(error);result.calls=calls;result.errors=errors;result.debug=[...document.querySelectorAll('${tag},[data-home-suspended],[data-sidebar-destination],[data-code-codex-owned]')].map(x=>({tag:x.tagName,attrs:[...x.attributes].map(a=>[a.name,a.value]),parent:x.parentElement?.tagName}));}
document.documentElement.dataset.test=JSON.stringify(result);
})();`;
const html = `<!doctype html><html data-theme="dark"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{font:13px 'Segoe UI';color:#ddd;background:#181818}
[data-app-shell-workspace-row]{display:flex;width:100%;height:100%}aside{width:200px;flex:none}.sidebar-navigation{background:#181818}
._Workspace_new{display:contents}._MainContentClip_new{display:flex;flex:1;min-width:0}main{position:relative;display:flex;flex-direction:column;flex:1;min-width:0}
header{position:fixed;top:0;left:200px;right:0;height:52px;pointer-events:none}._WorkspaceContent_new{flex:1;display:flex;min-height:0;padding-top:52px}
[data-app-shell-workspace-layout]{flex:1;display:flex;flex-direction:column}article{flex:1}textarea{height:90px;width:80%}
</style></head><body><nav data-app-navigation-rail="true">${['home','automations','library','images'].map(id=>`<button data-sidebar-destination="builtin:${id}" ${id==='home'?'aria-current="page"':''}>${{home:'首页',automations:'任务',library:'资料库',images:'图像'}[id]}</button>`).join('')}</nav><button hidden data-app-shell-sidebar-trigger></button>
<div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_home_001">Project</button></div></aside>${home}<div id="feature" data-app-shell-active-page="false" style="display:none"><div class="_Workspace_new"><header><span data-app-shell-titlebar-content>Native feature</span></header><div class="_MainContentClip_new"><main data-app-shell-main-surface="default"><button>Native page control</button></main></div></div></div></div>
<script>${setup}</script><script src="../packages/explorer-ui/dist/explorer.js"></script><script>${checks}</script></body></html>`;
mkdirSync(join(root, 'artifacts'), {recursive:true});
const fixture = join(root, 'artifacts/home-view.html');
writeFileSync(fixture, html);
// Real time matters here: virtual-time --dump-dom can skip animation frames
// used by the production remount observer when both custom elements are hidden.
const profile=join(root,'artifacts','home-test-chrome-'+Date.now());
const child=spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless=new','--no-sandbox','--disable-gpu','--allow-file-access-from-files','--window-size=1400,900',
 '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const browserUrl=await new Promise((resolve,reject)=>{
 let stderr='';const timeout=setTimeout(()=>reject(Error('Chrome debugging endpoint timeout')),10000);
 child.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
 child.once('error',reject);
});
const ws=new WebSocket(browserUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let sequence=0;const pending=new Map();
ws.addEventListener('message',event=>{const message=JSON.parse(event.data);const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}});
const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
let result;
try{
 const targets=await command('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='page');
 const {sessionId}=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
 await command('Runtime.enable',{},sessionId);
 await command('Page.navigate',{url:pathToFileURL(fixture).href},sessionId);
 for(let i=0;i<120;i++){
  await new Promise(r=>setTimeout(r,100));
  const evaluated=await command('Runtime.evaluate',{expression:'document.documentElement.dataset.test',returnByValue:true},sessionId);
  if(evaluated.result?.value){result=JSON.parse(evaluated.result.value);break;}
 }
 assert.ok(result,'Home fixture completed');
}finally{await command('Browser.close').catch(()=>{});ws.close();}
writeFileSync(join(root, 'artifacts/home-view-result.json'), JSON.stringify(result, null, 2));
console.log({...result,calls:result.calls.length});
assert.equal(result.error, undefined);
for(const key of ['hidden','previewHidden','nativePage','popoverClosed','retainedAway','noReconnect','scrollRetained','draftRetained','expansionRetained','watchRetained','cacheEvictionRetained','nativeRowReplacementRetained','inlineRestored','realProjectSwitch']) assert.equal(result[key],true,key);
assert.ok(result.buttonStyles.length>=12);
for(const button of [...result.buttonStyles,...result.lightButtonStyles]){assert.equal(button.changed,true,button.id+': changes color');assert.equal(button.shared,true,button.id+': matches existing active style');}
assert.deepEqual(result.errors, []);
