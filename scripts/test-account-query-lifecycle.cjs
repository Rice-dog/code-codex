const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {build}=require(path.resolve('packages/explorer-ui/node_modules/esbuild/lib/main.js'));
const root=process.cwd(),checks=[];
const tick=()=>new Promise(r=>setImmediate(r));
const catalog=[{id:'multi-account',api:1,version:'fixture',category:'developer-tools',sha256:'fixture'}];
async function bundle(contents,plugins=[]){return (await build({stdin:{contents,resolveDir:path.join(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,define:{__CODE_CODEX_PLUGIN_CATALOG__:JSON.stringify(catalog)},plugins})).outputFiles[0].text;}
function realm(code,extra={}){
 const module={exports:{}},win=new EventTarget(),storage=new Map();
 win.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const box={window:win,localStorage:win.localStorage,module,exports:module.exports,performance,Event,CustomEvent,TextEncoder,console,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,structuredClone,crypto,...extra};
 vm.createContext(box);vm.runInContext(code,box);return {api:module.exports,win,storage,box};
}
async function record(name,fn){const evidence=await fn();checks.push({name,confirmed:true,evidence});}
(async()=>{
 const wrapper=await bundle("export {MultiAccountPlugin} from './multi-account';export {connectPluginPackages,ensurePluginPackage} from './plugin-runtime';");
 await record('Cold startup resumes automatically after its package transport connects',async()=>{
  const {api,win}=realm(wrapper);let starts=0,loads=0;const plugin=new api.MultiAccountPlugin({},()=>{});
  plugin.start();await tick();api.connectPluginPackages(async()=>{loads++;win[Symbol.for('code-codex:plugin-modules:v1')].set('multi-account',{api:1,version:'fixture',exports:{MultiAccountPlugin:class{start(){if(this.started)return;this.started=true;starts++;}stop(){this.started=false;}}}});});
  await tick();const before={loads,starts};assert.equal(starts,1);await api.ensurePluginPackage('multi-account');assert.equal(starts,1);plugin.stop();return {before,afterExplicitLoad:{loads,starts}};
 });
 const quotaCode=await bundle("export {AccountUsageStore} from './features/accounts/quota';");
 await record('Incomplete quota responses retry after a bounded interval',async()=>{
  const {api}=realm(quotaCode);let now=1900000000000,reads=0;
  const store=new api.AccountUsageStore(async()=>{reads++;return {};},()=>{},()=>now);
  store.refresh(['B']);await tick();now+=24*3600000;store.refresh(['B']);await tick();const d=store.diagnostics('B');assert.equal(reads,2);assert.equal(d.phase,'unavailable');assert.equal(d.nextRead,now+30000);store.dispose();return {readsAfterOneDay:reads,phase:d.phase,nextRead:d.nextRead,remaining:'unknown'};
 });
 const info={owner:{id:'A',label:'a@example.test'},profile:{initial:'./assets/native.js',shared:'./assets/shared.js',managerExport:'Manager',dispatcherExport:'dispatcher'},connections:[],selected:{},activeConversations:[]};
 const activePlugin={name:'readonly-active-thread',setup(b){b.onResolve({filter:/active-thread$/},()=>({path:'active',namespace:'audit'}));b.onLoad({filter:/.*/,namespace:'audit'},()=>({contents:'export const resolveActiveThread=()=>null;'}));}};
 const nativeCode=await bundle("export {NativeAccountAdapter} from './features/accounts/native-adapter';",[activePlugin]);
 await record('Owner mismatch invalidates the old adapter but does not rebind it',async()=>{
  const {api}=realm(nativeCode),notices=[];const a=new api.NativeAccountAdapter(async()=>info,structuredClone(info),m=>notices.push(m));a.updateInfo({...structuredClone(info),owner:{id:'C',label:'c@example.test'}});assert.equal(a.info.owner.id,'A');assert.equal(a.status().supported,false);a.endSession();return {retainedOwner:'A',supported:false,notice:notices[0]};
 });
 const stubs={name:'isolated-lifecycle-ports',setup(b){
  b.onResolve({filter:/features\/accounts\/(account-list|composer-selector|native-adapter)$/},args=>({path:args.path.split('/').pop(),namespace:'ports'}));
  b.onLoad({filter:/.*/,namespace:'ports'},args=>({contents:args.path==='account-list'?`export const accountListCss='';export class AccountList{render(){}close(){}dispose(){}}`:args.path==='composer-selector'?`export class ComposerAccountSelector{update(){}dispose(){}}`:`export class NativeAccountAdapter{constructor(request,info,notice){this.info=info;this.notice=notice;this.usage={refresh(){},invalidate(){}};}async start(){window.starts=(window.starts??0)+1;}async dispose(){}endSession(){this.disposed=true;}setAutoContinue(){}autoStatus(){}status(){return {active:!this.disposed,supported:true,selected:'host',busy:false};}setEnabled(){}updateInfo(info){this.info=info;window.updates=(window.updates??0)+1;}async useOfficialIdentity(){}}` }));
 }};
 const runtimeCode=await bundle("export {MultiAccountPlugin} from './multi-account-runtime';",[stubs]);
 function lifecycle(initial){
  let interval;class El extends EventTarget{constructor(){super();this.style={};this.dataset={};}getAttribute(){return null;}setAttribute(){}matches(){return false;}focus(){}}
  const elements=new Map(),shadow={host:{tagName:'CODE-CODEX-V0-5-81'},querySelector(k){if(!elements.has(k))elements.set(k,new El());return elements.get(k);},querySelectorAll(){return []},append(){}};
  const r=realm(runtimeCode,{document:Object.assign(new EventTarget(),{createElement:()=>new El()}),setInterval:fn=>(interval=fn,1),clearInterval(){},innerWidth:1500,innerHeight:1000});
  r.win[Symbol.for('code-codex:language-service:v1')]={getLocale:()=> 'en',subscribeLanguage:()=>()=>{},t:k=>k};
  r.win[Symbol.for('code-codex:multi-account-runtime:v1')]=initial;
  const notices=[],plugin=new r.api.MultiAccountPlugin(shadow,m=>notices.push(m));
  return {...r,plugin,notices,elements,shadow,poll:()=>interval(),state:initial};
 }
 const transport=(r,fn)=>r.win[Symbol.for('code-codex:accounts-capability:v1')]={request:fn};
 await record('Saved preference never claims ready after failed initialization',async()=>{
  const r=lifecycle({enabled:true});transport(r,async()=>{throw Error('ACCOUNT_HOST: Signed out fixture');});r.plugin.start();await tick();assert.equal(r.state.enabled,true);assert.equal(r.state.adapter,undefined);const label=r.elements.get('.accounts-status').textContent;assert.notEqual(label,'accounts.enabled');r.plugin.stop();return {enabled:true,adapterPresent:false,statusLabel:label,notice:r.notices[0]};
 });
 await record('Disabled plugin does not poll account info or update its adapter',async()=>{
  const r=lifecycle({enabled:false,adapter:{info,usage:{refresh(){}},autoStatus(){},status(){return {active:true,supported:true};},updateInfo(){r.win.updates=(r.win.updates??0)+1;}},viewRevision:'account-stream-recovery-v11'});let calls=0;transport(r,async()=>{calls++;return structuredClone(info);});r.plugin.start();await tick();const before=calls;r.poll();await tick();assert.equal(calls,before);assert.equal(r.win.updates??0,0);r.plugin.stop();return {callsFromOneDisabledPoll:calls-before,adapterUpdates:r.win.updates??0};
 });
 await record('Enable retires the unsupported old owner and binds the freshly observed owner',async()=>{
  let rebinds=0;const old={info,usage:{refresh(){}},autoStatus(){},updateInfo(){},status:()=>({active:true,supported:false}),endSession(){rebinds++;},dispose:async()=>{rebinds++;}};
  const r=lifecycle({enabled:false,adapter:old,viewRevision:'account-stream-recovery-v11'});transport(r,async()=>({...structuredClone(info),owner:{id:'C',label:'c@example.test'}}));r.plugin.start();await tick();r.elements.get('.accounts-enable').dispatchEvent(new Event('click'));await tick();assert.notEqual(r.state.adapter,old);assert.equal(r.state.adapter.info.owner.id,'C');assert.equal(r.state.enabled,true);assert.equal(rebinds,1);r.plugin.stop();return {retainedOwner:r.state.adapter.info.owner.id,enabled:r.state.enabled,supported:r.state.adapter.status().supported,rebinds};
 });
 await record('Session end prevents a pending enable from publishing the old owner',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r),r=lifecycle({enabled:true});transport(r,async()=>{calls++;return gate;});
  r.plugin.start();await tick();r.win.dispatchEvent(new Event('code-codex:account-session-ended'));release(structuredClone(info));await tick();assert.equal(r.state.adapter,undefined);assert.equal(r.win.starts??0,0);r.plugin.stop();return {restoredOldOwner:null,adapterStartsAfterSessionEnded:r.win.starts??0,scope:'controlled delayed info; no real logout or authentication performed'};
 });
 await record('A stopped controller cannot commit a delayed refresh',async()=>{
  let release,calls=0,updates=0;const gate=new Promise(r=>release=r),adapter={info,usage:{refresh(){}},autoStatus(){},updateInfo(){updates++;}};
  adapter.status=()=>({active:true,supported:true});const r=lifecycle({enabled:false,adapter,viewRevision:'account-native-routing-v19'});transport(r,async()=>{calls++;return gate;});r.plugin.start();await tick();r.state.enabled=true;r.poll();r.plugin.stop();release(structuredClone(info));await tick();assert.equal(updates,0);return {adapterUpdatesAfterStop:updates};
 });
 await record('Published native account endpoint rebinds an existing background panel without any interval tick',async()=>{
  const r=lifecycle({enabled:true});transport(r,async()=>structuredClone(info));r.plugin.start();await tick();assert(r.state.adapter);const starts=r.win.starts;
  r.state.adapter=undefined;r.state.selector=undefined;r.state.pending=new Promise(()=>{});transport(r,async()=>structuredClone(info));
  r.win.dispatchEvent(new Event('code-codex:accounts-connected'));await tick();await tick();
  assert(r.state.adapter);assert.equal(r.state.viewRevision,'account-native-routing-v23');assert.equal(r.win.starts,starts+1);assert.equal(r.state.pending,undefined);r.plugin.stop();
  return {timerTicks:0,adapterRebound:true,obsoletePendingDiscarded:true};
 });
 await record('A retired cross-version panel cannot eagerly acquire the new native endpoint',async()=>{
  const r=lifecycle({enabled:false});let calls=0;transport(r,async()=>{calls++;return structuredClone(info);});r.plugin.start();await tick();
  r.state.enabled=true;r.win[Symbol.for('code-codex:document-connection-owner:v2')]={version:'0.5.82'};
  r.win.dispatchEvent(new Event('code-codex:accounts-connected'));await tick();assert.equal(calls,0);assert.equal(r.state.adapter,undefined);r.plugin.stop();
  return {oldPanelVersion:'0.5.81',newDocumentVersion:'0.5.82',newEndpointReadsByOldPanel:0};
 });
 await record('Panel metadata refreshes coalesce while an action waits for a newer committed snapshot',async()=>{
  const r=lifecycle({enabled:false});let reads=0,release;
  transport(r,async()=>{reads++;if(reads===1)return new Promise(resolve=>release=resolve);return {...structuredClone(info),followLogout:false};});r.plugin.start();r.state.enabled=true;r.poll();await tick();r.poll();assert.equal(reads,1);
  r.plugin.stop();release(structuredClone(info));await tick();assert.equal(r.state.adapter,undefined);return {sameFlightReads:reads,lateStoppedReadCommitted:false};
 });
 const result={at:new Date().toISOString(),sourceVersion:JSON.parse(fs.readFileSync('packages/explorer-ui/package.json','utf8')).version,scope:'Repaired production wrapper, quota cache and lifecycle methods; controlled ports and clock. No official logout, inference, Stop, account selection or history writes.',checks};
 fs.mkdirSync(path.join(root,'artifacts/account-query-lifecycle'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/account-query-lifecycle/result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
