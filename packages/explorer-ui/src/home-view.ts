import { activePageElements } from "./adapters/codex-26.715";

/** Native destination IDs and selection state are independent of UI language.
 * Older Codex shells have no feature rail; keep their existing behavior. */
export function isHomeWorkspaceView(root: ParentNode = document): boolean {
  const homes = activePageElements(root,
    '[data-app-navigation-rail] [data-sidebar-destination="builtin:home"]');
  if (!homes.length) return true;
  return homes.length === 1 && homes[0]?.getAttribute("aria-current") === "page" &&
    activePageElements(root, "[data-app-shell-sidebar-trigger]").length > 0;
}
