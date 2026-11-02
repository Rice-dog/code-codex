// The trusted host namespace can expose an out-of-renderer manager service.
// Its RPC client is not a mutable legacy manager and must not be treated as one.
type Native=Record<string,any>;
export function rpcManagerService(namespace:Native):Native|undefined {
 const matches=new Set<Native>();
 for(const value of Object.values(namespace)){
  if(!value||typeof value!=='object')continue;
  const fields=Object.getOwnPropertyDescriptors(value);
  if(fields.appServerManagers?.value&&fields.executionHosts?.value&&fields.clientCoordination?.value&&fields.appActions?.value)matches.add(fields.appServerManagers.value);
 }
 if(matches.size>1)throw Error('ACCOUNT_RPC_SERVICE_AMBIGUOUS: Multiple native manager services were exposed. No account execution was enabled.');
 return [...matches][0];
}
export interface RpcObservation {
 dispose():void;
 state(id:string):Promise<{inProgress:boolean;activeTurnId?:string|null}|null>;
 start(id:string,operation:Native):Promise<unknown>;
 settings(id:string):Promise<Native>;
}
/** Owned subscriptions only. Never reads history, changes auth or sends a turn. */
export async function observeRpcManager(service:Native,ports:{admit(id:string):Promise<void>;notification(method:string,params:Native):void;unavailable(error:unknown):void;available?():Promise<void>}):Promise<RpcObservation>{
 let stopped=false,client:Native|undefined,registryLease:Native|undefined,epoch=0;
 const owned=new Set<Native>();
 const release=(value:Native|undefined)=>{try{value?.[Symbol.dispose as unknown as string]?.();}catch{}};
 const own=async(value:PromiseLike<Native>,generation:number)=>{const lease=await value;if(stopped||epoch!==generation)release(lease);else owned.add(lease);};
 const retire=()=>{epoch++;for(const lease of owned)release(lease);owned.clear();release(client);client=undefined;};
 let resolveReady!:()=>void,rejectReady!:(e:unknown)=>void;
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const fail=(error:unknown)=>{rejectReady(error);if(!stopped)ports.unavailable(error);};
 const registry=service.dup();
 try{
  const subscription=registry.subscribe('local',(update:Native)=>{
   if(stopped)return;
   if(update.status!=='ready'){if(client){retire();ports.unavailable(Error('ACCOUNT_RPC_SERVICE_DISCONNECTED: The native manager service is no longer ready. No account fallback is permitted.'));}return;}
   retire();const generation=epoch;
   // Callback capabilities are borrowed. dup before leaving the callback.
   client=update.manager.dup();
   void Promise.all([
    own(client!.registerReplayAdmission(async(id:string)=>{if(!stopped&&generation===epoch)await ports.admit(id);}),generation),
    own(client!.subscribe({type:'notification',key:{hostId:'local'},methods:['account/updated','account/rateLimits/updated','turn/started','turn/completed','error','thread/compacted','item/started','item/completed','thread/closed'],listener:(message:Native)=>{if(!stopped&&generation===epoch)ports.notification(message.method,message.params);}}),generation),
   ]).then(async()=>{if(!stopped&&generation===epoch){await ports.available?.();resolveReady();}},error=>{if(generation===epoch)fail(error);}).catch(fail);
  });
  void Promise.resolve(subscription).then(lease=>{if(stopped)release(lease);else registryLease=lease;},fail);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('ACCOUNT_RPC_OBSERVATION_TIMEOUT: Native execution observation did not become ready within 12 seconds.')),12000);})]);}finally{clearTimeout(timer);}
 }catch(error){stopped=true;for(const lease of owned)release(lease);release(client);release(registryLease);release(registry);throw error;}
 return {state:async id=>{const value=await client?.getThreadExecutionState(id)??null;if(value!==null&&typeof value.inProgress!=='boolean')throw Error('ACCOUNT_RPC_STATE_PROTOCOL: Native turn observation did not include a boolean inProgress field. Idle was not inferred.');return value;},
 start:async(id,operation)=>{if(!client||stopped)throw Error('ACCOUNT_RPC_UNAVAILABLE: The native execution service is disconnected. No turn was sent.');const outcome=await client.startTurnWithOutcome(id,operation);if(outcome!=='accepted')throw Error(outcome==='rejected'?'ACCOUNT_AUTO_NOT_SENT: The native continuation was rejected before dispatch.':'ACCOUNT_AUTO_OUTCOME_UNKNOWN: Native continuation acceptance could not be verified. It was not replayed.');return outcome;},
 settings:async id=>{if(!client||stopped)throw Error('ACCOUNT_RPC_UNAVAILABLE: The native execution service is disconnected.');return await client.getThreadExecutionState(id);},
 dispose(){if(stopped)return;stopped=true;for(const lease of owned)release(lease);owned.clear();release(client);release(registryLease);release(registry);}};
}
