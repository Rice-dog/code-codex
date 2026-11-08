import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=await readFile(new URL('../resources/account-host-capabilities.js',import.meta.url),'utf8');
const probePath=resolve('artifacts/host-capabilities/probe.mjs');await mkdir(resolve('artifacts/host-capabilities'),{recursive:true});await writeFile(probePath,source);const {qualifyHostModules,managerRole,dispatcherRole,discoverSharedDispatcher,loadHostNamespace,validHostModulePath}=await import('file:///'+probePath.replaceAll('\\','/'));
const checks=[];let rpc=0;
class OldManager{getConversation(){}startTurn(){}getStreamRole(){}onNotification(){}onRequest(){}executeTurnStart(){}sendAppServerResponse(){}}
class NewManager{getConversation(){}startTurn(){}getStreamRole(){}onNotification(){}onRequest(){}executeTurnStart=async()=>{};sendAppServerResponse=()=>{};}
class Dispatcher{subscribe(){rpc++;}dispatchMessage(){rpc++;}}
const bus=new Dispatcher();
const manifest=(version,hash='old')=>({version,initial:[`./assets/app-initial-${hash}.js`],shared:[`./assets/app-shared-${hash}.js`]});
for(const [version,Manager,name] of [['26.1023.6123.0',OldManager,'old'],['26.1027.3384.0',NewManager,'new'],['99.9999.9999.0',NewManager,'future'],['1.0.0.0',OldManager,'earlier']]){
 const m=manifest(version,name);const p=await qualifyHostModules(m,async path=>path.includes('initial')?{renamedManager:Manager}:{renamedDispatcher:bus});assert.equal(p.version,version);assert.equal(p.compatibility,'capabilities');assert.equal(p.managerExport,'renamedManager');assert.equal(p.dispatcherExport,'renamedDispatcher');checks.push(`Capability-compatible ${name} build is accepted without a version floor/ceiling or a fixed export/hash`);
}
assert.equal(managerRole({one:NewManager,alias:NewManager}).value,NewManager);assert.equal(dispatcherRole({a:bus,b:bus}).value,bus);checks.push('Re-export aliases of one concrete role are deduplicated');
class OtherManager extends NewManager{};
assert.throws(()=>managerRole({one:NewManager,two:OtherManager}),/matches=2/);assert.throws(()=>dispatcherRole({a:bus,b:new Dispatcher()}),/matches=2/);checks.push('Ambiguous distinct roles are rejected without choosing the first');
class Missing extends NewManager{};Missing.prototype.onRequest=null;
assert.throws(()=>managerRole({Missing}),/matches=0/);checks.push('A missing required notification/request interface is rejected before hooks or account state');
const proxy=new Proxy(function(){},{get:()=>()=>{}});assert.throws(()=>dispatcherRole({proxy}),/matches=0/);checks.push('Callable RPC proxies cannot impersonate the concrete dispatcher');
let getter=0;const trap={get subscribe(){getter++;return ()=>{};},dispatchMessage(){}};assert.throws(()=>dispatcherRole({trap}),/matches=0/);assert.equal(getter,0);checks.push('Capability inspection does not invoke object method getters');
for(const bad of ['https://evil.test/assets/app-initial-x.js','../assets/app-initial-x.js','./assets/app-shared-x.js','./assets/app-initial-x.js?x=1']){let imports=0;await assert.rejects(qualifyHostModules({...manifest('future'),initial:[bad]},async()=>{imports++;return {}}),/stage=module-path/);assert.equal(imports,0);}
checks.push('External, redirected, wrong-role and query-bearing module paths are rejected before import');
await assert.rejects(qualifyHostModules({...manifest('future'),initial:[]}),/module-discovery/);await assert.rejects(qualifyHostModules({...manifest('future'),shared:Array(5).fill('./assets/app-shared-a.js')}),/module-discovery/);checks.push('Missing or over-budget module discovery is bounded');
await assert.rejects(qualifyHostModules(manifest('future'),async()=>{throw Error('import failed')}),/module-import/);checks.push('Module import failure retains a specific stage and no-task boundary');
globalThis.window={};globalThis.location={href:'app://-/index.html',origin:'null',protocol:'app:',host:'-'};globalThis.document={querySelectorAll:()=>[{src:'app://-/assets/app-shared-new.js'},{src:'app://evil/assets/app-shared-fake.js'}]};globalThis.performance={getEntriesByType:()=>[]};
let paths=[];assert.equal(await discoverSharedDispatcher(async p=>{paths.push(p);return {renamed:bus}}),bus);assert.deepEqual(paths,['./assets/app-shared-new.js']);checks.push('Core logout discovery selects the same-origin role without a frozen chunk/export');
// Numbered Rspack fixtures: qualification reads the existing cache, never runs factories.
function runtimeFixture({extraDispatcher=false,missingManager=false}={}){
 let factoryCalls=0;const q=()=>{factoryCalls++;throw Error('No factory may be executed');};q.c={};q.m={};q.e=()=>{throw Error('No chunk loading during qualification')};q.C=()=>{};
 function managerFactory(){/* executeTurnStart sendAppServerResponse */}
 function dispatcherFactory(){/* dispatchMessage startWindowMessageListener subscribe */}
 function servicesFactory(){/* appServices setAppServices */}
 function getterFactory(){/* AppServerManager RPC is unavailable for hostId: .forHost( */}
 function actionFactory(){/* appActionRegistry */}
 q.m.manager=managerFactory;q.c.manager={exports:missingManager?{}:{renamed:NewManager}};
 q.m.dispatch=dispatcherFactory;q.c.dispatch={exports:{bus}};
 q.m.services=servicesFactory;q.c.services={exports:{services:{appServerManagers:{},executionHosts:{},clientCoordination:{},appActions:{}}}};
 q.m.getter=getterFactory;q.c.getter={exports:{getter:()=>{}}};
 q.m.uninitialized=()=>{throw Error('Uninitialized module must not be called')};
 if(extraDispatcher){q.m.other=dispatcherFactory;q.c.other={exports:{other:new Dispatcher()}};}
 return {q,calls:()=>factoryCalls,addActions(){q.m.actions=actionFactory;q.c.actions={exports:{appActionRegistry:new Map()}};}};
}
const path='./assets/123456.renamed_hash.js',numbered={version:'unknown-future',initial:[],shared:[],runtimes:[path]};
let fixture=runtimeFixture(),loads=[];const loader=async p=>{loads.push(p);assert.equal(p,path);return {renamedRuntime:fixture.q}};
let profile=await qualifyHostModules(numbered,loader);assert.equal(profile.contractRevision,2);assert.equal(profile.managerExport,'manager.renamed');assert.equal(profile.dispatcherExport,'dispatch.bus');assert.equal(fixture.calls(),0);
assert.equal(managerRole(await loadHostNamespace(profile.initial,loader)).value,NewManager);assert.equal(dispatcherRole(await loadHostNamespace(profile.shared,loader)).value,bus);checks.push('Unknown-version numbered runtime resolves semantic roles from initialized modules with no factory execution');
assert.equal(validHostModulePath(profile.initial),true);assert.equal(validHostModulePath(path+'?bad#cc-host=initial'),false);
for(const bad of ['https://evil.test/123.abc.js','../assets/123.abc.js',path+'?bad',path+'#bad']){let calls=0;await assert.rejects(qualifyHostModules({...numbered,runtimes:[bad]},async()=>{calls++;return {}}),/module-path/);assert.equal(calls,0);}
checks.push('Numbered runtime addresses reject external, traversal, query and unknown fragments before import');
assert.equal(Object.keys(await loadHostNamespace(profile.actions[0],loader)).length,0);fixture.addActions();assert((await loadHostNamespace(profile.actions[0],loader)).appActionRegistry instanceof Map);checks.push('Lazy official action registry is discovered after actual cache growth without invoking uninitialized factories');
fixture=runtimeFixture({extraDispatcher:true});await assert.rejects(qualifyHostModules(numbered,loader),/capability=dispatcher; matches=2/);assert.equal(fixture.calls(),0);checks.push('Distinct cached dispatchers fail closed without choosing the first or executing modules');
fixture=runtimeFixture({missingManager:true});await assert.rejects(qualifyHostModules(numbered,loader),/conversation-manager; matches=0/);checks.push('Numbered packaging does not bypass missing manager capability checks');
fixture=runtimeFixture();await assert.rejects(qualifyHostModules(numbered,async()=>({one:fixture.q,two:runtimeFixture().q})),/runtime-selection/);checks.push('Ambiguous distinct runtimes are rejected before account state');
await assert.rejects(qualifyHostModules({...numbered,runtimes:Array(5).fill(path)},loader),/module-discovery/);checks.push('Numbered main-entry discovery is bounded');
const malicious={};Object.defineProperty(malicious,'execute',{enumerable:true,get(){throw Error('Unrelated getters must not run')}});fixture.q.c.unrelated={exports:malicious};fixture.q.m.unrelated=function unrelatedFactory(){return 'plain unrelated code'};await qualifyHostModules(numbered,loader);checks.push('Unrelated cached export getters and factory bodies remain untouched');
globalThis.document={querySelectorAll:()=>[{src:'app://-/assets/123456.renamed_hash.js'},{src:'app://evil/assets/123456.renamed_hash.js'}]};assert.equal(await discoverSharedDispatcher(loader),bus);checks.push('Logout observation resolves the numbered dispatcher without account initialization');
assert.equal(rpc,0);checks.push('All compatibility probes perform zero RPC, authentication, hook, state or inference operations');
const out=resolve('artifacts/host-capabilities');await mkdir(out,{recursive:true});await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,scope:'Production capability resolver with controlled old/new/future role fixtures. Does not promise arbitrary future breaking interfaces.'},null,2));console.log(JSON.stringify({passed:true,checks}));
