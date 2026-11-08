/** Version-independent, bounded probes of official host module roles. No RPC is executed here. */
const rolePath=/^\.\/assets\/app-(initial|shared)-[A-Za-z0-9_-]+\.js$/;
function failure(stage,role,count){return Object.assign(Error(`ACCOUNT_HOST_UNSUPPORTED: Required host capability could not be verified. stage=${stage}; capability=${role}; matches=${count}; accountStateLoaded=false; no task was sent.`),{code:'ACCOUNT_HOST_UNSUPPORTED',stage,capability:role,matches:count});}
function method(value,name){for(let p=value,depth=0;p&&depth<8&&p!==Object.prototype&&p!==Function.prototype;p=Object.getPrototypeOf(p),depth++){const d=Object.getOwnPropertyDescriptor(p,name);if(d)return typeof d.value==='function';}return false;}
function unique(entries,role){const values=new Map();for(const e of entries)if(!values.has(e.value))values.set(e.value,e);if(values.size!==1)throw failure('role-selection',role,values.size);return [...values.values()][0];}
export function dispatcherRole(namespace){return unique(Object.entries(namespace).filter(([,v])=>v&&method(v,'subscribe')&&method(v,'dispatchMessage')).map(([key,value])=>({key,value})),'dispatcher');}
function managerMethod(value,name){if(method(value.prototype,name))return true;for(let p=value.prototype,depth=0;p&&p!==Object.prototype&&depth<8;p=Object.getPrototypeOf(p),depth++){const ctor=Object.getOwnPropertyDescriptor(p,'constructor')?.value;if(typeof ctor==='function'&&new RegExp('\\b'+name+'\\s*=').test(Function.prototype.toString.call(ctor)))return true;}return false;}
export function managerRole(namespace){return unique(Object.entries(namespace).filter(([,v])=>typeof v==='function'&&v.prototype&&['getConversation','startTurn','getStreamRole','onNotification','onRequest'].every(k=>method(v.prototype,k))&&['executeTurnStart','sendAppServerResponse'].every(k=>managerMethod(v,k))).map(([key,value])=>({key,value})),'conversation-manager');}
// Numbered Rspack entries expose the existing runtime. Only already initialized
// modules are inspected: never require an arbitrary factory or execute source.
const numberedPath=/^\.\/assets\/[0-9]+\.[A-Za-z0-9_-]+\.js$/;
const numberedAddress=/^(\.\/assets\/[0-9]+\.[A-Za-z0-9_-]+\.js)#cc-host=(initial|shared|actions|appearance)$/;
const cacheSlot=Symbol.for('code-codex:official-module-role-cache:v1');
const runtimeRoleCache=typeof window==='undefined'?new WeakMap():window[cacheSlot] instanceof WeakMap?window[cacheSlot]:new WeakMap();
if(typeof window!=='undefined'&&!window[cacheSlot])Object.defineProperty(window,cacheSlot,{value:runtimeRoleCache,configurable:true});
export function validHostModulePath(path){return typeof path==='string'&&path.length<=256&&(rolePath.test(path)||numberedAddress.test(path));}
function runtimeFrom(namespace){
 const found=new Set();for(const value of Object.values(namespace)){
  if(typeof value!=='function')continue;
  const d=Object.getOwnPropertyDescriptors(value);
  if(d.c?.value&&typeof d.c.value==='object'&&d.m?.value&&typeof d.m.value==='object'&&typeof d.e?.value==='function'&&typeof d.C?.value==='function')found.add(value);
 }
 if(found.size>1)throw failure('runtime-selection','runtime',found.size);
 return [...found][0];
}
function cachedRoleModules(runtime){
 const ids=Object.keys(runtime.c);if(ids.length>32768)throw failure('runtime-cache-budget','runtime',ids.length);
 const prior=runtimeRoleCache.get(runtime);if(prior?.count===ids.length)return prior.groups;
 const groups={initial:[],shared:[],actions:[],appearance:[]};let bytes=0;
 for(const id of ids){
  const entry=Object.getOwnPropertyDescriptor(runtime.c,id)?.value,factory=Object.getOwnPropertyDescriptor(runtime.m,id)?.value;
  if(!entry||entry.error||typeof factory!=='function'||!entry.exports)continue;
  const source=Function.prototype.toString.call(factory);bytes+=source.length;if(bytes>64*1024*1024)throw failure('runtime-source-budget','runtime',ids.length);
  const roles=[];
  if(source.includes('executeTurnStart')&&source.includes('sendAppServerResponse')||source.includes('AppServerManager RPC is unavailable for hostId:')&&source.includes('.forHost('))roles.push('initial');
  if(source.includes('dispatchMessage')&&source.includes('startWindowMessageListener')&&source.includes('subscribe')||source.includes('appServices')&&source.includes('setAppServices'))roles.push('shared');
  if(source.includes('appActionRegistry'))roles.push('actions');
  if(source.includes('appServices')&&source.includes('setAppServices'))roles.push('appearance');
  for(const role of roles){if(groups[role].length>=16)throw failure('runtime-role-budget',role,groups[role].length+1);groups[role].push(id);}
 }
 runtimeRoleCache.set(runtime,{count:ids.length,groups});return groups;
}
export async function loadHostNamespace(address,load=path=>import(/* @vite-ignore */path)){
 const matched=typeof address==='string'&&address.length<=256?numberedAddress.exec(address):null;
 if(!matched){if(typeof address!=='string'||address.length>256||!/^\.\/assets\/(?:app-(?:initial|shared)-|register-app-actions-)[A-Za-z0-9_-]+\.js$/.test(address))throw failure('module-path','namespace',0);return await load(address);}
 const runtime=runtimeFrom(await load(matched[1]));if(!runtime)throw failure('runtime-contract','runtime',0);
 const out=Object.create(null),ids=cachedRoleModules(runtime)[matched[2]];
 for(const id of ids){const entry=Object.getOwnPropertyDescriptor(runtime.c,id)?.value;if(!entry||entry.error||!entry.exports)continue;
  const descriptors=Object.getOwnPropertyDescriptors(entry.exports);if(Object.keys(descriptors).length>512)throw failure('runtime-export-budget',matched[2],513);
  for(const [key,d] of Object.entries(descriptors)){
   if(!d.enumerable)continue;const value=d.get?d.get.call(entry.exports):d.value;
   // Rspack ESM getters are evaluated only in semantically selected cached modules.
   if(key==='appActionRegistry'&&matched[2]==='actions')out[key]=value;
   else out[id+'.'+key]=value;
  }
 }
 return out;
}
export async function qualifyNumberedHost(manifest,load=path=>import(/* @vite-ignore */path)){
 const paths=manifest.runtimes;if(!Array.isArray(paths)||!paths.length||paths.length>4)throw failure('module-discovery','runtime',Array.isArray(paths)?paths.length:0);
 for(const path of paths)if(typeof path!=='string'||path.length>200||!numberedPath.test(path))throw failure('module-path','runtime',0);
 const matches=[];for(const path of new Set(paths)){
  let namespace;try{namespace=await load(path);}catch{throw failure('module-import','runtime',0);}
  if(!runtimeFrom(namespace))continue;
  const initial=path+'#cc-host=initial',shared=path+'#cc-host=shared';
  const manager=managerRole(await loadHostNamespace(initial,load)),dispatcher=dispatcherRole(await loadHostNamespace(shared,load));
  matches.push({version:String(manifest.version??'unknown').slice(0,64),initial,shared,managerExport:manager.key,senderExport:'',dispatcherExport:dispatcher.key,actions:[path+'#cc-host=actions'],appearance:[path+'#cc-host=appearance'],compatibility:'capabilities',contractRevision:2});
 }
 if(matches.length!==1)throw failure('runtime-selection','runtime',matches.length);
 return Object.freeze(matches[0]);
}
export async function qualifyHostModules(manifest,load=path=>import(/* @vite-ignore */path)){
 if(!manifest.initial?.length&&!manifest.shared?.length&&manifest.runtimes?.length)return qualifyNumberedHost(manifest,load);
 const groups={initial:[],shared:[]};
 for(const role of Object.keys(groups)){const candidates=manifest[role];if(!Array.isArray(candidates)||!candidates.length||candidates.length>4)throw failure('module-discovery',role,Array.isArray(candidates)?candidates.length:0);for(const path of candidates)if(typeof path!=='string'||!rolePath.test(path)||!path.startsWith('./assets/app-'+role+'-'))throw failure('module-path',role,0);}
 for(const [role,paths] of Object.entries(groups)){
  const candidates=manifest[role];if(!Array.isArray(candidates)||!candidates.length||candidates.length>4)throw failure('module-discovery',role,Array.isArray(candidates)?candidates.length:0);
  for(const path of new Set(candidates)){if(!rolePath.test(path)||!path.startsWith('./assets/app-'+role+'-'))throw failure('module-path',role,0);let namespace;try{namespace=await load(path);}catch{throw failure('module-import',role,0);}let candidate;try{candidate=role==='initial'?managerRole(namespace):dispatcherRole(namespace);}catch(error){if(error?.code!=='ACCOUNT_HOST_UNSUPPORTED'||error.matches!==0)throw error;continue;}paths.push({...candidate,path});}
 }
 const manager=unique(groups.initial,'conversation-manager'),dispatcher=unique(groups.shared,'dispatcher');
 return Object.freeze({version:String(manifest.version??'unknown').slice(0,64),initial:manager.path,shared:dispatcher.path,managerExport:manager.key,senderExport:'',dispatcherExport:dispatcher.key,compatibility:'capabilities',contractRevision:1});
}
export async function discoverSharedDispatcher(load=path=>import(/* @vite-ignore */path)){
 const verified=window[Symbol.for('code-codex:account-host-profile:v1')];
 const urls=[...(verified?.shared?[verified.shared]:[]),...Array.from(document.querySelectorAll('script[src],link[rel="modulepreload"][href]'),e=>e.src||e.href),...performance.getEntriesByType('resource').map(e=>e.name)];
 const paths=[...new Set(urls.flatMap(value=>{try{const u=new URL(value,location.href);const path='.'+u.pathname;return u.origin===location.origin&&u.protocol===location.protocol&&u.host===location.host&&!u.search&&!u.hash&&rolePath.test(path)&&path.startsWith('./assets/app-shared-')?[path]:[];}catch{return [];}}))];
 if(!paths.length){
  const runtimes=[...new Set(urls.flatMap(value=>{try{const u=new URL(value,location.href),path='.'+u.pathname;return u.protocol===location.protocol&&u.host===location.host&&!u.search&&!u.hash&&numberedPath.test(path)?[path]:[];}catch{return [];}}))];
  if(!runtimes.length||runtimes.length>4)throw failure('module-discovery','dispatcher',runtimes.length);
  const found=[];for(const path of runtimes){if(!runtimeFrom(await load(path)))continue;found.push(dispatcherRole(await loadHostNamespace(path+'#cc-host=shared',load)));}
  return unique(found,'dispatcher').value;
 }
 if(paths.length>4)throw failure('module-discovery','dispatcher',paths.length);
 const matches=[];for(const path of paths){try{matches.push({...dispatcherRole(await load(path)),path});}catch(error){if(error?.code!=='ACCOUNT_HOST_UNSUPPORTED'||error.matches!==0)throw error;}}
 return unique(matches,'dispatcher').value;
}
