import { describe, expect, it, vi } from "vitest";
import type { BridgeMessage, BridgeRequest } from "../src/types";

const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => (resolve = next));
  return { promise, resolve };
}

describe("explorer lifecycle and file search", () => {
  it("stops A before loading B, always shows every entry, and clears cloud context", async () => {
    vi.resetModules();
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "lifecycle-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };

    const requests: BridgeRequest[] = [];
    const events: string[] = [];
    const listeners = new Set<(message: BridgeMessage) => void>();
    const blockedBStop = deferred<{ watching: boolean }>();
    const blockedClear = deferred<{ cleared: boolean }>();
    let stopCount = 0;
    let activeThread = "";
    let blockClear = false;
    const settings = { panelWidth: 260, collapsed: false, showHidden: false, showIgnored: false };

    window.__codexLiveExplorer = {
      request(message) {
        requests.push(message);
        const path = typeof message.params.relativePath === "string" ? message.params.relativePath : "";
        if (message.method === "explorer.settings.get") {
          events.push("settings.get");
          return { ...settings };
        }
        if (message.method === "explorer.watch.stop") {
          stopCount += 1;
          events.push(`watch.stop:${stopCount}`);
          if (stopCount === 1) return blockedBStop.promise;
          return { watching: false };
        }
        if (message.method === "explorer.context.clear") {
          events.push("context.clear");
          return blockClear ? blockedClear.promise : { cleared: true };
        }
        if (message.method === "explorer.context") {
          activeThread = String(message.params.threadId);
          events.push(`context:${activeThread}`);
          return {
            threadId: activeThread,
            projectName: activeThread === THREAD_A ? "Project A" : "Project B",
            rootName: activeThread === THREAD_A ? " project a " : "project-b",
            compatible: true,
          };
        }
        if (message.method === "explorer.watch.start") {
          events.push(`watch.start:${activeThread}`);
          return { watching: true };
        }
        if (message.method === "explorer.settings.set") {
          Object.assign(settings, message.params);
          events.push(`settings.set:${settings.showHidden}:${settings.showIgnored}`);
          return { ...settings };
        }
        if (message.method === "explorer.list") {
          events.push(`list:${activeThread}:${path || "root"}`);
          const finishList = (result: { entries: Array<{ name: string; relativePath: string; kind: string }> }) =>
            new Promise<typeof result>((resolve) => setTimeout(() => resolve(result), 4));
          const projectPrefix = activeThread === THREAD_A ? "a" : "b";
          if (path === "src") {
            return finishList({
              entries: [
                { name: "index.ts", relativePath: "src/index.ts", kind: "file" },
                { name: ".generated", relativePath: "src/.generated", kind: "file" },
                { name: "ignored.ts", relativePath: "src/ignored.ts", kind: "file" },
              ],
            });
          }
          return finishList({
            entries: [
              { name: "empty-dir", relativePath: "empty-dir", kind: "directory" },
              { name: "src", relativePath: "src", kind: "directory" },
              { name: `${projectPrefix}.ts`, relativePath: `${projectPrefix}.ts`, kind: "file" },
              { name: ".env", relativePath: ".env", kind: "file" },
              { name: ".config", relativePath: ".config", kind: "directory" },
              { name: ".git", relativePath: ".git", kind: "directory" },
              { name: "dist.js", relativePath: "dist.js", kind: "file" },
            ],
          });
        }
        return { ok: true };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    document.body.innerHTML = `
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD_A}" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface"></main>
      </div>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    const shadow = explorer?.shadowRoot;
    await vi.waitFor(() => expect(shadow?.querySelector(".project-name")?.textContent).toBe("Project A"));
    expect(shadow?.querySelector<HTMLElement>(".root-label")?.hidden).toBe(true);
    expect(shadow?.querySelector<HTMLElement>(".masthead")?.dataset.rootVisible).toBe("false");
    expect(events.slice(0, 4)).toEqual([
      "settings.get",
      `context:${THREAD_A}`,
      `watch.start:${THREAD_A}`,
      `list:${THREAD_A}:root`,
    ]);

    shadow?.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).not.toBeNull());

    shadow?.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).toBeNull());
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("false");

    const fileFilter = shadow?.querySelector<HTMLInputElement>(".file-filter");
    const treeShell = shadow?.querySelector<HTMLElement>(".tree-shell");
    const listEventsBeforeFileFilter = events.filter((event) => event.startsWith("list:")).length;
    if (fileFilter) {
      fileFilter.value = "INDEX.TS";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(shadow?.querySelectorAll(".tree-row")).toHaveLength(2));
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("true");
    await vi.waitFor(() => expect(shadow?.querySelector(".live-region")?.textContent).toBe("1 loaded item matches"));
    expect(events.filter((event) => event.startsWith("list:")).length).toBe(listEventsBeforeFileFilter);

    shadow?.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(shadow?.querySelectorAll(".tree-row")).toHaveLength(1));
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(shadow?.querySelector('[data-path="src/index.ts"]')).toBeNull();

    if (fileFilter) {
      fileFilter.value = "src/index.ts";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).not.toBeNull());
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("true");

    treeShell?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).toBeNull());
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("false");
    treeShell?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).not.toBeNull());
    treeShell?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(treeShell?.getAttribute("aria-activedescendant")).toBe("cle-row-1");

    fileFilter?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).toBeNull());
    expect(shadow?.querySelector('[data-path="src"]')?.getAttribute("aria-expanded")).toBe("false");
    if (fileFilter) {
      fileFilter.value = "empty-dir";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(shadow?.querySelectorAll(".tree-row")).toHaveLength(1));
    const emptyDirectory = shadow?.querySelector('[data-path="empty-dir"]');
    expect(emptyDirectory?.hasAttribute("aria-expanded")).toBe(false);
    expect(emptyDirectory?.querySelector(".twisty")).toBeNull();
    expect(emptyDirectory?.querySelector(".node-icon.directory")).not.toBeNull();
    fileFilter?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (fileFilter) {
      fileFilter.value = "INDEX.TS";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).not.toBeNull());

    const activeRow = document.querySelector<HTMLElement>("[data-app-action-sidebar-thread-id]");
    activeRow?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await vi.waitFor(() => expect(stopCount).toBe(1));
    expect(fileFilter?.value).toBe("");
    expect(explorer?.dataset.state).toBe("loading");
    expect(events).not.toContain(`context:${THREAD_B}`);

    for (const listener of listeners) {
      listener({
        method: "explorer.changed",
        params: { changes: [{ relativePath: "stale-from-a.ts", kind: "added", node: { name: "stale-from-a.ts", relativePath: "stale-from-a.ts", kind: "file" } }] },
      });
    }
    blockedBStop.resolve({ watching: false });
    await vi.waitFor(() => expect(shadow?.querySelector(".project-name")?.textContent).toBe("Project B"));
    expect(shadow?.querySelector<HTMLElement>(".root-label")?.hidden).toBe(false);
    expect(shadow?.querySelector<HTMLElement>(".masthead")?.dataset.rootVisible).toBe("true");
    expect(shadow?.querySelector('[data-path="a.ts"]')).toBeNull();
    expect(shadow?.querySelector('[data-path="stale-from-a.ts"]')).toBeNull();
    expect(events.indexOf("watch.stop:1")).toBeLessThan(events.indexOf(`context:${THREAD_B}`));
    expect(events.indexOf(`context:${THREAD_B}`)).toBeLessThan(events.indexOf(`watch.start:${THREAD_B}`));

    shadow?.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="src/index.ts"]')).not.toBeNull());
    await vi.waitFor(() => {
      expect(shadow?.querySelector('[data-path=".env"]')).not.toBeNull();
      expect(shadow?.querySelector('[data-path=".config"]')?.getAttribute("data-node-kind")).toBe("directory");
      expect(shadow?.querySelector('[data-path=".git"]')?.getAttribute("data-node-kind")).toBe("directory");
      expect(shadow?.querySelector('[data-path="dist.js"]')).not.toBeNull();
      expect(shadow?.querySelector('[data-path="src/.generated"]')).not.toBeNull();
      expect(shadow?.querySelector('[data-path="src/ignored.ts"]')).not.toBeNull();
    });
    expect(shadow?.querySelector(".filters, .filter-panel, .show-hidden, .show-ignored")).toBeNull();

    blockClear = true;
    activeRow?.setAttribute("data-app-action-sidebar-thread-host-id", "cloud");
    activeRow?.setAttribute("data-app-action-sidebar-thread-id", `cloud:${THREAD_B}`);
    await vi.waitFor(() => expect(events.at(-1)).toBe("context.clear"));
    expect(events.at(-2)).toBe("watch.stop:2");
    expect(explorer?.dataset.state).toBe("loading");
    const clearRequest = [...requests].reverse().find((request) => request.method === "explorer.context.clear");
    expect(clearRequest?.params).toEqual({});
    blockedClear.resolve({ cleared: true });
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("no-project"));
    expect(shadow?.querySelector(".root-label")?.textContent).toBe("No local project detected");
    expect(shadow?.querySelector<HTMLElement>(".root-label")?.hidden).toBe(false);
  });

  it("clears native context even when disabling encounters a rate-limited watcher stop", async () => {
    vi.resetModules();
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "disable-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    const requests: BridgeRequest[] = [];
    window.__codexLiveExplorer = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: THREAD_A, projectName: "Disable fixture", rootName: "disable-fixture", compatible: true };
        }
        if (message.method === "explorer.watch.start") return { watching: true };
        if (message.method === "explorer.list") {
          return { entries: [{ name: "main.ts", relativePath: "main.ts", kind: "file" }] };
        }
        if (message.method === "explorer.watch.stop") {
          return { id: message.id, ok: false, error: { code: "RATE_LIMITED", message: "Lifecycle request was rate limited." } };
        }
        if (message.method === "explorer.context.clear") return { cleared: true };
        return { ok: true };
      },
    };
    document.body.innerHTML = `
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD_A}" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface"></main>
      </div>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("ready"));
    explorer?.shadowRoot?.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("codex-live-explorer")).toBeNull());

    const methods = requests.map((request) => request.method);
    expect(methods.filter((method) => method === "explorer.watch.stop")).toHaveLength(1);
    expect(methods.filter((method) => method === "explorer.context.clear")).toHaveLength(1);
    expect(methods.indexOf("explorer.watch.stop")).toBeLessThan(methods.indexOf("explorer.context.clear"));
  });

  it("refreshes the loaded rename parent within 500 ms without scanning an unloaded source", async () => {
    vi.resetModules();
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = {
      token: "rename-refresh-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    const listeners = new Set<(message: BridgeMessage) => void>();
    const listRequests: Array<{ path: string; at: number }> = [];
    let renamed = false;
    window.__codexLiveExplorer = {
      request(message) {
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: THREAD_A, projectName: "Rename fixture", rootName: "rename-fixture", compatible: true };
        }
        if (message.method === "explorer.watch.start") return { watching: true };
        if (message.method === "explorer.list") {
          const path = String(message.params.relativePath ?? "");
          listRequests.push({ path, at: performance.now() });
          if (path === "") {
            return {
              entries: [
                { name: "destination", relativePath: "destination", kind: "directory" },
                { name: "unloaded-source", relativePath: "unloaded-source", kind: "directory" },
              ],
            };
          }
          if (path === "destination") {
            return {
              entries: renamed
                ? [{ name: "moved.ts", relativePath: "destination/moved.ts", kind: "file" }]
                : [],
            };
          }
          if (path === "unloaded-source") {
            return {
              entries: renamed
                ? []
                : [{ name: "moved.ts", relativePath: "unloaded-source/moved.ts", kind: "file" }],
            };
          }
        }
        return { ok: true };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    document.body.innerHTML = `
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD_A}" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface"></main>
      </div>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    const shadow = explorer?.shadowRoot;
    await vi.waitFor(() => expect(explorer?.dataset.state).toBe("ready"));
    shadow?.querySelector<HTMLElement>('[data-path="destination"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(listRequests.filter((request) => request.path === "destination")).toHaveLength(1));
    expect(listRequests.some((request) => request.path === "unloaded-source")).toBe(false);

    renamed = true;
    const changedAt = performance.now();
    for (const listener of listeners) {
      listener({
        method: "explorer.changed",
        params: {
          changes: [{
            relativePath: "destination/moved.ts",
            fromRelativePath: "unloaded-source/moved.ts",
            kind: "renamed",
          }],
        },
      });
    }

    await vi.waitFor(() => {
      expect(listRequests.filter((request) => request.path === "destination")).toHaveLength(2);
    });
    expect(listRequests.filter((request) => request.path === "unloaded-source")).toHaveLength(0);
    const refreshedParents = listRequests.filter(
      (request) => request.path === "destination" || request.path === "unloaded-source",
    ).slice(-1);
    expect(refreshedParents).toHaveLength(1);
    expect(refreshedParents[0]!.at - changedAt).toBeLessThan(500);
    await vi.waitFor(() => expect(shadow?.querySelector('[data-path="destination/moved.ts"]')).not.toBeNull());
  });
});
