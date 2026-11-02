/** Version-independent, bounded probes of official host module roles. No RPC is executed here. */
const rolePath=/^\.\/assets\/app-(initial|shared)-[A-Za-z0-9_-]+\.js$/;
function failure(stage,role,count){return Object.assign(Error(`ACCOUNT_HOST_UNSUPPORTED: Required host capability could not be verified. stage=${stage}; capability=${role}; matches=${count}; accountStateLoaded=false; no task was sent.`),{code:'ACCOUNT_HOST_UNSUPPORTED',stage,capability:role,matches:count});}
function method(value,name){for(let p=value,depth=0;p&&depth<8&&p!==Object.prototype&&p!==Function.prototype;p=Object.getPrototypeOf(p),depth++){const d=Object.getOwnPropertyDescriptor(p,name);if(d)return typeof d.value==='function';}return false;}
function unique(entries,role){const values=new Map();for(const e of entries)if(!values.has(e.value))values.set(e.value,e);if(values.size!==1)throw failure('role-selection',role,values.size);return [...values.values()][0];}
export function dispatcherRole(namespace){return unique(Object.entries(namespace).filter(([,v])=>v&&method(v,'subscribe')&&method(v,'dispatchMessage')).map(([key,value])=>({key,value})),'dispatcher');}
function managerMethod(value,name){if(method(value.prototype,name))return true;for(let p=value.prototype,depth=0;p&&p!==Object.prototype&&depth<8;p=Object.getPrototypeOf(p),depth++){const ctor=Object.getOwnPropertyDescriptor(p,'constructor')?.value;if(typeof ctor==='function'&&new RegExp('\\b'+name+'\\s*=').test(Function.prototype.toString.call(ctor)))return true;}return false;}
export function managerRole(namespace){return unique(Object.entries(namespace).filter(([,v])=>typeof v==='function'&&v.prototype&&['getConversation','startTurn','getStreamRole','onNotification','onRequest'].every(k=>method(v.prototype,k))&&['executeTurnStart','sendAppServerResponse'].every(k=>managerMethod(v,k))).map(([key,value])=>({key,value})),'conversation-manager');}
export async function qualifyHostModules(manifest,load=path=>import(/* @vite-ignore */path)){
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
 if(!paths.length||paths.length>4)throw failure('module-discovery','dispatcher',paths.length);
 const matches=[];for(const path of paths){try{matches.push({...dispatcherRole(await load(path)),path});}catch(error){if(error?.code!=='ACCOUNT_HOST_UNSUPPORTED'||error.matches!==0)throw error;}}
 return unique(matches,'dispatcher').value;
}
