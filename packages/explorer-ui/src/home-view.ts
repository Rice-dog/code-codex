import { activePageElements } from "./adapters/codex-26.715";
import { isNativeLoginView } from "./native-login";

/** Native destination IDs and selection state are independent of UI language.
 * Older Codex shells have no feature rail; keep their existing behavior. */
export function isHomeWorkspaceView(root: ParentNode = document): boolean {
  if (isNativeLoginView(root)) return false;
  const homes = activePageElements(root,
    '[data-app-navigation-rail] [data-sidebar-destination="builtin:home"]');
  if (!homes.length) return (activePageElements(root, 'aside.app-shell-left-panel').length > 0 &&
    activePageElements(root, '[data-app-shell-sidebar-trigger]').length > 0) ||
    !!root.querySelector('[data-code-codex-mount]');
  return homes.length === 1 && homes[0]?.getAttribute("aria-current") === "page" &&
    activePageElements(root, "[data-app-shell-sidebar-trigger]").length > 0;
}
