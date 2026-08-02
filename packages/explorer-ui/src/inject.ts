import { getBootstrapConfig } from "./bridge";
import { CodeCodexElement } from "./explorer-element";
import { codex26715Adapter, MAIN_SURFACE_SELECTOR, plausibleThreadId } from "./adapters/codex-26.715";
import {
  clearExplorerDismissalForSession,
  dismissExplorerForSession,
  isExplorerDismissedForSession,
} from "./session-state";

export const EXPLORER_TAG = "code-codex";
const DISMISS_EVENT = "code-codex:dismiss";
const RESELECTION_LISTENER_STATE = Symbol.for("code-codex:reselection-listener:v1");
const SHELL_LAYOUT_STYLE_SELECTOR = 'style[data-code-codex-shell-layout="codex-26.715"]';
const SHELL_LAYOUT_CSS = `
code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"] + ${MAIN_SURFACE_SELECTOR} > header[data-app-shell-header-edge-scroll] {
  position: absolute !important;
  top: 0 !important;
  right: 0 !important;
  left: 0 !important;
  width: auto !important;
}

@container thread-content (min-width: 600px) {
  code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + ${MAIN_SURFACE_SELECTOR} .thread-scroll-container[data-app-action-timeline-scroll] > div > [data-mcp-app-portal-target="true"],
  code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + ${MAIN_SURFACE_SELECTOR} .thread-scroll-container[data-app-action-timeline-scroll] [data-pip-obstacle="thread-footer"] {
    max-width: min(var(--thread-content-max-width), calc(100% - 100px)) !important;
  }
}
`;

let remountObserver: MutationObserver | undefined;
let remountFrame: number | undefined;
let remountEnabled = !sessionDismissed();
let dismissListenerInstalled = false;

interface MountPoint {
  parent: Element;
  before: Element | null;
  placement: "inline" | "drawer";
  strategy: string;
  mainSurface: HTMLElement | null;
}

interface ReselectionListenerState {
  document: Document;
  listener: (event: MouseEvent) => void;
}

function isVisibleMount(element: Element): boolean {
  let current: Element | null = element;
  while (current && current !== document.documentElement) {
    const style = getComputedStyle(current);
    if ((current as HTMLElement).hidden || style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return true;
}

function qualifiedMainSurface(): HTMLElement | null {
  const mains = [...document.querySelectorAll<HTMLElement>(MAIN_SURFACE_SELECTOR)];
  if (mains.length !== 1 || !codex26715Adapter.qualifiesRenderer(document)) return null;
  const main = mains[0];
  const parent = main?.parentElement;
  if (!main || !parent || !parent.querySelector(":scope > aside.app-shell-left-panel") || !isVisibleMount(main)) return null;
  return main;
}

function stableInlineMount(mainSurface: HTMLElement | null): MountPoint | null {
  const explicit = document.querySelector<HTMLElement>("[data-code-codex-mount]");
  if (explicit && isVisibleMount(explicit)) {
    return { parent: explicit, before: null, placement: "inline", strategy: "declared-slot", mainSurface };
  }

  const verifiedMain = mainSurface;
  if (verifiedMain) {
    const parent = verifiedMain.parentElement;
    const verifiedShell = parent?.querySelector(":scope > aside.app-shell-left-panel");
    if (parent && verifiedShell && isVisibleMount(parent)) {
      return { parent, before: verifiedMain, placement: "inline", strategy: "known:main.main-surface", mainSurface };
    }
    return null;
  }

  const mainSelectors = [
    '[data-testid="conversation-pane"]',
    '[data-testid="thread-view"]',
    '[data-testid="conversation-view"]',
    "main[data-codex-main]",
  ];
  for (const selector of mainSelectors) {
    const main = document.querySelector<HTMLElement>(selector);
    const parent = main?.parentElement;
    if (main && parent && parent !== document.body && isVisibleMount(parent)) {
      return { parent, before: main, placement: "inline", strategy: `known:${selector}`, mainSurface };
    }
  }

  const main = document.querySelector<HTMLElement>('main, [role="main"]');
  const parent = main?.parentElement;
  if (main && parent && parent !== document.body) {
    const display = getComputedStyle(parent).display;
    const hasTaskRail = [...parent.children].some(
      (child) => child !== main && (child.matches("aside, nav") || child.getAttribute("aria-label")?.toLocaleLowerCase().includes("task")),
    );
    if ((display === "flex" || display === "grid") && hasTaskRail) {
      return { parent, before: main, placement: "inline", strategy: "verified-layout", mainSurface };
    }
  }
  return null;
}

function chooseMount(): MountPoint | null {
  if (!document.body) return null;
  const bootstrap = getBootstrapConfig();
  const mainSurface = qualifiedMainSurface();
  if (!bootstrap.forceDrawer && window.innerWidth > 820) {
    const inline = stableInlineMount(mainSurface);
    if (inline) return inline;
  }
  return { parent: document.body, before: null, placement: "drawer", strategy: "safe-drawer", mainSurface };
}

function installShellLayoutStyle(): void {
  let style = document.querySelector<HTMLStyleElement>(SHELL_LAYOUT_STYLE_SELECTOR);
  if (!style) {
    style = document.createElement("style");
    style.dataset.codeCodexShellLayout = "codex-26.715";
    (document.head ?? document.documentElement).append(style);
  }
  if (style.textContent !== SHELL_LAYOUT_CSS) style.textContent = SHELL_LAYOUT_CSS;
}

export function injectExplorer(): CodeCodexElement | null {
  const existing = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
  if (sessionDismissed()) return existing;
  const mount = chooseMount();
  if (!mount) return existing;
  if (mount.strategy === "known:main.main-surface") installShellLayoutStyle();

  if (existing) {
    const responsiveDrawer =
      mount.placement === "drawer" &&
      existing.dataset.placement === "drawer" &&
      existing.dataset.mountStrategy !== "safe-drawer";
    if (!responsiveDrawer) {
      existing.reconcileMount(mount.parent, mount.before, mount.placement, mount.strategy);
    }
    existing.reconcileMainPreview(mount.mainSurface);
    return existing;
  }

  if (!customElements.get(EXPLORER_TAG)) customElements.define(EXPLORER_TAG, CodeCodexElement);
  const explorer = document.createElement(EXPLORER_TAG) as CodeCodexElement;
  explorer.reconnectNative(getBootstrapConfig());
  explorer.dataset.placement = mount.placement;
  explorer.dataset.mountStrategy = mount.strategy;
  explorer.dataset.codeCodexOwned = "true";
  if (mount.before) mount.parent.insertBefore(explorer, mount.before);
  else mount.parent.append(explorer);
  explorer.reconcileMainPreview(mount.mainSurface);
  return explorer;
}

function retireRemountObserver(): void {
  remountObserver?.disconnect();
  remountObserver = undefined;
  if (remountFrame !== undefined) cancelAnimationFrame(remountFrame);
  remountFrame = undefined;
  if (dismissListenerInstalled) {
    window.removeEventListener(DISMISS_EVENT, disableRemount);
    dismissListenerInstalled = false;
  }
}

function disableRemount(): void {
  dismissExplorerForSession();
  remountEnabled = false;
  retireRemountObserver();
}

function sessionDismissed(): boolean {
  return isExplorerDismissedForSession();
}

function isValidatedLocalSidebarClick(event: MouseEvent): boolean {
  if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;

  const sidebar = target.closest("aside.app-shell-left-panel");
  if (!sidebar?.isConnected) return false;
  const row = target.closest<HTMLElement>("[data-app-action-sidebar-thread-id]");
  if (!row || !sidebar.contains(row)) return false;
  const nestedControl = target.closest("button, a, input, select, textarea, [role='button'], [role^='menuitem']");
  if (nestedControl && nestedControl !== row) return false;

  const encoded = row.getAttribute("data-app-action-sidebar-thread-id");
  if (
    row.getAttribute("data-app-action-sidebar-thread-host-id") !== "local" ||
    row.getAttribute("data-app-action-sidebar-thread-kind") !== "local" ||
    !encoded?.startsWith("local:")
  ) {
    return false;
  }
  return plausibleThreadId(encoded.slice("local:".length));
}

function restoreAfterConversationReselection(event: MouseEvent): void {
  if (!sessionDismissed() || !isValidatedLocalSidebarClick(event)) return;
  clearExplorerDismissalForSession();
  remountEnabled = true;
  installRemountObserver();
  scheduleMountReconciliation();
}

function installReselectionListener(): void {
  const state = window as unknown as Record<PropertyKey, unknown>;
  const previous = state[RESELECTION_LISTENER_STATE] as ReselectionListenerState | undefined;
  try {
    previous?.document.removeEventListener("click", previous.listener, true);
  } catch {
    // The ownership check below also makes an unremovable stale listener inert.
  }

  let next: ReselectionListenerState;
  const listener = (event: MouseEvent) => {
    if (state[RESELECTION_LISTENER_STATE] === next) restoreAfterConversationReselection(event);
  };
  next = { document, listener };
  try {
    state[RESELECTION_LISTENER_STATE] = next;
  } catch {
    return;
  }
  if (state[RESELECTION_LISTENER_STATE] !== next) return;
  document.addEventListener("click", next.listener, true);
}

function scheduleMountReconciliation(): void {
  if (remountFrame !== undefined || !remountEnabled) return;
  remountFrame = requestAnimationFrame(() => {
    remountFrame = undefined;
    if (window.__codeCodexInject !== injectExplorer) {
      retireRemountObserver();
      return;
    }
    if (document.body) injectExplorer();
  });
}

function installRemountObserver(): void {
  if (remountObserver || !document.documentElement || !remountEnabled) return;
  remountObserver = new MutationObserver(() => scheduleMountReconciliation());
  remountObserver.observe(document.documentElement, { childList: true, subtree: true });
  if (!dismissListenerInstalled) {
    dismissListenerInstalled = true;
    window.addEventListener(DISMISS_EVENT, disableRemount);
  }
}

export function installInjector(): void {
  window.__codeCodexInject = injectExplorer;
  installReselectionListener();
  const start = () => {
    const existing = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
    const explorer = injectExplorer();
    if (existing && explorer === existing && !sessionDismissed()) {
      existing.reconnectNative(getBootstrapConfig());
    }
    installRemountObserver();
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
