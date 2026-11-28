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
  'bridge.ts':`export function getBootstrapConfig(){return {token:'fixture',binding:'fixture',receiver:'fixture',centralizedStorage:true};}export class ExplorerBridge extends EventTarget{constructor(_t,_b,_r,_ms,services){super();globalThis.fixtureBridge=this;trace.push(['created',services]);}async request(method,p){trace.push(['request',method,p?.action]);if(method==='explorer.language.get'){if(!nativeUp)throw Object.assign(Error('Dead transport'),{code:'TIMEOUT'});return {};}if(p.action==='info')return {owner:{id:'A'},activeConversations:[],selected:{},connections:[]};throw Error('Unexpected native request');}connectServices(){trace.push(['services']);}dispose(){trace.push(['candidate disposed']);}}`,
  'inject.ts':`export function installInjector(){trace.push(['inject']);}`,
  'renderer-storage.ts':`export async function initializeRendererStorage(){trace.push(['storage']);}`,
  'runtime-events.ts':`export function runtimeEvent(...args){trace.push(['event',...args]);}`,
  'core/localization/runtime.ts':``,
  'resources/account-host-capabilities.js':`export async function discoverSharedDispatcher(){return {dispatchMessage(){}};}`,
  'features/accounts/session-guard.ts':`export function installSessionGuard(){}export function suspendSessionGuard(){}`,
 };
 await build({entryPoints:[resolve('packages/explorer-ui/src/app/composition.ts')],bundle:true,platform:'node',format:'esm',outfile:file,define:{__CODE_CODEX_VERSION__:'"0.5.69"'},plugins:[{name:'native-port-fixture',setup(b){b.onLoad({filter:/\.(ts|js)$/},a=>{const key=Object.keys(mocks).find(k=>a.path.replaceAll('\\','/').endsWith('/'+k));return key===undefined?undefined:{contents:mocks[key],loader:'ts'};});}}]});
 const {startApplication}=await import(pathToFileURL(file));
 const owner=Symbol.for('code-codex:document-connection-owner:v2'),ports=Symbol.for('code-codex:accounts-capability:v1');
 let disposed=0;const old={version:'0.5.68',identity:'old',dispose(){disposed++;}};window[owner]=old;
 window[ports]={request:async()=>{return {owner:{id:'A'},activeConversations:active?['chat']:[],selected:{},connections:[]};}};
 const wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out waiting for activation fixture');};
 startApplication();await wait(()=>trace.some(x=>x[0]==='candidate disposed'));
 assert.equal(window[owner],old);assert.equal(disposed,0);assert(!trace.some(x=>x[0]==='services'||x[0]==='inject'));checks.push('Dead candidate transport cannot replace owner, connect services, retire tasks or mount a broken tree');
 nativeUp=true;active=true;await wait(()=>trace.some(x=>x[0]==='inject'));
 assert.equal(window[owner].version,'0.5.69');assert.equal(window[owner].pending,false);assert.equal(disposed,0);
 assert(window[owner].retainedAccounts);checks.push('Verified UI mounts immediately while an active account task keeps its previous native connection');
 const created=trace.filter(x=>x[0]==='created').length,proofs=trace.filter(x=>x[0]==='request'&&x[1]==='explorer.language.get').length;
 active=false;await wait(()=>disposed===1);
 assert.equal(trace.filter(x=>x[0]==='created').length,created);assert.equal(trace.filter(x=>x[0]==='request'&&x[1]==='explorer.language.get').length,proofs);
 assert.equal(window[owner].retainedAccounts,undefined);assert.equal(trace.filter(x=>x[0]==='inject').length,1);
 assert(trace.findIndex(x=>x[0]==='services')>trace.findIndex(x=>x[0]==='request'&&x[1]==='explorer.language.get'));
 assert(trace.findIndex(x=>x[0]==='storage')>trace.findIndex(x=>x[0]==='services'));checks.push('Existing idle retry migrates accounts and releases the retained bridge without remounting or reproving the UI transport');
 let accountChanges=0;
 window.addEventListener('code-codex:account-identity-changed',()=>accountChanges++);
 const beforeNotification=trace.length;
 fixtureBridge.dispatchEvent(new Event('explorer.accounts.login.completed'));
 assert.equal(accountChanges,1);
 assert.equal(trace.length,beforeNotification);
 checks.push('Official child login completion wakes the existing account identity refresh without a new Bridge request at composition');
 const count=trace.length;startApplication();await new Promise(r=>setTimeout(r,100));assert.equal(trace.length,count);window[Symbol.for('code-codex:application-startup:v1')].cancel();checks.push('Repeated same-native bootstrap reuses startup without any request or duplicate tree');
 console.log(JSON.stringify({passed:true,scope:'Production composition/ownership/handoff with controlled native ports; no official process or inference',checks}));
}finally{await rm(folder,{recursive:true,force:true});}
