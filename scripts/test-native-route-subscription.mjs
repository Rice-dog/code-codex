import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=await readFile('crates/launcher/src/accounts/native_route.js','utf8');
const originalPerformance=globalThis.performance,originalTimeout=globalThis.setTimeout;
let clock=0,active=false,ack='unsubscribed',retainedUntil=0,brokenList=false,brokenResume=false,viewReady=true,requests=[];
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
globalThis.setTimeout=(fn,delay)=>originalTimeout(()=>{clock+=delay;fn();},0);
globalThis.window=globalThis;
const pins=new Map();window[Symbol.for('code-codex:native-account-pins:v1')]=pins;
const lease=()=>({dup(){return this;},onRpcBroken(){},[Symbol.dispose](){}});
const manager={...lease(),getThreadExecutionState:async()=>({inProgress:active}),getCachedConversationMetadata:async()=>({modelProvider:'openai'}),getCurrentPermissions:async()=>({approvalPolicy:'never'}),getFollowUpContext:async()=>({needsResume:false,resumeState:'resumed'}),getHostId:async()=> 'local',updateThreadPermissions:async()=>{},resumeConversation:async()=>({status:viewReady?'ready':'not-ready'}),retainActiveConversation:()=>Promise.resolve(lease()),subscribe:()=>Promise.resolve(lease()),sendRequest:async(method,p)=>{
 requests.push({method,p});
 if(method==='thread/read')return {thread:{id:'task',path:'C:/sessions/task',cwd:'C:/project'}};
 if(method==='thread/unsubscribe')return ack===undefined?{}:{status:ack};
 if(method==='thread/loaded/list')return brokenList?{invalid:true}:{data:clock<retainedUntil?['task']:[],nextCursor:null};
 if(method==='thread/resume'){if(brokenResume)throw Error('fixture recovery unavailable');return {thread:{id:'task',path:'C:/sessions/task',cwd:'C:/project'},modelProvider:'openai'};}
 throw Error('Unexpected fixture method '+method);
}};
globalThis.routeSubscriptionFixture={appServerManagers:{...lease(),open:()=>Promise.resolve({status:'ready',manager})},executionHosts:{},clientCoordination:{},appActions:{}};
const profile={shared:'data:text/javascript,export const services=globalThis.routeSubscriptionFixture'};
const run=params=>eval(source.replace('__PARAMS__',JSON.stringify({mode:'switch',threadId:'task',binding:'current',...params})).replace('__PROFILE__',JSON.stringify(profile)));
const reset=()=>{clock=0;active=false;ack='unsubscribed';retainedUntil=0;brokenList=false;brokenResume=false;viewReady=true;requests=[];pins.clear();};
const checks=[];
try{
 for(const status of ['unsubscribed','notSubscribed','notLoaded']){
  reset();ack=status;const v=await run({baseUrl:'http://127.0.0.1:2/test-route'});assert.equal(v.ready,true,status);assert.equal(pins.get('task').valid,true);checks.push('Known official '+status+' response still requires unloaded proof and permits cold prepare');
 }
 reset();retainedUntil=60000;const delayed=await run({baseUrl:'http://127.0.0.1:2/test-route'});assert.equal(delayed.ready,true);assert(clock>=60000);assert(delayed.diagnostics.timeline.some(s=>s.stage==='native-route-unload'&&s.timeoutMs===70000));checks.push('First prepare tolerates the official one-minute retention without treating an ack as unload proof');
 reset();retainedUntil=1000;const retained=await run({baseUrl:'http://127.0.0.1:2/test-route',unloadTimeoutMs:50});assert.equal(retained.failure.code,'ACCOUNT_NATIVE_UNLOAD_PENDING');assert.equal(retained.failure.switched,false);assert.equal(retained.diagnostics.originalSubscriptionRestored,true);assert.equal(retained.diagnostics.subscriptionRecovery,'verified');assert.equal(requests.filter(r=>r.method==='thread/resume').length,1);assert.equal(requests.find(r=>r.method==='thread/resume').p.config.openai_base_url,undefined);assert.equal(pins.size,0);checks.push('First switch failure resubscribes the original official account even when no previous relay pin existed');
 reset();ack=undefined;const unknown=await run({});assert.equal(unknown.failure.code,'ACCOUNT_NATIVE_UNSUBSCRIBE_PROTOCOL');assert.equal(unknown.diagnostics.originalSubscriptionRestored,true);checks.push('Unknown ack shape fails closed and restores the original subscription instead of guessing success');
 reset();brokenList=true;const invalid=await run({});assert.equal(invalid.failure.code,'ACCOUNT_NATIVE_LOADED_PROTOCOL');assert.equal(invalid.diagnostics.originalSubscriptionRestored,true);checks.push('Loaded-list protocol failures restore the original first-use subscription');
 reset();retainedUntil=1000;brokenResume=true;const uncertain=await run({unloadTimeoutMs:50});assert.equal(uncertain.failure.switched,false);assert.equal(uncertain.diagnostics.subscriptionTouched,true);assert.equal(uncertain.diagnostics.originalSubscriptionRestored,false);assert.equal(uncertain.diagnostics.subscriptionRecovery,'ACCOUNT_NATIVE_RECOVERY_UNVERIFIED');checks.push('Unverified recovery remains explicit and cannot masquerade as the original route being healthy');
 reset();active=true;const busy=await run({});assert.equal(busy.failure.code,'ACCOUNT_TURN_ACTIVE');assert.equal(requests.length,0);assert.equal(busy.diagnostics.subscriptionTouched,false);checks.push('Active user turn cannot unsubscribe, resume, switch credentials or release its route');
 reset();viewReady=false;const view=await run({baseUrl:'http://127.0.0.1:2/test-route'});assert.equal(view.failure.code,'ACCOUNT_NATIVE_VIEW_NOT_READY');assert.equal(view.failure.switched,true);assert.equal(pins.size,0);checks.push('Official cache resume cancellation cannot commit a ready execution pin');
 await mkdir('artifacts/native-route-subscription',{recursive:true});await writeFile('artifacts/native-route-subscription/result.json',JSON.stringify({passed:true,scope:'Production native routing script with deterministic official RPC contracts and virtual retention clock; no credentials or inference',checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{Object.defineProperty(globalThis,'performance',{configurable:true,value:originalPerformance});globalThis.setTimeout=originalTimeout;}
