import {icons} from '../../icons';
import type {BackgroundCommands} from '../../contracts/appearance';
import type {DarkBackgroundPluginId} from '../../contracts/explorer-model';
import {getLocale,subscribeLanguage} from '../../i18n';
import {recordCaughtRuntimeError} from '../../runtime-operations';
const text=(en:string,zh:string)=>getLocale()==='zh-CN'?zh:en;
export interface ParameterPanelConfig {id:DarkBackgroundPluginId;slug:string;prefix:string;nameEn:string;nameZh:string;groups:ReadonlyArray<readonly [string,string,readonly string[]]>;defaults:Record<string,number|string|boolean>;labels:Record<string,readonly [string,string,string?]>;ranges:Record<string,readonly [number,number,number]>;}
export interface ParameterSettingsPorts {
 readonly shadow:ShadowRoot;
 readonly runtime:{readonly enabled:boolean;readonly pending:boolean;readonly error:string|undefined;readonly settings:Record<string,number|string|boolean>;updateSettings(value:Record<string,number|string|boolean>):void;subscribe(listener:()=>void):()=>void;};
 readonly actions:BackgroundCommands;
 readonly enabled:()=>boolean;
 readonly closeOthers:()=>void;
 readonly notice:(message:string)=>void;
}
/** Owns only this panel and its inputs; opening never touches the renderer. */
export class ParameterSettingsController {
 #scope:AbortController|undefined;
 #unsubscribe:(()=>void)|undefined;
 #language:(()=>void)|undefined;
 readonly #panel:HTMLElement;
 readonly #trigger:HTMLButtonElement;
 readonly #button:HTMLButtonElement;
 constructor(private readonly ports:ParameterSettingsPorts,private readonly config:ParameterPanelConfig){
  this.#panel=ports.shadow.querySelector<HTMLElement>(`.${config.slug}-panel`)!;
  this.#trigger=ports.shadow.querySelector<HTMLButtonElement>(`.${config.slug}-settings`)!;
  this.#button=ports.shadow.querySelector<HTMLButtonElement>(`.${config.slug}-enable`)!;
 }
 start():void{
  this.stop();const scope=this.#scope=new AbortController(),options={signal:scope.signal};
  this.#unsubscribe=this.ports.runtime.subscribe(()=>this.render());
  this.#language=subscribeLanguage(()=>this.render());
  this.#button.addEventListener('click',()=>void this.ports.actions.toggle(this.config.id).catch(error=>{recordCaughtRuntimeError(this.config.nameEn+' toggle',error);this.ports.notice(String(error));}),options);
  this.#trigger.addEventListener('click',()=>this.open?this.close(true):this.show(),options);
  this.#panel.querySelector(`.${this.config.slug}-close`)!.addEventListener('click',()=>this.close(true),options);
  this.#panel.addEventListener('input',event=>{
   const input=event.target as HTMLInputElement,key=input.dataset[this.config.prefix+'Control'];
   if(!key)return;const value=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;
   this.ports.runtime.updateSettings({...this.ports.runtime.settings,[key]:value});
  },options);
  this.#panel.addEventListener('click',event=>{
   const target=(event.target as Element).closest<HTMLButtonElement>(`[data-${this.config.prefix}-reset]`);if(!target)return;
   const group=this.config.groups[Number(target.dataset[this.config.prefix+'Reset'])];if(!group)return;
   const next={...this.ports.runtime.settings};for(const key of group[2])Object.assign(next,{[key]:this.config.defaults[key]});this.ports.runtime.updateSettings(next);
  },options);
  window.addEventListener('pointerdown',event=>{if(this.open&&!event.composedPath().includes(this.#panel)&&!event.composedPath().includes(this.#trigger))this.close(false);},{...options,capture:true});
  window.addEventListener('keydown',event=>{if(this.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close(true);}},{...options,capture:true});
  window.addEventListener('resize',()=>this.position(),options);
  this.ports.shadow.addEventListener('scroll',()=>this.position(),{...options,capture:true});
  this.render();
 }
 containsEvent(event:Event):boolean{return event.composedPath().includes(this.#panel)||event.composedPath().includes(this.#trigger);}
 get open():boolean{return this.#panel.matches(':popover-open');}
 show():void{this.ports.closeOthers();this.#panel.showPopover();this.#trigger.setAttribute('aria-expanded','true');this.position();this.#panel.querySelector<HTMLButtonElement>(`.${this.config.slug}-close`)?.focus();}
 close(focus=false):void{if(this.open)this.#panel.hidePopover();this.#trigger.setAttribute('aria-expanded','false');if(focus)this.#trigger.focus();}
 position():void{if(!this.open)return;const card=this.#trigger.closest('article')!.getBoundingClientRect(),edge=12,gap=8,width=Math.min(344,innerWidth-edge*2);this.#panel.style.width=`${width}px`;this.#panel.style.maxHeight=`${innerHeight-edge*2}px`;const left=card.right+gap+width<=innerWidth-edge?card.right+gap:Math.max(edge,innerWidth-edge-width);this.#panel.dataset.side=left===card.right+gap?'right':'overlay';this.#panel.style.left=`${Math.round(left)}px`;this.#panel.style.top=`${Math.round(Math.max(edge,Math.min(card.top,innerHeight-edge-Math.min(this.#panel.scrollHeight,innerHeight-edge*2))))}px`;}
 render():void{
  const {runtime}=this.ports,enabled=this.ports.enabled();
  this.#button.closest('article')!.setAttribute('aria-busy',String(runtime.pending));
  this.#panel.setAttribute('aria-busy',String(runtime.pending));
  for(const reset of this.#panel.querySelectorAll<HTMLButtonElement>(`[data-${this.config.prefix}-reset]`))reset.disabled=runtime.pending;
  this.#button.textContent=runtime.pending?text('Applying…','正在应用…'):enabled?text('Disable','停用'):text('Enable','启用');
  this.#button.dataset.enabled=String(enabled);this.#button.setAttribute('aria-pressed',String(enabled));
  // Cold download owns its disabled flag; only manage runtime state after release.
  if(!this.#button.dataset.packageLoadingOwner)this.#button.disabled=this.ports.actions.busy;
  const status=this.ports.shadow.querySelector<HTMLElement>(`.${this.config.slug}-status`)!;status.textContent=enabled?runtime.enabled?text('Enabled','已启用'):text('Enabled · Not applied','已启用 · 未应用'):text('Disabled','未启用');status.dataset.enabled=String(enabled&&runtime.enabled);status.dataset.pending=String(runtime.pending);
  this.#panel.lang=getLocale();this.#panel.dataset.language=getLocale()==='zh-CN'?'zh':'en';
  this.#panel.querySelector(`[data-${this.config.prefix}-category]`)!.textContent=text('Appearance','外观');
  this.#panel.querySelector(`.${this.config.slug}-close`)!.setAttribute('aria-label',text('Close settings','关闭设置'));
  this.#trigger.setAttribute('aria-label',text('Configure '+this.config.nameEn,'设置 '+this.config.nameZh));
  this.config.groups.forEach(([en,zh],index)=>{this.#panel.querySelector(`[data-${this.config.prefix}-group="${index}"]`)!.textContent=text(en,zh);this.#panel.querySelector(`[data-${this.config.prefix}-reset="${index}"]`)!.textContent=text('Reset','重置');});
  for(const input of this.#panel.querySelectorAll<HTMLInputElement>(`[data-${this.config.prefix}-control]`)){const key=input.dataset[this.config.prefix+'Control']!,value=runtime.settings[key as keyof typeof runtime.settings],label=this.config.labels[key]!;
   this.#panel.querySelector(`[data-${this.config.prefix}-label="${key}"]`)!.textContent=text(label[0],label[1]);
   if(input.type==='checkbox')input.checked=value===true;else input.value=String(value);
   input.disabled=runtime.pending;
   this.#panel.querySelector(`[data-${this.config.prefix}-output="${key}"]`)!.textContent=input.type==='range'?`${Number(Number(value).toFixed(2))}${label[2]??''}`:'';
  }
  const error=this.#panel.querySelector<HTMLElement>(`.${this.config.slug}-error`)!;error.hidden=!runtime.error;error.textContent=runtime.error??'';
 }
 stop():void{this.close();this.#scope?.abort();this.#scope=undefined;this.#unsubscribe?.();this.#language?.();}
}

export function parameterCardMarkup(c:ParameterPanelConfig):string{return `<article class="preview-extension appearance-extension" data-appearance-plugin="${c.id}"><span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4 data-plugin-name>${c.nameEn}</h4><span class="preview-extension-status ${c.slug}-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action ${c.slug}-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger ${c.slug}-settings" aria-label="Configure ${c.nameEn}" aria-haspopup="dialog" aria-controls="cle-${c.slug}-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;}
export function parameterPanelMarkup(c:ParameterPanelConfig):string{return `<section id="cle-${c.slug}-settings" class="particle-settings-panel ${c.slug}-panel" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-${c.slug}-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p data-${c.prefix}-category>Appearance</p><h3 id="cle-${c.slug}-title" data-plugin-name>${c.nameEn}</h3></div><div class="particle-settings-header-actions"><button type="button" class="particle-settings-close ${c.slug}-close" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><p class="particle-settings-error ${c.slug}-error" role="status" hidden></p>${c.groups.map(([en,,keys],index)=>`<fieldset class="particle-settings-group"><legend style="width:100%"><span data-${c.prefix}-group="${index}">${en}</span><button type="button" class="particle-library-clear" data-${c.prefix}-reset="${index}" style="float:right;margin:0">Reset</button></legend>${keys.map(key=>{const range=c.ranges[key];const boolean=typeof c.defaults[key]==='boolean';return `<div class="particle-control-row"><label for="cle-${c.prefix}-${key}" data-${c.prefix}-label="${key}">${c.labels[key]?.[0]}</label><input id="cle-${c.prefix}-${key}" data-${c.prefix}-control="${key}" type="${range?'range':boolean?'checkbox':'color'}" ${range?`min="${range[0]}" max="${range[1]}" step="${range[2]}"`:''}><output for="cle-${c.prefix}-${key}" data-${c.prefix}-output="${key}"></output></div>`;}).join('')}</fieldset>`).join('')}</div></section>`;}

