import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const source=(await readFile('crates/launcher/src/accounts/host_identity.js','utf8')).replace('await import(__HOST_SHARED__)','__namespace').replace('[__HOST_DISPATCHER__]','["dispatcher"]');
const checks=[];
const success={result:{account:{type:'chatgpt',email:'fixture@example.test'},workspaceRouting:{chatgptAccountId:'fixture-workspace'}}};
const error=(message,code=-32603)=>({error:{code,message}});
async function run(sequence,{throwDispatch=false,throwSubscribe=false}={}){
 let now=0,next=0,subscribers=new Set(),timers=new Map(),requests=[],unsubscribed=0;
 const schedule=(callback,delay)=>{const id=++next;timers.set(id,{at:now+delay,callback});return id;};
 const bus={subscribe(type,fn){assert.equal(type,'mcp-response');if(throwSubscribe)throw Error('private transport detail');subscribers.add(fn);return ()=>{subscribers.delete(fn);unsubscribed++;};},dispatchMessage(type,message){
  assert.equal(type,'mcp-request');assert.equal(message.hostId,'local');assert.equal(message.request.method,'account/read');assert.equal(message.request.params.refreshToken,false);
  requests.push(message);if(throwDispatch)throw Error('private transport detail');const response=sequence[requests.length-1];
  if(response!=null){const {delay=0,...body}=response;schedule(()=>{for(const fn of [...subscribers])fn({message:{...body,id:message.request.id}});},delay);}
 }};
 let settled=false,result,failed;
 const job=new vm.Script(source).runInNewContext({__namespace:{dispatcher:bus},Date:{now:()=>now},crypto:{randomUUID},setTimeout:schedule,clearTimeout:id=>timers.delete(id)});
 job.then(value=>{result=value;settled=true;},e=>{failed=e;settled=true;});
 for(let step=0;step<50&&!settled;step++){
  await new Promise(resolve=>setImmediate(resolve));if(settled)break;
  const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0]??[];assert.ok(timer,'A pending operation must have a bounded timer');timers.delete(id);now=timer.at;timer.callback();
 }
 assert.ok(settled);assert.ifError(failed);assert.equal(subscribers.size,0);assert.equal(timers.size,0);assert.ok(now<=8000);
 assert.equal(new Set(requests.map(r=>r.request.id)).size,requests.length);
 return {value:JSON.parse(JSON.stringify(result)),requests,now,unsubscribed};
}
let r=await run([success]);assert.equal(r.value.observation.attempts,1);assert.equal(r.value.observation.recovered,false);assert.equal(r.value.workspace,'fixture-workspace');checks.push('Healthy official read is unchanged and clears its timer/subscription');
for(const text of ['workspace routing discovery failed','workspace routing discovery timed out','Workspace routing is unavailable']){
 r=await run([error(text),success]);assert.equal(r.value.observation.recovered,true);assert.equal(r.requests.length,2);assert.equal(r.now,250);checks.push(`Explicit routing failure recovers through a non-refreshing read: ${text}`);
}
r=await run([error('workspace routing discovery failed'),error('workspace routing discovery failed'),success]);assert.equal(r.requests.length,3);assert.equal(r.now,1000);assert.equal(r.value.observation.recovered,true);checks.push('Two transient failures recover within the common absolute budget');
r=await run(Array(3).fill(error('workspace routing discovery failed')));assert.equal(r.value.failure.code,'ACCOUNT_WORKSPACE_ROUTING');assert.equal(r.value.failure.attempts,3);assert.equal(r.value.failure.rpcCode,-32603);assert.equal(r.requests.length,3);checks.push('Persistent routing failure stops after three reads and preserves exact branch evidence');
for(const text of ['Invalid authentication','Permission denied','workspace routing discovery failed: accessToken=private','request timed out']){
 r=await run([error(text)]);assert.equal(r.requests.length,1);assert.equal(r.value.failure.code,'ACCOUNT_HOST_IDENTITY');assert.ok(!JSON.stringify(r.value).includes('private'));checks.push(`Unknown/auth/permission error is not retried or reflected: ${text.split(':')[0]}`);
}
r=await run([error('workspace routing discovery failed',-32602)]);assert.equal(r.requests.length,1);assert.equal(r.value.failure.rpcCode,-32602);checks.push('A different RPC error code cannot trigger a routing retry');
r=await run([null]);assert.equal(r.requests.length,1);assert.equal(r.value.failure.code,'ACCOUNT_HOST_TIMEOUT');assert.equal(r.now,8000);checks.push('Missing response reaches the absolute deadline without retry or dangling subscription');
r=await run([{...error('workspace routing discovery failed'),delay:7900}]);assert.equal(r.requests.length,1);assert.equal(r.now,7900);checks.push('A late rejection cannot exceed the total budget by starting another attempt');
r=await run([{...error('workspace routing discovery failed'),delay:7000},null]);assert.equal(r.requests.length,2);assert.equal(r.now,8000);checks.push('The second attempt gets only the remaining budget, not a new eight seconds');
for(const option of [{throwDispatch:true},{throwSubscribe:true}]){r=await run([],option);assert.equal(r.value.failure.reason,'official-read-transport');assert.ok(!JSON.stringify(r.value).includes('private'));}checks.push('Subscription and dispatch exceptions release resources and withhold private exception details');
for(const response of [{result:{account:null}},{result:{account:{type:'apiKey'}}}]){r=await run([response]);assert.equal(r.value.failure.code,'ACCOUNT_SIGN_IN');assert.equal(r.requests.length,1);}checks.push('Only a missing or non-ChatGPT identity is categorized as sign-in required');
r=await run([{result:{account:{type:'chatgpt',email:42}}}]);assert.equal(r.value.failure.reason,'official-account-schema');checks.push('Malformed identity cannot create an owner');
r=await run([{result:{...success.result,workspaceRouting:{chatgptAccountId:{secret:'private'}}}}]);assert.equal(r.value.failure.reason,'official-routing-schema');assert.ok(!JSON.stringify(r.value).includes('private'));checks.push('Malformed routing identity is rejected without exposing its data');
r=await run([{result:{account:success.result.account}}]);assert.equal(r.value.workspace,null);checks.push('Older capability-compatible hosts without optional workspaceRouting retain their owner behavior');
r=await run([{result:{...success.result,account:{...success.result.account,planType:'plus'}}}]);assert.equal(r.value.plan,'plus');r=await run([{result:{...success.result,account:{...success.result.account,planType:{private:'secret'}}}}]);assert.equal(r.value.plan,null);checks.push('Optional plan is projected while malformed values remain unknown');

const out='artifacts/account-host-read';await mkdir(out,{recursive:true});await writeFile(`${out}/result.json`,JSON.stringify({passed:true,checks,scope:'Production host identity source; deterministic dispatcher and clock, no real authentication or model turns'},null,2));console.log(`${checks.length} host account-read checks passed`);
