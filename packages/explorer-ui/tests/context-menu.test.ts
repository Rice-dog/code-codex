import { describe, expect, it, vi } from "vitest";
import type { CodeCodexElement } from "../src/explorer-element";
import type { BridgeMessage, BridgeRequest, TreeNodeInput } from "../src/types";

const THREAD_A = "11111111-1111-4111-8111-111111111111";
const THREAD_B = "22222222-2222-4222-8222-222222222222";

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

interface ContextMenuFixture {
  explorer: CodeCodexElement;
  shadow: ShadowRoot;
  main: HTMLElement;
  requests: BridgeRequest[];
  listeners: Set<(message: BridgeMessage) => void>;
}

interface ContextMenuFixtureOptions {
  root?: TreeNodeInput[];
  directories?: Record<string, TreeNodeInput[]>;
  entryAction?: (request: BridgeRequest) => unknown;
}

async function mountFixture(options: ContextMenuFixtureOptions = {}): Promise<ContextMenuFixture> {
  vi.resetModules();
  window.__CODE_CODEX_BOOTSTRAP__ = {
    token: "context-menu-secret",
    codexVersion: "26.715.4045.0",
    compatible: true,
  };
  const root = options.root ?? [
    { name: "src", relativePath: "src", kind: "directory" },
    { name: "notes.txt", relativePath: "notes.txt", kind: "file" },
  ];
  const directories = options.directories ?? {
    src: [{ name: "nested.txt", relativePath: "src/nested.txt", kind: "file" }],
  };
  const requests: BridgeRequest[] = [];
  const listeners = new Set<(message: BridgeMessage) => void>();

  window.__codeCodex = {
    request(message) {
      requests.push(message);
      if (message.method === "explorer.settings.get") return { panelWidth: 260, collapsed: false };
      if (message.method === "explorer.context") {
        const threadId = String(message.params.threadId);
        return { threadId, projectName: "Menu fixture", rootName: "menu-fixture", rootPath: "C:\\workspace", compatible: true };
      }
      if (message.method === "explorer.list") {
        const path = String(message.params.relativePath ?? "");
        return { entries: path ? (directories[path] ?? []) : root };
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
      if (message.method.startsWith("explorer.entry.")) return options.entryAction?.(message) ?? { ok: true };
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
    <button data-app-shell-sidebar-trigger></button>
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
  const expectedState = root.length ? "ready" : "empty";
  await vi.waitFor(() => expect(explorer?.dataset.state).toBe(expectedState));
  const shadow = explorer?.shadowRoot;
  const main = document.querySelector<HTMLElement>("main.main-surface");
  if (!explorer || !shadow || !main) throw new Error("Context-menu fixture did not mount.");
  return { explorer, shadow, main, requests, listeners };
}

function menu(shadow: ShadowRoot): HTMLElement {
  const element = shadow.querySelector<HTMLElement>(".context-menu");
  if (!element) throw new Error("Context menu is missing.");
  return element;
}

function menuLabels(shadow: ShadowRoot): string[] {
  return Array.from(menu(shadow).querySelectorAll<HTMLElement>(".context-menu-label"), (label) => label.textContent ?? "");
}

function menuAction(shadow: ShadowRoot, action: string): HTMLButtonElement {
  const button = menu(shadow).querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`Missing context-menu action: ${action}`);
  return button;
}

function contextDialog(shadow: ShadowRoot): HTMLFormElement {
  const form = menu(shadow).querySelector<HTMLFormElement>("form.context-menu-dialog");
  if (!form) throw new Error("Context-menu dialog is missing.");
  return form;
}

function dialogInput(shadow: ShadowRoot): HTMLInputElement {
  const input = contextDialog(shadow).querySelector<HTMLInputElement>("[data-dialog-name]");
  if (!input) throw new Error("Context-menu name input is missing.");
  return input;
}

async function beginNameDialog(shadow: ShadowRoot, action: "new-file" | "new-folder" | "rename"): Promise<HTMLInputElement> {
  menuAction(shadow, action).click();
  await vi.waitFor(() => expect(menu(shadow).getAttribute("role")).toBe("dialog"));
  const input = dialogInput(shadow);
  await vi.waitFor(() => expect(shadow.activeElement).toBe(input));
  return input;
}

function setDialogName(shadow: ShadowRoot, value: string): void {
  const input = dialogInput(shadow);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function submitDialog(shadow: ShadowRoot): void {
  const form = contextDialog(shadow);
  expect(form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))).toBe(false);
}

function cancelDialog(shadow: ShadowRoot): void {
  const cancel = contextDialog(shadow).querySelector<HTMLButtonElement>('[data-dialog-action="cancel"]');
  if (!cancel) throw new Error("Context-menu cancel button is missing.");
  cancel.click();
}

function actionNotice(shadow: ShadowRoot): HTMLElement {
  const notice = shadow.querySelector<HTMLElement>(".action-notice");
  if (!notice) throw new Error("Action notice is missing.");
  return notice;
}

function openRowMenu(shadow: ShadowRoot, path: string, clientX = 40, clientY = 60): HTMLElement {
  const row = shadow.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (!row) throw new Error(`Missing tree row: ${path}`);
  const dispatched = row.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  }));
  expect(dispatched).toBe(false);
  expect(menu(shadow).hidden).toBe(false);
  return row;
}

function openRootMenu(shadow: ShadowRoot, clientX = 40, clientY = 60): void {
  const shell = shadow.querySelector<HTMLElement>(".tree-shell");
  if (!shell) throw new Error("Tree shell is missing.");
  expect(shell.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  }))).toBe(false);
  expect(menu(shadow).hidden).toBe(false);
}

function clickRow(shadow: ShadowRoot, path: string): void {
  const row = shadow.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (!row) throw new Error(`Missing tree row: ${path}`);
  row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
}

function entryRequests(requests: BridgeRequest[], method: string): BridgeRequest[] {
  return requests.filter((request) => request.method === method);
}

class DataTransferStub {
  effectAllowed = "none";
  dropEffect = "none";
  readonly files: File[] = [];
  readonly items: DataTransferItem[] = [];
  #data = new Map<string, string>();

  get types(): string[] {
    return [...this.#data.keys()];
  }

  setData(type: string, value: string): void {
    this.#data.set(type, value);
  }

  getData(type: string): string {
    return this.#data.get(type) ?? "";
  }

  clearData(type?: string): void {
    if (type) this.#data.delete(type);
    else this.#data.clear();
  }

  setDragImage(): void {}
}

function dispatchDrag(
  target: Element,
  type: "dragstart" | "dragover" | "dragleave" | "drop" | "dragend",
  transfer: DataTransferStub,
  relatedTarget: EventTarget | null = null,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { configurable: true, value: transfer },
    relatedTarget: { configurable: true, value: relatedTarget },
  });
  target.dispatchEvent(event);
  return event;
}

describe("explorer context menu", () => {
  it("replaces the native menu with exact file actions and previews a stable virtualized target", async () => {
    const fixture = await mountFixture();
    const row = openRowMenu(fixture.shadow, "notes.txt");

    expect(menuLabels(fixture.shadow)).toEqual([
      "Preview",
      "New File",
      "New Folder",
      "Rename",
      "Delete",
      "Copy Relative Path",
      "Copy Absolute Path",
      "Reveal in File Explorer",
    ]);
    expect(Array.from(menu(fixture.shadow).querySelectorAll(".context-menu-item")).every(
      (item) => item.querySelector(".context-menu-icon svg") !== null,
    )).toBe(true);
    expect(fixture.shadow.querySelector('[data-path="notes.txt"]')).not.toBe(row);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]')?.dataset.contextTarget).toBe("true");
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]')?.dataset.active).toBe("true");

    menuAction(fixture.shadow, "preview").click();
    await vi.waitFor(() => expect(
      fixture.requests.some((request) => request.method === "explorer.preview" && request.params.relativePath === "notes.txt"),
    ).toBe(true));
    expect(menu(fixture.shadow).hidden).toBe(true);
  });

  it("shows folder and root actions and clamps the rounded menu inside the explorer frame", async () => {
    const fixture = await mountFixture();
    const frame = fixture.shadow.querySelector<HTMLElement>(".frame");
    if (!frame) throw new Error("Frame is missing.");
    Object.defineProperty(frame, "clientWidth", { configurable: true, value: 260 });
    Object.defineProperty(frame, "clientHeight", { configurable: true, value: 300 });
    frame.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 260, bottom: 300, width: 260, height: 300, toJSON: () => ({}),
    });

    openRowMenu(fixture.shadow, "src", 999, 999);
    expect(menuLabels(fixture.shadow)).toEqual([
      "New File",
      "New Folder",
      "Rename",
      "Delete",
      "Copy Relative Path",
      "Copy Absolute Path",
      "Reveal in File Explorer",
      "Refresh",
    ]);
    expect(menu(fixture.shadow).style.left).toBe("46px");
    expect(menu(fixture.shadow).style.top).toBe("19px");

    menuAction(fixture.shadow, "refresh").click();
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.list" && request.params.relativePath === "src",
    )).toBe(true));
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    openRootMenu(fixture.shadow);
    expect(menuLabels(fixture.shadow)).toEqual(["New File", "New Folder", "Refresh"]);
    window.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(menu(fixture.shadow).hidden).toBe(true);
  });

  it("creates beside files, inside folders, and at an empty project root while rejecting blank names", async () => {
    const fixture = await mountFixture();

    openRowMenu(fixture.shadow, "notes.txt");
    await beginNameDialog(fixture.shadow, "new-file");
    setDialogName(fixture.shadow, "sibling.ts");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.create")[0]?.params).toEqual({
      parentRelativePath: "",
      name: "sibling.ts",
      kind: "file",
    });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(actionNotice(fixture.shadow).textContent).toContain("sibling.ts");

    openRowMenu(fixture.shadow, "notes.txt");
    await beginNameDialog(fixture.shadow, "new-folder");
    setDialogName(fixture.shadow, "sibling-folder");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(2));
    expect(entryRequests(fixture.requests, "explorer.entry.create")[1]?.params).toEqual({
      parentRelativePath: "",
      name: "sibling-folder",
      kind: "directory",
    });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));

    openRowMenu(fixture.shadow, "src");
    await beginNameDialog(fixture.shadow, "new-folder");
    setDialogName(fixture.shadow, "components");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(3));
    expect(entryRequests(fixture.requests, "explorer.entry.create")[2]?.params).toEqual({
      parentRelativePath: "src",
      name: "components",
      kind: "directory",
    });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));

    openRootMenu(fixture.shadow);
    await beginNameDialog(fixture.shadow, "new-file");
    setDialogName(fixture.shadow, "root-file.txt");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(4));
    expect(entryRequests(fixture.requests, "explorer.entry.create")[3]?.params).toEqual({
      parentRelativePath: "",
      name: "root-file.txt",
      kind: "file",
    });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));

    openRootMenu(fixture.shadow);
    await beginNameDialog(fixture.shadow, "new-file");
    setDialogName(fixture.shadow, "   ");
    submitDialog(fixture.shadow);
    expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(4);
    expect(menu(fixture.shadow).hidden).toBe(false);
    expect(dialogInput(fixture.shadow).getAttribute("aria-invalid")).toBe("true");
    expect(contextDialog(fixture.shadow).querySelector<HTMLElement>(".context-dialog-error")?.hidden).toBe(false);
    expect(contextDialog(fixture.shadow).querySelector(".context-dialog-error")?.textContent).toBe("Enter a name.");
    setDialogName(fixture.shadow, "valid.txt");
    expect(contextDialog(fixture.shadow).querySelector<HTMLElement>(".context-dialog-error")?.hidden).toBe(true);
    cancelDialog(fixture.shadow);
    expect(menu(fixture.shadow).hidden).toBe(true);

    fixture.explorer.remove();
    const empty = await mountFixture({ root: [] });
    const state = empty.shadow.querySelector<HTMLElement>(".state");
    if (!state) throw new Error("Empty state is missing.");
    expect(state.tabIndex).toBe(0);
    state.focus();
    expect(state.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }))).toBe(false);
    menu(empty.shadow).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(empty.shadow.activeElement).toBe(state);
    expect(state.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))).toBe(false);
    await beginNameDialog(empty.shadow, "new-file");
    setDialogName(empty.shadow, "README.md");
    submitDialog(empty.shadow);
    await vi.waitFor(() => expect(entryRequests(empty.requests, "explorer.entry.create")).toHaveLength(1));
    expect(entryRequests(empty.requests, "explorer.entry.create")[0]?.params).toEqual({
      parentRelativePath: "",
      name: "README.md",
      kind: "file",
    });
  });

  it("rejects Windows-invalid names inline without sending a native mutation", async () => {
    const fixture = await mountFixture();
    openRootMenu(fixture.shadow);
    await beginNameDialog(fixture.shadow, "new-file");

    for (const invalid of ["CON.txt", "nested/file.txt", "bad<name.txt", "trailing.", "a".repeat(256)]) {
      setDialogName(fixture.shadow, invalid);
      submitDialog(fixture.shadow);
      expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(0);
      expect(dialogInput(fixture.shadow).getAttribute("aria-invalid")).toBe("true");
      expect(contextDialog(fixture.shadow).querySelector<HTMLElement>(".context-dialog-error")?.hidden).toBe(false);
    }
  });

  it("renames, confirms Delete only on activation, closes an affected preview, and refreshes its parent", async () => {
    const fixture = await mountFixture();
    const rootListsBefore = fixture.requests.filter(
      (request) => request.method === "explorer.list" && request.params.relativePath === "",
    ).length;

    openRowMenu(fixture.shadow, "notes.txt");
    const renameInput = await beginNameDialog(fixture.shadow, "rename");
    expect(renameInput.value).toBe("notes.txt");
    expect(renameInput.selectionStart).toBe(0);
    expect(renameInput.selectionEnd).toBe("notes".length);
    expect(entryRequests(fixture.requests, "explorer.entry.rename")).toHaveLength(0);
    setDialogName(fixture.shadow, "journal.txt");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.rename")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.rename")[0]?.params).toEqual({
      relativePath: "notes.txt",
      newName: "journal.txt",
    });
    await vi.waitFor(() => expect(fixture.requests.filter(
      (request) => request.method === "explorer.list" && request.params.relativePath === "",
    )).toHaveLength(rootListsBefore + 1));
    expect(actionNotice(fixture.shadow).textContent).toContain("renamed to journal.txt");

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "delete").click();
    expect(contextDialog(fixture.shadow).dataset.dialogKind).toBe("confirm-delete");
    expect(entryRequests(fixture.requests, "explorer.entry.delete")).toHaveLength(0);
    cancelDialog(fixture.shadow);
    expect(menu(fixture.shadow).hidden).toBe(true);
    expect(entryRequests(fixture.requests, "explorer.entry.delete")).toHaveLength(0);

    clickRow(fixture.shadow, "notes.txt");
    await vi.waitFor(() => expect(fixture.main.querySelector("code-codex-main-preview")).not.toBeNull());
    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "delete").click();
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.delete")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.delete")[0]?.params).toEqual({ relativePath: "notes.txt" });
    await vi.waitFor(() => expect(fixture.main.querySelector("code-codex-main-preview")).toBeNull());
    expect(actionNotice(fixture.shadow).textContent).toContain("notes.txt deleted");
  });

  it("copies a relative path and reveals the exact stable path through the native contract", async () => {
    const fixture = await mountFixture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "copy-relative").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("notes.txt"));
    expect(entryRequests(fixture.requests, "explorer.entry.reveal")).toHaveLength(0);
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(actionNotice(fixture.shadow).hidden).toBe(false);
    expect(actionNotice(fixture.shadow).textContent).toBe("Relative path copied");

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "reveal").click();
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.reveal")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.reveal")[0]?.params).toEqual({ relativePath: "notes.txt" });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(actionNotice(fixture.shadow).textContent).toBe("Opened in File Explorer");
    Reflect.deleteProperty(window.navigator, "clipboard");
  });

  it("copies the absolute path locally without any bridge round-trip", async () => {
    const fixture = await mountFixture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "copy-absolute").click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("C:\\workspace\\notes.txt"));
    // The path is built from the context root; no entry request is ever sent.
    expect(fixture.requests.filter((request) => request.method.startsWith("explorer.entry."))).toHaveLength(0);
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(actionNotice(fixture.shadow).textContent).toBe("Absolute path copied");
    Reflect.deleteProperty(window.navigator, "clipboard");
  });

  it("joins nested paths with the workspace separator for the whole selection", async () => {
    const fixture = await mountFixture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });

    // Expand src so a nested file is visible, then multi-select two files.
    fixture.shadow.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector('[data-path="src/nested.txt"]')).not.toBeNull());

    // Ctrl-click both (additive selection, without opening a preview tab).
    fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }));
    fixture.shadow.querySelector<HTMLElement>('[data-path="src/nested.txt"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }));

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "copy-absolute").click();

    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("C:\\workspace\\notes.txt\r\nC:\\workspace\\src\\nested.txt"),
    );
    await vi.waitFor(() => expect(actionNotice(fixture.shadow).textContent).toBe("2 absolute paths copied"));
    Reflect.deleteProperty(window.navigator, "clipboard");
  });

  it("falls back when Clipboard API writing is rejected and exposes action failures visibly", async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
    const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    const fixture = await mountFixture({
      entryAction(request) {
        if (request.method === "explorer.entry.reveal") {
          return {
            id: request.id,
            ok: false,
            error: { code: "ACCESS_DENIED", message: "Reveal failed" },
          };
        }
        return { ok: true };
      },
    });

    try {
      openRowMenu(fixture.shadow, "notes.txt");
      menuAction(fixture.shadow, "copy-relative").click();
      await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
      expect(writeText).toHaveBeenCalledWith("notes.txt");
      expect(actionNotice(fixture.shadow).textContent).toBe("Relative path copied");

      openRowMenu(fixture.shadow, "notes.txt");
      menuAction(fixture.shadow, "reveal").click();
      await vi.waitFor(() => expect(menu(fixture.shadow).getAttribute("aria-busy")).toBe("false"));
      expect(menu(fixture.shadow).hidden).toBe(false);
      expect(actionNotice(fixture.shadow).hidden).toBe(false);
      expect(actionNotice(fixture.shadow).dataset.tone).toBe("error");
      expect(actionNotice(fixture.shadow).textContent).toBe(
        "The item could not be changed because Windows denied access.",
      );
    } finally {
      if (clipboardDescriptor) Object.defineProperty(window.navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(window.navigator, "clipboard");
      if (execCommandDescriptor) Object.defineProperty(document, "execCommand", execCommandDescriptor);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("supports keyboard invocation and navigation and dismisses on Escape, scroll, resize, reconnect, and detach", async () => {
    const fixture = await mountFixture();
    const tree = fixture.shadow.querySelector<HTMLElement>(".tree-shell");
    if (!tree) throw new Error("Tree shell is missing.");
    tree.focus();
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fixture.shadow.activeElement?.textContent).toContain("Preview"));

    menu(fixture.shadow).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(fixture.shadow.activeElement?.textContent).toContain("New File");
    menu(fixture.shadow).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(fixture.shadow.activeElement?.textContent).toContain("Reveal in File Explorer");
    menu(fixture.shadow).dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(fixture.shadow.activeElement?.textContent).toContain("Preview");
    menu(fixture.shadow).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(menu(fixture.shadow).hidden).toBe(true);
    expect(fixture.shadow.activeElement).toBe(tree);

    tree.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
    tree.dispatchEvent(new Event("scroll"));
    expect(menu(fixture.shadow).hidden).toBe(true);
    openRowMenu(fixture.shadow, "notes.txt");
    window.dispatchEvent(new Event("resize"));
    expect(menu(fixture.shadow).hidden).toBe(true);
    openRowMenu(fixture.shadow, "notes.txt");
    fixture.explorer.reconnectNative({ token: "replacement", codexVersion: "26.715.4045.0", compatible: true });
    expect(menu(fixture.shadow).hidden).toBe(true);
    await vi.waitFor(() => expect(fixture.explorer.dataset.state).toBe("ready"));
    openRowMenu(fixture.shadow, "notes.txt");
    fixture.explorer.remove();
    expect(menu(fixture.shadow).hidden).toBe(true);
  });

  it("keeps focus inside an action dialog and restores tree focus on Escape or Cancel", async () => {
    const fixture = await mountFixture();
    const tree = fixture.shadow.querySelector<HTMLElement>(".tree-shell");
    if (!tree) throw new Error("Tree shell is missing.");

    openRowMenu(fixture.shadow, "notes.txt");
    const input = await beginNameDialog(fixture.shadow, "rename");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    input.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect((fixture.shadow.activeElement as HTMLElement | null)?.dataset.dialogAction).toBe("cancel");

    menu(fixture.shadow).dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(menu(fixture.shadow).hidden).toBe(true);
    expect(fixture.shadow.activeElement).toBe(tree);

    openRowMenu(fixture.shadow, "notes.txt");
    menuAction(fixture.shadow, "delete").click();
    await vi.waitFor(() => expect(
      (fixture.shadow.activeElement as HTMLElement | null)?.dataset.dialogAction,
    ).toBe("cancel"));
    cancelDialog(fixture.shadow);
    expect(menu(fixture.shadow).hidden).toBe(true);
    expect(fixture.shadow.activeElement).toBe(tree);
  });

  it("disables every command and suppresses duplicate activation while an action is pending", async () => {
    const pending = new Deferred<{ ok: boolean }>();
    const fixture = await mountFixture({
      entryAction(request) {
        return request.method === "explorer.entry.reveal" ? pending.promise : { ok: true };
      },
    });

    openRowMenu(fixture.shadow, "notes.txt");
    const reveal = menuAction(fixture.shadow, "reveal");
    reveal.click();
    reveal.click();
    expect(entryRequests(fixture.requests, "explorer.entry.reveal")).toHaveLength(1);
    expect(menu(fixture.shadow).getAttribute("aria-busy")).toBe("true");
    expect(Array.from(menu(fixture.shadow).querySelectorAll<HTMLButtonElement>("button")).every((button) => button.disabled)).toBe(true);

    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(menu(fixture.shadow).getAttribute("aria-busy")).toBe("false");
  });

  it("disables dialog controls and suppresses duplicate mutation submits while pending", async () => {
    const pending = new Deferred<{ ok: boolean }>();
    const fixture = await mountFixture({
      entryAction(request) {
        return request.method === "explorer.entry.create" ? pending.promise : { ok: true };
      },
    });

    openRootMenu(fixture.shadow);
    await beginNameDialog(fixture.shadow, "new-file");
    setDialogName(fixture.shadow, "pending.txt");
    submitDialog(fixture.shadow);
    submitDialog(fixture.shadow);

    expect(entryRequests(fixture.requests, "explorer.entry.create")).toHaveLength(1);
    expect(menu(fixture.shadow).getAttribute("aria-busy")).toBe("true");
    expect(Array.from(
      menu(fixture.shadow).querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input"),
    ).every((control) => control.disabled)).toBe(true);

    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
    expect(actionNotice(fixture.shadow).textContent).toContain("pending.txt created");
  });

  it("shows a mutation result after the dialog is dismissed while its request is pending", async () => {
    const pending = new Deferred<{ ok: boolean }>();
    const fixture = await mountFixture({
      entryAction(request) {
        return request.method === "explorer.entry.create" ? pending.promise : { ok: true };
      },
    });

    openRootMenu(fixture.shadow);
    await beginNameDialog(fixture.shadow, "new-file");
    setDialogName(fixture.shadow, "background.txt");
    submitDialog(fixture.shadow);
    window.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(menu(fixture.shadow).hidden).toBe(true);

    pending.resolve({ ok: true });
    await vi.waitFor(() => expect(actionNotice(fixture.shadow).textContent).toContain("background.txt created"));
    expect(actionNotice(fixture.shadow).hidden).toBe(false);
  });

  it("protects a dirty descendant before folder rename and closes descendant tabs after confirmation", async () => {
    const fixture = await mountFixture();
    fixture.shadow.querySelector<HTMLElement>('[data-path="src"] [data-action="toggle"]')?.click();
    await vi.waitFor(() => expect(fixture.shadow.querySelector('[data-path="src/nested.txt"]')).not.toBeNull());
    clickRow(fixture.shadow, "src/nested.txt");
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.preview" && request.params.relativePath === "src/nested.txt",
    )).toBe(true));
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const preview = fixture.main.querySelector("code-codex-main-preview");
    const editor = preview?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (!editor) throw new Error("Editable descendant preview is missing.");
    editor.value = "unsaved descendant\n";
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    openRowMenu(fixture.shadow, "src");
    await beginNameDialog(fixture.shadow, "rename");
    setDialogName(fixture.shadow, "source");
    submitDialog(fixture.shadow);
    expect(contextDialog(fixture.shadow).dataset.dialogKind).toBe("confirm-rename");
    expect(entryRequests(fixture.requests, "explorer.entry.rename")).toHaveLength(0);
    expect(preview?.shadowRoot?.querySelector("textarea.code-editor")).not.toBeNull();
    cancelDialog(fixture.shadow);

    openRowMenu(fixture.shadow, "src");
    await beginNameDialog(fixture.shadow, "rename");
    setDialogName(fixture.shadow, "source");
    submitDialog(fixture.shadow);
    expect(contextDialog(fixture.shadow).dataset.dialogKind).toBe("confirm-rename");
    submitDialog(fixture.shadow);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.rename")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.rename")[0]?.params).toEqual({
      relativePath: "src",
      newName: "source",
    });
    await vi.waitFor(() => expect(fixture.main.querySelector("code-codex-main-preview")).toBeNull());
  });

  it.each(["rename", "delete"] as const)("keeps an unsaved draft when %s is rejected", async (action) => {
    const fixture = await mountFixture({
      entryAction(request) {
        if (request.method === `explorer.entry.${action}`) {
          return {
            id: request.id,
            ok: false,
            error: { code: "CONFLICT", message: "Rejected mutation" },
          };
        }
        return { ok: true };
      },
    });
    clickRow(fixture.shadow, "notes.txt");
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.preview" && request.params.relativePath === "notes.txt",
    )).toBe(true));
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const preview = fixture.main.querySelector("code-codex-main-preview");
    const editor = preview?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (!editor) throw new Error("Editable preview is missing.");
    editor.value = "draft that must survive\n";
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    openRowMenu(fixture.shadow, "notes.txt");
    if (action === "rename") {
      await beginNameDialog(fixture.shadow, "rename");
      setDialogName(fixture.shadow, "journal.txt");
      submitDialog(fixture.shadow);
      expect(contextDialog(fixture.shadow).dataset.dialogKind).toBe("confirm-rename");
    } else {
      menuAction(fixture.shadow, "delete").click();
      expect(contextDialog(fixture.shadow).dataset.dialogKind).toBe("confirm-delete");
    }
    submitDialog(fixture.shadow);

    await vi.waitFor(() => expect(entryRequests(fixture.requests, `explorer.entry.${action}`)).toHaveLength(1));
    await vi.waitFor(() => expect(menu(fixture.shadow).getAttribute("aria-busy")).toBe("false"));
    expect(menu(fixture.shadow).hidden).toBe(false);
    expect(contextDialog(fixture.shadow).querySelector<HTMLElement>(".context-dialog-error")?.hidden).toBe(false);
    expect(contextDialog(fixture.shadow).querySelector(".context-dialog-error")?.textContent).toBe(
      action === "rename"
        ? "An item with that name already exists."
        : "The item changed before it could be deleted. Refresh and try again.",
    );
    expect(preview?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value)
      .toBe("draft that must survive\n");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
  });

  it("dismisses immediately when the active task changes", async () => {
    const fixture = await mountFixture();
    openRowMenu(fixture.shadow, "notes.txt");
    const active = document.querySelector<HTMLElement>("[data-app-action-sidebar-thread-active]");
    active?.setAttribute("data-app-action-sidebar-thread-id", `local:${THREAD_B}`);
    window.dispatchEvent(new CustomEvent("code-codex:thread-change", {
      detail: { threadId: THREAD_B, hostId: "local", kind: "local" },
    }));
    await vi.waitFor(() => expect(menu(fixture.shadow).hidden).toBe(true));
  });
});

describe("explorer drag and drop", () => {
  it("moves a file into a folder with the exact bounded request and refreshes both parents", async () => {
    const fixture = await mountFixture({
      root: [
        { name: "archive", relativePath: "archive", kind: "directory" },
        { name: "notes.txt", relativePath: "notes.txt", kind: "file" },
      ],
      directories: { archive: [] },
    });
    const source = fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]');
    const destination = fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]');
    if (!source || !destination) throw new Error("Drag fixture rows are missing.");
    const transfer = new DataTransferStub();

    const started = dispatchDrag(source, "dragstart", transfer);
    expect(started.defaultPrevented).toBe(false);
    expect(transfer.effectAllowed).toBe("move");
    expect(transfer.getData("application/x-code-codex-entry")).toBe("notes.txt");
    expect(source.dataset.dragSource).toBe("true");

    const hovered = dispatchDrag(destination, "dragover", transfer);
    expect(hovered.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    expect(destination.dataset.dropTarget).toBe("true");

    const dropped = dispatchDrag(destination, "drop", transfer);
    expect(dropped.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.move")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.move")[0]?.params).toEqual({
      relativePath: "notes.txt",
      destinationParentRelativePath: "archive",
    });
    await vi.waitFor(() => expect(actionNotice(fixture.shadow).textContent).toBe("notes.txt moved to archive"));
    const listPaths = fixture.requests
      .filter((request) => request.method === "explorer.list")
      .map((request) => request.params.relativePath);
    expect(listPaths.filter((path) => path === "").length).toBeGreaterThanOrEqual(2);
    expect(listPaths).toContain("archive");
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("moves a nested file back to the project root by dropping on the header", async () => {
    const fixture = await mountFixture({
      root: [{ name: "src", relativePath: "src", kind: "directory" }],
      directories: {
        src: [{ name: "nested.txt", relativePath: "src/nested.txt", kind: "file" }],
      },
    });
    const folder = fixture.shadow.querySelector<HTMLElement>('[data-path="src"]');
    folder?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.waitFor(() => expect(fixture.shadow.querySelector('[data-path="src/nested.txt"]')).not.toBeNull());
    const source = fixture.shadow.querySelector<HTMLElement>('[data-path="src/nested.txt"]');
    const masthead = fixture.shadow.querySelector<HTMLElement>(".masthead");
    if (!source || !masthead) throw new Error("Root-drop fixture is incomplete.");
    const transfer = new DataTransferStub();

    dispatchDrag(source, "dragstart", transfer);
    const hovered = dispatchDrag(masthead, "dragover", transfer);
    expect(hovered.defaultPrevented).toBe(true);
    expect(masthead.dataset.dropTarget).toBe("true");
    dispatchDrag(masthead, "drop", transfer);

    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.move")).toHaveLength(1));
    expect(entryRequests(fixture.requests, "explorer.entry.move")[0]?.params).toEqual({
      relativePath: "src/nested.txt",
      destinationParentRelativePath: "",
    });
  });

  it("expands a closed folder after a sustained valid hover", async () => {
    const fixture = await mountFixture({
      root: [
        { name: "archive", relativePath: "archive", kind: "directory" },
        { name: "notes.txt", relativePath: "notes.txt", kind: "file" },
      ],
      directories: { archive: [] },
    });
    vi.useFakeTimers();
    const source = fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]');
    const destination = fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]');
    if (!source || !destination) throw new Error("Hover fixture rows are missing.");
    const transfer = new DataTransferStub();

    dispatchDrag(source, "dragstart", transfer);
    dispatchDrag(destination, "dragover", transfer);
    await vi.advanceTimersByTimeAsync(651);
    await Promise.resolve();

    expect(entryRequests(fixture.requests, "explorer.list").some(
      (request) => request.params.relativePath === "archive",
    )).toBe(true);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]')?.getAttribute("aria-expanded")).toBe("true");
    dispatchDrag(source, "dragend", transfer);
  });

  it("rejects same-parent, self, descendant, file-row, and external drops", async () => {
    const fixture = await mountFixture({
      root: [
        { name: "src", relativePath: "src", kind: "directory" },
        { name: "plain.txt", relativePath: "plain.txt", kind: "file" },
      ],
      directories: {
        src: [
          { name: "child", relativePath: "src/child", kind: "directory" },
          { name: "inside.txt", relativePath: "src/inside.txt", kind: "file" },
        ],
        "src/child": [],
      },
    });
    const initialSrc = fixture.shadow.querySelector<HTMLElement>('[data-path="src"]');
    initialSrc?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.waitFor(() => expect(fixture.shadow.querySelector('[data-path="src/child"]')).not.toBeNull());
    const src = fixture.shadow.querySelector<HTMLElement>('[data-path="src"]');
    const child = fixture.shadow.querySelector<HTMLElement>('[data-path="src/child"]');
    const inside = fixture.shadow.querySelector<HTMLElement>('[data-path="src/inside.txt"]');
    const plain = fixture.shadow.querySelector<HTMLElement>('[data-path="plain.txt"]');
    if (!src || !child || !inside || !plain) throw new Error("Invalid-drop fixture is incomplete.");

    let transfer = new DataTransferStub();
    dispatchDrag(inside, "dragstart", transfer);
    expect(dispatchDrag(src, "dragover", transfer).defaultPrevented).toBe(false);
    dispatchDrag(src, "drop", transfer);

    transfer = new DataTransferStub();
    dispatchDrag(src, "dragstart", transfer);
    expect(dispatchDrag(src, "dragover", transfer).defaultPrevented).toBe(false);
    expect(dispatchDrag(child, "dragover", transfer).defaultPrevented).toBe(false);
    expect(dispatchDrag(plain, "dragover", transfer).defaultPrevented).toBe(false);
    dispatchDrag(child, "drop", transfer);

    transfer = new DataTransferStub();
    transfer.setData("text/plain", "C:\\outside.txt");
    expect(dispatchDrag(src, "dragover", transfer).defaultPrevented).toBe(false);
    dispatchDrag(src, "drop", transfer);

    await Promise.resolve();
    expect(entryRequests(fixture.requests, "explorer.entry.move")).toHaveLength(0);
  });

  it("shows native move conflicts and leaves the source row available", async () => {
    const fixture = await mountFixture({
      root: [
        { name: "archive", relativePath: "archive", kind: "directory" },
        { name: "notes.txt", relativePath: "notes.txt", kind: "file" },
      ],
      directories: { archive: [] },
      entryAction(request) {
        if (request.method === "explorer.entry.move") {
          return {
            id: request.id,
            ok: false,
            error: { code: "CONFLICT", message: "Destination exists" },
          };
        }
        return { ok: true };
      },
    });
    const source = fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]');
    const destination = fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]');
    if (!source || !destination) throw new Error("Conflict fixture rows are missing.");
    const transfer = new DataTransferStub();

    dispatchDrag(source, "dragstart", transfer);
    dispatchDrag(destination, "dragover", transfer);
    dispatchDrag(destination, "drop", transfer);

    await vi.waitFor(() => expect(actionNotice(fixture.shadow).textContent)
      .toBe("An item with that name already exists in this folder."));
    expect(fixture.shadow.querySelector('[data-path="notes.txt"]')).not.toBeNull();
  });

  it("keeps an unsaved draft when a confirmed move is rejected", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fixture = await mountFixture({
      root: [
        { name: "archive", relativePath: "archive", kind: "directory" },
        { name: "notes.txt", relativePath: "notes.txt", kind: "file" },
      ],
      directories: { archive: [] },
      entryAction(request) {
        if (request.method === "explorer.entry.move") {
          return {
            id: request.id,
            ok: false,
            error: { code: "CONFLICT", message: "Destination exists" },
          };
        }
        return { ok: true };
      },
    });
    clickRow(fixture.shadow, "notes.txt");
    await vi.waitFor(() => expect(fixture.requests.some(
      (request) => request.method === "explorer.preview" && request.params.relativePath === "notes.txt",
    )).toBe(true));
    fixture.shadow.querySelector<HTMLButtonElement>(".edit-mode-toggle")?.click();
    const preview = fixture.main.querySelector("code-codex-main-preview");
    const editor = preview?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    if (!editor) throw new Error("Move draft fixture is missing its editor.");
    editor.value = "draft that must survive a rejected move\n";
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    const source = fixture.shadow.querySelector<HTMLElement>('[data-path="notes.txt"]');
    const destination = fixture.shadow.querySelector<HTMLElement>('[data-path="archive"]');
    if (!source || !destination) throw new Error("Move draft rows are missing.");
    const transfer = new DataTransferStub();
    dispatchDrag(source, "dragstart", transfer);
    dispatchDrag(destination, "dragover", transfer);
    dispatchDrag(destination, "drop", transfer);

    await vi.waitFor(() => expect(entryRequests(fixture.requests, "explorer.entry.move")).toHaveLength(1));
    expect(confirm).toHaveBeenCalledWith("Move notes.txt and discard your unsaved changes?");
    expect(preview?.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value)
      .toBe("draft that must survive a rejected move\n");
    expect(fixture.shadow.querySelector(".edit-mode-toggle")?.textContent).toBe("Editing");
  });

  it("marks only movable files and folders as draggable", async () => {
    const fixture = await mountFixture({
      root: [
        { name: "folder", relativePath: "folder", kind: "directory" },
        { name: "file.txt", relativePath: "file.txt", kind: "file" },
        { name: "link", relativePath: "link", kind: "symlink" },
        { name: "locked.txt", relativePath: "locked.txt", kind: "file", inaccessible: true },
        { name: "deleted.txt", relativePath: "deleted.txt", kind: "file", change: "deleted" },
      ],
    });
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="folder"]')?.draggable).toBe(true);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="file.txt"]')?.draggable).toBe(true);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="link"]')?.draggable).toBe(false);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="locked.txt"]')?.draggable).toBe(false);
    expect(fixture.shadow.querySelector<HTMLElement>('[data-path="deleted.txt"]')?.draggable).toBe(false);
  });
});
