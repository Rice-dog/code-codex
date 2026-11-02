import type {AccountRequest,AccountsInfo} from './contracts';
import {bindAccountTransport,type AccountHandoff,type BoundAccountRequest} from './transport';
import {runtimeEvent} from '../../runtime-events';

/** Transfer one concrete native lease, drain late reads, then retire only local hooks. */
export async function retireLegacyAccountAdapter(recovery?:AccountRequest,current:()=>boolean=()=>true):Promise<void>{
 const globals=window as unknown as Record<symbol,any>,state=globals[Symbol.for('code-codex:multi-account-runtime:v1')],adapter=state?.adapter;
 // The capability slot is concrete. A legacy adapter.request can be a dynamic
 // global lookup, so prefer the captured slot unless the adapter is itself bound.
 const slot=globals[Symbol.for('code-codex:accounts-capability:v1')]?.request as BoundAccountRequest|undefined;
 let port=(adapter?.request?.runtimeIdentity?adapter.request:slot??adapter?.request) as BoundAccountRequest|undefined;
 if(!port)return;
 // A suspended slot owns no native lease and performs no account operations.
 if((port as BoundAccountRequest&{runtimeSuspended?:boolean}).runtimeSuspended&&!adapter&&!state?.selector)return;
 // Pre-protocol controllers use requestAccounts (a global lookup). Freeze that
 // exact old slot too; it must not remain a route around the drain gate.
 if(slot===port&&!port.beginAccountHandoff){
  const wrapped=bindAccountTransport(port,'legacy-captured-endpoint');
  Object.assign(wrapped,{runtimeVersion:(port as AccountRequest&{runtimeVersion?:string}).runtimeVersion,runtimeSuspended:(port as AccountRequest&{runtimeSuspended?:boolean}).runtimeSuspended===true});
  globals[Symbol.for('code-codex:accounts-capability:v1')].request=wrapped;
  port=wrapped;
 }
 const retiredKey=Symbol.for('code-codex:retired-account-ports:v1'),retired:WeakSet<object>=globals[retiredKey]??=new WeakSet();
 let handoff:AccountHandoff|undefined,released=retired.has(port),stage='preflight',accountUnavailable=false,readonlyObserver=false;const started=performance.now();
 const initialGeneration=state?.generation;
 const event=(outcome:string,details:Record<string,unknown>={})=>runtimeEvent('accounts','account.handoff',outcome,{stage,nativeBinding:port.runtimeIdentity??'legacy-unbound',released,durationMs:Math.round(performance.now()-started),taskSent:false,...details});
 const idle=async(request:AccountRequest,info:AccountsInfo):Promise<AccountsInfo>=>{
  for(const id of info.sharedConversations??[]){try{await request({action:'shared.reconcile',owner:info.owner.id,conversationId:id});}catch(error){if(String(error).includes('ACCOUNT_TURN_ACTIVE')||(error as {code?:string})?.code==='ACCOUNT_TURN_ACTIVE')throw Object.assign(Error('ACCOUNT_UPGRADE_ACTIVE: The previous executor remains active. Upgrade is deferred without closing its endpoint.'),{code:'ACCOUNT_UPGRADE_ACTIVE',cause:error});throw error;}}
  if(info.activeConversations.length||info.sharedConversations?.length)info=await request<AccountsInfo>({action:'info'});
  if(info.activeConversations.length)throw Error('ACCOUNT_UPGRADE_ACTIVE: A previous execution is still active. No lease was released and no task was stopped.');
  return info;
 };
 const localIdle=()=>{
  if(!current())throw Object.assign(Error('ACCOUNT_HANDOFF_YIELDED: A newer activation cancelled this handoff. No lease was released.'),{code:'ACCOUNT_HANDOFF_YIELDED'});
  const status=adapter?.handoffStatus?.();
  // v18 observed official main-process turns but owned no execution transport.
  // Its native lease still has to prove zero shared/active work at each gate.
  const diagnostic=adapter?.diagnostics?.();
  if(readonlyObserver&&state?.viewRevision==='account-native-routing-v18'&&state.adapter===adapter&&diagnostic?.mode==='native-rpc'&&diagnostic.independentExecution===false&&diagnostic.attachedManagers===0&&status?.reason==='active-turn'&&!status.autoPending&&!adapter.status?.().preparing)return;
  if(status?.busy||!status&&adapter&&(!adapter.canDisable?.()||adapter.status?.().busy)){
   event('deferred',{reason:status?.reason??'adapter-work-pending',activeTasks:status?.activeTasks,autoPending:status?.autoPending,endpointAvailable:true});
   throw Object.assign(Error('ACCOUNT_UPGRADE_ACTIVE: Account work is pending. Upgrade is deferred; the previous endpoint remains available.'),{code:'ACCOUNT_UPGRADE_ACTIVE'});
  }
 };
 const observe=async(request:AccountRequest):Promise<AccountsInfo>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([request<AccountsInfo>({action:'info'}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('The previous account transport did not respond within five seconds.'),{code:'TIMEOUT'})),5000);})]);}
  finally{clearTimeout(timer);}
 };
 const uninitialized=()=>{
  localIdle();
  if(adapter||state?.adapter||state?.selector||globals[Symbol.for('code-codex:multi-account-runtime:v1')]!==state||state?.generation!==initialGeneration)
   throw Object.assign(Error('ACCOUNT_UPGRADE_UNVERIFIED: Unsupported account qualification cannot retire an existing or changed adapter. The previous endpoint remains available.'),{code:'ACCOUNT_UPGRADE_UNVERIFIED'});
 };
 try{
  let info:AccountsInfo|undefined;
  if(!released){
   // Observe before closing the endpoint: the awaited task still needs events/Stop.
   stage='preflight-info';
   try{info=await observe(port);}
   catch(error){
    if((error as {code?:unknown})?.code==='ACCOUNT_FEATURE_SUSPENDED'&&recovery){
     // Older compositions can wrap the local rejecting slot without retaining
     // its marker. Never infer an idle native lease from that error alone.
     stage='suspended-account-preflight';
     const suspended=()=>{uninitialized();if(state?.enabled!==false)throw Object.assign(Error('ACCOUNT_UPGRADE_UNVERIFIED: The suspended endpoint has no stable disabled runtime proof. The previous endpoint remains available.'),{code:'ACCOUNT_UPGRADE_UNVERIFIED'});};
     suspended();await idle(recovery,await recovery<AccountsInfo>({action:'info'}));suspended();
     if(!port.beginAccountHandoff)throw Object.assign(Error('ACCOUNT_UPGRADE_UNVERIFIED: The suspended wrapper cannot be drained safely.'),{code:'ACCOUNT_UPGRADE_UNVERIFIED'});
     handoff=await port.beginAccountHandoff();suspended();handoff.seal?.();handoff.release();retired.add(port);released=true;
     event('retired-suspended',{reason:'wrapped-suspended-slot',exclusiveLeaseVerified:true,nativeLeaseReleased:false,previousEndpointRetired:true,activeTasks:0});
    }else if((error as {code?:unknown})?.code==='ACCOUNT_HOST_UNSUPPORTED'&&recovery){
     // This exact native error is emitted before owner/credential state is
     // loaded. A successfully qualified service caches that success. It does
     // not mean an existing adapter/lease may be discarded on a generic error.
     stage='unsupported-account-preflight';uninitialized();
     try{await idle(recovery,await recovery<AccountsInfo>({action:'info'}));}
     catch(candidate){if((candidate as {code?:unknown})?.code!=='ACCOUNT_HOST_UNSUPPORTED')throw candidate;accountUnavailable=true;}
     uninitialized();
     if(!port.beginAccountHandoff)throw Object.assign(Error('ACCOUNT_UPGRADE_UNVERIFIED: The uninitialized endpoint cannot be drained safely.'),{code:'ACCOUNT_UPGRADE_UNVERIFIED'});
     handoff=await port.beginAccountHandoff();uninitialized();handoff.seal?.();handoff.release();retired.add(port);released=true;
     event('retired-uninitialized',{reason:'unsupported-account-profile',errorCode:'ACCOUNT_HOST_UNSUPPORTED',accountFeatureUnavailable:accountUnavailable,accountStateLoaded:false,nativeLeaseReleased:false,previousEndpointRetired:true});
    }else{
    if(!(error&&typeof error==='object'&&'code' in error&&error.code==='TIMEOUT')||!recovery)throw error;
    // A replacement can recover a dead endpoint only by acquiring the native
    // exclusive lease. A live holder rejects this path; never steal or kill it.
    stage='replacement-exclusive-check';info=await idle(recovery,await recovery<AccountsInfo>({action:'info'}));
    released=true;retired.add(port);port.retireAfterExclusiveProbe?.();event('recovered',{reason:'previous-transport-timeout',exclusiveLeaseVerified:true,activeTasks:0});
    }
   }
   if(!released){
    const diagnostic=adapter?.diagnostics?.();readonlyObserver=state?.viewRevision==='account-native-routing-v18'&&diagnostic?.mode==='native-rpc'&&diagnostic.independentExecution===false&&diagnostic.attachedManagers===0&&info?.nativeRouting!==true&&!info?.sharedConversations?.length&&!info?.activeConversations.length&&!Object.keys(info?.nativeRoutes??{}).length;
    localIdle();
    stage='preflight-idle';info=await idle(port,info!);localIdle();
    stage='drain';
    if(port.beginAccountHandoff){handoff=await port.beginAccountHandoff();released ||= handoff.released;}
    const request=handoff?.request??port;
    // A turn/continuation can start during the asynchronous preflight.
    localIdle();info=await request<AccountsInfo>({action:'info'});if(info.sharedConversations?.length||info.activeConversations.length||Object.keys(info.nativeRoutes??{}).length)readonlyObserver=false;
    stage='previous-idle';
    if(info.activeConversations.length)throw Object.assign(Error('ACCOUNT_UPGRADE_ACTIVE: Execution started during preflight. No lease was released.'),{code:'ACCOUNT_UPGRADE_ACTIVE'});
    localIdle();handoff?.seal?.();
    stage='previous-release';await request({action:'release',owner:info.owner.id});
    released=true;retired.add(port);handoff?.release();event('released',{activeTasks:0});
    if(recovery){stage='replacement-exclusive-check';const next=await idle(recovery,await recovery<AccountsInfo>({action:'info'}));if(next.owner.id!==info.owner.id)throw Error('ACCOUNT_HANDOFF_OWNER_CHANGED: The official login changed during lease transfer.');}
   }
  }else if(recovery){stage='replacement-exclusive-retry';await idle(recovery,await recovery<AccountsInfo>({action:'info'}));}
  stage='local-hooks';
  if(adapter){
   if(typeof adapter.dispose!=='function'||typeof adapter.canDisable!=='function')throw Error('ACCOUNT_UPGRADE_CONTRACT: The previous adapter cannot be retired safely.');
   const original=adapter.request,canDisable=adapter.canDisable;
   adapter.request=async(p:Record<string,unknown>)=>{if(p.action==='info')return {owner:{id:'retired-account-adapter'}};if(p.action==='release')return {released:true};throw Error('ACCOUNT_ADAPTER_RETIRED: The previous transport is retired.');};
   adapter.canDisable=()=>true;
   try{await adapter.dispose();}finally{adapter.request=original;adapter.canDisable=canDisable;}
  }
  state?.selector?.dispose();if(state){delete state.selector;delete state.adapter;state.error=undefined;state.generation=(state.generation??0)+1;}
  event('confirmed',{activeTasks:0,accountFeatureUnavailable:accountUnavailable});
 }catch(error){if(!released)handoff?.rollback();const code=error&&typeof error==='object'&&'code' in error?error.code:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0]??'ACCOUNT_HANDOFF_FAILED';event(code==='ACCOUNT_UPGRADE_ACTIVE'||code==='ACCOUNT_HANDOFF_YIELDED'?'deferred':'failed',{errorCode:code,endpointAvailable:!released,rollback:released?'old-endpoint-remains-retired':'previous-endpoint-resumed'});throw error;}
}
