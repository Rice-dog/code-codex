import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/account-auto-adapter');await mkdir(out,{recursive:true});
await build({stdin:{contents:"export {NativeAccountAdapter} from './features/accounts/native-adapter';export {bindAccountTransport} from './features/accounts/transport';export {retireLegacyAccountAdapter} from './features/accounts/legacy-handoff';",resolveDir:resolve(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(out,'adapter.mjs'),plugins:[{name:'active-thread-fixture',setup(b){b.onResolve({filter:/active-thread$/},()=>({path:'active-thread',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const resolveActiveThread=()=>globalThis.__autoTask;'}));}}]});
globalThis.window=new EventTarget();globalThis.__autoTask='task-one';
const {NativeAccountAdapter,bindAccountTransport,retireLegacyAccountAdapter}=await import(pathToFileURL(resolve(out,'adapter.mjs'))),checks=[];
const quota=(five=50,week=50)=>({rateLimits:{limitId:'codex',primary:{usedPercent:100-five,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:100-week,windowDurationMins:10080,resetsAt:Math.floor(Date.now()/1000)+86400}}});
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('Fixture wait expired');};
async function fixture(cold=false){
 globalThis.__autoTask='task-one';
 const calls=[],sends=[],notices=[],queues=new Map(),quotas=new Map([['host',quota()],['B',quota()],['C',quota()]]),subscribers=new Set();
 const state={owner:{id:'owner',label:'host@example.test'},profile:{initial:'./assets/fixture.js',shared:'./assets/shared.js',managerExport:'Manager',dispatcherExport:'dispatcher'},connections:[{id:'B',label:'B',email:'B@example.test'},{id:'C',label:'C',email:'C@example.test'}],selected:{},activeConversations:[],sharedConversations:[]};
 let turn=0,sequence=0,quotaGate,prepareGate,unknownOutcome=false,rejectSend=false,eventFailure=false;
 const accepted=(id,params,account)=>{if(rejectSend)throw Error('ACCOUNT_OUTCOME_UNKNOWN: Delivery could not be confirmed');const t={id:'turn-'+(++turn),status:'inProgress'};sends.push({id,account,params:structuredClone(params),turnId:t.id});return {turn:t};};
 const request=async p=>{
  calls.push(structuredClone(p));
  if(p.action==='info')return structuredClone(state);
  assert.equal(p.owner,state.owner.id);
  if(p.action==='usage'){if(quotaGate)await quotaGate;return quotas.get(p.connectionId)??{};}
  if(p.action==='release')return {};
  if(p.action==='select'){state.selected[p.conversationId]=p.connectionId;return {};}
  if(p.action==='shared.status')return {status:'preparing',phase:'authenticate',progress:65,elapsedMs:10,operationId:9};
  if(p.action==='shared.prepare'){if(prepareGate)await prepareGate;state.selected[p.conversationId]=p.connectionId;state.sharedConversations=[...new Set([...state.sharedConversations,p.conversationId])];return {threadId:p.conversationId,cursor:sequence};}
  if(p.action==='shared.reconcile')return {reconciled:true,executorReusable:true,previousOutcome:unknownOutcome?'unverified':undefined};
  if(p.action==='shared.events'){if(eventFailure){eventFailure=false;throw Error('ACCOUNT_TRANSPORT_HANDOFF: A legacy release is pending');}const events=(queues.get(p.conversationId)??[]).filter(e=>e.sequence>p.after);for(const e of events)if(e.message.method==='turn/completed')state.activeConversations=state.activeConversations.filter(id=>id!==p.conversationId);return {events,cursor:events.at(-1)?.sequence??p.after,disconnected:false};}
  if(p.action==='shared.rpc'){if(p.method==='turn/start'){state.activeConversations=[...new Set([...state.activeConversations,p.conversationId])];return accepted(p.conversationId,p.params,state.selected[p.conversationId]);}return {};}
  if(p.action==='shared.stop'){state.activeConversations=[];return {stopped:true,executorReusable:false,cursor:sequence,previousOutcome:'stopped',operationId:3};}
  throw Error('Unexpected action '+p.action);
 };
 const dispatcher={subscribe(_type,f){subscribers.add(f);return()=>subscribers.delete(f);},dispatchMessage(type,m){if(type==='mcp-request'&&m.request.method==='account/rateLimits/read')queueMicrotask(()=>{for(const f of subscribers)f({message:{id:m.request.id,result:quotas.get('host')}});});}};
 class Manager{
  hostId='local';conversations=new Map(['task-one','task-two'].map(id=>[id,{id,turns:[],latestThreadSettings:{activePermissionProfile:{id:':danger-full-access'},sandboxPolicy:{type:'dangerFullAccess'}}}]));
  requestClient={sendRequest:async(method,params)=>method==='turn/start'?accepted(params.threadId,params,'host'):{}};
  getConversation(id){return this.conversations.get(id);}
  executeTurnStart=async(id,op)=>{const r=await this.requestClient.sendRequest('turn/start',op.request);this.conversations.get(id).turns.push({turnId:r.turn.id,status:'inProgress',items:[]});return r;};
  startTurn(id,op){return this.executeTurnStart(id,op);}
  getStreamRole(){return {role:'owner'};}
  onNotification(method,p){if(method==='turn/completed'){const t=this.conversations.get(p.threadId)?.turns.find(t=>t.turnId===p.turn.id);if(t)t.status=p.turn.status;}}
  sendAppServerResponse(){}onRequest(){}
 }
 const port=bindAccountTransport(request,'fixture-live-endpoint');
 const adapter=new NativeAccountAdapter(port,structuredClone(state),m=>notices.push(m),async()=>({Manager,dispatcher}));await adapter.start();window[Symbol.for('code-codex:multi-account-runtime:v1')]={adapter,selector:{dispose(){}}};window[Symbol.for('code-codex:accounts-capability:v1')]={request:port};const manager=new Manager();if(!cold)manager.getConversation('task-one');await wait(()=>adapter.usage.remaining('B').fiveHour===50);
 const input={request:{threadId:'task-one',input:[{type:'text',text:'ORIGINAL_TASK_PRIVATE'}],model:'fixture-model',effort:'high',clientUserMessageId:'manual-id'},context:{restoreMessage:()=>{throw Error('Old callback must never be replayed');}}};
 const complete=(status='completed',code,thread='task-one',turnId=sends.filter(s=>s.id===thread).at(-1)?.turnId)=>{const message={method:'turn/completed',params:{threadId:thread,turn:{id:turnId,status,error:code?{codexErrorInfo:code}:null}}};if(state.sharedConversations.includes(thread)){const q=queues.get(thread)??[];q.push({sequence:++sequence,message});queues.set(thread,q);}else manager.onNotification(message.method,message.params);};
 const cleanup=async()=>{if(!window[Symbol.for('code-codex:multi-account-runtime:v1')]?.adapter)return;adapter.setAutoContinue(false);rejectSend=false;quotaGate=undefined;prepareGate=undefined;for(const id of ['task-one','task-two']){const last=sends.filter(s=>s.id===id).at(-1);if(last)complete('completed',undefined,id,last.turnId);}await wait(()=>adapter.canDisable());await adapter.dispose();};
 return {adapter,port,request,manager,state,failEvents:()=>{eventFailure=true;},calls,sends,notices,quotas,input,complete,cleanup,setQuotaGate:p=>{quotaGate=p;},setPrepareGate:p=>{prepareGate=p;},unverified:()=>{unknownOutcome=true;},rejectSend:()=>{rejectSend=true;}};
}
const test=async(name,run)=>{const f=await fixture();try{await run(f);checks.push(name);}finally{await f.cleanup();}};
{
 const f=await fixture(true);try{
  await assert.rejects(()=>f.adapter.select('B'),/ACCOUNT_MANAGER_UNOBSERVED/);assert.equal(f.state.selected['task-one'],undefined);assert.equal(f.calls.filter(c=>c.action==='select'||c.action==='shared.prepare').length,0);checks.push('A cold unobserved manager cannot silently save a child selection without a prepared route');
  f.state.selected['task-one']='B';f.adapter.updateInfo(structuredClone(f.state));await f.manager.startTurn('task-one',f.input);assert.equal(f.sends[0].account,'B');checks.push('The first startTurn attaches a cold manager before execution and never falls through to host');f.complete();
 }finally{await f.cleanup();}
}
{
 const f=await fixture(true);try{f.manager.onNotification('account/rateLimits/updated',quota(84,34));assert.equal(f.adapter.usage.remaining('host').fiveHour,84);checks.push('The first native notification attaches the cold manager and consumes its quota update');}finally{await f.cleanup();}
}
await test('Default off never retries a quota failure',async f=>{await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);f.complete('failed','usageLimitExceeded');await wait(()=>!f.adapter.status().busy);assert.equal(f.sends.length,1);});
await test('Starting at B skips empty C then prepares host before one same-thread continuation',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');f.quotas.set('C',quota(0,50));await f.manager.startTurn('task-one',f.input);const at=f.calls.length;f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);assert.deepEqual(f.sends.map(s=>s.account),['B','host']);const op=f.sends[1];assert.equal(op.id,'task-one');assert.equal(op.params.model,'fixture-model');assert.equal(op.params.effort,'high');assert(!JSON.stringify(op.params).includes('ORIGINAL_TASK_PRIVATE'));assert.notEqual(op.params.clientUserMessageId,'manual-id');const actions=f.calls.slice(at);assert(actions.some(c=>c.action==='usage'&&c.connectionId==='C'));assert(!actions.some(c=>c.action==='shared.prepare'&&c.connectionId==='C'));assert.equal(actions.find(c=>c.action==='shared.prepare').settings.permissions,':danger-full-access');f.complete();await wait(()=>f.adapter.canDisable());assert.equal(f.sends.length,2);});
await test('C to host to B traverses once and stops on the next quota failure',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('C');await f.manager.startTurn('task-one',f.input);f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===3);f.complete('failed','usageLimitExceeded');await wait(()=>f.notices.some(m=>m.startsWith('ACCOUNT_AUTO_NO_QUOTA')));assert.deepEqual(f.sends.map(s=>s.account),['C','host','B']);assert.equal(f.notices.filter(m=>m.startsWith('ACCOUNT_AUTO_NO_QUOTA')).length,1);});
await test('An unshared host task can promote to the same shared conversation after quota failure',async f=>{f.adapter.setAutoContinue(true);await f.manager.startTurn('task-one',f.input);f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);assert.deepEqual(f.sends.map(s=>s.account),['host','B']);assert(f.state.sharedConversations.includes('task-one'));});
await test('Normal failure and request throttling do not trigger quota continuation',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');for(const code of ['rateLimitExceeded','internalServerError']){await f.manager.startTurn('task-one',f.input);f.complete('failed',code);await wait(()=>!f.adapter.status().busy);}assert.equal(f.sends.length,2);});
await test('Stopping while quota preflight waits cancels before any continuation',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);let release;f.setQuotaGate(new Promise(r=>release=r));f.complete('failed','usageLimitExceeded');await wait(()=>f.adapter.autoStatus()==='checking');await f.manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one',turnId:f.sends[0].turnId});release();await wait(()=>!f.adapter.status().busy);assert.equal(f.sends.length,1);});
await test('Switching opt-in off during committed preparation prevents sending and retains accurate selection',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);let release;f.setPrepareGate(new Promise(r=>release=r));f.complete('failed','usageLimitExceeded');await wait(()=>f.adapter.autoStatus()==='preparing');f.adapter.setAutoContinue(false);release();await wait(()=>!f.adapter.status().busy);assert.equal(f.sends.length,1);assert.equal(f.adapter.status().selected,f.state.selected['task-one']);});
await test('Duplicate old terminal notification cannot start a second continuation',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);const old=f.sends[0].turnId;f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);f.complete('failed','usageLimitExceeded','task-one',old);await new Promise(r=>setTimeout(r,450));assert.equal(f.sends.length,2);});
await test('All remaining exhausted or unknown quota accounts cause no trial inference',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');f.quotas.set('C',{});f.quotas.set('host',quota(0,50));await f.manager.startTurn('task-one',f.input);f.complete('failed','usageLimitExceeded');await wait(()=>f.notices.some(m=>m.startsWith('ACCOUNT_AUTO_NO_QUOTA')));assert.equal(f.sends.length,1);});
await test('Unverified prior execution outcome blocks automatic preparation and sending',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);f.unverified();f.complete('failed','usageLimitExceeded');await wait(()=>f.notices.some(m=>m.includes('ACCOUNT_AUTO_OUTCOME_UNVERIFIED')));assert.equal(f.sends.length,1);assert.equal(f.adapter.status().selected,'B');});
await test('Navigation does not redirect continuation to a different conversation',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);globalThis.__autoTask='task-two';f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);assert(f.sends.every(s=>s.id==='task-one'));});
await test('A quota terminal arriving after explicit user Stop cannot recreate an auto cycle',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);const id=f.sends[0].turnId;await f.manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one',turnId:id});f.complete('failed','usageLimitExceeded','task-one',id);await new Promise(r=>setTimeout(r,450));assert.equal(f.sends.length,1);});
await test('Owner changes while quota is read cancel the traversal without using another identity',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);let release;f.setQuotaGate(new Promise(r=>release=r));f.complete('failed','usageLimitExceeded');await wait(()=>f.adapter.autoStatus()==='checking');f.state.owner.id='new-owner';release();await wait(()=>!f.adapter.status().busy);assert.equal(f.sends.length,1);f.state.owner.id='owner';});
await test('Unknown continuation delivery never falls through to another account',async f=>{f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);f.rejectSend();f.complete('failed','usageLimitExceeded');await wait(()=>f.notices.some(m=>m.includes('ACCOUNT_OUTCOME_UNKNOWN')));await new Promise(r=>setTimeout(r,400));assert.equal(f.sends.length,1);assert.equal(f.calls.filter(c=>c.action==='shared.prepare').length,2);await f.manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one'});});
await test('Upgrade waits through host quota exhaustion and child preparation; same-thread continuation completes before release',async f=>{
 f.adapter.setAutoContinue(true);await f.manager.startTurn('task-one',f.input);
 const noCandidate=async()=>{throw Error('Candidate must not acquire a running executor');};
 await assert.rejects(()=>retireLegacyAccountAdapter(noCandidate),/ACCOUNT_UPGRADE_ACTIVE/);
 assert.equal(f.calls.filter(c=>c.action==='release').length,0);
 let release;f.setQuotaGate(new Promise(r=>release=r));f.complete('failed','usageLimitExceeded');
 await wait(()=>f.adapter.autoStatus()==='checking');assert.equal(f.adapter.handoffStatus().reason,'quota-continuation');
 await assert.rejects(()=>retireLegacyAccountAdapter(noCandidate),/ACCOUNT_UPGRADE_ACTIVE/);
 assert.equal(f.calls.filter(c=>c.action==='release').length,0);
 release();await wait(()=>f.sends.length===2);assert.deepEqual(f.sends.map(s=>s.account),['host','B']);
 assert.equal(f.adapter.handoffStatus().reason,'active-turn');
 f.complete();await wait(()=>!f.adapter.handoffStatus().busy);
 await retireLegacyAccountAdapter(async p=>p.action==='info'?{...structuredClone(f.state),sharedConversations:[]}:{});
 assert.equal(f.calls.filter(c=>c.action==='release').length,1);
 await assert.rejects(()=>f.port({action:'info'}),/ACCOUNT_TRANSPORT_RETIRED/);
});
await test('An upgrade deferral leaves actual event consumption and explicit Stop usable on a child account',async f=>{
 await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);
 for(let i=0;i<4;i++)await assert.rejects(()=>retireLegacyAccountAdapter(),/ACCOUNT_UPGRADE_ACTIVE/);
 await f.manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one',turnId:f.sends[0].turnId});
 assert(f.calls.some(c=>c.action==='shared.stop'));assert.equal(f.sends.length,1);
 await wait(()=>!f.adapter.handoffStatus().busy);
});
await test('A running task on another conversation blocks upgrade even when the viewed conversation is idle',async f=>{
 await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);globalThis.__autoTask='task-two';
 assert.equal(f.adapter.status().busy,false);assert.equal(f.adapter.handoffStatus().busy,true);
 await assert.rejects(()=>retireLegacyAccountAdapter(),/ACCOUNT_UPGRADE_ACTIVE/);
 f.complete();await wait(()=>!f.adapter.handoffStatus().busy);
});
await test('A transient legacy handoff event-read failure recovers the same cursor and consumes the quota terminal once',async f=>{
 f.adapter.setAutoContinue(true);await f.adapter.select('B');await f.manager.startTurn('task-one',f.input);
 f.failEvents();f.complete('failed','usageLimitExceeded');await wait(()=>f.sends.length===2);
 assert.deepEqual(f.sends.map(s=>s.account),['B','C']);
 const reads=f.calls.filter(c=>c.action==='shared.events');assert(reads.length>=2);assert.equal(reads[0].after,reads[1].after);
 f.complete();await wait(()=>!f.adapter.handoffStatus().busy);assert.equal(f.sends.length,2);
});
await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production native adapter, bounded cycle, quota store and permission projection with deterministic native host/Bridge ports; no actual inference',checks},null,2));console.log(JSON.stringify({passed:true,checks}));
