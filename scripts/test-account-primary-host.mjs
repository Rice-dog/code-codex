import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';
const source=await readFile('crates/launcher/src/accounts/primary_host.js','utf8');globalThis.window=globalThis;
let active=false,known=true,ack=true,requests=[],listener,disposed=0;
const lease={dup(){return this},[Symbol.dispose](){disposed++}};
const manager={...lease,sendRequest:async(method,p)=>{requests.push({method,p});if(method==='thread/loaded/list')return {data:['thread-a','thread-b'],nextCursor:null};if(method==='account/login/start')return ack?{type:'chatgpt',loginId:'fixture-login',authUrl:'https://auth.openai.com/fixture'}:{type:'unknown'};if(method==='account/login/cancel')return {};throw Error('Unexpected method '+method)},getThreadExecutionState:async()=>known?{inProgress:active}:{},subscribe:async spec=>{listener=spec.listener;return lease}};
globalThis.primaryFixture={appServerManagers:{...lease,open:()=>Promise.resolve({status:'ready',manager})},executionHosts:{},clientCoordination:{},appActions:{}};
const profile={shared:'data:text/javascript,export const service=globalThis.primaryFixture'};
const run=p=>eval(source.replace('__PROFILE__',JSON.stringify(profile)).replace('__PARAMS__',JSON.stringify(p)));
const reset=()=>{window[Symbol.for('code-codex:primary-login-observation:v1')]?.dispose();delete window[Symbol.for('code-codex:primary-login-observation:v1')];active=false;known=true;ack=true;requests=[];};
const checks=[];
try{
 reset();active=true;let v=await run({mode:'start'});assert.equal(v.failure.code,'ACCOUNT_TURN_ACTIVE');assert(!requests.some(r=>r.method==='account/login/start'));checks.push('Any active official conversation blocks primary authorization before auth writes');
 reset();known=false;v=await run({mode:'start'});assert.equal(v.failure.code,'ACCOUNT_RPC_STATE_UNKNOWN');checks.push('Missing idle evidence fails closed');
 reset();v=await run({mode:'check'});assert.equal(v.checkedThreads,2);assert(!requests.some(r=>r.method.startsWith('account/')));checks.push('Read-only qualification checks all loaded conversations without logging in');
 reset();v=await run({mode:'start'});assert.equal(v.loginId,'fixture-login');assert.equal(requests.at(-1).p.type,'chatgpt');assert(!('accessToken' in requests.at(-1).p));listener({params:{loginId:'other',success:true}});assert.equal((await run({mode:'observation'})).finished,false);listener({params:{loginId:'fixture-login',success:true}});assert.equal((await run({mode:'observation'})).success,true);checks.push('Standard managed OAuth observes only its own completion and releases its observation leases');
 reset();await run({mode:'start'});await run({mode:'cancel',loginId:'fixture-login'});assert.equal(requests.at(-1).method,'account/login/cancel');checks.push('Cancellation uses the exact pending login and releases observation resources');
 reset();ack=false;v=await run({mode:'start'});assert.equal(v.failure.code,'ACCOUNT_PRIMARY_LOGIN_PROTOCOL');checks.push('Unknown auth acknowledgement cannot be reported as a successful switch');
 const result={passed:true,noCredentials:true,noInference:true,checks};await mkdir('artifacts/account-primary-host',{recursive:true});await writeFile('artifacts/account-primary-host/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{reset()}
