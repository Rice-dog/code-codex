import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture} from './browser-fixture.mjs';

const out=resolve('artifacts/account-thread-identity');await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:resolve('packages/explorer-ui/src'),loader:'ts',contents:`
import {resolveActiveThread} from './active-thread';
import {NativeAccountAdapter} from './features/accounts/native-adapter';
window.resolveThread=resolveActiveThread;
window.adapter=new NativeAccountAdapter(async()=>{throw Error('Identity must not request the network');},{owner:{id:'owner',label:'host'},connections:[{id:'childA',email:'a@example.invalid'},{id:'childB',email:'b@example.invalid'}],selected:{thread_aaaa:'childA',thread_bbbb:'childB'},activeConversations:[]},()=>{});
window.marker=id=>'<div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:'+id+'"></div>';
window.fixture=(html)=>{document.querySelector('#fixture').innerHTML=html;return {id:resolveActiveThread(),selected:adapter.status().selected};};
window.startRouting=async()=>{
 const state={owner:{id:'owner',label:'host'},profile:{initial:'./assets/app-initial-fixture.js',shared:'./assets/app-shared-fixture.js'},connections:[{id:'childA',email:'a@example.invalid'},{id:'childB',email:'b@example.invalid'}],selected:{thread_aaaa:'childA',thread_bbbb:'childB'},sharedConversations:[],activeConversations:[],nativeRouting:true,nativeRoutes:{thread_aaaa:'childA',thread_bbbb:'childB'}};
 window.routeState=state;window.routeCalls=[];
 const lease=()=>({dup(){return this},onRpcBroken(){},[Symbol.dispose](){}});
 const manager={...lease(),registerReplayAdmission(){return Promise.resolve(lease());},subscribe(){return Promise.resolve(lease());},getThreadExecutionState:async()=>({inProgress:false,latestModel:'gpt-6.1-sol',latestReasoningEffort:'high'}),startTurnWithOutcome(){throw Error('No inference may be sent');}};
 const registry={...lease(),subscribe(_id,f){queueMicrotask(()=>f({status:'ready',manager}));return Promise.resolve(lease());}};
 const services={appServerManagers:registry,executionHosts:{},clientCoordination:{},appActions:{}};
 const quota={rateLimits:{limitId:'codex',primary:{usedPercent:10,windowDurationMins:300},secondary:{usedPercent:20,windowDurationMins:10080}}};
 const listeners=new Set();const dispatcher={subscribe(_type,f){listeners.add(f);return()=>listeners.delete(f);},dispatchMessage(_type,m){queueMicrotask(()=>{for(const f of listeners)f({message:{id:m.request.id,result:quota}});});}};
 const request=async p=>{routeCalls.push(p);switch(p.action){case 'info':return structuredClone(state);case 'usage':return quota;case 'native.status':return {ready:true,connectionId:state.nativeRoutes[p.conversationId]??'host'};case 'native.prepare':state.selected[p.conversationId]=p.connectionId;if(p.connectionId==='host')delete state.nativeRoutes[p.conversationId];else state.nativeRoutes[p.conversationId]=p.connectionId;return {ready:true,selected:p.connectionId,threadId:p.conversationId};case 'native.ensure':return {ready:true,selected:p.connectionId,threadId:p.conversationId};case 'native.detach':delete state.nativeRoutes[p.conversationId];state.selected[p.conversationId]='host';return {};case 'shared.status':return {status:'none'};case 'release':return {};default:throw Error('Unexpected request '+p.action);}};
 window.adapter=new NativeAccountAdapter(request,structuredClone(state),()=>{},async()=>({services,dispatcher}));await adapter.start();
};
`},bundle:true,format:'iife',outfile:resolve(out,'fixture.js')});
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?await readFile(resolve(out,'fixture.js')):'<!doctype html><meta charset="utf-8"><div id="fixture"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
try{
 for(const hidden of ['inert','aria-hidden="true"','inert aria-hidden="true"']){
  assert.deepEqual(await browser.evaluate(`fixture(marker('thread_aaaa')+'<div ${hidden}>'+marker('thread_bbbb')+'</div>')`),{id:'thread_aaaa',selected:'childA'});
  checks.push(`Collapsed sidebar (${hidden}) cannot replace A's identity with shared draft selection`);
 }
 assert.deepEqual(await browser.evaluate(`fixture(marker('thread_bbbb')+'<div inert>'+marker('thread_aaaa')+'</div>')`),{id:'thread_bbbb',selected:'childB'});checks.push('A to B and back resolve distinct saved account bindings using real DOM and production adapter');
 assert.deepEqual(await browser.evaluate(`fixture(marker('thread_aaaa'))`),{id:'thread_aaaa',selected:'childA'});
 assert.equal(await browser.evaluate(`fixture(marker('thread_aaaa')+marker('thread_bbbb')).id`),null);checks.push('Two genuinely active different identities remain ambiguous');
 assert.equal(await browser.evaluate(`fixture(marker('thread_aaaa')+marker('thread_aaaa')).id`),'thread_aaaa');checks.push('Repeated references to the same native thread still agree');
 assert.equal(await browser.evaluate(`fixture('<div data-app-shell-active-page="false">'+marker('thread_bbbb')+'</div>'+marker('thread_aaaa')).id`),'thread_aaaa');checks.push('Existing inactive-page filtering remains supported');
 assert.equal(await browser.evaluate(`fixture('').id`),null);assert.equal(await browser.evaluate('adapter.status().selected'),'host');checks.push('New Chat without a thread still has the separate draft default');
 await browser.evaluate(`fixture(marker('thread_aaaa')+'<div inert aria-hidden="true">'+marker('thread_bbbb')+'</div>');startRouting()`);
 await browser.evaluate(`adapter.select('childB')`);
 assert.deepEqual(await browser.evaluate(`({a:routeState.selected.thread_aaaa,b:routeState.selected.thread_bbbb,prepared:routeCalls.filter(c=>c.action==='native.prepare').map(c=>c.conversationId)})`),{a:'childB',b:'childB',prepared:['thread_aaaa']});
 checks.push('A account change uses native.prepare for real DOM thread A instead of silently mutating draft');
 await browser.evaluate(`fixture(marker('thread_bbbb')+'<div inert>'+marker('thread_aaaa')+'</div>');adapter.select('host')`);
 assert.deepEqual(await browser.evaluate(`({a:routeState.selected.thread_aaaa,b:routeState.selected.thread_bbbb})`),{a:'childB',b:'host'});
 assert.equal(await browser.evaluate(`fixture(marker('thread_aaaa')+'<div aria-hidden="true">'+marker('thread_bbbb')+'</div>').selected`),'childB');
 checks.push('A/B/A selection commits only the target route and preserves the other conversation');
 await browser.evaluate(`adapter.prepareSend()`);
 assert(await browser.evaluate(`routeCalls.some(c=>c.action==='native.ensure'&&c.conversationId==='thread_aaaa'&&c.connectionId==='childB')`));
 checks.push('Send preparation uses the same resolved thread and selected connection without generating a message');
 await browser.evaluate(`adapter.endSession()`);
 await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,scope:'Production DOM identity and adapter selection/send preparation with simulated native service; no real account authentication or remote inference'},null,2)+'\n');console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();server.close();}
