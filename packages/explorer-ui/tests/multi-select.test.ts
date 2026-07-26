import { describe, expect, it, vi } from "vitest";
import type { CodeCodexElement } from "../src/explorer-element";
import type { BridgeMessage, BridgeRequest, TreeNodeInput } from "../src/types";

const THREAD_A = "11111111-1111-4111-8111-111111111111";

interface Fixture {
  explorer: CodeCodexElement;
  shadow: ShadowRoot;
  requests: BridgeRequest[];
  listeners: Set<(message: BridgeMessage) => void>;
}

async function mountFixture(root?: TreeNodeInput[]): Promise<Fixture> {
  vi.resetModules();
  window.__CODE_CODEX_BOOTSTRAP__ = {
    token: "multi-select-secret",
    codexVersion: "26.715.4045.0",
    compatible: true,
  };
  const entries = root ?? [
    { name: "a.txt", relativePath: "a.txt", kind: "file" },
    { name: "b.txt", relativePath: "b.txt", kind: "file" },
    { name: "c.txt", relativePath: "c.txt", kind: "file" },
    { name: "d.txt", relativePath: "d.txt", kind: "file" },
  ];
  const requests: BridgeRequest[] = [];
  const listeners = new Set<(message: BridgeMessage) => void>();

  window.__codeCodex = {
    request(message) {
      requests.push(message);
      if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
      if (message.method === "explorer.context") {
        const threadId = String(message.params.threadId);
        return { threadId, projectName: "Select fixture", rootName: "select-fixture", compatible: true };
      }
      if (message.method === "explorer.list") {
        const path = String(message.params.relativePath ?? "");
        return { entries: path ? [] : entries };
      }
      if (message.method === "explorer.preview") {
        return {
          kind: "text",
          text: `preview:${String(message.params.relativePath)}\n`,
          sizeBytes: 24,
          truncated: false,
          editable: true,
          version: "a".repeat(64),
          lineEnding: "lf",
        };
      }
      if (message.method === "explorer.watch.start" || message.method === "explorer.watch.stop") return { watching: true };
      if (message.method === "explorer.context.clear") return { cleared: true };
      if (message.method === "explorer.settings.set") return message.params;
      throw new Error(`Unexpected method: ${message.method}`);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  document.body.innerHTML = `
    <div class="relative isolate flex">
      <aside class="app-shell-left-panel">
        <div data-app-action-sidebar-thread-active="true"
          data-app-action-sidebar-thread-host-id="local"
          data-app-action-sidebar-thread-id="local:${THREAD_A}"
          data-app-action-sidebar-thread-kind="local"></div>
      </aside>
      <main class="main-surface">
        <header data-app-shell-header-edge-scroll></header>
        <article class="conversation-sentinel"></article>
      </main>
    </div>`;

  const { injectExplorer } = await import("../src/inject");
  const explorer = injectExplorer();
  await vi.waitFor(() => expect(explorer?.dataset.state).toBe("ready"));
  const shadow = explorer?.shadowRoot;
  if (!explorer || !shadow) throw new Error("Multi-select fixture did not mount.");
  return { explorer, shadow, requests, listeners };
}

function row(shadow: ShadowRoot, path: string): HTMLElement {
  const element = shadow.querySelector<HTMLElement>(`.tree-row[data-path="${path}"]`);
  if (!element) throw new Error(`Missing tree row: ${path}`);
  return element;
}

function selectedPaths(shadow: ShadowRoot): string[] {
  return Array.from(
    shadow.querySelectorAll<HTMLElement>('.tree-row[data-selected="true"]'),
    (element) => element.dataset.path ?? "",
  ).sort();
}

function clickRow(shadow: ShadowRoot, path: string, modifiers: Partial<MouseEventInit> = {}): void {
  row(shadow, path).dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));
}

// PLACEHOLDER_TESTS
describe("file tree multi-selection", () => {
  it("toggles individual rows with Ctrl-click", async () => {
    const { shadow } = await mountFixture();
    clickRow(shadow, "a.txt");
    expect(selectedPaths(shadow)).toEqual(["a.txt"]);
    clickRow(shadow, "c.txt", { ctrlKey: true });
    expect(selectedPaths(shadow)).toEqual(["a.txt", "c.txt"]);
    clickRow(shadow, "a.txt", { ctrlKey: true });
    expect(selectedPaths(shadow)).toEqual(["c.txt"]);
  });

  it("selects a contiguous range with Shift-click from the anchor", async () => {
    const { shadow } = await mountFixture();
    clickRow(shadow, "b.txt");
    clickRow(shadow, "d.txt", { shiftKey: true });
    expect(selectedPaths(shadow)).toEqual(["b.txt", "c.txt", "d.txt"]);
    // A second Shift-click re-anchors from the original anchor, not the last click.
    clickRow(shadow, "a.txt", { shiftKey: true });
    expect(selectedPaths(shadow)).toEqual(["a.txt", "b.txt"]);
  });

  it("collapses back to a single row on a plain click", async () => {
    const { shadow } = await mountFixture();
    clickRow(shadow, "a.txt", { ctrlKey: true });
    clickRow(shadow, "c.txt", { ctrlKey: true });
    expect(selectedPaths(shadow)).toEqual(["a.txt", "c.txt"]);
    clickRow(shadow, "b.txt");
    expect(selectedPaths(shadow)).toEqual(["b.txt"]);
  });

  it("extends and reduces the selection with Shift+Arrow and Escape", async () => {
    const { shadow } = await mountFixture();
    const tree = shadow.querySelector<HTMLElement>(".tree-shell");
    if (!tree) throw new Error("Missing tree shell.");
    clickRow(shadow, "a.txt");
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true }));
    expect(selectedPaths(shadow)).toEqual(["a.txt", "b.txt", "c.txt"]);
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(selectedPaths(shadow).length).toBe(1);
  });

  it("selects every loaded row with Ctrl+A", async () => {
    const { shadow } = await mountFixture();
    const tree = shadow.querySelector<HTMLElement>(".tree-shell");
    if (!tree) throw new Error("Missing tree shell.");
    clickRow(shadow, "a.txt");
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(selectedPaths(shadow)).toEqual(["a.txt", "b.txt", "c.txt", "d.txt"]);
  });

  it("draws a marquee after a long press and selects intersected rows", async () => {
    vi.useFakeTimers();
    try {
      const { shadow } = await mountFixture();
      const tree = shadow.querySelector<HTMLElement>(".tree-shell");
      if (!tree) throw new Error("Missing tree shell.");
      Object.defineProperty(tree, "clientWidth", { configurable: true, value: 240 });
      Object.defineProperty(tree, "clientHeight", { configurable: true, value: 400 });
      tree.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 240, bottom: 400, width: 240, height: 400, x: 0, y: 0, toJSON() {},
      });

      const first = row(shadow, "a.txt");
      first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 1, clientX: 40, clientY: 6 }));
      // Hold still past the long-press threshold to promote to a marquee.
      vi.advanceTimersByTime(300);
      tree.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 60, clientY: 70 }));
      expect(shadow.querySelector<HTMLElement>(".tree-marquee")?.hidden).toBe(false);
      expect(selectedPaths(shadow).length).toBeGreaterThan(1);
      tree.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 60, clientY: 70 }));
      expect(shadow.querySelector<HTMLElement>(".tree-marquee")?.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start a marquee when the press immediately moves (row drag)", async () => {
    vi.useFakeTimers();
    try {
      const { shadow } = await mountFixture();
      const tree = shadow.querySelector<HTMLElement>(".tree-shell");
      if (!tree) throw new Error("Missing tree shell.");
      Object.defineProperty(tree, "clientWidth", { configurable: true, value: 240 });
      tree.getBoundingClientRect = () => ({
        top: 0, left: 0, right: 240, bottom: 400, width: 240, height: 400, x: 0, y: 0, toJSON() {},
      });
      const first = row(shadow, "a.txt");
      first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 2, clientX: 40, clientY: 6 }));
      tree.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 2, clientX: 90, clientY: 12 }));
      vi.advanceTimersByTime(300);
      expect(shadow.querySelector<HTMLElement>(".tree-marquee")?.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

