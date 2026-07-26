import { describe, expect, it, vi } from "vitest";

describe("ExplorerBridge", () => {
  it("consumes the bootstrap token and sends authenticated raw requests", async () => {
    vi.resetModules();
    const bootstrap = { token: "launch-secret", codexVersion: "26.715.4045.0" };
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = bootstrap;
    const requests: unknown[] = [];
    window.__codexLiveExplorer = (payload) => {
      const request = JSON.parse(payload) as { id: string };
      requests.push(request);
      queueMicrotask(() => window.__codexLiveExplorerReceive?.({ id: request.id, ok: true, result: { ready: true } }));
    };

    const { ExplorerBridge } = await import("../src/bridge");
    expect(window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__).toBeUndefined();
    expect(Object.isFrozen(bootstrap)).toBe(true);
    const bridge = new ExplorerBridge("launch-secret");
    await expect(bridge.request("explorer.context", { threadId: "thread-0001" })).resolves.toEqual({ ready: true });
    expect(requests[0]).toMatchObject({ token: "launch-secret", method: "explorer.context", params: { threadId: "thread-0001" } });
    bridge.dispose();
    expect(window.__codexLiveExplorerReceive).toBeUndefined();
  });

  it("parses native error envelopes and notification events", async () => {
    vi.resetModules();
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = { token: "secret" };
    let requestId = "";
    window.__codexLiveExplorer = (payload) => {
      requestId = (JSON.parse(payload) as { id: string }).id;
    };
    const { ExplorerBridge, ExplorerBridgeError } = await import("../src/bridge");
    const bridge = new ExplorerBridge("secret");
    const notifications = vi.fn();
    bridge.subscribe(notifications);
    const pending = bridge.request("explorer.list", { relativePath: "../blocked" });
    window.dispatchEvent(
      new CustomEvent("codex-live-explorer:message", {
        detail: { id: requestId, ok: false, error: { code: "INVALID_PATH", message: "Invalid path" } },
      }),
    );
    await expect(pending).rejects.toBeInstanceOf(ExplorerBridgeError);
    window.__codexLiveExplorerReceive?.({ method: "explorer.changed", params: { changes: [] } });
    expect(notifications).toHaveBeenCalledWith({ method: "explorer.changed", params: { changes: [] } });
    bridge.dispose();
  });

  it("supports dependency-free object bridge stubs", async () => {
    vi.resetModules();
    window.__codexLiveExplorer = { request: (message) => Promise.resolve({ echo: message.method }) };
    const { ExplorerBridge } = await import("../src/bridge");
    const bridge = new ExplorerBridge("object-secret");
    await expect(bridge.request("explorer.settings.get")).resolves.toEqual({ echo: "explorer.settings.get" });
    bridge.dispose();
  });

  it("uses its own explicit token instead of the module bootstrap token", async () => {
    vi.resetModules();
    window.__CODEX_LIVE_EXPLORER_BOOTSTRAP__ = { token: "module-secret" };
    const requests: Array<{ id: string; token: string }> = [];
    window.__codexLiveExplorer = (payload) => {
      const request = JSON.parse(payload) as { id: string; token: string };
      requests.push(request);
      return { id: request.id, ok: true, result: { ready: true } };
    };
    const { ExplorerBridge } = await import("../src/bridge");
    const bridge = new ExplorerBridge("instance-secret");
    await expect(bridge.request("explorer.settings.get")).resolves.toEqual({ ready: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.token).toBe("instance-secret");
    expect(requests[0]?.token).not.toBe("module-secret");
    bridge.dispose();
  });
});
