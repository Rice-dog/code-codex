import { describe, expect, it, vi } from "vitest";
import type { BridgeMessage, BridgeRequest } from "../src/types";

const THREAD = "11111111-1111-4111-8111-111111111111";

describe("injector and explorer element", () => {
  it("uses the verified 26.715 seam, injects once, and virtualizes a large page", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = { token: "secret", codexVersion: "26.715.4045.0", channel: "stable" };
    const listeners = new Set<(message: BridgeMessage) => void>();
    const requests: BridgeRequest[] = [];
    const rootEntries = [
      { name: "package.json", relativePath: "package.json", kind: "file" },
      ...Array.from({ length: 999 }, (_, index) => {
        const name = `z-file-${String(index).padStart(4, "0")}.ts`;
        return { name, relativePath: name, kind: "file" };
      }),
    ];
    window.__codeCodex = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 270, collapsed: false };
        if (message.method === "explorer.context") return { threadId: THREAD, projectName: "Fixture project", rootName: "fixture", compatible: true };
        if (message.method === "explorer.list") {
          return { entries: [...rootEntries] };
        }
        return { ok: true };
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    document.body.innerHTML = `
      <button data-app-shell-sidebar-trigger></button>
      <div class="relative isolate flex">
        <aside class="app-shell-left-panel">
          <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
            data-app-action-sidebar-thread-id="local:${THREAD}" data-app-action-sidebar-thread-kind="local"></div>
        </aside>
        <main class="main-surface">
          <header data-app-shell-header-edge-scroll style="position: fixed; left: 240px"></header>
          <div class="thread-scroll-container" data-app-action-timeline-scroll>
            <div>
              <div data-mcp-app-portal-target="true">
                <div data-mcp-app-portal-target="true" data-decoy="nested"></div>
              </div>
              <div data-thread-scroll-footer="true">
                <div data-pip-obstacle="thread-footer"></div>
              </div>
            </div>
          </div>
          <div data-mcp-app-portal-target="true" data-decoy="outside-timeline"></div>
        </main>
      </div>`;

    const { injectExplorer } = await import("../src/inject");
    const explorer = injectExplorer();
    const nativeHeader = document.querySelector("header[data-app-shell-header-edge-scroll]");
    const shiftedHeaderSelector =
      'code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"] + main.main-surface > header[data-app-shell-header-edge-scroll]';
    const reservedConversationLaneSelector =
      'code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + main.main-surface .thread-scroll-container[data-app-action-timeline-scroll] > div > [data-mcp-app-portal-target="true"]';
    const alignedComposerSelector =
      'code-codex[data-placement="inline"][data-mount-strategy="known:main.main-surface"]:not([data-collapsed="true"]) + main.main-surface .thread-scroll-container[data-app-action-timeline-scroll] [data-pip-obstacle="thread-footer"]';
    const conversationTarget = document.querySelector<HTMLElement>(
      '.thread-scroll-container > div > [data-mcp-app-portal-target="true"]',
    );
    const nestedTarget = document.querySelector<HTMLElement>('[data-decoy="nested"]');
    const outsideTarget = document.querySelector<HTMLElement>('[data-decoy="outside-timeline"]');
    const composer = document.querySelector<HTMLElement>('[data-pip-obstacle="thread-footer"]');
    expect(explorer).not.toBeNull();
    expect(explorer?.previousElementSibling).toBe(document.querySelector("aside.app-shell-left-panel"));
    expect(explorer?.nextElementSibling).toBe(document.querySelector("main.main-surface"));
    expect(explorer?.dataset.mountStrategy).toBe("known:main.main-surface");
    expect(document.querySelectorAll('style[data-code-codex-shell-layout="codex-26.715"]')).toHaveLength(1);
    expect(nativeHeader?.matches(shiftedHeaderSelector)).toBe(true);
    expect(conversationTarget?.matches(reservedConversationLaneSelector)).toBe(true);
    expect(composer?.matches(alignedComposerSelector)).toBe(true);
    expect(nestedTarget?.matches(reservedConversationLaneSelector)).toBe(false);
    expect(outsideTarget?.matches(reservedConversationLaneSelector)).toBe(false);
    expect(document.querySelector<HTMLStyleElement>('style[data-code-codex-shell-layout="codex-26.715"]')?.textContent).toContain(
      'max-width: min(var(--thread-content-max-width), calc(100% - 100px)) !important;',
    );
    expect(injectExplorer()).toBe(explorer);
    expect(document.querySelectorAll('style[data-code-codex-shell-layout="codex-26.715"]')).toHaveLength(1);

    await vi.waitFor(() => {
      expect(explorer?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Fixture project");
      expect(explorer?.style.getPropertyValue("--cle-width")).toBe("270px");
    });
    expect(explorer?.shadowRoot?.querySelector(".eyebrow-label, .eyebrow-separator")).toBeNull();
    expect(explorer?.shadowRoot?.querySelector(".masthead")?.textContent).not.toContain("Project files");
    expect(
      explorer?.shadowRoot?.querySelector(".filters, .filter-panel, .show-hidden, .show-ignored"),
    ).toBeNull();
    const renderedRows = explorer?.shadowRoot?.querySelectorAll(".tree-row").length ?? 0;
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(50);
    const firstRows = explorer?.shadowRoot?.querySelectorAll<HTMLElement>(".tree-row");
    expect(firstRows?.[0]?.style.top).toBe("0px");
    expect(firstRows?.[1]?.style.top).toBe("28px");
    expect((explorer?.shadowRoot?.querySelector(".tree-spacer") as HTMLElement | null)?.style.height).toBe("28000px");
    expect(firstRows?.[0]?.querySelector(".twisty")).toBeNull();
    expect(requests.every((request) => request.token === "secret")).toBe(true);
    expect(requests.some((request) => /readFile|writeFile|remove|move/.test(request.method))).toBe(false);
    expect(requests.find((request) => request.method === "explorer.watch.start")?.params).toEqual({});

    const fileFilter = explorer?.shadowRoot?.querySelector<HTMLInputElement>(".file-filter");
    const treeShell = explorer?.shadowRoot?.querySelector<HTMLElement>(".tree-shell");
    const listRequestsBeforeFilter = requests.filter((request) => request.method === "explorer.list").length;
    expect(fileFilter?.getAttribute("aria-controls")).toBe("cle-tree");
    expect(treeShell?.getAttribute("aria-label")).toBe("Project files");
    expect(treeShell?.dataset.scrollPosition).toBe("none");
    if (treeShell) {
      Object.defineProperty(treeShell, "clientHeight", { configurable: true, value: 280 });
      Object.defineProperty(treeShell, "scrollHeight", { configurable: true, value: 28_000 });

      treeShell.scrollTop = 0;
      treeShell.dispatchEvent(new Event("scroll"));
      expect(treeShell.dataset.scrollPosition).toBe("start");

      treeShell.scrollTop = 14_000;
      treeShell.dispatchEvent(new Event("scroll"));
      expect(treeShell.dataset.scrollPosition).toBe("middle");

      treeShell.scrollTop = 27_720;
      treeShell.dispatchEvent(new Event("scroll"));
      expect(treeShell.dataset.scrollPosition).toBe("end");

      treeShell.scrollTop = 0;
      treeShell.dispatchEvent(new Event("scroll"));
    }
    expect(fileFilter?.name).toBe("file-filter");
    expect(fileFilter?.placeholder).toBe("Filter files…");
    if (fileFilter) {
      fileFilter.value = "PACKAGE.JSON";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(explorer?.shadowRoot?.querySelectorAll(".tree-row")).toHaveLength(1));
    expect(explorer?.shadowRoot?.querySelector<HTMLElement>(".tree-row")?.dataset.path).toBe("package.json");
    expect((explorer?.shadowRoot?.querySelector(".tree-spacer") as HTMLElement | null)?.style.height).toBe("28px");
    expect(requests.filter((request) => request.method === "explorer.list")).toHaveLength(listRequestsBeforeFilter);

    if (fileFilter) {
      fileFilter.value = "does-not-exist";
      fileFilter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(explorer?.shadowRoot?.querySelector<HTMLElement>(".file-filter-empty")?.hidden).toBe(false));
    expect(explorer?.shadowRoot?.querySelector(".file-filter-empty")?.textContent).toContain("does-not-exist");
    expect(treeShell?.dataset.filterEmpty).toBe("true");
    treeShell?.focus();
    expect(explorer?.shadowRoot?.activeElement).toBe(treeShell);
    fileFilter?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect((explorer?.shadowRoot?.querySelector(".tree-spacer") as HTMLElement | null)?.style.height).toBe("28000px"));
    expect(fileFilter?.value).toBe("");
    expect(treeShell?.dataset.filterEmpty).toBe("false");
    fileFilter?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(explorer?.shadowRoot?.activeElement).toBe(treeShell);
    expect(treeShell?.getAttribute("aria-activedescendant")).toBe("cle-row-0");

    window.innerWidth = 639;
    window.dispatchEvent(new Event("resize"));
    expect(nativeHeader?.matches(shiftedHeaderSelector)).toBe(false);
    explorer?.collapse(true);
    expect(conversationTarget?.matches(reservedConversationLaneSelector)).toBe(false);
    expect(composer?.matches(alignedComposerSelector)).toBe(false);
    rootEntries.push({ name: "added.ts", relativePath: "added.ts", kind: "file" });
    for (const listener of listeners) {
      listener({
        method: "explorer.changed",
        params: {
          changes: [
            { relativePath: "package.json", kind: "modified" },
            { relativePath: "added.ts", kind: "added" },
          ],
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 240));
    explorer?.collapse(false);
    expect(conversationTarget?.matches(reservedConversationLaneSelector)).toBe(false);
    expect(composer?.matches(alignedComposerSelector)).toBe(false);
    expect(explorer?.shadowRoot?.querySelector('[data-path="package.json"]')?.getAttribute("data-change")).toBe("modified");
    expect(explorer?.shadowRoot?.querySelector('[data-path="added.ts"]')?.getAttribute("data-change")).toBe("added");
    expect(explorer?.shadowRoot?.querySelector('[data-path="package.json"] .badge')?.textContent).toBe("M");
    expect(explorer?.shadowRoot?.querySelector('[data-path="added.ts"] .badge')?.textContent).toBe("A");
    window.innerWidth = 1024;
    window.dispatchEvent(new Event("resize"));
    expect(nativeHeader?.matches(shiftedHeaderSelector)).toBe(true);
    expect(conversationTarget?.matches(reservedConversationLaneSelector)).toBe(true);
    expect(composer?.matches(alignedComposerSelector)).toBe(true);

    const inlineParent = document.querySelector(".relative.isolate.flex");
    expect(inlineParent).not.toBeNull();
    (inlineParent as HTMLElement).style.display = "none";
    window.dispatchEvent(new Event("resize"));
    expect(explorer?.parentElement).toBe(document.body);
    expect(explorer?.dataset.placement).toBe("drawer");
    expect(nativeHeader?.matches(shiftedHeaderSelector)).toBe(false);
    (inlineParent as HTMLElement).style.display = "flex";
    window.dispatchEvent(new Event("resize"));
    expect(explorer?.parentElement).toBe(inlineParent);
    expect(explorer?.nextElementSibling).toBe(document.querySelector("main.main-surface"));
    window.innerWidth = 200;
    window.dispatchEvent(new Event("resize"));
    expect(explorer?.parentElement).toBe(document.body);
    expect(explorer?.dataset.placement).toBe("drawer");
    expect(explorer?.style.getPropertyValue("--cle-width")).toBe("168px");
    window.innerWidth = 639;
    window.dispatchEvent(new Event("resize"));
    expect(explorer?.style.getPropertyValue("--cle-width")).toBe("270px");
    window.innerWidth = 1024;
    window.dispatchEvent(new Event("resize"));
    expect(explorer?.parentElement).toBe(inlineParent);
    expect(explorer?.style.getPropertyValue("--cle-width")).toBe("270px");
    expect(nativeHeader?.matches(shiftedHeaderSelector)).toBe(true);
  });

  it("fails closed for a present unsupported Codex version", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = { token: "secret", codexVersion: "27.100.1", compatible: false };
    const { assessBootstrapCompatibility } = await import("../src/bridge");
    expect(assessBootstrapCompatibility()).toEqual({
      supported: false,
      version: "27.100.1",
      reason: "Codex 27.100.1 has not been verified.",
    });
    expect(assessBootstrapCompatibility({ codexVersion: "27.100.1", compatible: true }).reason).toContain("outside the verified 26.715.x adapter range");
  });
});
