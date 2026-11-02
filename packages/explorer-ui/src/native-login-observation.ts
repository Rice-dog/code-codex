/** Structural observations shared by the early player and normal login backdrop.
 * Do not inspect translated labels, identities, URLs, or official application state. */
export const NATIVE_LOGIN_SELECTOR = 'div.flex.h-full.w-full.bg-surface';
const NATIVE_NAVIGATION = 'nav[data-app-navigation-rail], aside.app-shell-left-panel, [data-app-shell-sidebar-trigger]';
const MAX_SURFACES = 12;

// Native shell visibility changes only when its own nodes/ancestors or styles
// change. Menu rows and streaming text must not repeatedly flush page styles.
interface ShellObservation {value:boolean;dirty:boolean;ancestors:Set<Element>;observer:MutationObserver;}
const shellOwner=globalThis as unknown as Record<symbol,WeakMap<Document,ShellObservation>>;
const shells=shellOwner[Symbol.for('code-codex:native-shell-observation:v1')]??=new WeakMap<Document,ShellObservation>();
function nativeShellPresent(root:ParentNode):boolean{
 if(!(root instanceof Document))return [...root.querySelectorAll(NATIVE_NAVIGATION)].some(activeNativeElement);
 let cached=shells.get(root);
 if(!cached){
  const invalidate=(records:MutationRecord[])=>{
   if(!cached)return;
   for(const record of records){
    const target=record.target instanceof Element?record.target:record.target.parentElement;
    if(target?.matches('style,link')){cached.dirty=true;continue;}
    if(record.type==='attributes'){if(cached.ancestors.has(record.target as Element))cached.dirty=true;continue;}
    for(const node of [...record.addedNodes,...record.removedNodes])if(node instanceof Element&&
     (node.matches('style,link,'+NATIVE_NAVIGATION)||node.querySelector('style,link,'+NATIVE_NAVIGATION)))cached.dirty=true;
   }
  };
  const observer=new MutationObserver(invalidate);
  cached={value:false,dirty:true,ancestors:new Set(),observer};shells.set(root,cached);
  observer.observe(root.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','inert','aria-hidden','data-app-shell-active-page','href','media','disabled']});
  root.defaultView?.addEventListener('resize',()=>{if(cached)cached.dirty=true;});
  root.addEventListener('load',event=>{if(cached&&event.target instanceof Element&&event.target.matches('link'))cached.dirty=true;},true);
  for(const type of ['animationend','transitionend'])root.addEventListener(type,event=>{if(cached&&event.target instanceof Element&&cached.ancestors.has(event.target))cached.dirty=true;},true);
  // Drain mutations made synchronously before an observation, including tests
  // and native navigation that queries readiness in the same task.
  Object.assign(cached,{invalidate});
 }
 const invalidate=(cached as ShellObservation&{invalidate:(records:MutationRecord[])=>void}).invalidate;
 invalidate(cached.observer.takeRecords());
 if(cached.dirty){
  const nodes=[...root.querySelectorAll(NATIVE_NAVIGATION)];cached.ancestors.clear();
  for(const node of nodes)for(let ancestor:Element|null=node;ancestor;ancestor=ancestor.parentElement)cached.ancestors.add(ancestor);
  cached.value=nodes.some(activeNativeElement);cached.dirty=false;
 }
 return cached.value;
}

export interface NativeLoginObservation {
  surface: HTMLElement | null;
  control: HTMLButtonElement | null;
  layout: string;
  candidates: number;
  controls: number;
  enabledControls: number;
  reason: string;
}

export function activeNativeElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected ||
      element.closest('[data-app-shell-active-page="false"], [inert], [hidden], [aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return false;
  }
  return true;
}

/** Covering startup media is intentionally ignored: readiness examines its underlay. */
export function paintedNativeElement(element: Element | null): element is HTMLElement {
  if (!activeNativeElement(element)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
    rect.top < innerHeight && rect.left < innerWidth;
}

function loginBody(surface: HTMLElement): { body: HTMLElement; layout: string } | undefined {
  const children = [...surface.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
  const compact = children.find(child => child.classList.contains('w-[340px]') && child.classList.contains('flex-col'));
  if (compact && surface.matches('.items-center.justify-center.overflow-hidden')) return { body: compact, layout: 'compact' };
  if (compact && surface.matches('.flex-col.overflow-y-auto') && compact.classList.contains('justify-center'))
    return { body: compact, layout: 'column' };
  const fallback = surface.querySelector<HTMLElement>(':scope > main.flex.w-full.items-center.justify-center > div.flex.w-full.max-w-sm.flex-col');
  if (fallback && surface.matches('.flex-col.overflow-y-auto')) return { body: fallback, layout: 'browser-fallback' };
  const gateway = children.find(child => child.matches('div.flex.w-full.max-w-sm.flex-col.items-center'));
  if (gateway && surface.matches('.justify-center.overflow-y-auto')) return { body: gateway, layout: 'gateway-oauth' };
  return undefined;
}

export function observeNativeLogin(root: ParentNode = document): NativeLoginObservation {
  const absent = (reason: string, candidates = 0): NativeLoginObservation =>
    ({ surface: null, control: null, layout: 'none', candidates, controls: 0, enabledControls: 0, reason });
  if (nativeShellPresent(root)) return absent('native shell present');
  const surfaces = [...root.querySelectorAll<HTMLElement>(NATIVE_LOGIN_SELECTOR)];
  if (surfaces.length > MAX_SURFACES) return absent('login surface scan limit exceeded', surfaces.length);
  const qualified = surfaces.flatMap(surface => {
    if (!paintedNativeElement(surface)) return [];
    const match = loginBody(surface);
    if (!match || !paintedNativeElement(match.body) || !match.body.querySelector('svg')) return [];
    // The small logo/game button is not evidence that authentication is usable.
    const controls = [...match.body.querySelectorAll<HTMLButtonElement>('button')].filter(button => {
      if (!paintedNativeElement(button)) return false;
      const rect = button.getBoundingClientRect();
      return rect.width >= 80 && rect.height >= 24;
    });
    return controls.length ? [{ surface, layout: match.layout, controls }] : [];
  });
  if (qualified.length !== 1) return absent(qualified.length ? 'multiple active login surfaces' : 'no qualified login surface', qualified.length);
  const selected = qualified[0]!;
  const enabled = selected.controls.filter(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
  return { surface: selected.surface, control: enabled[0] ?? null, layout: selected.layout, candidates: 1,
    controls: selected.controls.length, enabledControls: enabled.length,
    reason: enabled.length ? 'painted authentication controls' : 'authentication controls disabled' };
}
