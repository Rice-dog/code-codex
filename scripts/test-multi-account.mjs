import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Exercise production adapter/state conversion with a deterministic native port.
// This is a protocol fixture, not proof of the original GUI Send integration.
const root=resolve(import.meta.dirname,'..'),folder=await mkdtemp(join(tmpdir(),'CodeCodex-Accounts-Test-'));
try{
 const path=join(folder,'adapter.mjs');
 await build({entryPoints:[resolve(root,'packages/explorer-ui/src/features/accounts/native-adapter.ts')],bundle:true,platform:'node',format:'esm',outfile:path,plugins:[{name:'active-task-fixture',setup(b){b.onResolve({filter:/active-thread$/},()=>({path:'active-thread',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const resolveActiveThread=()=>globalThis.__accountTestTask;'}));}}]});
 globalThis.window=new EventTarget();globalThis.__accountTestTask='task-one';
 const {NativeAccountAdapter}=await import(pathToFileURL(path));
 const calls=[],notices=[],checks=[];
 const state={owner:{id:'owner-one',label:'fixture'},profile:{initial:'./assets/native-fixture.js',shared:'./assets/shared-fixture.js',managerExport:'Manager',dispatcherExport:'dispatcher'},connections:[{id:'B',label:'B',email:'fixture-B'},{id:'C',label:'C',email:'fixture-C'}],selected:{},activeConversations:[],sharedConversations:[]};
 const queues=new Map();let sequence=0,turn=0;let rejectPreparation=false,preparationWait,gap=false,stopRejected=false;
 const request=async p=>{
  calls.push(structuredClone(p));
  if(p.action==='info')return structuredClone(state);
  if(p.action==='release')return {released:true};
  if(p.action==='usage')return {rateLimits:{limitId:'codex',primary:{usedPercent:p.connectionId==='B'?25:55,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600}}};
  assert.equal(p.owner,state.owner.id);
  if(p.action==='select'){state.selected[p.conversationId]=p.connectionId;return {};}
  if(p.action==='shared.status')return {status:'preparing',phase:'authenticate',progress:65,elapsedMs:1100,operationId:42};
  if(p.action==='shared.prepare'){if(preparationWait)await preparationWait;if(rejectPreparation)throw Error('ACCOUNT_TEST_PREPARATION_FAILED');state.selected[p.conversationId]=p.connectionId;if(!state.sharedConversations.includes(p.conversationId))state.sharedConversations.push(p.conversationId);return {threadId:p.conversationId,cursor:sequence};}
  if(p.action==='shared.events'){if(gap)throw Error('ACCOUNT_EVENT_GAP: after=3; oldest=5000; queuedEvents=4096');const all=(queues.get(p.conversationId)??[]).filter(e=>e.sequence>p.after),events=all.slice(0,2);return {events,cursor:events.at(-1)?.sequence??p.after,disconnected:false,hasMore:events.length<all.length};}
  if(p.action==='shared.reply')return {sent:true};
  if(p.action==='shared.stop'){if(stopRejected)throw Error('ACCOUNT_STOP_UNCONFIRMED: operationId=55');return {stopped:true,executorReusable:false,cursor:sequence,previousOutcome:'unverified',operationId:55};}
  if(p.action==='shared.reconcile')return {reconciled:true,executorReusable:true,cursor:sequence};
  if(p.action==='shared.rpc'){assert.equal(p.params.threadId,p.conversationId);if(p.method==='turn/start'){turn++;return {turn:{id:'turn-'+turn,status:'inProgress'}};}return {};}
  throw Error('Unexpected fixture action '+p.action);
 };
 let hostReads=0;const subscribers=new Set();const dispatcher={subscribe:(_type,fn)=>{subscribers.add(fn);return()=>subscribers.delete(fn);},dispatchMessage(type,message){if(type==='mcp-request'&&message.request.method==='account/rateLimits/read'){hostReads++;queueMicrotask(()=>{for(const fn of subscribers)fn({message:{id:message.request.id,result:{rateLimits:{limitId:'codex',primary:{usedPercent:30,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600}}}}});});}}};
 class Manager{
  hostId='local';conversations=new Map([['task-one',{id:'task-one',cwd:'C:/fixture',turns:[],turnHistory:{kind:'canonical',history:{islands:[],entitiesByKey:{large:{items:[{text:'x'.repeat(2_000_000)}]}}}}}],['task-two',{id:'task-two',cwd:'C:/fixture',turns:[]}]]);
  requestClient={sendRequest:async(method,params)=>{calls.push({host:true,method,params});return {turn:{id:'host-turn'}};}};
  executeTurnStart=async(id,op)=>{const r=await this.requestClient.sendRequest('turn/start',op.request);this.conversations.get(id).turns.push({turnId:r.turn.id,status:'inProgress',items:[]});return r;};
  getConversation(id){return this.conversations.get(id);}
  getStreamRole(){return {role:'follower',ownerClientId:'fixture-native-owner'};}
  startTurn(id,op){return this.executeTurnStart(id,op);}
  onNotification(method,p){if(method==='turn/completed'){const c=this.getConversation(p.threadId);c.turns.find(t=>t.turnId===p.turn.id).status=p.turn.status;}}
  onRequest(){}
  sendAppServerResponse(){}
 }
 const original=Manager.prototype.getConversation,manager=new Manager();
 const adapter=new NativeAccountAdapter(request,structuredClone(state),message=>notices.push(message),async()=>({Manager,dispatcher}));
 await adapter.start();manager.getConversation('task-one');
 await new Promise(r=>setTimeout(r,20));assert.equal(adapter.usage.remaining('B').fiveHour,75);assert.equal(adapter.usage.remaining('C').fiveHour,45);checks.push('All signed-in children have independent initial quotas');
 const op={request:{threadId:'task-one',input:[{type:'text',text:'fixture'}],model:'test'}};
 async function complete(status='completed'){
  const id='turn-'+turn;queues.set('task-one',[...(queues.get('task-one')??[]),{sequence:++sequence,message:{method:'turn/completed',params:{threadId:'task-one',turn:{id,status}}}}]);await new Promise(r=>setTimeout(r,550));
 }
 manager.getConversation('task-one').latestThreadSettings={approvalPolicy:'never',activePermissionProfile:{id:':danger-full-access'},sandboxPolicy:{type:'dangerFullAccess'}};
 await adapter.select('B');const preparedBeforeSend=calls.filter(c=>c.action==='shared.prepare').length;assert.equal(preparedBeforeSend,1);await manager.startTurn('task-one',op);assert.equal(calls.filter(c=>c.action==='shared.prepare').length,preparedBeforeSend);checks.push('Account preparation completes at selection, not after Send');const preparedSettings=calls.find(c=>c.action==='shared.prepare').settings;assert.equal(preparedSettings.permissions,':danger-full-access');assert.equal(preparedSettings.sandboxPolicy,undefined);checks.push('Resolved native sandbox does not conflict with the selected colon-prefixed profile');
 assert.equal(calls.filter(c=>c.host&&c.method==='turn/start').length,0);assert.equal(calls.filter(c=>c.action==='shared.prepare').at(-1).connectionId,'B');checks.push('B Send resumes the same logical ID; no original-host fallback');
 await assert.rejects(()=>adapter.select('C'),/TURN_ACTIVE/);await assert.rejects(()=>adapter.useOfficialIdentity(),/TURN_ACTIVE/);checks.push('Switch and disable reject a running shared turn');
 await complete();assert.equal(adapter.status().busy,false);
 await manager.requestClient.sendRequest('thread/settings/update',{threadId:'task-one',approvalPolicy:'never',sandboxPolicy:{type:'dangerFullAccess'}});assert.equal(calls.at(-1).method,'thread/settings/update');checks.push('Native permission changes reach the same shared executor');
 for(const method of ['thread/queue/list','thread/queue/add','thread/queue/update','thread/queue/delete','thread/queue/reorder','thread/goal/set']){await manager.requestClient.sendRequest(method,{threadId:'task-one',input:[],status:'paused'});assert.equal(calls.at(-1).method,method);}checks.push('Native queued follow-ups and Stop goal-pause controls route to the same selected executor');
 await manager.startTurn('task-one',op);await complete('failed');assert.equal(adapter.status().busy,false);checks.push('A quota-exhausted failed terminal turn unlocks explicit account selection');
 queues.set('task-one',[{sequence:++sequence,message:{method:'account/rateLimits/updated',params:{rateLimits:{limitId:'codex',primary:{usedPercent:47,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600}}}}}]);await new Promise(r=>setTimeout(r,500));assert.equal(adapter.usage.remaining('B').fiveHour,53);checks.push('Executor quota notifications without a thread ID update the matching child immediately');
 await adapter.select('C');await manager.startTurn('task-one',op);assert.equal(adapter.status().busy,true);
 for(let i=0;i<8;i++)queues.set('task-one',[...(queues.get('task-one')??[]),{sequence:++sequence,message:{method:'account/rateLimits/updated',params:{rateLimits:{limitId:'codex',primary:{usedPercent:10+i,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600}}}}}]);await new Promise(r=>setTimeout(r,500));assert.equal(adapter.usage.remaining('C').fiveHour,83);checks.push('A multi-page notification burst drains within a poll and attributes usage to its selected account');
 gap=true;await new Promise(r=>setTimeout(r,500));const gapCalls=calls.filter(c=>c.action==='shared.events').length;await new Promise(r=>setTimeout(r,800));assert.equal(calls.filter(c=>c.action==='shared.events').length,gapCalls);assert.match(adapter.status().error,/ACCOUNT_EVENT_GAP/);checks.push('A stream gap records evidence once instead of retrying an obsolete cursor forever');
 stopRejected=true;await assert.rejects(()=>manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one',turnId:'turn-'+turn}),/STOP_UNCONFIRMED/);assert.equal(adapter.status().busy,true);stopRejected=false;
 checks.push('Unconfirmed Stop retains the running lock and permits a later explicit Stop');
 await manager.requestClient.sendRequest('thread/backgroundTerminals/clean',{threadId:'task-one'});assert.equal(calls.at(-1).method,'thread/backgroundTerminals/clean');
 await manager.requestClient.sendRequest('turn/interrupt',{threadId:'task-one',turnId:'turn-'+turn});assert(calls.some(c=>c.action==='shared.stop'&&c.conversationId==='task-one'));assert.equal(adapter.status().busy,false);assert.equal(adapter.status().selected,'C');gap=false;checks.push('Explicit native Stop clears UI/native locks after owned-executor exit and permits account switch without a terminal event');
 rejectPreparation=true;await assert.rejects(()=>adapter.select('B'),/PREPARATION_FAILED/);assert.equal(adapter.status().selected,'C');assert.equal(adapter.status().preparing,false);assert.equal(adapter.status().progress,0);assert.match(adapter.status().error,/PREPARATION_FAILED/);rejectPreparation=false;checks.push('Failed preparation retains the last selected identity and allows a clean retry');
 await adapter.select('host');await manager.startTurn('task-one',op);assert.equal(calls.filter(c=>c.action==='shared.prepare').at(-1).connectionId,'host');await complete();checks.push('Return to official identity retains the same shared executor and history');
 assert(!calls.some(c=>/snapshot|^rpc$/.test(c.action??'')||['thread/start','thread/inject_items'].includes(c.method)));assert(Math.max(...calls.map(c=>JSON.stringify(c).length))<2000);checks.push('Two-megabyte history is never serialized or copied through Bridge');
 let unblock;preparationWait=new Promise(r=>unblock=r);const switching=adapter.select('B');assert(adapter.status().preparing);assert.deepEqual(adapter.status().selectionTarget,{id:'B',conversationId:'task-one'});assert.equal(adapter.canDisable(),false);const settings=manager.requestClient.sendRequest('thread/settings/update',{threadId:'task-one',approvalPolicy:'never',sandboxPolicy:{type:'dangerFullAccess'}});await new Promise(r=>setTimeout(r,850));assert.equal(adapter.status().progress,65);assert.equal(adapter.status().preparation.phase,'authenticate');assert.equal(adapter.status().preparation.operationId,42);unblock();await switching;await settings;assert.equal(adapter.status().selectionTarget,undefined);preparationWait=undefined;assert.equal(calls.at(-1).method,'thread/settings/update');checks.push('Native stage evidence targets the requested account and clears after preparation while settings queue safely');
 await adapter.useOfficialIdentity();await manager.startTurn('task-one',op);await complete();checks.push('Disabled selection keeps routing shared conversation through official identity');
 globalThis.__accountTestTask='task-two';manager.getConversation('task-two');assert.equal(adapter.status().selected,'host');checks.push('Other conversations retain independent selections');
 await adapter.dispose();assert.equal(Manager.prototype.getConversation,original);assert.equal(manager.getStreamRole('task-one').role,'follower');checks.push('Idle cleanup restores native methods');
 globalThis.__accountTestTask='task-two';const inherited=new Manager();inherited.conversations.get('task-two').turns.push({turnId:'inherited-native-turn',status:'inProgress',items:[]});const inheritedAdapter=new NativeAccountAdapter(request,structuredClone(state),()=>{},async()=>({Manager,dispatcher}));await inheritedAdapter.start();inherited.getConversation('task-two');await new Promise(r=>setTimeout(r,450));const beforeCompletion=hostReads;inherited.conversations.get('task-two').turns[0].status='completed';await new Promise(r=>setTimeout(r,500));assert.equal(hostReads,beforeCompletion+1);await inheritedAdapter.dispose();checks.push('A native turn already running before hot activation refreshes quota on completion without being restarted');
 const context=join(folder,'context.mjs');await build({entryPoints:[resolve(root,'packages/explorer-ui/src/features/accounts/context.ts')],bundle:true,platform:'node',format:'esm',outfile:context});
 const {conversationTurns,turnIsActive,normalizeSelection,...removed}=await import(pathToFileURL(context));assert.deepEqual(removed,{});
 const canonical={id:'native',turns:[],turnHistory:{kind:'canonical',history:{islands:[{entries:[{value:'turn-key'}]}],entitiesByKey:{'turn-key':{turnId:'canonical-turn',status:'inProgress'}}}}};assert(turnIsActive(canonical));assert.equal(conversationTurns(canonical).length,1);assert.throws(()=>normalizeSelection('missing',state.connections),/CONNECTION_MISSING/);checks.push('Native canonical status remains authoritative; deleted snapshot API is absent');
 console.log(JSON.stringify({passed:true,scope:'production adapter with deterministic native ports; not funded inference',checks}));
}finally{await rm(folder,{recursive:true,force:true});delete globalThis.__accountTestTask;}
