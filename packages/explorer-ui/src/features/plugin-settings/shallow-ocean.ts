import type { BackgroundCommands } from '../../contracts/appearance';
import type { ShallowOceanBackgroundController } from '../../plugin-host/backgrounds/shallow-ocean';
import { ID, RANGES } from '../../effects/shallow-ocean/model';
import { icons } from '../../icons';
import { getLocale, subscribeLanguage } from '../../i18n';
import { recordCaughtRuntimeError } from '../../runtime-operations';
import creatureImages from '../../effects/shallow-ocean/thumbnails.json';

const groups=[["Opening", "开场", ["introEnabled", "introDuration"]], ["Marine life", "鱼群与生态", ["fishSpeed", "fishSize"]], ["Water surface", "水面与波浪", ["swell", "rippleStrength"]], ["Water optics", "水体光学", ["clarity", "caustics"]], ["Coast and seabed", "海岸与海床", ["beachSize", "coralDensity", "grassDensity"]], ["Ocean encounters", "海洋奇遇", ["eventsEnabled"]]] as const;
const labels:Record<string,readonly[string,string,string?]>={"introEnabled": ["Enable opening", "启用开场动画"], "introDuration": ["Opening duration", "开场时长（秒）", "s"], "introIntensity": ["Camera travel", "镜头展开幅度"], "silverCount": ["Silver fish", "银色鱼群数量"], "reefCount": ["Reef fish", "珊瑚彩色鱼数量"], "clownCount": ["Clownfish", "海葵小丑鱼数量"], "sharkCount": ["Reef sharks", "黑鳍礁鲨数量"], "turtleCount": ["Sea turtles", "绿海龟数量"], "fishSpeed": ["Swimming speed", "鱼类游动速度"], "fishSize": ["Fish size", "小鱼体型"], "schoolCohesion": ["School cohesion", "鱼群聚集程度"], "fleeRadius": ["Interaction radius", "互动惊扰半径"], "surfaceReflection": ["Surface reflection", "水面反射强度"], "sunGlint": ["Sun highlights", "太阳耀斑与高光亮度"], "foamIntensity": ["Wave foam", "海浪与岸线泡沫"], "swell": ["Natural swell", "自然涌浪强度"], "rippleStrength": ["Interaction ripples", "互动波纹强度"], "waterSpeed": ["Water speed", "涌浪与焦散速度"], "clarity": ["Water clarity", "海水通透度"], "caustics": ["Seabed caustics", "水底焦散亮度"], "refractionScale": ["Refraction", "水底折射扭曲"], "shadowIntensity": ["Creature shadows", "生物水底阴影深度"], "beachSize": ["Beach size", "沙滩面积"], "coralDensity": ["Coral density", "珊瑚密度"], "grassDensity": ["Seagrass density", "海草密度"], "eventsEnabled": ["Automatic events", "启用随机事件"]};
const creatures=[["manta", "Manta", "蝠鲼"], ["eagle", "Eagle ray", "斑点鹞鲼"], ["stingray", "Stingray", "蓝斑魟"], ["turtle", "Sea turtle", "海龟"], ["moon", "Moon jelly", "海月水母"], ["nettle", "Sea nettle", "黄金水母"], ["silver", "Silver school", "银色鱼群"], ["reef", "Reef fish", "珊瑚鱼"], ["clown", "Clownfish", "小丑鱼"], ["shark", "Reef shark", "礁鲨"]] as const;
const events=[["school", "Fish migration", "鱼群过境"], ["dolphin", "Dolphin visit", "海豚来访"], ["storm", "Storm", "风暴"], ["meteor", "Meteor fall", "陨石坠落"], ["duo", "Drifting companions", "漂流伙伴"]] as const;
const text=(en:string,zh:string)=>getLocale()==='zh-CN'?zh:en;
const performanceModes=[['Automatic','\u81ea\u52a8'],['Low quality','\u4f4e\u753b\u8d28'],['Medium quality','\u4e2d\u753b\u8d28'],['High quality','\u9ad8\u753b\u8d28']] as const;
export function shallowOceanCardMarkup():string{return `<article class="preview-extension appearance-extension" data-appearance-plugin="${ID}"><span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4 data-plugin-name>Shallow Ocean Letters Background</h4><span class="preview-extension-status shallow-ocean-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action shallow-ocean-enable" aria-pressed="false">Enable</button><button type="button" class="particle-settings-trigger shallow-ocean-settings" aria-label="Configure Shallow Ocean Letters Background" aria-haspopup="dialog" aria-controls="cle-shallow-ocean-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;}
const sceneAction=(action:string,label:string)=>`<button type="button" class="particle-library-clear" data-ocean-action="${action}">${label}</button>`;
const eventButtons=()=>`<div class="ocean-actions ocean-event-collection">${events.map(([id,en])=>`<button type="button" class="particle-library-clear" data-ocean-event="${id}" aria-pressed="true" hidden>${en}</button>`).join('')}</div>`;
export function shallowOceanPanelMarkup():string{return `<section id="cle-shallow-ocean-settings" class="particle-settings-panel shallow-ocean-panel" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-shallow-ocean-title">
<style>
.shallow-ocean-panel{box-sizing:border-box;container-type:inline-size}
.shallow-ocean-panel .particle-settings-header{padding:8px 12px}
.shallow-ocean-panel .particle-settings-header h3{font-size:12px;line-height:18px}
.shallow-ocean-panel .ocean-developer-trigger{appearance:none;border:0;padding:0;margin:0;background:none;color:inherit;font:inherit;text-align:start;cursor:default;user-select:none}
.shallow-ocean-panel .ocean-developer-trigger:focus-visible{outline:2px solid var(--cle-icon-blue);outline-offset:3px;border-radius:3px}
.shallow-ocean-panel .ocean-developer-badge{font-size:10px;line-height:16px;color:var(--cle-icon-blue)}
.shallow-ocean-panel .ocean-performance{display:flex;align-items:center;gap:6px;margin-inline-start:auto;font:inherit;font-size:11px;color:var(--cle-ink)}
.shallow-ocean-panel .ocean-performance select{font:inherit;color:var(--cle-ink);background:var(--cle-paper);border:1px solid var(--cle-rule);border-radius:6px;padding:3px 6px;min-width:80px}
.shallow-ocean-panel .particle-settings-scroll{padding:6px 12px;overflow:auto}
.shallow-ocean-panel .ocean-creature-grid{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;padding:2px 2px 6px;scrollbar-width:thin}
.shallow-ocean-panel .ocean-creature-card{display:flex;flex:1 0 78px;flex-direction:column;align-items:stretch;gap:2px;min-width:0;margin:0;padding:4px;border:1px solid var(--cle-rule);border-radius:8px;background:var(--cle-paper);color:var(--cle-ink);font:inherit;font-size:11px;line-height:16px;cursor:grab;touch-action:pan-x}
.shallow-ocean-panel .ocean-creature-card img{display:block;width:100%;height:44px;object-fit:contain;pointer-events:none}
.shallow-ocean-panel .ocean-creature-card span{min-height:16px;display:grid;place-items:center;text-align:center;white-space:nowrap;font-size:10px}
.shallow-ocean-panel .ocean-creature-card:hover:not(:disabled){background:var(--cle-subtle);border-color:var(--cle-icon-blue)}
.shallow-ocean-panel .ocean-creature-card:focus-visible{outline:2px solid var(--cle-icon-blue);outline-offset:2px}
.shallow-ocean-panel .ocean-creature-card:disabled{cursor:default;opacity:.65}
.shallow-ocean-panel .ocean-parameter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:start;gap:6px 18px;margin-top:8px}
.shallow-ocean-panel .particle-settings-group{min-width:0;margin:0;padding:4px 0;align-content:start;gap:4px}
.shallow-ocean-panel .particle-control-row{grid-template-columns:minmax(70px,1fr) minmax(55px,1fr) 32px;margin:4px 0;min-height:22px;gap:6px;padding:0}
.shallow-ocean-panel .ocean-actions{display:flex;flex-wrap:wrap;gap:6px}
.shallow-ocean-panel .ocean-actions .particle-library-clear{margin:0}
.shallow-ocean-panel .ocean-global-actions{margin-bottom:4px}
.shallow-ocean-panel [data-ocean-event][aria-pressed="true"]{background:var(--cle-subtle);border-color:var(--cle-icon-blue);color:var(--cle-icon-blue)}
.shallow-ocean-panel [data-ocean-event][aria-pressed="false"]{background:var(--cle-paper);color:var(--cle-muted)}
.shallow-ocean-panel [data-ocean-event][hidden]{display:none}
.shallow-ocean-panel [data-ocean-event-hint],.shallow-ocean-panel [data-ocean-scene-hint]{margin:4px 0 6px;font-size:11px;line-height:1.5;color:var(--cle-muted)}
@container(max-width:760px){.shallow-ocean-panel .ocean-parameter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container(max-width:480px){.shallow-ocean-panel .ocean-parameter-grid{grid-template-columns:minmax(0,1fr)}}
</style>
<header class="particle-settings-header"><div class="particle-settings-heading"><h3 id="cle-shallow-ocean-title"><button type="button" class="ocean-developer-trigger" data-ocean-developer-trigger data-plugin-name aria-pressed="false">Shallow Ocean Letters Background</button></h3><span class="ocean-developer-badge" data-ocean-developer-badge role="status" hidden></span></div><label class="ocean-performance"><span data-ocean-performance-label>Performance</span><select data-ocean-performance aria-label="Performance mode">${performanceModes.map(([en],i)=>`<option value="${i}">${en}</option>`).join('')}</select></label><div class="particle-settings-header-actions"><button type="button" class="particle-settings-close shallow-ocean-close" aria-label="Close settings">${icons.close}</button></div></header>
<div class="particle-settings-scroll"><div class="ocean-actions ocean-global-actions"><button type="button" class="particle-library-clear" data-ocean-reset>Reset all parameters</button><button type="button" class="particle-library-clear" data-ocean-clear>Clear all marine life</button></div><p class="particle-settings-error shallow-ocean-error" role="status" hidden></p>
<fieldset class="particle-settings-group"><div class="particle-library-grid ocean-creature-grid">${creatures.map(([id,en])=>`<button type="button" class="ocean-creature-card" data-ocean-creature="${id}"><img src="${creatureImages[id]}" width="192" height="136" alt="" draggable="false"><span data-ocean-creature-label>${en}</span></button>`).join('')}</div></fieldset>
<div class="ocean-parameter-grid">${groups.map(([en,,keys],index)=>`<fieldset class="particle-settings-group" data-ocean-group-section="${index}"><legend style="width:100%"><span data-ocean-group="${index}">${en}</span></legend>${keys.map(key=>{const range=RANGES[key];const boolean=key==='introEnabled'||key==='eventsEnabled';return `<div class="particle-control-row"><label for="cle-ocean-${key}" data-ocean-label="${key}">${labels[key]?.[0]}</label><input id="cle-ocean-${key}" data-ocean-control="${key}" type="${boolean?'checkbox':range?'range':'color'}" ${range?`min="${range[0]}" max="${range[1]}" step="${range[2]}"`:''}><output for="cle-ocean-${key}" data-ocean-output="${key}"></output></div>`;}).join('')}${index===0?`<div class="ocean-actions">${sceneAction('replay','Replay opening')}</div>`:index===5?`<p data-ocean-event-hint>Discover every ocean encounter to choose which ones may return.</p>${eventButtons()}`:''}</fieldset>`).join('')}</div></div></section>`;}

export interface ShallowOceanSettingsPorts {
 readonly shadow:ShadowRoot;
 readonly runtime:Pick<ShallowOceanBackgroundController,'enabled'|'pending'|'error'|'settings'|'updateSettings'|'resetAll'|'clearCreatures'|'subscribe'|'addCreature'|'eventJournal'|'toggleEvent'|'action'|'replay'|'developerMode'|'setDeveloperMode'|'previewEvent'>;
 readonly actions:BackgroundCommands;
 readonly enabled:()=>boolean;
 readonly closeOthers:()=>void;
 readonly notice:(message:string)=>void;
}
/** Owns only this panel and its inputs; opening never touches the renderer. */
export class ShallowOceanSettingsController {
 #scope:AbortController|undefined;
 #titleClicks=0;
 #titleStarted=0;
 #preview:string|undefined;
 #drag:{button:HTMLButtonElement;kind:string;x:number;y:number;id:number}|undefined;
 #unsubscribe:(()=>void)|undefined;
 #language:(()=>void)|undefined;
 readonly #panel:HTMLElement;
 readonly #trigger:HTMLButtonElement;
 readonly #button:HTMLButtonElement;
 constructor(private readonly ports:ShallowOceanSettingsPorts){
  this.#panel=ports.shadow.querySelector<HTMLElement>('.shallow-ocean-panel')!;
  this.#trigger=ports.shadow.querySelector<HTMLButtonElement>('.shallow-ocean-settings')!;
  this.#button=ports.shadow.querySelector<HTMLButtonElement>('.shallow-ocean-enable')!;
 }
 start():void{
  this.stop();const scope=this.#scope=new AbortController(),options={signal:scope.signal};
  this.#unsubscribe=this.ports.runtime.subscribe(()=>this.render());
  this.#language=subscribeLanguage(()=>this.render());
  this.#button.addEventListener('click',()=>void this.ports.actions.toggle(ID).catch(error=>{recordCaughtRuntimeError('Shallow Ocean background toggle',error);this.ports.notice(String(error));}),options);
  this.#trigger.addEventListener('click',()=>this.open?this.close(true):this.show(),options);
  this.#panel.querySelector('.shallow-ocean-close')!.addEventListener('click',()=>this.close(true),options);
  this.#panel.addEventListener('pointerdown',event=>{const b=(event.target as Element).closest<HTMLButtonElement>('[data-ocean-creature]');if(!b||b.disabled||event.button!==0)return;this.#drag={button:b,kind:b.dataset.oceanCreature!,x:event.clientX,y:event.clientY,id:event.pointerId};b.setPointerCapture(event.pointerId);},options);
  window.addEventListener('pointerup',event=>{const drag=this.#drag;if(!drag||drag.id!==event.pointerId)return;this.#drag=undefined;const moved=Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6;this.launch(drag.button,moved?event.clientX:undefined,moved?event.clientY:undefined);},{...options,capture:true});
  window.addEventListener('pointercancel',()=>{this.#drag=undefined},{...options,capture:true});
  this.#panel.querySelector<HTMLSelectElement>('[data-ocean-performance]')!.addEventListener('change',event=>{this.ports.runtime.updateSettings({...this.ports.runtime.settings,performanceMode:Number((event.target as HTMLSelectElement).value)});},options);
  this.#panel.addEventListener('input',event=>{
   const input=event.target as HTMLInputElement,key=input.dataset.oceanControl;
   if(!key)return;const value=input.type==='checkbox'?Number(input.checked):input.type==='range'?Number(input.value):input.value;
   this.ports.runtime.updateSettings({...this.ports.runtime.settings,[key]:value});
  },options);
  this.#panel.querySelector('[data-ocean-developer-trigger]')!.addEventListener('click',()=>{
   const now=performance.now();
   if(!this.#titleClicks||now-this.#titleStarted>3000){this.#titleClicks=0;this.#titleStarted=now;}
   if(++this.#titleClicks<5)return;
   this.#titleClicks=0;this.#preview=undefined;
   this.ports.runtime.setDeveloperMode(!this.ports.runtime.developerMode);
  },options);
  this.#panel.addEventListener('click',event=>{
   const source=(event.target as Element).closest<HTMLButtonElement>('[data-ocean-creature],[data-ocean-event],[data-ocean-action]');
   if(source?.dataset.oceanCreature&&(event as MouseEvent).detail!==0)return;
   if(source){try{if(source.dataset.oceanCreature)this.launch(source);else if(source.dataset.oceanEvent){if(this.ports.runtime.developerMode){this.ports.runtime.previewEvent(source.dataset.oceanEvent);this.#preview=source.dataset.oceanEvent;this.render();}else this.ports.runtime.toggleEvent(source.dataset.oceanEvent);}else if(source.dataset.oceanAction==='replay')this.ports.runtime.replay();else this.ports.runtime.action(source.dataset.oceanAction!);}catch(error){this.ports.notice(String(error));}return;}
   const clear=(event.target as Element).closest<HTMLButtonElement>('[data-ocean-clear]');
   if(clear){this.cancelFlights();this.#preview=undefined;try{this.ports.runtime.clearCreatures();}catch(error){recordCaughtRuntimeError('Ocean clear marine life',error);this.ports.notice(String(error));}return;}
   const target=(event.target as Element).closest<HTMLButtonElement>('[data-ocean-reset]');if(!target)return;
   this.cancelFlights();this.#preview=undefined;try{this.ports.runtime.resetAll();}catch(error){recordCaughtRuntimeError('Ocean reset all parameters',error);this.ports.notice(String(error));}
  },options);
  window.addEventListener('pointerdown',event=>{if(this.open&&!event.composedPath().includes(this.#panel)&&!event.composedPath().includes(this.#trigger))this.close(false);},{...options,capture:true});
  window.addEventListener('keydown',event=>{if(this.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.close(true);}},{...options,capture:true});
  window.addEventListener('resize',()=>this.position(),options);
  this.ports.shadow.addEventListener('scroll',()=>this.position(),{...options,capture:true});
  this.render();
 }
 containsEvent(event:Event):boolean{return event.composedPath().includes(this.#panel)||event.composedPath().includes(this.#trigger);}
 get open():boolean{return this.#panel.matches(':popover-open');}
 show():void{this.ports.closeOthers();this.#panel.showPopover();this.#trigger.setAttribute('aria-expanded','true');this.position();this.#panel.querySelector<HTMLButtonElement>('.shallow-ocean-close')?.focus();}
 close(focus=false):void{this.#titleClicks=0;for(const [animation,ghost]of this.#flights){animation.cancel();ghost.remove();}this.#flights.clear();if(this.open)this.#panel.hidePopover();this.#trigger.setAttribute('aria-expanded','false');if(focus)this.#trigger.focus();}
 #populationGeneration=0;
 private cancelFlights():void{this.#populationGeneration++;this.#drag=undefined;for(const [animation,ghost]of this.#flights){animation.cancel();ghost.remove();}this.#flights.clear();}
 #flights=new Map<Animation,HTMLElement>();
 private launch(button:HTMLButtonElement,x?:number,y?:number):void{
  if(button.disabled||!this.ports.runtime.enabled||this.#flights.size>=8)return;
  const rect=button.querySelector('img')!.getBoundingClientRect();
  const endX=x??Math.max(innerWidth*.25,Math.min(innerWidth*.78,rect.x+rect.width/2)),endY=y??Math.max(70,this.#panel.getBoundingClientRect().top*.55);
  const u=Math.max(.01,Math.min(.99,endX/innerWidth)),v=Math.max(.01,Math.min(.99,1-endY/innerHeight));
  const generation=this.#populationGeneration;
  const commit=()=>{if(generation===this.#populationGeneration&&!this.#scope?.signal.aborted&&this.ports.runtime.enabled&&!this.ports.runtime.pending){void this.ports.runtime.addCreature(button.dataset.oceanCreature!,u,v).catch(error=>this.ports.notice(String(error)));}};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){commit();return;}
  const ghost=document.createElement('img');ghost.src=button.querySelector('img')!.src;ghost.alt='';ghost.setAttribute('aria-hidden','true');ghost.popover='manual';ghost.style.cssText=`position:fixed;inset:auto;margin:0;border:0;padding:0;background:transparent;pointer-events:none;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;object-fit:contain;overflow:visible;`;
  document.body.append(ghost);ghost.showPopover();const dx=endX-rect.x-rect.width/2,dy=endY-rect.y-rect.height/2;
  const animation=ghost.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*.5}px,${dy*.5-48}px) scale(.85)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.35)`,opacity:0}],{duration:650,easing:'cubic-bezier(.2,.6,.35,1)',fill:'forwards'});this.#flights.set(animation,ghost);
  void animation.finished.then(commit,()=>{}).finally(()=>{this.#flights.delete(animation);ghost.remove();});
 }
 position():void{
  if(!this.open)return;
  const edge=12,gap=8,market=this.ports.shadow.querySelector<HTMLElement>('.preview-market-popover'),bounds=market&&!market.hidden?market.getBoundingClientRect():undefined;
  const height=Math.max(120,Math.min(280,Math.round(innerHeight*.28),innerHeight-edge*2));
  let left=edge,width=Math.min(1120,innerWidth-edge*2),bottom=edge,maxHeight=height;
  if(bounds&&bounds.width>0){
   const available=innerWidth-edge-bounds.right-gap;
   if(available>=280){width=Math.min(1120,available);left=bounds.right+gap;this.#panel.dataset.side='market-right';}
   else if(bounds.top-edge>=140){maxHeight=Math.min(height,bounds.top-edge-gap);bottom=innerHeight-bounds.top+gap;this.#panel.dataset.side='market-above';}
   else if(innerHeight-bounds.bottom-edge-gap>=140){maxHeight=Math.min(height,innerHeight-bounds.bottom-edge-gap);bottom=edge;this.#panel.dataset.side='market-below';}
   else {left=Math.max(edge,innerWidth-edge-width);this.#panel.dataset.side='narrow-overlay';}
  }else {left=Math.max(edge,innerWidth-edge-width);this.#panel.dataset.side='dock';}
  this.#panel.style.width=`${Math.max(1,width)}px`;this.#panel.style.maxHeight=`${maxHeight}px`;this.#panel.style.left=`${Math.round(left)}px`;this.#panel.style.top='auto';this.#panel.style.bottom=`${bottom}px`;
 }
 render():void{
  const {runtime}=this.ports,enabled=this.ports.enabled();
  const performance=this.#panel.querySelector<HTMLSelectElement>('[data-ocean-performance]')!;performance.value=String(runtime.settings.performanceMode);performance.disabled=runtime.pending;performance.setAttribute('aria-label',text('Performance mode','\u6027\u80fd\u6a21\u5f0f'));this.#panel.querySelector('[data-ocean-performance-label]')!.textContent=text('Performance','\u6027\u80fd');performanceModes.forEach(([en,zh],i)=>{performance.options[i]!.textContent=text(en,zh);});
  this.#button.closest('article')!.setAttribute('aria-busy',String(runtime.pending));
  this.#panel.setAttribute('aria-busy',String(runtime.pending));
  for(const reset of this.#panel.querySelectorAll<HTMLButtonElement>('[data-ocean-reset]'))reset.disabled=runtime.pending;
  this.#button.textContent=runtime.pending?text('Applying…','正在应用…'):enabled?text('Disable','停用'):text('Enable','启用');
  this.#button.dataset.enabled=String(enabled);this.#button.setAttribute('aria-pressed',String(enabled));
  // Cold download owns its disabled flag; only manage runtime state after release.
  if(!this.#button.dataset.packageLoadingOwner)this.#button.disabled=this.ports.actions.busy;
  const status=this.ports.shadow.querySelector<HTMLElement>('.shallow-ocean-status')!;status.textContent=enabled?runtime.enabled?text('Enabled','已启用'):text('Enabled · Not applied','已启用 · 未应用'):text('Disabled','未启用');status.dataset.enabled=String(enabled&&runtime.enabled);status.dataset.pending=String(runtime.pending);
  this.#panel.lang=getLocale();this.#panel.dataset.language=getLocale()==='zh-CN'?'zh':'en';
  this.#panel.querySelector('.shallow-ocean-close')!.setAttribute('aria-label',text('Close settings','关闭设置'));
  this.#trigger.setAttribute('aria-label',text('Configure Shallow Ocean Letters Background','设置浅海来信'));
  groups.forEach(([en,zh],index)=>{this.#panel.querySelector(`[data-ocean-group="${index}"]`)!.textContent=text(en,zh);});
  this.#panel.querySelector('[data-ocean-reset]')!.textContent=text('Reset all parameters','\u91cd\u7f6e\u5168\u90e8\u53c2\u6570');
  const clear=this.#panel.querySelector<HTMLButtonElement>('[data-ocean-clear]')!;clear.textContent=text('Clear all marine life','\u6e05\u9664\u6240\u6709\u6d77\u6d0b\u751f\u7269');clear.disabled=runtime.pending;
  for(const input of this.#panel.querySelectorAll<HTMLInputElement>('[data-ocean-control]')){const key=input.dataset.oceanControl!,value=runtime.settings[key as keyof typeof runtime.settings],label=labels[key]!;
   this.#panel.querySelector(`[data-ocean-label="${key}"]`)!.textContent=text(label[0],label[1]);
   if(input.type==='checkbox')input.checked=Number(value)===1;else input.value=String(value);
   input.disabled=runtime.pending;
   this.#panel.querySelector(`[data-ocean-output="${key}"]`)!.textContent=input.type==='range'?`${Number(Number(value).toFixed(3))}${label[2]??''}`:'';
  }
  for(const [id,en,zh]of creatures){const b=this.#panel.querySelector<HTMLButtonElement>(`[data-ocean-creature="${id}"]`)!;b.querySelector('[data-ocean-creature-label]')!.textContent=text(en,zh);b.disabled=!runtime.enabled||runtime.pending;}
  const developer=runtime.developerMode;
  this.#panel.querySelector('[data-ocean-developer-trigger]')!.setAttribute('aria-pressed',String(developer));
  const badge=this.#panel.querySelector<HTMLElement>('[data-ocean-developer-badge]')!;badge.hidden=!developer;badge.textContent=text('Developer mode','开发者模式');
  const journal=runtime.eventJournal,complete=journal.discovered.length===events.length;
  for(const [id,en,zh]of events){const b=this.#panel.querySelector<HTMLButtonElement>(`[data-ocean-event="${id}"]`)!;b.textContent=text(en,zh);b.hidden=!developer&&!journal.discovered.includes(id);b.disabled=runtime.pending||(developer?!runtime.enabled:!complete);b.setAttribute('aria-pressed',String(developer?this.#preview===id:!journal.excluded.includes(id)));}
  for(const [id,en,zh]of [['replay','Replay opening','重播开场']] as const){const b=this.#panel.querySelector<HTMLButtonElement>(`[data-ocean-action="${id}"]`)!;b.textContent=text(en,zh);b.disabled=!runtime.enabled||runtime.pending;}
  this.#panel.querySelector('[data-ocean-event-hint]')!.textContent=developer?text('Click an encounter to preview it. Automatic encounters are paused; discoveries and filters are unchanged.','点击事件立即预览。自动奇遇已暂停，不影响正式收集和筛选。'):complete?text('Collection complete. Highlight the encounters you want to see again.','已集齐所有奇遇。点亮想再次遇见的事件。'):text(`Encounters discovered: ${journal.discovered.length} / ${events.length}. Discover them all to choose which ones may return.`,`已发现奇遇 ${journal.discovered.length} / ${events.length}，集齐后可选择希望再次遇见的事件。`);
  const error=this.#panel.querySelector<HTMLElement>('.shallow-ocean-error')!;error.hidden=!runtime.error;error.textContent=runtime.error??'';
 }
 stop():void{this.#titleClicks=0;this.#preview=undefined;this.ports.runtime.setDeveloperMode(false);for(const [animation,ghost]of this.#flights){animation.cancel();ghost.remove();}this.#flights.clear();this.#drag=undefined;this.close();this.#scope?.abort();this.#scope=undefined;this.#unsubscribe?.();this.#language?.();}
}
