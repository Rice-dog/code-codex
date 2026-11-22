import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const folder=await mkdtemp(join(tmpdir(),'CodeCodex-UI-Account-Owner-')),checks=[];
try{
 globalThis.window=new EventTarget();
 async function load(v){const file=join(folder,v+'.mjs');await build({entryPoints:[resolve('packages/explorer-ui/src/core/document-capability-owner.ts')],bundle:true,format:'esm',platform:'node',outfile:file,define:{__CODE_CODEX_VERSION__:JSON.stringify(v)}});return import(pathToFileURL(file));}
 const a=await load('1.0.1'),b=await load('1.0.2'),c=await load('1.0.3'),key=Symbol.for('code-codex:document-connection-owner:v2');
 const disposed=[];window[key]={version:'1.0.0',identity:'old',nativeBinding:'old',dispose(){disposed.push('account');}};
 await a.replaceDocumentConnection(()=>({dispose(){disposed.push('ui1');}}),async()=>{},'ui1',true,'ui1',true);
 assert.equal(window[key].version,'1.0.1');assert.equal(window[key].pending,false);assert.equal(window[key].retainedAccounts.nativeBinding,'old');assert.deepEqual(disposed,[]);assert(a.documentBindingRetired('old'));checks.push('New UI fences the old bootstrap while retaining its execution connection');
 const prior=window[key];await assert.rejects(()=>b.replaceDocumentConnection(()=>{throw Error('create failed');},async()=>{},'failed',true,'failed',true),/create failed/);assert.equal(window[key],prior);assert.deepEqual(disposed,[]);checks.push('Failed replacement restores UI owner and retained executor without disposal');
 await b.replaceDocumentConnection(()=>({dispose(){disposed.push('ui2');}}),async()=>{},'ui2',true,'ui2',true);
 assert.deepEqual(disposed,['ui1']);assert.equal(window[key].retainedAccounts.nativeBinding,'old');assert(b.documentBindingRetired('old'));assert(b.documentBindingRetired('ui1'));checks.push('Consecutive upgrade transfers the same account connection and disposes only old UI');
 assert.equal(await a.replaceDocumentConnection(()=>{throw Error('old version');},async()=>{},'obsolete',true,'obsolete',true),false);assert.deepEqual(disposed,['ui1']);checks.push('Older native/UI version cannot reclaim or dispose retained execution');
 b.releaseRetainedAccountConnection();b.releaseRetainedAccountConnection();assert.deepEqual(disposed,['ui1','account']);assert.equal(window[key].retainedAccounts,undefined);assert(b.documentBindingRetired('old'));assert(!b.documentBindingRetired('ui2'));checks.push('Completed lease handoff releases old bridge exactly once and keeps new UI live');
 await c.replaceDocumentConnection(()=>({dispose(){disposed.push('ui3');}}),async()=>{},'ui3',true,'ui3');assert.deepEqual(disposed,['ui1','account','ui2']);checks.push('Normal subsequent replacement retains original disposal semantics');
 console.log(JSON.stringify({passed:true,scope:'Production document owner with simulated disposal; no native task',checks}));
}finally{await rm(folder,{recursive:true,force:true});}
