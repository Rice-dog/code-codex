import { describe, expect, it, vi } from "vitest";
import type { BridgeRequest } from "../src/types";

const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";

function shell(threadId: string, shellClass: string, includeMain = true): string {
  return `
    <button data-app-shell-sidebar-trigger></button>
    <div class="relative isolate flex ${shellClass}">
      <aside class="app-shell-left-panel">
        <div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local"
          data-app-action-sidebar-thread-id="local:${threadId}" data-app-action-sidebar-thread-kind="local"></div>
      </aside>
      ${includeMain ? '<main class="main-surface"></main>' : ""}
    </div>`;
}

describe("document remount guard", () => {
  it("reinjects once after a same-document shell replacement and coalesces mutation bursts", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "remount-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    const requests: BridgeRequest[] = [];
    window.__codeCodex = {
      request(message) {
        requests.push(message);
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false, showHidden: false, showIgnored: false };
        if (message.method === "explorer.context") {
          const threadId = String(message.params.threadId);
          return { threadId, projectName: threadId === THREAD_A ? "Shell A" : "Shell B", rootName: "fixture", compatible: true };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "README.md", relativePath: "README.md", kind: "file" }] };
        }
        if (message.method === "explorer.preview") {
          return { kind: "text", text: "# Fixture", sizeBytes: 9, truncated: false };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = shell(THREAD_A, "shell-a");

    const { installInjector } = await import("../src/inject");
    installInjector();
    await vi.waitFor(() => expect(document.querySelector("code-codex")?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Shell A"));
    const firstExplorer = document.querySelector("code-codex");
    const firstMain = document.querySelector("main.main-surface");
    firstExplorer?.shadowRoot?.querySelector<HTMLElement>('[data-path="README.md"]')?.click();
    await vi.waitFor(() => expect(firstMain?.querySelector("code-codex-main-preview")).not.toBeNull());
    const firstPreview = firstMain?.querySelector("code-codex-main-preview");

    document.body.innerHTML = shell(THREAD_B, "shell-b");
    await vi.waitFor(() => expect(document.querySelector("code-codex")?.shadowRoot?.querySelector(".project-name")?.textContent).toBe("Shell B"));
    const remountedExplorer = document.querySelector("code-codex");
    expect(remountedExplorer).not.toBe(firstExplorer);
    expect(document.querySelectorAll("code-codex")).toHaveLength(1);
    expect(remountedExplorer?.parentElement).toBe(document.querySelector(".shell-b"));
    expect(remountedExplorer?.nextElementSibling).toBe(document.querySelector("main.main-surface"));
    expect(firstPreview?.isConnected).toBe(false);
    expect(firstMain?.querySelector("code-codex-main-preview")).toBeNull();
    expect(document.querySelector("main.main-surface > code-codex-main-preview")).toBeNull();

    const contextsAfterRemount = requests.filter((request) => request.method === "explorer.context").length;
    const burst = document.createDocumentFragment();
    for (let index = 0; index < 64; index += 1) burst.append(document.createElement("span"));
    document.querySelector("main.main-surface")?.append(burst);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.querySelector("code-codex")).toBe(remountedExplorer);
    expect(document.querySelectorAll("code-codex")).toHaveLength(1);
    expect(requests.filter((request) => request.method === "explorer.context")).toHaveLength(contextsAfterRemount);

    const inlineParent = document.querySelector<HTMLElement>(".shell-b");
    inlineParent?.querySelector("aside.app-shell-left-panel")?.remove();
    await vi.waitFor(() => expect(remountedExplorer?.parentElement).toBe(document.body));
    const restoredAside = document.createElement("aside");
    restoredAside.className = "app-shell-left-panel";
    restoredAside.innerHTML = `<div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-id="local:${THREAD_B}"></div>`;
    inlineParent?.insertBefore(restoredAside, inlineParent.querySelector("main.main-surface"));
    await vi.waitFor(() => expect(remountedExplorer?.parentElement).toBe(inlineParent));

    if (inlineParent) inlineParent.style.display = "none";
    window.dispatchEvent(new Event("resize"));
    expect(remountedExplorer?.parentElement).toBe(document.body);
    document.body.append(document.createElement("i"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.querySelector("code-codex")?.parentElement).toBe(document.body);

    if (inlineParent) inlineParent.style.display = "flex";
    await vi.waitFor(() => expect(document.querySelector("code-codex")?.parentElement).toBe(inlineParent));

    remountedExplorer?.shadowRoot?.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("code-codex")).toBeNull());
    expect(requests.some((request) => request.method === "explorer.context.clear")).toBe(true);
    document.body.append(document.createElement("strong"));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.querySelector("code-codex")).toBeNull();
  });

  it("recovers an unsaved editor when the replacement main surface arrives after context", async () => {
    vi.resetModules();
    window.__CODE_CODEX_BOOTSTRAP__ = {
      token: "remount-draft-secret",
      codexVersion: "26.715.3651.0",
      channel: "beta",
    };
    window.__codeCodex = {
      request(message) {
        if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
        if (message.method === "explorer.context") {
          return { threadId: THREAD_A, projectName: "Draft shell", rootName: "draft-shell", compatible: true };
        }
        if (message.method === "explorer.list") {
          return { entries: [{ name: "draft.txt", relativePath: "draft.txt", kind: "file" }] };
        }
        if (message.method === "explorer.preview") {
          return {
            kind: "text",
            text: "original\n",
            sizeBytes: 9,
            truncated: false,
            editable: true,
            version: "a".repeat(64),
            lineEnding: "lf",
          };
        }
        return { ok: true };
      },
    };
    document.body.innerHTML = shell(THREAD_A, "draft-shell-a");

    const { installInjector } = await import("../src/inject");
    installInjector();
    await vi.waitFor(() => expect(document.querySelector("code-codex")?.getAttribute("data-state")).toBe("ready"));
    const firstExplorer = document.querySelector("code-codex");
    firstExplorer?.shadowRoot?.querySelector<HTMLElement>('[data-path="draft.txt"]')?.click();
    await vi.waitFor(() => expect(firstExplorer?.shadowRoot?.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.disabled).toBe(false));
    firstExplorer?.shadowRoot?.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const firstEditor = document.querySelector("code-codex-main-preview")?.shadowRoot?.querySelector<HTMLTextAreaElement>(".code-editor");
    if (firstEditor) {
      firstEditor.value = "recovered draft\n";
      firstEditor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    document.body.innerHTML = shell(THREAD_A, "draft-shell-b", false);
    await vi.waitFor(() => {
      const explorer = document.querySelector("code-codex");
      expect(explorer).not.toBe(firstExplorer);
      expect(explorer?.getAttribute("data-state")).toBe("ready");
      expect(document.querySelector("code-codex-main-preview")).toBeNull();
    });
    const delayedMain = document.createElement("main");
    delayedMain.className = "main-surface";
    document.querySelector(".draft-shell-b")?.append(delayedMain);
    await vi.waitFor(() => {
      const explorer = document.querySelector("code-codex");
      expect(explorer).not.toBe(firstExplorer);
      expect(explorer?.getAttribute("data-state")).toBe("ready");
      expect(document.querySelector("code-codex-main-preview")?.shadowRoot?.querySelector<HTMLTextAreaElement>(".code-editor")?.value)
        .toBe("recovered draft\n");
    });
    const recovered = document.querySelector("code-codex");
    expect(recovered?.shadowRoot?.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
    expect(document.querySelector("code-codex-main-preview")?.shadowRoot?.querySelector(".editor-error")?.textContent)
      .toContain("recovered");
  });
});
