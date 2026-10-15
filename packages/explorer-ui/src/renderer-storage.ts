// Native persistence belongs to Code-Codex; the official app profile remains untouched.
import { runtimeEvent } from './runtime-events';
type Request = <T>(method:string, params?:Record<string,unknown>, timeout?:number)=>Promise<T>;
type BlobDescriptor = {size:number;type:string;sha256:string;name?:string;lastModified?:number};
type Saved = {id:string;record:Record<string,unknown>;blobs:Record<string,BlobDescriptor>};
type Scope = {id:string;db:string;store:string};
const scopes:Scope[]=[{id:'startup',db:'code-codex-startup-transition',store:'video'},
  {id:'particle-image',db:'code-codex-particle-image-background',store:'images'},
  {id:'pixel-sculpt',db:'code-codex-pixel-sculpt',store:'images'}];
const KEY=Symbol.for('code-codex:native-storage:v1');
interface State {persistenceSchema?:number;dispatch?:Promise<void>;lastDispatch?:number;request?:Request;ready?:Promise<void>;initialized?:boolean;restoring:boolean;hooked:boolean;timers:Map<string,ReturnType<typeof setTimeout>>;queues:Map<string,Promise<void>>;fingerprints:Map<string,string>;initializing:Set<string>}
const host=window as unknown as Record<symbol,State>;
const state:State=host[KEY]??={restoring:false,hooked:false,timers:new Map(),queues:new Map(),fingerprints:new Map(),initializing:new Set()};
function call<T>(params:Record<string,unknown>,timeout=30000):Promise<T>{
  if(!state.request)return Promise.reject(new Error('Native persistence unavailable'));
  return state.request<T>('explorer.storage.request',params,timeout);
}
function observed(action:string,error:unknown){runtimeEvent('storage',action,'failed',{reason:String(error),officialProfileUnchanged:true});}
function ownKey(key:string){return key.startsWith('code-codex:')&&!key.includes('lease')&&key.length<=128;}
function preferences(){const values:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&ownKey(key)){const value=localStorage.getItem(key);if(value!==null)values[key]=value;}}return values;}
function schedule(key:string,task:()=>Promise<void>){
  const old=state.timers.get(key);if(old)clearTimeout(old);
  state.timers.set(key,setTimeout(()=>{state.timers.delete(key);const previous=state.queues.get(key)??Promise.resolve();const next=previous.catch(()=>{}).then(task).catch(e=>observed(key,e));state.queues.set(key,next);},350));
}
function open(scope:Scope):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(scope.db,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(scope.store))request.result.createObjectStore(scope.store,{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Media database is in use by another window'));});}
function records(db:IDBDatabase,store:string):Promise<Record<string,unknown>[]>{return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function sha(blob:Blob){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
function encode(bytes:Uint8Array){let value='';for(let start=0;start<bytes.length;start+=8192)value+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(value);}
function decode(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
function fingerprint(record:Record<string,unknown>){return JSON.stringify(record,(_key,v)=>v instanceof Blob?{blobSize:v.size,type:v.type,...(v instanceof File?{name:v.name,modified:v.lastModified}:{})}:v);}
function sameMetadata(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const x=Object.keys(a),y=Object.keys(b);return x.length===y.length&&x.every(k=>Object.hasOwn(b,k)&&sameMetadata((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
async function upload(scope:Scope,record:Record<string,unknown>,saved?:Saved){
  if(typeof record.id!=='string'&&typeof record.id!=='number')return;
  const id=String(record.id),key=scope.id+':'+id,mark=fingerprint(record);
  if(state.fingerprints.get(key)===mark)return;
  const metadata:Record<string,unknown>={},blobs:Record<string,BlobDescriptor>={};
  const fields=Object.entries(record).filter(([key,value])=>['blob','file','thumbnail'].includes(key)&&value instanceof Blob) as [string,Blob][];
  if(!fields.length)return; // Library markers are browser bookkeeping, not image resources.
  const random=crypto.getRandomValues(new Uint8Array(16));const job=[...random].map(b=>b.toString(16).padStart(2,'0')).join('');
  for(const [key,value] of Object.entries(record)){if(!(value instanceof Blob))metadata[key]=value;}
  for(const [field,value] of fields){
    if(value.size===0||value.size>128*1024*1024)throw new Error('User media must contain data and stay within the 128 MB resource limit');
    blobs[field]={size:value.size,type:value.type,sha256:await sha(value),...(value instanceof File?{name:value.name,lastModified:value.lastModified}:{})};
  }
  if(saved&&sameMetadata(metadata,saved.record)&&sameMetadata(blobs,saved.blobs)){state.fingerprints.set(key,mark);return;}
  for(const [field,value] of fields){
    for(let offset=0;offset<value.size;offset+=64*1024){const data=encode(new Uint8Array(await value.slice(offset,offset+64*1024).arrayBuffer()));await call({action:'media.write',scope:scope.id,id,job,field,offset,data});}
  }
  await call({action:'media.commit',scope:scope.id,id,job,record:metadata,blobs});
  state.fingerprints.set(key,mark);
  runtimeEvent('storage','user media persisted','passed',{scope:scope.id,blobCount:fields.length,bytes:fields.reduce((sum,[,v])=>sum+v.size,0),integrityVerified:true});
}
async function restore(scope:Scope,doc:Saved):Promise<Record<string,unknown>>{
  const record={...doc.record};
  for(const [field,descriptor] of Object.entries(doc.blobs)){
    const parts:BlobPart[]=[];let offset=0;
    while(offset<descriptor.size){const chunk=await call<{data:string;size:number;offset:number}>({action:'media.read',scope:scope.id,id:doc.id,field,offset});const bytes=decode(chunk.data);if(chunk.offset!==offset||chunk.size!==descriptor.size||!bytes.length)throw new Error('Native media transfer did not match its descriptor');parts.push(bytes.buffer as ArrayBuffer);offset+=bytes.length;}
    const blob=new Blob(parts,{type:descriptor.type});if(blob.size!==descriptor.size||await sha(blob)!==descriptor.sha256)throw new Error('Native media integrity verification failed');
    record[field]=descriptor.name?new File([blob],descriptor.name,{type:descriptor.type,lastModified:descriptor.lastModified??0}):blob;
  }
  return record;
}
async function syncMedia(scope:Scope,initial=false){
  const db=await open(scope);
  try{
    const local=await records(db,scope.store),saved=await call<Saved[]>({action:'media.list',scope:scope.id});
    const ids=new Set(local.filter(r=>r.blob instanceof Blob||r.file instanceof Blob).map(r=>String(r.id)));
    if(initial){
      // Restore when the browser cache has been cleared, without replacing a live editing session.
      for(const doc of saved){if(ids.has(doc.id))continue;const record=await restore(scope,doc);await new Promise<void>((resolve,reject)=>{const tx=db.transaction(scope.store,'readwrite');tx.objectStore(scope.store).put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});state.fingerprints.set(scope.id+':'+doc.id,fingerprint(record));}
    }else{
      for(const doc of saved){if(!ids.has(doc.id)){await call({action:'media.delete',scope:scope.id,id:doc.id});state.fingerprints.delete(scope.id+':'+doc.id);}}
    }
    // Initial backups run after mount; restoring missing active media must finish before it.
    if(!initial)for(const record of local)await upload(scope,record,saved.find(doc=>doc.id===String(record.id)));
  }finally{db.close();}
}
function installHooks(){
  if(state.hooked)return;state.hooked=true;
  for(const name of ['setItem','removeItem','clear'] as const){const original=Storage.prototype[name];Object.defineProperty(Storage.prototype,name,{configurable:true,writable:true,value:function(this:Storage,...args:unknown[]){const result=Reflect.apply(original,this,args);if(this===window.localStorage&&!state.restoring&&(name==='clear'||ownKey(String(args[0]))))schedule('preferences',()=>call({action:'settings.write',values:preferences()}).then(()=>{}));return result;}});}
  for(const name of ['put','add','delete','clear'] as const){const original=IDBObjectStore.prototype[name];Object.defineProperty(IDBObjectStore.prototype,name,{configurable:true,writable:true,value:function(this:IDBObjectStore,...args:unknown[]){const result=Reflect.apply(original,this,args);const scope=scopes.find(s=>s.db===this.transaction.db.name&&s.store===this.name);if(scope&&!state.initializing.has(scope.id)){for(const key of state.fingerprints.keys()){if(key.startsWith(scope.id+':'))state.fingerprints.delete(key);}this.transaction.addEventListener('complete',()=>schedule(scope.id,()=>syncMedia(scope)),{once:true});}return result;}});}
  window.addEventListener('storage',event=>{if(event.key&&ownKey(event.key))schedule('preferences',()=>call({action:'settings.write',values:preferences()}).then(()=>{}));});
}
export async function flushStartupVideoPersistence():Promise<void> {
  const key='startup',timer=state.timers.get(key);if(timer)clearTimeout(timer);state.timers.delete(key);
  const previous=state.queues.get(key)??Promise.resolve();
  const task=previous.catch(()=>{}).then(()=>syncMedia(scopes[0]!));state.queues.set(key,task);
  await task;
  await call({action:'settings.write',values:preferences()});
}

export function reconnectRendererStorage(request:Request){
  // All storage operations share one lane, leaving the existing 120/s gate room
  // for interactive UI traffic. Never retry a write after an ambiguous result.
  state.request=<T>(method:string,params?:Record<string,unknown>,timeout?:number)=>{
    const next=(state.dispatch??Promise.resolve()).catch(()=>{}).then(async()=>{
      const interval=50;
      const delay=interval-(performance.now()-(state.lastDispatch??-Infinity));
      if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
      state.lastDispatch=performance.now();
      return request<T>(method,params,timeout);
    });
    state.dispatch=next.then(()=>{},()=>{});
    return next;
  };
}
export function initializeRendererStorage():Promise<void>{
  if(state.ready&&state.initialized&&state.persistenceSchema===2)return state.ready;
  state.ready=(async()=>{
    installHooks();
    let saved:Record<string,string>={};
    // Initial bindings may arrive while the CDP execution context is being qualified.
    // Read-only retry is safe; writes and media commits are never blindly replayed.
    for(let attempt=1;;attempt++){
      try{saved=await call<Record<string,string>>({action:'settings.read'},1500);break;}
      catch(error){if(attempt>=3)throw error;runtimeEvent('storage','initial preference read','retrying',{attempt,reason:String(error),readOnly:true});}
    }
    let restored=0,preserved=0;
    state.restoring=true;try{for(const [key,value] of Object.entries(saved)){if(ownKey(key)&&typeof value==='string'){if(localStorage.getItem(key)!==null){preserved++;continue;}localStorage.setItem(key,value);restored++;}}}finally{state.restoring=false;}
    installHooks();await call({action:'settings.write',values:preferences()});
    runtimeEvent('storage','preferences restored','passed',{entryCount:Object.keys(saved).length,restored,preserved,existingBrowserValuesWin:true,officialProfileUnchanged:true});
    const tasks=scopes.map(scope=>{state.initializing.add(scope.id);const task=syncMedia(scope,true).catch(e=>observed('media migration',e)).finally(()=>{state.initializing.delete(scope.id);schedule(scope.id,()=>syncMedia(scope));});state.queues.set(scope.id,task);return task;});
    // Mount active plugins only after their local user media is available.
    await Promise.all(tasks);
    state.persistenceSchema=2;state.initialized=true;
  })().catch(error=>{state.initialized=false;delete state.ready;observed('initialization',error);});
  return state.ready;
}
