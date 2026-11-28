// Used only by the on-demand update probe and the existing explorer mount.
export const UPDATE_MOUNT_READY = 'code-codex:update-mount-ready';

/** Keep the last verified native slot while the active conversation is replaced. */
export function canRetainWorkspaceMount(tree: HTMLElement, width: number, forceDrawer: boolean): boolean {
  if (forceDrawer || width <= 820 || tree.dataset.placement !== 'inline' ||
      tree.dataset.mountStrategy !== 'known:workspace-row') return false;
  const parent = tree.parentElement;
  if (!parent?.matches('[data-app-shell-workspace-row="true"], [data-app-shell-workspace="true"]') ||
      !tree.isConnected) return false;
  const rails = parent.querySelectorAll(':scope > aside.app-shell-left-panel');
  const rail = rails[0];
  return rails.length === 1 && !!rail && rail.checkVisibility({checkVisibilityCSS:true}) &&
    Boolean(rail.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING);
}
