import type { RendererAdapter } from "./contract";

const THREAD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const TEMPORARY_LOCAL_THREAD_PREFIX = "local:client-new-thread:";
export const ACTIVE_THREAD_MARKER_SELECTOR = '[data-app-action-sidebar-thread-active="true"]';
export const ACTIVE_LOCAL_THREAD_SELECTOR = '[data-app-action-sidebar-thread-id][data-app-action-sidebar-thread-active="true"]';
export const COMPOSER_THREAD_SELECTOR = "[data-above-composer-conversation-id]";
export const RESPONSE_THREAD_SELECTOR = "[data-response-annotation-conversation]";
export const MAIN_SURFACE_SELECTOR = 'main:is(.main-surface, [data-app-shell-main-surface="default"])';

/**
 * Return the app-shell ancestor that owns exactly one conversation surface and
 * one direct left task rail. Older Codex builds put the rail beside `main`
 * directly; later legacy builds wrap `main` once. Codex 26.924 uses a
 * separate workspace row, qualified by `qualifiedWorkspaceRowForMain` below.
 * Only the parent and grandparent are accepted here so an unrelated aside
 * cannot qualify a page.
 */
export function qualifiedAppShellForMain(
  main: Element,
  root: ParentNode = document,
): Element | null {
  if (!root.querySelector("[data-app-shell-sidebar-trigger]")) return null;
  const mainParent = main.parentElement;
  let shell = mainParent;
  for (let depth = 0; shell && depth < 5; depth += 1, shell = shell.parentElement) {
    if (shell !== mainParent && shell !== mainParent?.parentElement) continue;
    const directRails = [...shell.children].filter((child) => child.matches("aside.app-shell-left-panel"));
    if (directRails.length !== 1) continue;
    const surfaces = [...shell.querySelectorAll(MAIN_SURFACE_SELECTOR)];
    if (surfaces.length === 1 && surfaces[0] === main) return shell;
  }
  return null;
}

/** Codex 26.924 places the task rail and conversation workspace in one row. */
export function qualifiedWorkspaceRowForMain(
  main: Element,
  root: ParentNode = document,
): { row: Element; workspace: Element } | null {
  if (!root.querySelector("[data-app-shell-sidebar-trigger]")) return null;
  const row = main.closest('[data-app-shell-workspace-row="true"]');
  if (!row || row.querySelectorAll(MAIN_SURFACE_SELECTOR).length !== 1) return null;
  const children = [...row.children];
  const rails = children.filter((child) => child.matches("aside.app-shell-left-panel"));
  const workspaces = children.filter((child) => child.hasAttribute("data-app-shell-unified-tab-strip"));
  if (rails.length !== 1 || workspaces.length !== 1) return null;
  const workspace = workspaces[0]!;
  if (!workspace.contains(main) || children.indexOf(rails[0]!) >= children.indexOf(workspace)) return null;
  if (!main.parentElement?.className.includes("MainContentClip")) return null;
  return { row, workspace };
}

export function plausibleThreadId(value: unknown): value is string {
  return typeof value === "string" && THREAD_PATTERN.test(value);
}

export function isTemporaryLocalThreadAlias(value: unknown): value is string {
  return typeof value === "string" &&
    value.startsWith(TEMPORARY_LOCAL_THREAD_PREFIX) &&
    plausibleThreadId(value.slice(TEMPORARY_LOCAL_THREAD_PREFIX.length));
}

function verifiedActiveLocalThreadIds(root: ParentNode): string[] | null {
  const activeElements = [...root.querySelectorAll(ACTIVE_THREAD_MARKER_SELECTOR)];
  if (!activeElements.length) return null;
  const values = activeElements.map((element) => {
    const encoded = element.getAttribute("data-app-action-sidebar-thread-id");
    if (
      element.getAttribute("data-app-action-sidebar-thread-host-id") !== "local" ||
      element.getAttribute("data-app-action-sidebar-thread-kind") !== "local" ||
      !encoded
    ) {
      return null;
    }
    return encoded;
  });
  return values.some((value) => value === null) ? null : values as string[];
}

export function activeLocalThreadId(root: ParentNode = document): string | null {
  const encodedIds = verifiedActiveLocalThreadIds(root);
  if (!encodedIds) return null;
  const values = encodedIds.map((encoded) => {
    if (!encoded.startsWith("local:")) return null;
    const stripped = encoded.slice("local:".length);
    return plausibleThreadId(stripped) ? stripped : null;
  });
  if (values.some((value) => value === null)) return null;
  const distinct = [...new Set(values as string[])];
  return distinct.length === 1 ? distinct[0] ?? null : null;
}

export function activeLocalThreadUsesTemporaryAlias(root: ParentNode = document): boolean {
  const encodedIds = verifiedActiveLocalThreadIds(root);
  if (!encodedIds || encodedIds.some((value) => !isTemporaryLocalThreadAlias(value))) return false;
  return new Set(encodedIds).size === 1;
}

export function annotationConsensusThreadId(
  root: ParentNode = document,
  allowMissingResponses = false,
): string | null {
  const composer = [...root.querySelectorAll(COMPOSER_THREAD_SELECTOR)]
    .map((element) => element.getAttribute("data-above-composer-conversation-id"));
  const responses = [...root.querySelectorAll(RESPONSE_THREAD_SELECTOR)]
    .map((element) => element.getAttribute("data-response-annotation-conversation"));
  if (composer.some((value) => !plausibleThreadId(value)) || responses.some((value) => !plausibleThreadId(value))) return null;
  if (composer.length !== 1 || (!allowMissingResponses && responses.length === 0)) return null;
  const composerIds = [...new Set(composer as string[])];
  const responseIds = [...new Set(responses as string[])];
  if (responseIds.length > 1) return null;
  if (responseIds.length === 1 && composerIds[0] !== responseIds[0]) return null;
  return composerIds[0] ?? null;
}

export const codex26715Adapter: RendererAdapter = Object.freeze({
  id: "codex-runtime-qualified",
  supportsVersion: (_version: string) => true,
  qualifiesRenderer: (root: ParentNode = document) => {
    const mains = root.querySelectorAll(MAIN_SURFACE_SELECTOR);
    const main = mains.length === 1 ? mains[0] : undefined;
    return Boolean(main && (qualifiedAppShellForMain(main, root) || qualifiedWorkspaceRowForMain(main, root)));
  },
  activeThreadId: (root: ParentNode = document) => {
    if (root.querySelector(ACTIVE_THREAD_MARKER_SELECTOR)) {
      return activeLocalThreadId(root) ??
        (activeLocalThreadUsesTemporaryAlias(root) ? annotationConsensusThreadId(root, true) : null);
    }
    return annotationConsensusThreadId(root);
  },
});
