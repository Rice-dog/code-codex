import {ApiConnectionEditor} from './features/accounts/api-editor';
import {AccountList,accountListCss,type AccountCheckResult} from './features/accounts/account-list';
import {t,subscribeLanguage} from './i18n';
import {requestAccounts,accountRequestSnapshot} from './host/bridge/accounts';
import {ComposerAccountSelector} from './features/accounts/composer-selector';
import {NativeAccountAdapter} from './features/accounts/native-adapter';
import {hostProfileAssetRequest} from './features/accounts/host-assets';
import {AccountUsageStore} from './features/accounts/quota';
import {ACCOUNT_ENABLED_KEY,ACCOUNT_AUTO_CONTINUE_KEY,ACCOUNT_UI_CHANGED,type AccountsInfo} from './features/accounts/contracts';
import {ApplicationDialog} from './components/application-dialog';
import {runtimeEvent} from './runtime-events';
import {primaryStatusText} from './features/accounts/primary-status';
import {accountActionMessage,logAccountError} from './features/accounts/error-presentation';
import type {PrimarySwitch} from './features/accounts/contracts';

// Document ownership is independent of the market/file-tree panel's lifetime.
const key=Symbol.for('code-codex:multi-account-runtime:v1');
interface Session {selector?:ComposerAccountSelector;selectorRevision?:string;adapter?:NativeAccountAdapter;enabled:boolean;pending?:Promise<void>;error?:string|undefined;viewRevision?:string;generation?:number;}
const REVISION='account-native-routing-v26';
const SELECTOR_REVISION='account-composer-home-identity-v8';
const session=():Session=>((window as unknown as Record<symbol,Session>)[key]??={enabled:localStorage.getItem(ACCOUNT_ENABLED_KEY)==='true'});
const emit=()=>window.dispatchEvent(new Event(ACCOUNT_UI_CHANGED));
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};

export class MultiAccountPlugin {
 #abort:AbortController|undefined;
 #unsubscribe?:()=>void;
 #busy=false;
 #knownInfo:AccountsInfo|undefined;
 #panelQuota?:{owner:string;store:AccountUsageStore}|undefined;
 #primaryStartedAt:number|undefined;
 #primaryTimer:ReturnType<typeof setInterval>|undefined;
 #primaryPolling=false;
 #primaryPollEpoch=0;
 #primaryStatus:PrimarySwitch|null|undefined;
 #primaryOwner?:string;
 #primaryReadFailed=false;
 #dialog=new ApplicationDialog();
 #list:AccountList|undefined;
 #apiEditor:ApiConnectionEditor|undefined;
 #refreshing=false;
 #refreshJob:Promise<void>|undefined;
 #epoch=0;
 #refreshEpoch=0;
 #operation=0;
 #queryError:string|undefined;
 #panelResize:ResizeObserver|undefined;
 constructor(private readonly shadow:ShadowRoot,private readonly notice:(message:string)=>void){}
 #el<T extends HTMLElement=HTMLElement>(selector:string):T{return this.shadow.querySelector<T>(selector)!;}
 #error=(error:unknown)=>{if(!this.#abort||String(error).includes('ACCOUNT_QUERY_STALE'))return;logAccountError('settings-action',error);session().error=error instanceof Error?error.message:String(error);this.render();};
 #accountNotice=(message:string)=>{if(message)logAccountError('runtime-notice',message);session().error=message||undefined;emit();};
 #current(epoch:number,generation:number):boolean{return !!this.#abort&&!this.#abort.signal.aborted&&epoch===this.#epoch&&generation===(session().generation??0);}
 #check(epoch:number,generation:number):void{if(!this.#current(epoch,generation))throw Error('ACCOUNT_QUERY_STALE: The account query belongs to a retired controller or login session. No state was committed.');}
 start():void {
  if(this.#abort)return;
  const controller=this.#abort=new AbortController(),options={signal:controller.signal};
  this.#epoch++;session().generation=(session().generation??0)+1;
  this.#el('.accounts-enable').addEventListener('click',()=>void this.#toggle().catch(this.#error),options);
  this.#el('.accounts-settings-trigger').addEventListener('click',()=>this.open(),options);
  this.#el<HTMLInputElement>('.accounts-auto-continue')?.addEventListener('change',event=>{const enabled=(event.currentTarget as HTMLInputElement).checked;try{localStorage.setItem(ACCOUNT_AUTO_CONTINUE_KEY,String(enabled));session().adapter?.setAutoContinue(enabled);this.render();}catch(error){this.#error(error);}},options);
  this.#el<HTMLInputElement>('.accounts-follow-logout')?.addEventListener('change',()=>void this.#policy().catch(this.#error),options);
  this.#el('.accounts-primary-cancel')?.addEventListener('click',()=>void this.#cancelPrimary().catch(this.#error),options);
  this.#el('.accounts-close').addEventListener('click',()=>{this.close();this.#el('.accounts-settings-trigger').focus();},options);
  this.#el('.accounts-panel').addEventListener('toggle',()=>{if(!this.#el('.accounts-panel').matches(':popover-open'))this.#panelQuota?.store.suspend(true);},options);
  this.#el('.accounts-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.close();this.#el('.accounts-settings-trigger').focus();}},options);
  this.#apiEditor=new ApiConnectionEditor(this.shadow,{
   loadKey:async id=>{const owner=(session().adapter?.info??this.#knownInfo)?.owner.id;if(!owner)throw Error('ACCOUNT_OWNER_CHANGED: Refresh the connection list before editing.');return requestAccounts<{apiKey:string}>({action:'api.editor',owner,connectionId:id});},
   fetchModels:async value=>{const owner=(session().adapter?.info??this.#knownInfo)?.owner.id;if(!owner)throw Error('ACCOUNT_OWNER_CHANGED: Refresh the connection list before fetching models.');return requestAccounts<{models:string[]}>({action:'api.catalog',owner,...value});}
  });
  this.#list=new AccountList(this.shadow,this.#el('.accounts-list'),async(action,id)=>{try{if(action==='api.add'||action==='api.edit'){this.#editApi(action==='api.edit'?id:undefined);return;}return await (action==='add'?this.#add():this.#action(action,id));}catch(error){this.#error(error);if(action==='verify'||action==='reconcile')throw error;}},ids=>this.#reorder(ids));
  const fence=(event:Event)=>{
   if(this.#primaryStartedAt===undefined&&(session().adapter?.info??this.#knownInfo)?.primarySwitch?.state!=='pending')return;
   const target=event.target as Element;
   if(event.type==='click'&&!target?.closest?.('button[data-testid=send-button],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="发送消息"],button[aria-label="发送"]'))return;
   if(event instanceof KeyboardEvent&&(event.key!=='Enter'||event.shiftKey||event.isComposing||!target?.closest?.('[contenteditable=true],textarea')))return;
   if(event.type==='submit'&&!target?.querySelector?.('[contenteditable=true],textarea'))return;
   event.preventDefault();event.stopImmediatePropagation();this.notice('Wait for the primary account to finish switching before sending.');
  };
  for(const type of ['click','keydown','submit'])document.addEventListener(type,fence,{...options,capture:true});
  window.addEventListener(ACCOUNT_UI_CHANGED,()=>this.render(),options);
  // A same-version document may reuse this panel/controller. Native publication
  // must wake it directly; background renderer intervals can be suspended.
  window.addEventListener('code-codex:accounts-connected',()=>{
   const documentVersion=(window as unknown as Record<symbol,{version?:string}>)[Symbol.for('code-codex:document-connection-owner:v2')]?.version;
   const hostVersion=this.shadow.host?.tagName?.match(/^CODE-CODEX-V(\d+)-(\d+)-(\d+)(?:-B[0-9A-F]+)?$/)?.slice(1).join('.');
   // During a cross-version upgrade the old panel can still be connected briefly.
   // Only a panel belonging to the published document may eagerly bind it.
   if(hostVersion&&documentVersion&&hostVersion!==documentVersion)return;
   this.#epoch++;this.#refreshEpoch++;this.#refreshing=false;this.#refreshJob=undefined;
   this.#knownInfo=undefined;
   this.#releasePanelQuota();
   this.#queryError=undefined;
   const state=session();state.generation=(state.generation??0)+1;delete state.pending;
   if(state.enabled&&this.#primaryStartedAt===undefined)void this.#enable().catch(this.#error);
   else if(!state.enabled&&this.#el('.accounts-panel').matches(':popover-open'))void this.#refresh().catch(this.#error);
   this.render();
  },options);
  window.addEventListener('resize',()=>this.#position(),options);
  window.addEventListener('code-codex:account-session-ended',()=>{const state=session();state.generation=(state.generation??0)+1;delete state.pending;state.adapter?.endSession();state.selector?.dispose();delete state.selector;delete state.adapter;state.error=undefined;this.#knownInfo=undefined;this.#releasePanelQuota();this.#queryError=undefined;this.render();},options);
  window.addEventListener('code-codex:account-session-error',event=>this.#error((event as CustomEvent).detail),options);
  window.addEventListener('code-codex:account-identity-changed',()=>{if(this.#primaryStartedAt===undefined)void this.#refresh(true).catch(this.#error);},options);
  window.addEventListener('online',()=>{if(this.#queryError&&this.#primaryStartedAt===undefined)void this.#refresh().catch(this.#error);},options);
  this.#unsubscribe=subscribeLanguage(()=>this.render());
  this.#installStyles();
  if(typeof ResizeObserver==='function'){this.#panelResize=new ResizeObserver(()=>this.#position());this.#panelResize.observe(this.#el('.accounts-panel'));}
  if(session().enabled)void this.#enable().catch(this.#error);
  this.render();

 }
 async #enable(known?:AccountsInfo):Promise<void>{
  const state=session(),epoch=this.#epoch,generation=state.generation??0;
  if(state.pending)return state.pending;
  const pending=(async()=>{
   const info=known??await requestAccounts<AccountsInfo>({action:'info'});this.#check(epoch,generation);
   const status=state.adapter?.status();
   if(state.adapter&&state.viewRevision===REVISION&&state.adapter.info.owner.id===info.owner.id&&status?.active&&status.supported){
    state.adapter.setEnabled(true);state.adapter.updateInfo(info);
    // A view-only upgrade reuses the verified adapter/routes. Wait for idle
    // rather than replacing an in-flight composer preflight or active task.
    if(!state.selector||state.selectorRevision!==SELECTOR_REVISION&&!status.busy&&!status.preparing){state.selector?.dispose();state.selector=new ComposerAccountSelector(state.adapter,this.#accountNotice);state.selectorRevision=SELECTOR_REVISION;}
    return;
   }
   // Hot upgrades retain document ownership. Retire only an idle old adapter;
   // disposal refuses an active independent turn and never changes GUI login.
   if(state.adapter){if(state.adapter.info.owner.id!==info.owner.id||!status?.active||!status.supported)state.adapter.endSession();else await state.adapter.dispose();this.#check(epoch,generation);state.selector?.dispose();delete state.selector;delete state.adapter;}
   const adapter=new NativeAccountAdapter(accountRequestSnapshot(),info,this.#accountNotice);
   try{await adapter.start();this.#check(epoch,generation);state.adapter=adapter;state.selector=new ComposerAccountSelector(adapter,this.#accountNotice);state.selectorRevision=SELECTOR_REVISION;state.viewRevision=REVISION;state.error=undefined;this.#queryError=undefined;}
   catch(error){adapter.endSession();throw error;}
  })();
  state.pending=pending;
  try{await pending;}finally{if(state.pending===pending)delete state.pending;this.render();}
 }
 async #toggle():Promise<void>{
  if(this.#busy)return;this.#busy=true;this.render();
  const epoch=this.#epoch,generation=session().generation??0;
  try{
   const state=session();state.error=undefined;
   if(state.enabled){await state.adapter?.useOfficialIdentity();this.#check(epoch,generation);state.adapter?.setEnabled(false);state.selector?.dispose();delete state.selector;state.enabled=false;localStorage.setItem(ACCOUNT_ENABLED_KEY,'false');}
    else{try{await this.#enable();state.enabled=true;localStorage.setItem(ACCOUNT_ENABLED_KEY,'true');}catch(error){state.enabled=false;state.adapter?.setEnabled(false);state.selector?.dispose();delete state.selector;localStorage.setItem(ACCOUNT_ENABLED_KEY,'false');throw error;}}
  }finally{this.#busy=false;this.render();}
 }
 async #refresh(fresh=false):Promise<void>{
  const prior=this.#refreshJob;
  if(prior){if(!fresh)return prior;await prior.catch(()=>{});if(!this.#abort)throw Error('ACCOUNT_QUERY_STALE: The account panel ended before refresh.');return this.#refresh();}
  const job=this.#readInfo();this.#refreshJob=job;
  try{await job;}finally{if(this.#refreshJob===job)this.#refreshJob=undefined;}
 }
 async #readInfo():Promise<void>{
  if(this.#refreshing)return;this.#refreshing=true;const epoch=this.#epoch,generation=session().generation??0,operationId=++this.#operation,started=performance.now(),refreshEpoch=++this.#refreshEpoch;
  try{const state=session(),info=await requestAccounts<AccountsInfo>({action:'info'});this.#check(epoch,generation);this.#knownInfo=info;
   if(state.adapter&&state.adapter.info.owner.id!==info.owner.id){state.adapter.endSession();state.selector?.dispose();delete state.adapter;delete state.selector;}
   if(!state.enabled)state.adapter?.updateInfo(info);
   if(state.enabled){const status=state.adapter?.status();if(!state.adapter||!status?.supported||!status.active||state.selectorRevision!==SELECTOR_REVISION&&!status.busy&&!status.preparing)await this.#enable(info);else state.adapter.updateInfo(info);}
   this.#check(epoch,generation);if(this.#queryError&&state.error===this.#queryError)state.error=undefined;this.#queryError=undefined;
   runtimeEvent('accounts','account.query','confirmed',{operationId,stage:'info',durationMs:Math.round(performance.now()-started),taskSent:false});this.render();
  }catch(error){if(this.#current(epoch,generation)){this.#queryError=error instanceof Error?error.message:String(error);runtimeEvent('accounts','account.query','failed',{operationId,stage:'info',durationMs:Math.round(performance.now()-started),error:String(error),taskSent:false});}throw error;}
  finally{if(refreshEpoch===this.#refreshEpoch)this.#refreshing=false;}
 }
 #releasePanelQuota():void{
  this.#panelQuota?.store.dispose();
  this.#panelQuota=undefined;
 }
 #readOnlyQuota(info:AccountsInfo):AccountUsageStore{
  const owner=info.owner.id;
  if(this.#panelQuota?.owner===owner)return this.#panelQuota.store;
  this.#releasePanelQuota();
  const request=accountRequestSnapshot();
  const current=()=>this.#panelQuota?.owner===owner&&this.#knownInfo?.owner.id===owner;
  const read=async(id:string)=>{
   if(id!=='host')return request({action:'usage',owner,connectionId:id});
   const before=await request<AccountsInfo>({action:'info'});
   if(!current()||before.owner.id!==owner)throw Error('ACCOUNT_USAGE_OWNER: The host login changed before quota could be read.');
   const result=await hostProfileAssetRequest(before.profile.shared,'account/rateLimits/read',{});
   const after=await request<AccountsInfo>({action:'info'});
   if(!current()||after.owner.id!==owner)throw Error('ACCOUNT_USAGE_OWNER: The account session changed while quota was being read.');
   return result;
  };
  const store=new AccountUsageStore(read,()=>this.render(),Date.now,(id,outcome,details)=>{
   const index=this.#knownInfo?.connections.findIndex(connection=>connection.id===id)??-1;
   runtimeEvent('accounts','account.quota',outcome,{...details,mode:'settings-read-only',accountOrdinal:id==='host'?1:index<0?null:index+2,taskSent:false});
  });
  this.#panelQuota={owner,store};
  return store;
 }
 async #add():Promise<void>{
  if(this.#busy)return;this.#busy=true;this.render();
  let id:string;
  const epoch=this.#epoch,generation=session().generation??0;
  try{session().enabled=true;localStorage.setItem(ACCOUNT_ENABLED_KEY,'true');await this.#enable();this.#check(epoch,generation);const result=await requestAccounts<{id:string}>({action:'add',owner:session().adapter!.info.owner.id,label:t('accounts.add')});this.#check(epoch,generation);id=result.id;await this.#refresh(true);this.#check(epoch,generation);}
  finally{this.#busy=false;this.render();}
  await this.#action('login',id);
 }
 #editApi(id?:string):void{
  if(this.#busy)return;const info=session().adapter?.info??this.#knownInfo;if(!info)return;
  const epoch=this.#epoch,generation=session().generation??0;
  const connection=id?info.connections.find(c=>c.id===id):undefined;
  this.#apiEditor?.open(connection,async value=>{
   this.#check(epoch,generation);this.#busy=true;this.render();
   try{await requestAccounts({action:id?'api.update':'api.add',owner:info.owner.id,...(id?{connectionId:id}:{}),...value});this.#check(epoch,generation);await this.#refresh(true);}finally{this.#busy=false;this.render();}
  });
 }
 async #policy():Promise<void>{
  const toggle=this.#el<HTMLInputElement>('.accounts-follow-logout'),info=session().adapter?.info??this.#knownInfo;if(!info)return;
  const value=toggle.checked;this.#busy=true;this.render();
  try{await requestAccounts({action:'session.policy',owner:info.owner.id,followLogout:value});info.followLogout=value;await this.#refresh(true);}finally{this.#busy=false;this.render();}
 }
 async #readPrimary():Promise<void>{
  const info=session().adapter?.info??this.#knownInfo;if(!info||this.#primaryPolling||!this.#abort)return;
  const epoch=this.#epoch,generation=session().generation??0,pollEpoch=this.#primaryPollEpoch;this.#primaryPolling=true;
  const legacy=this.#primaryStartedAt===undefined&&(this.#primaryStatus??info.primarySwitch)?.stage?.startsWith('authorization-');
  try{
   const value=await requestAccounts<PrimarySwitch|null>({action:legacy?'primary.status':'primary.progress',owner:info.owner.id});
   this.#check(epoch,generation);
   if(pollEpoch!==this.#primaryPollEpoch||(session().adapter?.info??this.#knownInfo)?.owner.id!==info.owner.id)return;
   if(value!==null&&(!value||!['pending','completed','cancelled','mismatch','failed','interrupted'].includes(value.state)))throw Error('ACCOUNT_PRIMARY_STATUS_PROTOCOL: The primary-account status response is invalid.');
   if(this.#primaryStartedAt!==undefined&&value?.state!=='pending')return;
   this.#primaryStatus=value;
   this.#primaryOwner=info.owner.id;
   this.#primaryReadFailed=false;
   if(legacy&&info.primarySwitch?.state!==value?.state){info.primarySwitch=value;session().adapter?.updateInfo(info);}
  }
  catch(error){
   if(this.#current(epoch,generation)&&pollEpoch===this.#primaryPollEpoch&&!this.#primaryReadFailed){
    this.#primaryReadFailed=true;
    logAccountError('primary-status-read',error);
   }
  }
  finally{if(pollEpoch===this.#primaryPollEpoch){this.#primaryPolling=false;if(this.#current(epoch,generation))this.render();}}
 }
 #watchPrimary(watch:boolean):void{
  if(watch&&!this.#primaryTimer){this.#primaryTimer=setInterval(()=>{if(this.#primaryStartedAt!==undefined)this.#renderPrimaryElapsed();void this.#readPrimary();},1000);}
  else if(!watch&&this.#primaryTimer){clearInterval(this.#primaryTimer);this.#primaryTimer=undefined;this.#primaryPollEpoch++;this.#primaryPolling=false;}
 }
 async #cancelPrimary():Promise<void>{const info=session().adapter?.info??this.#knownInfo;if(!info||this.#busy)return;this.#busy=true;this.render();try{await requestAccounts({action:'primary.cancel',owner:info.owner.id});this.#watchPrimary(false);this.#primaryStatus=undefined;await this.#readPrimary();await this.#refresh(true);}finally{this.#busy=false;this.render();}}
 async #reorder(connectionIds:string[]):Promise<void>{
  const info=session().adapter?.info??this.#knownInfo;if(!info||this.#busy)throw Error('ACCOUNT_QUERY_BUSY: Wait for the account action before reordering.');
  const epoch=this.#epoch,generation=session().generation??0;this.#busy=true;
  try{await requestAccounts({action:'connections.reorder',owner:info.owner.id,connectionIds});this.#check(epoch,generation);await this.#refresh(true);}
  catch(error){this.#error(error);throw error;}finally{this.#busy=false;this.render();}
 }
 async #action(action:string,id:string):Promise<AccountCheckResult|void>{
  if(this.#busy)throw Error('ACCOUNT_QUERY_BUSY: Wait for the pending account action.');this.#busy=true;session().error=undefined;if(action!=='primary.start')this.#primaryStatus=undefined;this.render();
  const epoch=this.#epoch,generation=session().generation??0,adapter=session().adapter,info=adapter?.info??this.#knownInfo;
  if(!info){this.#busy=false;throw Error('ACCOUNT_CONNECTION: Connected account information is unavailable.');}
  const check=()=>{this.#check(epoch,generation);if(session().adapter!==adapter)throw Error('ACCOUNT_QUERY_STALE: The queried account runtime was replaced.');};
  try{let feedback:AccountCheckResult|undefined;
   if(action==='primary.start'){
    if(!await this.#dialog.confirm(t('accounts.primaryTitle')+' · '+(info.connections.find(c=>c.id===id)?.email??''),'accounts.primaryConfirm'))return;
    check();
    // Cached turn activity can outlive a response. The native handoff owns
    // the authoritative idle check across both official and plugin tasks.
    if(adapter?.primaryPreparationPending?.())
      throw Error('ACCOUNT_PRIMARY_PREPARING: An account change or a send is still being prepared. No sign-in change was attempted.');
    this.#watchPrimary(false);
    this.#primaryStartedAt=performance.now();
    this.#primaryOwner=info.owner.id;
    this.#primaryStatus=undefined;
    this.#primaryReadFailed=false;
    this.render();
    const target=info.connections.find(c=>c.id===id)?.email;
    let result:{completed?:boolean;targetEmail?:string};
    try{result=await requestAccounts({action:'primary.promote',owner:info.owner.id,connectionId:id});}
    catch(error){
      const code=String(error).match(/\bACCOUNT_[A-Z_]+\b/)?.[0];
      if(code&&!['ACCOUNT_PRIMARY_OUTCOME_UNKNOWN','ACCOUNT_QUERY_STALE','ACCOUNT_DISCONNECTED','ACCOUNT_STALE_SESSION','ACCOUNT_OWNER_CHANGED'].includes(code))throw error;
      const progress=await requestAccounts<PrimarySwitch|null>({action:'primary.progress',owner:info.owner.id}).catch(()=>null);
      if(target&&progress?.state==='completed'&&progress.targetEmail===target&&this.#isCurrentPrimaryProgress(progress)){
       result={completed:true,targetEmail:target};
      }else{
       // An interrupted receipt can outlive the old Bridge. Verify the current
       // identity without replaying the login, using that read to update the list.
       await this.#refresh(true).catch(()=>{});
       const observed=this.#knownInfo;
       if(!observed||!target||observed.owner.id===info.owner.id||observed.owner.label.toLowerCase()!==target.toLowerCase())throw error;
       this.#primaryStartedAt=undefined;
       this.#primaryStatus={state:'completed',targetEmail:target};
       logAccountError('primary-promote-reconciled',error);
       return;
      }
      logAccountError('primary-promote-reconciled',error);
    }
    if(result.completed){
     this.#primaryStartedAt=undefined;
     const email=result.targetEmail??target;
     this.#primaryStatus=email?{state:'completed',targetEmail:email}:{state:'completed'};
     this.render();
    }
    await this.#refresh(true).catch(()=>{});
    return;
   }
   if(action==='reconcile'){if(adapter)feedback=await adapter.reconcile(id);else{await requestAccounts({action:'reconcile',owner:info.owner.id,connectionId:id});feedback='idle';}}
   else{const result=await requestAccounts<{signedIn?:boolean}>({action,owner:info.owner.id,connectionId:id});if(action==='verify')feedback=result.signedIn?'signedIn':'signedOut';}
   check();
   const usage=session().enabled?adapter?.usage:this.#panelQuota?.store;
   if(action==='login'||action==='remove')usage?.forgetCreditEvidence(id);
   if(['verify','login','remove'].includes(action))usage?.invalidate(id);
   if(action==='verify') {
    // Login feedback is independent of remote quota availability.
    if(feedback==='signedIn')usage?.refresh([id]);
    void this.#refresh(true).catch(this.#error);
    return feedback;
   }
   await this.#refresh(true);check();return feedback;
  }
  catch(error){if(action==='primary.start')this.#primaryStatus=undefined;if(String(error).includes('ACCOUNT_AUTH_REQUIRED'))await this.#refresh().catch(()=>{});throw error;}
  finally{if(action==='primary.start')this.#primaryStartedAt=undefined;this.#busy=false;this.render();}
 }
 #isCurrentPrimaryProgress(value:PrimarySwitch):boolean{
  return !!value.operationId&&value.operationId===this.#primaryStatus?.operationId;
 }
 #renderPrimaryElapsed(elapsedMs?:number):void{
  const elapsed=this.#primaryStartedAt===undefined?elapsedMs:performance.now()-this.#primaryStartedAt;
  const node=this.#el('.accounts-elapsed'),value=elapsed===undefined?'':t('accounts.primaryElapsed',{seconds:String(Math.max(0,Math.floor(elapsed/1000)))});
  if(node.textContent!==value)node.textContent=value;
 }
 render():void{
  if(!this.#abort)return;
  const state=session(),adapter=state.adapter,info=adapter?.info??this.#knownInfo,ready=state.enabled&&!!adapter?.status().active&&!!adapter.status().supported;
  const text=(selector:string,value:string)=>{const node=this.#el(selector);if(node.textContent!==value)node.textContent=value;};
  const button=this.#el<HTMLButtonElement>('.accounts-enable'),caption=t(state.enabled?'accounts.disable':'accounts.enable');if(button.textContent!==caption)button.textContent=caption;const pressed=String(state.enabled);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);if(button.disabled!==(this.#busy||!!state.pending))button.disabled=this.#busy||!!state.pending;
  text('.accounts-status',state.enabled?(ready?t('accounts.enabled'):state.error?'Unavailable':t('accounts.connecting')):t('accounts.disabled'));
  text('[data-tool-plugin="code-codex.multi-account"] h4',t('plugin.name.multi-account'));
  const auto=adapter?.autoStatus(),toggle=this.#el<HTMLInputElement>('.accounts-auto-continue');
  if(toggle){toggle.checked=localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true';toggle.disabled=!state.enabled||!!state.pending||!adapter;}
  const follow=this.#el<HTMLInputElement>('.accounts-follow-logout');if(follow){follow.checked=info?.followLogout!==false;follow.disabled=this.#busy||!!state.pending||!info;}
  const starting=this.#primaryStartedAt!==undefined;
  const displayed=this.#primaryStatus?.state==='completed'||this.#primaryOwner===info?.owner.id?this.#primaryStatus:undefined;
  const primary=displayed===undefined?info?.primarySwitch:displayed,waiting=primary?.state==='pending';
  const cancel=this.#el<HTMLButtonElement>('.accounts-primary-cancel');
  cancel.hidden=starting||!(waiting||primary?.state==='interrupted'&&primary.authorizationRequested);
  cancel.disabled=this.#busy;
  const primaryText=starting?primaryStatusText(waiting?primary:{state:'pending'}):primaryStatusText(waiting?primary:displayed);
  const notice=state.error??adapter?.status().recoveryNotice;
  const message=primaryText||(notice?accountActionMessage(notice):state.pending?t('accounts.connecting'):auto?t(auto==='checking'?'accounts.autoChecking':auto==='preparing'?'accounts.autoPreparing':'accounts.autoContinuing'):'');
  text('.accounts-message',message);
  this.#renderPrimaryElapsed(waiting?primary.elapsedMs:undefined);
  this.#el('.accounts-feedback').hidden=!message;
  const open=this.#el('.accounts-panel').matches(':popover-open');
  if(state.enabled||this.#panelQuota&&this.#panelQuota.owner!==this.#knownInfo?.owner.id)this.#releasePanelQuota();
  const preview=!state.enabled&&open&&this.#knownInfo?this.#readOnlyQuota(this.#knownInfo):this.#panelQuota?.store;
  preview?.suspend(!open||starting||waiting||!!state.pending);
  const usage=ready?adapter?.usage:preview;
  this.#watchPrimary(open&&(starting||waiting));
  if(open)this.#list?.render(info,this.#busy||!!state.pending||waiting,usage??adapter?.usage);
  if(open&&info&&!starting&&!waiting&&!state.pending)usage?.refresh(['host',...info.connections.filter(c=>c.email&&(!preview||!c.reauthorizationRequired)).map(c=>c.id)]);
  if(open)this.#position();
 }
 open():void{
  const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open')){this.close();return;}
  for(const other of this.shadow.querySelectorAll<HTMLElement>('.particle-settings-panel'))if(other!==panel&&other.matches(':popover-open'))other.hidePopover();
  panel.showPopover();this.render();this.#position();
  this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','true');this.#el('.accounts-close').focus();
  if(this.#primaryStartedAt===undefined)void this.#refresh().catch(this.#error);
 }
 #position():void{
  const panel=this.#el('.accounts-panel');if(!panel.matches(':popover-open'))return;
  const anchor=this.#el('.accounts-settings-trigger').getBoundingClientRect(),box=panel.getBoundingClientRect();
  panel.style.left=Math.max(12,Math.min(innerWidth-box.width-12,anchor.right+12))+'px';
  const height=panel.getBoundingClientRect().height;
  panel.style.top=Math.max(12,Math.min(innerHeight-height-12,anchor.top))+'px';
 }
 close():void{if(this.#primaryStatus?.state!=='pending')this.#primaryStatus=undefined;this.#watchPrimary(false);this.#panelQuota?.store.suspend(true);this.#list?.close();const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open'))panel.hidePopover();this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','false');}
 containsEvent(event:Event):boolean{return this.#dialog.containsEvent(event)||event.composedPath().some(n=>n instanceof HTMLElement&&(n.hasAttribute('data-account-assets-dialog')||n.hasAttribute('data-account-api-editor')))||event.composedPath().includes(this.#el('.accounts-panel'))||event.composedPath().includes(this.#el('.accounts-settings-trigger'))||!!this.#list?.containsEvent(event);}
 stop():void{this.#apiEditor?.dispose();this.#dialog.dispose();this.#epoch++;this.#refreshEpoch++;this.#refreshing=false;this.#refreshJob=undefined;this.close();this.#knownInfo=undefined;this.#releasePanelQuota();this.#panelResize?.disconnect();this.#panelResize=undefined;this.#list?.dispose();this.#list=undefined;this.#abort?.abort();this.#abort=undefined;this.#unsubscribe?.();}
 #installStyles():void{
  if(this.shadow.querySelector('[data-account-styles]'))return;
  const style=element('style');style.dataset.accountStyles='';style.textContent=accountListCss+'.accounts-global-controls{margin-top:16px;padding-top:12px;border-top:1px solid var(--cle-rule)}.accounts-connections-group{margin-bottom:0}.accounts-auto-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.accounts-auto-row span{min-width:0}.accounts-auto-row input{appearance:none;position:relative;flex:none;margin:0;width:30px;height:17px;border:1px solid var(--cle-rule-strong);border-radius:999px;background:var(--cle-hover);cursor:pointer}.accounts-auto-row input::before{content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;background:var(--cle-muted);transition:transform 120ms ease}.accounts-auto-row input:checked{background:var(--cle-signal)}.accounts-auto-row input:checked::before{transform:translateX(13px);background:#fff}.accounts-auto-row input:focus-visible{outline:2px solid var(--cle-focus);outline-offset:2px}.accounts-auto-row input:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.accounts-auto-row input::before{transition:none}}';this.shadow.append(style);
 }
}
