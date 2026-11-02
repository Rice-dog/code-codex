import {AccountList,accountListCss,type AccountCheckResult} from './features/accounts/account-list';
import {t,subscribeLanguage} from './i18n';
import {requestAccounts,accountRequestSnapshot} from './host/bridge/accounts';
import {ComposerAccountSelector} from './features/accounts/composer-selector';
import {NativeAccountAdapter} from './features/accounts/native-adapter';
import {ACCOUNT_ENABLED_KEY,ACCOUNT_AUTO_CONTINUE_KEY,ACCOUNT_UI_CHANGED,type AccountsInfo} from './features/accounts/contracts';
import {runtimeEvent} from './runtime-events';

// Document ownership is independent of the market/file-tree panel's lifetime.
const key=Symbol.for('code-codex:multi-account-runtime:v1');
interface Session {selector?:ComposerAccountSelector;adapter?:NativeAccountAdapter;enabled:boolean;pending?:Promise<void>;error?:string|undefined;viewRevision?:string;generation?:number;}
const REVISION='account-native-routing-v19';
const session=():Session=>((window as unknown as Record<symbol,Session>)[key]??={enabled:localStorage.getItem(ACCOUNT_ENABLED_KEY)==='true'});
const emit=()=>window.dispatchEvent(new Event(ACCOUNT_UI_CHANGED));
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};

export class MultiAccountPlugin {
 #abort:AbortController|undefined;
 #unsubscribe?:()=>void;
 #busy=false;
 #list:AccountList|undefined;
 #refreshing=false;
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
  this.#el('.accounts-close').addEventListener('click',()=>{this.close();this.#el('.accounts-settings-trigger').focus();},options);
  this.#el('.accounts-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();this.close();this.#el('.accounts-settings-trigger').focus();}},options);
  this.#list=new AccountList(this.shadow,this.#el('.accounts-list'),async(action,id)=>{try{return await (action==='add'?this.#add():this.#action(action,id));}catch(error){this.#error(error);if(action==='verify'||action==='reconcile')throw error;}});
  window.addEventListener(ACCOUNT_UI_CHANGED,()=>this.render(),options);
  // A same-version document may reuse this panel/controller. Native publication
  // must wake it directly; background renderer intervals can be suspended.
  window.addEventListener('code-codex:accounts-connected',()=>{
   const documentVersion=(window as unknown as Record<symbol,{version?:string}>)[Symbol.for('code-codex:document-connection-owner:v2')]?.version;
   const hostVersion=this.shadow.host?.tagName?.match(/^CODE-CODEX-V(\d+)-(\d+)-(\d+)(?:-B[0-9A-F]+)?$/)?.slice(1).join('.');
   // During a cross-version upgrade the old panel can still be connected briefly.
   // Only a panel belonging to the published document may eagerly bind it.
   if(hostVersion&&documentVersion&&hostVersion!==documentVersion)return;
   this.#epoch++;this.#refreshEpoch++;this.#refreshing=false;
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
  this.#refreshTimer=setInterval(()=>{if(!this.#busy&&!this.#refreshing&&Date.now()>=this.#nextQueryAt&&(session().enabled||this.#el('.accounts-panel').matches(':popover-open')))void this.#refresh().catch(this.#error);},5000);
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
   if(state.enabled){if(state.adapter?.status().supported)await state.adapter.useOfficialIdentity();this.#check(epoch,generation);state.adapter?.setEnabled(false);state.selector?.dispose();delete state.selector;state.enabled=false;localStorage.setItem(ACCOUNT_ENABLED_KEY,'false');}
   else{state.enabled=true;localStorage.setItem(ACCOUNT_ENABLED_KEY,'true');await this.#enable();}
  }finally{this.#busy=false;this.render();}
 }
 async #refresh():Promise<void>{
  if(this.#refreshing)return;this.#refreshing=true;const epoch=this.#epoch,generation=session().generation??0,operationId=++this.#operation,started=performance.now(),refreshEpoch=++this.#refreshEpoch;
  try{const state=session(),info=await requestAccounts<AccountsInfo>({action:'info'});this.#check(epoch,generation);
   if(state.adapter&&state.adapter.info.owner.id!==info.owner.id){state.adapter.endSession();state.selector?.dispose();delete state.adapter;delete state.selector;}
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
  try{session().enabled=true;localStorage.setItem(ACCOUNT_ENABLED_KEY,'true');await this.#enable();this.#check(epoch,generation);const result=await requestAccounts<{id:string}>({action:'add',owner:session().adapter!.info.owner.id,label:t('accounts.add')});this.#check(epoch,generation);id=result.id;await this.#refresh();this.#check(epoch,generation);}
  finally{this.#busy=false;this.render();}
  await this.#action('login',id);
 }
 async #action(action:string,id:string):Promise<AccountCheckResult|void>{
  if(this.#busy)throw Error('ACCOUNT_QUERY_BUSY: Wait for the pending account action.');this.#busy=true;session().error=undefined;this.render();
  const epoch=this.#epoch,generation=session().generation??0,adapter=session().adapter;
  const check=()=>{this.#check(epoch,generation);if(session().adapter!==adapter)throw Error('ACCOUNT_QUERY_STALE: The queried account runtime was replaced.');};
  try{let feedback:AccountCheckResult|undefined;
   if(action==='reconcile')feedback=await session().adapter!.reconcile(id);
   else{const result=await requestAccounts<{signedIn?:boolean}>({action,owner:session().adapter!.info.owner.id,connectionId:id});if(action==='verify')feedback=result.signedIn?'signedIn':'signedOut';}
   check();if(['verify','login','remove'].includes(action))adapter?.usage.invalidate(id);await this.#refresh();check();return feedback;
  }
  finally{this.#busy=false;this.render();}
 }
 render():void{
  if(!this.#abort)return;
  const state=session(),adapter=state.adapter,info=adapter?.info,ready=state.enabled&&!!adapter?.status().active&&!!adapter.status().supported;
  const text=(selector:string,value:string)=>{const node=this.#el(selector);if(node.textContent!==value)node.textContent=value;};
  const button=this.#el<HTMLButtonElement>('.accounts-enable'),caption=t(state.enabled?'accounts.disable':'accounts.enable');if(button.textContent!==caption)button.textContent=caption;const pressed=String(state.enabled);if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);if(button.disabled!==(this.#busy||!!state.pending))button.disabled=this.#busy||!!state.pending;
  text('.accounts-status',state.enabled?(ready?t('accounts.enabled'):state.error?'ACCOUNT_STARTUP_UNAVAILABLE':t('accounts.connecting')):t('accounts.disabled'));
  text('[data-tool-plugin="code-codex.multi-account"] h4',t('plugin.name.multi-account'));
  const auto=adapter?.autoStatus(),toggle=this.#el<HTMLInputElement>('.accounts-auto-continue');
  if(toggle){toggle.checked=localStorage.getItem(ACCOUNT_AUTO_CONTINUE_KEY)==='true';toggle.disabled=!state.enabled||!!state.pending||!adapter;}
  text('.accounts-message',state.error??adapter?.status().recoveryNotice??(state.pending?t('accounts.connecting'):auto?t(auto==='checking'?'accounts.autoChecking':auto==='preparing'?'accounts.autoPreparing':'accounts.autoContinuing'):''));
  const open=this.#el('.accounts-panel').matches(':popover-open');
  if(open)this.#list?.render(info,this.#busy||!!state.pending,adapter?.usage);
  if(ready&&open&&info)adapter?.usage.refresh(['host',...info.connections.filter(c=>c.email).map(c=>c.id)]);
 }
 open():void{
  const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open')){this.close();return;}
  for(const other of this.shadow.querySelectorAll<HTMLElement>('.particle-settings-panel'))if(other!==panel&&other.matches(':popover-open'))other.hidePopover();
  panel.showPopover();this.render();this.#position();
  this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','true');this.#el('.accounts-close').focus();
  void this.#refresh().catch(this.#error);
 }
 #position():void{
  const panel=this.#el('.accounts-panel');if(!panel.matches(':popover-open'))return;
  const anchor=this.#el('.accounts-settings-trigger').getBoundingClientRect(),box=panel.getBoundingClientRect();
  panel.style.left=Math.max(12,Math.min(innerWidth-box.width-12,anchor.right+12))+'px';
  panel.style.top=Math.max(12,Math.min(innerHeight-box.height-12,anchor.top))+'px';
 }
 close():void{this.#list?.close();const panel=this.#el('.accounts-panel');if(panel.matches(':popover-open'))panel.hidePopover();this.#el('.accounts-settings-trigger').setAttribute('aria-expanded','false');}
 containsEvent(event:Event):boolean{return event.composedPath().some(n=>n instanceof HTMLElement&&n.hasAttribute('data-account-assets-dialog'))|| event.composedPath().includes(this.#el('.accounts-panel'))||event.composedPath().includes(this.#el('.accounts-settings-trigger'))||!!this.#list?.containsEvent(event);}
 stop():void{this.#epoch++;this.#refreshEpoch++;this.#refreshing=false;this.close();clearInterval(this.#refreshTimer);this.#panelResize?.disconnect();this.#panelResize=undefined;this.#list?.dispose();this.#list=undefined;this.#abort?.abort();this.#abort=undefined;this.#unsubscribe?.();}
 #installStyles():void{
  if(this.shadow.querySelector('[data-account-styles]'))return;
  const style=element('style');style.dataset.accountStyles='';style.textContent=accountListCss+'.accounts-auto-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.accounts-auto-row span{min-width:0}.accounts-auto-row input{appearance:none;position:relative;flex:none;margin:0;width:30px;height:17px;border:1px solid var(--cle-rule-strong);border-radius:999px;background:var(--cle-hover);cursor:pointer}.accounts-auto-row input::before{content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;background:var(--cle-muted);transition:transform 120ms ease}.accounts-auto-row input:checked{background:var(--cle-signal)}.accounts-auto-row input:checked::before{transform:translateX(13px);background:#fff}.accounts-auto-row input:focus-visible{outline:2px solid var(--cle-focus);outline-offset:2px}.accounts-auto-row input:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.accounts-auto-row input::before{transition:none}}';this.shadow.append(style);
 }
}
