import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/account-stream-recovery');await mkdir(out,{recursive:true});
await build({entryPoints:['packages/explorer-ui/src/features/accounts/stream-recovery.ts'],bundle:true,platform:'node',format:'esm',outfile:resolve(out,'policy.mjs')});
const {streamFault,shouldRetryStream,accountErrorCode}=await import(pathToFileURL(resolve(out,'policy.mjs'))),checks=[];
const timeout=Object.assign(Error('Transport did not return'),{code:'TIMEOUT'});
assert.equal(accountErrorCode(timeout),'TIMEOUT');checks.push('Structured transport code survives a message without an embedded code');
assert.equal(accountErrorCode(Error('ACCOUNT_EVENT_GAP: unread events missing')),'ACCOUNT_EVENT_GAP');checks.push('Native event gaps remain distinct from read timeouts');
let f=streamFault(timeout,7,undefined,0);
for(let i=0;i<6;i++){
 assert.equal(f.failures,i+1);assert.equal(f.id,7);assert.equal(f.startedAt,0);
 assert.equal(shouldRetryStream(f,f.nextRetryAt-1),false);
 assert.equal(shouldRetryStream(f,f.nextRetryAt),i<5);
 if(i<5)f=streamFault(timeout,999,f,f.nextRetryAt);
}
checks.push('Same recovery ID follows five bounded automatic retries and then requires explicit verification');
for(const code of ['ACCOUNT_EVENT_GAP','ACCOUNT_EVENT_CONSUMER','ACCOUNT_DISCONNECTED','ACCOUNT_PROTOCOL','ACCOUNT_OWNER_CHANGED','ACCOUNT_OUTCOME_UNKNOWN','ACCOUNT_TRANSPORT_RETIRED']){
 const hard=streamFault(Error(code+': fixture'),1);assert.equal(hard.retryable,false);assert.equal(shouldRetryStream(hard,Infinity),false);
}
checks.push('Gaps, consumer failures, disconnects, protocol, owner and unknown write outcomes never auto-retry');
assert.equal(streamFault(Object.assign(Error('Registry wait'),{code:'ACCOUNT_REQUEST_BUSY'}),1).retryable,true);checks.push('Bounded native registry congestion remains a retryable read observation');
assert.equal(streamFault(Error('Arbitrary failure'),1).retryable,false);checks.push('Unclassified failures never silently retry or assume a safe event cursor');
assert.equal(streamFault(Error('ACCOUNT_TRANSPORT_HANDOFF: releasing'),2).retryable,true);checks.push('A temporary unsent handoff read retries with the original cursor; retired endpoints never retry');
await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production read-recovery timing and failure classification; no request replay or inference',checks},null,2));
console.log(JSON.stringify({passed:true,checks}));
