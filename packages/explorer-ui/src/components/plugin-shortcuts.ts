import {readPluginPins,PLUGIN_PINS_CHANGED,PLUGIN_PINS_KEY} from './plugin-pins';
import {pluginIconMarkup,pluginIconIds,type PluginIconId} from './plugin-icons';
import {subscribeLanguage,t} from '../i18n';

const css=`.plugin-shortcuts{display:flex;align-items:center;justify-content:flex-start;gap:2px;flex:1;min-width:0;margin:0 6px}.plugin-shortcut,.plugin-shortcut-more{display:inline-flex;align-items:center;justify-content:center;flex:0 0 24px;width:24px;height:24px;padding:4px;color:var(--cle-muted);background:transparent;border:0;border-radius:5px;cursor:pointer}.plugin-shortcut svg,.plugin-shortcut-more svg,.plugin-shortcut-menu svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}.plugin-shortcut:hover,.plugin-shortcut-more:hover,.plugin-shortcut-more[aria-expanded=true]{background:var(--cle-hover);color:var(--cle-ink)}.plugin-shortcut[aria-expanded=true]{background:var(--cle-hover);color:var(--cle-icon-blue)}.plugin-shortcut:focus-visible,.plugin-shortcut-more:focus-visible,.plugin-shortcut-menu button:focus-visible{outline:2px solid var(--cle-focus);outline-offset:0}.plugin-shortcut-menu{position:fixed;inset:auto;margin:0;padding:5px;max-width:min(260px,calc(100vw - 24px));max-height:min(320px,calc(100vh - 24px));overflow:auto;background:var(--cle-paper-raised);color:var(--cle-ink);border:1px solid var(--cle-rule);border-radius:8px;box-shadow:0 4px 12px #0003;font:inherit}.plugin-shortcut-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:5px 8px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:start;cursor:pointer;font:inherit}.plugin-shortcut-menu button:hover,.plugin-shortcut-menu button[aria-expanded=true]{background:var(--cle-hover)}.plugin-shortcut-menu span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.statusbar>.status-code{flex:none}`;
const more='<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r=".7"/><circle cx="8" cy="8" r=".7"/><circle cx="13" cy="8" r=".7"/></svg>';

/** Pins share one ordered preference with the market; opening never enables a plugin. */
export function attachPluginShortcuts(root:ShadowRoot,open:(id:string)=>void):()=>void {
 const footer=root.querySelector<HTMLElement>('.statusbar'),market=root.querySelector<HTMLElement>('.preview-market-button'),version=root.querySelector<HTMLElement>('.status-code');
 if(!footer||!market||!version)return()=>{};
 const host=document.createElement('nav');host.className='plugin-shortcuts';market.after(host);
 const menu=document.createElement('div');menu.className='plugin-shortcut-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');root.append(menu);
 const style=document.createElement('style');style.textContent=css;root.append(style);
 const abort=new AbortController();let signature='',moreButton:HTMLButtonElement|undefined,frame:number|undefined;
 const cards=new Map<string,HTMLElement>();
 for(const card of root.querySelectorAll<HTMLElement>('.preview-extension')){const id=card.querySelector<HTMLElement>('[data-plugin-icon]')?.dataset.pluginIcon;if(id&&pluginIconIds.includes(id as PluginIconId))cards.set(id,card);}
 const active=(card:HTMLElement)=>card.querySelector('.particle-settings-trigger[aria-expanded=true]')!==null;
 const close=()=>{if(menu.matches(':popover-open'))menu.hidePopover();moreButton?.setAttribute('aria-expanded','false');};
 const button=(id:string,overflow=false)=>{
  const card=cards.get(id)!,b=document.createElement('button');b.type='button';b.dataset.pluginShortcut=id;b.className='plugin-shortcut';b.setAttribute('aria-label',card.querySelector('h4')?.textContent??id);b.setAttribute('aria-expanded',String(active(card)));b.setAttribute('aria-controls','cle-preview-market');
  b.innerHTML=pluginIconMarkup(id as PluginIconId);
  if(overflow){b.setAttribute('role','menuitem');const label=document.createElement('span');label.textContent=b.getAttribute('aria-label');b.append(label);}
  b.addEventListener('click',()=>{close();open(id);},{signal:abort.signal});return b;
 };
 const render=()=>{
  const ids=readPluginPins().filter(id=>cards.has(id)&&!cards.get(id)!.hidden),available=Math.max(0,footer.clientWidth-market.getBoundingClientRect().width-version.getBoundingClientRect().width-40);
  const slots=Math.min(5,Math.floor(available/26)),visible=ids.length<=slots?ids:ids.slice(0,Math.max(0,slots-1)),overflow=ids.slice(visible.length);
  const next=JSON.stringify([visible,overflow,ids.map(id=>[cards.get(id)?.querySelector('h4')?.textContent,active(cards.get(id)!)]),t('plugins.morePinned')]);if(signature===next)return;signature=next;
  const focused=(root.activeElement as HTMLElement)?.dataset.pluginShortcut,wasOpen=menu.matches(':popover-open');
  host.replaceChildren(...visible.map(id=>button(id)));menu.replaceChildren(...overflow.map(id=>button(id,true)));
  moreButton=undefined;
  if(overflow.length){const b=moreButton=document.createElement('button');b.type='button';b.className='plugin-shortcut-more';b.setAttribute('aria-label',t('plugins.morePinned'));b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded',String(wasOpen));b.innerHTML=more;host.append(b);b.addEventListener('click',()=>{if(menu.matches(':popover-open')){close();return;}menu.showPopover();b.setAttribute('aria-expanded','true');const a=b.getBoundingClientRect(),m=menu.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(innerWidth-m.width-12,a.left))+'px';menu.style.top=Math.max(12,a.top-m.height-6)+'px';menu.querySelector<HTMLButtonElement>('button')?.focus();},{signal:abort.signal});}
  else close();
  if(focused)[...root.querySelectorAll<HTMLButtonElement>('[data-plugin-shortcut]')].find(b=>b.dataset.pluginShortcut===focused)?.focus({preventScroll:true});
 };
 const schedule=()=>{if(frame===undefined)frame=requestAnimationFrame(()=>{frame=undefined;render();});};
 const mutation=new MutationObserver(records=>{if(records.some(r=>!host.contains(r.target as Node)&&!menu.contains(r.target as Node)))schedule();});mutation.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-expanded','hidden']});
 const resize=new ResizeObserver(schedule);resize.observe(footer);
 const storage=(event:StorageEvent)=>{if(event.key===null||event.key===PLUGIN_PINS_KEY)schedule();};
 window.addEventListener(PLUGIN_PINS_CHANGED,schedule,{signal:abort.signal});window.addEventListener('storage',storage,{signal:abort.signal});window.addEventListener('resize',close,{signal:abort.signal});
 menu.addEventListener('toggle',()=>moreButton?.setAttribute('aria-expanded',String(menu.matches(':popover-open'))),{signal:abort.signal});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();moreButton?.focus();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const list=[...menu.querySelectorAll<HTMLButtonElement>('button')],at=list.indexOf(root.activeElement as HTMLButtonElement);list[event.key==='Home'?0:event.key==='End'?list.length-1:(at+(event.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();},{signal:abort.signal});
 const unsubscribe=subscribeLanguage(schedule);render();
 return()=>{abort.abort();unsubscribe();resize.disconnect();mutation.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);close();host.remove();menu.remove();style.remove();};
}
