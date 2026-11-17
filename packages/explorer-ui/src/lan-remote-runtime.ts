import {positionPluginPanel} from './core/layout/plugin-panel';
import {icons} from './icons';
import {t,translate,subscribeLanguage,getLocale} from './i18n';

interface State {role:string;phase:string;room?:string;pending:Array<{id:string;device:string}>;connected:boolean;error?:string;}
interface Ports {request:(params:Record<string,unknown>)=>Promise<unknown>;}
const idle=():State=>({role:'idle',phase:'idle',pending:[],connected:false});
export class LanRemotePlugin {
 #state=idle();#enabled=false;#open=false;#busy=false;#disposed=false;#unsubscribe:()=>void;
 readonly #panel:HTMLElement;readonly #trigger:HTMLButtonElement;
 constructor(private root:ShadowRoot,private ports:Ports,private notice:(message:string)=>void) {
  this.#panel=root.querySelector<HTMLElement>('.lan-panel')!;this.#trigger=root.querySelector<HTMLButtonElement>('.lan-settings')!;
  this.#panel.innerHTML=`<style>
   .lan-panel .particle-settings-scroll{padding:10px 13px 12px}
   .lan-panel .particle-settings-group + .particle-settings-group{padding-top:0;border-top:0}
   .lan-room-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
   .lan-room-row > *{min-height:32px;box-sizing:border-box}
   .lan-room-row input{min-width:0;width:100%;font:inherit;color:var(--cle-ink);background:var(--cle-input);border:1px solid var(--cle-rule-strong);border-radius:5px;padding:5px 8px}
   .lan-room-row > button{white-space:nowrap}
   .lan-field-help,.lan-message{margin:0;font-size:11px;line-height:1.4;color:var(--cle-muted);white-space:pre-wrap;overflow-wrap:anywhere}
   .lan-panel .lan-message[hidden]{display:none}
   .lan-peer{display:flex;align-items:center;gap:8px;padding:4px 0}
   .lan-peer span{flex:1;min-width:0;overflow-wrap:anywhere}
   .lan-actions{display:flex;gap:8px;flex-wrap:wrap}
   .lan-pending:empty,.lan-actions:not(:has(> button:not([hidden]))),.lan-actions > [hidden]{display:none}
  </style>
  <header class="particle-settings-header"><div class="particle-settings-heading"><div class="accounts-plugin-title"><h3 id="cle-lan-title"></h3><span class="plugin-beta" data-i18n-key="plugin.beta"></span></div><p class="lan-help"></p></div><div class="particle-settings-header-actions"><button type="button" class="particle-settings-close" data-lan-action="close" aria-label="Close settings">${icons.close}</button></div></header>
  <div class="particle-settings-scroll">
   <fieldset class="particle-settings-group"><legend class="lan-room-label"></legend><div class="lan-room-row"><input class="lan-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" aria-describedby="cle-lan-room-help"><button type="button" class="preview-extension-action" data-lan-action="open"></button></div><p class="lan-field-help" id="cle-lan-room-help"></p></fieldset>
   <fieldset class="particle-settings-group"><legend class="lan-address-label"></legend><div class="lan-room-row lan-address-row"><input class="lan-address" inputmode="decimal" autocomplete="off" spellcheck="false" aria-describedby="cle-lan-address-help"><button type="button" class="preview-extension-action" data-lan-action="join-address"></button></div><p class="lan-field-help" id="cle-lan-address-help"></p></fieldset>
   <p class="lan-message" role="status" aria-live="polite"></p><div class="lan-pending"></div>
   <div class="lan-actions"><button type="button" class="preview-extension-action" data-lan-action="files"></button><button type="button" class="preview-extension-action" data-lan-action="disconnect"></button><button type="button" class="preview-extension-action" data-lan-action="stop"></button></div>
  </div>`;
  this.#panel.addEventListener('keydown',this.#key);window.addEventListener('pointerdown',this.#outside);window.addEventListener('resize',this.#position);this.root.addEventListener('scroll',this.#position,true);
  this.#unsubscribe=subscribeLanguage(()=>this.render());this.render();
 }
 accept(value:unknown):void {
  if(!value||typeof value!=='object')return;const next=value as Partial<State>;
  if(typeof next.role!=='string'||typeof next.phase!=='string'||typeof next.connected!=='boolean'||!Array.isArray(next.pending))return;
  if(!next.pending.every(peer=>peer&&typeof peer.id==='string'&&typeof peer.device==='string'))return;
  this.#state=next as State;this.render();
 }
 resetConnection():void {this.#state=idle();this.#enabled=false;this.close();this.render();}
 async #request(params:Record<string,unknown>):Promise<void> {
  this.#busy=true;this.render();try{const state=await this.ports.request(params);if(!this.#disposed)this.accept(state);}
  finally{this.#busy=false;if(!this.#disposed)this.render();}
 }
 async action(button:HTMLButtonElement):Promise<void> {
  try {
   if(button.matches('.lan-enable')) {
    if(this.#enabled){await this.#request({action:'stop'});this.#enabled=false;this.close();}
    else this.#enabled=true;
    this.render();return;
   }
   if(button.matches('.lan-settings')) {if(this.#open)this.close();else this.open();return;}
   const action=button.dataset.lanAction;
   if(action==='close'){this.close(true);return;}
   if(!this.#enabled)return;
   if(action==='open'||action==='join-address') {
    const code=this.root.querySelector<HTMLInputElement>('.lan-code')!.value.trim();
    if(!/^[0-9]{6}$/.test(code))throw Error('REMOTE_ROOM_INVALID: Enter six digits.');
    const params={action:'open',code,locale:getLocale()};
    if(action==='join-address') {
     const address=this.root.querySelector<HTMLInputElement>('.lan-address')!.value.trim();
     if(!address)throw Error('REMOTE_ADDRESS_INVALID: Enter the host IPv4 address.');
     await this.#request({...params,address});
    } else await this.#request(params);
   }
   else if(action==='approve'||action==='reject') await this.#request({action,peer:button.dataset.peer});
   else if(action==='files'||action==='disconnect'||action==='stop')await this.#request({action});
  } catch(error){this.notice(String(error));}
 }
 open():void {
  if(this.#disposed)return;this.#open=true;this.#panel.hidden=false;
  if(!this.#panel.matches(':popover-open'))this.#panel.showPopover();
  this.#position();
  this.#trigger.setAttribute('aria-expanded','true');this.root.querySelector<HTMLInputElement>('.lan-code')?.focus();
 }
 close(restoreFocus=false):void {this.#open=false;if(this.#panel.matches(':popover-open'))this.#panel.hidePopover();this.#trigger.setAttribute('aria-expanded','false');if(restoreFocus)this.#trigger.focus();}
 #key=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.stopPropagation();this.close();this.#trigger.focus();}
  else if(event.key==='Enter'){
   const target=event.target as Element;
   const action=target.matches('.lan-address')?'join-address':target.matches('.lan-code')?'open':null;
   if(action){event.preventDefault();this.root.querySelector<HTMLButtonElement>(`[data-lan-action="${action}"]`)?.click();}
  }
 };
 #position=()=>positionPluginPanel(this.#panel,this.#trigger,390);
 #outside=(event:PointerEvent)=>{if(this.#open&&!event.composedPath().includes(this.#panel)&&!event.composedPath().includes(this.#trigger))this.close();};
 render():void {
  const q=<T extends Element=HTMLElement>(selector:string)=>this.root.querySelector<T>(selector)!;
  q('#cle-lan-title').textContent=t('plugin.name.lan-remote');q('.lan-help').textContent=t('lan.help');q('.lan-room-label').textContent=t('lan.room');
  q('.lan-panel .plugin-beta').textContent=t('plugin.beta');
  q('.lan-address-label').textContent=t('lan.addressLabel');
  q('#cle-lan-room-help').textContent=t('lan.roomHelp');q('#cle-lan-address-help').textContent=t('lan.addressHelp');
  const roomDisabled=this.#busy||!this.#enabled||this.#state.phase!=='idle'&&this.#state.phase!=='error';
  q<HTMLInputElement>('.lan-code').disabled=roomDisabled;
  q('.lan-code').setAttribute('aria-label',t('lan.room'));
  q<HTMLInputElement>('.lan-code').placeholder=t('lan.roomPlaceholder');
  const address=q<HTMLInputElement>('.lan-address');address.disabled=roomDisabled;address.placeholder=t('lan.address');address.setAttribute('aria-label',t('lan.addressLabel'));
  const enable=q<HTMLButtonElement>('.lan-enable');enable.textContent=translate(this.#enabled?'Disable':'Enable');enable.setAttribute('aria-pressed',String(this.#enabled));enable.disabled=this.#busy;
  q('.lan-status').textContent=translate(this.#enabled?'Enabled':'Disabled');
  const labels:Record<string,string>={open:'lan.connect','join-address':'lan.joinAddress',stop:'lan.leave',files:'lan.files',disconnect:'lan.disconnect'};
  for(const [action,key]of Object.entries(labels)){const button=q<HTMLButtonElement>(`[data-lan-action="${action}"]`);button.textContent=t(key);button.disabled=action==='open'||action==='join-address'?roomDisabled:this.#busy||!this.#enabled;}
  q<HTMLButtonElement>('[data-lan-action="files"]').hidden=!(this.#state.role==='guest'&&this.#state.connected);
  q<HTMLButtonElement>('[data-lan-action="disconnect"]').hidden=!this.#state.connected;
  q<HTMLButtonElement>('[data-lan-action="stop"]').hidden=this.#state.phase==='idle';
  this.#panel.querySelector('.particle-settings-close')!.setAttribute('aria-label',translate('Close settings'));this.#trigger.setAttribute('aria-label',t('lan.settings'));
  const message=q('.lan-message');message.hidden=this.#state.phase==='idle'&&!this.#state.error;
  message.textContent=message.hidden?'':this.#state.error||t(`lan.phase.${this.#state.phase}`,{room:this.#state.room??''});
  const pending=q('.lan-pending');pending.replaceChildren();
  for(const peer of this.#state.pending){const row=document.createElement('div');row.className='lan-peer';const name=document.createElement('span');name.textContent=peer.device;row.append(name);
   for(const action of ['approve','reject']){const button=document.createElement('button');button.type='button';button.className='preview-extension-action';button.dataset.lanAction=action;button.dataset.peer=peer.id;button.textContent=t(`lan.${action}`);button.disabled=this.#busy;row.append(button);}pending.append(row);}
  this.#position();
 }
 dispose():void {this.#disposed=true;this.close();this.#unsubscribe();this.#panel.removeEventListener('keydown',this.#key);window.removeEventListener('pointerdown',this.#outside);window.removeEventListener('resize',this.#position);this.root.removeEventListener('scroll',this.#position,true);void this.ports.request({action:'stop'}).catch(()=>{});}
}
