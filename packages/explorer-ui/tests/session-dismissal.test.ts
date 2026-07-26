import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { BridgeRequest } from "../src/types";

const THREAD = "55555555-5555-4555-8555-555555555555";
const OTHER_THREAD = "66666666-6666-4666-8666-666666666666";

function twoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

describe("session dismissal lifetime", () => {
  it("survives fresh renderer realms in one window but not a new Codex window session", async () => {
    vi.resetModules();
    const requests: BridgeRequest[] = [];
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "dismiss-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codeCodex = {
      request(message: BridgeRequest) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: THREAD, projectName: "Dismiss fixture", rootName: "dismiss-fixture", compatible: true };
        }
        if (message.method === "explorer.list") return { entries: [] };
        return { ok: true };
      },
    };
    document.body.innerHTML = `
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD}" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface"></main>
      </div>`;

    const firstBundle = await import("../src/inject");
    firstBundle.installInjector();
    const explorer = document.querySelector<HTMLElement>("code-codex");
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("empty"));
    explorer?.shadowRoot?.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("code-codex")).toBeNull());

    const { isExplorerDismissedForSession, SESSION_DISMISSAL_PREFIX, SESSION_ID_KEY } = await import("../src/session-state");
    const sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`)).toBe("1");
    expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.getItem(sessionStorage.key(index) ?? ""))).not.toContain("dismiss-secret");

    // Same-origin documents under one top-level browsing context share the
    // page-session store. Replacing the iframe gives us a genuinely distinct
    // Window realm and Document instead of another module evaluation.
    const firstFrame = document.createElement("iframe");
    document.body.append(firstFrame);
    const firstRealm = firstFrame.contentWindow;
    expect(firstRealm).not.toBeNull();
    expect(isExplorerDismissedForSession(firstRealm as unknown as Window)).toBe(true);
    firstFrame.remove();

    const reloadedFrame = document.createElement("iframe");
    document.body.append(reloadedFrame);
    const reloadedRealm = reloadedFrame.contentWindow;
    expect(reloadedRealm).not.toBeNull();
    expect(reloadedRealm).not.toBe(firstRealm);
    expect(reloadedRealm?.document).not.toBe(firstRealm?.document);
    expect(isExplorerDismissedForSession(reloadedRealm as unknown as Window)).toBe(true);

    // Remove the realm-local fast path before evaluating a replacement bundle;
    // persistence must come from the guarded sessionStorage record.
    delete (window as unknown as Record<PropertyKey, unknown>)[Symbol.for("code-codex:dismissed")];
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "reload-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    vi.resetModules();
    const reloadedBundle = await import("../src/inject");
    reloadedBundle.installInjector();
    document.body.append(document.createElement("span"));
    await twoAnimationFrames();
    expect(document.querySelector("code-codex")).toBeNull();
    expect(isExplorerDismissedForSession()).toBe(true);

    // A real click on the still-active local row is a deliberate re-selection,
    // even though Codex does not need to change its active-row attributes.
    document.querySelector<HTMLElement>(`[data-app-action-sidebar-thread-id="local:${THREAD}"]`)?.click();
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("code-codex")?.dataset.state).toBe("empty"));
    expect(isExplorerDismissedForSession()).toBe(false);
    expect(sessionStorage.getItem(`${SESSION_DISMISSAL_PREFIX}${sessionId}`)).toBeNull();
    expect(requests.filter((request) => request.method === "explorer.context")).toHaveLength(2);
    expect(requests.filter((request) => request.method === "explorer.context").at(-1)?.token).toBe("reload-secret");

    const require = createRequire(import.meta.url);
    const { JSDOM } = require("jsdom") as {
      JSDOM: new (html: string, options: { url: string }) => { window: Window & { close(): void } };
    };
    const newCodexSession = new JSDOM("<!doctype html><html><body></body></html>", { url: window.location.href });
    try {
      expect(newCodexSession.window.document).not.toBe(document);
      expect(newCodexSession.window.sessionStorage.getItem(SESSION_ID_KEY)).toBeNull();
      expect(isExplorerDismissedForSession(newCodexSession.window)).toBe(false);
      const newSessionId = newCodexSession.window.sessionStorage.getItem(SESSION_ID_KEY);
      expect(newSessionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(newSessionId).not.toBe(sessionId);
      expect(newCodexSession.window.sessionStorage.getItem(`${SESSION_DISMISSAL_PREFIX}${newSessionId}`)).toBeNull();
    } finally {
      newCodexSession.window.close();
    }
  });

  it("restores only from a primary click on a validated local row inside the Codex sidebar", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "validated-click-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codeCodex = {
      request(message: BridgeRequest) {
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: THREAD, projectName: "Click fixture", rootName: "click-fixture", compatible: true };
        }
        if (message.method === "explorer.list") return { entries: [] };
        return { ok: true };
      },
    };
    document.body.innerHTML = `
      <div id="outside" data-app-action-sidebar-thread-host-id="local"
        data-app-action-sidebar-thread-id="local:${OTHER_THREAD}" data-app-action-sidebar-thread-kind="local"></div>
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div id="active-local" role="button" data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD}" data-app-action-sidebar-thread-kind="local">
            <span>Local conversation</span>
            <button id="pin-chat" type="button" aria-label="Pin chat"></button>
            <button id="archive-chat" type="button" aria-label="Archive chat"></button>
          </div>
          <div id="cloud" data-app-action-sidebar-thread-host-id="cloud"
            data-app-action-sidebar-thread-id="cloud:${OTHER_THREAD}" data-app-action-sidebar-thread-kind="cloud"></div>
          <div id="malformed" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:bad" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface"></main>
      </div>`;

    const bundle = await import("../src/inject");
    bundle.installInjector();
    const explorer = document.querySelector<HTMLElement>("code-codex");
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("empty"));
    explorer?.shadowRoot?.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("code-codex")).toBeNull());

    for (const selector of ["#outside", "#cloud", "#malformed", "#pin-chat", "#archive-chat"]) {
      document.querySelector<HTMLElement>(selector)?.click();
      await twoAnimationFrames();
      expect(document.querySelector("code-codex")).toBeNull();
    }
    document.querySelector<HTMLElement>("#active-local")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 1 }),
    );
    await twoAnimationFrames();
    expect(document.querySelector("code-codex")).toBeNull();

    document.querySelector<HTMLElement>("#active-local")?.click();
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("code-codex")?.dataset.state).toBe("empty"));
  });

  it("does not throw when page-session storage is blocked", async () => {
    const {
      SESSION_DISMISSAL_PREFIX,
      SESSION_ID_KEY,
      clearExplorerDismissalForSession,
      dismissExplorerForSession,
      isExplorerDismissedForSession,
    } = await import("../src/session-state");
    const blockedWindow = Object.defineProperty({}, "sessionStorage", {
      configurable: false,
      get() {
        throw new DOMException("Storage is disabled", "SecurityError");
      },
    }) as Window;

    expect(() => dismissExplorerForSession(blockedWindow)).not.toThrow();
    expect(isExplorerDismissedForSession(blockedWindow)).toBe(true);
    expect(() => clearExplorerDismissalForSession(blockedWindow)).not.toThrow();
    expect(isExplorerDismissedForSession(blockedWindow)).toBe(false);

    const freshBlockedWindow = Object.preventExtensions(
      Object.defineProperty({}, "sessionStorage", {
        configurable: false,
        get() {
          throw new DOMException("Storage is disabled", "SecurityError");
        },
      }),
    ) as Window;
    expect(() => dismissExplorerForSession(freshBlockedWindow)).not.toThrow();
    expect(isExplorerDismissedForSession(freshBlockedWindow)).toBe(false);
    expect(() => clearExplorerDismissalForSession(freshBlockedWindow)).not.toThrow();
    expect(isExplorerDismissedForSession(freshBlockedWindow)).toBe(false);

    const values = new Map<string, string>();
    const removalBlockedStorage: Storage = {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key) {
        return values.get(key) ?? null;
      },
      key(index) {
        return [...values.keys()][index] ?? null;
      },
      removeItem() {
        throw new DOMException("Storage is read-only", "SecurityError");
      },
      setItem(key, value) {
        values.set(key, value);
      },
    };
    const removalBlockedWindow = {
      crypto: { randomUUID: () => "77777777-7777-4777-8777-777777777777" },
      sessionStorage: removalBlockedStorage,
    } as unknown as Window;
    dismissExplorerForSession(removalBlockedWindow);
    const removalBlockedSessionId = removalBlockedStorage.getItem(SESSION_ID_KEY);
    expect(removalBlockedStorage.getItem(`${SESSION_DISMISSAL_PREFIX}${removalBlockedSessionId}`)).toBe("1");
    expect(() => clearExplorerDismissalForSession(removalBlockedWindow)).not.toThrow();
    expect(isExplorerDismissedForSession(removalBlockedWindow)).toBe(false);
  });
});
