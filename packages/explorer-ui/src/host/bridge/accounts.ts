import type {AccountRequest} from '../../features/accounts/contracts';
import {ownRequestSlot} from '../../core/document-capability-owner';
import {bindAccountTransport} from '../../features/accounts/transport';
const key=Symbol.for('code-codex:accounts-capability:v1');
type Capability={request?:AccountRequest};
const capability=()=>((window as unknown as Record<symbol,Capability>)[key]??={});
export function connectAccounts(request:<T>(method:string,params:Record<string,unknown>,timeout?:number)=>Promise<T>,identity='account-native-endpoint'):void {
 const next=async<T>(params:Record<string,unknown>):Promise<T>=>{
  const bytes=new TextEncoder().encode(JSON.stringify(params));
  const call=<R>(value:Record<string,unknown>)=>request<R>('explorer.accounts.request',value,['shared.prepare','native.prepare','native.ensure','native.detach'].includes(String(value.action))?120_000:55_000);
  if(bytes.length<48*1024)return call<T>(params);
  if(bytes.length>4*1024*1024)throw Error('ACCOUNT_PAYLOAD_LIMIT: This request exceeds the bounded transfer budget. Conversation history is not transferred by this plugin.');
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const {id}=await call<{id:string}>({action:'payload.start',owner:params.owner,size:bytes.length,sha256});
  let committed=false;
  try{
   for(let offset=0,index=0;offset<bytes.length;offset+=24000,index++)await call({action:'payload.chunk',owner:params.owner,id,index,data:btoa(String.fromCharCode(...bytes.subarray(offset,offset+24000)))});
   const result=await call<T>({action:'payload.commit',owner:params.owner,id});committed=true;return result;
  }finally{if(!committed)await call({action:'payload.cancel',owner:params.owner,id}).catch(()=>{});}
 };
 ownRequestSlot(key,bindAccountTransport(next,identity));
 window.dispatchEvent(new Event('code-codex:accounts-connected'));
}
/** Retire the public slot without publishing a functional native account port. */
export function suspendAccounts():void {
 ownRequestSlot(key,Object.assign(async()=>{throw Object.assign(Error('ACCOUNT_FEATURE_SUSPENDED: Multi-account Tasks is temporarily unavailable. No account operation was sent.'),{code:'ACCOUNT_FEATURE_SUSPENDED'});},{runtimeSuspended:true}));
 const state=(window as unknown as Record<symbol,{enabled:boolean;error?:string}>)[Symbol.for('code-codex:multi-account-runtime:v1')];
 if(state){state.enabled=false;delete state.error;}
}
export const requestAccounts:AccountRequest=params=>capability().request?.(params)??Promise.reject(Error('ACCOUNT_DISCONNECTED: The authenticated account service is unavailable.'));
export function accountRequestSnapshot():AccountRequest {
 const request=capability().request;
 if(!request)throw Error('ACCOUNT_DISCONNECTED: The authenticated account service is unavailable.');
 return request;
}
