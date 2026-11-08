import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/account-query-isolation');await mkdir(out,{recursive:true});
await build({entryPoints:[resolve(root,'packages/explorer-ui/src/features/accounts/native-adapter.ts')],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'adapter.mjs'),plugins:[{name:'active-fixture',setup(b){b.onResolve({filter:/active-thread$/},()=>({path:'active-thread',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const resolveActiveThread=()=>globalThis.auditThread??"task";'}));}}]});
globalThis.window=new EventTarget();
const {NativeAccountAdapter}=await import(pathToFileURL(resolve(out,'adapter.mjs'))),checks=[];
async function fixture(){
 const calls=[],notices=[],events=[];let seq=0,turn=0,active=false,gate,reconcileError,eventError,eventGate,exited=false;
 const state={owner:{id:'owner',label:'fixture'},profile:{initial:'./assets/app-initial-fixture.js',shared:'./assets/app-shared-fixture.js',managerExport:'Manager',dispatcherExport:'dispatcher'},connections:[{id:'B',email:'B@test'}],selected:{task:'B',task2:'B'},sharedConversations:['task','task2'],activeConversations:[]};
 const request=async p=>{calls.push(p);if(p.action==='info')return structuredClone(state);if(p.action==='usage')return {};if(p.action==='release')return {};
  if(p.action==='shared.reconcile'){if(gate)await gate;if(reconcileError)throw typeof reconcileError==='string'?Error(reconcileError):reconcileError;if(active)throw Error('ACCOUNT_TURN_ACTIVE: Backend still active');state.activeConversations=[];return {reconciled:true,executorReusable:!exited,...exited?{previousOutcome:'unverified'}:{}};}
  if(p.action==='shared.prepare'){state.selected[p.conversationId]=p.connectionId;exited=false;return {threadId:p.conversationId,cursor:seq};}
  if(p.action==='shared.events'){const result={events:events.filter(e=>e.sequence>p.after),cursor:seq,disconnected:false};if(eventGate&&p.conversationId==='task')await eventGate;if(eventError)throw eventError;return result;}
  if(p.action==='shared.stop'){active=false;state.activeConversations=[];return {stopped:true,executorReusable:false,cursor:seq,previousOutcome:'stopped',operationId:7};}
  if(p.action==='shared.rpc'&&p.method==='turn/start'){assert(!active,'No concurrent backend turn');active=true;state.activeConversations=['task'];return {turn:{id:'turn-'+(++turn),status:'inProgress'}};}
  throw Error('Unexpected fixture action '+p.action);
 };
 const subscribers=new Set(),dispatcher={subscribe(_t,f){subscribers.add(f);return()=>subscribers.delete(f);},dispatchMessage(type,m){if(type==='mcp-request')queueMicrotask(()=>{for(const f of subscribers)f({message:{id:m.request.id,result:{}}});});}};
 class Manager{
  hostId='local';c={id:'task',turns:[],turnHistory:{kind:'canonical',history:{islands:[{entries:[{value:'old'},{value:'done'}]}],entitiesByKey:{old:{turnId:'old-stale',status:'inProgress',items:[]},done:{turnId:'newer-complete',status:'completed',items:[]}}}}};
  requestClient={sendRequest:async()=>{throw Error('No host fallback');}};
  c2={id:'task2',turns:[]};getConversation(id='task'){return id==='task2'?this.c2:this.c;}getStreamRole(){return {role:'owner'};}
  startTurn(id,op){return this.executeTurnStart(id,op);}
  executeTurnStart=async(id,op)=>{const r=await this.requestClient.sendRequest('turn/start',op.request);this.getConversation(id).turns.push({turnId:r.turn.id,status:'inProgress',items:[]});return r;};
  updateConversationState(id,fn){fn(this.getConversation(id));}
  onNotification(method,p){if(method==='turn/completed'){const t=this.c.turns.find(t=>t.turnId===p.turn.id);if(t)t.status=p.turn.status;}}
  onRequest(){}sendAppServerResponse(){}
 }
 const manager=new Manager(),adapter=new NativeAccountAdapter(request,structuredClone(state),m=>notices.push(m),async()=>({Manager,dispatcher}));await adapter.start();manager.getConversation();
 const input={request:{threadId:'task',input:[{type:'text',text:'fixture'}]}};
 const complete=(notify=true)=>{active=false;state.activeConversations=[];if(notify)events.push({sequence:++seq,message:{method:'turn/completed',params:{threadId:'task',turn:{id:'turn-'+turn,status:'completed'}}}});};
 return {adapter,manager,input,calls,notices,state,events,complete,setEventError:v=>{eventError=v;},setEventGate:v=>{eventGate=v;},setActive:v=>{active=v;},setGate:v=>{gate=v;},setError:v=>{reconcileError=v;},setExited:()=>{exited=true;},async close(){active=false;gate=undefined;reconcileError=undefined;eventError=undefined;eventGate=undefined;await manager.requestClient.sendRequest('turn/interrupt',{threadId:'task'}).catch(()=>{});await adapter.dispose();}};
}

const f=await fixture();
try{
 let uiEvents=0;const uiChanged=()=>uiEvents++;window.addEventListener('code-codex:accounts-state-changed',uiChanged);
 f.adapter.changed();uiEvents=0;for(let i=0;i<100;i++)f.adapter.changed();assert.equal(uiEvents,0);checks.push('Unchanged native polling observations do not emit UI notifications');
 f.adapter.setAutoContinue(true);assert.equal(uiEvents,1);f.adapter.setAutoContinue(true);assert.equal(uiEvents,1);f.adapter.setAutoContinue(false);assert.equal(uiEvents,2);checks.push('Actual automatic-continuation preference transitions still notify the UI');
 window.removeEventListener('code-codex:accounts-state-changed',uiChanged);
 globalThis.auditThread='task';await f.adapter.select('B');globalThis.auditThread='task2';await f.adapter.select('B');
 let release;f.setEventGate(new Promise(r=>release=r));
 await new Promise(r=>setTimeout(r,900));
 assert(f.calls.some(c=>c.action==='shared.events'&&c.conversationId==='task2'),'The second conversation must be observed while the first read is pending');
 assert.equal(f.calls.filter(c=>c.action==='shared.events'&&c.conversationId==='task').length,1,'A pending conversation must remain single-flight');
 checks.push('One delayed conversation cannot block another conversation event stream');checks.push('The delayed conversation remains single-flight');
 release();f.setEventGate(undefined);await new Promise(r=>setTimeout(r,400));
 assert(f.calls.filter(c=>c.action==='shared.events'&&c.conversationId==='task').length>=2);checks.push('Recovered conversation resumes its cursor lane');
 await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production adapter with two native-manager fixture conversations and a controlled delayed read; no inference',checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{delete globalThis.auditThread;await f.close();}
