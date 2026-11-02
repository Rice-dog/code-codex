import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/account-lease-handoff');await mkdir(out,{recursive:true});
await build({stdin:{contents:"export {bindAccountTransport} from './features/accounts/transport';export {retireLegacyAccountAdapter} from './features/accounts/legacy-handoff';export {connectAccounts,accountRequestSnapshot,requestAccounts} from './host/bridge/accounts';",resolveDir:resolve('packages/explorer-ui/src'),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(out,'production.mjs'),define:{__CODE_CODEX_VERSION__:'"0.5.80"'}});
globalThis.window=new EventTarget();
const {bindAccountTransport,retireLegacyAccountAdapter,connectAccounts,accountRequestSnapshot,requestAccounts}=await import(pathToFileURL(resolve(out,'production.mjs')));
const checks=[],key=Symbol.for('code-codex:accounts-capability:v1'),stateKey=Symbol.for('code-codex:multi-account-runtime:v1');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,5));
function fixture(){
 let lease='old',active=false,late,reads=0,disposed=0,releases=0,candidateFailure=false;
 const info=()=>({owner:{id:'A'},connections:[{id:'B'}],selected:{chat:'B'},activeConversations:active?['chat']:[],sharedConversations:['chat']});
 const old=async p=>{if(p.action==='info'){reads++;if(late)await late.promise;assert(lease==='old'||lease===null);lease='old';return info();}if(p.action==='shared.reconcile'){if(active)throw Object.assign(Error('still running'),{code:'ACCOUNT_TURN_ACTIVE'});return {reconciled:true};}if(p.action==='release'){assert.equal(lease,'old');assert(!active);lease=null;releases++;return {released:true};}throw Error('Unexpected old operation');};
 const next=async p=>{assert.equal(p.action,'info');if(candidateFailure)throw Error('ACCOUNT_FIXTURE_REPLACEMENT: Not yet ready');assert(lease===null||lease==='new','The replacement cannot steal the previous lease');lease='new';return {...info(),sharedConversations:[]};};
 const port=bindAccountTransport(old,'__codeCodexLive_0_5_80_old');
 const state={enabled:true,viewRevision:'account-lease-handoff-v14',generation:0,selector:{dispose(){}},adapter:{request:port,canDisable:()=>!active,async dispose(){const info=await this.request({action:'info'});if(info.owner.id==='A')await this.request({action:'release'});disposed++;}}};
 window[key]={request:port};window[stateKey]=state;
 return {port,state,next,get lease(){return lease;},get releases(){return releases;},get reads(){return reads;},get disposed(){return disposed;},set active(v){active=v;},set late(v){late=v;},set candidateFailure(v){candidateFailure=v;}};
}
{
 const f=fixture(),gate=defer();f.late=gate;
 const oldRead=f.port({action:'info'});await tick();const handoff=retireLegacyAccountAdapter(f.next);await tick();
 assert.equal(f.releases,0);
 gate.resolve();f.late=undefined;await oldRead;await handoff;
 assert.equal(f.lease,'new');assert.equal(f.releases,1);assert.equal(f.disposed,1);assert.equal(f.state.adapter,undefined);
 await assert.rejects(()=>f.port({action:'info'}),/ACCOUNT_TRANSPORT_RETIRED/);
 checks.push('A late previous info drains before exactly one old lease release and candidate acquisition; stale requests cannot reacquire');
}
{
 const f=fixture(),gate=defer(),originalTimeout=globalThis.setTimeout;f.late=gate;
 const read=f.port({action:'info'});await tick();let handoff;
 try{
  globalThis.setTimeout=()=>0;
  handoff=retireLegacyAccountAdapter(f.next);await Promise.resolve();gate.resolve();f.late=undefined;await read;
  await Promise.race([handoff,new Promise((_,reject)=>originalTimeout(()=>reject(Error('Background handoff incorrectly waited for a renderer timer')),1000))]);
  assert.equal(f.lease,'new');assert.equal(f.releases,1);
 }finally{globalThis.setTimeout=originalTimeout;}
 checks.push('Completed native reads wake a background handoff with every renderer timer suspended; no timer tick is needed');
}
{
 const f=fixture();f.active=true;const adapter=f.state.adapter;
 await assert.rejects(()=>retireLegacyAccountAdapter(f.next),/ACCOUNT_UPGRADE_ACTIVE/);
 assert.equal(f.releases,0);assert.equal(f.disposed,0);assert.equal(f.state.adapter,adapter);assert.equal(f.lease,'old');
 await f.port({action:'info'});checks.push('A live old task rejects handoff and resumes its concrete endpoint without stopping or replacing hooks');
}
{
 const f=fixture();f.candidateFailure=true;
 await assert.rejects(()=>retireLegacyAccountAdapter(f.next),/REPLACEMENT/);assert.equal(f.releases,1);assert.equal(f.disposed,0);
 await assert.rejects(()=>f.port({action:'info'}),/TRANSPORT_RETIRED/);
 f.candidateFailure=false;await retireLegacyAccountAdapter(f.next);assert.equal(f.releases,1);assert.equal(f.lease,'new');assert.equal(f.disposed,1);
 checks.push('Failure after release keeps the old endpoint retired; retry acquires only the replacement without a second release');
}
{
 const received=[];delete window[key];
 connectAccounts(async(_m,p)=>{received.push(['old',p.action]);return {source:'old'};},'native-old');const fixed=accountRequestSnapshot();
 connectAccounts(async(_m,p)=>{received.push(['new',p.action]);return {source:'new'};},'native-new');
 assert.equal((await fixed({action:'info'})).source,'old');assert.equal((await requestAccounts({action:'info'})).source,'new');
 assert.equal(fixed.runtimeIdentity,'native-old');assert.equal(accountRequestSnapshot().runtimeIdentity,'native-new');
 checks.push('An adapter snapshot retains its concrete native endpoint after the global slot is replaced, including same-version processes');
}
{
 let lease='old';const old=bindAccountTransport(async p=>{if(p.action==='info')return {owner:{id:'A'},selected:{},activeConversations:[]};if(p.action==='release'){lease=null;return {released:true};}throw Error('Unsupported');},'old-only');
 window[key]={request:old};window[stateKey]={enabled:false};
 await retireLegacyAccountAdapter(async p=>{assert.equal(p.action,'info');assert.equal(lease,null);lease='new';return {owner:{id:'A'},activeConversations:[]};});
 assert.equal(lease,'new');await assert.rejects(()=>old({action:'info'}),/TRANSPORT_RETIRED/);
 checks.push('Disabled or unloaded plugin still hands off its account lease without reading an empty list or deleting saved accounts');
}
{
 for(const action of ['shared.events','shared.stop','usage','shared.prepare']){
  const pending=defer(),calls=[];
  const port=bindAccountTransport(async p=>{calls.push(p.action);if(p.action==='info')await pending.promise;return {ok:true};},'yield-'+action);
  const read=port({action:'info'});await tick();const upgrade=port.beginAccountHandoff();
  const rejected=assert.rejects(upgrade,/ACCOUNT_HANDOFF_YIELDED/);
  await port({action});await rejected;pending.resolve();await read;
  assert(calls.includes(action));await port({action:'info'});
 }
 checks.push('Events, Stop, quota reads and account preparation supersede a pending drain without losing their requests');
}
{
 let reads=0,releases=0;const hold=defer(),entered=defer();
 const port=bindAccountTransport(async p=>{if(p.action==='info'){if(++reads===2){entered.resolve();await hold.promise;}return {owner:{id:'A'},selected:{},sharedConversations:[],activeConversations:[]};}if(p.action==='release'){releases++;return{};}return {ok:true};},'pre-release-race');
 window[key]={request:port};window[stateKey]={enabled:false};
 const upgrade=retireLegacyAccountAdapter();const yielded=assert.rejects(upgrade,/ACCOUNT_HANDOFF_YIELDED/);await entered.promise;
 await port({action:'shared.stop'});hold.resolve();await yielded;assert.equal(releases,0);await port({action:'info'});
 checks.push('Stop arriving during the final native idle check cancels release and preserves the old endpoint');
}
{
 const port=bindAccountTransport(async()=>({ok:true}),'seal');const h=await port.beginAccountHandoff();h.seal();
 await assert.rejects(()=>port({action:'shared.rpc'}),/ACCOUNT_TRANSPORT_HANDOFF/);
 h.rollback();await port({action:'info'});
 const next=await port.beginAccountHandoff();next.seal();next.release();
 await assert.rejects(()=>port({action:'shared.stop'}),/ACCOUNT_TRANSPORT_RETIRED/);const retired=await port.beginAccountHandoff();assert.throws(()=>retired.request({action:'info'}),/ACCOUNT_TRANSPORT_RETIRED/);assert.throws(()=>retired.seal(),/ACCOUNT_TRANSPORT_RETIRED/);
 checks.push('Sealed release blocks new operations, rollback resumes the old port, and released ports never admit Stop or reads');
}
{
 const f=fixture();await assert.rejects(()=>retireLegacyAccountAdapter(f.next,()=>false),/ACCOUNT_HANDOFF_YIELDED/);
 assert.equal(f.releases,0);await f.port({action:'info'});
 checks.push('A superseded startup cannot release a lease after its candidate was cancelled');
}
function unsupported(){return Object.assign(Error('The host build is not qualified.'),{code:'ACCOUNT_HOST_UNSUPPORTED'});}
function unsupportedFixture(){
 const calls=[];const port=bindAccountTransport(async p=>{calls.push(p.action);throw unsupported();},'unsupported-old');
 const state={enabled:true,generation:1,error:'The host build is not qualified.'};window[key]={request:port};window[stateKey]=state;
 return {port,state,calls};
}
{
 const f=unsupportedFixture();let candidateCalls=0;
 await retireLegacyAccountAdapter(async()=>{candidateCalls++;throw unsupported();});
 assert.equal(candidateCalls,1);assert.deepEqual(f.calls,['info']);assert.equal(f.state.enabled,true);assert.equal(f.state.adapter,undefined);
 await assert.rejects(()=>f.port({action:'info'}),/TRANSPORT_RETIRED/);
 checks.push('Unqualified optional account services with no adapter retire only the local port and permit ordinary UI activation without any native release');
}
{
 for(const field of ['adapter','selector']){
  const f=unsupportedFixture();f.state[field]=field==='adapter'?{canDisable:()=>true,status:()=>({busy:false})}:{dispose(){throw Error('Must preserve existing selector');}};
  await assert.rejects(()=>retireLegacyAccountAdapter(async()=>{throw unsupported();}),/ACCOUNT_UPGRADE_UNVERIFIED/);
  await assert.rejects(()=>f.port({action:'info'}),e=>e.code==='ACCOUNT_HOST_UNSUPPORTED');assert(f.state[field]);
 }
 checks.push('Any existing adapter or selector blocks unsupported-service retirement even when its local status claims idle');
}
{
 for(const failure of [Error('ACCOUNT_HOST_UNSUPPORTED message only'),Object.assign(Error('Permission denied'),{code:'ACCOUNT_PERMISSION'}),Object.assign(Error('Unknown protocol'),{code:'ACCOUNT_PROTOCOL'})]){
  const port=bindAccountTransport(async()=>{throw failure;},'unknown-failure');window[key]={request:port};window[stateKey]={enabled:true};let nextCalls=0;
  await assert.rejects(()=>retireLegacyAccountAdapter(async()=>{nextCalls++;throw unsupported();}),e=>e===failure);
  assert.equal(nextCalls,0);await assert.rejects(()=>port({action:'info'}),e=>e===failure);
 }
 checks.push('Message text, permission and protocol errors cannot impersonate structured qualification failure or retire the old endpoint');
}
{
 for(const code of ['ACCOUNT_OWNER_BUSY','ACCOUNT_TURN_ACTIVE','ACCOUNT_REQUEST_BUSY']){
  const f=unsupportedFixture();const failure=Object.assign(Error('Candidate blocked'),{code});
  await assert.rejects(()=>retireLegacyAccountAdapter(async()=>{throw failure;}),e=>e===failure);
  await assert.rejects(()=>f.port({action:'info'}),e=>e.code==='ACCOUNT_HOST_UNSUPPORTED');
 }
 checks.push('Candidate ownership, execution or request conflicts keep the old unqualified endpoint open without stealing a lease');
}
{
 const f=unsupportedFixture();let nextCalls=0;
 await retireLegacyAccountAdapter(async p=>{nextCalls++;assert.equal(p.action,'info');return {owner:{id:'A'},connections:[],selected:{},sharedConversations:[],activeConversations:[]};});
 assert.equal(nextCalls,1);assert.deepEqual(f.calls,['info']);await assert.rejects(()=>f.port({action:'info'}),/TRANSPORT_RETIRED/);
 checks.push('A newly qualified candidate may verify its own idle account service while retiring a never-initialized old endpoint');
}
{
 const f=unsupportedFixture();let calls=0;
 await assert.rejects(()=>retireLegacyAccountAdapter(async()=>{calls++;return {owner:{id:'A'},activeConversations:['another-chat'],sharedConversations:[]};}),/ACCOUNT_UPGRADE_ACTIVE/);
 assert.equal(calls,2);await assert.rejects(()=>f.port({action:'info'}),e=>e.code==='ACCOUNT_HOST_UNSUPPORTED');
 checks.push('A qualified candidate reporting active work still blocks upgrade; unsupported old service is not an idle shortcut');
}
{
 for(const field of ['generation','adapter']){
  const f=unsupportedFixture(),gate=defer();const upgrade=retireLegacyAccountAdapter(async()=>{await gate.promise;throw unsupported();});await tick();
  if(field==='generation')f.state.generation++;else f.state.adapter={};gate.resolve();await assert.rejects(()=>upgrade,/ACCOUNT_UPGRADE_UNVERIFIED/);
  await assert.rejects(()=>f.port({action:'info'}),e=>e.code==='ACCOUNT_HOST_UNSUPPORTED');
 }
 checks.push('Generation changes or an adapter appearing during candidate qualification invalidate the no-account-state proof');
}
{
 const f=unsupportedFixture(),gate=defer();let current=true;
 const upgrade=retireLegacyAccountAdapter(async()=>{await gate.promise;throw unsupported();},()=>current);await tick();current=false;gate.resolve();await assert.rejects(()=>upgrade,/ACCOUNT_HANDOFF_YIELDED/);
 await assert.rejects(()=>f.port({action:'info'}),e=>e.code==='ACCOUNT_HOST_UNSUPPORTED');
 checks.push('Cancellation during optional-feature preflight preserves the old endpoint and cannot publish a superseded UI');
}
{
 const f=fixture();f.state.viewRevision='account-native-routing-v18';f.state.adapter.diagnostics=()=>({mode:'native-rpc',independentExecution:false,attachedManagers:0});f.state.adapter.handoffStatus=()=>({busy:true,reason:'active-turn',activeTasks:1,autoPending:0});f.state.adapter.status=()=>({busy:true,preparing:false});
 const old=f.port;const clean=async p=>{const v=await old(p);return p.action==='info'?{...v,sharedConversations:[],activeConversations:[]}:v;};const port=bindAccountTransport(clean,'readonly-v18');window[key]={request:port};f.state.adapter.request=port;
 await retireLegacyAccountAdapter(f.next);assert.equal(f.releases,1);assert.equal(f.disposed,1);checks.push('Qualified v18 read-only native observation can retire during an official host task without owning or stopping that task');
}
{
 const f=fixture();f.state.viewRevision='account-native-routing-v18';f.state.adapter.diagnostics=()=>({mode:'native-rpc',independentExecution:false,attachedManagers:0});f.state.adapter.handoffStatus=()=>({busy:true,reason:'active-turn',activeTasks:1,autoPending:0});
 await assert.rejects(()=>retireLegacyAccountAdapter(f.next),/ACCOUNT_UPGRADE_ACTIVE/);assert.equal(f.releases,0);checks.push('Read-only migration is refused when native shared execution metadata exists');
}
await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production concrete transport and handoff modules with two exclusive-native-service fixtures; no account inference or process termination',checks},null,2));
console.log(JSON.stringify({passed:true,checks}));
