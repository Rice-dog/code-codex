import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const source=await readFile(new URL('../resources/account-host-capabilities.js',import.meta.url),'utf8');
const probePath=resolve('artifacts/host-capabilities/probe.mjs');await mkdir(resolve('artifacts/host-capabilities'),{recursive:true});await writeFile(probePath,source);const {qualifyHostModules,managerRole,dispatcherRole,discoverSharedDispatcher}=await import('file:///'+probePath.replaceAll('\\','/'));
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
assert.equal(rpc,0);checks.push('All compatibility probes perform zero RPC, authentication, hook, state or inference operations');
const out=resolve('artifacts/host-capabilities');await mkdir(out,{recursive:true});await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,scope:'Production capability resolver with controlled old/new/future role fixtures. Does not promise arbitrary future breaking interfaces.'},null,2));console.log(JSON.stringify({passed:true,checks}));
