import assert from 'node:assert/strict';
import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version;
const output=resolve(root,`artifacts/runtime-diagnostics-v${version}`);mkdirSync(output,{recursive:true});
const entry=resolve(output,'fixture-entry.ts');
writeFileSync(entry,`export {ExplorerBridge} from '../../packages/explorer-ui/src/bridge';export {openRuntimeInformation,flushRuntimeEvents} from '../../packages/explorer-ui/src/runtime-information';export {takeRuntimeEvents,runtimeEvent} from '../../packages/explorer-ui/src/runtime-events';export {beginRuntimeOperation,runtimeErrorDetails} from '../../packages/explorer-ui/src/runtime-operations';export {ensurePluginPackage} from '../../packages/explorer-ui/src/plugin-load-diagnostics';export {connectPluginPackages} from '../../packages/explorer-ui/src/plugin-runtime';`);
const catalog=[{id:'surface-opacity',category:'appearance',version:'1.0.0',api:1,sha256:'a'.repeat(64),size:10,asset:'fixture.js'}];
const bundle=buildSync({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'Diag',define:{__CODE_CODEX_PLUGIN_CATALOG__:JSON.stringify(catalog)}}).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><script>${bundle}</script><script>
window.savedEvents=[];window.copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied=text}});
window.__codeCodex={request:async({id,method,params})=>{
 if(method==='explorer.runtime.append'){savedEvents.push(...params.events);return {accepted:params.events.length};}
 if(method==='explorer.runtime.list')return {currentRun:'1791510000000-1',runs:[{id:'1791510000000-1',current:true,bytes:100}]};
 if(method==='explorer.runtime.read'){if(window.failRead)throw Error('Synthetic log read failure');return {text:JSON.stringify({version:${JSON.stringify(version)},droppedEvents:0})+'\\n'+savedEvents.map((e,i)=>JSON.stringify({...e,sequence:i,elapsedMs:i})).join('\\n')+'\\n'};}
 if(method==='fixture.timeout')return new Promise(()=>{});
 if(method==='fixture.reject'||method==='fixture.chunk')return {id,ok:false,error:{code:'ACCESS_DENIED',message:'blocked C:\\\\Users\\\\SENTINEL_PRIVATE\\\\file'}};
 return {entries:[{name:'SENTINEL_CONTENT'}],sizeBytes:3};
}};
window.bridge=new Diag.ExplorerBridge('SENTINEL_TOKEN');window.events=async()=>{await Diag.flushRuntimeEvents();return savedEvents};
</script></body></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const checks=[];
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}`);const e=s=>browser.evaluate(s);
 for(let retry=0;retry<100&&!(await e(`typeof bridge!=='undefined'`));retry++)await delay(20);
 assert.equal(await e(`typeof bridge!=='undefined'`),true);
 assert.ok(await e(`window[Symbol.for('code-codex:runtime-log-connection:v1')].request('explorer.preview',{relativePath:'private'}).then(()=>false,error=>error.message.includes('only supports runtime information'))`));checks.push('Shared logging dispatcher cannot invoke filesystem or other general Bridge methods');
 await e(`bridge.request('explorer.list',{relativePath:'SENTINEL_PRIVATE',threadId:'SENTINEL_TASK'})`);
 let events=await e(`events()`);let pair=events.filter(x=>x.action==='explorer.list');assert.equal(pair.length,2);assert.equal(pair[0].details.requestRef,pair[1].details.requestRef);assert.equal(pair[1].details.resultSummary.entriesCount,1);assert.ok(!JSON.stringify(pair).includes('SENTINEL'));checks.push('Bridge success correlation, duration and safe result summary');
 await e(`bridge.request('fixture.reject').catch(()=>{})`);await e(`bridge.request('fixture.timeout',{},25).catch(()=>{})`);await e(`bridge.request('fixture.chunk').catch(()=>{})`);
 events=await e(`events()`);assert.ok(events.some(x=>x.action==='fixture.timeout'&&x.outcome==='failed'&&x.details.errorCode==='TIMEOUT'));assert.ok(events.some(x=>x.action==='fixture.chunk'&&x.outcome==='failed'));assert.ok(events.some(x=>x.action==='fixture.reject'&&x.outcome==='failed'&&x.details.errorChain.length));assert.ok(!JSON.stringify(events).includes('SENTINEL'));checks.push('Timeout, transport rejection and high-frequency chunk failures retain details');
 const before=events.length;await e(`bridge.request('explorer.plugins.status')`);events=await e(`events()`);assert.equal(events.length,before);checks.push('Successful idle plugin polls do not fill logs');
 await e(`Diag.connectPluginPackages(async()=>{throw new Error('module registration failed',{cause:new Error('lower-level cause')})});Diag.ensurePluginPackage('surface-opacity').catch(()=>{})`);
 events=await e(`events()`);assert.ok(events.some(x=>x.source==='plugin-load'&&x.outcome==='failed'&&x.details.errorChain.length===2));checks.push('Module loading errors include both causes');
 await e(`dispatchEvent(new ErrorEvent('error',{error:new Error('Synthetic window failure')}));dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('Synthetic rejected promise')}))`);events=await e(`events()`);assert.ok(events.some(x=>x.source==='codex-observed'&&x.action==='window exception'));assert.ok(events.some(x=>x.action==='unhandled rejection'));checks.push('Unhandled window and promise failures are observed without interception');
 assert.ok(await e(`(()=>{const error=new Error();Object.defineProperty(error,'message',{get(){throw Error('hostile getter')}});return Diag.runtimeErrorDetails(error).errorChain.length>0})()`));checks.push('Malformed exception getters do not break diagnostic callers');
 await e(`window.op=Diag.beginRuntimeOperation('fixture','progress',{id:'fixture'});op.event('verify','passed');op.finish('passed');op.finish('failed')`);events=await e(`events()`);assert.equal(events.filter(x=>x.source==='fixture').length,3);assert.equal(new Set(events.filter(x=>x.source==='fixture').map(x=>x.details.operationId)).size,1);checks.push('Operation terminal event occurs once');
 await e(`Diag.openRuntimeInformation()`);await delay(150);const summary=await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.summary').textContent`);assert.ok(summary.includes('failure events'));assert.ok(await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.detail').textContent.includes('\\n')`));checks.push('Runtime Information shows readable multiline details and failure counts');
 await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.copy').click()`);await delay(150);assert.ok(await e(`copied.includes('lower-level cause')&&copied.includes('TIMEOUT')&&!copied.includes('SENTINEL')`));checks.push('Copy Details includes full retained causes with sensitive values removed');
 const shot=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'diagnostic-dialog.png'),Buffer.from(shot.data,'base64'));
 await e(`window.copyBefore=copied;window.failRead=true;document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.copy').click()`);await delay(150);assert.ok(await e(`copied===copyBefore&&document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.summary').textContent.includes('Copy cancelled')`));checks.push('Failed log refresh cannot copy stale or mismatched run data');
 await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.close').click();window.failRead=false`);
 await e(bundle.replace('var Diag =','var DiagReloaded ='));
 await e(`DiagReloaded.openRuntimeInformation()`);await delay(150);
 assert.ok(await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.summary').textContent.includes('Version ${version}')`));
 await e(`DiagReloaded.runtimeEvent('fixture','after reinjection','passed');DiagReloaded.flushRuntimeEvents()`);
 assert.equal(await e(`savedEvents.filter(x=>x.action==='after reinjection').length`),1);checks.push('Reinjected menu shares the authenticated connection and one event pump with the reused element');
 await e(`document.querySelector('dialog').firstElementChild.shadowRoot.querySelector('.close').click();bridge.dispose();bridge.request('explorer.list').catch(()=>{})`);assert.ok((await e(`savedEvents.concat(Diag.takeRuntimeEvents())`)).some(x=>x.action==='explorer.list'&&x.outcome==='cancelled'));checks.push('Disposed bridge requests receive a cancelled result');
 writeFileSync(resolve(output,'browser-diagnostics.json'),JSON.stringify({version,checks},null,2));console.log(JSON.stringify({version,checks}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
