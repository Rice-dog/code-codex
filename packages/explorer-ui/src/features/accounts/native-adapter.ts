import {dispatcherRole,managerRole} from '../../../../../resources/account-host-capabilities.js';
import type {AccountRequest,AccountsInfo,EventsResult,NativeAccountStatus} from './contracts';
import {ACCOUNT_UI_CHANGED,ACCOUNT_AUTO_CONTINUE_KEY} from './contracts';
import {normalizeSelection,turnIsActive,conversationTurns,type NativeConversation} from './context';
import {resolveActiveThread} from '../../active-thread';
import {AccountUsageStore} from './quota';
import {projectAssets,usableCredits} from './assets-model';
import {installSessionGuard} from './session-guard';
import {permissionSettings} from './permissions';
import {runtimeEvent} from '../../runtime-events';
import {AccountContinuationCycle,continueAfterQuota,isQuotaExhausted,quotaEligibility,continuationSettings,continuationOperation,type AutoPhase} from './auto-continue';
import {accountErrorCode,streamFault,shouldRetryStream,type StreamFault} from './stream-recovery';
import {rpcManagerService,observeRpcManager,type RpcObservation} from './rpc-observation';

// This file is the only owner of qualified private-host objects. Domain/UI code
// receives narrow typed ports; it must never import the host's mutable store.
type Native=Record<string,any>;
type Operation={request:Native;context?:Native};
type Execute=(id:string,operation:Operation,...rest:any[])=>Promise<any>;
type Send=(method:string,params:Native,...rest:any[])=>Promise<any>;
interface OutcomeObservation {reconciled:boolean;executorReusable?:boolean;previousOutcome?:string;previousTurnId?:string;outcomeReason?:string;outcomeKey?:string;outcomeEvidence?:{bytesRead?:number;tailOffset?:number;limitBytes?:number};}
interface Managed {
 manager:Native;execute:Execute;send:Send;role:(id:string)=>any;
 notification:(...args:any[])=>any;reply:(...args:any[])=>any;
 bindings:Map<string,Binding>;
}
interface Binding {
 id:string;managed:Managed;selected:string;shared:boolean;prepared:boolean;active:boolean;preparing:boolean;pending:Set<string>;error?:string|undefined;stalled?:boolean;stopping?:boolean;lastCheck?:number;
 turnId?:string|undefined;quotaErrorTurn?:string|undefined;handled:Set<string>;settings?:Record<string,unknown>|undefined;cycle?:AccountContinuationCycle|undefined;autoPending?:boolean;autoPhase?:AutoPhase|undefined;autoMessageId?:string|undefined;autoJob?:object|undefined;manualStop?:boolean;
 streamFault?:StreamFault|undefined;epoch:number;
}
const RPC=new Set(['thread/settings/update','turn/settings/update','turn/start','turn/steer','turn/interrupt','thread/backgroundTerminals/clean','thread/goal/set','thread/queue/list','thread/queue/add','thread/queue/update','thread/queue/delete','thread/queue/reorder','thread/queue/start','thread/read','thread/turns/list','thread/items/list']);
const terminal=(v:string)=>v==='completed'||v==='interrupted'||v==='failed';


export class NativeAccountAdapter {
 #info:AccountsInfo;
 #managed=new Set<Managed>();
 #byManager=new WeakMap<object,Managed>();
 #nativeMethods=new WeakMap<Function,Function>();
 #bindings=new Map<string,Binding>();
 #cursor=new Map<string,number>();
 #disposers:Array<()=>void>=[];
 #disposed=false;
 #draft='host';
 #profileError:string|undefined;
 #polling=false;
 #observing=new Set<string>();
 #eventReads=new Map<string,{epoch:number;job:Promise<void>}>();
 #pollOffset=0;
 #quotaSweepAt=0;
 #operation=0;
 #lastNotice:string|undefined;
 #uiSignature:string|undefined;
 #outcomes=new Map<string,{key:string;message:string}>();
 #selecting=false;
 #selectionTarget:{id:string;conversationId:string|null}|undefined;
 #progress=0;
 #preparation?:{phase:string;elapsedMs:number;operationId?:number|undefined};
 #selectionDone:Promise<void>=Promise.resolve();
 #autoEnabled=false;
 #autoQueue:Promise<void>=Promise.resolve();

 #timer?:ReturnType<typeof setTimeout>;
 #enabled=true;
 #rpcMode=false;
 #rpcObserver?:RpcObservation;
 #rpcActive=new Set<string>();
 #rpcStateRead=false;
 #rpcStateAt=0;
 #rpcStateThread:string|null=null;
 #rpcQuotaSignature='';
 #rpcCycles=new Map<string,{cycle:AccountContinuationCycle;settings:Native;prepared?:boolean}>();
 #rpcAutomatic=new Set<string>();
 #rpcTerminals=new Set<string>();
 #rpcRouteFaults=new Map<string,string>();
 #rpcRouteRevision=new Map<string,number>();
 #rpcRouteDiagnostics=new Map<string,Native>();
 #rpcPendingTerminal=new Set<string>();
 #rpcSendPreparing=false;
 #rpcStartupAttempts=new Set<string>();
 readonly usage:AccountUsageStore;
 constructor(private readonly request:AccountRequest,info:AccountsInfo,private readonly notice:(message:string)=>void,private readonly loadProfile:(path:string)=>Promise<Native>=path=>import(/* @vite-ignore */path)){this.#info=info;this.usage=new AccountUsageStore(id=>this.#readUsage(id),()=>this.changed(),Date.now,(id,outcome,details)=>runtimeEvent('accounts','account.quota',outcome,{...details,accountOrdinal:id==='host'?1:this.#info.connections.findIndex(c=>c.id===id)+2,taskSent:false}));this.usage.assetActions={allowed:id=>this.#creditsAllowed(id),toggle:async id=>{if(this.#disposed)throw Error('ACCOUNT_ASSET_RETIRED: The account session ended.');if(!usableCredits(this.usage.assets(id)))return;localStorage.setItem(this.#creditKey(id),String(!this.#creditsAllowed(id)));this.usage.assetChanged();},details:id=>this.#readUsage(id),consume:(id,card,key)=>this.#consumeReset(id,card,key)};try{this.#autoEnabled=typeof localStorage!=='undefined'&&localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true';}catch{}}
 setAutoContinue(enabled:boolean):void{this.#autoEnabled=enabled;if(!enabled){for(const b of this.#bindings.values())this.#cancelAuto(b);for(const entry of this.#rpcCycles.values())entry.cycle.cancel();this.#rpcCycles.clear();}this.changed();}
 autoStatus():AutoPhase|undefined{const id=resolveActiveThread();return id&&this.#rpcAutomatic.has(id)?this.#selecting?'preparing':'checking':id?this.#bindings.get(id)?.autoPhase:undefined;}
 #cancelAuto(b:Binding):void{b.cycle?.cancel();b.cycle=undefined;}
 async #readUsage(id:string):Promise<unknown>{
  const before=await this.request<AccountsInfo>({action:'info'});
  if(this.#disposed||before.owner.id!==this.#info.owner.id){this.setAutoContinue(false);this.usage.dispose();throw Error('ACCOUNT_USAGE_OWNER: The host login changed before quota could be read.');}
  let result:unknown;
  if(id!=='host')result=await this.#call({action:'usage',connectionId:id});
  else result=await this.#hostAssetRpc('account/rateLimits/read',{});
  const after=await this.request<AccountsInfo>({action:'info'});
  if(this.#disposed||after.owner.id!==before.owner.id){this.setAutoContinue(false);this.usage.dispose();throw Error('ACCOUNT_USAGE_OWNER: The host login changed while quota was being read.');}
  return {...result as Native,pluginCreditAllowed:this.#creditsAllowed(id)};
 }
 async #assertCreditPermission(id:string):Promise<void>{
  if(!this.#enabled||this.#creditsAllowed(id))return;
  const cache=this.usage.diagnostics(id),assets=this.usage.assets(id);
  if(assets.balance==='0'&&cache?.phase==='ready'&&Date.now()-(cache.lastSuccessAt??0)<30000)return;
  const raw=await this.#readUsage(id) as Native;this.usage.observe(id,raw);
  if(!usableCredits({...this.usage.assets(id),...projectAssets(raw)}))return;
  if(raw.ordinaryUsageAllowed===false)throw Error('ACCOUNT_CREDITS_DISABLED: Included usage is exhausted and this account has not permitted credits for plugin-managed requests. No turn was sent.');
  if(raw.ordinaryUsageAllowed!==true)throw Error('ACCOUNT_CREDIT_STATUS_UNKNOWN: Included usage could not be verified before a credit-capable request. No turn was sent.');
 }
 #creditKey(id:string):string{return 'code-codex:credit-permission:v1:'+this.#info.owner.id+':'+id;}
 #creditsAllowed(id:string):boolean{try{return localStorage.getItem(this.#creditKey(id))==='true';}catch{return false;}}
 async #hostAssetRpc(method:'account/rateLimits/read'|'account/rateLimitResetCredit/consume',params:Native):Promise<unknown>{
   if(!/^\.\/assets\/[a-zA-Z0-9-]+\.js$/.test(this.#info.profile.shared))throw Error('ACCOUNT_HOST_UNSUPPORTED: Invalid quota host profile.');
   const shared=await this.loadProfile(this.#info.profile.shared),dispatcher=dispatcherRole(shared).value;
   if(typeof dispatcher?.subscribe!=='function'||typeof dispatcher?.dispatchMessage!=='function')throw Error('ACCOUNT_USAGE_HOST: The qualified quota dispatcher is unavailable.');
   const mutation=method==='account/rateLimitResetCredit/consume';
   const requestId='code-codex-quota-'+crypto.randomUUID();
   return await new Promise((resolve,reject)=>{let unsubscribe:(()=>void)|undefined;const timer=setTimeout(()=>{unsubscribe?.();reject(Error(mutation?'ACCOUNT_RESET_OUTCOME_UNKNOWN: stage=official-response; timeoutMs=12000; the reset confirmation was not received. No automatic retry is permitted.':'ACCOUNT_USAGE_TIMEOUT: The host quota read timed out.'));},12000);
    unsubscribe=dispatcher.subscribe('mcp-response',(event:Native)=>{if(event.message?.id!==requestId)return;unsubscribe?.();clearTimeout(timer);if(event.message.error)reject(Error(mutation?'ACCOUNT_RESET_FAILED: stage=official-response; rpcCode='+String(typeof event.message.error.code==='number'?event.message.error.code:'unknown')+'; reset outcome was not confirmed. Verify before another attempt.':'ACCOUNT_USAGE_UNAVAILABLE: The official quota read failed.'));else resolve(event.message.result);});
    try{dispatcher.dispatchMessage('mcp-request',{hostId:'local',request:{id:requestId,method,params},priority:'interactive',timeoutMs:12000});}catch(error){unsubscribe?.();clearTimeout(timer);reject(mutation?Error('ACCOUNT_RESET_OUTCOME_UNKNOWN: stage=official-dispatch; delivery was not confirmed. No automatic retry is permitted.'):error);}
   });
 }
 async #consumeReset(id:string,cardId:string,key:string):Promise<string>{
  if(!cardId||cardId.length>256||!/^[-a-f0-9]{36}$/i.test(key))throw Error('ACCOUNT_RESET_PROTOCOL: Invalid reset confirmation identity.');
  if(this.#disposed)throw Error('ACCOUNT_ASSET_RETIRED: The account session ended.');
  const raw=await this.#readUsage(id),assets=projectAssets(raw),card=assets.cards?.find(c=>c.id===cardId);
  if(!card||card.status!=='available'||card.resetType!=='codexRateLimits'||card.expiresAt!==null&&card.expiresAt*1000<=Date.now())throw Error('ACCOUNT_RESET_UNAVAILABLE: The selected reset is unavailable or expired. No redemption was sent.');
  const before=await this.request<AccountsInfo>({action:'info'});if(this.#disposed||before.owner.id!==this.#info.owner.id)throw Error('ACCOUNT_ASSET_OWNER: The account owner changed before confirmation. No redemption was sent.');
  const result:Native=id==='host'?await this.#hostAssetRpc('account/rateLimitResetCredit/consume',{creditId:cardId,idempotencyKey:key}) as Native:await this.#call({action:'reset.consume',connectionId:id,cardId,idempotencyKey:key});
  const after=await this.request<AccountsInfo>({action:'info'});if(this.#disposed||after.owner.id!==before.owner.id)throw Error('ACCOUNT_RESET_OUTCOME_UNKNOWN: The owner changed after redemption. Verify before any retry.');
  if(!['reset','alreadyRedeemed','nothingToReset','noCredit'].includes(result?.outcome))throw Error('ACCOUNT_RESET_OUTCOME_UNKNOWN: The official reset result could not be verified. Do not create another attempt.');
  runtimeEvent('accounts','account.assets','confirmed',{stage:'reset-consume',outcome:result.outcome,accountOrdinal:id==='host'?1:this.#info.connections.findIndex(c=>c.id===id)+2,taskSent:false});return result.outcome;
 }
 get info():AccountsInfo{return this.#info;}
 setEnabled(enabled:boolean):void{this.#enabled=enabled;this.usage.suspend(!enabled);this.setAutoContinue(enabled&&localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true');}
 updateInfo(info:AccountsInfo):void {
  if(info.owner.id!==this.#info.owner.id){
   this.setAutoContinue(false);
   this.usage.dispose();
   this.#profileError='ACCOUNT_OWNER_CHANGED: The host login changed. Re-enable the plugin to bind the current owner.';
   this.#showNotice(this.#profileError);this.changed();return;
  }
  this.#info=info;this.usage.refresh(['host',...info.connections.filter(c=>c.email).map(c=>c.id)]);this.changed();
 }
 async #call<T=any>(params:Native):Promise<T>{
  const operationId=++this.#operation,started=performance.now();
  try{return await this.request<T>({...params,owner:this.#info.owner.id});}
  catch(error){runtimeEvent('accounts','account.request','failed',{operationId,action:params.action,method:typeof params.method==='string'&&RPC.has(params.method)?params.method:undefined,durationMs:Math.round(performance.now()-started),errorCode:accountErrorCode(error),error:String(error),stage:'native-request',readOnly:['shared.events','shared.reconcile','shared.status','usage'].includes(params.action),taskReplayed:false});throw error;}
 }
 async start():Promise<void>{
  const storage=(event:StorageEvent)=>{if(event.key===null||event.key?.startsWith('code-codex:credit-permission:v1:'+this.#info.owner.id+':'))this.usage.assetChanged();if(event.key===ACCOUNT_AUTO_CONTINUE_KEY||event.key===null){try{this.setAutoContinue(localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true');}catch{this.setAutoContinue(false);}}};
  window.addEventListener('storage',storage);this.#disposers.push(()=>window.removeEventListener('storage',storage));
  const profile=this.#info.profile;
  if(!/^\.\/assets\/[a-zA-Z0-9-]+\.js$/.test(profile.initial))throw Error('ACCOUNT_HOST_UNSUPPORTED: Invalid native adapter profile.');
  const native=await this.loadProfile(profile.initial);
  const shared=await this.loadProfile(profile.shared);installSessionGuard(dispatcherRole(shared).value,this.#info,this.request,()=>{
   this.endSession();
   window.dispatchEvent(new Event('code-codex:account-session-ended'));
  });
  this.usage.refresh(['host',...this.#info.connections.filter(c=>c.email).map(c=>c.id)]);
  const rpc=rpcManagerService(shared);
  if(rpc){
   this.#rpcMode=true;
   this.#rpcObserver=await observeRpcManager(rpc,{
    admit:async id=>{
     if(this.#disposed||!this.#enabled)return;
     const selected=normalizeSelection(this.#info.selected[id]??this.#draft,this.#info.connections);
     await this.#assertCreditPermission(selected);
     if(normalizeSelection(this.#info.selected[id]??this.#draft,this.#info.connections)!==selected)throw Error('ACCOUNT_SEND_PREPARATION_CHANGED: The account changed during credit verification. No turn was sent.');
     if(this.#info.nativeRouting===true){
      const route=await this.#call<Native>({action:'native.ensure',conversationId:id,connectionId:selected});
      if(this.#disposed||route.ready!==true||route.selected!==selected)throw Error('ACCOUNT_NATIVE_ROUTE_UNAVAILABLE: The queued message account route was not verified. No turn was sent.');
      this.#info.nativeRoutes??={};if(selected==='host'&&route.routed!==true)delete this.#info.nativeRoutes[id];else this.#info.nativeRoutes[id]=selected;
     }
     const routed=selected==='host'||this.#info.nativeRouting===true&&this.#info.nativeRoutes?.[id]===selected;
     if(this.#profileError||this.#selecting||!routed){
      runtimeEvent('accounts','account.routing','blocked',{stage:'rpc-admission',requestedOrdinal:this.#accountOrder().indexOf(selected)+1,actualOrdinal:1,reason:this.#profileError?'service-unavailable':this.#selecting?'selection-pending':'independent-execution-unavailable',taskSent:false});
      throw Error(this.#profileError??'ACCOUNT_EXECUTION_UNSUPPORTED: stage=rpc-admission; the native RPC manager cannot be redirected to an independent account. Select the official account explicitly. No turn was sent.');
     }
    },
    notification:(method,p)=>this.#rpcNotification(method,p),
    unavailable:error=>{if(!this.#disposed){this.#profileError='ACCOUNT_RPC_OBSERVATION_UNAVAILABLE: '+accountErrorCode(error);this.#showNotice(this.#profileError);this.changed();}},
    available:async()=>{const info=await this.request<AccountsInfo>({action:'info'});if(this.#disposed||info.owner.id!==this.#info.owner.id)throw Error('ACCOUNT_OWNER_CHANGED: The native RPC service belongs to a different login session.');if(this.#profileError?.startsWith('ACCOUNT_RPC_OBSERVATION_UNAVAILABLE:')){this.#profileError=undefined;this.#showNotice('');}this.#rpcStateAt=0;this.changed();},
   });
   this.#disposers.push(()=>this.#rpcObserver?.dispose());
   runtimeEvent('accounts','account.routing','qualified',{stage:'rpc-observation',mode:'native-rpc',independentExecution:this.#info.nativeRouting===true,nativeQuotaObservation:true,taskSent:false});
   const cancelPending=(event:MouseEvent)=>{const button=event.composedPath().find(n=>n instanceof HTMLButtonElement) as HTMLButtonElement|undefined;if(!button||!/(?:\bstop\b|停止)/i.test(button.getAttribute('aria-label')??''))return;const id=resolveActiveThread();if(id&&this.#rpcAutomatic.has(id)){this.#rpcCycles.get(id)?.cycle.cancel();if(!this.#rpcActive.has(id)){event.preventDefault();event.stopImmediatePropagation();this.#showNotice('ACCOUNT_AUTO_CANCELLED: Automatic continuation was stopped. No continuation request was sent.');}}};
   window.addEventListener('click',cancelPending,true);this.#disposers.push(()=>window.removeEventListener('click',cancelPending,true));
   this.#timer=setTimeout(()=>void this.#poll(),300);return;
  }
  const Manager=managerRole(native).value;
  if(typeof Manager!=='function'||typeof Manager.prototype.getConversation!=='function'||typeof Manager.prototype.startTurn!=='function')throw Error('ACCOUNT_HOST_UNSUPPORTED: The native conversation manager contract is unavailable.');
  const prototype=Manager.prototype,adapter=this;
  for(const name of ['getConversation','startTurn','onNotification']){
   const original=prototype[name];
   function observe(this:Native,...args:any[]){adapter.#observe(this);if(name==='onNotification'&&Object.hasOwn(this,name)&&this[name]!==observe)return Reflect.apply(this[name],this,args);return Reflect.apply(original,this,args);}
   this.#nativeMethods.set(observe,original);
   prototype[name]=observe;this.#disposers.push(()=>{if(prototype[name]===observe)prototype[name]=original;});
  }
  this.#timer=setTimeout(()=>void this.#poll(),300);
 }
 status():NativeAccountStatus {
  const id=resolveActiveThread(),binding=id?this.#bindings.get(id):undefined;
  let selected='host',selectionError:string|undefined;
  try{selected=id?normalizeSelection(this.#info.selected[id],this.#info.connections):this.#draft;}catch(error){selected='';selectionError=String(error);}
  const manager=id?[...this.#managed].find(m=>m.manager.getConversation(id)):undefined;
  const requested=selected;if(this.#rpcMode)selected=id?this.#info.nativeRoutes?.[id]??'host':'host';
  const primaryPending=this.#info.primarySwitch?.state==='pending';
  const routeError=this.#rpcMode&&(!!id&&this.#rpcRouteFaults.get(id)||requested!==selected)?(id?this.#rpcRouteFaults.get(id):undefined)??(this.#info.nativeRouting?'ACCOUNT_SELECTION_REQUIRED: The saved account is not prepared in this runtime. Select it to prepare the native connection before sending.':'ACCOUNT_EXECUTION_UNSUPPORTED: The saved independent-account selection is not active in the native RPC execution service. Select the official account explicitly before sending.'):undefined;
  const busy=this.#selecting||this.#rpcSendPreparing||!!binding&&(binding.active||binding.preparing||binding.stopping||binding.autoPending)||!!manager&&turnIsActive(manager.manager.getConversation(id))||!!id&&(this.#info.activeConversations.includes(id)||this.#rpcActive.has(id)||this.#rpcAutomatic.has(id));
  return {supported:!this.#profileError,active:!this.#disposed,conversationId:id,selected,busy,sendBlocked:primaryPending||!!routeError||!!this.#profileError||!!id&&this.#rpcAutomatic.has(id),executionMode:this.#rpcMode?'native-rpc':'legacy-manager',preparing:this.#selecting||this.#rpcSendPreparing||!!binding?.preparing||!!binding?.autoPending||!!id&&this.#rpcAutomatic.has(id),progress:this.#progress,preparation:this.#preparation,selectionTarget:this.#selectionTarget,recoveryNotice:routeError??(id?this.#outcomes.get(id)?.message:undefined),error:primaryPending?'ACCOUNT_PRIMARY_PENDING: Complete or cancel the primary-account authorization before sending. No turn was sent.':binding?.error??selectionError??this.#profileError??routeError};
 }
 async select(connectionId:string):Promise<void>{
  const status=this.status();
  if(status.busy)throw Error('ACCOUNT_TURN_ACTIVE: Finish the response, or stop it and wait for confirmation before selecting another account.');
  if(status.conversationId){const b=this.#bindings.get(status.conversationId);if(b)this.#cancelAuto(b);}
  if(connectionId!=='host'&&!this.#info.connections.some(c=>c.id===connectionId&&c.email))throw Error('ACCOUNT_AUTH_REQUIRED: Authorize this connection before selecting it.');
  if(this.#rpcMode&&connectionId!=='host'&&!this.#info.nativeRouting)throw Error('ACCOUNT_EXECUTION_UNSUPPORTED: stage=selection; this native RPC service does not expose independent execution and event injection. The account was not changed and no turn was sent.');
  if(this.#rpcMode&&this.#info.nativeRouting){
   if(!status.conversationId)throw Error('ACCOUNT_CONVERSATION_REQUIRED: Open an existing conversation before preparing this independent account. No turn was sent.');
   this.#rpcCycles.get(status.conversationId)?.cycle.cancel();await this.#rpcSelect(status.conversationId,connectionId);return;
  }
  let finishSelection=()=>{};this.#selectionDone=new Promise<void>(resolve=>{finishSelection=resolve;});
  this.#selecting=true;this.#selectionTarget={id:connectionId,conversationId:status.conversationId};this.#progress=5;this.#preparation={phase:'queued',elapsedMs:0};this.changed();
  try{if(status.conversationId){
   const id=status.conversationId,managed=[...this.#managed].find(m=>m.manager.getConversation(id));
   if(resolveActiveThread()!==id)throw Error('ACCOUNT_CONVERSATION_CHANGED: The selected conversation changed. No turn was sent.');
   if(!this.#rpcMode&&!managed&&(connectionId!=='host'||this.#info.sharedConversations?.includes(id)))throw Error('ACCOUNT_MANAGER_UNOBSERVED: stage=selection; the current conversation manager has not been attached. Selection was not committed. No turn was sent.');
   if(managed&&(connectionId!=='host'||this.#info.sharedConversations?.includes(id)||managed.bindings.get(id)?.shared)){
    const binding=this.#ensure(managed,id);binding.preparing=true;
    let prepared:{threadId:string;cursor:number};try{if(binding.stalled)await this.#recover(binding,'check');binding.prepared=false;prepared=await this.#prepare(binding,connectionId);}finally{binding.preparing=false;}
    if(resolveActiveThread()!==id){binding.prepared=false;throw Error('ACCOUNT_CONVERSATION_CHANGED: Preparation completed for the previous conversation. No turn was sent.');}
    this.#cursor.set(id,prepared.cursor);binding.selected=connectionId;binding.shared=true;binding.prepared=true;
   }else await this.#call({action:'select',conversationId:id,connectionId});
   this.#info.selected[id]=connectionId;
  }else this.#draft=connectionId;
  this.#progress=100;this.changed();
  }catch(error){
   this.#progress=0;
   const binding=status.conversationId?this.#bindings.get(status.conversationId):undefined;
   if(binding){binding.prepared=false;this.#fail(binding,error);}else this.#showNotice(String(error));
   throw error;
  }finally{this.#selecting=false;this.#selectionTarget=undefined;finishSelection();this.changed();}
 }
 async #prepare(b:Binding,connectionId:string):Promise<{threadId:string;cursor:number}>{
  b.epoch++;this.#progress=10;b.error=undefined;this.changed();
  const current=b.managed.manager.getConversation(b.id)?.latestThreadSettings??{};
  const settings=permissionSettings(current);
  let finished=false,polling=false;
  const timer=setInterval(()=>{
   if(finished||polling)return;polling=true;
   void this.#call<{status:string;phase:string;progress:number;elapsedMs:number;operationId:number}>({action:'shared.status',conversationId:b.id}).then(p=>{
    if(!finished&&!this.#disposed&&p.status==='preparing'){
     this.#progress=p.progress;this.#preparation={phase:p.phase,elapsedMs:p.elapsedMs,operationId:p.operationId};this.changed();
    }
   },()=>{}).finally(()=>{polling=false;});
  },700);
  let result:{threadId:string;cursor:number};
  try{result=await this.#call<{threadId:string;cursor:number}>({action:'shared.prepare',conversationId:b.id,connectionId,settings});}
  finally{finished=true;clearInterval(timer);}
  if(result.threadId!==b.id)throw Error('ACCOUNT_SHARED_HISTORY: The native thread identity changed. No turn was sent.');
  if(this.#disposed||this.#profileError)throw Error('ACCOUNT_OWNER_CHANGED: The account session changed during preparation. No turn was sent.');
  b.epoch++;b.stalled=false;b.streamFault=undefined;b.pending.clear();
  this.#progress=100;this.#preparation={phase:'ready',elapsedMs:this.#preparation?.elapsedMs??0,operationId:this.#preparation?.operationId};this.changed();
  this.#info.sharedConversations=[...new Set([...(this.#info.sharedConversations??[]),b.id])];
  return result;
 }

 #ownsNativeWork(id:string):boolean{return !!this.#info.nativeRoutes?.[id]||this.#info.nativeRouting===true&&this.#autoEnabled;}
 canDisable():boolean{return !this.#selecting&&!this.#rpcSendPreparing&&!this.#rpcAutomatic.size&&![...this.#rpcActive].some(id=>this.#ownsNativeWork(id))&&![...this.#bindings.values()].some(b=>b.active||b.preparing||b.autoPending);}
 handoffStatus():{busy:boolean;reason:string;activeTasks:number;autoPending:number}{
  const bindings=[...this.#bindings.values()];
  const activeTasks=bindings.filter(b=>b.active||turnIsActive(b.managed.manager.getConversation(b.id))).length+[...this.#rpcActive].filter(id=>this.#ownsNativeWork(id)).length;
  const autoPending=bindings.filter(b=>b.autoPending).length+this.#rpcAutomatic.size;
  const reason=this.#selecting?'account-selection':this.#rpcSendPreparing?'send-preparation':autoPending?'quota-continuation':activeTasks?'active-turn':bindings.some(b=>b.stopping)?'stop-confirmation':bindings.some(b=>b.preparing)?'account-preparation':bindings.some(b=>b.pending.size)?'pending-reply':bindings.some(b=>b.stalled)?'event-recovery':'idle';
  return {busy:reason!=='idle',reason,activeTasks,autoPending};
 }
 endSession():void{this.setAutoContinue(false);this.#disposed=true;clearTimeout(this.#timer);this.usage.dispose();for(const dispose of this.#disposers.reverse())dispose();this.#disposers=[];this.#bindings.clear();this.#outcomes.clear();this.#managed.clear();this.#rpcRouteDiagnostics.clear();}
 async useOfficialIdentity():Promise<void>{
  if(!this.canDisable())throw Error('ACCOUNT_TURN_ACTIVE: Finish or stop the active turns before disabling this plugin.');
  for(const b of this.#bindings.values())this.#cancelAuto(b);
  for(const id of Object.keys(this.#info.selected)){if(this.#rpcMode&&this.#info.nativeRoutes?.[id]){await this.#call({action:'native.detach',conversationId:id});delete this.#info.nativeRoutes[id];}else await this.#call({action:'select',conversationId:id,connectionId:'host'});this.#info.selected[id]='host';const b=this.#bindings.get(id);if(b){b.selected='host';b.prepared=false;}}
  this.#draft='host';this.changed();
 }
 async reconcile(connectionId:string):Promise<'idle'|'cleared'|'running'>{
  if(this.#rpcMode){
   if(connectionId!=='host'&&!this.#info.nativeRouting)throw Error('ACCOUNT_EXECUTION_UNSUPPORTED: stage=task-observation; independent execution is unavailable in the native RPC service. No task was sent.');
   const current=resolveActiveThread(),ids=new Set(Object.entries(this.#info.nativeRoutes??{}).filter(([,selected])=>selected===connectionId).map(([id])=>id));
   if(current&&(this.#info.nativeRoutes?.[current]??'host')===connectionId)ids.add(current);
   let running=false;for(const id of ids){const state=await this.#rpcObserver?.state(id);
    if(this.#disposed||this.#profileError)throw Error('ACCOUNT_RPC_OBSERVATION_UNAVAILABLE: Native task status could not be verified in the current session.');
    if(!state)throw Error('ACCOUNT_RPC_STATE_UNKNOWN: Native task state is unavailable. Idle was not inferred.');
    this.#rpcActivity(id,state.inProgress);running ||= state.inProgress;
   }return running?'running':'idle';
  }
  let cleared=0,running=false;
  const ids=new Set([...this.#info.activeConversations,...[...this.#bindings.values()].filter(b=>b.stalled).map(b=>b.id)]);
  for(const id of ids){
   if(this.#info.selected[id]!==connectionId)continue;
   const b=this.#bindings.get(id);
   if(b?.preparing||b?.stopping){running=true;continue;}
   if(b)b.preparing=true;
   try{if(b)await this.#recover(b,'check');else{const result=await this.#call<OutcomeObservation>({action:'shared.reconcile',conversationId:id});if(this.#disposed||this.#profileError)throw Error('ACCOUNT_OBSERVATION_STALE: The account session changed during verification.');this.#recordOutcome(id,result);}cleared++;
   }catch(error){if((error instanceof Error&&'code' in error&&error.code==='ACCOUNT_TURN_ACTIVE')||String(error).includes('ACCOUNT_TURN_ACTIVE'))running=true;else throw error;}
   finally{if(b)b.preparing=false;this.changed();}
  }
  const info=await this.request<AccountsInfo>({action:'info'});if(this.#disposed||this.#profileError||info.owner.id!==this.#info.owner.id)throw Error('ACCOUNT_OWNER_CHANGED: The account session changed during task verification.');this.#info=info;this.changed();return running?'running':cleared?'cleared':'idle';
 }
 #observe(manager:Native):void {
  if(this.#disposed||this.#byManager.has(manager)||manager.hostId!=='local'||typeof manager.executeTurnStart!=='function')return;
  const managed:Managed={manager,execute:manager.executeTurnStart,send:manager.requestClient.sendRequest,role:manager.getStreamRole,notification:this.#nativeMethods.get(manager.onNotification)??manager.onNotification,reply:manager.sendAppServerResponse,bindings:new Map()};
  this.#byManager.set(manager,managed);this.#managed.add(managed);const adapter=this;
  manager.executeTurnStart=function(id:string,operation:Operation,...rest:any[]){return adapter.#execute(managed,id,operation,rest);};
  manager.getStreamRole=function(id:string){const b=managed.bindings.get(id);return b?.shared?adapter.#ownerRole(b):managed.role.call(manager,id);};
  manager.requestClient.sendRequest=function(method:string,params:Native,...rest:any[]){return adapter.#send(managed,method,params,rest);};
  manager.onNotification=function(method:string,params:Native,...rest:any[]){if(method==='account/rateLimits/updated')adapter.usage.observe('host',params);const b=managed.bindings.get(params?.threadId??params?.thread?.id);if(b?.shared)return;const result=managed.notification.call(manager,method,params,...rest);if(b)adapter.#turnNotification(b,method,params);return result;};
  manager.sendAppServerResponse=function(method:string,response:Native,id:string,...rest:any[]){const b=managed.bindings.get(id);if(b?.shared&&b.pending.has(String(response.id))){b.pending.delete(String(response.id));void adapter.#call({action:'shared.reply',conversationId:id,id:response.id,result:response.result}).catch(e=>adapter.#fail(b,e));return;}return managed.reply.call(manager,method,response,id,...rest);};
  this.#disposers.push(()=>{manager.executeTurnStart=managed.execute;manager.getStreamRole=managed.role;manager.onNotification=managed.notification;manager.sendAppServerResponse=managed.reply;manager.requestClient.sendRequest=managed.send;});
 }
 #roles=new WeakMap<Binding,{role:string}>();
 #ownerRole(b:Binding):{role:string}{let role=this.#roles.get(b);if(!role){role={role:'owner'};this.#roles.set(b,role);}return role;}
 #ensure(managed:Managed,id:string):Binding {
  let b=managed.bindings.get(id);if(b)return b;
  b={id,managed,selected:normalizeSelection(this.#info.selected[id]??this.#draft,this.#info.connections),shared:this.#info.sharedConversations?.includes(id)??false,prepared:false,active:false,preparing:false,pending:new Set(),handled:new Set(),epoch:0};managed.bindings.set(id,b);this.#bindings.set(id,b);return b;
 }
 async #execute(managed:Managed,id:string,operation:Operation,rest:any[]):Promise<any>{
  if(this.#disposed||this.#profileError)throw Error(this.#profileError??'ACCOUNT_DISABLED: This account session is unavailable.');
  if(this.#selecting)throw Error('ACCOUNT_SELECTION_PENDING: Wait for account selection before sending.');
  const selected=normalizeSelection(this.#info.selected[id]??this.#draft,this.#info.connections);
  const b=this.#ensure(managed,id),automatic=!!b.autoMessageId&&operation.request.clientUserMessageId===b.autoMessageId;
  if(b.autoPending&&!automatic)throw Error('ACCOUNT_AUTO_PENDING: Wait for automatic account preparation or turn it off before sending.');
  const nativeActive=turnIsActive(managed.manager.getConversation(id));
  const rejectBusy=(reason:string):never=>{runtimeEvent('accounts','account.admission','blocked',{reason,active:b.active,preparing:b.preparing,stopping:!!b.stopping,nativeActive,shared:b.shared,prepared:b.prepared,stalled:!!b.stalled,taskSent:false});throw Error(`ACCOUNT_TURN_ACTIVE: reason=${reason}; active=${b.active}; preparing=${b.preparing}; nativeActive=${nativeActive}. Wait for the current turn to reach a confirmed terminal state. No turn was sent.`);};
  if(b.preparing||b.stopping)rejectBusy('operation-pending');
  if(!automatic)b.manualStop=false;
  if(b.shared){
   // Serialize admission before awaiting a read, so rapid Send cannot both pass.
   b.preparing=true;this.changed();
   try{await this.#recover(b,'send');if(b.manualStop||automatic&&(!this.#autoEnabled||!b.cycle||b.cycle.cancelled))throw Error('ACCOUNT_SEND_CANCELLED: Sending was cancelled during idle verification. No turn was sent.');}finally{b.preparing=false;this.changed();}
  }else if(b.active||nativeActive)rejectBusy('native-turn-active');
  b.preparing=true;this.changed();try{await this.#assertCreditPermission(selected);}finally{b.preparing=false;this.changed();}
  if(this.#disposed||this.#profileError||normalizeSelection(this.#info.selected[id]??this.#draft,this.#info.connections)!==selected)throw Error('ACCOUNT_SEND_PREPARATION_CHANGED: The account changed during credit verification. No turn was sent.');
  if(!automatic){this.#cancelAuto(b);b.manualStop=false;b.settings=continuationSettings(operation.request);if(this.#autoEnabled)b.cycle=new AccountContinuationCycle(this.#accountOrder(),selected);}
  b.turnId=undefined;b.quotaErrorTurn=undefined;
  if(selected==='host'&&!this.#info.sharedConversations?.includes(id)&&!managed.bindings.get(id)?.shared){
   this.usage.markUsed('host');b.active=true;try{const result=await managed.execute.call(managed.manager,id,operation,...rest);b.turnId=result?.turn?.id;this.#outcomes.delete(id);return result;}catch(error){this.#cancelAuto(b);throw error;}finally{b.active=turnIsActive(managed.manager.getConversation(id));if(!b.active){this.usage.invalidate('host');this.usage.refresh(['host']);}}
  }
  b.preparing=true;b.error=undefined;this.changed();
  try{
   if(!b.prepared||b.selected!==selected){
    const prepared=await this.#prepare(b,selected);
    this.#info.selected[id]=selected;b.selected=selected;b.shared=true;b.prepared=true;this.#cursor.set(id,prepared.cursor);
   }
   b.active=true;b.preparing=false;this.usage.markUsed(b.selected);
   const result=await managed.execute.call(managed.manager,id,operation,...rest);b.turnId=result?.turn?.id;this.#outcomes.delete(id);return result;
  }catch(error){this.#cancelAuto(b);b.preparing=false;if(!String(error).includes('OUTCOME_UNKNOWN')&&!String(error).includes('DISCONNECTED')){b.active=false;this.usage.invalidate(b.selected);this.usage.refresh([b.selected]);}this.#fail(b,error);throw error;}
  finally{this.changed();}
 }
 async #confirmIdle(b:Binding,origin:'send'|'poll'|'check'):Promise<OutcomeObservation>{
  const started=performance.now(),active=b.active,nativeActive=turnIsActive(b.managed.manager.getConversation(b.id)),epoch=b.epoch;
  runtimeEvent('accounts','account.admission','checking',{origin,active,nativeActive,prepared:b.prepared,taskSent:false});
  try{
   const result=await this.#call<OutcomeObservation>({action:'shared.reconcile',conversationId:b.id});
   if(!result.reconciled)throw Error('ACCOUNT_IDLE_UNCONFIRMED: The previous executor has not confirmed idle. No turn was sent.');
   this.#verifyObservation(b,epoch);
   b.active=false;if(result.executorReusable!==true)b.prepared=false;
   this.#info.activeConversations=this.#info.activeConversations.filter(id=>id!==b.id);
   // Only after the owned executor confirms idle/exited may stale UI records
   // be marked interrupted. Do not invent completed outcomes or replay input.
   const update=(c:NativeConversation)=>{for(const t of conversationTurns(c))if(t.status==='inProgress'){const matched=!!result.previousTurnId&&t.turnId===result.previousTurnId;t.status=matched&&terminal(result.previousOutcome??'')?result.previousOutcome!:'interrupted';}};
   if(typeof b.managed.manager.updateConversationState==='function')b.managed.manager.updateConversationState(b.id,update);else update(b.managed.manager.getConversation(b.id)!);
   this.#recordOutcome(b.id,result);
   runtimeEvent('accounts','account.admission','confirmed',{origin,previousActive:active,previousNativeActive:nativeActive,executorReusable:result.executorReusable===true,previousOutcome:result.previousOutcome??'idle',durationMs:Math.round(performance.now()-started),taskReplayed:false});
   return result;
  }catch(error){runtimeEvent('accounts','account.admission','failed',{origin,errorCode:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0]??'ACCOUNT_BACKEND',durationMs:Math.round(performance.now()-started),taskSent:false});throw error;}
 }
 #verifyObservation(b:Binding,epoch:number):void{
  if(this.#disposed||this.#profileError)throw Error('ACCOUNT_OWNER_CHANGED: The account session changed during observation. No turn was sent.');
  if(epoch!==b.epoch||b.stopping)throw Error(b.manualStop?'ACCOUNT_SEND_CANCELLED: Stop superseded this observation. No turn was sent.':'ACCOUNT_OBSERVATION_STALE: A newer preparation superseded this observation. No turn was sent.');
 }
 async #readEvents(b:Binding):Promise<void>{
  const existing=this.#eventReads.get(b.id);if(existing?.epoch===b.epoch)return existing.job;
  const entry={epoch:b.epoch,job:this.#consumeEvents(b)};this.#eventReads.set(b.id,entry);
  try{await entry.job;}finally{if(this.#eventReads.get(b.id)===entry)this.#eventReads.delete(b.id);}
 }
 async #consumeEvents(b:Binding):Promise<void>{
  const epoch=b.epoch,started=performance.now();let backlog=false;
  for(let page=0;page<8;page++){
   const after=this.#cursor.get(b.id)??0;
   let result:EventsResult;
   try{result=await this.#call<EventsResult>({action:'shared.events',conversationId:b.id,after});}catch(error){this.#verifyObservation(b,epoch);throw error;}
   this.#verifyObservation(b,epoch);
   for(const {sequence,message} of result.events){const p=message.params as Native;
    if(message.method==='account/rateLimits/updated'){this.usage.observe(b.selected,p);this.#cursor.set(b.id,sequence);continue;}
    if((p?.threadId??p?.thread?.id)!==b.id){this.#cursor.set(b.id,sequence);continue;}
    try{if(message.id!==undefined){b.pending.add(String(message.id));b.managed.manager.onRequest(message);}else{b.managed.notification.call(b.managed.manager,message.method,p);this.#turnNotification(b,message.method,p);}}
    catch(error){throw Error(`ACCOUNT_EVENT_CONSUMER: A native event consumer failed. cursor=${after}; sequence=${sequence}; cause=${accountErrorCode(error)}. Verify the previous task before continuing.`);}
    this.#cursor.set(b.id,sequence);
   }
   this.#cursor.set(b.id,result.cursor);backlog=!!result.hasMore;
   if(b.stalled||backlog)runtimeEvent('accounts','account.stream','read',{recoveryId:b.streamFault?.id,cursorBefore:after,cursor:result.cursor,events:result.events.length,queuedEvents:result.queuedEvents,queuedBytes:result.queuedBytes,hasMore:backlog,durationMs:Math.round(performance.now()-started),taskReplayed:false});
   if(result.disconnected)throw Error('ACCOUNT_DISCONNECTED: The shared executor stopped. Verify the previous task before continuing.');
   if(!backlog)break;
  }
  if(backlog)runtimeEvent('accounts','account.stream','draining',{cursor:this.#cursor.get(b.id)??0,active:b.active});
 }
 #streamFailed(b:Binding,error:unknown):void{
  if(this.#disposed||this.#profileError||b.stopping||['ACCOUNT_OBSERVATION_STALE','ACCOUNT_SEND_CANCELLED'].includes(accountErrorCode(error)))return;
  const previous=b.streamFault;this.#cancelAuto(b);b.stalled=true;b.streamFault=streamFault(error,++this.#operation,previous);
  const f=b.streamFault;runtimeEvent('accounts','account.stream','failed',{recoveryId:f.id,errorCode:f.code,error:String(error),cursor:this.#cursor.get(b.id)??0,active:b.active,nativeActive:turnIsActive(b.managed.manager.getConversation(b.id)),attempt:f.failures,retryable:f.retryable,nextRetryMs:f.retryable&&f.failures<=5?f.nextRetryAt-Date.now():null,requiresExplicitCheck:!f.retryable||f.failures>5,taskReplayed:false});
  if(!previous)this.#fail(b,Error(`ACCOUNT_SHARED_RECONNECT: Event observation failed. cause=${f.code}; recoveryId=${f.id}; cursor=${this.#cursor.get(b.id)??0}; active=${b.active}; retryable=${f.retryable}. Reconnection will preserve the event cursor. Use Check task status or Stop if recovery remains blocked. No task was replayed.`));
 }
 async #recover(b:Binding,origin:'send'|'check'):Promise<void>{
  const started=performance.now(),fault=b.streamFault,epoch=b.epoch;
  if(b.stalled){
   runtimeEvent('accounts','account.recovery','checking',{origin,recoveryId:fault?.id,errorCode:fault?.code,stage:'event-stream',cursor:this.#cursor.get(b.id)??0,active:b.active,taskSent:false});
   if(fault?.retryable){try{await this.#readEvents(b);b.stalled=false;b.streamFault=undefined;this.#clearError(b);runtimeEvent('accounts','account.recovery','recovered',{origin,recoveryId:fault.id,stage:'event-stream',cursor:this.#cursor.get(b.id)??0,durationMs:Date.now()-fault.startedAt,taskReplayed:false});}catch(error){this.#verifyObservation(b,epoch);this.#streamFailed(b,error);}}
  }
  try{
   const observation=await this.#confirmIdle(b,origin);
   if(b.stalled){b.epoch++;b.prepared=false;b.pending.clear();b.stalled=false;b.streamFault=undefined;this.#clearError(b);if(!observation.previousOutcome)this.#showNotice('ACCOUNT_STREAM_RECONCILED: The previous executor is idle or exited. Its last streamed result may be incomplete; review the conversation and project. No previous request was replayed.');}
   b.error=undefined;
   if(fault)runtimeEvent('accounts','account.recovery','recovered',{origin,recoveryId:fault.id,stage:'idle-confirmed',prepared:b.prepared,durationMs:Math.round(performance.now()-started),taskReplayed:false});
  }catch(error){if(fault)runtimeEvent('accounts','account.recovery','blocked',{origin,recoveryId:fault.id,stage:'confirm-idle',errorCode:accountErrorCode(error),durationMs:Math.round(performance.now()-started),taskSent:false});throw error;}
 }
 async #send(managed:Managed,method:string,params:Native,rest:any[]):Promise<any>{
  if(this.#selecting&&['thread/settings/update','turn/settings/update'].includes(method))await this.#selectionDone;
  const b=managed.bindings.get(params?.threadId);
  if(b&&['turn/interrupt','thread/stop','thread/queue/add','thread/queue/start','turn/steer'].includes(method)){this.#cancelAuto(b);if(['turn/interrupt','thread/stop'].includes(method)){b.manualStop=true;if(b.autoPending&&!b.active){runtimeEvent('accounts','account.auto','cancelled',{duringPreparation:true,taskSent:false});return {};}}}
  if(!b?.shared)return managed.send.call(managed.manager.requestClient,method,params,...rest);
  if(method==='turn/interrupt'||method==='thread/stop')return this.#stop(b,params.turnId);
  if(method==='thread/backgroundTerminals/clean'&&!b.prepared)return {};
  if(!b.prepared){if(['turn/interrupt','turn/steer','thread/settings/update','turn/settings/update'].includes(method))throw Error('ACCOUNT_SHARED_RECONNECT: Reconcile the previous execution before using this control.');return managed.send.call(managed.manager.requestClient,method,params,...rest);}
  if(!RPC.has(method)){const safeMethod=/^[a-zA-Z0-9/_-]{1,100}$/.test(method)?method:'invalid-method';runtimeEvent('accounts','account.rpc','rejected',{method:safeMethod,prepared:b.prepared,active:b.active,stalled:!!b.stalled});throw Error(`ACCOUNT_METHOD_UNSUPPORTED: method=${safeMethod}; prepared=${b.prepared}; active=${b.active}; stalled=${!!b.stalled}. This operation is unavailable in the shared executor. No other account was used.`);}
  if(this.#profileError)throw Error(this.#profileError);
  return this.#call({action:'shared.rpc',conversationId:b.id,method,params});
 }
 async #stop(b:Binding,turnId?:string):Promise<Record<string,never>>{
  if(b.stopping)throw Error('ACCOUNT_STOP_PENDING: A stop confirmation is already pending.');
  b.epoch++;b.stopping=true;this.changed();const started=performance.now();runtimeEvent('accounts','account.stop','requested',{hasTurnId:!!turnId,active:b.active,stalled:!!b.stalled,cursor:this.#cursor.get(b.id)??0});
  try{
   const result=await this.#call<{stopped:boolean;executorReusable:boolean;cursor:number;previousOutcome:string;operationId:number}>({action:'shared.stop',conversationId:b.id,...(turnId?{turnId}:{})});
   if(!result.stopped)throw Error('ACCOUNT_STOP_UNCONFIRMED: The selected executor has not confirmed stopping.');
   if(this.#disposed||this.#profileError)throw Error('ACCOUNT_OWNER_CHANGED: The account session changed during Stop.');
   b.active=false;b.prepared=result.executorReusable;b.stalled=false;b.streamFault=undefined;b.pending.clear();b.error=undefined;this.#cursor.set(b.id,result.cursor);this.#info.activeConversations=this.#info.activeConversations.filter(id=>id!==b.id);
   const update=(c:NativeConversation)=>{for(const turn of conversationTurns(c))if(turn.status==='inProgress')turn.status='interrupted';};
   if(typeof b.managed.manager.updateConversationState==='function')b.managed.manager.updateConversationState(b.id,update);else update(b.managed.manager.getConversation(b.id));
   this.usage.invalidate(b.selected);this.usage.refresh([b.selected]);runtimeEvent('accounts','account.stop','confirmed',{durationMs:Math.round(performance.now()-started),operationId:result.operationId,previousOutcome:result.previousOutcome,executorReusable:result.executorReusable,taskReplayed:false});
   if(result.previousOutcome==='unverified')this.#showNotice(`ACCOUNT_STOPPED_UNVERIFIED: The selected executor exited. Its last task outcome is unverified; review the conversation before continuing. operationId=${result.operationId}. No task was replayed.`);
   return {};
  }catch(error){this.#fail(b,error);throw error;}finally{b.stopping=false;this.changed();}
 }
 #accountOrder():string[]{return ['host',...this.#info.connections.filter(c=>c.email).map(c=>c.id)];}
 #turnNotification(b:Binding,method:string,p:Native):void{
  if(method==='turn/started'){b.active=true;b.turnId=p.turn?.id;this.usage.markUsed(b.selected);return;}
  if(method==='error'&&p.turnId===b.turnId&&p.willRetry===false&&p.error?.codexErrorInfo==='usageLimitExceeded'){b.quotaErrorTurn=p.turnId;return;}
  if(method!=='turn/completed'||!terminal(p.turn?.status)||typeof p.turn?.id!=='string')return;
  const turnId=p.turn.id;if(b.handled.has(turnId)||b.turnId&&b.turnId!==turnId)return;
  b.handled.add(turnId);if(b.handled.size>64)b.handled.delete(b.handled.values().next().value!);
  b.active=false;this.#info.activeConversations=this.#info.activeConversations.filter(id=>id!==b.id);this.usage.invalidate(b.selected);this.usage.refresh([b.selected]);
  const exhausted=isQuotaExhausted(p.turn)||(p.turn.status==='failed'&&b.quotaErrorTurn===turnId);
  b.quotaErrorTurn=undefined;
   if(!exhausted||!this.#autoEnabled||this.#disposed||this.#profileError||b.manualStop||b.stopping||b.preparing){if(this.#autoEnabled&&p.turn.status==='failed')runtimeEvent('accounts','account.auto','not-triggered',{reason:b.manualStop||b.stopping?'user-stop':b.preparing?'explicit-verification':!exhausted?'not-usage-limit':'session-unavailable',taskRetry:false});this.#cancelAuto(b);return;}
  try{
   // A switch enabled during a running turn may start its traversal here.
   b.cycle??=new AccountContinuationCycle(this.#accountOrder(),b.selected);
   b.settings??=continuationSettings(b.managed.manager.getConversation(b.id)?.latestThreadSettings??{});
   const cycle=b.cycle,job={};b.autoJob=job;b.autoPending=true;b.autoPhase='checking';this.changed();
   runtimeEvent('accounts','account.auto','quota-terminal',{currentOrdinal:cycle.order.indexOf(b.selected)+1,attempted:cycle.attempted.size,accountCount:cycle.order.length});
   this.#autoQueue=this.#autoQueue.then(()=>this.#continue(b,cycle,job)).catch(error=>{this.#cancelAuto(b);this.#fail(b,error);});
  }catch(error){this.#fail(b,error);}
 }
 async #continue(b:Binding,cycle:AccountContinuationCycle,job:object):Promise<void>{
  const current=()=>!this.#disposed&&this.#autoEnabled&&!this.#profileError&&b.cycle===cycle&&!cycle.cancelled;
  try{
   if(!current())return;
   const info=await this.request<AccountsInfo>({action:'info'});
   if(info.owner.id!==this.#info.owner.id)throw Error('ACCOUNT_AUTO_OWNER_CHANGED: The host login changed. No continuation was sent.');
   this.#info=info;
   if(normalizeSelection(info.selected[b.id],info.connections)!==b.selected){this.#cancelAuto(b);return;}
   const result=await continueAfterQuota(cycle,{
    current,available:id=>id==='host'||this.#info.connections.some(c=>c.id===id&&c.email),
    model:typeof b.settings?.model==='string'?b.settings.model:undefined,
    phase:phase=>{b.autoPhase=phase;this.changed();},
    event:(stage,details)=>runtimeEvent('accounts','account.auto',stage,details),
    quota:async id=>{this.#selectionTarget={id,conversationId:b.id};this.#preparation={phase:'check-quota',elapsedMs:0};this.changed();let timer:ReturnType<typeof setTimeout>|undefined;try{const raw=await Promise.race([this.#readUsage(id),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('ACCOUNT_AUTO_QUOTA_TIMEOUT: A fresh candidate quota could not be verified within 15 seconds.')),15000);})]);if(current())this.usage.observe(id,raw);return raw;}finally{if(timer!==undefined)clearTimeout(timer);}},
    prepare:async id=>{
     await this.#selectionDone;if(!current())return;
     if(b.active||turnIsActive(b.managed.manager.getConversation(b.id)))throw Error('ACCOUNT_AUTO_TURN_ACTIVE: A new turn is already running. No continuation was sent.');
     let finish=()=>{};this.#selectionDone=new Promise<void>(resolve=>{finish=resolve;});this.#selecting=true;b.preparing=true;
     try{
      if(b.shared){const check=await this.#call<{previousOutcome?:string}>({action:'shared.reconcile',conversationId:b.id});if(check.previousOutcome==='unverified')throw Error('ACCOUNT_AUTO_OUTCOME_UNVERIFIED: The previous execution outcome is unknown. No continuation was sent.');}
      if(!current())return;
      const prepared=await this.#prepare(b,id);
      // Native prepare commits identity; reflect it even if the opt-in was cancelled meanwhile.
      this.#info.selected[b.id]=id;b.selected=id;b.shared=true;b.prepared=true;this.#cursor.set(b.id,prepared.cursor);
     }finally{b.preparing=false;this.#selecting=false;finish();this.changed();}
    },
    resume:async()=>{
     if(!current())return;
     const messageId=crypto.randomUUID();b.autoMessageId=messageId;
     try{await b.managed.manager.startTurn(b.id,continuationOperation(b.id,b.settings??{},messageId));}
     finally{b.autoMessageId=undefined;}
    },
   });
   if(result==='unavailable'&&current()){this.#cancelAuto(b);this.#showNotice('ACCOUNT_AUTO_NO_QUOTA: Every account in this traversal is exhausted, unavailable, or has unverified quota. No continuation was sent.');}
   if(result==='cancelled')runtimeEvent('accounts','account.auto','cancelled',{taskSent:false});
  }catch(error){this.#cancelAuto(b);runtimeEvent('accounts','account.auto','failed',{errorCode:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0]??'ACCOUNT_AUTO_FAILED',taskRetry:false});this.#fail(b,error);}
  finally{
   if(b.autoJob===job){b.autoPending=false;b.autoPhase=undefined;b.autoJob=undefined;if(this.#selectionTarget?.conversationId===b.id&&!this.#selecting)this.#selectionTarget=undefined;this.changed();}
  }
 }
 async #poll():Promise<void>{
  if(this.#disposed||this.#polling)return;this.#polling=true;
  try{
   // A native host turn can predate hot activation. Observe it without rerouting
   // or restarting it, so its completion still refreshes the account quota once.
   const current=resolveActiveThread();
   if(Date.now()-this.#quotaSweepAt>=1000){this.#quotaSweepAt=Date.now();this.usage.refresh(['host',...this.#info.connections.filter(c=>c.email).map(c=>c.id)]);}
   if(this.#rpcMode){
    for(const id of this.#rpcActive)this.usage.refresh([this.#info.nativeRoutes?.[id]??'host']);
    if(current&&this.#rpcObserver&&!this.#rpcStateRead&&(current!==this.#rpcStateThread||Date.now()-this.#rpcStateAt>=5000)){
     this.#rpcStateRead=true;this.#rpcStateAt=Date.now();this.#rpcStateThread=current;
     void this.#rpcObserver.state(current).then(async state=>{if(!this.#disposed&&state){this.#rpcActivity(current,state.inProgress);if(this.#info.nativeRouting){await this.#rpcRouteStatus(current);const preferred=this.#info.selected[current],key=current+':'+preferred;if(!state.inProgress&&preferred&&preferred!=='host'&&this.#info.nativeRoutes?.[current]!==preferred&&!this.#selecting&&!this.#rpcSendPreparing&&!this.#rpcAutomatic.size&&!this.#profileError&&!this.#rpcStartupAttempts.has(key)){this.#rpcStartupAttempts.add(key);if(this.#rpcStartupAttempts.size>128)this.#rpcStartupAttempts.delete(this.#rpcStartupAttempts.values().next().value!);await this.#rpcSelect(current,preferred);}}}},error=>{if(!this.#disposed)runtimeEvent('accounts','account.routing','observation-failed',{stage:'rpc-turn-state',errorCode:accountErrorCode(error),taskSent:false});}).catch(error=>{if(!this.#disposed)runtimeEvent('accounts','account.routing','observation-failed',{stage:'native-route-status',errorCode:accountErrorCode(error),taskSent:false});}).finally(()=>{this.#rpcStateRead=false;});
    }
    return;
   }
   // Cache deadlines/retries remain independent of composer DOM updates.
   // refresh is owner-scoped, suspended when disabled, and reads only if due.
   const visible=this.status();if(visible.supported)this.usage.refresh([visible.selected]);
   if(current&&!this.#bindings.has(current)&&!this.#info.sharedConversations?.includes(current)){
    const managed=[...this.#managed].find(m=>turnIsActive(m.manager.getConversation(current)));
    if(managed){const b=this.#ensure(managed,current);b.active=true;this.usage.markUsed('host');}
   }
   const observe=async(b:Binding):Promise<void>=>{
    if(!b.shared){if(b.active&&!turnIsActive(b.managed.manager.getConversation(b.id))){b.active=false;this.usage.invalidate('host');this.usage.refresh(['host']);}return;}
    if(!b.prepared||b.preparing||b.stopping)return;
    if(b.stalled&&(!b.streamFault||!shouldRetryStream(b.streamFault)))return;
    try{
    const fault=b.streamFault;
    await this.#readEvents(b);
    if(fault){b.stalled=false;b.streamFault=undefined;this.#clearError(b);runtimeEvent('accounts','account.recovery','recovered',{origin:'poll',recoveryId:fault.id,stage:'event-stream',cursor:this.#cursor.get(b.id)??0,attempt:fault.failures,durationMs:Date.now()-fault.startedAt,taskReplayed:false});}
    // A native Stop can optimistically mark the UI interrupted before its
    // terminal event arrives. Read-only reconciliation confirms backend idle.
    if(b.active&&!turnIsActive(b.managed.manager.getConversation(b.id))&&Date.now()-(b.lastCheck??0)>3000){b.lastCheck=Date.now();try{await this.#confirmIdle(b,'poll');this.usage.invalidate(b.selected);this.usage.refresh([b.selected]);runtimeEvent('accounts','account.reconcile','confirmed',{active:false});}catch(error){runtimeEvent('accounts','account.reconcile','pending',{errorCode:accountErrorCode(error)});}}
    this.usage.refresh([b.selected]);
    }catch(error){this.#streamFailed(b,error);}
   };
   // Each conversation owns its single flight. A slow read cannot hold the
   // scheduler; at most four observations can be in flight across conversations.
   const bindings=[...this.#bindings.values()],offset=this.#pollOffset%Math.max(1,bindings.length);
   for(const b of [...bindings.slice(offset),...bindings.slice(0,offset)]){
    if(this.#observing.size>=4)break;
    if(this.#observing.has(b.id))continue;
    this.#observing.add(b.id);
    void observe(b).finally(()=>{this.#observing.delete(b.id);if(!this.#disposed)this.changed();});
   }
   this.#pollOffset=(offset+4)%Math.max(1,bindings.length);
  }catch(error){this.#showNotice(String(error));}
  finally{this.#polling=false;this.changed();if(!this.#disposed)this.#timer=setTimeout(()=>void this.#poll(),350);}
 }
 #rpcActivity(id:string,active:boolean):void{
  const prior=this.#rpcActive.has(id);
  const selected=this.#info.nativeRoutes?.[id]??'host';
  if(active&&!prior){this.#rpcActive.add(id);this.usage.markUsed(selected);if(!this.#rpcAutomatic.has(id)&&this.#autoEnabled){const prepared=this.#rpcCycles.get(id),entry=prepared?.prepared&&!prepared.cycle.cancelled?prepared:{cycle:new AccountContinuationCycle(this.#accountOrder(),selected),settings:{}};entry.prepared=false;this.#rpcCycles.set(id,entry);void this.#rpcObserver?.settings(id).then(settings=>{if(this.#rpcCycles.get(id)===entry)entry.settings={model:settings.latestModel,effort:settings.latestReasoningEffort};}).catch(()=>{});}}
  else if(!active&&prior){this.#rpcActive.delete(id);this.usage.invalidate(selected);this.usage.refresh([selected]);}
  if(prior!==active)this.changed();
 }
 requiresSendPreparation():boolean{const id=resolveActiveThread();return this.#rpcMode&&this.#info.nativeRouting===true&&!!id;}
 async prepareSend():Promise<void>{
  if(!this.requiresSendPreparation())return;
  if(this.#rpcSendPreparing||this.#selecting||this.#rpcAutomatic.size)throw Error('ACCOUNT_SELECTION_PENDING: Account preparation is already in progress. No turn was sent.');
  const id=resolveActiveThread()!,selected=normalizeSelection(this.#info.selected[id],this.#info.connections);
  this.#rpcSendPreparing=true;this.#selectionTarget={id:selected,conversationId:id};this.#preparation={phase:'native-history',elapsedMs:0};this.changed();
  try{
   await this.#assertCreditPermission(selected);
   const result=await this.#call<Native>({action:'native.ensure',conversationId:id,connectionId:selected});
   if(this.#disposed||this.#profileError||result.ready!==true||result.threadId!==id||result.selected!==selected||resolveActiveThread()!==id)throw Error('ACCOUNT_SEND_PREPARATION_CHANGED: The execution connection could not be verified for this conversation. No turn was sent.');
   this.#info.nativeRoutes??={};if(selected==='host'&&result.routed!==true)delete this.#info.nativeRoutes[id];else this.#info.nativeRoutes[id]=selected;
   if(this.#autoEnabled&&selected!=='host'&&(this.usage.remaining(selected).fiveHour===0||this.usage.remaining(selected).weekly===0)&&(await this.#rpcObserver?.state(id))?.inProgress===false){
    const raw=await this.#readUsage(selected);this.usage.observe(selected,raw);
    if(quotaEligibility(raw)==='exhausted'){
     const cycle=new AccountContinuationCycle(this.#accountOrder(),selected);
     const result=await continueAfterQuota(cycle,{current:()=>!this.#disposed&&this.#autoEnabled&&!this.#profileError&&resolveActiveThread()===id,available:c=>c==='host'||this.#info.connections.some(v=>v.id===c&&v.email),quota:async c=>{const raw=await this.#readUsage(c);this.usage.observe(c,raw);return raw;},prepare:c=>this.#rpcSelect(id,c),resume:async()=>{},phase:()=>{},event:(stage,details)=>runtimeEvent('accounts','account.auto',stage,{...details,origin:'pre-send',taskSent:false})});
     if(result!=='continued')throw Error('ACCOUNT_AUTO_NO_QUOTA: No account in this traversal has verified available quota. The message was not sent.');
     this.#rpcCycles.set(id,{cycle,settings:{},prepared:true});
    }
   }
   this.#rpcRouteFaults.delete(id);
  }catch(error){this.#rpcRouteFaults.set(id,String(error));throw error;}
  finally{this.#rpcSendPreparing=false;if(!this.#selecting)this.#selectionTarget=undefined;this.changed();}
 }
 async #rpcSelect(id:string,selected:string):Promise<void>{
  await this.#selectionDone;
  let finish=()=>{};this.#selectionDone=new Promise<void>(resolve=>{finish=resolve;});
  this.#rpcRouteRevision.set(id,(this.#rpcRouteRevision.get(id)??0)+1);
  this.#selecting=true;this.#selectionTarget={id:selected,conversationId:id};this.#progress=5;this.#preparation={phase:'queued',elapsedMs:0};this.changed();
  let ended=false,polling=false;
  const timer=setInterval(()=>{if(ended||polling)return;polling=true;void this.#call<Native>({action:'shared.status',conversationId:id}).then(p=>{if(!ended&&p.status==='preparing'){this.#progress=p.progress;this.#preparation={phase:p.phase,elapsedMs:p.elapsedMs,operationId:p.operationId};this.changed();}},()=>{}).finally(()=>{polling=false;});},700);
  try{
   const state=await this.#rpcObserver?.state(id);if(state?.inProgress!==false)throw Error('ACCOUNT_TURN_ACTIVE: The native turn must be confirmed idle before switching.');
   const result=await this.#call<Native>({action:'native.prepare',conversationId:id,connectionId:selected});
   if(this.#disposed||this.#profileError||result.ready!==true||result.threadId!==id||result.selected!==selected)throw Error('ACCOUNT_NATIVE_ROUTE_PROTOCOL: Native account preparation could not be confirmed. No turn was sent.');
   this.#info.selected[id]=selected;this.#info.nativeRoutes??={};if(selected==='host'&&result.routed!==true)delete this.#info.nativeRoutes[id];else this.#info.nativeRoutes[id]=selected;
   this.#rpcRouteFaults.delete(id);this.#progress=100;this.#preparation={phase:'ready',elapsedMs:0};this.usage.refresh([selected]);
   runtimeEvent('accounts','account.routing','prepared',{stage:'native-route-committed',accountOrdinal:this.#accountOrder().indexOf(selected)+1,tools:'native',history:'shared',taskSent:false});
  }catch(error){this.#progress=0;const message=String(error);this.#rpcRouteFaults.set(id,message);this.#showNotice(message);throw error;}
  finally{ended=true;clearInterval(timer);this.#selecting=false;this.#selectionTarget=undefined;this.#rpcRouteRevision.set(id,(this.#rpcRouteRevision.get(id)??0)+1);finish();this.changed();}
 }
 async #rpcRouteStatus(id:string):Promise<void>{
  if(this.#selecting)return;const generation=this.#rpcRouteRevision.get(id)??0;
  const value=await this.#call<Native>({action:'native.status',conversationId:id});
  if(this.#disposed||this.#selecting||generation!==(this.#rpcRouteRevision.get(id)??0))return;
  this.#rpcRouteDiagnostics.set(id,{conversationId:id,connectionId:value.connectionId,routed:value.routed===true,ready:value.ready===true,observationRevision:generation,...(value.diagnostics?{relay:value.diagnostics}:{})});
  if(this.#rpcRouteDiagnostics.size>32)this.#rpcRouteDiagnostics.delete(this.#rpcRouteDiagnostics.keys().next().value!);
  const selected=value.connectionId;if(typeof selected!=='string'||value.ready!==true)throw Error('ACCOUNT_NATIVE_ROUTE_UNAVAILABLE: The prepared account connection is unavailable. Re-select the account before sending.');
  if(selected!=='host'&&!this.#info.connections.some(c=>c.id===selected))throw Error('ACCOUNT_NATIVE_ROUTE_IDENTITY: The prepared account is not in this owner session. No fallback is permitted.');
  this.#info.nativeRoutes??={};if(selected==='host'&&value.routed!==true)delete this.#info.nativeRoutes[id];else this.#info.nativeRoutes[id]=selected;
  if(value.quota)this.usage.observeCached(selected,value.quota);this.changed();
 }
 async #rpcContinue(id:string):Promise<void>{
  if(this.#rpcAutomatic.has(id)){this.#rpcPendingTerminal.add(id);return;}
  const selected=this.#info.nativeRoutes?.[id]??'host';
  const entry=this.#rpcCycles.get(id)??{cycle:new AccountContinuationCycle(this.#accountOrder(),selected),settings:{}};this.#rpcCycles.set(id,entry);this.#rpcAutomatic.add(id);this.changed();
  const current=()=>!this.#disposed&&this.#autoEnabled&&!this.#profileError&&this.#rpcCycles.get(id)===entry&&!entry.cycle.cancelled;
  try{
   const result=await continueAfterQuota(entry.cycle,{
    current,available:c=>c==='host'||this.#info.connections.some(v=>v.id===c&&v.email),
    model:entry.settings.model,
    quota:async c=>{this.#selectionTarget={id:c,conversationId:id};this.#preparation={phase:'check-quota',elapsedMs:0};this.changed();const raw=await this.#readUsage(c);if(current())this.usage.observe(c,raw);return raw;},
    prepare:async c=>{if(current())await this.#rpcSelect(id,c);},
    resume:async()=>{if(current()){const state=await this.#rpcObserver?.state(id);if(state?.inProgress!==false)throw Error('ACCOUNT_AUTO_TURN_ACTIVE: Another native turn is active. No continuation was sent.');if(current())await this.#rpcObserver!.start(id,continuationOperation(id,entry.settings,crypto.randomUUID()));}},
    phase:phase=>{this.#preparation={phase:phase==='checking'?'check-quota':phase==='preparing'?'native-transport':'continue-task',elapsedMs:0};this.changed();},
    event:(stage,details)=>runtimeEvent('accounts','account.auto',stage,{...details,executionMode:'native-relay'}),
   });
   if(result==='unavailable'&&current()){entry.cycle.cancel();this.#showNotice('ACCOUNT_AUTO_NO_QUOTA: Every account in this traversal is exhausted, unavailable, or has unverified quota. No continuation was sent.');}
  }catch(error){entry.cycle.cancel();this.#showNotice(String(error));runtimeEvent('accounts','account.auto','failed',{errorCode:accountErrorCode(error),executionMode:'native-relay',taskRetry:false});}
  finally{this.#rpcAutomatic.delete(id);if(!this.#selecting)this.#selectionTarget=undefined;this.changed();if(this.#rpcPendingTerminal.delete(id)&&current())void this.#rpcContinue(id);}
 }
 #rpcNotification(method:string,p:Native):void{
  if(this.#disposed)return;
  if(method==='account/updated'){if(Object.hasOwn(p,'planType')){this.#info.owner.plan=typeof p.planType==='string'&&/^[a-z][a-z0-9_-]{0,39}$/i.test(p.planType)?p.planType:null;this.changed();}return;}
  if(method==='account/rateLimits/updated'){this.usage.observe('host',p);const remaining=this.usage.remaining('host'),signature=JSON.stringify(remaining);if(signature!==this.#rpcQuotaSignature){this.#rpcQuotaSignature=signature;runtimeEvent('accounts','account.quota','observed',{stage:'native-rpc-notification',accountOrdinal:1,...remaining,taskSent:false});}return;}
  if(typeof p?.threadId!=='string')return;
  if(method==='thread/compacted'||(method==='item/started'||method==='item/completed')&&p.item?.type==='contextCompaction'){
   runtimeEvent('accounts','account.native-compaction',method==='item/started'?'started':'completed',{conversationId:p.threadId,turnId:p.turnId,sourceMethod:method,requestReplayed:false});return;
  }
  if(method==='error'||method==='turn/completed'&&p.turn?.status==='failed'){
   const error=p.error??p.turn?.error,info=error?.codexErrorInfo;
   const kind=typeof info==='string'?info:info&&typeof info==='object'?Object.keys(info)[0]:undefined;
   const known=['contextWindowExceeded','usageLimitExceeded','httpConnectionFailed','responseStreamConnectionFailed','responseStreamDisconnected','responseTooManyFailedAttempts','internalServerError','unauthorized','badRequest','sandboxError'];
   const status=info&&typeof info==='object'?Object.values(info).find(v=>v&&typeof v==='object'&&'httpStatusCode'in v) as Native|undefined:undefined;
   runtimeEvent('accounts','account.native-error','observed',{conversationId:p.threadId,turnId:p.turnId??p.turn?.id,sourceMethod:method,errorKind:kind&&known.includes(kind)?kind:'unclassified',httpStatus:typeof status?.httpStatusCode==='number'?status.httpStatusCode:undefined,officialWillRetry:typeof p.willRetry==='boolean'?p.willRetry:undefined,executionConnection:this.#info.nativeRoutes?.[p.threadId]??'host',taskReplayed:false,rawMessageLogged:false});
  }
  if(method==='thread/closed')runtimeEvent('accounts','account.native-lifecycle','closed',{conversationId:p.threadId,executionConnection:this.#info.nativeRoutes?.[p.threadId]??'host',taskReplayed:false});
  if(method==='turn/started')this.#rpcActivity(p.threadId,true);
  if(method==='turn/completed'&&terminal(p.turn?.status)){
   this.#rpcActivity(p.threadId,false);
   if(this.#info.nativeRouting){
    void this.#rpcRouteStatus(p.threadId).catch(()=>{});
    if(this.#autoEnabled&&isQuotaExhausted(p.turn)){const key=p.threadId+':'+p.turn.id;if(this.#rpcTerminals.has(key))return;this.#rpcTerminals.add(key);if(this.#rpcTerminals.size>128)this.#rpcTerminals.delete(this.#rpcTerminals.values().next().value!);void this.#rpcContinue(p.threadId);}
    else {this.#rpcCycles.get(p.threadId)?.cycle.cancel();this.#rpcCycles.delete(p.threadId);}
   }else if(this.#autoEnabled&&isQuotaExhausted(p.turn))this.#showNotice('ACCOUNT_AUTO_EXECUTION_UNSUPPORTED: The native RPC execution service cannot switch to an independent account. No automatic continuation was sent.');
  }
 }
 diagnostics():Record<string,unknown>{return {mode:this.#rpcMode?'native-rpc':'legacy-manager',independentExecution:!this.#rpcMode||this.#info.nativeRouting===true,attachedManagers:this.#managed.size,observedNativeTurns:this.#rpcActive.size,preparedNativeRoutes:Object.keys(this.#info.nativeRoutes??{}).length,observationReady:!!this.#rpcObserver,enabled:this.#enabled,nativeRouteObservations:[...this.#rpcRouteDiagnostics.values()]};}
 #recordOutcome(id:string,result:OutcomeObservation):void{
  if(result.previousOutcome!=='unverified'){if(result.previousOutcome)this.#outcomes.delete(id);return;}
  const reason=/^[a-z-]{1,64}$/.test(result.outcomeReason??'')?result.outcomeReason!:'legacy-unverified';
  const turnId=/^[a-zA-Z0-9_:-]{1,128}$/.test(result.previousTurnId??'')?result.previousTurnId!:undefined;
  const key=(result.outcomeKey??turnId??reason).slice(0,256);
  if(this.#outcomes.get(id)?.key===key)return;
  const message=`ACCOUNT_PREVIOUS_OUTCOME: The previous execution ended without a verified terminal record. Review this conversation and project before continuing. reason=${reason}; conversationId=${id}${turnId?'; turnId='+turnId:''}. No previous request was replayed.`;
  this.#outcomes.set(id,{key,message});
  runtimeEvent('accounts','account.outcome','unverified',{conversationId:id,previousTurnId:turnId,reason,bytesRead:result.outcomeEvidence?.bytesRead,tailOffset:result.outcomeEvidence?.tailOffset,limitBytes:result.outcomeEvidence?.limitBytes,taskReplayed:false});
 }
 #showNotice(message:string):void{this.#lastNotice=message;this.notice(message);}
 #clearError(b:Binding):void{if(b.error&&b.error===this.#lastNotice)this.#showNotice('');b.error=undefined;}
 #fail(b:Binding,error:unknown):void{b.error=error instanceof Error?error.message:String(error);this.#showNotice(b.error);this.changed();}
 changed():void{
  const signature=JSON.stringify([this.status(),this.#info.owner,this.#info.connections,this.usage.revision,this.#autoEnabled]);
  if(signature===this.#uiSignature)return;
  this.#uiSignature=signature;window.dispatchEvent(new Event(ACCOUNT_UI_CHANGED));
 }
 async dispose():Promise<void>{
  if(!this.canDisable())throw Error('ACCOUNT_TURN_ACTIVE: Finish or stop the active turns before disabling this plugin.');
  const current=await this.request<AccountsInfo>({action:'info'});if(current.owner.id===this.#info.owner.id)await this.#call({action:'release'});
  this.#disposed=true;this.usage.dispose();clearTimeout(this.#timer);for(const dispose of this.#disposers.reverse())dispose();this.#disposers=[];this.#bindings.clear();this.#outcomes.clear();this.#managed.clear();this.#rpcRouteDiagnostics.clear();this.changed();
 }
}
