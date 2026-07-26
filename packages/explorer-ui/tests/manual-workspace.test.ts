import { describe, expect, it, vi } from "vitest";
import type { BridgeRequest } from "../src/types";

describe("manual workspace bootstrap", () => {
  it("loads the fixed workspace without an active Codex task row", async () => {
    vi.resetModules();
    const requests: BridgeRequest[] = [];
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "manual-secret",
      codexVersion: "26.715.4045.0",
      compatible: true,
      manualWorkspace: true,
    };
    window.__codeCodex = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return {
            threadId: String(message.params.threadId),
            projectName: "Manual fixture",
            rootName: "manual-root",
            compatible: true,
          };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "README.md", relativePath: "README.md", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = `<section data-code-codex-mount></section><main></main>`;
    expect(document.querySelector("[data-app-action-sidebar-thread-active='true']")).toBeNull();

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    await vi.waitFor(() => {
      expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Manual fixture");
      expect(explorer?.shadowRoot?.querySelector('[data-path="README.md"]')).not.toBeNull();
    });
    expect(requests.find((request) => request.method === "explorer.context")?.params).toEqual({ threadId: "manual-workspace" });
    expect(requests.some((request) => request.method === "explorer.watch.stop")).toBe(false);
    expect(requests.every((request) => request.token === "manual-secret")).toBe(true);
  });

  it("retries a transient manual context and root listing once without stale watcher cleanup", async () => {
    vi.resetModules();
    const requests: BridgeRequest[] = [];
    let contextAttempts = 0;
    let rootListAttempts = 0;
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "manual-retry-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
      manualWorkspace: true,
    };
    window.__codeCodex = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          contextAttempts += 1;
          if (contextAttempts === 1) {
            return { id: message.id, ok: false, error: { code: "TIMEOUT", message: "Navigation dropped the request." } };
          }
          return {
            threadId: String(message.params.threadId),
            projectName: "Recovered manual fixture",
            rootName: "manual-retry-root",
            compatible: true,
          };
        }
        if (message.method === "explorer.list") {
          rootListAttempts += 1;
          if (rootListAttempts === 1) {
            return { id: message.id, ok: false, error: { code: "CANCELLED", message: "Document changed." } };
          }
          return { entries: [{ name: "recovered.txt", relativePath: "recovered.txt", kind: "file" }] };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = `<section data-code-codex-mount></section><main></main>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    await vi.waitFor(() => {
      expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Recovered manual fixture");
      expect(explorer?.shadowRoot?.querySelector('[data-path="recovered.txt"]')).not.toBeNull();
    });

    expect(contextAttempts).toBe(2);
    expect(rootListAttempts).toBe(2);
    expect(requests.filter((request) => request.method === "explorer.context").every((request) => request.params.threadId === "manual-workspace")).toBe(true);
    expect(requests.some((request) => request.method === "explorer.watch.stop")).toBe(false);
  });
});
