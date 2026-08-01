import type { RendererAdapter } from "./contract";

const THREAD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export const ACTIVE_THREAD_MARKER_SELECTOR = '[data-app-action-sidebar-thread-active="true"]';
export const ACTIVE_LOCAL_THREAD_SELECTOR = '[data-app-action-sidebar-thread-id][data-app-action-sidebar-thread-active="true"]';
export const COMPOSER_THREAD_SELECTOR = "[data-above-composer-conversation-id]";
export const RESPONSE_THREAD_SELECTOR = "[data-response-annotation-conversation]";
export const MAIN_SURFACE_SELECTOR = 'main:is(.main-surface, [data-app-shell-main-surface="default"])';

export function plausibleThreadId(value: unknown): value is string {
  return typeof value === "string" && THREAD_PATTERN.test(value);
}

export function activeLocalThreadId(root: ParentNode = document): string | null {
  const activeElements = [...root.querySelectorAll(ACTIVE_THREAD_MARKER_SELECTOR)];
  if (!activeElements.length) return null;
  const values = activeElements.map((element) => {
    const encoded = element.getAttribute("data-app-action-sidebar-thread-id");
    if (
      element.getAttribute("data-app-action-sidebar-thread-host-id") !== "local" ||
      element.getAttribute("data-app-action-sidebar-thread-kind") !== "local" ||
      !encoded?.startsWith("local:")
    ) {
      return null;
    }
    const stripped = encoded.slice("local:".length);
    return plausibleThreadId(stripped) ? stripped : null;
  });
  if (values.some((value) => value === null)) return null;
  const distinct = [...new Set(values as string[])];
  return distinct.length === 1 ? distinct[0] ?? null : null;
}

export function annotationConsensusThreadId(root: ParentNode = document): string | null {
  const composer = [...root.querySelectorAll(COMPOSER_THREAD_SELECTOR)]
    .map((element) => element.getAttribute("data-above-composer-conversation-id"));
  const responses = [...root.querySelectorAll(RESPONSE_THREAD_SELECTOR)]
    .map((element) => element.getAttribute("data-response-annotation-conversation"));
  if (composer.some((value) => !plausibleThreadId(value)) || responses.some((value) => !plausibleThreadId(value))) return null;
  const composerIds = [...new Set(composer as string[])];
  const responseIds = [...new Set(responses as string[])];
  return composerIds.length === 1 && responseIds.length === 1 && composerIds[0] === responseIds[0] ? composerIds[0] ?? null : null;
}

export const codex26715Adapter: RendererAdapter = Object.freeze({
  id: "codex-26.715-26.727",
  supportsVersion: (version: string) => /^26\.(715|721|727)\./.test(version),
  qualifiesRenderer: (root: ParentNode = document) => {
    const mains = root.querySelectorAll(MAIN_SURFACE_SELECTOR);
    const parent = mains.length === 1 ? mains[0]?.parentElement : null;
    return Boolean(parent?.querySelector(":scope > aside.app-shell-left-panel") && root.querySelector("[data-app-shell-sidebar-trigger]"));
  },
  activeThreadId: (root: ParentNode = document) => {
    if (root.querySelector(ACTIVE_THREAD_MARKER_SELECTOR)) return activeLocalThreadId(root);
    return annotationConsensusThreadId(root);
  },
});
