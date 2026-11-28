import {builtExplorerTag} from './ui-build-identity.mjs';
import { installedBackgroundFixture } from './background-package-fixture.mjs';
import {writeFileSync, readFileSync, mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
import assert from 'node:assert/strict';
import {join, resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const tag=builtExplorerTag(root);
const modernContext=!process.argv.includes('--legacy-context');
const page=(active,id,title)=>`<div data-app-shell-active-page="${active}" style="display:${active?'contents':'none'}"><div class="_Workspace_new" data-app-shell-page-surface="true"><header data-app-shell-titlebar="true"><span data-app-shell-titlebar-content>${title}</span></header><div class="_MainContentClip_new"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_new"><div data-app-shell-workspace-layout="split"><div data-app-shell-main-content-top-fade="visible"><div class="_MainContentTopFade_new"></div></div><article data-response-annotation-conversation="${id}">Conversation</article><div data-thread-scroll-footer="true"><div class="pointer-events-none bg-surface"></div><div data-above-composer-conversation-id="${id}"><textarea>Preserved draft</textarea></div></div></div></div></main></div></div></div>`;
const script=`
const calls=[];let watchFinished=false, activeRoot=1, switchedWithinRoot=false;
const modernContext=${modernContext};
window.__CODE_CODEX_BOOTSTRAP__={token:'test',codexVersion:'26.928.2636.0',supported:true};
window.__codeCodex={request:async({method,params})=>{calls.push(method);
if(method==='explorer.window.transparency.set')return {enabled:params.enabled,background:'transparent'};
if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};
if(method==='explorer.context'){
const root=params.threadId==='thread_other_003'?2:1;
if(params.threadId==='thread_cached_002')switchedWithinRoot=params.reuseWorkspace===true;
if(root!==activeRoot){activeRoot=root;watchFinished=false;}
return {threadId:params.threadId,projectName:root===1?'Fixture':'Other',rootName:root===1?'Fixture':'Other',compatible:true,...(modernContext?{workspaceRevision:root,watching:watchFinished}:{})};
}
if(method==='explorer.context.clear'){watchFinished=false;return {cleared:true};}
if(method==='explorer.watch.stop'){watchFinished=false;return {watching:false};}
if(method==='explorer.list'){
if(params.relativePath==='docs')return {entries:[{name:'guide.md',relativePath:'docs/guide.md',kind:'file'}]};
if(activeRoot===2)return {entries:[{name:'other.ts',relativePath:'other.ts',kind:'file'}]};
return {entries:[{name:'docs',relativePath:'docs',kind:'directory'},{name:'README.md',relativePath:'README.md',kind:'file'},{name:'main.ts',relativePath:'main.ts',kind:'file'}]};}
if(method==='explorer.preview')return {kind:'text',text:params.relativePath==='README.md'?'# Preview':'const value = 1;',sizeBytes:10,truncated:false,editable:true,version:'a'.repeat(64),lineEnding:'lf'};
if(method==='explorer.watch.start'){await new Promise(r=>setTimeout(r,1500));watchFinished=true;return {watching:true};}
return {};}};
window.testErrors=[];addEventListener('error',e=>testErrors.push(e.message));addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));
`;
const checks=`
(async()=>{const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(f)=>{for(let i=0;i<160&&!f();i++)await delay(25);if(!f())throw Error('wait failed');};
try {await wait(()=>document.querySelector('${tag}')?.dataset.state==='ready');
const e=document.querySelector('${tag}'),shadow=e.shadowRoot;
const readyBeforeWatch=!watchFinished;
const main=document.querySelector('[data-app-shell-active-page=true] main');
const rect=x=>x.getBoundingClientRect();
await delay(180);
const positions=rect(e).left>=rect(document.querySelector('aside')).right&&rect(main).left>=rect(e).right;
const row=shadow.querySelector('[data-path="README.md"]');row.click();
await wait(()=>main.querySelector('[data-code-codex-owned]')?.shadowRoot?.querySelectorAll('[role=tab]').length>=2);
const preview=main.querySelector('[data-code-codex-owned]'),ps=preview.shadowRoot;
const label=ps.querySelector('[data-tab-kind=conversation] .tab-label')?.textContent;
document.documentElement.setAttribute('data-code-codex-particle-image-background','');
const maskClear=getComputedStyle(document.querySelector('.sidebar-navigation')).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(main.querySelector('[data-thread-scroll-footer]>.bg-surface')).backgroundColor==='rgba(0, 0, 0, 0)';
const fileTransparent=getComputedStyle(ps.querySelector('.preview-panel')).backgroundColor==='rgba(0, 0, 0, 0)';
ps.querySelector('[data-tab-kind=conversation]').click();await delay(50);
const input=main.querySelector('textarea'),b=rect(input);const hit=document.elementFromPoint(b.x+10,b.y+10);
const clickable=hit===input&&!input.closest('[inert]');
const count=method=>calls.filter(x=>x===method).length;
await wait(()=>watchFinished&&count('explorer.list')>=2);
const rootResynced=count('explorer.list')>=2;
shadow.querySelector('[data-path="docs"] [data-action="toggle"]').click();
await wait(()=>!!shadow.querySelector('[data-path="docs/guide.md"]'));
const docs=shadow.querySelector('[data-path="docs"]');
const before=Object.fromEntries(['explorer.context','explorer.list','explorer.watch.start','explorer.watch.stop'].map(method=>[method,count(method)]));
const pages=document.querySelectorAll('[data-app-shell-active-page]');
const marker=document.querySelector('[data-app-action-sidebar-thread-id]');
const select=(index,id)=>{pages.forEach((p,i)=>{p.dataset.appShellActivePage=String(index===i);p.style.display=index===i?'contents':'none';});marker.dataset.appActionSidebarThreadId='local:'+id;};
const rail=document.querySelector('aside.app-shell-left-panel');
const inlineParent=e.parentElement;
const stableLeft=rect(e).left;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const treeStaysInline=()=>e.parentElement===inlineParent&&e.dataset.placement==='inline'
    &&Math.abs(rect(e).left-stableLeft)<=1&&rect(e).left>=rect(rail).right;
select(1,'thread_cached_002');
await wait(()=>count('explorer.context')>before['explorer.context']&&e.dataset.state==='ready'&&document.querySelector('[data-app-shell-active-page=true] main').getBoundingClientRect().left>=rect(e).right);
let sameProject=false,otherProject=false;
if(modernContext){
await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
sameProject=switchedWithinRoot&&shadow.querySelector('[data-path="docs"]')===docs&&docs.getAttribute('aria-expanded')==='true'
    &&count('explorer.list')===before['explorer.list']&&count('explorer.watch.start')===before['explorer.watch.start']
    &&count('explorer.watch.stop')===before['explorer.watch.stop'];
select(2,'thread_other_003');
await wait(()=>e.dataset.state==='ready'&&!!shadow.querySelector('[data-path="other.ts"]'));
otherProject=!shadow.querySelector('[data-path="docs/guide.md"]')&&count('explorer.watch.stop')===before['explorer.watch.stop'];
}else{
await wait(()=>watchFinished&&count('explorer.list')>=before['explorer.list']+2);
sameProject=!switchedWithinRoot&&count('explorer.watch.stop')===before['explorer.watch.stop']+1;
otherProject=true;
}
select(-1,'client-new-thread:unbound');
await nextFrame();
const firstGapFrame=treeStaysInline();
await nextFrame();
const transitionInline=firstGapFrame&&treeStaysInline();
const newPage=document.createElement('div');
newPage.dataset.appShellActivePage='true';
newPage.style.display='contents';
newPage.innerHTML='<div class="contents"><main data-app-shell-main-surface="default" data-codex-history-swipe-page="true"><div data-codex-composer-root><textarea></textarea></div></main></div>';
inlineParent.append(newPage);
await wait(()=>e.nextElementSibling===newPage);
await nextFrame();
const newChatInline=transitionInline&&treeStaysInline()&&rect(newPage.querySelector('main')).left>=rect(e).right-1;
const result={moduleBootstrapRetained:window.fixtureBootstrapIntact,readyBeforeWatch,rootResynced,positions,label,maskClear,fileTransparent,clickable,transitionInline,newChatInline,switchInline:e.dataset.placement==='inline',sameProject,otherProject,calls,errors:testErrors};
window.fixtureResult=result;
}catch(error){window.fixtureResult={error:String(error),errors:testErrors,calls};}})();`;
const html=`<!doctype html><html data-theme="dark"><head><meta charset="UTF-8"><link rel="modulepreload" href="/app-initial-current-ui.js"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{font:13px 'Segoe UI';color:#ddd;background:#182030;display:flex}nav{flex:none;width:50px}
[data-app-shell-workspace-row]{display:flex;flex:1;min-width:0;height:100%}aside{flex:none;width:200px;background:#181818}.sidebar-navigation{background:#181818}
._Workspace_new{display:contents}._MainContentClip_new{flex:1;display:flex;min-width:0}main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;margin-top:8px;background:#181818}
header{position:fixed;left:250px;top:8px;height:52px;right:0;pointer-events:none}
._WorkspaceContent_new{flex:1;display:flex;min-height:0;padding-top:52px} [data-app-shell-workspace-layout]{flex:1;display:flex;flex-direction:column;position:relative}
article{flex:1;padding:20px}[data-thread-scroll-footer]{position:relative;padding:16px}.pointer-events-none{pointer-events:none}.bg-surface{background:#181818;position:absolute;inset:0}textarea{position:relative;width:90%;height:90px}._MainContentTopFade_new{background:linear-gradient(black,transparent)}
</style></head><body><nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home" aria-current="page">Home</button></nav><button hidden data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true" data-app-shell-page-surface="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_current_001">Fixture project</button></div></aside>${page(true,'thread_current_001','Current title')}${page(false,'thread_cached_002','Cached title')}${page(false,'thread_other_003','Other title')}</div><script>${script}</script><script>${installedBackgroundFixture(root)}</script><script>window.fixtureBootstrapIntact=window.__CODE_CODEX_BOOTSTRAP__?.codexVersion==='26.928.2636.0';</script><script src="/explorer.js"></script><script>${checks}</script></body></html>`;
const fixture=join(root,'artifacts/current-ui.html');
mkdirSync(join(root,'artifacts'),{recursive:true});
writeFileSync(fixture,html);
const server=createServer((req,res)=>{if(req.url==='/explorer.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(root,'packages/explorer-ui/dist/explorer.js')));return;}if(req.url==='/app-initial-current-ui.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`);return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,result;
try{browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);for(let i=0;i<300;i++){result=await browser.evaluate('window.fixtureResult');if(result)break;await delay(40);}assert.ok(result,'fixture completed');writeFileSync(join(root,'artifacts/current-ui-result.json'),JSON.stringify(result,null,2));const shot=await browser.command('Page.captureScreenshot');writeFileSync(join(root,'artifacts/current-ui.png'),Buffer.from(shot.data,'base64'));}finally{await browser?.close();await new Promise(r=>server.close(r));}
console.log({...result,calls:result.calls.length});
assert.equal(result.error,undefined);for(const key of ['moduleBootstrapRetained','readyBeforeWatch','rootResynced','positions','maskClear','fileTransparent','clickable','transitionInline','newChatInline','switchInline','sameProject','otherProject'])assert.equal(result[key],true,key);assert.equal(result.label,'Current title');assert.deepEqual(result.errors,[]);
