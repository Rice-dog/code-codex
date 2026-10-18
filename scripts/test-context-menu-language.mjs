import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {installedBackgroundFixture} from './background-package-fixture.mjs';
import {launchFixture,delay} from './browser-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const version=JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version;
const out=resolve(root,`artifacts/context-menu-language-v${version}`);mkdirSync(out,{recursive:true});
const original=readFileSync(resolve(root,'scripts/test-startup-source-settings.mjs'),'utf8');
const home=original.match(/const home = `([^`]+)`;/)[1],css=original.match(/<style>([\s\S]*?)<\/style>/)[1];
const bundle=installedBackgroundFixture(root)+readFileSync(resolve(ui,'dist/explorer.js'),'utf8');
const setup=`window.errors=[];window.calls=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.pref={schema:1,locale:'zh-CN',revision:1,source:'installer'};window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.1007.2314.0',supported:true,language:pref};
window.__codeCodex={request:async({method,params})=>{calls.push({method,params});if(method==='explorer.language.get')return{preference:pref};if(method==='explorer.language.set'){if(params.expectedRevision!==pref.revision)throw Error('CC-LANG-CONFLICT-001');return pref={...pref,locale:params.locale,revision:pref.revision+1,source:'menu'};}if(method==='explorer.settings.get'||method==='explorer.settings.set')return{collapsed:false,panelWidth:300,startupTransitionEnabled:false};if(method==='explorer.context')return{threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',rootPath:'C:/Fixture',compatible:true};if(method==='explorer.list')return{entries:params.relativePath?[]:[{name:'New Folder',relativePath:'New Folder',kind:'directory'},{name:'New File',relativePath:'New File',kind:'file'}]};if(method==='explorer.watch.start')return{watching:true};return{};}};`;
const server=createServer((req,res)=>{if(req.url==='/core.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);}else if(req.url?.endsWith('.js')){res.setHeader('Content-Type','text/javascript');res.end('export const adapter={appActions:{runInPrimaryWindow:async()=>({mode:"light"})},clientCoordination:{invalidateQueryCache:async()=>({})}};');}else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html data-theme="light"><meta charset="utf-8"><style>${css} html,body{overflow:hidden}body{position:fixed;inset:0}</style><body><header><div role="menubar"><button id="application-menu-trigger-file-menu">File</button><button id="application-menu-trigger-help-menu">Help</button></div></header>${home}<script>${setup}</script><script src="/core.js"></script></body></html>`);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/index.html`),checks=[];
const ev=code=>browser.evaluate(code);
async function wait(code){for(let n=0;n<200;n++){if(await ev(code))return;await delay(40);}throw Error('Timeout '+code);}
async function check(name,code){assert.ok(await ev(code),name);checks.push(name);}
async function context(selector){await ev(`(()=>{const row=q(${JSON.stringify(selector)}),r=row.getBoundingClientRect();row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,composed:true,clientX:r.left+15,clientY:r.top+10}));})()`);await wait(`!q('.context-menu').hidden&&q('.context-menu').getBoundingClientRect().height>0`);await delay(80);}
async function language(locale){await ev(`document.querySelector('#code-codex-application-menu-trigger').click();document.querySelector('[aria-controls="code-codex-language-popup"]').click();document.querySelector('[data-locale="${locale}"]').click()`);await wait(`window[Symbol.for('code-codex:language:v1')].preference.locale==='${locale}'&&document.querySelector('#code-codex-language-popup').hidden&&!document.querySelector('[data-locale="${locale}"]').disabled`);}
async function shot(name,element){
 if(name==='folder-zh'){
  const observation=await ev(`(()=>{const e=${element},r=e.getBoundingClientRect();return{visible:!e.hidden&&getComputedStyle(e).visibility==='visible',labels:labels(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},hits:h.shadowRoot.elementsFromPoint(r.x+r.width/2,r.y+15).slice(0,4).map(n=>n.className)}})()`);
  assert.ok(observation.visible&&observation.hits.includes('context-menu-item'),'The translated context menu must be visible and receive pointer hits');
  writeFileSync(resolve(out,'menu-visible-observation.json'),JSON.stringify(observation,null,2));return;
 }
 const clip=await ev(`(()=>{const r=(${element}).getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
 assert.ok(clip.width>0&&clip.height>0,'Screenshot target must be visible');
 const screenshot=await browser.command('Page.captureScreenshot',{format:'png',clip});writeFileSync(resolve(out,name+'.png'),Buffer.from(screenshot.data,'base64'));
}
try{
 await wait(`!!document.querySelector('code-codex-v${version.replaceAll('.','-')}')`);
 await ev(`window.h=document.querySelector('code-codex-v${version.replaceAll('.','-')}');window.q=s=>h.shadowRoot.querySelector(s);window.labels=()=>[...h.shadowRoot.querySelectorAll('.context-menu-label')].map(e=>e.textContent);`);
 await wait(`!!q('.tree-row[data-path="New Folder"]')&&!!q('.tree-row[data-path="New File"]')`);
 await delay(200); // Initial settings/watch reconciliation must finish before opening a menu.
 await context('.tree-row[data-path="New Folder"]');
 await check('Folder context menu translates every action',`!q('.context-menu').hidden&&JSON.stringify(labels())===JSON.stringify(['新建文件','新建文件夹','重命名','删除','复制相对路径','复制绝对路径','在资源管理器中显示','刷新'])`);await shot('folder-zh',`q('.context-menu')`);
 await language('en');
 await check('Existing folder-menu labels follow English',`labels().includes('New File')&&labels().includes('Copy Absolute Path')&&labels().includes('Reveal in File Explorer')`);
 await language('zh-CN');
 await context('.tree-row[data-path="New File"]');
 await check('File context menu translates Preview and path actions',`JSON.stringify(labels())===JSON.stringify(['预览','新建文件','新建文件夹','重命名','删除','复制相对路径','复制绝对路径','在资源管理器中显示'])`);
 await check('File and folder names remain verbatim',`q('.tree-row[data-path="New File"] .node-name').textContent==='New File'&&q('.tree-row[data-path="New Folder"] .node-name').textContent==='New Folder'`);
 await ev(`q('[data-action="new-file"]').click()`);await wait(`q('.context-dialog-title')?.textContent==='新建文件'`);
 await check('Create-file dialog and input label are Chinese',`q('.context-dialog-title').textContent==='新建文件'&&q('[data-dialog-name]').getAttribute('aria-label')==='文件名'&&q('[data-dialog-submit]').textContent==='创建'`);
 await ev(`q('[data-dialog-name]').value='bad/name';q('[data-dialog-submit]').click()`);await delay(40);
 await check('Name validation is translated before any filesystem request',`q('#cle-context-dialog-error').textContent==='名称不能包含斜杠、反斜杠或冒号。'&&!calls.some(c=>c.method==='explorer.entry.create')`);
 await ev(`q('[data-dialog-name]').value='Refresh'`);await language('en');
 await check('Language change preserves unsaved file-name input',`q('[data-dialog-name]').value==='Refresh'&&q('.context-dialog-title').textContent==='New File'`);
 await ev(`q('[data-dialog-action="cancel"]').click()`);await language('zh-CN');
 await context('.tree-row[data-path="New Folder"]');await ev(`q('[data-action="new-folder"]').click()`);await wait(`q('.context-dialog-title')?.textContent==='新建文件夹'`);
 await check('Create-folder dialog uses translated folder-name label',`q('.context-dialog-title').textContent==='新建文件夹'&&q('[data-dialog-name]').getAttribute('aria-label')==='文件夹名称'`);
 await ev(`q('[data-dialog-action="cancel"]').click()`);await context('.tree-shell');
 await check('Root context menu is translated too',`JSON.stringify(labels())===JSON.stringify(['新建文件','新建文件夹','刷新'])`);
 await ev(`q('.context-menu').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('#code-codex-application-menu-trigger').click()`);await shot('language-chevron',`document.querySelector('#code-codex-application-menu-popup')`);
 await check('No uncaught browser errors or filesystem mutations',`errors.length===0&&!calls.some(c=>['explorer.entry.create','explorer.entry.rename','explorer.entry.delete'].includes(c.method))`);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({version,passed:checks.length,checks,scope:'Production UI in isolated Chrome; simulated native bridge; no user files or official profile touched'},null,2));
 console.log(JSON.stringify({passed:checks.length,version}));
}catch(error){
 writeFileSync(resolve(out,'failure.json'),JSON.stringify({error:String(error),snapshot:await ev(`({calls,errors,text:h.shadowRoot.textContent.slice(-2200),rows:[...h.shadowRoot.querySelectorAll('[data-path]')].map(e=>e.dataset.path)})`).catch(()=>null)},null,2));throw error;
}finally{await browser.close();await new Promise(r=>server.close(r));}
