import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture,delay} from './browser-fixture.mjs';

// Actual renderer Bridge and function binding, in an isolated browser. Native
// SecureGate/dispatch has its own Rust regression; this test does not mock the
// client grammar or use an ObjectBridge that silently accepts invalid names.
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version;
const out=resolve(root,`artifacts/example-rpc-v${version}`);mkdirSync(out,{recursive:true});
const entry=resolve(out,'bridge-entry.ts');
writeFileSync(entry,`export {ExplorerBridge} from '../../packages/explorer-ui/src/bridge';`);
const source=buildSync({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'BridgeContract'}).outputFiles[0].text;
const server=createServer((req,res)=>{if(req.url==='/bridge.js'){res.setHeader('Content-Type','text/javascript');res.end(source);return;}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><body><script>window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.calls=[];window.__RPCTest=encoded=>{const request=JSON.parse(encoded);calls.push(request);window.__RPCTestReply({id:request.id,ok:true,result:{method:request.method}});};</script><script src="/bridge.js"></script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
const report={version,classification:'Actual production renderer Bridge via function binding in isolated Chrome; native gate/handler tests are separate Rust tests',checks:[]};
const check=async(name,expression)=>{assert.ok(await browser.evaluate(expression),name);report.checks.push(name);};
try{
 for(let n=0;n<100&&!(await browser.evaluate(`typeof BridgeContract!=='undefined'`));n++)await delay(20);
 await browser.evaluate(`window.bridge=new BridgeContract.ExplorerBridge('fixture-token','__RPCTest','__RPCTestReply',100)`);
 for(const method of ['explorer.startup.examples.status','explorer.startup.examples.download','explorer.startup.examples.chunk']){
  await check('Valid function-bound request and response: '+method,`(async()=>{const result=await bridge.request(${JSON.stringify(method)},{id:'the-intelligence-age'});return result.method===${JSON.stringify(method)}})()`);
 }
 for(const method of ['explorer.startupExamples.download','explorer.startup_examples.status','explorer.context1','explorer.context\n','explorer.context\0','explorer.cоntext','', 'x'.repeat(129)]){
  await check('Invalid name fails locally without a native call: '+(method.length>128?'oversized':method||'empty'),`(async()=>{const count=calls.length;try{await bridge.request(${JSON.stringify(method)})}catch(error){return error.code==='INVALID_METHOD'&&calls.length===count}return false})()`);
 }
 await check('A valid request still works after invalid names',`(async()=> (await bridge.request('explorer.context')).method==='explorer.context')()`);
 await browser.evaluate(`new Promise(resolve=>setTimeout(resolve,200))`);
 await check('Invalid names leave no delayed timeout or unhandled rejection',`(()=>{const events=window[Symbol.for('code-codex:runtime-events:v1')]?.events??[];return errors.length===0&&!events.some(e=>e.details.errorCode==='TIMEOUT')})()`);
 await browser.evaluate('bridge.dispose()');
 await check('Disposed bridge preserves existing cancellation behavior',`(async()=>{try{await bridge.request('explorer.context')}catch(error){return error.name==='BridgeUnavailableError'}return false})()`);
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error;}
finally{writeFileSync(resolve(out,'renderer-bridge.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(`${report.checks.length} renderer method-contract checks passed`);
