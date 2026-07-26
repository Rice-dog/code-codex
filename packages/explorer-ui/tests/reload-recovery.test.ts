import { describe, expect, it, vi } from "vitest";
import type { BridgeRequest } from "../src/types";

const THREAD_A = "33333333-3333-4333-8333-333333333333";
const THREAD_B = "44444444-4444-4444-8444-444444444444";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => (resolve = next));
  return { promise, resolve };
}

function shell(threadId: string): string {
  return `
    <button data-app-shell-sidebar-trigger></button>
    <div class="relative isolate flex">
      <aside class="app-shell-left-panel">
        <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
          data-app-action-sidebar-thread-id="local:${threadId}" data-app-action-sidebar-thread-kind="local"></div>
      </aside>
      <main class="main-surface"></main>
    </div>`;
}

describe("renderer reload recovery", () => {
  it("does not retry a transient context request after the active task generation changes", async () => {
    vi.resetModules();
    const requests: BridgeRequest[] = [];
    let threadAAttempts = 0;
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "stale-retry-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codexLiveExplorer = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          const threadId = String(message.params.threadId);
          if (threadId === THREAD_A) {
            threadAAttempts += 1;
            return { id: message.id, ok: false, error: { code: "TIMEOUT", message: "Old document request was dropped." } };
          }
          return { threadId, projectName: "Current task", rootName: "current-task", compatible: true };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "current.ts", relativePath: "current.ts", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = shell(THREAD_A);

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    await vi.waitFor(() => expect(threadAAttempts).toBe(1));

    const activeRow = document.querySelector<HTMLElement>("[data-app-action-sidebar-thread-id]");
    activeRow?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await vi.waitFor(() => expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Current task"));
    await new Promise((resolve) => setTimeout(resolve, 240));

    expect(threadAAttempts).toBe(1);
    expect(requests.filter((request) => request.method === "explorer.context" && request.params.threadId === THREAD_B)).toHaveLength(1);
    expect(requests.some((request) => request.method === "explorer.watch.stop")).toBe(false);
  });

  it("does not resume an old startup while the reconnected bridge settings are pending", async () => {
    vi.resetModules();
    const oldSettings = deferred<{ panelWidth: number; collapsed: boolean }>();
    const oldRequests: BridgeRequest[] = [];
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "old-settings-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codexLiveExplorer = {
      request(message) {
        oldRequests.push(message);
        if (message.method === "explorer.settings.get") return oldSettings.promise;
        throw new Error(`Old startup escaped settings: ${message.method}`);
      },
    };
    document.body.innerHTML = shell(THREAD_A);

    const oldBundle = await import("../src/inject");
    oldBundle.installInjector();
    await vi.waitFor(() => expect(oldRequests.map((request) => request.method)).toEqual(["explorer.settings.get"]));
    const explorer = document.querySelector<HTMLElement>("codex-live-explorer");

    const newSettings = deferred<{ panelWidth: number; collapsed: boolean }>();
    const newRequests: BridgeRequest[] = [];
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "new-settings-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codexLiveExplorer = {
      request(message) {
        newRequests.push(message);
        if (message.method === "explorer.settings.get") return newSettings.promise;
        if (message.method === "explorer.context") {
          return { threadId: String(message.params.threadId), projectName: "New startup", rootName: "new-startup", compatible: true };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "new.ts", relativePath: "new.ts", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    vi.resetModules();
    const newBundle = await import("../src/inject");
    newBundle.installInjector();

    await vi.waitFor(() => expect(newRequests.map((request) => request.method)).toEqual(["explorer.settings.get"]));
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(newRequests.map((request) => request.method)).toEqual(["explorer.settings.get"]);

    newSettings.resolve({ panelWidth: 280, collapsed: false });
    await vi.waitFor(() => {
      expect(document.querySelector("codex-live-explorer")).toBe(explorer);
      expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("New startup");
      expect(explorer?.shadowRoot?.querySelector('[data-path="new.ts"]')).not.toBeNull();
    });
    oldSettings.resolve({ panelWidth: 470, collapsed: false });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(oldRequests.map((request) => request.method)).toEqual(["explorer.settings.get"]);
    expect(oldRequests.every((request) => request.token === "old-settings-secret")).toBe(true);
    expect(newRequests.every((request) => request.token === "new-settings-secret")).toBe(true);
    expect(explorer?.style.getPropertyValue("--cle-width")).toBe("280px");
  });

  it("reconnects an existing panel once per bundle evaluation and keeps an explicit dismissal", async () => {
    vi.resetModules();
    const initialRequests: BridgeRequest[] = [];
    let initialLists = 0;
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "old-reattach-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codexLiveExplorer = {
      request(message) {
        initialRequests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: String(message.params.threadId), projectName: "Before reconnect", rootName: "before", compatible: true };
        }
        if (message.method === "explorer.list") {
          initialLists += 1;
          if (initialLists > 1) return new Promise(() => undefined);
          return { entries: [{ name: "before.txt", relativePath: "before.txt", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = shell(THREAD_A);

    const firstBundle = await import("../src/inject");
    firstBundle.installInjector();
    const explorer = document.querySelector("codex-live-explorer");
    await vi.waitFor(() => expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Before reconnect"));

    explorer?.shadowRoot?.querySelector<HTMLButtonElement>(".refresh")?.click();
    await vi.waitFor(() => expect(initialLists).toBe(2));

    const reattachedRequests: BridgeRequest[] = [];
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "new-reattach-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codexLiveExplorer = {
      request(message) {
        reattachedRequests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: String(message.params.threadId), projectName: "After reconnect", rootName: "after", compatible: true };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "after.txt", relativePath: "after.txt", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    vi.resetModules();
    const reattachedBundle = await import("../src/inject");
    reattachedBundle.installInjector();
    await vi.waitFor(() => {
      expect(document.querySelector("codex-live-explorer")).toBe(explorer);
      expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("After reconnect");
      expect(explorer?.shadowRoot?.querySelector('[data-path="after.txt"]')).not.toBeNull();
    });

    reattachedBundle.installInjector();
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(reattachedRequests.filter((request) => request.method === "explorer.context")).toHaveLength(1);
    expect(reattachedRequests.some((request) => request.method === "explorer.watch.stop")).toBe(false);
    expect(initialRequests.every((request) => request.token === "old-reattach-secret")).toBe(true);
    expect(reattachedRequests.every((request) => request.token === "new-reattach-secret")).toBe(true);
    expect(reattachedRequests.some((request) => request.token === "old-reattach-secret")).toBe(false);

    explorer?.shadowRoot?.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("codex-live-explorer")).toBeNull());

    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "post-dismiss-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    vi.resetModules();
    const postDismissBundle = await import("../src/inject");
    postDismissBundle.installInjector();
    document.body.append(document.createElement("span"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.querySelector("codex-live-explorer")).toBeNull();
  });
});
