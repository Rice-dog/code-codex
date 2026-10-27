import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/menu-session');mkdirSync(out,{recursive:true});
const version=JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version,tag='code-codex-v'+version.replaceAll('.','-');
let html=readFileSync(resolve(root,'scripts/fixtures/import-home.html'),'utf8').replace('<body>','<body><header style="pointer-events:auto;left:0;z-index:999"><div role="menubar"><button id="application-menu-trigger-file-menu">File</button><button id="application-menu-trigger-help-menu">Help</button></div></header>').replace('__BUNDLE_URL__','/bundle.js');
html=html.replace(" if(method==='explorer.settings.get'",` if(method==='explorer.login.startup.get')return {supported:true,enabled:false};
 if(method==='explorer.login.startup.set')return {supported:true,enabled:params.enabled};
 if(method==='explorer.installation.uninstall')return {opened:true};
 if(method==='explorer.settings.get'`);
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/bundle.js'?readFileSync(resolve(root,'packages/explorer-ui/dist/explorer.js')):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
const ev=x=>browser.evaluate(x);async function wait(x){for(let i=0;i<150;i++){if(await ev(x))return;await delay(60);}throw Error('Timed out: '+x);}async function check(name,x){assert.ok(await ev(x),name);checks.push(name);}
try{
 await wait(`document.querySelector('${tag}')?.dataset.state==='ready'`);
 await ev(`window.h=document.querySelector('${tag}');h.disable()`);await wait(`!document.querySelector('${tag}')`);
 await ev(`document.querySelector('#code-codex-application-menu-trigger').click()`);await wait(`!document.querySelector('[data-code-codex-login-startup]').disabled`);
 await check('Read OS menu state without reconstructing a dismissed tree',`!document.querySelector('${tag}')&&calls.some(x=>x.method==='explorer.login.startup.get')`);
 await ev(`document.querySelector('[data-code-codex-login-startup]').click()`);await wait(`!!document.querySelector('[data-code-codex-application-dialog]')`);
 await ev(`document.querySelector('[data-code-codex-dialog-content]').shadowRoot.querySelector('[data-accept]').click()`);await wait(`document.querySelector('[data-code-codex-login-startup]').getAttribute('aria-checked')==='true'`);
 await check('Explicit OS menu write survives tree bridge disposal',`!document.querySelector('${tag}')&&calls.filter(x=>x.method==='explorer.login.startup.set').length===1&&calls.find(x=>x.method==='explorer.login.startup.set').params.enabled===true`);
 await ev(`document.querySelector('[data-code-codex-uninstall]').click()`);await wait(`calls.some(x=>x.method==='explorer.installation.uninstall')`);
 await check('Wizard capability uses empty params and no tree reconstruction',`!document.querySelector('${tag}')&&Object.keys(calls.find(x=>x.method==='explorer.installation.uninstall').params).length===0`);
 await check('Native binding still serves the shared connection',`window.__codeCodex!==undefined`);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,checks},null,2));console.log(`Menu session: ${checks.length} full-bundle checks passed; mock native OS state only`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
