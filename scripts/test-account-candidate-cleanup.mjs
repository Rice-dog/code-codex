import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/account-candidate-cleanup');await mkdir(out,{recursive:true});
globalThis.window=new EventTarget();
const checks=[];
for(const active of [false,true]){
 const name=active?'active':'idle';globalThis.fixture={active,calls:[],disposed:0,lease:false};
 const file=resolve(out,name+'.mjs');
 await build({entryPoints:[resolve('packages/explorer-ui/src/app/composition.ts')],bundle:true,platform:'node',format:'esm',outfile:file,define:{__CODE_CODEX_VERSION__:'"0.5.80"'},plugins:[{name:'candidate-ports',setup(b){
  b.onResolve({filter:/^\.\.\/(bridge|inject|renderer-storage|features\/accounts\/legacy-handoff)$/},a=>a.importer.endsWith('/app/composition.ts')||a.importer.endsWith('\\app\\composition.ts')?{path:a.path,namespace:'candidate'}:undefined);
  b.onLoad({filter:/.*/,namespace:'candidate'},a=>({contents:a.path==='../bridge'?`export const getBootstrapConfig=()=>({token:'fixture-capability',binding:'__codeCodexLive_0_5_80_candidate'});export class ExplorerBridge{async request(method,p){fixture.calls.push([method,p.action]);if(method==='explorer.language.get')return{};if(p.action==='info'){fixture.lease=true;return {owner:{id:'A'}};}if(p.action==='release'){if(fixture.active)throw Error('ACCOUNT_TURN_ACTIVE');fixture.lease=false;return{released:true};}throw Error('Unexpected operation');}dispose(){fixture.disposed++;}}`:a.path.includes('legacy-handoff')?`export async function retireLegacyAccountAdapter(recovery){await recovery({action:'info'});window[Symbol.for('code-codex:application-startup:v1')].cancel();}`:a.path==='../inject'?`export const installInjector=()=>{throw Error('No UI may be published');};`:`export const initializeRendererStorage=async()=>{};` }));
 }}]});
 delete window[Symbol.for('code-codex:application-startup:v1')];delete window[Symbol.for('code-codex:document-connection-owner:v2')];
 const {startApplication}=await import(pathToFileURL(file));startApplication();
 for(let i=0;i<100&&!fixture.disposed;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(fixture.disposed,1);assert.equal(fixture.calls.filter(([,a])=>a==='release').length,1);
 assert.equal(fixture.lease,active);assert.equal(window[Symbol.for('code-codex:document-connection-owner:v2')],undefined);
 checks.push(active?'A cancelled candidate retains an unexpectedly active native execution when release refuses; no process is killed':'A superseded candidate releases its newly acquired idle native lease before its only transport is discarded');
}
await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production startup composition with controlled native transport; cancellation after exclusive account probe, no real account/inference or UI mutation',checks},null,2));
console.log(JSON.stringify({passed:true,checks}));
