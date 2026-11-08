import {ApiConnectionEditor} from './features/accounts/api-editor';
import {AccountList,accountListCss,type AccountCheckResult} from './features/accounts/account-list';
import {t,subscribeLanguage} from './i18n';
import {requestAccounts,accountRequestSnapshot} from './host/bridge/accounts';
import {ComposerAccountSelector} from './features/accounts/composer-selector';
import {NativeAccountAdapter} from './features/accounts/native-adapter';
import {ACCOUNT_ENABLED_KEY,ACCOUNT_AUTO_CONTINUE_KEY,ACCOUNT_UI_CHANGED,type AccountsInfo} from './features/accounts/contracts';
import {ApplicationDialog} from './components/application-dialog';
import {runtimeEvent} from './runtime-events';
import {primaryStatusText} from './features/accounts/primary-status';
import type {PrimarySwitch} from './features/accounts/contracts';

// Document ownership is independent of the market/file-tree panel's lifetime.
const key=Symbol.for('code-codex:multi-account-runtime:v1');
interface Session {selector?:ComposerAccountSelector;adapter?:NativeAccountAdapter;enabled:boolean;pending?:Promise<void>;error?:string|undefined;viewRevision?:string;generation?:number;}
const REVISION='account-native-routing-v23';
const session=():Session=>((window as unknown as Record<symbol,Session>)[key]??={enabled:localStorage.getItem(ACCOUNT_ENABLED_KEY)==='true'});
const emit=()=>window.dispatchEvent(new Event(ACCOUNT_UI_CHANGED));
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};

export class MultiAccountPlugin {
 #abort:AbortController|undefined;
 #unsubscribe?:()=>void;
 #busy=false;
 #knownInfo?:AccountsInfo;
 #primaryStarting=false;
 #primaryTimer:ReturnType<typeof setInterval>|undefined;
 #primaryPolling=false;
 #primaryPollEpoch=0;
 #primaryStatus:PrimarySwitch|null|undefined;
 #primaryOwner?:string;
 #primaryReadError='';
 #dialog=new ApplicationDialog();
 #list:AccountList|undefined;
 #apiEditor:ApiConnectionEditor|undefined;
 #refreshing=false;
 #refreshJob:Promise<void>|undefined;
 #refreshTimer?:ReturnType<typeof setInterval>;
 #epoch=0;
 #refreshEpoch=0;
 #operation=0;
 #queryError:string|undefined;
 #nextQueryAt=0;
 #queryFailures=0;
 #panelResize:ResizeObserver|undefined;
 constructor(private readonly shadow:ShadowRoot,private readonly notice:(message:string)=>void){}
 #el<T extends HTMLElement=HTMLElement>(selector:string):T{return this.shadow.querySelector<T>(selector)!;}
 #error=(error:unknown)=>{if(!this.#abort||String(error).includes('ACCOUNT_QUERY_STALE'))return;const message=error instanceof Error?error.message:String(error);if(session().error!==message)this.notice(message);session().error=message;this.render();};
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
  this.#el('.accounts-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.close();this.#el('.accounts-settings-trigger').focus();}},options);
  this.#apiEditor=new ApiConnectionEditor(this.shadow,{
   loadKey:async id=>{const owner=(session().adapter?.info??this.#knownInfo)?.owner.id;if(!owner)throw Error('ACCOUNT_OWNER_CHANGED: Refresh the connection list before editing.');return requestAccounts<{apiKey:string}>({action:'api.editor',owner,connectionId:id});},
   fetchModels:async value=>{const owner=(session().adapter?.info??this.#knownInfo)?.owner.id;if(!owner)throw Error('ACCOUNT_OWNER_CHANGED: Refresh the connection list before fetching models.');return requestAccounts<{models:string[]}>({action:'api.catalog',owner,...value});}
  });
  this.#list=new AccountList(this.shadow,this.#el('.accounts-list'),async(action,id)=>{try{if(action==='api.add'||action==='api.edit'){this.#editApi(action==='api.edit'?id:undefined);return;}return await (action==='add'?this.#add():this.#action(action,id));}catch(error){this.#error(error);if(action==='verify'||action==='reconcile')throw error;}},ids=>this.#reorder(ids));
  const fence=(event:Event)=>{
   if(!this.#primaryStarting&&(session().adapter?.info??this.#knownInfo)?.primarySwitch?.state!=='pending')return;
   const target=event.target as Element;
   if(event.type==='click'&&!target?.closest?.('button[data-testid=send-button],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="发送消息"],button[aria-label="发送"]'))return;
   if(event instanceof KeyboardEvent&&(event.key!=='Enter'||event.shiftKey||event.isComposing||!target?.closest?.('[contenteditable=true],textarea')))return;
   if(event.type==='submit'&&!target?.querySelector?.('[contenteditable=true],textarea'))return;
   event.preventDefault();event.stopImmediatePropagation();this.notice('ACCOUNT_PRIMARY_PENDING: Complete or cancel the primary-account authorization before sending. No turn was sent.');
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
   this.#nextQueryAt=0;this.#queryFailures=0;this.#queryError=undefined;
   const state=session();state.generation=(state.generation??0)+1;delete state.pending;
   if(state.enabled)void this.#enable().catch(this.#error);
   this.render();
  },options);
  window.addEventListener('resize',()=>this.#position(),options);
  window.addEventListener('code-codex:account-session-ended',()=>{const state=session();state.generation=(state.generation??0)+1;delete state.pending;state.adapter?.endSession();state.selector?.dispose();delete state.selector;delete state.adapter;state.error=undefined;this.#queryError=undefined;this.render();},options);
  window.addEventListener('code-codex:account-session-error',event=>this.#error((event as CustomEvent).detail),options);
  this.#unsubscribe=subscribeLanguage(()=>this.render());
  this.#installStyles();
  if(typeof ResizeObserver==='function'){this.#panelResize=new ResizeObserver(()=>this.#position());this.#panelResize.observe(this.#el('.accounts-panel'));}
  this.#refreshTimer=setInterval(()=>{if(!this.#busy&&!this.#refreshing&&Date.now()>=this.#nextQueryAt&&(session().enabled||this.#knownInfo?.primarySwitch?.state==='pending'||this.#el('.accounts-panel').matches(':popover-open')))void this.#refresh().catch(this.#error);},5000);
  if(session().enabled)void this.#enable().catch(this.#error);
  this.render();

 }
 async #enable(known?:AccountsInfo):Promise<void>{
  const state=session(),epoch=this.#epoch,generation=state.generation??0;
  if(state.pending)return state.pending;
  const pending=(async()=>{
   const info=known??await requestAccounts<AccountsInfo>({action:'info'});this.#check(epoch,generation);
   const status=state.adapter?.status();
   if(state.adapter&&state.viewRevision===REVISION&&state.adapter.info.owner.id===info.owner.id&&status?.active&&status.supported){state.adapter.setEnabled(true);state.adapter.updateInfo(info);if(!state.selector)state.selector=new ComposerAccountSelector(state.adapter,message=>{state.error=message;emit();});return;}
   // Hot upgrades retain document ownership. Retire only an idle old adapter;
   // disposal refuses an active independent turn and never changes GUI login.
   if(state.adapter){if(state.adapter.info.owner.id!==info.owner.id||!status?.active||!status.supported)state.adapter.endSession();else await state.adapter.dispose();this.#check(epoch,generation);state.selector?.dispose();delete state.selector;delete state.adapter;}
   const adapter=new NativeAccountAdapter(accountRequestSnapshot(),info,message=>{state.error=message;emit();});
   try{await adapter.start();this.#check(epoch,generation);state.adapter=adapter;state.selector=new ComposerAccountSelector(adapter,message=>{state.error=message;emit();});state.viewRevision=REVISION;state.error=undefined;this.#queryError=undefined;}
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
   if(state.enabled){if(!state.adapter||!state.adapter.status().supported||!state.adapter.status().active)await this.#enable(info);else state.adapter.updateInfo(info);}
   this.#check(epoch,generation);if(this.#queryError&&state.error===this.#queryError)state.error=undefined;this.#queryError=undefined;this.#queryFailures=0;this.#nextQueryAt=0;
   runtimeEvent('accounts','account.query','confirmed',{operationId,stage:'info',durationMs:Math.round(performance.now()-started),taskSent:false});this.render();
  }catch(error){if(this.#current(epoch,generation)){this.#queryError=error instanceof Error?error.message:String(error);const retryMs=Math.min(60000,5000*2**Math.min(4,this.#queryFailures++));this.#nextQueryAt=Date.now()+retryMs;runtimeEvent('accounts','account.query','failed',{operationId,stage:'info',durationMs:Math.round(performance.now()-started),error:String(error),retryMs,taskSent:false});}throw error;}
  finally{if(refreshEpoch===this.#refreshEpoch)this.#refreshing=false;}
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
  try{const value=await requestAccounts<PrimarySwitch|null>({action:'primary.status',owner:info.owner.id});this.#check(epoch,generation);if(pollEpoch!==this.#primaryPollEpoch||(session().adapter?.info??this.#knownInfo)?.owner.id!==info.owner.id)return;if(value!==null&&(!value||!['pending','completed','cancelled','mismatch','failed','interrupted'].includes(value.state)))throw Error('ACCOUNT_PRIMARY_STATUS_PROTOCOL: The primary-account status response is invalid.');if(this.#primaryStarting&&(!value||value.state!=='pending'))return;this.#primaryStatus=value;this.#primaryOwner=info.owner.id;this.#primaryReadError='';}
  catch(error){if(this.#current(epoch,generation)&&pollEpoch===this.#primaryPollEpoch){if(!this.#primaryReadError)runtimeEvent('accounts','account.primary','status-unavailable',{stage:'primary-status-read',errorCode:String(error).match(/\b(?:ACCOUNT_[A-Z_]+|TIMEOUT)\b/)?.[0]??'ACCOUNT_PRIMARY_STATUS_UNAVAILABLE',taskSent:false,authorizationReplayed:false});this.#primaryReadError='ACCOUNT_PRIMARY_STATUS_UNAVAILABLE: Setup progress could not be refreshed. Reopen the panel after the connection recovers. No authorization was replayed.';}}
  finally{if(pollEpoch===this.#primaryPollEpoch){this.#primaryPolling=false;if(this.#current(epoch,generation))this.render();}}
 }
 #watchPrimary(watch:boolean):void{
  if(watch&&!this.#primaryTimer){this.#primaryTimer=setInterval(()=>void this.#readPrimary(),1000);void this.#readPrimary();}
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
  if(this.#busy)throw Error('ACCOUNT_QUERY_BUSY: Wait for the pending account action.');this.#busy=true;session().error=undefined;if(action!=='primary.start'){this.#primaryStatus=undefined;this.#primaryReadError='';}this.render();
  const epoch=this.#epoch,generation=session().generation??0,adapter=session().adapter,info=adapter?.info??this.#knownInfo;
  if(!info){this.#busy=false;throw Error('ACCOUNT_CONNECTION: Connected account information is unavailable.');}
  let primaryRequested=false;
  const check=()=>{this.#check(epoch,generation);if(session().adapter!==adapter)throw Error('ACCOUNT_QUERY_STALE: The queried account runtime was replaced.');};
  try{let feedback:AccountCheckResult|undefined;
   if(action==='primary.start'){
    if(!await this.#dialog.confirm(t('accounts.primaryTitle')+' · '+(info.connections.find(c=>c.id===id)?.email??''),'accounts.primaryConfirm'))return;
    check();this.#watchPrimary(false);this.#primaryPollEpoch++;this.#primaryPolling=false;this.#primaryStarting=true;this.#primaryStatus=undefined;this.#primaryReadError='';this.render();if(adapter?.status().busy)throw Error('ACCOUNT_TURN_ACTIVE: Finish all tasks before changing the primary account.');
     try{primaryRequested=true;await requestAccounts({action,owner:info.owner.id,connectionId:id});await this.#refresh(true);}
     catch(error){
      // Changing the official identity intentionally retires its old Bridge.
      // Verify the result through the current connection instead of replaying
      // login/start or calling a completed switch a transport failure.
      const observed=await requestAccounts<AccountsInfo>({action:'info'}).catch(()=>undefined),target=info.connections.find(c=>c.id===id)?.email;
      if(!observed||!target||observed.owner.id===info.owner.id||observed.owner.label.toLowerCase()!==target.toLowerCase())throw error;
      session().error=undefined;this.#knownInfo=observed;
      runtimeEvent('accounts','account.primary','reconciled',{stage:'identity-confirm',identityMatched:true,authorizationReplayed:false,taskSent:false});
     }
     return;
   }
   if(action==='reconcile'){if(adapter)feedback=await adapter.reconcile(id);else{await requestAccounts({action:'reconcile',owner:info.owner.id,connectionId:id});feedback='idle';}}
   else{const result=await requestAccounts<{signedIn?:boolean}>({action,owner:info.owner.id,connectionId:id});if(action==='verify')feedback=result.signedIn?'signedIn':'signedOut';}
   check();if(['verify','login','remove'].includes(action))adapter?.usage.invalidate(id);await this.#refresh(true);check();return feedback;
  }
  catch(error){if(String(error).includes('ACCOUNT_AUTH_REQUIRED'))await this.#refresh().catch(()=>{});throw error;}
  finally{if(action==='primary.start'&&primaryRequested)void this.#readPrimary();this.#primaryStarting=false;this.#busy=false;this.render();}
 }
 render():void{
  if(!this.#abort)return;
  const state=session(),adapter=state.adapter,info=adapter?.info??this.#knownInfo,ready=state.enabled&&!!adapter?.status().active&&!!adapter.status().supported;
  const text=(selector:string,value:string)=>{const node=this.#el(selector);if(node.textContent!==value)node.textContent=value;};
  const button=this.#el<HTMLButtonElement>('.accounts-enable'),caption=t(state.enabled?'accounts.disable':'accounts.enable');if(button.textContent!==caption)button.textContent=caption;const pressed=String(state.enabled);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);if(button.disabled!==(this.#busy||!!state.pending))button.disabled=this.#busy||!!state.pending;
  text('.accounts-status',state.enabled?(ready?t('accounts.enabled'):state.error?'ACCOUNT_STARTUP_UNAVAILABLE':t('accounts.connecting')):t('accounts.disabled'));
  text('[data-tool-plugin="code-codex.multi-account"] h4',t('plugin.name.multi-account'));
  const auto=adapter?.autoStatus(),toggle=this.#el<HTMLInputElement>('.accounts-auto-continue');
  if(toggle){toggle.checked=localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true';toggle.disabled=!state.enabled||!!state.pending||!adapter;}
  const follow=this.#el<HTMLInputElement>('.accounts-follow-logout');if(follow){follow.checked=info?.followLogout!==false;follow.disabled=this.#busy||!!state.pending||!info;}
  const primary=this.#primaryOwner===info?.owner.id&&this.#primaryStatus!==undefined?this.#primaryStatus:info?.primarySwitch,waiting=primary?.state==='pending';const cancel=this.#el<HTMLButtonElement>('.accounts-primary-cancel');cancel.hidden=!waiting;cancel.disabled=this.#busy;
  const primaryText=this.#primaryStarting&&primary?.state!=='pending'?t('accounts.primaryPreparing'):primaryStatusText(primary?.state==='pending'||this.#primaryOwner===info?.owner.id&&this.#primaryStatus!==undefined?primary:undefined);
  text('.accounts-message',[primaryText,this.#primaryReadError,state.error??adapter?.status().recoveryNotice??(state.pending?t('accounts.connecting'):auto?t(auto==='checking'?'accounts.autoChecking':auto==='preparing'?'accounts.autoPreparing':'accounts.autoContinuing'):'')].filter((value,index,all)=>value&&all.indexOf(value)===index).join('\n'));
  const open=this.#el('.accounts-panel').matches(':popover-open');
  this.#watchPrimary(open&&(this.#primaryStarting||waiting));
  if(open)this.#list?.render(info,this.#busy||!!state.pending||waiting,adapter?.usage);
  if(ready&&open&&info)adapter?.usage.refresh(['host',...info.connections.filter(c=>c.email).map(c=>c.id)]);if(open)this.#position();
 }
 open():void{
  const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open')){this.close();return;}
  for(const other of this.shadow.querySelectorAll<HTMLElement>('.particle-settings-panel'))if(other!==panel&&other.matches(':popover-open'))other.hidePopover();
  panel.showPopover();this.render();this.#position();
  this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','true');this.#el('.accounts-close').focus();
  void this.#refresh().catch(this.#error);
  if((session().adapter?.info??this.#knownInfo)?.primarySwitch?.state==='pending')void this.#readPrimary();
 }
 #position():void{
  const panel=this.#el('.accounts-panel');if(!panel.matches(':popover-open'))return;
  const anchor=this.#el('.accounts-settings-trigger').getBoundingClientRect(),box=panel.getBoundingClientRect();
  panel.style.left=Math.max(12,Math.min(innerWidth-box.width-12,anchor.right+12))+'px';
  const height=panel.getBoundingClientRect().height;
  panel.style.top=Math.max(12,Math.min(innerHeight-height-12,anchor.top))+'px';
 }
 close():void{if(this.#primaryStatus?.state!=='pending')this.#primaryStatus=undefined;this.#watchPrimary(false);this.#list?.close();const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open'))panel.hidePopover();this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','false');}
 containsEvent(event:Event):boolean{return event.composedPath().some(n=>n instanceof HTMLElement&&(n.hasAttribute('data-account-assets-dialog')||n.hasAttribute('data-account-api-editor')))|| event.composedPath().includes(this.#el('.accounts-panel'))||event.composedPath().includes(this.#el('.accounts-settings-trigger'))||!!this.#list?.containsEvent(event);}
 stop():void{this.#apiEditor?.dispose();this.#dialog.dispose();this.#epoch++;this.#refreshEpoch++;this.#refreshing=false;this.#refreshJob=undefined;this.close();clearInterval(this.#refreshTimer);this.#panelResize?.disconnect();this.#panelResize=undefined;this.#list?.dispose();this.#list=undefined;this.#abort?.abort();this.#abort=undefined;this.#unsubscribe?.();}
 #installStyles():void{
  if(this.shadow.querySelector('[data-account-styles]'))return;
  const style=element('style');style.dataset.accountStyles='';style.textContent=accountListCss+'.accounts-global-controls{margin-top:16px;padding-top:12px;border-top:1px solid var(--cle-rule)}.accounts-connections-group{margin-bottom:0}.accounts-auto-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.accounts-auto-row span{min-width:0}.accounts-auto-row input{appearance:none;position:relative;flex:none;margin:0;width:30px;height:17px;border:1px solid var(--cle-rule-strong);border-radius:999px;background:var(--cle-hover);cursor:pointer}.accounts-auto-row input::before{content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;background:var(--cle-muted);transition:transform 120ms ease}.accounts-auto-row input:checked{background:var(--cle-signal)}.accounts-auto-row input:checked::before{transform:translateX(13px);background:#fff}.accounts-auto-row input:focus-visible{outline:2px solid var(--cle-focus);outline-offset:2px}.accounts-auto-row input:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.accounts-auto-row input::before{transition:none}}';this.shadow.append(style);
 }
}
