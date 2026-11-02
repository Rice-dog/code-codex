import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const folder=await mkdtemp(join(tmpdir(),'CodeCodex-Hot-Activation-')),checks=[];
try{
 globalThis.window=new EventTarget();globalThis.CustomEvent??=class extends Event{constructor(type,init){super(type);this.detail=init?.detail;}};
 const trace=globalThis.trace=[];globalThis.nativeUp=false;globalThis.active=false;
 const file=join(folder,'composition.mjs');
 const mocks={
  'bridge.ts':`export function getBootstrapConfig(){return {token:'fixture',binding:'fixture',receiver:'fixture',centralizedStorage:true};}export class ExplorerBridge{constructor(_t,_b,_r,_ms,services){trace.push(['created',services]);}async request(method,p){trace.push(['request',method,p?.action]);if(method==='explorer.language.get'){if(!nativeUp)throw Object.assign(Error('Dead transport'),{code:'TIMEOUT'});return {};}if(p.action==='info')return {owner:{id:'A'},activeConversations:[],selected:{},connections:[]};throw Error('Unexpected native request');}connectServices(){trace.push(['services']);}dispose(){trace.push(['candidate disposed']);}}`,
  'inject.ts':`export function installInjector(){trace.push(['inject']);}`,
  'renderer-storage.ts':`export async function initializeRendererStorage(){trace.push(['storage']);}`,
  'runtime-events.ts':`export function runtimeEvent(...args){trace.push(['event',...args]);}`,
  'core/localization/runtime.ts':``,
  'features/accounts/session-guard.ts':`export function installSessionGuard(){}`,
 };
 await build({entryPoints:[resolve('packages/explorer-ui/src/app/composition.ts')],bundle:true,platform:'node',format:'esm',outfile:file,define:{__CODE_CODEX_VERSION__:'"0.5.69"'},plugins:[{name:'native-port-fixture',setup(b){b.onLoad({filter:/\.ts$/},a=>{const key=Object.keys(mocks).find(k=>a.path.replaceAll('\\','/').endsWith('/'+k));return key===undefined?undefined:{contents:mocks[key],loader:'ts'};});}}]});
 const {startApplication}=await import(pathToFileURL(file));
 const owner=Symbol.for('code-codex:document-connection-owner:v2'),ports=Symbol.for('code-codex:accounts-capability:v1');
 let disposed=0;const old={version:'0.5.68',identity:'old',dispose(){disposed++;}};window[owner]=old;
 window[ports]={request:async()=>{if(active)throw Object.assign(Error('Task active'),{code:'ACCOUNT_TURN_ACTIVE'});return {owner:{id:'A'},activeConversations:[],selected:{},connections:[]};}};
 const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out waiting for activation fixture');};
 startApplication();await wait(()=>trace.some(x=>x[0]==='candidate disposed'));
 assert.equal(window[owner],old);assert.equal(disposed,0);assert(!trace.some(x=>x[0]==='services'||x[0]==='inject'));checks.push('Dead candidate transport cannot replace owner, connect services, retire tasks or mount a broken tree');
 nativeUp=true;active=true;await wait(()=>trace.filter(x=>x[0]==='candidate disposed').length>=2);
 assert.equal(window[owner],old);assert.equal(disposed,0);assert(!trace.some(x=>x[0]==='inject'));checks.push('Automatic handoff retry preserves the old connection while an account task is active');
 active=false;await wait(()=>trace.some(x=>x[0]==='inject'));
 assert.equal(disposed,1);assert.equal(window[owner].version,'0.5.69');assert.equal(window[owner].pending,false);
 assert(trace.findIndex(x=>x[0]==='services')>trace.findIndex(x=>x[0]==='request'&&x[1]==='explorer.language.get'));
 assert(trace.findIndex(x=>x[0]==='storage')>trace.findIndex(x=>x[0]==='services'));checks.push('The same deferred candidate retries after task completion and mounts only after native proof and service commit');
 const count=trace.length;startApplication();await new Promise(r=>setTimeout(r,100));assert.equal(trace.filter(x=>x[0]==='inject').length,1);assert(trace.length>count);window[Symbol.for('code-codex:application-startup:v1')].cancel();checks.push('Repeated bootstrap with the same native identity does not duplicate the tree');
 console.log(JSON.stringify({passed:true,scope:'Production composition/ownership/handoff with controlled native ports; no official process or inference',checks}));
}finally{await rm(folder,{recursive:true,force:true});}
