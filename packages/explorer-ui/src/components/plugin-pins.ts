import {parameterLanguage,subscribeLanguage} from '../i18n';
import {runtimeEvent} from '../runtime-events';

export const PLUGIN_PINS_KEY='code-codex:plugin-pins:v1';
export const PLUGIN_PINS_CHANGED='code-codex:plugin-pins-changed';
const changed=PLUGIN_PINS_CHANGED;
const icon='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 2h6l-1 4 2 3v1H4V9l2-3zM8 10v4"/></svg>';
export function normalizePluginPins(raw:unknown):string[]{
 if(!Array.isArray(raw))return [];
 return [...new Set(raw.filter((x):x is string=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(x)))].slice(0,128);
}
export function readPluginPins():string[]{try{return normalizePluginPins(JSON.parse(localStorage.getItem(PLUGIN_PINS_KEY)??'[]'));}catch{return [];}}
const read=readPluginPins;

/** Reorder existing nodes per category. No download, enabled-state or renderer ownership. */
export function attachPluginPins(root:ShadowRoot):()=>void {
 const lists=[...root.querySelectorAll<HTMLElement>('.preview-market-section-list')];
 const groups=lists.map(list=>{const cards=[...list.querySelectorAll<HTMLElement>(':scope > .preview-extension')];cards.forEach((c,i)=>{c.dataset.pluginCatalogIndex??=String(i);});return {list,cards:cards.sort((a,b)=>Number(a.dataset.pluginCatalogIndex)-Number(b.dataset.pluginCatalogIndex))};});
 const cards=groups.flatMap(g=>g.cards);const buttons=new Map<HTMLElement,HTMLButtonElement>();
 for(const card of cards){
  const id=card.querySelector<HTMLElement>('[data-plugin-icon]')?.dataset.pluginIcon;
  if(!id)continue;
  const b=card.querySelector<HTMLButtonElement>(':scope > .plugin-pin')??document.createElement('button');b.type='button';b.className='plugin-pin';b.dataset.pluginPin=id;b.innerHTML=icon;if(!b.isConnected)card.append(b);buttons.set(card,b);
 }
 const render=()=>{
  const pins=read(),zh=parameterLanguage()==='zh';
  for(const [card,b] of buttons){const pinned=pins.includes(b.dataset.pluginPin!);const label=zh?(pinned?'取消置顶':'置顶插件'):(pinned?'Unpin plugin':'Pin plugin');b.setAttribute('aria-pressed',String(pinned));b.setAttribute('aria-label',label);b.title=label;card.toggleAttribute('data-plugin-pinned',pinned);}
  for(const {list,cards:original} of groups){const sorted=[...original].sort((a,b)=>{const rank=(c:HTMLElement)=>{const i=pins.indexOf(buttons.get(c)?.dataset.pluginPin??'');return i<0?Number.MAX_SAFE_INTEGER:i;};return rank(a)-rank(b)||original.indexOf(a)-original.indexOf(b);});
   // Avoid detach/append on a no-op refresh, preserving focus and open panels.
   sorted.forEach((card,i)=>{if(list.children[i]!==card)list.insertBefore(card,list.children[i]??null);});
  }
 };
 const click=(event:Event)=>{const b=(event.target as Element)?.closest<HTMLButtonElement>('[data-plugin-pin]');if(!b||!root.contains(b))return;event.preventDefault();event.stopPropagation();const id=b.dataset.pluginPin!,pins=read(),next=pins.includes(id)?pins.filter(x=>x!==id):[...pins,id];try{localStorage.setItem(PLUGIN_PINS_KEY,JSON.stringify(next));window.dispatchEvent(new Event(changed));b.focus({preventScroll:true});}catch(error){runtimeEvent('plugin-market','pin save','failed',{reason:String(error)});}};
 const storage=(event:StorageEvent)=>{if(event.key===PLUGIN_PINS_KEY||event.key===null)render();};
 root.addEventListener('click',click);window.addEventListener(changed,render);window.addEventListener('storage',storage);const unsubscribe=subscribeLanguage(render);render();
 return()=>{unsubscribe();root.removeEventListener('click',click);window.removeEventListener(changed,render);window.removeEventListener('storage',storage);for(const [card,b] of buttons){b.remove();card.removeAttribute('data-plugin-pinned');}};
}
