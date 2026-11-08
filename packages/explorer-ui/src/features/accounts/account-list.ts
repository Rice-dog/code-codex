import {HoldReorder} from '../../components/hold-reorder';
import {planBadge,planBadgeCss} from './plan-badge';
import {icons} from '../../icons';
import {t,getLocale} from '../../i18n';
import type {AccountUsageStore} from './quota';
import {quotaElement,updateQuota,accountQuotaCss} from './quota-view';
import type {AccountsInfo} from './contracts';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const plus='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
const more='<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".7"/><circle cx="8" cy="8" r=".7"/><circle cx="13" cy="8" r=".7"/></svg>';
const monitor='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="8" rx="1.5"/><path d="M8 10.5v3m-3 0h6"/></svg>';
const primaryAccount='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="5.5" cy="4.5" r="2.25"/><path d="M1.75 13v-1.25A3.75 3.75 0 0 1 5.5 8h1M8.5 10.5h5.75m-2.5-2.5 2.5 2.5-2.5 2.5"/></svg>';

export type AccountCheckResult='signedIn'|'signedOut'|'idle'|'cleared'|'running';

/** Connection presentation only. Authorization and task ownership stay outside this view. */
export class AccountList {
 #abort=new AbortController();
 #menu:HTMLDivElement;
 #anchor:HTMLButtonElement|undefined;
 #info:AccountsInfo|undefined;
 #busy=false;
 #signature='';
 #check:{id:string;action:string;key:string;pending:boolean}|undefined;
 #reset?:ReturnType<typeof setTimeout>;
 #epoch=0;
 #sort:HoldReorder;
 #announcement:HTMLSpanElement;
 constructor(private readonly root:ShadowRoot,private readonly list:HTMLElement,private readonly action:(action:string,id:string)=>void|Promise<AccountCheckResult|void>,reorder:(ids:string[])=>Promise<void>=async()=>{}){
  const menu=this.#menu=node('div');menu.className='accounts-actions-menu';menu.setAttribute('popover','manual');menu.setAttribute('role','menu');root.append(menu);
  this.#announcement=node('span');this.#announcement.className='accounts-reorder-announcement';this.#announcement.setAttribute('aria-live','polite');root.append(this.#announcement);list.setAttribute('role','list');
  this.#sort=new HoldReorder(list,()=>!this.#busy,reorder,saved=>{this.#announcement.textContent=saved?t('accounts.orderSaved'):'ACCOUNT_ORDER_SAVE_FAILED: The original order was restored.';});
  const options={signal:this.#abort.signal};
  list.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button[data-account-action]');if(!button||button.disabled)return;if(button.dataset.accountAction==='menu')this.#open(button);else if(button.dataset.accountAction==='add')this.#openAdd(button);else action(button.dataset.accountAction!,button.dataset.connection??'');},options);
  menu.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button[data-account-action]');if(!button||button.disabled)return;const name=button.dataset.accountAction!,id=button.dataset.connection!;if(name==='verify'||name==='reconcile')void this.#runCheck(name,id);else{this.close(true);void action(name,id);}},options);
  menu.addEventListener('keydown',event=>{
   const buttons=[...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],at=buttons.indexOf(root.activeElement as HTMLButtonElement);
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close(true);}
   else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  },options);
  document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(menu)&&!event.composedPath().includes(this.#anchor!))this.close();},{...options,capture:true});
  window.addEventListener('resize',()=>this.#positionMenu(),options);
 }
 render(info:AccountsInfo|undefined,busy:boolean,usage?:AccountUsageStore):void{
  this.#info=info;this.#busy=busy;
  const signature=JSON.stringify([info?.owner,info?.connections.slice().sort((a,b)=>a.id.localeCompare(b.id)),info?.activeConversations,info?.primarySwitch,getLocale()]);
  if(signature===this.#signature){this.#sort.sync(info?.connections.map(c=>c.id)??[]);for(const e of this.list.querySelectorAll<HTMLElement>('.account-quota'))updateQuota(e,usage);for(const b of this.list.querySelectorAll<HTMLButtonElement>('button'))b.disabled=busy||b.dataset.accountAction==='add'&&(info?.connections.length??0)>=16;this.#feedback();return;}this.#signature=signature;
  const reopen=this.#menu.matches(':popover-open')?this.#anchor?.dataset.connection:undefined,menuFocus=(this.root.activeElement as HTMLElement|null)?.dataset.accountAction;
  if(this.#menu.matches(':popover-open'))this.#menu.hidePopover();this.#anchor=undefined;this.#menu.replaceChildren();
  const focused=this.root.activeElement as HTMLElement|null,focusAction=focused?.dataset.accountAction,focusId=focused?.dataset.connection;
  this.#sort.cancel();this.list.replaceChildren();
  if(info)for(const connection of [{id:'host',email:info.owner.label,label:info.owner.label,plan:info.owner.plan??null},...info.connections]){
   const api='api' in connection?connection.api:undefined,host=connection.id==='host',required='reauthorizationRequired' in connection&&!!connection.reauthorizationRequired,signed=(!!connection.email||!!api)&&!required,row=node('article');row.className='accounts-connection';row.dataset.connection=connection.id;row.dataset.host=String(host);row.dataset.authRequired=String(required);row.setAttribute('role','listitem');if(!host){row.tabIndex=0;row.title=t('accounts.reorderHint');row.setAttribute('aria-label',(connection.email??connection.label)+' · '+t('accounts.reorderHint'));}row.dataset.signed=String(signed);row.dataset.primaryTarget=String(info.primarySwitch?.state==='pending'&&info.primarySwitch.targetEmail===connection.email);
   const avatar=node('span',[...(connection.email??connection.label)][0]?.toUpperCase()??'•');avatar.className='accounts-avatar';avatar.setAttribute('aria-hidden','true');
   const identity=node('strong',api?connection.label:connection.email??t('accounts.unsigned'));identity.className='accounts-identity';
   const dot=node('span');dot.className='accounts-login-dot';dot.setAttribute('role','img');dot.setAttribute('aria-label',t(signed?'accounts.signed':'accounts.unsigned'));
   const quota=quotaElement(connection.id,true);updateQuota(quota,usage);if(api){const models=api.models?.length?api.models:[api.model];const summary=models.join(' · ');quota.textContent=summary;quota.title=summary;quota.setAttribute('aria-label',summary);quota.className='account-api-model';}const details=node('span');details.className='accounts-details';const identityLine=node('span');identityLine.className='account-identity-line';identityLine.append(identity,planBadge(api?'API':connection.plan));details.append(identityLine,quota);if(required){const warning=node('span',t('accounts.signInRequired'));warning.className='accounts-auth-label';details.append(warning);}row.append(avatar,details,dot);
   if(host){const mark=node('span');mark.className='accounts-host-mark';mark.setAttribute('role','img');mark.setAttribute('aria-label',t('accounts.current'));mark.innerHTML=monitor;row.append(mark);}
   else{const button=node('button');button.type='button';button.className='accounts-icon-action';button.dataset.accountAction='menu';button.dataset.connection=connection.id;button.setAttribute('aria-label',t('accounts.options'));button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.disabled=busy;button.innerHTML=more;row.append(button);}
   this.list.append(row);
  }
  const add=node('button');add.type='button';add.className='accounts-add-tile';add.dataset.accountAction='add';add.setAttribute('aria-label',t('accounts.add'));add.disabled=busy||(info?.connections.length??0)>=16;add.innerHTML=plus;this.list.append(add);
  if(reopen){const anchor=[...this.list.querySelectorAll<HTMLButtonElement>('button[data-account-action=menu]')].find(b=>b.dataset.connection===reopen);if(anchor){this.#open(anchor,true);this.#menu.querySelector<HTMLButtonElement>(`[data-account-action="${menuFocus}"]`)?.focus();}else this.close();}
  if(focusAction&&focusAction!=='verify'&&focusAction!=='reconcile'){[...this.list.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.dataset.accountAction===focusAction&&b.dataset.connection===focusId)?.focus();}
 }
 #open(anchor:HTMLButtonElement,preserve=false):void{
  const menu=this.#menu;if(this.#anchor===anchor&&menu.matches(':popover-open')){this.close();return;}if(!preserve&&this.#anchor?.dataset.connection!==anchor.dataset.connection)this.close();else menu.replaceChildren();
  const connection=this.#info?.connections.find(c=>c.id===anchor.dataset.connection);if(!connection)return;
  const actions=connection.api?[['api.edit','accounts.apiEdit',icons.preview],['remove','accounts.remove',icons.trash]]:[...(connection.email?[['primary.start','accounts.makePrimary',primaryAccount]]:[]),['verify','accounts.refresh',icons.refresh],...(connection.reauthorizationRequired||!connection.email?[['login',connection.reauthorizationRequired?'accounts.reauthorize':'accounts.authorize',icons.link],['login.cancel','accounts.cancelLogin',icons.close]]:[]),['reconcile','accounts.reconcile',icons.preview],['remove','accounts.remove',icons.trash]];
  for(const [name,label,icon] of actions){const button=node('button');button.type='button';button.setAttribute('role','menuitem');button.dataset.accountAction=name!;button.dataset.label=label!;button.dataset.connection=connection.id;button.disabled=this.#busy||name!=='reconcile'&&!!this.#info?.activeConversations.length;const glyph=node('span');glyph.innerHTML=icon!;glyph.className='account-check-icon';const text=node('span',t(label!));text.className='account-action-label';button.append(glyph,text);menu.append(button);}
  this.#anchor=anchor;this.#feedback();anchor.setAttribute('aria-expanded','true');menu.showPopover();this.#positionMenu();menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 }
 #openAdd(anchor:HTMLButtonElement):void{
  if(this.#anchor===anchor&&this.#menu.matches(':popover-open')){this.close();return;}this.close();
  this.#anchor=anchor;const menu=this.#menu;
  for(const [name,key] of [['add','accounts.addOfficial'],['api.add','accounts.apiAdd']]){const button=node('button',t(key!));button.type='button';button.setAttribute('role','menuitem');button.dataset.accountAction=name;button.dataset.connection='';menu.append(button);}
  anchor.setAttribute('aria-expanded','true');menu.showPopover();this.#positionMenu();menu.querySelector<HTMLButtonElement>('button')?.focus();
 }
 #positionMenu():void{
  const menu=this.#menu,anchor=this.#anchor;if(!menu.matches(':popover-open'))return;if(!anchor?.isConnected){this.close();return;}
  const a=anchor.getBoundingClientRect(),b=menu.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(innerWidth-b.width-12,a.right-b.width))+'px';menu.style.top=(a.bottom+b.height+6<innerHeight-12?a.bottom+6:Math.max(12,a.top-b.height-6))+'px';
 }
 async #runCheck(action:string,id:string):Promise<void>{
  if(this.#busy||this.#check?.pending)return;
  clearTimeout(this.#reset);const epoch=++this.#epoch;
  this.#check={id,action,key:'accounts.checking',pending:true};this.#feedback();
  try{const result=await this.action(action,id);if(epoch!==this.#epoch)return;this.#check={id,action,key:'accounts.check.'+(result??'idle'),pending:false};}
  catch{if(epoch!==this.#epoch)return;this.#check={id,action,key:'accounts.check.failed',pending:false};}
  this.#feedback();this.#reset=setTimeout(()=>{if(epoch===this.#epoch){this.#check=undefined;this.#feedback();}},4000);
 }
 #feedback():void{
  const check=this.#check;
  for(const b of this.#menu.querySelectorAll<HTMLButtonElement>('button')){
   const active=!!check&&check.id===b.dataset.connection&&check.action===b.dataset.accountAction;
   b.disabled=this.#busy||!!check?.pending||b.dataset.accountAction!=='reconcile'&&!!this.#info?.activeConversations.length;
   b.dataset.checking=String(!!active&&!!check?.pending);b.setAttribute('aria-busy',String(!!active&&!!check?.pending));
   const label=b.querySelector<HTMLElement>('.account-action-label');
   if(label){label.setAttribute('aria-live','polite');label.textContent=active?(check!.key==='accounts.check.failed'?'Check failed. Try again.':t(check!.key)):t(b.dataset.label??(b.dataset.accountAction==='add'?'accounts.addOfficial':b.dataset.accountAction==='api.add'?'accounts.apiAdd':b.dataset.accountAction==='api.edit'?'accounts.apiEdit':b.dataset.accountAction==='primary.start'?'accounts.makePrimary':b.dataset.accountAction==='verify'?'accounts.refresh':b.dataset.accountAction==='reconcile'?'accounts.reconcile':b.dataset.accountAction==='remove'?'accounts.remove':b.dataset.accountAction==='login'?'accounts.authorize':'accounts.cancelLogin'));}
  }
 }
 close(restore=false):void{this.#epoch++;clearTimeout(this.#reset);this.#check=undefined;if(this.#menu.matches(':popover-open'))this.#menu.hidePopover();this.#anchor?.setAttribute('aria-expanded','false');if(restore&&this.#anchor?.isConnected)this.#anchor.focus();this.#anchor=undefined;this.#menu.replaceChildren();}
 containsEvent(event:Event):boolean{return event.composedPath().includes(this.#menu);}
 dispose():void{this.#sort.dispose();this.#announcement.remove();this.close();this.#abort.abort();this.#menu.remove();}
}

export const accountListCss=`
${accountQuotaCss}${planBadgeCss}
.accounts-panel{width:min(432px,calc(100vw - 24px))}
.accounts-panel .particle-settings-heading p{font-size:11px;line-height:1.5;font-weight:400;text-transform:none;margin:6px 0 0;color:var(--cle-muted)}
.accounts-list{display:grid;gap:8px}
.accounts-connection,.accounts-add-tile{box-sizing:border-box;min-height:60px;border:1px solid var(--cle-rule);border-radius:10px;background:var(--cle-paper);color:var(--cle-ink)}
.accounts-connection{display:grid;grid-template-columns:30px minmax(0,1fr) 8px 28px;align-items:center;gap:8px;padding:10px 12px}
.accounts-connection[data-auth-required=true]{border-color:var(--cle-deleted,#c43b32);box-shadow:inset 0 0 0 .5px var(--cle-deleted,#c43b32)}
.accounts-auth-label{font-size:11px;color:var(--cle-deleted,#c43b32)}
.accounts-connection[data-auth-required=true] .accounts-login-dot{background:var(--cle-deleted,#c43b32)}
.accounts-connection[data-host=false]:focus-visible{outline:2px solid var(--cle-signal);outline-offset:2px}
.accounts-connection[data-hold=true]{box-shadow:0 0 0 1px var(--cle-rule)}
.accounts-connection[data-dragging=true],.accounts-connection[data-settling=true]{opacity:0}
.accounts-connection[data-reorder-ghost]{box-shadow:0 12px 32px #0003,0 2px 8px #0002;cursor:grabbing;will-change:transform}
.accounts-list[data-reordering=true]{cursor:grabbing;user-select:none}
.accounts-reorder-announcement{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.account-api-model{font-size:11px;line-height:16px;color:var(--cle-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.accounts-details{display:grid;gap:3px;min-width:0;padding-inline-end:8px}
.accounts-identity{display:block;min-width:0;font-size:13px;line-height:20px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.accounts-connection[data-primary-target=true]{background:color-mix(in srgb,var(--cle-signal) 8%,var(--cle-paper))}.accounts-connection[data-primary-target=true] .accounts-login-dot{animation:account-check-spin 900ms linear infinite;border:1px solid transparent;border-top-color:currentColor;background:transparent}
.accounts-avatar{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--cle-subtle);color:var(--cle-muted);font-size:12px;line-height:1;font-weight:500}
.accounts-login-dot{width:6px;height:6px;border-radius:50%;background:var(--cle-muted)}
.accounts-connection[data-signed=true] .accounts-login-dot{background:var(--cle-icon-blue)}
.accounts-connection[data-host=true] .accounts-avatar{color:var(--cle-icon-blue);box-shadow:0 0 0 1px color-mix(in srgb,var(--cle-icon-blue) 40%,transparent)}
.accounts-icon-action,.accounts-host-mark{display:grid;place-items:center;box-sizing:border-box;width:28px;height:28px;padding:6px;border:0;border-radius:6px;background:transparent;color:var(--cle-muted)}
.accounts-host-mark{color:var(--cle-icon-blue)}
.accounts-icon-action{cursor:pointer}
.accounts-icon-action:hover{background:var(--cle-subtle);color:var(--cle-ink)}
.accounts-panel svg,.accounts-actions-menu svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.accounts-add-tile{display:grid;place-items:center;width:100%;border-style:dashed;background:transparent;color:var(--cle-muted);cursor:pointer}
.accounts-add-tile svg{width:22px;height:22px}
.accounts-add-tile:hover{background:var(--cle-subtle);color:var(--cle-icon-blue)}
.accounts-icon-action:focus-visible,.accounts-add-tile:focus-visible{outline:2px solid var(--cle-icon-blue);outline-offset:2px}
.accounts-add-tile:disabled,.accounts-icon-action:disabled{opacity:.45;cursor:default}
.accounts-message:empty{display:none}
.accounts-message{color:var(--cle-ink);overflow-wrap:anywhere;white-space:pre-line}
.accounts-actions-menu{position:fixed;inset:auto;margin:0;min-width:164px;max-width:calc(100vw - 24px);padding:5px;border:1px solid var(--cle-rule);border-radius:10px;background:var(--cle-paper);color:var(--cle-ink);box-shadow:0 4px 16px #0002}
.accounts-actions-menu button{display:flex;align-items:center;gap:10px;width:100%;padding:7px 9px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:start;font:inherit;font-size:12px;cursor:pointer}
.accounts-actions-menu button[data-account-action="primary.start"]{margin-bottom:5px;border-bottom:1px solid var(--cle-rule);border-radius:0;padding-bottom:10px}
.accounts-actions-menu button:hover,.accounts-actions-menu button:focus-visible{outline:0;background:var(--cle-subtle)}
.accounts-actions-menu button:disabled{opacity:.45;cursor:default}
.accounts-actions-menu button[data-checking=true]{opacity:1;color:var(--cle-ink)}
.accounts-actions-menu .account-check-icon{display:grid;place-items:center;flex:0 0 16px}
.accounts-actions-menu button[data-checking=true] .account-check-icon{animation:account-check-spin 900ms linear infinite}
@keyframes account-check-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.accounts-actions-menu button[data-checking=true] .account-check-icon{animation:none}}
`;

// API metadata deliberately does not render official quota/asset controls.
