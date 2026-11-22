/** Only structural native changes can invalidate routing/mount observations.
 * Menu portals, response text, focus guards and owned plugin views are not routes. */
const OWNED='[data-code-codex-owned],[data-code-codex-particle-layer],[data-code-codex-account-selector],[data-code-codex-account-popup]';
const NATIVE_STRUCTURE=[
 'nav[data-app-navigation-rail]','aside.app-shell-left-panel','[data-app-shell-sidebar-trigger]',
 '[data-app-shell-active-page]','[data-code-codex-mount]','main','[role="main"]',
 '[data-app-shell-workspace-row]','[data-app-shell-workspace-layout]','[data-app-shell-focus-area="main"]','[class~="group/turn-diff-header"]','[class~="electron:bg-surface"][class*="rounded-tl-lg"]','div.bg-surface.flex:is(.h-full,.min-h-full,.flex-1)','[data-testid="conversation-pane"]','[data-testid="thread-view"]',
 '[data-testid="conversation-view"]','[data-above-composer-conversation-id]',
 '[data-app-action-sidebar-thread-id]','[data-app-action-sidebar-thread-active]',
 '[data-thread-id]','[data-task-id]','[data-conversation-id]',
 'div.flex.h-full.w-full.bg-surface',
].join(',');
const THREAD_ATTRIBUTE_TARGET='[data-thread-id],[data-task-id],[data-conversation-id],[data-app-action-sidebar-thread-id],[data-sidebar-destination],[data-app-shell-active-page],a[href]';
export const OWNED_ROOT_CONNECTED='code-codex:owned-root-connected';
/** One native observer per document, including during view-only hot upgrades. */
export function observeNativeStructure(listener:()=>void):{disconnect():void}{
 const key=Symbol.for('code-codex:native-structure-observer:v1');
 const host=window as unknown as Record<symbol,{listeners:Set<()=>void>;observer:MutationObserver}|undefined>;
 let shared=host[key];
 if(!shared){
  const listeners=new Set<()=>void>();
  const observer=new MutationObserver(records=>{if(nativeStructureChanged(records))for(const callback of [...listeners])try{callback();}catch(error){queueMicrotask(()=>{throw error;});}});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:[
   'aria-current','aria-selected','data-selected','data-state','data-thread-id','data-task-id','data-conversation-id',
   'data-app-action-sidebar-thread-id','data-app-action-sidebar-thread-active','data-app-action-sidebar-thread-host-id',
   'data-app-action-sidebar-thread-kind','data-above-composer-conversation-id','data-response-annotation-conversation',
   'data-app-shell-active-page','data-app-shell-workspace-layout','data-app-shell-right-panel-full-width','data-sidebar-destination','href',
  ]});
  shared=host[key]={listeners,observer};
 }
 const current=shared,callback=()=>listener();current.listeners.add(callback);
 return {disconnect(){current.listeners.delete(callback);if(!current.listeners.size){current.observer.disconnect();if(host[key]===current)delete host[key];}}};
}
export function nativeStructureChanged(records: readonly MutationRecord[]): boolean {
 for(const record of records){
  const target=record.target instanceof Element?record.target:record.target.parentElement;
  if(target?.closest(OWNED))continue;
  if(record.type==='attributes'){
   if(record.attributeName==='data-app-shell-active-page'||record.attributeName==='data-app-shell-workspace-layout'||record.attributeName==='data-app-shell-right-panel-full-width')return true;
   if(/^(?:data-(?:thread|task|conversation)-id|data-app-action-sidebar-thread-|data-above-composer-conversation-id|data-response-annotation-conversation)/.test(record.attributeName??''))return true;
   if(target?.matches(THREAD_ATTRIBUTE_TARGET))return true;
   continue;
  }
  if(record.type!=='childList')continue;
  for(const node of [...record.addedNodes,...record.removedNodes]){
   if(!(node instanceof Element)||node.matches(OWNED))continue;
   if(node.matches(NATIVE_STRUCTURE)||node.querySelector(NATIVE_STRUCTURE))return true;
   // A response annotation's presence can qualify a previously temporary thread;
   // changes to its message contents cannot change that identity.
   if(node.matches('[data-response-annotation-conversation]'))return true;
  }
 }
 return false;
}
