import {getLocale,subscribeLanguage} from '../../i18n';
import type {AccountUsageStore} from './quota';
import {usableCredits,resetDefinitelyNotSent} from './assets-model';
const text=(zh:string,en:string)=>getLocale()==='zh-CN'?zh:en;
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,label?:string)=>{const e=document.createElement(tag);if(label!==undefined)e.textContent=label;return e;};
export const assetCss=`.account-asset-button{display:inline-grid!important;grid-template-columns:48px 7ch!important;column-gap:8px!important;align-items:center;justify-content:end!important;width:auto!important;min-height:0!important;margin:0!important;padding:0 4px!important;border:0!important;border-radius:4px!important;background:transparent;color:inherit;font:inherit!important;line-height:inherit!important;white-space:nowrap;cursor:pointer}.account-asset-label,.account-asset-number{text-align:right;justify-self:stretch;font-variant-numeric:tabular-nums;min-width:0;overflow:hidden;text-overflow:ellipsis}.account-asset-button[aria-pressed=true]{color:var(--cle-signal,var(--color-text-accent,#1683cf))!important;background:color-mix(in srgb,currentColor 12%,transparent)!important}.account-asset-button[aria-disabled=true]{opacity:.55;cursor:default}.account-asset-button:focus-visible{outline:1px solid currentColor!important}.account-asset-slot{display:contents}`;
const controls=new WeakMap<HTMLButtonElement,AccountUsageStore|undefined>();
export function assetControl(id:string,kind:'credit'|'reset',store:AccountUsageStore|undefined,existing?:HTMLButtonElement):HTMLButtonElement{
 if(existing&&controls.get(existing)!==store)existing=undefined;
 const e=existing??node('button');controls.set(e,store);e.type='button';e.className='account-asset-button';e.dataset.accountAsset=kind;e.dataset.assetOwner=id;
 const a=store?.assets?.(id),value=kind==='credit'?(a?.unlimited?'∞':a?.balance??'—'):String(a?.availableCount??'—');
 const active=kind==='credit'&&!!store?.creditAllowed?.(id),available=!!a&&(kind==='credit'?usableCredits(a):(a.availableCount??0)>0);
 e.setAttribute('aria-disabled',String(!available));if(kind==='credit')e.setAttribute('aria-pressed',String(active&&available));else{e.setAttribute('aria-haspopup','dialog');e.setAttribute('aria-expanded',String(currentAnchor===e));}
 const label=text(kind==='credit'?'积分':'重置卡',kind==='credit'?'Credits':'Resets');e.replaceChildren(node('span',label),node('span',value));e.children[0]!.className='account-asset-label';e.children[1]!.className='account-asset-number';
 e.setAttribute('aria-label',label+' '+value);
 e.title=kind==='credit'?text('允许插件管理的后续请求在额度耗尽后使用现有积分；不会开启自动充值。','Allow existing credits for subsequent plugin-managed requests after included usage ends; does not enable automatic purchases.'):text('查看重置卡及到期时间；确认后才使用。','View resets and expiration dates; redeem only after confirmation.');
 e.title+='\n'+label+': '+value;
 if(existing)return e;
 e.addEventListener('click',event=>{event.stopPropagation();event.preventDefault();if(kind==='reset'&&currentAnchor===e){closeCurrent?.();return;}const current=store?.assets(id);if(!current||!(kind==='credit'?usableCredits(current):(current.availableCount??0)>0)||!store?.assetActions)return;if(kind==='reset'){showCards(e,id,store);return;}if(e.dataset.pending==='true')return;e.dataset.pending='true';e.setAttribute('aria-busy','true');void store.assetActions.toggle(id).catch(error=>showError(e,String(error))).finally(()=>{delete e.dataset.pending;e.removeAttribute('aria-busy');});});
 e.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();});return e;
}
let closeCurrent:(()=>void)|undefined;
let currentAnchor:HTMLElement|undefined;
function dialog(anchor:HTMLElement,title:string){closeCurrent?.();const panel=node('div');panel.dataset.accountAssetsDialog='';panel.setAttribute('popover','manual');panel.setAttribute('role','dialog');panel.setAttribute('aria-label',title);const style=node('style');style.textContent=`[data-account-assets-dialog]{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:min(400px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:14px;border:1px solid var(--color-border,#8885);border-radius:12px;background:var(--color-codex-application-menu,#f8f8f9);color:var(--app-color-foreground-application-menu,#1a1c1f);box-shadow:0 6px 24px #0003;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}[data-account-assets-dialog] button{font:inherit;color:inherit;border:1px solid #8885;border-radius:6px;background:transparent;padding:4px 9px;cursor:pointer}[data-account-assets-dialog] header button{width:28px;height:28px;padding:0;border:0;border-radius:0;box-shadow:none;outline:0;background:transparent}[data-account-assets-dialog] header button:focus-visible{color:var(--color-text-accent,#1683cf);text-decoration:underline;text-underline-offset:3px}[data-account-assets-dialog] button:disabled{opacity:.5;cursor:default}[data-account-assets-dialog] header{display:flex;align-items:center;justify-content:space-between;gap:12px}[data-account-assets-dialog] article{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:14px;border-top:1px solid #8884;margin-top:10px;padding-top:10px}[data-account-assets-dialog] .account-reset-details{min-width:0}[data-account-assets-dialog] p{margin:4px 0;overflow-wrap:anywhere}[data-account-assets-dialog] small{display:block;opacity:.7}[data-account-assets-dialog] h4{margin:0}`;const head=node('header'),heading=node('strong',title),close=node('button','×');close.type='button';close.setAttribute('aria-label',text('关闭','Close'));head.append(heading,close);panel.append(style,head);document.body.append(panel);
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;abort.abort();unsub();observer.disconnect();sizeObserver.disconnect();if(panel.matches(':popover-open'))panel.hidePopover();panel.remove();if(anchor.isConnected&&anchor.checkVisibility())anchor.focus();if(anchor.dataset.accountAsset==='reset')anchor.setAttribute('aria-expanded','false');if(closeCurrent===dispose){closeCurrent=undefined;currentAnchor=undefined;}};const abort=new AbortController(),unsub=subscribeLanguage(()=>dispose()),observer=new MutationObserver(()=>{if(!anchor.isConnected)dispose();});observer.observe(anchor.closest('[data-account-id],.accounts-connection')?.parentNode??anchor.parentNode!,{childList:true,subtree:true});const parent=anchor.closest('[popover]');parent?.addEventListener('toggle',()=>{if(!parent.matches(':popover-open'))dispose();},{signal:abort.signal});const position=()=>{if(!panel.isConnected)return;const a=anchor.getBoundingClientRect(),edge=(anchor.querySelector<HTMLElement>('.account-asset-number')??anchor).getBoundingClientRect(),room=innerWidth-edge.right-18;panel.style.width=Math.min(400,room>=240?room:innerWidth-24)+'px';const b=panel.getBoundingClientRect(),left=room>=240?edge.right+6:edge.left-b.width-6;panel.style.left=Math.max(12,Math.min(innerWidth-b.width-12,left))+'px';panel.style.top=Math.max(12,Math.min(innerHeight-b.height-12,a.top))+'px';};const sizeObserver=new ResizeObserver(position);sizeObserver.observe(panel);closeCurrent=dispose;currentAnchor=anchor;if(anchor.dataset.accountAsset==='reset')anchor.setAttribute('aria-expanded','true');window.addEventListener('code-codex:account-session-ended',dispose,{signal:abort.signal});window.addEventListener('code-codex:accounts-connected',dispose,{signal:abort.signal});window.addEventListener('resize',dispose,{signal:abort.signal});close.addEventListener('click',dispose,{signal:abort.signal});panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dispose();}},{signal:abort.signal});document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(panel)&&!e.composedPath().includes(anchor))dispose();},{capture:true,signal:abort.signal});panel.showPopover();position();close.focus();return{panel,dispose,alive:()=>panel.isConnected};
}
function showError(anchor:HTMLElement,message:string){const d=dialog(anchor,text('操作未完成','Action incomplete'));d.panel.append(node('p',message));}
function showCards(anchor:HTMLElement,id:string,store:AccountUsageStore){
 const d=dialog(anchor,text('重置卡','Usage resets'));
 const body=node('div');
 d.panel.append(body);
 let busy=false;
 let armedButton:HTMLButtonElement|undefined;
 let confirmationKey:string|undefined;
 const render=()=>{
  body.replaceChildren();
  armedButton=undefined;
  confirmationKey=undefined;
  const assets=store.assets(id);
  const cards=(assets.cards??[]).filter(card=>card.status==='available');
  if(!cards.length){
   body.append(node('p',assets.cards===null?text('暂时无法读取卡详情。','Card details are unavailable.'):text('当前没有可用重置卡。','No resets are currently available.')));
   return;
  }
  for(const card of cards){
   const row=node('article');
   const details=node('div');
   details.className='account-reset-details';
   const title=card.title||text('额度重置卡','Usage reset');
   const expiry=card.expiresAt===null?text('无到期时间','No expiration'):new Intl.DateTimeFormat(getLocale(),{
    year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',
   }).format(new Date(card.expiresAt*1000));
   details.append(node('h4',title),node('small',text('到期：','Expires: ')+expiry));
   const description=card.description
    ?.replace(/(^|\n)\s*(?:thanks|thank you) for using codex[!.]?\s*/gi,'$1')
    .replace(/you['’]ve been granted one free rate[ -]limit reset[!.]?\s*/gi,'')
    .trim();
   if(description)details.append(node('p',description));
   const use=node('button',text('使用','Use reset'));
   use.type='button';
   use.disabled=card.resetType!=='codexRateLimits'||card.expiresAt!==null&&card.expiresAt*1000<=Date.now();
   use.addEventListener('click',()=>{
    if(busy)return;
    if(armedButton!==use){
     if(armedButton)armedButton.textContent=text('使用','Use reset');
     armedButton=use;
     confirmationKey=crypto.randomUUID();
     use.textContent=text('确认使用','Confirm use');
     return;
    }
    busy=true;
    for(const button of body.querySelectorAll('button'))button.disabled=true;
    use.textContent=text('正在确认…','Confirming…');
    void store.consumeCard(id,card.id,confirmationKey!).then(outcome=>{
     if(!d.alive())return;
     body.replaceChildren(node('p',outcome==='reset'||outcome==='alreadyRedeemed'
      ?text('重置成功，额度已安排重新读取。','Reset confirmed. Usage is being refreshed.')
      :outcome==='nothingToReset'
       ?text('当前额度不符合重置条件，未使用重置卡。','No current usage window is eligible; no reset was used.')
       :text('已没有可用重置卡。','No reset is available.')));
    },error=>{
   if(d.alive()){
    body.replaceChildren(node('p',String(error)));
    if(resetDefinitelyNotSent(error)){
     const refresh=node('button',text('刷新重置卡','Refresh resets'));refresh.type='button';
     refresh.addEventListener('click',()=>{refresh.disabled=true;refresh.textContent=text('正在读取…','Loading…');void store.loadCards(id).then(()=>{if(d.alive()){busy=false;render();}},e=>{if(d.alive()){refresh.disabled=false;body.prepend(node('p',String(e)));}});});
     body.append(refresh);
    }else body.append(node('small',text('结果未确认时请先核对官方状态，不要重复兑换。','If the result is uncertain, verify official status before another redemption.')));
   }
    });
   });
   row.append(details,use);
   body.append(row);
  }
 };
 if(store.assets(id).cards!==null){
  render();
  return;
 }
 body.append(node('p',text('正在读取…','Loading…')));
 void store.loadCards(id).then(()=>{
  if(d.alive())render();
 },error=>{
  if(d.alive())body.replaceChildren(node('p',String(error)));
 });
}
