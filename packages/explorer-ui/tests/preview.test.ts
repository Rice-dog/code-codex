import { describe, expect, it, vi } from "vitest";
import type { CodeCodexElement } from "../src/explorer-element";
import type { CodeCodexMainPreviewElement, MainPreviewState } from "../src/main-preview";
import type { BridgeMessage, BridgeRequest, TreeNodeInput } from "../src/types";

const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";
const MAIN_PREVIEW_TAG = "code-codex-main-preview";

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => (this.resolve = resolve));
  }
}

type PreviewHandler = (message: BridgeRequest) => unknown;

interface PreviewFixture {
  explorer: CodeCodexElement;
  shadow: ShadowRoot;
  main: HTMLElement;
  conversation: HTMLElement;
  conversationInput: HTMLInputElement;
  requests: BridgeRequest[];
  listeners: Set<(message: BridgeMessage) => void>;
}

async function mountPreviewFixture(
  entries: TreeNodeInput[],
  preview: PreviewHandler,
  options: {
    duplicateMain?: boolean;
    forceDrawer?: boolean;
    hiddenMain?: boolean;
    theme?: "dark" | "light";
    save?: PreviewHandler;
  } = {},
): Promise<PreviewFixture> {
  vi.resetModules();
  if (options.theme) document.documentElement.dataset.theme = options.theme;
  window.__CODE_CODEX_BOOTSTRAP__ = {
    token: "preview-secret",
    codexVersion: "26.715.3651.0",
    channel: "beta",
    ...(options.forceDrawer === undefined ? {} : { forceDrawer: options.forceDrawer }),
  };
  const requests: BridgeRequest[] = [];
  const listeners = new Set<(message: BridgeMessage) => void>();
  window.__codeCodex = {
    request(message) {
      requests.push(message);
      if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
      if (message.method === "explorer.context") {
        const threadId = String(message.params.threadId);
        return {
          threadId,
          projectName: threadId === THREAD_A ? "Preview fixture" : "Second fixture",
          rootName: threadId === THREAD_A ? "preview-fixture" : "second-fixture",
          compatible: true,
        };
      }
      if (message.method === "explorer.list") return { entries };
      if (message.method === "explorer.preview") return preview(message);
      if (message.method === "explorer.preview.save" && options.save) return options.save(message);
      if (message.method === "explorer.context.clear") return { cleared: true };
      if (message.method === "explorer.watch.start" || message.method === "explorer.watch.stop") return { watching: true };
      if (message.method === "explorer.settings.set") return message.params;
      throw new Error(`Unexpected method: ${message.method}`);
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
        <div class="active-thread" data-app-action-sidebar-thread-active="true"
          data-app-action-sidebar-thread-host-id="local"
          data-app-action-sidebar-thread-id="local:${THREAD_A}"
          data-app-action-sidebar-thread-kind="local"></div>
      </aside>
      <main class="main-surface"${options.hiddenMain ? ' style="display: none"' : ""}>
        <header data-app-shell-header-edge-scroll></header>
        <article class="conversation-sentinel" inert="preserve-inert" aria-hidden="false">
          <input class="conversation-input" value="draft reply">
        </article>
      </main>
      ${options.duplicateMain ? '<main class="main-surface duplicate-main"></main>' : ""}
    </div>`;

  const { injectExplorer } = await import("../src/inject");
  const explorer = injectExplorer();
  await vi.waitFor(() => expect(explorer?.dataset.state).toBe("ready"));
  const shadow = explorer?.shadowRoot;
  const main = document.querySelector<HTMLElement>("main.main-surface:not(.duplicate-main)");
  const conversation = main?.querySelector<HTMLElement>(".conversation-sentinel");
  const conversationInput = main?.querySelector<HTMLInputElement>(".conversation-input");
  if (!explorer || !shadow || !main || !conversation || !conversationInput) throw new Error("Preview fixture did not mount.");
  return { explorer, shadow, main, conversation, conversationInput, requests, listeners };
}

function clickRow(shadow: ShadowRoot, path: string): void {
  const row = shadow.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (!row) throw new Error(`Missing tree row: ${path}`);
  row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
}

function previewHost(main: HTMLElement): CodeCodexMainPreviewElement | null {
  return main.querySelector<CodeCodexMainPreviewElement>(`:scope > ${MAIN_PREVIEW_TAG}`);
}

function previewShadow(main: HTMLElement): ShadowRoot {
  const shadow = previewHost(main)?.shadowRoot;
  if (!shadow) throw new Error("Main preview is not mounted.");
  return shadow;
}

function fileTab(main: HTMLElement, path: string): HTMLElement {
  const tab = Array.from(previewShadow(main).querySelectorAll<HTMLElement>("[role='tab'][data-tab-kind='file']")).find(
    (candidate) => candidate.dataset.path === path,
  );
  if (!tab) throw new Error(`Missing main preview tab: ${path}`);
  return tab;
}

function closeFileTab(main: HTMLElement, path: string): void {
  const button = Array.from(previewShadow(main).querySelectorAll<HTMLButtonElement>("button[data-close-path]")).find(
    (candidate) => candidate.dataset.closePath === path,
  );
  if (!button) throw new Error(`Missing close button: ${path}`);
  button.click();
}

function state(main: HTMLElement): MainPreviewState {
  const host = previewHost(main);
  if (!host) throw new Error("Main preview is not mounted.");
  return host.state;
}

async function waitForPreviewRequests(requests: BridgeRequest[], count: number): Promise<void> {
  await vi.waitFor(() => expect(requests.filter((request) => request.method === "explorer.preview")).toHaveLength(count));
}

function emit(listeners: Set<(message: BridgeMessage) => void>, message: BridgeMessage): void {
  for (const listener of listeners) listener(message);
}

function decodeBase64Utf8(value: unknown): string {
  const binary = atob(String(value));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function editablePreview(text: string, versionCharacter = "a", lineEnding: "lf" | "crlf" | "none" = "lf") {
  return {
    kind: "text",
    text,
    sizeBytes: new TextEncoder().encode(text).byteLength,
    truncated: false,
    editable: true,
    version: versionCharacter.repeat(64),
    lineEnding,
  };
}

describe("main-window file previews", () => {
  it("lazily replaces the main subject, renders hostile text literally, and preserves the conversation DOM", async () => {
    const hostile = '<img src=x onerror="window.__previewPwned=true">\n' + "x".repeat(65_536);
    const fixture = await mountPreviewFixture(
      [{ name: "unsafe.html", relativePath: "unsafe.html", kind: "file" }],
      () => ({ kind: "text", text: hostile, sizeBytes: 90_000, truncated: false }),
    );
    const { main, shadow, conversation, conversationInput, requests } = fixture;
    const conversationIdentity = conversation;
    const clickListener = vi.fn();
    conversation.addEventListener("click", clickListener);

    expect(previewHost(main)).toBeNull();
    clickRow(shadow, "unsafe.html");
    expect(previewHost(main)?.parentElement).toBe(main);
    expect(state(main).activePath).toBe("unsafe.html");
    expect(conversation.isConnected).toBe(true);
    expect(conversation.getAttribute("inert")).toBe("");
    expect(conversation.getAttribute("aria-hidden")).toBe("true");

    await waitForPreviewRequests(requests, 1);
    await vi.waitFor(() => expect(previewShadow(main).querySelector("pre.literal-text")?.textContent).toHaveLength(65_536));
    const rendered = previewShadow(main).querySelector<HTMLElement>("pre.literal-text");
    expect(rendered?.textContent).toContain("<img src=x");
    expect(rendered?.querySelector("img")).toBeNull();
    expect(previewShadow(main).querySelector(".preview-metadata")?.textContent).toContain("Preview truncated");
    expect((window as unknown as Record<string, unknown>).__previewPwned).toBeUndefined();

    previewShadow(main).querySelector<HTMLButtonElement>("[data-tab-kind='conversation']")?.click();
    expect(state(main).activePath).toBeNull();
    expect(main.querySelector(".conversation-sentinel")).toBe(conversationIdentity);
    expect(conversation.getAttribute("inert")).toBe("preserve-inert");
    expect(conversation.getAttribute("aria-hidden")).toBe("false");
    expect(conversationInput.value).toBe("draft reply");
    conversation.click();
    expect(clickListener).toHaveBeenCalledOnce();

    closeFileTab(main, "unsafe.html");
    expect(previewHost(main)).toBeNull();
    expect(conversation.getAttribute("inert")).toBe("preserve-inert");
    expect(conversation.getAttribute("aria-hidden")).toBe("false");
  });

  it("keeps ordered unique tabs and closes active tabs to the right, then left, then Conversation", async () => {
    const fixture = await mountPreviewFixture(
      ["a.txt", "b.txt", "c.txt"].map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => ({
        kind: "text",
        text: `content:${String(message.params.relativePath)}`,
        sizeBytes: 13,
        truncated: false,
      }),
    );
    const { main, shadow, requests } = fixture;

    clickRow(shadow, "a.txt");
    await waitForPreviewRequests(requests, 1);
    clickRow(shadow, "b.txt");
    await waitForPreviewRequests(requests, 2);
    expect(state(main).tabs.map((tab) => tab.path)).toEqual(["a.txt", "b.txt"]);
    expect(state(main).activePath).toBe("b.txt");

    clickRow(shadow, "a.txt");
    expect(state(main).tabs.map((tab) => tab.path)).toEqual(["a.txt", "b.txt"]);
    expect(state(main).activePath).toBe("a.txt");
    expect(requests.filter((request) => request.method === "explorer.preview")).toHaveLength(2);

    closeFileTab(main, "a.txt");
    expect(state(main).activePath).toBe("b.txt");
    clickRow(shadow, "c.txt");
    await waitForPreviewRequests(requests, 3);
    expect(state(main).activePath).toBe("c.txt");
    closeFileTab(main, "c.txt");
    expect(state(main).activePath).toBe("b.txt");
    closeFileTab(main, "b.txt");
    expect(previewHost(main)).toBeNull();
  });

  it("bounds the session to eight tabs and invalidates the oldest pending tab", async () => {
    const names = Array.from({ length: 9 }, (_, index) => `file-${index + 1}.txt`);
    const fixture = await mountPreviewFixture(
      names.map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => ({
        kind: "text",
        text: String(message.params.relativePath),
        sizeBytes: 10,
        truncated: false,
      }),
    );
    for (const name of names) clickRow(fixture.shadow, name);

    expect(state(fixture.main).tabs.map((tab) => tab.path)).toEqual(names.slice(1));
    expect(state(fixture.main).activePath).toBe(names.at(-1));
    await waitForPreviewRequests(fixture.requests, 8);
    expect(fixture.requests.some(
      (request) => request.method === "explorer.preview" && request.params.relativePath === names[0],
    )).toBe(false);
  });

  it("opens only on deliberate file activation and leaves tabs intact for tree focus, directories, symlinks, and filters", async () => {
    const fixture = await mountPreviewFixture(
      [
        { name: "folder", relativePath: "folder", kind: "directory" },
        { name: "a.txt", relativePath: "a.txt", kind: "file" },
        { name: "b.txt", relativePath: "b.txt", kind: "file" },
        { name: "linked.txt", relativePath: "linked.txt", kind: "symlink" },
      ],
      (message) => ({ kind: "text", text: String(message.params.relativePath), sizeBytes: 5, truncated: false }),
    );
    const { main, shadow, requests } = fixture;
    const tree = shadow.querySelector<HTMLElement>(".tree-shell");
    tree?.focus();
    tree?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    tree?.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(requests.filter((request) => request.method === "explorer.preview")).toHaveLength(0);
    expect(previewHost(main)).toBeNull();

    tree?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitForPreviewRequests(requests, 1);
    const activePath = state(main).activePath;
    expect(activePath).toBe("b.txt");

    tree?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(state(main).activePath).toBeNull();
    expect(state(main).tabs.map((tab) => tab.path)).toEqual([activePath]);
    if (activePath) fileTab(main, activePath).click();
    expect(state(main).activePath).toBe(activePath);

    clickRow(shadow, "folder");
    clickRow(shadow, "linked.txt");
    expect(state(main).activePath).toBe(activePath);
    const filter = shadow.querySelector<HTMLInputElement>(".file-filter");
    if (filter) {
      filter.value = "a.txt";
      filter.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(state(main).activePath).toBe(activePath);
    expect(state(main).tabs.map((tab) => tab.path)).toEqual([activePath]);
  });

  it("allows a late inactive response to populate only its own tab", async () => {
    const lateA = new Deferred<unknown>();
    const fixture = await mountPreviewFixture(
      ["a.txt", "b.txt"].map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => message.params.relativePath === "a.txt"
        ? lateA.promise
        : { kind: "text", text: "content B", sizeBytes: 9, truncated: false },
    );
    const { main, shadow, requests } = fixture;

    clickRow(shadow, "a.txt");
    await waitForPreviewRequests(requests, 1);
    clickRow(shadow, "b.txt");
    await waitForPreviewRequests(requests, 2);
    await vi.waitFor(() => expect(previewShadow(main).querySelector("pre.literal-text")?.textContent).toBe("content B"));

    lateA.resolve({ kind: "text", text: "late content A", sizeBytes: 14, truncated: false });
    await vi.waitFor(() => expect(state(main).tabs.find((tab) => tab.path === "a.txt")?.kind).toBe("text"));
    expect(state(main).activePath).toBe("b.txt");
    expect(previewShadow(main).querySelector("pre.literal-text")?.textContent).toBe("content B");
    expect((state(main).tabs.find((tab) => tab.path === "a.txt") as { text?: string })?.text).toBe("late content A");
  });

  it("does not resurrect a closed tab or let its response populate a reopened instance", async () => {
    const oldRequest = new Deferred<unknown>();
    const newRequest = new Deferred<unknown>();
    let requestCount = 0;
    const fixture = await mountPreviewFixture(
      [{ name: "a.txt", relativePath: "a.txt", kind: "file" }],
      () => (++requestCount === 1 ? oldRequest.promise : newRequest.promise),
    );
    const { main, shadow, requests } = fixture;

    clickRow(shadow, "a.txt");
    await waitForPreviewRequests(requests, 1);
    closeFileTab(main, "a.txt");
    expect(previewHost(main)).toBeNull();
    clickRow(shadow, "a.txt");
    await waitForPreviewRequests(requests, 2);

    oldRequest.resolve({ kind: "text", text: "stale old tab", sizeBytes: 13, truncated: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(state(main).tabs[0]?.kind).toBe("loading");
    expect(previewShadow(main).textContent).not.toContain("stale old tab");

    newRequest.resolve({ kind: "text", text: "fresh reopened tab", sizeBytes: 18, truncated: false });
    await vi.waitFor(() => expect(previewShadow(main).querySelector("pre.literal-text")?.textContent).toBe("fresh reopened tab"));
  });

  it("closes only changed tabs and refreshes a modified active file", async () => {
    let version = 0;
    const fixture = await mountPreviewFixture(
      ["a.txt", "b.txt"].map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => ({
        kind: "text",
        text: `${String(message.params.relativePath)}:${++version}`,
        sizeBytes: 7,
        truncated: false,
      }),
    );
    const { main, shadow, requests, listeners } = fixture;
    clickRow(shadow, "a.txt");
    await waitForPreviewRequests(requests, 1);
    clickRow(shadow, "b.txt");
    await waitForPreviewRequests(requests, 2);

    emit(listeners, { method: "explorer.changed", params: { changes: [{ relativePath: "a.txt", kind: "deleted" }] } });
    expect(state(main).tabs.map((tab) => tab.path)).toEqual(["b.txt"]);
    expect(state(main).activePath).toBe("b.txt");

    emit(listeners, { method: "explorer.changed", params: { changes: [{ relativePath: "b.txt", kind: "modified" }] } });
    await waitForPreviewRequests(requests, 3);
    await vi.waitFor(() => expect(previewShadow(main).querySelector("pre.literal-text")?.textContent).toBe("b.txt:3"));

    emit(listeners, {
      method: "explorer.changed",
      params: { changes: [{ relativePath: "renamed.txt", fromRelativePath: "b.txt", kind: "renamed" }] },
    });
    expect(previewHost(main)).toBeNull();
  });

  it("purges tabs on task switches, incompatibility, disconnect, and dismissal, rejecting late old-workspace text", async () => {
    const pending = new Deferred<unknown>();
    const fixture = await mountPreviewFixture(
      [{ name: "old.txt", relativePath: "old.txt", kind: "file" }],
      () => pending.promise,
    );
    const { explorer, main, shadow, requests, listeners, conversation } = fixture;
    clickRow(shadow, "old.txt");
    await waitForPreviewRequests(requests, 1);

    const active = document.querySelector<HTMLElement>(".active-thread");
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await vi.waitFor(() => expect(requests.some(
      (request) => request.method === "explorer.context" && request.params.threadId === THREAD_B,
    )).toBe(true));
    expect(previewHost(main)).toBeNull();
    expect(conversation.getAttribute("aria-hidden")).toBe("false");

    pending.resolve({ kind: "text", text: "old workspace secret", sizeBytes: 20, truncated: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(main.textContent).not.toContain("old workspace secret");

    clickRow(shadow, "old.txt");
    await waitForPreviewRequests(requests, 2);
    emit(listeners, { method: "explorer.incompatible", params: { reason: "Compatibility revoked" } });
    expect(previewHost(main)).toBeNull();

    explorer.reconcileMainPreview(main);
    clickRow(shadow, "old.txt");
    expect(previewHost(main)).toBeNull();
    explorer.remove();
    expect(previewHost(main)).toBeNull();

    const replacement = await mountPreviewFixture(
      [{ name: "new.txt", relativePath: "new.txt", kind: "file" }],
      () => ({ kind: "text", text: "new", sizeBytes: 3, truncated: false }),
    );
    clickRow(replacement.shadow, "new.txt");
    await waitForPreviewRequests(replacement.requests, 1);
    replacement.shadow.querySelector<HTMLButtonElement>(".disable")?.click();
    await vi.waitFor(() => expect(document.querySelector("code-codex")).toBeNull());
    expect(previewHost(replacement.main)).toBeNull();
  });

  it("shows bounded unsupported and sanitized native-error states", async () => {
    const fixture = await mountPreviewFixture(
      [
        { name: "private.env", relativePath: "private.env", kind: "file" },
        { name: "denied.txt", relativePath: "denied.txt", kind: "file" },
      ],
      (message) => {
        if (message.params.relativePath === "private.env") {
          return { kind: "unsupported", sizeBytes: 42, truncated: false, reason: "sensitive" };
        }
        return {
          id: message.id,
          ok: false,
          error: { code: "ACCESS_DENIED", message: "C:\\secret\\denied.txt must not cross the UI boundary" },
        };
      },
    );
    const { main, shadow, requests } = fixture;

    clickRow(shadow, "private.env");
    await waitForPreviewRequests(requests, 1);
    await vi.waitFor(() => expect(previewShadow(main).querySelector(".view-state.unsupported")).not.toBeNull());
    expect(previewShadow(main).textContent).toContain("Preview is disabled for sensitive files.");

    clickRow(shadow, "denied.txt");
    await waitForPreviewRequests(requests, 2);
    await vi.waitFor(() => expect(previewShadow(main).querySelector(".view-state.error")).not.toBeNull());
    expect(previewShadow(main).textContent).not.toContain("C:\\secret");
    expect(previewShadow(main).textContent).not.toContain("must not cross");
  });

  it("saves UTF-8 edits through the versioned bridge and preserves CRLF line endings", async () => {
    const saved = "first\r\nchanged ✓\r\n";
    const save = vi.fn((message: BridgeRequest) => editablePreview(saved, "b", "crlf"));
    const fixture = await mountPreviewFixture(
      [{ name: "notes.txt", relativePath: "notes.txt", kind: "file" }],
      () => editablePreview("first\r\nsecond\r\n", "a", "crlf"),
      { save },
    );
    clickRow(fixture.shadow, "notes.txt");
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector("pre.literal-text")).not.toBeNull());

    const toggle = fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle");
    expect(toggle?.disabled).toBe(false);
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    toggle?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    expect(editor?.value).toBe("first\nsecond\n");
    expect(toggle?.textContent).toBe("Editing");
    if (editor) {
      editor.value = "first\nchanged ✓\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    toggle?.click();

    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector("pre.literal-text")?.textContent).toBe(saved));
    expect(toggle?.textContent).toBe("Read only");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    expect(save).toHaveBeenCalledOnce();
    const request = save.mock.calls[0]?.[0];
    expect(request?.method).toBe("explorer.preview.save");
    expect(request?.params).toMatchObject({ relativePath: "notes.txt", expectedVersion: "a".repeat(64) });
    expect(decodeBase64Utf8(request?.params.contentBase64)).toBe(saved);
    expect(state(fixture.main).tabs[0]).toMatchObject({ editable: true, version: "b".repeat(64), lineEnding: "crlf" });
  });

  it("verifies the disk version when a watcher event races a save response", async () => {
    const pending = new Deferred<ReturnType<typeof editablePreview>>();
    let diskText = "original\n";
    let diskVersion = "a";
    const fixture = await mountPreviewFixture(
      [{ name: "raced.txt", relativePath: "raced.txt", kind: "file" }],
      () => editablePreview(diskText, diskVersion),
      { save: () => pending.promise },
    );
    clickRow(fixture.shadow, "raced.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "local draft\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.requests.some((request) => request.method === "explorer.preview.save")).toBe(true));

    diskText = "newer external text\n";
    diskVersion = "c";
    emit(fixture.listeners, {
      method: "explorer.changed",
      params: { changes: [{ relativePath: "raced.txt", kind: "modified" }] },
    });
    pending.resolve(editablePreview("local draft\n", "b"));

    await waitForPreviewRequests(fixture.requests, 2);
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector(".editor-error")?.textContent).toContain("while it was being saved"));
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("local draft\n");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
    expect(state(fixture.main).tabs[0]).toMatchObject({ text: diskText, version: "c".repeat(64) });
  });

  it.each(["deleted", "renamed"] as const)(
    "verifies a missing original path when a %s watcher event races a save response",
    async (kind) => {
      const pending = new Deferred<ReturnType<typeof editablePreview>>();
      let originalPathExists = true;
      const fixture = await mountPreviewFixture(
        [{ name: "raced.txt", relativePath: "raced.txt", kind: "file" }],
        (message) => originalPathExists
          ? editablePreview("original\n")
          : {
              id: message.id,
              ok: false,
              error: { code: "NOT_FOUND", message: "native path must not be shown" },
            },
        { save: () => pending.promise },
      );
      clickRow(fixture.shadow, "raced.txt");
      await waitForPreviewRequests(fixture.requests, 1);
      fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
      const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
      if (editor) {
        editor.value = "local draft\n";
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
      fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
      await vi.waitFor(() => expect(fixture.requests.some((request) => request.method === "explorer.preview.save")).toBe(true));

      originalPathExists = false;
      emit(fixture.listeners, {
        method: "explorer.changed",
        params: {
          changes: [kind === "deleted"
            ? { relativePath: "raced.txt", kind }
            : { relativePath: "moved.txt", fromRelativePath: "raced.txt", kind }],
        },
      });
      pending.resolve(editablePreview("local draft\n", "b"));

      await waitForPreviewRequests(fixture.requests, 2);
      await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector(".editor-error")?.textContent).toContain("no longer exists"));
      expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("local draft\n");
      expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
      expect(previewShadow(fixture.main).textContent).not.toContain("native path");
    },
  );

  it("blocks local navigation during a save and queues a host task switch until it settles", async () => {
    const pending = new Deferred<ReturnType<typeof editablePreview>>();
    const fixture = await mountPreviewFixture(
      ["a.txt", "b.txt"].map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => editablePreview(`${String(message.params.relativePath)}\n`),
      { save: () => pending.promise },
    );
    clickRow(fixture.shadow, "a.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    clickRow(fixture.shadow, "b.txt");
    await waitForPreviewRequests(fixture.requests, 2);
    fileTab(fixture.main, "a.txt").click();
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "saved a\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.requests.some((request) => request.method === "explorer.preview.save")).toBe(true));

    const confirm = vi.spyOn(window, "confirm");
    fileTab(fixture.main, "b.txt").click();
    closeFileTab(fixture.main, "a.txt");
    fixture.shadow.querySelector<HTMLButtonElement>(".disable")?.click();
    const active = document.querySelector<HTMLElement>(".active-thread");
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state(fixture.main).activePath).toBe("a.txt");
    expect(state(fixture.main).tabs.map((tab) => tab.path)).toEqual(["a.txt", "b.txt"]);
    expect(fixture.explorer.isConnected).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(fixture.requests.some((request) => request.method === "explorer.context" && request.params.threadId === THREAD_B)).toBe(false);

    pending.resolve(editablePreview("saved a\n", "b"));
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.context" && request.params.threadId === THREAD_B,
    )).toBe(true));
    expect(previewHost(fixture.main)).toBeNull();
    confirm.mockRestore();
  });

  it("settles a save onto a replacement main surface without losing the editor session", async () => {
    const pending = new Deferred<ReturnType<typeof editablePreview>>();
    const fixture = await mountPreviewFixture(
      [{ name: "surface.txt", relativePath: "surface.txt", kind: "file" }],
      () => editablePreview("before\n"),
      { save: () => pending.promise },
    );
    clickRow(fixture.shadow, "surface.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "after\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Saving"));

    const replacement = document.createElement("main");
    replacement.className = "main-surface";
    replacement.innerHTML = '<header data-app-shell-header-edge-scroll></header><article class="replacement-conversation"></article>';
    fixture.main.replaceWith(replacement);
    fixture.explorer.reconcileMainPreview(replacement);
    expect(replacement.querySelector(MAIN_PREVIEW_TAG)).toBeNull();

    pending.resolve(editablePreview("after\n", "b"));
    await vi.waitFor(() => expect(replacement.querySelector(MAIN_PREVIEW_TAG)?.shadowRoot?.querySelector("pre.literal-text")?.textContent).toBe("after\n"));
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Read only");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("cancels a queued replacement surface when the original main surface returns during a save", async () => {
    const pending = new Deferred<ReturnType<typeof editablePreview>>();
    const fixture = await mountPreviewFixture(
      [{ name: "surface.txt", relativePath: "surface.txt", kind: "file" }],
      () => editablePreview("before\n"),
      { save: () => pending.promise },
    );
    clickRow(fixture.shadow, "surface.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "after\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Saving"));

    const replacement = document.createElement("main");
    replacement.className = "main-surface";
    replacement.innerHTML = '<header data-app-shell-header-edge-scroll></header><article class="replacement-conversation"></article>';
    fixture.main.replaceWith(replacement);
    fixture.explorer.reconcileMainPreview(replacement);
    replacement.replaceWith(fixture.main);
    fixture.explorer.reconcileMainPreview(fixture.main);

    pending.resolve(editablePreview("after\n", "b"));
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector("pre.literal-text")?.textContent).toBe("after\n"));
    expect(fixture.main.isConnected).toBe(true);
    expect(replacement.isConnected).toBe(false);
    expect(replacement.querySelector(MAIN_PREVIEW_TAG)).toBeNull();
  });

  it("queues a native reconnect during save and applies the latest bootstrap after the draft is saved", async () => {
    const pending = new Deferred<ReturnType<typeof editablePreview>>();
    const fixture = await mountPreviewFixture(
      [{ name: "reconnect.txt", relativePath: "reconnect.txt", kind: "file" }],
      () => editablePreview("before\n"),
      { save: () => pending.promise },
    );
    clickRow(fixture.shadow, "reconnect.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "after\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Saving"));

    fixture.explorer.reconnectNative({
      token: "replacement-secret",
      codexVersion: "26.715.3651.0",
      channel: "stable",
    });
    expect(fixture.requests.some((request) => request.token === "replacement-secret")).toBe(false);

    pending.resolve(editablePreview("after\n", "b"));
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.token === "replacement-secret" && request.method === "explorer.settings.get",
    )).toBe(true));
    await vi.waitFor(() => expect(fixture.explorer.dataset.state).toBe("ready"));
    expect(fixture.requests.some(
      (request) => request.token === "replacement-secret" && request.method === "explorer.context",
    )).toBe(true);
  });

  it("cancels a queued native reconnect when the current bootstrap is reasserted", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "reconnect.txt", relativePath: "reconnect.txt", kind: "file" }],
      () => editablePreview("before\n"),
      { save: () => editablePreview("after\n", "b") },
    );
    clickRow(fixture.shadow, "reconnect.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "after\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fixture.explorer.reconnectNative({
      token: "stale-replacement-secret",
      codexVersion: "26.715.3651.0",
      channel: "stable",
    });
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    const { getBootstrapConfig } = await import("../src/bridge");
    fixture.explorer.reconnectNative(getBootstrapConfig());

    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Read only"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.requests.some((request) => request.token === "stale-replacement-secret")).toBe(false);
    expect(state(fixture.main).activePath).toBe("reconnect.txt");
    confirm.mockRestore();
  });

  it("keeps a conflicting draft in Editing mode and reloads only after confirmation", async () => {
    let diskText = "original\n";
    const fixture = await mountPreviewFixture(
      [{ name: "conflict.txt", relativePath: "conflict.txt", kind: "file" }],
      () => editablePreview(diskText, diskText === "original\n" ? "a" : "c"),
      {
        save: (message) => ({
          id: message.id,
          ok: false,
          error: { code: "CONFLICT", message: "native path must not be shown" },
        }),
      },
    );
    clickRow(fixture.shadow, "conflict.txt");
    await vi.waitFor(() => expect(fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.disabled).toBe(false));
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "my unsaved draft\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();

    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector(".editor-error")?.textContent).toContain("changed on disk"));
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("my unsaved draft\n");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
    expect(previewShadow(fixture.main).textContent).not.toContain("native path");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    diskText = "new disk text\n";
    previewShadow(fixture.main).querySelector<HTMLButtonElement>(".editor-reload")?.click();
    expect(fixture.requests.filter((request) => request.method === "explorer.preview")).toHaveLength(1);
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("my unsaved draft\n");

    confirm.mockReturnValue(true);
    previewShadow(fixture.main).querySelector<HTMLButtonElement>(".editor-reload")?.click();
    await waitForPreviewRequests(fixture.requests, 2);
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector("pre.literal-text")?.textContent).toBe(diskText));
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Read only");
    confirm.mockRestore();
  });

  it("protects a dirty draft when closing or activating another preview tab", async () => {
    const fixture = await mountPreviewFixture(
      ["a.txt", "b.txt"].map((name) => ({ name, relativePath: name, kind: "file" })),
      (message) => editablePreview(`${String(message.params.relativePath)}\n`),
    );
    clickRow(fixture.shadow, "a.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    clickRow(fixture.shadow, "b.txt");
    await waitForPreviewRequests(fixture.requests, 2);
    fileTab(fixture.main, "a.txt").click();
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "dirty a\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fixture.shadow.querySelector<HTMLElement>(".tree-shell")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(state(fixture.main).activePath).toBe("a.txt");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.getAttribute("aria-pressed")).toBe("true");
    fileTab(fixture.main, "b.txt").click();
    expect(state(fixture.main).activePath).toBe("a.txt");
    expect(fileTab(fixture.main, "a.txt").getAttribute("aria-selected")).toBe("true");
    closeFileTab(fixture.main, "a.txt");
    expect(state(fixture.main).tabs.map((tab) => tab.path)).toEqual(["a.txt", "b.txt"]);
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("dirty a\n");

    confirm.mockReturnValue(true);
    closeFileTab(fixture.main, "a.txt");
    expect(state(fixture.main).tabs.map((tab) => tab.path)).toEqual(["b.txt"]);
    expect(state(fixture.main).activePath).toBe("b.txt");
    confirm.mockRestore();
  });

  it("protects a dirty draft across task selection until discard is confirmed", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "task.txt", relativePath: "task.txt", kind: "file" }],
      () => editablePreview("task a\n"),
    );
    clickRow(fixture.shadow, "task.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "task draft\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const active = document.querySelector<HTMLElement>(".active-thread");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(fixture.requests.some((request) => request.method === "explorer.context" && request.params.threadId === THREAD_B)).toBe(false);
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("task draft\n");

    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_A}`);
    window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
      detail: { threadId: THREAD_A, hostId: "local", kind: "local" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    confirm.mockReturnValue(true);
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
      detail: { threadId: THREAD_B, hostId: "local", kind: "local" },
    }));
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.context" && request.params.threadId === THREAD_B,
    )).toBe(true));
    expect(previewHost(fixture.main)).toBeNull();
    confirm.mockRestore();
  });

  it("cancels a rejected queued task switch when the current task is selected again", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "task.txt", relativePath: "task.txt", kind: "file" }],
      () => editablePreview("task a\n"),
      { save: () => editablePreview("saved task a\n", "b") },
    );
    clickRow(fixture.shadow, "task.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "saved task a\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const active = document.querySelector<HTMLElement>(".active-thread");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_A}`);
    window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
      detail: { threadId: THREAD_A, hostId: "local", kind: "local" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Read only"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.requests.some(
      (request) => request.method === "explorer.context" && request.params.threadId === THREAD_B,
    )).toBe(false);
    expect(state(fixture.main).activePath).toBe("task.txt");
    confirm.mockRestore();
  });

  it("keeps watcher-modified drafts visible and disables editing for truncated previews", async () => {
    const fixture = await mountPreviewFixture(
      [
        { name: "watch.txt", relativePath: "watch.txt", kind: "file" },
        { name: "empty.txt", relativePath: "empty.txt", kind: "file" },
        { name: "large.txt", relativePath: "large.txt", kind: "file" },
      ],
      (message) => {
        if (message.params.relativePath === "empty.txt") return editablePreview("", "b", "none");
        if (message.params.relativePath === "large.txt") {
          return { ...editablePreview("partial", "c"), sizeBytes: 70_000, truncated: true };
        }
        return editablePreview("watch me\n");
      },
    );
    clickRow(fixture.shadow, "watch.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const editor = previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (editor) {
      editor.value = "watch draft\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    emit(fixture.listeners, {
      method: "explorer.changed",
      params: { changes: [{ relativePath: "watch.txt", kind: "modified" }] },
    });
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("watch draft\n");
    expect(previewShadow(fixture.main).querySelector(".editor-error")?.textContent).toContain("changed on disk");
    expect(fixture.requests.filter((request) => request.method === "explorer.preview")).toHaveLength(1);

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    clickRow(fixture.shadow, "empty.txt");
    await waitForPreviewRequests(fixture.requests, 2);
    await vi.waitFor(() => expect(fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.disabled).toBe(false));
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    expect(previewShadow(fixture.main).querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("");
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();

    clickRow(fixture.shadow, "large.txt");
    await waitForPreviewRequests(fixture.requests, 3);
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector(".preview-metadata")?.textContent).toContain("Preview truncated"));
    expect(fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.disabled).toBe(true);
    expect(previewShadow(fixture.main).querySelector("textarea.code-editor")).toBeNull();
    confirm.mockRestore();
  });

  it("invalidates and reloads a clean editor after a watcher overflow resync", async () => {
    let diskText = "before\n";
    let diskVersion = "a";
    const fixture = await mountPreviewFixture(
      [{ name: "clean.txt", relativePath: "clean.txt", kind: "file" }],
      () => editablePreview(diskText, diskVersion),
    );
    clickRow(fixture.shadow, "clean.txt");
    await waitForPreviewRequests(fixture.requests, 1);
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    diskText = "after\n";
    diskVersion = "b";
    emit(fixture.listeners, { method: "explorer.resync", params: {} });
    expect(previewShadow(fixture.main).querySelector(".editor-error")?.textContent).toContain("changed on disk");

    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    await waitForPreviewRequests(fixture.requests, 2);
    await vi.waitFor(() => expect(previewShadow(fixture.main).querySelector("pre.literal-text")?.textContent).toBe(diskText));
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("does not request file text without one unique verified main surface", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "safe.txt", relativePath: "safe.txt", kind: "file" }],
      () => ({ kind: "text", text: "must not load", sizeBytes: 13, truncated: false }),
      { duplicateMain: true },
    );
    clickRow(fixture.shadow, "safe.txt");
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(fixture.requests.filter((request) => request.method === "explorer.preview")).toHaveLength(0);
    expect(previewHost(fixture.main)).toBeNull();
  });

  it("does not request file text when the only verified main surface is hidden", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "safe.txt", relativePath: "safe.txt", kind: "file" }],
      () => ({ kind: "text", text: "must not load", sizeBytes: 13, truncated: false }),
      { hiddenMain: true },
    );
    clickRow(fixture.shadow, "safe.txt");
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(fixture.requests.filter((request) => request.method === "explorer.preview")).toHaveLength(0);
    expect(previewHost(fixture.main)).toBeNull();
  });

  it("mirrors explicit theme changes onto the main preview host", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "theme.css", relativePath: "theme.css", kind: "file" }],
      () => ({ kind: "text", text: ":root {}", sizeBytes: 8, truncated: false }),
      { theme: "light" },
    );
    clickRow(fixture.shadow, "theme.css");
    expect(previewHost(fixture.main)?.dataset.theme).toBe("light");

    document.documentElement.dataset.theme = "dark";
    await vi.waitFor(() => expect(previewHost(fixture.main)?.dataset.theme).toBe("dark"));
  });

  it("collapses a drawer after opening a file while keeping the main preview available", async () => {
    const fixture = await mountPreviewFixture(
      [{ name: "drawer.txt", relativePath: "drawer.txt", kind: "file" }],
      () => ({ kind: "text", text: "drawer preview", sizeBytes: 14, truncated: false }),
      { forceDrawer: true },
    );
    clickRow(fixture.shadow, "drawer.txt");
    expect(fixture.explorer.dataset.placement).toBe("drawer");
    expect(fixture.explorer.dataset.collapsed).toBe("true");
    expect(previewHost(fixture.main)).not.toBeNull();
    await waitForPreviewRequests(fixture.requests, 1);
  });
});
