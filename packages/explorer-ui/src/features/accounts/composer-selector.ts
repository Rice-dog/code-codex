import {ConnectionModelSelector} from './model-selector';
import {NativeComposerQuota} from './native-composer-quota';
import {planBadge,updatePlanBadge,planBadgeCss} from './plan-badge';
import {t,getLocale,subscribeLanguage} from '../../i18n';
import {ACCOUNT_UI_CHANGED} from './contracts';
import type {NativeAccountAdapter} from './native-adapter';
import {nativeMenuCheckSvg} from '../../components/menu-check';
import {quotaElement,updateQuota,accountQuotaCss} from './quota-view';
import {activePageElements} from '../../adapters/codex-26.715';
import {runtimeEvent} from '../../runtime-events';

const avatar=(email:string)=>{const node=document.createElement('span');node.className='account-avatar';node.setAttribute('aria-hidden','true');node.textContent=[...email.trim()][0]?.toUpperCase()??'•';return node;};
const SEND='button[data-testid=send-button],button[aria-label="Send message"],button[aria-label="Send"],button[aria-label="发送消息"],button[aria-label="发送"]';
const COMPOSER='[data-codex-composer-root]';
const EDITOR='[contenteditable=true],textarea';
const REASONING='button[data-composer-navigation-target="reasoning"]';
const ANCHOR=REASONING+'[data-codex-intelligence-trigger="true"],'+COMPOSER+' '+REASONING;
const EXCLUDED='[data-app-shell-active-page="false"],[hidden],[inert],[aria-hidden="true"]';
const OWN='[data-code-codex-account-selector],[data-code-codex-account-popup],[data-account-assets-dialog],[data-code-codex-account-feedback]';
const arrow='<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const phaseLabel=(phase?:string)=>t(phase==='check-quota'?'accounts.autoChecking':phase==='queued'?'accounts.switchQueued':phase==='validate-settings'||phase==='native-history'?'accounts.switchChecking':phase==='credentials'||phase==='authenticate'?'accounts.switchConnecting':phase==='tool-runtime'?'accounts.switchTools':phase==='apply-permissions'?'accounts.switchPermissions':phase==='commit-selection'||phase==='ready'?'accounts.switchFinishing':'accounts.switchConversation');
const CSS=`${accountQuotaCss}${planBadgeCss}[data-code-codex-account-send-locked]{opacity:.4;cursor:progress}[data-code-codex-account-selector]{display:inline-flex;align-items:center;min-width:0;-webkit-app-region:no-drag}[data-code-codex-account-selector] button[data-account-trigger]{display:inline-flex;align-items:center;justify-content:center;max-width:310px;gap:6px;padding:4px 8px;font-size:14px;line-height:18px}[data-code-codex-account-selector] .account-quota{font-size:9px;line-height:10px;min-width:0}[data-code-codex-account-selector] .account-chevron{display:inline-flex;align-items:center;justify-content:center;flex:0 0 12px;width:12px;height:18px;line-height:0}[data-code-codex-account-selector] .account-chevron svg{display:block;width:12px;height:12px}[data-code-codex-account-selector] .account-email{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-avatar{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;border-radius:50%;font:inherit;font-size:10px;font-weight:500;line-height:1;background:color-mix(in srgb,currentColor 12%,transparent);color:inherit}[data-code-codex-account-popup]{position:fixed;inset:auto;margin:0;padding:6px;min-width:min(300px,calc(100vw - 24px));max-width:min(334px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 24px));overflow:auto;border:1px solid var(--color-border,rgba(128,128,128,.18));border-radius:12px;background:var(--color-codex-application-menu,#f8f8f9);color:var(--app-color-foreground-application-menu,#1a1c1f);box-shadow:0 4px 12px rgba(0,0,0,.25);font:400 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-app-region:no-drag}[data-code-codex-account-popup] [data-account-id]{display:flex;align-items:center;gap:10px;width:100%;min-height:38px;padding:7px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}[data-code-codex-account-popup] [data-account-id]:hover,[data-code-codex-account-popup] [data-account-id]:focus-visible{outline:0;background:var(--color-background-primary-ghost-hover,rgba(128,128,128,.1))}[data-code-codex-account-popup] .account-email{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}[data-code-codex-account-popup] .account-avatar{width:22px;height:22px;font-size:11px}[data-code-codex-account-popup] [data-account-check]{margin-inline-start:auto;width:17px;height:17px;display:inline-flex;align-items:center;flex:none}[data-code-codex-account-popup] [data-account-id][aria-disabled=true]{cursor:default}[data-account-trigger]{color:var(--color-text-primary,#1a1c1f)!important;opacity:1!important;position:relative}[data-account-trigger] .account-quota{opacity:1}`;

const ROW_CSS=`[data-code-codex-account-popup]{width:min(334px,calc(100vw - 24px));box-sizing:border-box}[data-code-codex-account-popup] [data-account-id]{display:grid;grid-template-columns:22px minmax(0,1fr) 25px;gap:10px;min-height:68px;padding:4px 10px;box-sizing:border-box}[data-code-codex-account-popup] .account-details{display:grid;gap:0;min-width:0}[data-code-codex-account-popup] .account-details .account-quota{font-size:11px;line-height:14px}[data-code-codex-account-popup] .account-feedback{display:block;min-height:12px;font-size:11px;line-height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}[data-code-codex-account-popup] .account-feedback[data-first-switch]{white-space:normal;overflow-wrap:anywhere}[data-code-codex-account-popup] [data-account-check]{margin:0;justify-self:end;justify-content:center}[data-code-codex-account-popup] [data-account-id][data-account-preparing]{background:color-mix(in srgb,var(--color-text-accent,#1683cf) 9%,transparent)}[data-account-preparing] [data-account-check],[data-account-preparing] .account-feedback{color:var(--color-text-accent,#1683cf)}[data-account-error] .account-feedback{color:var(--color-text-danger,#d32f2f)}.account-switch-spinner{display:block;width:13px;height:13px;border:1.5px solid color-mix(in srgb,currentColor 20%,transparent);border-top-color:currentColor;border-radius:50%;box-sizing:border-box;animation:account-switch-spin .9s linear infinite}@keyframes account-switch-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.account-switch-spinner{animation:none}}`;

/** A document-owned native-style control; market disposal cannot remove it. */
export class ComposerAccountSelector {
 #host?:HTMLSpanElement;
 #button?:HTMLButtonElement;
 #popup?:HTMLElement;
 #style?:HTMLStyleElement;
 #timer?:ReturnType<typeof setTimeout>;
 #disposed=false;
 #observer:MutationObserver;
 #frame:number|undefined;
 #models:ConnectionModelSelector;
 #quota:NativeComposerQuota;
 #unsubscribe:()=>void;
 #abort=new AbortController();
 #sendLocks=new Map<HTMLButtonElement,{inert:boolean;aria:string|null}>();
 #rowFailure:{id:string;conversationId:string|null;code:string}|undefined;
 #anchor:HTMLButtonElement|undefined;
 #mount:Element|undefined;
 #container:Element|undefined;
 #scope:Element|undefined;
 #composerRoot:Element|undefined;
 #mountConversation:string|null|undefined;
 #discover=true;
 #sendDirty=true;
 #sendPreparing=false;
 #approvedSend=false;
 #sendEpoch=0;
 #feedback?:HTMLElement;
 #feedbackTimer?:ReturnType<typeof setTimeout>;
 #report(message:string):void{
  this.notice(message);
  const mount=this.#root()??this.#anchor?.closest('[data-app-shell-active-page="true"]');
  if(!mount)return;
  if(!this.#feedback){this.#feedback=document.createElement('div');this.#feedback.dataset.codeCodexAccountFeedback='';this.#feedback.setAttribute('role','alert');this.#feedback.style.cssText='padding:4px 8px;font-size:12px;color:var(--color-text-danger,#d32f2f);overflow-wrap:anywhere';}
  this.#feedback.textContent=message;mount.append(this.#feedback);clearTimeout(this.#feedbackTimer);
  this.#feedbackTimer=setTimeout(()=>this.#feedback?.remove(),8000);
 }
 #blockSend():boolean {const status=this.adapter.status();if(status.sendBlocked){this.#report(status.error??'ACCOUNT_EXECUTION_UNSUPPORTED: The requested execution account is not ready. No turn was sent.');return true;}return !!status.preparing;}
 #root():Element|undefined{
  const root=this.#anchor?.isConnected?this.#anchor.closest(COMPOSER):null;if(root&&!root.closest(EXCLUDED))return root;
  if(this.#composerRoot?.isConnected&&!this.#composerRoot.closest(EXCLUDED)&&this.#mountConversation===this.adapter.status().conversationId)return this.#composerRoot;
  const roots=activePageElements(document,COMPOSER).filter(e=>!e.closest(EXCLUDED));
  return roots.length===1?roots[0]:undefined;
 }
 #belongs(node:Element):boolean{
  const excluded=node.closest(EXCLUDED);
  if(excluded&&!(excluded===node&&node instanceof HTMLButtonElement&&this.#sendLocks.has(node)&&!node.parentElement?.closest(EXCLUDED)))return false;
  const root=this.#root();
  return root?root.contains(node)&&(!node.closest(COMPOSER)||node.closest(COMPOSER)===root):!!this.#anchor?.isConnected&&!this.#anchor.closest(COMPOSER+','+EXCLUDED)&&!node.closest(COMPOSER);
 }
 #editors():HTMLElement[]{
  const candidates=activePageElements<HTMLElement>(document,EDITOR).filter(e=>this.#belongs(e)&&!e.closest(OWN)&&e.checkVisibility({checkVisibilityCSS:true})&&!(e instanceof HTMLTextAreaElement&&e.readOnly));
  return candidates.filter(e=>!candidates.some(parent=>parent!==e&&parent.contains(e)));
 }
 constructor(private readonly adapter:NativeAccountAdapter,private readonly notice:(message:string)=>void){
  this.#models=new ConnectionModelSelector(adapter,notice);
  this.#quota=new NativeComposerQuota(adapter,this.requestUpdate);
  this.#unsubscribe=subscribeLanguage(this.requestUpdate);
  const options={capture:true,signal:this.#abort.signal};
  document.addEventListener('click',event=>{const button=(event.target as Element)?.closest?.<HTMLButtonElement>(SEND);if(button&&this.#belongs(button))this.#sendGate(event,button);},options);
  document.addEventListener('keydown',event=>{const field=(event.target as Element)?.closest?.(EDITOR);if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&field&&this.#belongs(field))this.#sendGate(event);},options);
  document.addEventListener('submit',event=>{const field=(event.target as Element)?.querySelector?.(EDITOR);if(field&&this.#belongs(field))this.#sendGate(event);},options);

  this.#observer=new MutationObserver(records=>{
   let discovery=false,send=false;
   for(const record of records){
    const target=record.target instanceof Element?record.target:record.target.parentElement;
    if(target?.closest(OWN))continue;
    if(record.type==='attributes'){
     if(target===this.#anchor||target===this.#scope||target===this.#container||target?.contains(this.#anchor??null)||target?.matches(ANCHOR)||['data-app-shell-active-page','data-codex-composer-root','data-codex-intelligence-trigger','data-composer-navigation-target'].includes(record.attributeName??''))discovery=true;
     if(target?.matches(SEND))send=true;
    }else for(const node of [...record.addedNodes,...record.removedNodes]){
     if(node===this.#host&&!node.isConnected){discovery=true;continue;}
     if(!(node instanceof Element)||node.matches(OWN))continue;
     if(this.#quota.observes(node))send=true;
     if(target===this.#container||node===this.#scope||node.contains(this.#scope??null))discovery=true;
     if(node===this.#anchor||node.contains(this.#anchor??null)||node.matches(REASONING+','+COMPOSER+', [data-app-shell-active-page]')||node.querySelector(REASONING+','+COMPOSER))discovery=true;
     if(node.matches(SEND)||node.querySelector(SEND))send=true;
    }
   }
   if(discovery)this.#discover=true;
   if(send)this.#sendDirty=true;
   if(discovery||send)this.requestUpdate();
  });
  this.#observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-app-shell-active-page','hidden','inert','aria-hidden','class','data-codex-intelligence-trigger','data-composer-navigation-target','data-codex-composer-root']});
  window.addEventListener(ACCOUNT_UI_CHANGED,this.requestUpdate);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){this.#discover=true;this.requestUpdate();}},{signal:this.#abort.signal});
  document.addEventListener('pointerdown',event=>{if(this.#popup?.matches(':popover-open')&&!event.composedPath().includes(this.#popup)&&!event.composedPath().includes(this.#host!)&&!event.composedPath().some(n=>n instanceof HTMLElement&&n.hasAttribute('data-account-assets-dialog')))this.close();},{capture:true,signal:this.#abort.signal});
  window.addEventListener('resize',()=>{this.close();this.#discover=true;this.requestUpdate();},{signal:this.#abort.signal});this.update();
 }
 #sendGate(event:Event,target?:HTMLButtonElement):void{
  if(this.#approvedSend)return;
  const reject=()=>{event.preventDefault();event.stopImmediatePropagation();};
  if(this.#sendPreparing||this.#blockSend()){reject();return;}
  if(!this.adapter.requiresSendPreparation?.())return;
  reject();const buttons=target?[target]:activePageElements<HTMLButtonElement>(document,SEND).filter(b=>this.#belongs(b)&&b.checkVisibility());
  const fields=this.#editors();
  const button=buttons.length===1?buttons[0]:undefined;
  if(!button||fields.length!==1){runtimeEvent('accounts','account.send','blocked',{stage:'composer-qualification',editors:fields.length,buttons:buttons.length,taskSent:false});this.#report('ACCOUNT_SEND_CONTROL_UNAVAILABLE: The native composer could not be verified. No message was sent.');return;}
  const field=fields[0]!,id=this.adapter.status().conversationId,epoch=++this.#sendEpoch;
  const fingerprint=(editor:HTMLElement)=>JSON.stringify([editor instanceof HTMLTextAreaElement?editor.value:editor.innerHTML,[...(editor.closest('form')??editor.parentElement)?.querySelectorAll('img,[data-attachment-id]')??[]].map(n=>[n.getAttribute('src'),n.getAttribute('data-attachment-id')])]);
  const before=fingerprint(field);this.#sendPreparing=true;
  void this.adapter.prepareSend().then(async()=>{
   if(this.#disposed)return;
   this.update();
   await this.#quota.ready(button.disabled);
   // Account/model changes can replace native nodes while retaining the draft.
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   if(this.#disposed||epoch!==this.#sendEpoch)return;
   this.update();
   const currentFields=this.#editors(),currentButtons=activePageElements<HTMLButtonElement>(document,SEND).filter(b=>this.#belongs(b)&&b.checkVisibility());
   const next=currentButtons.length===1?currentButtons[0]:undefined;
   if(currentFields.length!==1||!next||this.adapter.status().conversationId!==id||before!==fingerprint(currentFields[0]!))throw Error('ACCOUNT_DRAFT_CHANGED: The draft or conversation changed during account preparation. Review it and send again; no message was sent.');
   if(this.#blockSend())return;
   if(next.disabled||next.inert){runtimeEvent('accounts','account.send','blocked',{stage:'native-composer-disabled',disabled:next.disabled,inert:next.inert,taskSent:false});throw Error('ACCOUNT_NATIVE_SEND_DISABLED: Account preparation completed, but the native composer is still disabled. No message was sent.');}
   this.#feedback?.remove();this.#approvedSend=true;try{next.click();}finally{this.#approvedSend=false;}
  }).catch(error=>{if(!this.#disposed)this.#report(String(error));}).finally(()=>{this.#sendPreparing=false;if(!this.#disposed)this.requestUpdate();});
 }
 requestUpdate=():void=>{if(this.#disposed||this.#frame!==undefined||document.hidden)return;this.#frame=requestAnimationFrame(()=>{this.#frame=undefined;this.update();});};
 #choices():Array<{id:string;email:string;plan?:string|null;api?:{baseUrl:string;model:string}}>{const info=this.adapter.info;return[{id:'host',email:info.owner.label,plan:info.owner.plan??null},...info.connections.filter(c=>c.email||c.api).map(c=>({id:c.id,email:c.api?c.label:c.email!,plan:c.api?'API':c.plan,...(c.api?{api:c.api}:{})}))];}
 #menuTick=():void=>{if(this.#disposed||!this.#popup?.matches(':popover-open'))return;this.update();this.#timer=setTimeout(this.#menuTick,60000-Date.now()%60000+10);};
 update=():void=>{
  if(this.#disposed)return;
  const status=this.adapter.status();
  // Reads that can flush layout belong only to anchor discovery, not to quota,
  // turn notifications or a permanent UI polling loop.
  if(this.#discover||this.#mountConversation!==status.conversationId||!this.#anchor?.isConnected||!this.#anchor.matches(ANCHOR)||this.#anchor.closest(EXCLUDED)){
   this.#discover=false;
   const anchors=activePageElements<HTMLButtonElement>(document,ANCHOR).filter(e=>!e.closest('[inert],[aria-hidden="true"]')&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
   if(anchors.length===1){
    if(this.#anchor!==anchors[0]){this.#syncSendLocks(false);this.#feedback?.remove();}
    this.#anchor=anchors[0];this.#mount=this.#anchor!.parentElement?.tagName==='SPAN'?this.#anchor!.parentElement:this.#anchor;
    this.#container=this.#mount?.parentElement??undefined;this.#composerRoot=this.#anchor!.closest(COMPOSER)??undefined;
    this.#scope=this.#composerRoot??this.#anchor!.closest('[data-app-shell-active-page="true"]')??undefined;this.#mountConversation=status.conversationId;
   }else{
    // Native send transitions can replace the model control before publishing
    // its qualification markers. Retain only our already verified toolbar in
    // this same active composer/conversation; never guess a new mount target.
    this.#anchor=undefined;
    const retained=!anchors.length&&this.#scope?.isConnected&&!this.#scope.closest(EXCLUDED)&&this.#container?.isConnected&&this.#scope.contains(this.#container)&&!this.#container.closest(EXCLUDED)&&this.#mountConversation===status.conversationId;
    if(!retained){
     this.#mount=this.#container=this.#scope=this.#composerRoot=undefined;this.#mountConversation=undefined;
     this.#models.update(undefined);this.#quota.update(undefined);this.#syncSendLocks(false);this.close();this.#host?.remove();this.#feedback?.remove();return;
    }
   }
  }
  const anchor=this.#anchor;
  if(anchor)this.#models.update(anchor);
  this.#quota.update(anchor??(this.#container?.querySelector(REASONING) as HTMLButtonElement|null)??undefined);
  this.#syncSendLocks(!!status.preparing);
  if(!this.#host){
   const host=this.#host=document.createElement('span');host.dataset.codeCodexAccountSelector='';
   const button=this.#button=document.createElement('button');button.type='button';button.dataset.accountTrigger='';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
   button.addEventListener('click',()=>this.#popup?.matches(':popover-open')?this.close():this.open());
   button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();this.open();}});
   host.append(button);const style=this.#style=document.createElement('style');style.dataset.accountSelectorStyle='';style.textContent=CSS+ROW_CSS;document.head.append(style);
   const popup=this.#popup=document.createElement('div');popup.dataset.codeCodexAccountPopup='';popup.setAttribute('popover','manual');popup.setAttribute('role','menu');popup.setAttribute('aria-label',t('accounts.selector'));document.body.append(popup);
   popup.addEventListener('keydown',event=>{const options=[...popup.querySelectorAll<HTMLElement>('[data-account-id]')];let at=options.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();button.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();at=event.key==='Home'?0:event.key==='End'?options.length-1:(at+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options[at]?.focus();}});
  }
  const mount=this.#mount;
  if(mount?.isConnected&&mount.parentElement===this.#container){
   if(this.#host.nextElementSibling!==mount||this.#host.parentElement!==mount.parentElement){this.close();mount.before(this.#host);}
  }else if(this.#host.parentElement!==this.#container){this.close();this.#container?.append(this.#host);}
  const button=this.#button!,choices=this.#choices(),selected=choices.find(c=>c.id===status.selected);
  if(anchor){const classes=[...anchor.classList].filter(c=>!['text-tertiary','disabled:opacity-40','aria-disabled:opacity-40'].includes(c)).join(' ');if(button.className!==classes)button.className=classes;}
  if(button.disabled===status.supported)button.disabled=!status.supported;
  const label=t('accounts.selector');if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  const email=selected?(selected.api?selected.email+' API':selected.email):t('accounts.select'),busy=String(!!status.preparing);if(button.getAttribute('aria-busy')!==busy)button.setAttribute('aria-busy',busy);
  if(button.dataset.email!==email){button.dataset.email=email;const text=document.createElement('span');text.className='account-email';text.textContent=email;const chevron=document.createElement('span');chevron.className='account-chevron';chevron.innerHTML=arrow;button.replaceChildren(avatar(email),text,quotaElement(status.selected),chevron);}
  const quota=button.querySelector<HTMLElement>('.account-quota');if(quota){if(quota.dataset.accountQuota!==status.selected)quota.dataset.accountQuota=status.selected;if(selected?.api){delete quota.dataset.quotaSignature;if(quota.hasChildNodes())quota.replaceChildren();quota.hidden=true;}else{quota.hidden=false;updateQuota(quota,this.adapter.usage);}}
  if(status.supported&&selected&&!selected.api)this.adapter.usage?.refresh([status.selected]);
  if(this.#popup?.matches(':popover-open')){this.adapter.usage?.refresh(choices.map(c=>c.id));this.#renderMenu();}
 };
 #syncSendLocks(preparing:boolean):void {
  if(preparing){if(!this.#sendDirty)return;this.#sendDirty=false;for(const button of activePageElements<HTMLButtonElement>(document,SEND).filter(b=>this.#belongs(b)&&b.checkVisibility())){
   if(!this.#sendLocks.has(button))this.#sendLocks.set(button,{inert:button.inert,aria:button.getAttribute('aria-disabled')});
   if(!button.inert)button.inert=true;if(button.getAttribute('aria-disabled')!=='true')button.setAttribute('aria-disabled','true');if(!button.hasAttribute('data-code-codex-account-send-locked'))button.dataset.codeCodexAccountSendLocked='';
  }}else{for(const [button,previous] of this.#sendLocks){
   if(button.hasAttribute('data-code-codex-account-send-locked')){button.inert=previous.inert;if(previous.aria===null)button.removeAttribute('aria-disabled');else button.setAttribute('aria-disabled',previous.aria);delete button.dataset.codeCodexAccountSendLocked;}
  }this.#sendLocks.clear();this.#sendDirty=true;}
 }
 #renderMenu():void{
  const popup=this.#popup!,status=this.adapter.status(),choices=this.#choices();
  if(this.#rowFailure?.conversationId!==status.conversationId)this.#rowFailure=undefined;
  const target=status.preparing&&status.selectionTarget&&status.selectionTarget.conversationId===status.conversationId?status.selectionTarget.id:undefined;
  const signature=JSON.stringify([choices,status.selected,status.busy,target,status.preparation?.phase,this.#rowFailure,this.adapter.usage?.revision,getLocale(),Math.floor(Date.now()/60000)]);
  if(popup.dataset.signature===signature)return;popup.dataset.signature=signature;
  const existing=new Map([...popup.querySelectorAll<HTMLButtonElement>('[data-account-id]')].map(item=>[item.dataset.accountId!,item]));
  const set=(node:Element,name:string,value:string)=>{if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
  for(const [index,choice] of choices.entries()){
   let item=existing.get(choice.id);existing.delete(choice.id);
   if(!item){
   item=document.createElement('div') as unknown as HTMLButtonElement;item.tabIndex=0;item.setAttribute('role','menuitemradio');item.dataset.accountId=choice.id;
   const details=document.createElement('span');details.className='account-details';const email=document.createElement('span');email.className='account-email';email.textContent=choice.email;
   const check=document.createElement('span');check.dataset.accountCheck='';check.setAttribute('aria-hidden','true');
   const quota=quotaElement(choice.id,true);updateQuota(quota,this.adapter.usage);
   const feedback=document.createElement('span');feedback.className='account-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
   const identityLine=document.createElement('span');identityLine.className='account-identity-line';identityLine.append(email,planBadge(choice.plan));details.append(identityLine,quota,feedback);item.append(avatar(choice.email),details,check);
   item.addEventListener('keydown',event=>{if(event.target===item&&(event.key==='Enter'||event.key===' ')){event.preventDefault();item!.click();}});
   item.addEventListener('click',()=>{
     if(this.adapter.status().preparing)return;const conversationId=this.adapter.status().conversationId;this.#rowFailure=undefined;
    void this.adapter.select(choice.id).then(()=>this.update(),error=>{this.#rowFailure={id:choice.id,conversationId,code:String(error).match(/\bACCOUNT_[A-Z0-9_]+\b/)?.[0]??'ACCOUNT_SWITCH_FAILED'};this.notice(String(error));this.update();});this.update();
   });
   }
   const preparing=choice.id===target,failed=this.#rowFailure?.id===choice.id;
   set(item,'aria-checked',String(choice.id===status.selected));set(item,'aria-disabled',String(status.busy));set(item,'aria-busy',String(preparing));
   if(item.hasAttribute('data-account-preparing')!==preparing)item.toggleAttribute('data-account-preparing',preparing);
   if(item.hasAttribute('data-account-error')!==!!failed)item.toggleAttribute('data-account-error',!!failed);
   const email=item.querySelector<HTMLElement>('.account-email')!;if(email.textContent!==choice.email)email.textContent=choice.email;
   updatePlanBadge(item.querySelector<HTMLElement>('.account-plan-badge')!,choice.plan);
   const quota=item.querySelector<HTMLElement>('.account-quota')!;if(choice.api){delete quota.dataset.quotaSignature;if(quota.hasChildNodes())quota.replaceChildren();quota.hidden=true;}else{quota.hidden=false;updateQuota(quota,this.adapter.usage);}
   const check=item.querySelector<HTMLElement>('[data-account-check]')!,mode=preparing?'preparing':choice.id===status.selected?'selected':'idle';
   if(check.dataset.mode!==mode){check.dataset.mode=mode;check.innerHTML=preparing?'<span class="account-switch-spinner"></span>':nativeMenuCheckSvg;check.style.visibility=mode==='idle'?'hidden':'visible';}
   const feedback=item.querySelector<HTMLElement>('.account-feedback')!,first=preparing&&status.preparation?.phase==='native-first-transport',text=preparing?phaseLabel(status.preparation?.phase)+(first?' '+t('accounts.switchFirstPreparation'):''):failed?`Switch failed (${this.#rowFailure!.code})`:'';
   if(feedback.hasAttribute('data-first-switch')!==first)feedback.toggleAttribute('data-first-switch',first);
   if(feedback.textContent!==text)feedback.textContent=text;
   if(popup.children[index]!==item)popup.insertBefore(item,popup.children[index]??null);
  }
  for(const item of existing.values())item.remove();
 }
 open():void{
  if(!this.#button||this.#button.disabled)return;this.adapter.usage?.refresh(this.#choices().map(c=>c.id));this.#renderMenu();const popup=this.#popup!;popup.showPopover();this.#button.setAttribute('aria-expanded','true');this.#button.dataset.state='open';
  const a=this.#button.getBoundingClientRect(),b=popup.getBoundingClientRect();popup.style.left=Math.max(12,Math.min(innerWidth-b.width-12,a.left))+'px';popup.style.top=(a.top-b.height-6>=12?a.top-b.height-6:Math.min(innerHeight-b.height-12,a.bottom+6))+'px';
  (popup.querySelector<HTMLButtonElement>('[aria-checked="true"]')??popup.querySelector<HTMLElement>('[data-account-id]'))?.focus();
  clearTimeout(this.#timer);this.#timer=setTimeout(this.#menuTick,60000-Date.now()%60000+10);
 }
 close():void{clearTimeout(this.#timer);if(this.#popup?.matches(':popover-open'))this.#popup.hidePopover();if(this.#button?.getAttribute('aria-expanded')!=='false')this.#button?.setAttribute('aria-expanded','false');if(this.#button&&this.#button.dataset.state!=='closed')this.#button.dataset.state='closed';}
 dispose():void{this.#quota.dispose();this.#models.dispose();this.#syncSendLocks(false);this.#disposed=true;clearTimeout(this.#timer);clearTimeout(this.#feedbackTimer);if(this.#frame!==undefined)cancelAnimationFrame(this.#frame);this.#observer.disconnect();this.#unsubscribe();this.#abort.abort();window.removeEventListener(ACCOUNT_UI_CHANGED,this.requestUpdate);this.close();this.#host?.remove();this.#popup?.remove();this.#style?.remove();this.#feedback?.remove();}
}
