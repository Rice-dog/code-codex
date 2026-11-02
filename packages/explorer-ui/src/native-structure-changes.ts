/** Only structural native changes can invalidate routing/mount observations.
 * Menu portals, response text, focus guards and owned plugin views are not routes. */
const OWNED='[data-code-codex-owned],[data-code-codex-particle-layer],[data-code-codex-account-selector],[data-code-codex-account-popup]';
const NATIVE_STRUCTURE=[
 'nav[data-app-navigation-rail]','aside.app-shell-left-panel','[data-app-shell-sidebar-trigger]',
 '[data-app-shell-active-page]','[data-code-codex-mount]','main','[role="main"]',
 '[data-app-shell-workspace-row]','[data-testid="conversation-pane"]','[data-testid="thread-view"]',
 '[data-testid="conversation-view"]','[data-above-composer-conversation-id]',
 '[data-app-action-sidebar-thread-id]','[data-app-action-sidebar-thread-active]',
 '[data-thread-id]','[data-task-id]','[data-conversation-id]',
 'div.flex.h-full.w-full.bg-surface',
].join(',');
const THREAD_ATTRIBUTE_TARGET='[data-thread-id],[data-task-id],[data-conversation-id],[data-app-action-sidebar-thread-id],[data-sidebar-destination],[data-app-shell-active-page],a[href]';
export function nativeStructureChanged(records: readonly MutationRecord[]): boolean {
 for(const record of records){
  const target=record.target instanceof Element?record.target:record.target.parentElement;
  if(target?.closest(OWNED))continue;
  if(record.type==='attributes'){
   if(record.attributeName==='data-app-shell-active-page')return true;
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
