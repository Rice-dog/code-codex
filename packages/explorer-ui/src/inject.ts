import { getBootstrapConfig } from "./bridge";
import { prepareStartupTransitionHandoff, getEarlyStartupTransition } from "./startup-transition-plugin";
import { reconcileApplicationMenu } from "./application-menu";
import { openRuntimeInformation, observeCodexRuntime } from "./runtime-information";
import { runtimeEvent } from "./runtime-events";
import {
  CodeCodexElement,
  GLOW_HORIZON_BACKGROUND_ATTRIBUTE,
  GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY,
  PARTICLE_BACKGROUND_ATTRIBUTE,
  PARTICLE_BACKGROUND_COLOR_PROPERTY,
  TRANSPARENT_BACKGROUND_ATTRIBUTE,
  TRANSPARENT_BACKGROUND_COLOR_PROPERTY,
} from "./explorer-element";
import {
  codex26715Adapter,
  activePageElements,
  isTemporaryLocalThreadAlias,
  MAIN_SURFACE_SELECTOR,
  plausibleThreadId,
  qualifiedAppShellForMain,
  qualifiedWorkspaceRowForMain,
} from "./adapters/codex-26.715";
import { usesClippedMainLayout } from "./adapters/codex-layout-version";
import { isHomeWorkspaceView } from "./home-view";
import { LOGIN_BACKGROUND_CSS, reconcileLoginBackground } from "./native-login";
import { SURFACE_OPACITY_NATIVE_CSS } from "./surface-opacity";
import {
  clearExplorerDismissalForSession,
  dismissExplorerForSession,
  isExplorerDismissedForSession,
} from "./session-state";

declare const __CODE_CODEX_VERSION__: string;

const UI_VERSION = __CODE_CODEX_VERSION__;
export const EXPLORER_TAG = `code-codex-v${UI_VERSION.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
const DISMISS_EVENT = "code-codex:dismiss";
const RESELECTION_LISTENER_STATE = Symbol.for("code-codex:reselection-listener:v1");
const SHELL_LAYOUT_STYLE_SELECTOR = 'style[data-code-codex-shell-layout="codex-26.715"]';
const PARTICLE_BACKGROUND_STYLE_SELECTOR = 'style[data-code-codex-particle-background="v1"]';
const GLOW_HORIZON_BACKGROUND_STYLE_SELECTOR = 'style[data-code-codex-glow-horizon-background="v1"]';
const TRANSPARENT_BACKGROUND_STYLE_SELECTOR = 'style[data-code-codex-transparent-background="v1"]';
const OWNED_EXPLORER_SELECTOR = '[data-code-codex-owned="true"]';
// New page surfaces add a second translucent sidebar, opaque workspace
// pseudo-surface and gradient fades. Keep one mask on each outer surface.
const PAGE_SURFACE_BACKGROUND_CSS = `
html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) [data-app-shell-page-surface="true"] :is(
  .sidebar-navigation,
  [data-app-shell-main-content-top-fade] [class*="MainContentTopFade"],
  [data-thread-scroll-footer="true"],
  [data-thread-scroll-footer="true"] > .pointer-events-none.bg-surface
) {
  background-color: transparent !important;
  background-image: none !important;
}
html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) [data-app-shell-page-surface="true"] [class*="WorkspaceContent"]::before {
  background-color: transparent !important;
  background-image: none !important;
}
`;
const CURRENT_LAYOUT_EXPLORER_SELECTOR = `${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-mount-strategy="known:workspace-row"]`;
const CURRENT_LAYOUT_HEADER_LEFT_PROPERTY = "--code-codex-current-layout-header-left";
const SHELL_LAYOUT_CSS = `
/* The new page shell keeps the conversation title in a fixed body header,
 * outside the flex row that our file tree widens. Shift that header by the
 * measured panel width; the legacy title lives inside main and is untouched. */
html:has(${CURRENT_LAYOUT_EXPLORER_SELECTOR}:not([data-home-view-hidden])) header:has([data-app-shell-titlebar-content]):not([data-app-shell-active-page="false"] *) {
  left: var(${CURRENT_LAYOUT_HEADER_LEFT_PROPERTY}) !important;
}

/* The row begins above the native sidebar and conversation surface by 8px. */
${CURRENT_LAYOUT_EXPLORER_SELECTOR} {
  margin-top: 8px;
  height: calc(100% - 8px) !important;
  min-height: 0;
}

/* Cached pages can mount while Chromium pauses their animation timeline.
 * Keep the inline tree at its flex position instead of leaving it at the
 * entrance animation's translated, transparent first frame. */
[data-app-shell-workspace-row="true"]:has(> [data-app-shell-active-page]) > ${CURRENT_LAYOUT_EXPLORER_SELECTOR} {
  animation: none !important;
}

html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) body ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-collapsed="true"] + ${MAIN_SURFACE_SELECTOR} {
  border-left-color: transparent !important;
  background-clip: border-box !important;
}

html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) body ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-collapsed="true"][data-mount-strategy="known:main-content-clip"] + :has(> ${MAIN_SURFACE_SELECTOR}) > ${MAIN_SURFACE_SELECTOR} {
  border-left-color: transparent !important;
  background-clip: border-box !important;
}

html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) body ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-collapsed="true"][data-mount-strategy="known:workspace-row"] + :has(${MAIN_SURFACE_SELECTOR}) ${MAIN_SURFACE_SELECTOR} {
  border-left-color: transparent !important;
  background-clip: border-box !important;
}

${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-mount-strategy="known:main.main-surface"] + ${MAIN_SURFACE_SELECTOR} > header[data-app-shell-header-edge-scroll] {
  position: absolute !important;
  top: 0 !important;
  right: 0 !important;
  left: 0 !important;
  width: auto !important;
}

@container thread-content (min-width: 600px) {
  ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + ${MAIN_SURFACE_SELECTOR} .thread-scroll-container[data-app-action-timeline-scroll] > div > [data-mcp-app-portal-target="true"],
  ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + ${MAIN_SURFACE_SELECTOR} .thread-scroll-container[data-app-action-timeline-scroll] [data-pip-obstacle="thread-footer"] {
    max-width: min(var(--thread-content-max-width), calc(100% - 100px)) !important;
  }
}
`;
const TRANSPARENT_BACKGROUND_CSS = `
html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] {
  background-color: var(${TRANSPARENT_BACKGROUND_COLOR_PROPERTY}) !important;
}

html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body,
html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body :where(
  div,
  main,
  aside,
  section,
  article,
  header,
  footer,
  nav,
  form,
  dialog,
  ul,
  ol,
  li,
  button,
  input,
  textarea,
  select
):not([role="img"]):not([data-icon]):not([class*="icon" i]) {
  background-color: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body :is(
  [class*="bg-gradient-to-t"],
  [class*="MainContentTopFade"]
) {
  background-image: none !important;
}
`;
const PARTICLE_BACKGROUND_CSS = `
html[${PARTICLE_BACKGROUND_ATTRIBUTE}] {
  background-color: var(${PARTICLE_BACKGROUND_COLOR_PROPERTY}, #000) !important;
  --code-codex-particle-ui-surface: rgba(11, 12, 15, .58);
  --code-codex-particle-ui-surface-strong: rgba(16, 17, 20, .66);
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body {
  isolation: isolate;
  background-color: transparent !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
) {
  background-color: var(--code-codex-particle-ui-surface) !important;
}

/*
 * Codex renders Settings in the same app-shell surface, but its Settings
 * route is a separate full-page panel. Keep the conversation surface's
 * normal translucent treatment while allowing the Settings page itself to
 * show the particle layer through it. The focus-area and utility-class
 * markers are emitted by Codex's Settings shell; avoid depending on hashed
 * class names such as MainContentSurface_*.
 */
html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
):has(
  [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"]
) {
  background-color: transparent !important;
  background-image: none !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
) [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"] {
  background-color: transparent !important;
  background-image: none !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body :is(
  aside.app-shell-left-panel,
  aside[data-testid="app-shell-floating-left-panel"].bg-surface,
  aside[data-app-shell-focus-area="right-panel"]
) {
  background-color: var(--code-codex-particle-ui-surface-strong) !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body :is(
  aside[data-app-shell-focus-area="right-panel"] .bg-surface,
  [data-app-shell-header-edge-scroll],
  .thread-scroll-container[data-app-action-timeline-scroll]
) {
  background-color: transparent !important;
}

/* Project conversations place the composer fade in the thread scroll content,
 * beside the footer rather than inside it. Cover both native layouts. */
html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body .thread-scroll-container[data-app-action-timeline-scroll] [class*="bg-gradient-to-t"],
html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body [data-thread-scroll-footer="true"] [class*="bg-gradient-to-t"],
html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body [data-above-composer-portal] [class*="bg-gradient-to-t"] {
  background-image: none !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"] {
  position: relative !important;
  z-index: 3 !important;
  opacity: 1 !important;
  visibility: visible !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] body ${OWNED_EXPLORER_SELECTOR}[data-placement="drawer"] {
  z-index: 2147483000 !important;
  opacity: 1 !important;
  visibility: visible !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] [data-code-codex-particle-layer] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background: var(${PARTICLE_BACKGROUND_COLOR_PROPERTY}, #000);
  contain: strict;
  overflow: hidden !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] [data-code-codex-particle-layer] > :is(
  .code-codex-particle-source,
  .code-codex-particle-canvas
) {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] .code-codex-particle-source {
  object-fit: contain !important;
  filter: grayscale(1) !important;
  user-select: none !important;
  will-change: opacity, transform;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] .code-codex-particle-canvas {
  z-index: 2 !important;
}

html[${PARTICLE_BACKGROUND_ATTRIBUTE}] .code-codex-black-hole-canvas[hidden] {
  display: none !important;
}
`;

// Glow Horizon uses the same translucent Codex shell treatment as the other
// dark appearance backgrounds, but keeps its own full-window presentation
// attribute and layer selector so the three plugins never interfere with one
// another's teardown.
const GLOW_HORIZON_BACKGROUND_CSS = `
html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] {
  background-color: var(${GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY}, #050507) !important;
  --code-codex-particle-ui-surface: rgba(11, 12, 15, .58);
  --code-codex-particle-ui-surface-strong: rgba(16, 17, 20, .66);
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body {
  isolation: isolate;
  background-color: transparent !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
) {
  background-color: var(--code-codex-particle-ui-surface) !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
):has(
  [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"]
) {
  background-color: transparent !important;
  background-image: none !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
) [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"] {
  background-color: transparent !important;
  background-image: none !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body :is(
  aside.app-shell-left-panel,
  aside[data-testid="app-shell-floating-left-panel"].bg-surface,
  aside[data-app-shell-focus-area="right-panel"]
) {
  background-color: var(--code-codex-particle-ui-surface-strong) !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body :is(
  aside[data-app-shell-focus-area="right-panel"] .bg-surface,
  [data-app-shell-header-edge-scroll],
  .thread-scroll-container[data-app-action-timeline-scroll]
) {
  background-color: transparent !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body .thread-scroll-container[data-app-action-timeline-scroll] [class*="bg-gradient-to-t"],
html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body [data-thread-scroll-footer="true"] [class*="bg-gradient-to-t"],
html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body [data-above-composer-portal] [class*="bg-gradient-to-t"] {
  background-image: none !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body ${OWNED_EXPLORER_SELECTOR}[data-placement="inline"] {
  position: relative !important;
  z-index: 3 !important;
  opacity: 1 !important;
  visibility: visible !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] body ${OWNED_EXPLORER_SELECTOR}[data-placement="drawer"] {
  z-index: 2147483000 !important;
  opacity: 1 !important;
  visibility: visible !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] [data-code-codex-glow-horizon-layer] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: -1 !important;
  pointer-events: none !important;
  background: var(${GLOW_HORIZON_BACKGROUND_COLOR_PROPERTY}, #050507);
  contain: strict;
  overflow: hidden !important;
}

html[${GLOW_HORIZON_BACKGROUND_ATTRIBUTE}] [data-code-codex-glow-horizon-layer] > .code-codex-glow-horizon-horizon {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none !important;
}
`;

let remountObserver: MutationObserver | undefined;
let remountFrame: number | undefined;
let remountEnabled = true;
let dismissListenerInstalled = false;

function versionParts(version: string): number[] {
  return version.split(".").map((part) => {
    const match = /^\d+/.exec(part);
    return match ? Number.parseInt(match[0], 10) : 0;
  });
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function claimRuntimeOwnership(): boolean {
  const current = window.__codeCodexRuntimeOwner;
  if (current && compareVersions(current.version, UI_VERSION) > 0) return false;
  window.__codeCodexRuntimeOwner = {
    version: UI_VERSION,
    tagName: EXPLORER_TAG,
    inject: injectExplorer,
  };
  return true;
}

function removeSupersededExplorers(): void {
  for (const explorer of document.querySelectorAll<HTMLElement>(OWNED_EXPLORER_SELECTOR)) {
    if (explorer.localName !== EXPLORER_TAG) explorer.remove();
  }
}

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
    if (current.getAttribute("data-app-shell-active-page") === "false" ||
      (current as HTMLElement).hidden || style.display === "none" || style.visibility === "hidden") return false;
    current = current.parentElement;
  }
  return true;
}

function qualifiedMainSurface(): HTMLElement | null {
  const mains = activePageElements<HTMLElement>(document, MAIN_SURFACE_SELECTOR);
  if (mains.length !== 1 || !codex26715Adapter.qualifiesRenderer(document)) return null;
  const main = mains[0];
  if (!main || !isVisibleMount(main)) return null;
  return main;
}

function stableInlineMount(mainSurface: HTMLElement | null, codexVersion: string | undefined): MountPoint | null {
  const explicit = document.querySelector<HTMLElement>("[data-code-codex-mount]");
  if (explicit && isVisibleMount(explicit)) {
    return { parent: explicit, before: null, placement: "inline", strategy: "declared-slot", mainSurface };
  }

  const verifiedMain = mainSurface;
  if (verifiedMain) {
    if (usesClippedMainLayout(codexVersion)) {
      const current = qualifiedWorkspaceRowForMain(verifiedMain, document);
      if (!current || !isVisibleMount(current.row) || !isVisibleMount(current.workspace)) return null;
      return {
        parent: current.row,
        before: current.workspace,
        placement: "inline",
        strategy: "known:workspace-row",
        mainSurface,
      };
    }
    const parent = verifiedMain.parentElement;
    const verifiedShell = qualifiedAppShellForMain(verifiedMain, document);
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
  if (!document.body || !isHomeWorkspaceView()) return null;
  const bootstrap = getBootstrapConfig();
  const mainSurface = qualifiedMainSurface();
  if (!bootstrap.forceDrawer && window.innerWidth > 820) {
    const inline = stableInlineMount(mainSurface, bootstrap.codexVersion ?? bootstrap.version);
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

let currentLayoutObservedExplorer: CodeCodexElement | null = null;
let currentLayoutWidthObserver: ResizeObserver | null = null;

function updateCurrentLayoutHeader(explorer: CodeCodexElement): void {
  const main = qualifiedMainSurface();
  if (!explorer.isConnected || explorer.hasAttribute("data-home-view-hidden") || !main) return;
  document.documentElement.style.setProperty(CURRENT_LAYOUT_HEADER_LEFT_PROPERTY, `${main.getBoundingClientRect().left}px`);
}

function reconcileCurrentLayoutHeader(explorer: CodeCodexElement | null, strategy: string): void {
  if (!explorer || strategy !== "known:workspace-row") {
    currentLayoutWidthObserver?.disconnect();
    currentLayoutWidthObserver = null;
    currentLayoutObservedExplorer = null;
    document.documentElement.style.removeProperty(CURRENT_LAYOUT_HEADER_LEFT_PROPERTY);
    return;
  }
  if (currentLayoutObservedExplorer === explorer) {
    updateCurrentLayoutHeader(explorer);
    return;
  }
  currentLayoutWidthObserver?.disconnect();
  currentLayoutObservedExplorer = explorer;
  const update = () => {
    updateCurrentLayoutHeader(explorer);
  };
  currentLayoutWidthObserver = new ResizeObserver(update);
  currentLayoutWidthObserver.observe(explorer);
  const sidebar = explorer.parentElement?.querySelector<HTMLElement>(":scope > aside.app-shell-left-panel");
  if (sidebar) currentLayoutWidthObserver.observe(sidebar);
  update();
}

function installTransparentBackgroundStyle(): void {
  let style = document.querySelector<HTMLStyleElement>(TRANSPARENT_BACKGROUND_STYLE_SELECTOR);
  if (!style) {
    style = document.createElement("style");
    style.dataset.codeCodexTransparentBackground = "v1";
    (document.head ?? document.documentElement).append(style);
  }
  if (style.textContent !== TRANSPARENT_BACKGROUND_CSS) style.textContent = TRANSPARENT_BACKGROUND_CSS;
}

function installParticleBackgroundStyle(): void {
  let style = document.querySelector<HTMLStyleElement>(PARTICLE_BACKGROUND_STYLE_SELECTOR);
  if (!style) {
    style = document.createElement("style");
    style.dataset.codeCodexParticleBackground = "v1";
    (document.head ?? document.documentElement).append(style);
  }
  const css = PARTICLE_BACKGROUND_CSS + PAGE_SURFACE_BACKGROUND_CSS + LOGIN_BACKGROUND_CSS + SURFACE_OPACITY_NATIVE_CSS;
  if (style.textContent !== css) style.textContent = css;
}

function installGlowHorizonBackgroundStyle(): void {
  let style = document.querySelector<HTMLStyleElement>(GLOW_HORIZON_BACKGROUND_STYLE_SELECTOR);
  if (!style) {
    style = document.createElement("style");
    style.dataset.codeCodexGlowHorizonBackground = "v1";
    (document.head ?? document.documentElement).append(style);
  }
  const css = GLOW_HORIZON_BACKGROUND_CSS + PAGE_SURFACE_BACKGROUND_CSS + LOGIN_BACKGROUND_CSS + SURFACE_OPACITY_NATIVE_CSS;
  if (style.textContent !== css) style.textContent = css;
}

function revealExplorer(): CodeCodexElement | null {
  if (sessionDismissed()) clearExplorerDismissalForSession();
  remountEnabled = true;
  installRemountObserver();
  const explorer = injectExplorer();
  if (isHomeWorkspaceView() && explorer?.isConnected && explorer.dataset.collapsed === "true") explorer.collapse(false);
  return explorer;
}

const applicationMenuActions = {
  openRuntimeInformation: () => { void openRuntimeInformation(); },
  isExplorerVisible: () => {
    const explorer = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
    return !sessionDismissed() && Boolean(explorer?.isConnected && !explorer.hasAttribute("data-home-view-hidden") && explorer.dataset.collapsed !== "true");
  },
  toggleExplorer: () => {
    runtimeEvent("renderer", "file tree", "toggle requested");
    if (!isHomeWorkspaceView()) return;
    const explorer = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
    if (sessionDismissed() || !explorer?.isConnected) {
      revealExplorer();
    } else {
      explorer.collapse(explorer.dataset.collapsed !== "true");
    }
  },
  openPreviewMarket: () => {
    const explorer = revealExplorer();
    if (explorer?.isConnected && isHomeWorkspaceView()) {
      requestAnimationFrame(() => {
        if (explorer.isConnected && isHomeWorkspaceView()) explorer.openPreviewMarket();
      });
    }
  },
  checkForUpdates: () => {
    const explorer = revealExplorer();
    if (explorer?.isConnected && isHomeWorkspaceView()) {
      requestAnimationFrame(() => {
        if (explorer.isConnected && isHomeWorkspaceView()) explorer.checkForUpdates();
      });
    }
  },
};

export function injectExplorer(): CodeCodexElement | null {
  if (document.body) observeCodexRuntime();
  reconcileLoginBackground();
  reconcileApplicationMenu(applicationMenuActions);
  installTransparentBackgroundStyle();
  installParticleBackgroundStyle();
  installGlowHorizonBackgroundStyle();
  const existing = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
  if (sessionDismissed()) return existing;
  const homeView = isHomeWorkspaceView();
  existing?.setHomeViewActive(homeView);
  if (!homeView) {
    reconcileCurrentLayoutHeader(existing, "");
    if (existing || !document.body) return existing;
    // The hidden host restores saved background controllers even when the
    // application starts at sign-in. It must never create a login drawer.
    if (!customElements.get(EXPLORER_TAG)) customElements.define(EXPLORER_TAG, CodeCodexElement);
    const backgroundHost = document.createElement(EXPLORER_TAG) as CodeCodexElement;
    backgroundHost.reconnectNative(getBootstrapConfig());
    backgroundHost.dataset.codeCodexOwned = "true";
    backgroundHost.setHomeViewActive(false);
    if (!backgroundHost.isConnected) document.body.append(backgroundHost);
    return backgroundHost;
  }
  const mount = chooseMount();
  if (!mount) return existing;
  if (mount.strategy === "known:main.main-surface" || mount.strategy === "known:workspace-row") installShellLayoutStyle();

  if (existing) {
    const responsiveDrawer =
      mount.placement === "drawer" &&
      existing.dataset.placement === "drawer" &&
      existing.dataset.mountStrategy !== "safe-drawer";
    if (!responsiveDrawer) {
      existing.reconcileMount(mount.parent, mount.before, mount.placement, mount.strategy);
    }
    existing.reconcileMainPreview(mount.mainSurface);
    reconcileCurrentLayoutHeader(existing, mount.strategy);
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
  reconcileCurrentLayoutHeader(explorer, mount.strategy);
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
  return plausibleThreadId(encoded.slice("local:".length)) || isTemporaryLocalThreadAlias(encoded);
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
  remountObserver.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["data-app-shell-active-page", "aria-current", "data-sidebar-destination"],
  });
  if (!dismissListenerInstalled) {
    dismissListenerInstalled = true;
    window.addEventListener(DISMISS_EVENT, disableRemount);
  }
}

export function installInjector(): void {
  if (!claimRuntimeOwnership()) return;
  const startupSplashActive = getBootstrapConfig().startupSplashActive === true;
  prepareStartupTransitionHandoff(startupSplashActive);
  window.__codeCodexInject = injectExplorer;
  installTransparentBackgroundStyle();
  installParticleBackgroundStyle();
  installGlowHorizonBackgroundStyle();
  installReselectionListener();
  const start = () => {
    const startupTransitionPromise = getEarlyStartupTransition();
    removeSupersededExplorers();
    const existing = document.querySelector<CodeCodexElement>(EXPLORER_TAG);
    const explorer = injectExplorer();
    if (existing && explorer === existing && !sessionDismissed()) {
      existing.reconnectNative(getBootstrapConfig());
    }
    installRemountObserver();
    void startupTransitionPromise.then((startupTransition) => {
      if (!startupTransition) return;
      const revealWhenReady = () => {
        if (document.querySelector(MAIN_SURFACE_SELECTOR)) {
          requestAnimationFrame(() => requestAnimationFrame(() => startupTransition.signalReady()));
        } else {
          const observer = new MutationObserver(() => {
            if (!document.querySelector(MAIN_SURFACE_SELECTOR)) return;
            observer.disconnect();
            requestAnimationFrame(() => requestAnimationFrame(() => startupTransition.signalReady()));
          });
          observer.observe(document.body, { childList: true, subtree: true });
          // Readiness may arrive after a slow login or cold start. Keep observing until it does.
        }
      };
      revealWhenReady();
    });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
