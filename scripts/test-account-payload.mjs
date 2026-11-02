import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const folder=await mkdtemp(join(tmpdir(),'CodeCodex-Account-Payload-'));
try{
 const file=join(folder,'payload.mjs');await build({entryPoints:[resolve(import.meta.dirname,'../packages/explorer-ui/src/host/bridge/accounts.ts')],bundle:true,platform:'node',format:'esm',outfile:file});
 globalThis.window=new EventTarget();const {connectAccounts,requestAccounts}=await import(pathToFileURL(file));
 const original={action:'snapshot.write',owner:'fixture-owner',conversationId:'test-task',snapshot:{id:'test-task',text:'中文 Unicode \\"\n'.repeat(18000)}};
 const frames=[];let bytes=[],declared,fail=false,cancelled=false,commits=0;
 connectAccounts(async(method,params)=>{
  assert.equal(method,'explorer.accounts.request');assert(Buffer.byteLength(JSON.stringify(params))<96*1024);frames.push(params.action);
  if(params.action==='payload.start'){declared=params;bytes=[];return{id:'fixture-upload'};}
  if(params.action==='payload.chunk'){if(fail)throw Error('Synthetic disconnected transfer');assert.equal(params.index,bytes.length);bytes.push(Buffer.from(params.data,'base64'));return{accepted:bytes.length};}
  if(params.action==='payload.cancel'){cancelled=true;return{};}
  if(params.action==='payload.commit'){commits++;const value=Buffer.concat(bytes);assert.equal(value.length,declared.size);assert.equal(createHash('sha256').update(value).digest('hex'),declared.sha256);assert.deepEqual(JSON.parse(value),original);return{saved:true};}
  return{direct:true};
 });
 assert.deepEqual(await requestAccounts(original),{saved:true});assert(frames.filter(x=>x==='payload.chunk').length>2);assert.equal(cancelled,false);
 fail=true;await assert.rejects(()=>requestAccounts(original),/Synthetic disconnected transfer/);assert.equal(cancelled,true);assert.equal(commits,1,'Unknown commits must not be repeated');
 assert.deepEqual(await requestAccounts({action:'info'}),{direct:true});
 await assert.rejects(()=>requestAccounts({...original,snapshot:{text:'x'.repeat(4*1024*1024)}}),/PAYLOAD_LIMIT/);
 console.log(JSON.stringify({passed:true,checks:['production capability framing','each frame below unchanged96KiB limit','UTF8 size and SHA exact','large snapshot roundtrip','failed upload cancelled','no duplicate commit','small request direct','oversize rejected']}));
}finally{await rm(folder,{recursive:true,force:true});}
