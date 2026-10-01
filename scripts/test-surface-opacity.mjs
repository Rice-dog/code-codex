import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const dir=join(root,'artifacts');mkdirSync(dir,{recursive:true});
const tag='code-codex-v'+JSON.parse(readFileSync(join(root,'packages/explorer-ui/package.json'),'utf8')).version.replaceAll('.','-');
const login='<div class="flex h-full w-full items-center justify-center overflow-hidden bg-surface pb-6 text-default"><div class="flex w-[340px] flex-col items-center gap-8"><svg width="40" height="40"><circle cx="20" cy="20" r="16" fill="none" stroke="white"/></svg><h1>登录 ChatGPT</h1><button>继续登录</button><button>使用其他方式登录</button></div></div>';
const home=`<nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home" aria-current="page">首页</button></nav><button hidden data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_opacity_001">Project</button></div></aside><div data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_new" data-app-shell-page-surface="true"><header data-app-shell-titlebar="true"><span data-app-shell-titlebar-content>Conversation</span></header><div class="_MainContentClip_new"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_new"><article data-response-annotation-conversation="thread_opacity_001">Message contents</article><div data-thread-scroll-footer="true"><div data-above-composer-conversation-id="thread_opacity_001"></div><form data-codex-composer><textarea aria-label="Message">Native draft</textarea><button>Send</button></form><div class="native-composer" data-composer-layout data-composer-utility-bar-variant="default"><div contenteditable="true">Native composer</div></div><div data-composer-layout data-composer-utility-bar-variant="home"><div class="_ComposerLayoutBody_fixture"><div contenteditable="true">Home composer</div></div></div></div></div></main></div></div></div></div>`;
writeFileSync(join(dir,'app-initial-opacity-test.js'),`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`);
const setup=`
const fixtureHome=${JSON.stringify(home)},fixtureLogin=${JSON.stringify(login)};
const root=document.querySelector('#native-root');root.innerHTML=sessionStorage.getItem('fixture-login')?'${login.replaceAll("'","\\'")}':fixtureHome;
window.__CODE_CODEX_BOOTSTRAP__={token:'test',codexVersion:'26.928.2636.0',supported:true};
const calls=[];window.__codeCodex={request:async({method,params})=>{calls.push(method);
if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};
if(method==='explorer.context')return {threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};
if(method==='explorer.list')return {entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};
if(method==='explorer.preview')return {kind:'text',text:'# Preview',sizeBytes:10,truncated:false,editable:true,version:'a'.repeat(64),lineEnding:'lf'};
if(method==='explorer.watch.start')return {watching:true};return {};}};
const errors=[];addEventListener('error',e=>errors.push(e.message));
`;
const checks=`
(async()=>{const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(f,label)=>{for(let i=0;i<160&&!f();i++)await delay(30);if(!f())throw Error(label);};const result={};
try{
await wait(()=>document.querySelector('${tag}'),'host');const e=document.querySelector('${tag}'),s=e.shadowRoot,html=document.documentElement;
const opacity=s.querySelector('.surface-opacity-enable'),input=key=>s.querySelector('[data-mask-region="'+key+'"]');
const set=(key,value)=>{input(key).value=String(value);input(key).dispatchEvent(new Event('input',{bubbles:true}));};
const enabled=()=>html.hasAttribute('data-code-codex-ui-mask-active');
const bg=()=>html.hasAttribute('data-code-codex-glow-horizon-background');
const style=el=>getComputedStyle(el);
if(sessionStorage.getItem('fixture-login')){
 await wait(bg,'saved background restored at cold login');await wait(enabled,'saved masks restored');
 result.coldLoginHidden=e.hasAttribute('data-home-view-hidden')&&style(e).display==='none';
 result.coldBackground=!!document.querySelector('[data-code-codex-glow-horizon-layer]');
 result.savedValues=html.style.getPropertyValue('--code-codex-mask-sidebar')==='0.24'&&html.style.getPropertyValue('--code-codex-mask-tree')==='0.37';
 result.noContextAtLogin=!calls.includes('explorer.context')&&!calls.includes('explorer.list');
 result.loginMask=style(document.querySelector('[data-code-codex-login-surface]')).backgroundColor==='rgba(11, 12, 15, 0.31)';
 root.innerHTML=fixtureHome;sessionStorage.removeItem('fixture-login');await wait(()=>e.dataset.state==='ready'&&!e.hasAttribute('data-home-view-hidden'),'Home from cold login');
 result.homeRestored=e.dataset.placement==='inline';result.errors=errors;
}else{
 await wait(()=>e.dataset.state==='ready','tree ready');e.openPreviewMarket();await delay(180);
 result.firstCard=s.querySelector('[data-preview-market-section="appearance"] [data-appearance-plugin]').dataset.appearancePlugin==='code-codex.surface-opacity';
 const startup=s.querySelector('[data-appearance-plugin="code-codex.startup-transition"]');result.startupHidden=startup.hidden&&style(startup).display==='none';
 result.marketEnglish=s.querySelector('[data-appearance-plugin="code-codex.surface-opacity"] h4').textContent==='UI Surface Opacity';
 opacity.click();await delay(80);result.prerequisite=!enabled()&&opacity.getAttribute('aria-pressed')==='false'&&!s.querySelector('.surface-opacity-panel').matches(':popover-open');
 const notice=s.querySelector('.action-notice'),noticeRect=notice.getBoundingClientRect();
 document.documentElement.dataset.noticeTestReady='true';await delay(600);
 result.noticeAboveMarket=notice.matches(':popover-open')&&!notice.hidden&&notice.textContent.includes('必须先启用')&&s.elementFromPoint(noticeRect.left+noticeRect.width/2,noticeRect.top+noticeRect.height/2)===notice;
 s.querySelector('.surface-opacity-settings-trigger').click();await delay(80);
 result.settingsSeparate=s.querySelector('.surface-opacity-panel').matches(':popover-open')&&!enabled();
 const language=s.querySelector('#cle-surface-opacity-settings-language');language.checked=true;language.dispatchEvent(new Event('change',{bubbles:true}));
 result.englishSettings=s.querySelector('.surface-opacity-panel').dataset.language==='en'&&s.querySelector('label[for=cle-mask-tree] .cle-bilingual-label-en').textContent==='File tree'&&getComputedStyle(s.querySelector('label[for=cle-mask-tree] .cle-bilingual-label-zh')).display==='none'&&s.querySelector('[data-appearance-plugin="code-codex.surface-opacity"] h4').textContent==='UI Surface Opacity';
 language.checked=false;language.dispatchEvent(new Event('change',{bubbles:true}));
 opacity.click();await delay(40);result.noticeAboveSettings=notice.matches(':popover-open')&&s.elementFromPoint(noticeRect.left+noticeRect.width/2,noticeRect.top+noticeRect.height/2)===notice;
 result.sharedSettingsStyle=getComputedStyle(s.querySelector('label[for=cle-mask-tree]')).fontSize===getComputedStyle(s.querySelector('#cle-particle-settings .particle-control-row label')).fontSize&&getComputedStyle(s.querySelector('#cle-surface-opacity-title')).fontSize===getComputedStyle(s.querySelector('#cle-particle-settings-title')).fontSize&&s.querySelector('.surface-opacity-panel').dataset.language==='zh';
 s.querySelector('.surface-opacity-close').click();
 s.querySelector('[data-appearance-plugin="code-codex.glow-horizon-background"] .preview-extension-action').click();await wait(bg,'real Glow Horizon enabled');await delay(200);const layer=document.querySelector('[data-code-codex-glow-horizon-layer]');
 opacity.click();await wait(enabled,'masks enabled');result.enableOnly=!s.querySelector('.surface-opacity-panel').matches(':popover-open');s.querySelector('.surface-opacity-settings-trigger').click();
 result.panelExclusive=[...s.querySelectorAll('.particle-settings-panel')].filter(p=>p.matches(':popover-open')).length===1&&s.querySelector('.surface-opacity-panel').matches(':popover-open');set('sidebar',24);set('tree',37);set('conversation',49);set('preview',12);set('tabs',18);set('composer',83);set('navigation',21);set('login',31);await delay(100);
 await delay(250);result.independent=style(document.querySelector('aside')).backgroundColor==='rgba(16, 17, 20, 0.24)'&&style(s.querySelector('.frame')).backgroundColor==='rgba(16, 17, 20, 0.37)'&&style(document.querySelector('main')).backgroundColor==='rgba(11, 12, 15, 0.49)'&&style(document.querySelector('nav')).backgroundColor==='rgba(16, 17, 20, 0.21)'&&style(document.querySelector('[data-codex-composer]')).backgroundColor==='rgba(30, 31, 35, 0.83)';
 if(!result.independent)result.regionStyles=[...['aside','main','nav','[data-codex-composer]'].map(q=>[q,style(document.querySelector(q)).backgroundColor]),['tree',style(s.querySelector('.frame')).backgroundColor]];result.textOpaque=style(document.querySelector('article')).opacity==='1'&&style(s.querySelector('.project-name')).opacity==='1';
 result.nativeComposers=style(document.querySelector('.native-composer')).backgroundColor==='rgba(30, 31, 35, 0.83)'&&style(document.querySelector('[data-composer-utility-bar-variant=home] ._ComposerLayoutBody_fixture')).backgroundColor==='rgba(30, 31, 35, 0.83)'&&style(document.querySelector('[data-composer-utility-bar-variant=home]')).backgroundColor==='rgba(0, 0, 0, 0)';
 result.backgroundUnchanged=layer===document.querySelector('[data-code-codex-glow-horizon-layer]')&&bg();
 s.querySelector('.surface-opacity-close').click();s.querySelector('[role=treeitem]').click();
 await wait(()=>document.querySelector('main>[data-code-codex-owned][data-file-active]'),'file preview');
 const preview=document.querySelector('main>[data-code-codex-owned]'),ps=preview.shadowRoot;
 result.previewIndependent=style(document.querySelector('main')).backgroundImage.includes('0.12')&&style(document.querySelector('main')).backgroundColor==='rgba(0, 0, 0, 0)'&&style(ps.querySelector('.preview-panel')).backgroundColor==='rgba(0, 0, 0, 0)'&&style(ps.querySelector('.tab-strip')).backgroundColor==='rgba(24, 25, 28, 0.18)';
 if(!result.previewIndependent)result.previewStyles=[style(document.querySelector('main')).backgroundImage,style(document.querySelector('main')).backgroundColor,style(ps.querySelector('.preview-panel')).backgroundColor,style(ps.querySelector('.tab-strip')).backgroundColor];ps.querySelector('[data-tab-kind="conversation"]').click();await delay(60);result.conversationRestored=style(document.querySelector('main')).backgroundImage.includes('0.49');
 e.openPreviewMarket();opacity.click();await delay(60);result.disableRestores=!enabled()&&style(s.querySelector('.frame')).backgroundColor==='rgba(16, 17, 20, 0.68)'&&bg();opacity.click();
 s.querySelector('.surface-opacity-settings-trigger').click();set('tree',0);await delay(250);result.zero=/, 0\\)$/.test(style(s.querySelector('.frame')).backgroundColor);set('tree',100);await delay(250);result.solid=style(s.querySelector('.frame')).backgroundColor==='rgb(16, 17, 20)';
 s.querySelector('[data-mask-reset="tree"]').click();result.singleReset=input('tree').value==='68'&&input('sidebar').value==='24';
 s.querySelector('.surface-opacity-reset').click();result.resetAll=input('tree').value==='68'&&input('sidebar').value==='66'&&input('preview').value==='58';set('tree',37);set('sidebar',24);set('login',31);
 s.querySelector('.surface-opacity-close').click();s.querySelector('[data-appearance-plugin="code-codex.glow-horizon-background"] .preview-extension-action').click();await wait(()=>!bg(),'background off');await delay(80);result.paused=!enabled()&&s.querySelector('.surface-opacity-status').textContent.startsWith('Paused');
 s.querySelector('[data-appearance-plugin="code-codex.glow-horizon-background"] .preview-extension-action').click();await wait(()=>bg()&&enabled(),'background resume');result.resumed=html.style.getPropertyValue('--code-codex-mask-sidebar')==='0.24';
 const keptLayer=document.querySelector('[data-code-codex-glow-horizon-layer]');root.innerHTML=fixtureLogin;await wait(()=>e.hasAttribute('data-home-view-hidden')&&html.hasAttribute('data-code-codex-login-screen'),'logout hidden');await delay(160);
 result.logoutHidden=style(e).display==='none'&&(!preview.isConnected||preview.hasAttribute('data-home-suspended'));
 result.loginBackground=keptLayer===document.querySelector('[data-code-codex-glow-horizon-layer]')&&bg()&&style(document.querySelector('[data-code-codex-login-surface]')).backgroundColor==='rgba(11, 12, 15, 0.31)'&&style(root).backgroundColor==='rgba(0, 0, 0, 0)';
 const loginButton=root.querySelector('button'),b=loginButton.getBoundingClientRect();result.loginClickable=document.elementFromPoint(b.x+5,b.y+5)===loginButton;
 root.innerHTML=fixtureHome;await wait(()=>!e.hasAttribute('data-home-view-hidden')&&e.dataset.state==='ready','Home returns');await delay(90);result.homeRestored=e.dataset.placement==='inline'&&bg();
 e.openPreviewMarket();s.querySelector('.surface-opacity-settings-trigger').click();result.errors=errors;
}
}catch(error){result.error=String(error);result.errors=errors;result.debug={calls,attrs:[...document.documentElement.attributes].map(a=>[a.name,a.value])};}
document.documentElement.dataset.test=JSON.stringify(result);
})();`;
const fixture=join(dir,'surface-opacity.html');
writeFileSync(fixture,`<!doctype html><html data-theme="dark"><head><meta charset="UTF-8"><link rel="modulepreload" href="./app-initial-opacity-test.js"><style>
*{box-sizing:border-box}html,body,#native-root{height:100%;width:100%;margin:0}body{font:13px 'Segoe UI';color:#ddd;background:#181818}#native-root{background:#181818;display:flex}
nav{width:50px;flex:none}aside{width:220px;flex:none}.sidebar-navigation{background:#181818}[data-app-shell-workspace-row]{display:flex;flex:1;min-width:0;height:100%}._Workspace_new{display:contents}._MainContentClip_new{flex:1;display:flex;min-width:0}main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;margin-top:8px;background:#181818}
header[data-app-shell-titlebar]{position:fixed;left:270px;top:8px;height:52px;right:0;pointer-events:none}._WorkspaceContent_new{flex:1;display:flex;flex-direction:column;min-height:0;padding-top:52px}article{flex:1;padding:25px}textarea{height:80px;width:100%}form{padding:12px;margin:10px;border:1px solid #444;border-radius:12px}
[data-composer-layout]{--composer-layout-surface-background:#232323;padding:6px}[data-composer-layout]:not([data-composer-utility-bar-variant=home]),[data-composer-utility-bar-variant=home] ._ComposerLayoutBody_fixture{background-color:var(--composer-layout-surface-background)}
.h-full{height:100%}.w-full{width:100%}.flex{display:flex}.flex-col{flex-direction:column}.items-center{align-items:center}.justify-center{justify-content:center}.overflow-hidden{overflow:hidden}.bg-surface{background:#181818}.gap-8{gap:28px}.pb-6{padding-bottom:24px}h1{font-size:28px;font-weight:400}#native-root button{padding:10px 16px;border:1px solid #555;background:#242424;color:#fff;border-radius:8px}#native-root svg{overflow:visible}
</style></head><body><div id="native-root"></div><script>${setup}</script><script src="../packages/explorer-ui/dist/explorer.js"></script><script>${checks}</script></body></html>`);
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--allow-file-access-from-files','--window-size=1500,1000','--remote-debugging-port=0','--user-data-dir='+join(dir,'opacity-test-'+Date.now()),'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const browserUrl=await new Promise((resolve,reject)=>{let log='';const timeout=setTimeout(()=>reject(Error('Chrome timeout')),10000);child.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});child.once('error',reject);});
const ws=new WebSocket(browserUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let seq=0;const pending=new Map();ws.onmessage=event=>{const msg=JSON.parse(event.data),p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
try{
const target=(await command('Target.getTargets')).targetInfos.find(t=>t.type==='page');const {sessionId}=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true});
await command('Runtime.enable',{},sessionId);await command('Page.navigate',{url:pathToFileURL(fixture).href},sessionId);
const evaluate=async expression=>(await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId)).result?.value;
let noticeCaptured=false;
const waitResult=async()=>{for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const value=await evaluate('document.documentElement.dataset.test');if(!noticeCaptured&&await evaluate('document.documentElement.dataset.noticeTestReady')){noticeCaptured=true;const capture=await command('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(join(dir,'surface-opacity-notice.png'),Buffer.from(capture.data,'base64'));}if(value)return JSON.parse(value);}throw Error('fixture timeout');};
const result=await waitResult();console.log(result);writeFileSync(join(dir,'surface-opacity-result.json'),JSON.stringify(result,null,2));assert.equal(result.error,undefined);for(const [key,value] of Object.entries(result))if(key!=='errors')assert.equal(value,true,key);assert.deepEqual(result.errors,[]);
let capture=await command('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(join(dir,'surface-opacity-settings.png'),Buffer.from(capture.data,'base64'));
// A genuine reload starts at sign-in with a saved background and mask settings.
await evaluate("sessionStorage.setItem('fixture-login','true')");await command('Page.reload',{},sessionId);
const cold=await waitResult();console.log({cold});assert.equal(cold.error,undefined);for(const [key,value] of Object.entries(cold))if(key!=='errors')assert.equal(value,true,key);assert.deepEqual(cold.errors,[]);
await evaluate(`document.querySelector('#native-root').innerHTML=${JSON.stringify(login)}`);await new Promise(r=>setTimeout(r,200));capture=await command('Page.captureScreenshot',{format:'png'},sessionId);writeFileSync(join(dir,'surface-opacity-login.png'),Buffer.from(capture.data,'base64'));
}finally{await command('Browser.close').catch(()=>{});ws.close();}
