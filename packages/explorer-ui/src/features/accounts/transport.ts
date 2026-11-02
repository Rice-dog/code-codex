import type {AccountRequest} from './contracts';
import {runtimeEvent} from '../../runtime-events';

export interface AccountHandoff {
 request:AccountRequest;
 readonly released:boolean;
 seal?():void;
 release():void;
 rollback():void;
}
export type BoundAccountRequest=AccountRequest&{
 runtimeIdentity?:string;
 beginAccountHandoff?():Promise<AccountHandoff>;
 retireAfterExclusiveProbe?():void;
};

/** Concrete native endpoint. User work wins until the idle release is sealed. */
export function bindAccountTransport(request:AccountRequest,identity:string):BoundAccountRequest {
 let mode:'open'|'draining'|'releasing'|'retired'='open',released=false,generation=0,wake:(()=>void)|undefined;
 const pending=new Set<Promise<unknown>>();
 const event=(outcome:string,details:Record<string,unknown>={})=>runtimeEvent('accounts','account.handoff',outcome,{nativeBinding:identity,handoffId:generation,pendingRequests:pending.size,stage:mode,taskSent:false,...details});
 const error=(code:string,message:string)=>Object.assign(Error(`${code}: ${message}`),{code});
 const tracked:AccountRequest=<T>(params:Record<string,unknown>):Promise<T>=>{
  const job=Promise.resolve().then(()=>request<T>(params));pending.add(job);
  void job.finally(()=>pending.delete(job)).catch(()=>{});return job;
 };
 const call:BoundAccountRequest=<T>(params:Record<string,unknown>):Promise<T>=>{
  if(mode==='draining'){
   mode='open';generation++;wake?.();
   event('yielded',{reason:'endpoint-activity',action:typeof params.action==='string'&&/^[a-z.]{1,40}$/.test(params.action)?params.action:'unknown',requestForwarded:true});
  }
  if(mode!=='open'){
   const code=mode==='retired'?'ACCOUNT_TRANSPORT_RETIRED':'ACCOUNT_TRANSPORT_HANDOFF';
   event('request-blocked',{errorCode:code,action:typeof params.action==='string'&&/^[a-z.]{1,40}$/.test(params.action)?params.action:'unknown',requestForwarded:false});
   return Promise.reject(error(code,`The native account endpoint is ${mode}. The request was not forwarded. No task was sent.`));
  }
  return tracked<T>(params);
 };
 call.runtimeIdentity=identity;
 call.retireAfterExclusiveProbe=()=>{released=true;mode='retired';generation++;wake?.();};
 call.beginAccountHandoff=async()=>{
  if(mode==='draining'||mode==='releasing')throw error('ACCOUNT_HANDOFF_BUSY','Another lease handoff is pending.');
  const started=performance.now(),epoch=++generation;mode=released?'retired':'draining';
  const cancelled=new Promise<void>(resolve=>{wake=resolve;});
  const current=()=>{if(epoch!==generation)throw error('ACCOUNT_HANDOFF_YIELDED','Endpoint activity superseded idle release. The previous endpoint remains available.');};
  try{
   while(pending.size){
    current();
    if(performance.now()-started>=15000)throw error('ACCOUNT_HANDOFF_DRAIN',`Account requests have not drained. pendingRequests=${pending.size}; timeoutMs=15000. No lease was released.`);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([Promise.allSettled([...pending]),cancelled,new Promise<void>(resolve=>{timer=setTimeout(resolve,Math.max(0,15000-(performance.now()-started)));})]);}
    finally{clearTimeout(timer);}
   }
   current();
  }catch(failure){if(!released&&epoch===generation)mode='open';throw failure;}
  event('drained',{durationMs:Math.round(performance.now()-started),alreadyReleased:released});
  return {
   request:<T>(params:Record<string,unknown>)=>{current();if(released)throw error('ACCOUNT_TRANSPORT_RETIRED','The released endpoint cannot be reused.');return tracked<T>(params);},
   get released(){return released;},
   seal(){current();if(released)throw error('ACCOUNT_TRANSPORT_RETIRED','The released endpoint cannot be reused.');if(pending.size)throw error('ACCOUNT_HANDOFF_DRAIN','A native observation is still pending. No lease was released.');mode='releasing';event('sealed');},
   release(){released=true;mode='retired';wake=undefined;},
   rollback(){if(!released&&epoch===generation){mode='open';wake=undefined;}}
  };
 };
 return call;
}
