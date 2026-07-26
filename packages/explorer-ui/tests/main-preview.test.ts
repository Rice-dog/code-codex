import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  MAIN_PREVIEW_TAG,
  CodeCodexMainPreviewElement,
  registerMainPreviewElement,
  type MainPreviewFileView,
  type MainPreviewState,
} from "../src/main-preview";

const textView = (path: string, text = "const answer = 42;\n"): MainPreviewFileView => ({
  kind: "text",
  path,
  name: path.split("/").at(-1) ?? path,
  text,
  sizeBytes: new TextEncoder().encode(text).byteLength,
  truncated: false,
});

function mount(state: MainPreviewState = { activePath: null, tabs: [] }): {
  main: HTMLElement;
  conversation: HTMLElement;
  element: CodeCodexMainPreviewElement;
  shadow: ShadowRoot;
} {
  const main = document.createElement("main");
  main.className = "main-surface";
  const conversation = document.createElement("article");
  conversation.textContent = "Conversation body";
  main.append(conversation);
  const element = document.createElement(MAIN_PREVIEW_TAG);
  element.state = state;
  main.append(element);
  document.body.append(main);
  const shadow = element.shadowRoot;
  if (!shadow) throw new Error("Expected an open main-preview shadow root");
  return { main, conversation, element, shadow };
}

function fileTab(shadow: ShadowRoot, path: string): HTMLElement {
  const tab = Array.from(shadow.querySelectorAll<HTMLElement>("[role='tab'][data-tab-kind='file']")).find(
    (candidate) => candidate.dataset.path === path,
  );
  if (!tab) throw new Error(`Missing tab for ${path}`);
  return tab;
}

function renderedRuns(code: Element | null): readonly (readonly [string, string])[] {
  if (!code) throw new Error("Missing highlighted code");
  return Array.from(code.childNodes).map((node) => [
    node instanceof HTMLElement ? node.className : "plain",
    node.textContent ?? "",
  ] as const);
}

beforeAll(() => registerMainPreviewElement());

describe("main content preview", () => {
  it("renders a permanent Conversation tab and ordered file tabs", () => {
    const first = textView("src/alpha.ts");
    const second = textView("notes/readme.md", "# Notes");
    const { shadow } = mount({ activePath: second.path, tabs: [first, second] });

    const tabs = Array.from(shadow.querySelectorAll<HTMLElement>("[role='tab']"));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["Conversation", "alpha.ts", "readme.md"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.hasAttribute("aria-controls")).toBe(false);
    const selectedSlot = tabs[2]?.parentElement;
    expect(selectedSlot?.classList.contains("active")).toBe(true);
    expect(selectedSlot?.querySelector("button.tab-close")).not.toBeNull();
    expect(shadow.querySelector("style")?.textContent).toContain(".tab-slot.active { background: var(--cle-main-active); }");

    const panel = shadow.querySelector<HTMLElement>("[role='tabpanel'].preview-panel");
    expect(panel?.getAttribute("aria-labelledby")).toBe(tabs[2]?.id);
    expect(panel?.querySelector(".preview-location")?.textContent).toBe("notes/readme.md");
  });

  it("renders file text literally and reports size and truncation", () => {
    const literal = `<img src=x onerror="globalThis.pwned=true">\n<script>bad()</script>`;
    const view: MainPreviewFileView = {
      kind: "text",
      path: "web/index.html",
      name: "index.html",
      text: literal,
      sizeBytes: 65_537,
      truncated: true,
    };
    const { shadow } = mount({ activePath: view.path, tabs: [view] });

    const pre = shadow.querySelector("pre.literal-text");
    expect(pre?.textContent).toBe(literal);
    expect(pre?.querySelector("img, script")).toBeNull();
    expect(shadow.querySelector(".preview-metadata")?.textContent).toBe("64 KB · Preview truncated");
  });

  it("renders syntax colors through fixed spans while preserving exact source text", () => {
    const source = `"""Build the docs."""\nimport pathlib\noutput = pathlib.Path("site")  # generated\nlimit = 64\n`;
    const view = textView("docs/build_docs.py", source);
    const { shadow } = mount({ activePath: view.path, tabs: [view] });

    const pre = shadow.querySelector("pre.literal-text");
    const code = pre?.querySelector<HTMLElement>("code.syntax-code");
    expect(pre?.textContent).toBe(source);
    expect(code?.dataset.language).toBe("python");
    expect(code?.querySelector(".tok-string")?.textContent).toContain("Build the docs");
    expect(code?.querySelector(".tok-keyword")?.textContent).toBe("import");
    expect(code?.querySelector(".tok-comment")?.textContent).toBe("# generated");
    expect(code?.querySelector(".tok-number")?.textContent).toBe("64");
    expect(code?.querySelector("img, script, a, style")).toBeNull();
  });

  it("shows logical line numbers for mixed endings without changing copied source text", () => {
    const source = "first\r\nsecond\rthird\nfourth\n";
    const view = textView("src/mixed.txt", source);
    const { shadow } = mount({ activePath: view.path, tabs: [view] });

    const reader = shadow.querySelector<HTMLElement>(".code-reader");
    const gutter = reader?.querySelector<HTMLElement>(".code-line-numbers");
    expect(gutter?.getAttribute("aria-hidden")).toBe("true");
    expect(gutter?.dataset.lineCount).toBe("5");
    expect(gutter?.textContent).toBe("1\n2\n3\n4\n5");
    expect(gutter?.childElementCount).toBe(0);
    expect(gutter?.childNodes).toHaveLength(1);
    expect(reader?.style.getPropertyValue("--cle-line-number-width")).toBe("calc(2ch + 24px)");
    expect(shadow.querySelector("pre.literal-text")?.textContent).toBe(source);
  });

  it("bounds a maximum-size newline preview to one line-number text node", () => {
    const source = "\n".repeat(65_536);
    const view = textView("src/lines.txt", source);
    const { shadow } = mount({ activePath: view.path, tabs: [view] });

    const gutter = shadow.querySelector<HTMLElement>(".code-line-numbers");
    expect(gutter?.dataset.lineCount).toBe("65537");
    expect(gutter?.childNodes).toHaveLength(1);
    expect(gutter?.textContent?.endsWith("65537")).toBe(true);
  });

  it("uses identical highlighted runs in read and edit modes and updates them while typing", () => {
    const source = `[workspace]\nmembers = ["crates/app"]\n\n[workspace.package]\nversion = "0.1.2"\nedition = "2024"\n`;
    const view: MainPreviewFileView = {
      kind: "text",
      path: "Cargo.toml",
      name: "Cargo.toml",
      text: source,
      sizeBytes: new TextEncoder().encode(source).byteLength,
      truncated: false,
      editable: true,
      version: "c".repeat(64),
      lineEnding: "lf",
    };
    const { element, shadow } = mount({ activePath: view.path, tabs: [view] });
    const readCode = shadow.querySelector("pre.literal-text code.syntax-code");
    const readRuns = renderedRuns(readCode);
    const drafts: unknown[] = [];
    element.addEventListener("cle-main-preview-draft", (event) => drafts.push(event.detail));

    element.state = {
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: source, saving: false },
    };

    const mirror = shadow.querySelector<HTMLElement>("pre.code-editor-highlight");
    const editCode = mirror?.querySelector("code.syntax-code") ?? null;
    const editor = shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    expect(mirror?.getAttribute("aria-hidden")).toBe("true");
    expect(mirror?.textContent).toBe(source);
    expect(editCode?.getAttribute("data-language")).toBe(readCode?.getAttribute("data-language"));
    expect(renderedRuns(editCode)).toEqual(readRuns);
    expect(shadow.querySelectorAll("textarea.code-editor")).toHaveLength(1);
    expect(mirror?.tabIndex).toBe(-1);

    const updated = source.replace('version = "0.1.2"', "version = 3").replace('edition = "2024"', "edition = false");
    if (!editor) throw new Error("Missing editor");
    editor.value = updated;
    editor.dispatchEvent(new Event("input", { bubbles: true }));

    expect(shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor")).toBe(editor);
    expect(mirror?.textContent).toBe(updated);
    expect(editCode?.querySelector(".tok-number")?.textContent).toBe("3");
    expect(editCode?.querySelector(".tok-constant")?.textContent).toBe("false");
    expect(drafts).toEqual([{ path: view.path, text: updated }]);
  });

  it("updates editor line numbers in place as the draft grows and shrinks", () => {
    const source = "const value = 1;\n";
    const view: MainPreviewFileView = {
      kind: "text",
      path: "src/edit-lines.ts",
      name: "edit-lines.ts",
      text: source,
      sizeBytes: new TextEncoder().encode(source).byteLength,
      truncated: false,
      editable: true,
      version: "e".repeat(64),
      lineEnding: "lf",
    };
    const { shadow } = mount({
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: source, saving: false },
    });
    const editor = shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    const stack = shadow.querySelector<HTMLElement>(".code-editor-stack");
    const gutter = shadow.querySelector<HTMLElement>(".code-editor-line-numbers");
    if (!editor || !stack || !gutter) throw new Error("Missing line-numbered editor");
    expect(gutter.textContent).toBe("1\n2");
    expect(gutter.getAttribute("aria-hidden")).toBe("true");
    expect(editor.maxLength).toBe(65_536);

    editor.value = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n");
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(shadow.querySelector("textarea.code-editor")).toBe(editor);
    expect(gutter.dataset.lineCount).toBe("100");
    expect(gutter.textContent?.endsWith("98\n99\n100")).toBe(true);
    expect(stack.style.getPropertyValue("--cle-line-number-width")).toBe("calc(3ch + 24px)");

    editor.value = "single line";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(gutter.textContent).toBe("1");
    expect(stack.style.getPropertyValue("--cle-line-number-width")).toBe("calc(2ch + 24px)");

    editor.value = "\n".repeat(65_537);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editor.value).toBe("single line");
    expect(gutter.textContent).toBe("1");
    expect(stack.style.getPropertyValue("--cle-line-number-width")).toBe("calc(2ch + 24px)");
  });

  it("keeps unknown and plain-text files unstyled", () => {
    const source = "if true: <not markup>\n";
    const view = textView("notes.txt", source);
    const { shadow } = mount({ activePath: view.path, tabs: [view] });
    const code = shadow.querySelector<HTMLElement>("code.syntax-code");
    expect(code?.dataset.language).toBe("plain");
    expect(code?.textContent).toBe(source);
    expect(code?.querySelector("span")).toBeNull();
  });

  it("invalidates cached token runs when an open file changes", () => {
    const initial = textView("src/value.py", "value = 1\n");
    const { element, shadow } = mount({ activePath: initial.path, tabs: [initial] });
    expect(shadow.querySelector(".tok-number")?.textContent).toBe("1");

    const updatedSource = "value = \"fresh\"  # updated\n";
    const updated = textView("src/value.py", updatedSource);
    element.state = { activePath: updated.path, tabs: [updated] };
    expect(shadow.querySelector("pre.literal-text")?.textContent).toBe(updatedSource);
    expect(shadow.querySelector(".tok-string")?.textContent).toBe('"fresh"');
    expect(shadow.querySelector(".tok-comment")?.textContent).toBe("# updated");
    expect(shadow.querySelector(".tok-number")).toBeNull();
  });

  it.each([
    [
      { kind: "loading", path: "src/a.ts", name: "a.ts" } satisfies MainPreviewFileView,
      ".view-state.loading",
      "Loading preview",
      "Reading this file from the local workspace.",
    ],
    [
      { kind: "empty", path: "src/a.ts", name: "a.ts", sizeBytes: 0 } satisfies MainPreviewFileView,
      ".view-state.empty",
      "Empty file",
      "This file is empty.",
    ],
    [
      {
        kind: "unsupported",
        path: "assets/a.png",
        name: "a.png",
        sizeBytes: 1200,
        reason: "binary",
      } satisfies MainPreviewFileView,
      ".view-state.unsupported",
      "Preview unavailable",
      "Binary files are not shown in the text preview.",
    ],
    [
      {
        kind: "error",
        path: "src/a.ts",
        name: "a.ts",
        code: "STALE_CONTEXT",
        message: "Try <strong>again</strong>",
      } satisfies MainPreviewFileView,
      ".view-state.error",
      "File preview failed",
      "Try <strong>again</strong>",
    ],
  ])("renders the %s state as a full panel", (view, selector, title, copy) => {
    const { shadow } = mount({ activePath: view.path, tabs: [view] });
    const state = shadow.querySelector(selector);
    expect(state).not.toBeNull();
    expect(state?.querySelector(".state-title")?.textContent).toBe(title);
    expect(state?.querySelector(".state-copy")?.textContent).toBe(copy);
    expect(shadow.querySelector("[role='tabpanel'].preview-panel")).not.toBeNull();
    expect(state?.querySelector("strong")).toBeNull();
  });

  it("treats an empty text response as an empty file", () => {
    const view = textView("empty.txt", "");
    const { shadow } = mount({ activePath: view.path, tabs: [view] });
    expect(shadow.querySelector(".view-state.empty .state-title")?.textContent).toBe("Empty file");
    expect(shadow.querySelector("pre")).toBeNull();
  });

  it("renders a controlled editor and dispatches draft, save, and reload intents", () => {
    const view: MainPreviewFileView = {
      kind: "text",
      path: "src/edit.ts",
      name: "edit.ts",
      text: "const value = 1;\n",
      sizeBytes: 17,
      truncated: false,
      editable: true,
      version: "a".repeat(64),
      lineEnding: "lf",
    };
    const { element, shadow } = mount({
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: view.text, saving: false },
    });
    const drafts: unknown[] = [];
    const saves: unknown[] = [];
    const reloads: unknown[] = [];
    element.addEventListener("cle-main-preview-draft", (event) => drafts.push(event.detail));
    element.addEventListener("cle-main-preview-save", (event) => saves.push(event.detail));
    element.addEventListener("cle-main-preview-reload", (event) => reloads.push(event.detail));

    const editor = shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    expect(editor?.value).toBe(view.text);
    expect(editor?.getAttribute("aria-label")).toBe("Edit edit.ts");
    if (editor) {
      editor.value = "const value = 2;\n";
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    }
    expect(drafts).toEqual([{ path: view.path, text: "const value = 2;\n" }]);
    expect(saves).toEqual([{ path: view.path }]);

    element.state = {
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: "const value = 2;\n", saving: false, error: "File changed on disk." },
    };
    expect(shadow.querySelector(".editor-error")?.getAttribute("role")).toBe("alert");
    shadow.querySelector<HTMLButtonElement>("button.editor-reload")?.click();
    expect(reloads).toEqual([{ path: view.path }]);
  });

  it("keeps the highlight mirror synchronized through scrolling, rerenders, and composition", () => {
    const source = `const\tvalue = "${"x".repeat(180)}";\n`;
    const view: MainPreviewFileView = {
      kind: "text",
      path: "src/long.ts",
      name: "long.ts",
      text: source,
      sizeBytes: new TextEncoder().encode(source).byteLength,
      truncated: false,
      editable: true,
      version: "d".repeat(64),
      lineEnding: "lf",
    };
    const { element, shadow } = mount({
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: source, saving: false },
    });
    const editor = shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    const mirror = shadow.querySelector<HTMLElement>("pre.code-editor-highlight");
    const lineNumbers = shadow.querySelector<HTMLElement>("pre.code-editor-line-numbers");
    if (!editor || !mirror || !lineNumbers) throw new Error("Missing highlighted editor");

    editor.focus();
    editor.setSelectionRange(6, 11, "forward");
    editor.scrollTop = 37;
    editor.scrollLeft = 91;
    editor.dispatchEvent(new Event("scroll"));
    expect(mirror.scrollTop).toBe(37);
    expect(mirror.scrollLeft).toBe(91);
    expect(lineNumbers.scrollTop).toBe(37);
    expect(lineNumbers.scrollLeft).toBe(0);

    editor.dispatchEvent(new Event("compositionstart"));
    expect(editor.parentElement?.classList.contains("composing")).toBe(true);
    editor.value = `${source}// composing\n`;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("compositionend"));
    expect(editor.parentElement?.classList.contains("composing")).toBe(false);
    expect(mirror.textContent).toBe(editor.value);
    editor.setSelectionRange(6, 11, "forward");

    element.state = {
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: editor.value, saving: true },
    };
    const restored = shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor");
    const restoredMirror = shadow.querySelector<HTMLElement>("pre.code-editor-highlight");
    const restoredLineNumbers = shadow.querySelector<HTMLElement>("pre.code-editor-line-numbers");
    expect(shadow.activeElement).toBe(restored);
    expect(restored?.selectionStart).toBe(6);
    expect(restored?.selectionEnd).toBe(11);
    expect(restored?.selectionDirection).toBe("forward");
    expect(restored?.scrollTop).toBe(37);
    expect(restored?.scrollLeft).toBe(91);
    expect(restoredMirror?.scrollTop).toBe(37);
    expect(restoredMirror?.scrollLeft).toBe(91);
    expect(restoredLineNumbers?.scrollTop).toBe(37);
    expect(restoredLineNumbers?.scrollLeft).toBe(0);
  });

  it("allows an eligible empty file to enter editing mode", () => {
    const view: MainPreviewFileView = {
      kind: "empty",
      path: "empty.txt",
      name: "empty.txt",
      sizeBytes: 0,
      editable: true,
      version: "b".repeat(64),
      lineEnding: "none",
    };
    const { shadow } = mount({
      activePath: view.path,
      tabs: [view],
      editor: { path: view.path, draft: "", saving: false },
    });
    expect(shadow.querySelector<HTMLTextAreaElement>("textarea.code-editor")?.value).toBe("");
    expect(shadow.querySelector(".code-editor-line-numbers")?.textContent).toBe("1");
    expect(shadow.querySelector(".view-state.empty")).toBeNull();
  });

  it("dispatches typed activation and close events without mutating controlled state", () => {
    const view = textView("src/a.ts");
    const { element, shadow } = mount({ activePath: null, tabs: [view] });
    const activate = vi.fn();
    const close = vi.fn();
    element.addEventListener("cle-main-preview-activate", activate);
    element.addEventListener("cle-main-preview-close", close);

    fileTab(shadow, view.path).click();
    shadow.querySelector<HTMLButtonElement>("button[data-close-path]")?.click();

    expect(activate.mock.calls[0]?.[0].detail).toEqual({ kind: "file", path: view.path });
    expect(close.mock.calls[0]?.[0].detail).toEqual({ path: view.path });
    expect(element.state.activePath).toBeNull();
  });

  it("closes a focused file tab with Delete or Ctrl/Cmd+W", () => {
    const view = textView("src/a.ts");
    const { element, shadow } = mount({ activePath: view.path, tabs: [view] });
    const close = vi.fn();
    element.addEventListener("cle-main-preview-close", close);
    const tab = fileTab(shadow, view.path);

    tab.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    tab.dispatchEvent(new KeyboardEvent("keydown", { key: "w", ctrlKey: true, bubbles: true }));
    tab.dispatchEvent(new KeyboardEvent("keydown", { key: "W", metaKey: true, bubbles: true }));

    expect(close).toHaveBeenCalledTimes(3);
    expect(close.mock.calls.map((call) => call[0].detail)).toEqual([
      { path: view.path },
      { path: view.path },
      { path: view.path },
    ]);
  });

  it("uses roving focus for arrows, Home, and End and escapes to Conversation", () => {
    const first = textView("src/a.ts");
    const second = textView("src/b.ts");
    const { element, shadow } = mount({ activePath: null, tabs: [first, second] });
    const events: unknown[] = [];
    element.addEventListener("cle-main-preview-activate", (event) => events.push(event.detail));

    const conversation = shadow.querySelector<HTMLElement>("[data-tab-kind='conversation']");
    conversation?.focus();
    conversation?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(shadow.activeElement).toBe(fileTab(shadow, first.path));
    expect(events.at(-1)).toEqual({ kind: "file", path: first.path });

    fileTab(shadow, first.path).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(shadow.activeElement).toBe(fileTab(shadow, second.path));
    expect(events.at(-1)).toEqual({ kind: "file", path: second.path });

    fileTab(shadow, second.path).dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(shadow.activeElement).toBe(conversation);
    expect(events.at(-1)).toEqual({ kind: "conversation" });

    element.state = { activePath: second.path, tabs: [first, second] };
    shadow.querySelector<HTMLElement>(".preview-panel")?.focus();
    shadow.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(events.at(-1)).toEqual({ kind: "conversation" });
    expect(shadow.activeElement).toBe(shadow.querySelector("[data-tab-kind='conversation']"));
  });

  it("makes existing and newly-added main children inert, then restores exact attributes", async () => {
    const view = textView("src/a.ts");
    const { main, conversation, element } = mount();
    conversation.setAttribute("inert", "preserve-this-value");
    conversation.setAttribute("aria-hidden", "false");
    const sibling = document.createElement("aside");
    main.insertBefore(sibling, element);

    element.state = { activePath: view.path, tabs: [view] };
    expect(conversation.getAttribute("inert")).toBe("");
    expect(conversation.getAttribute("aria-hidden")).toBe("true");
    expect(sibling.hasAttribute("inert")).toBe(true);

    const lateChild = document.createElement("footer");
    lateChild.setAttribute("aria-hidden", "false");
    main.append(lateChild);
    await Promise.resolve();
    expect(lateChild.hasAttribute("inert")).toBe(true);
    expect(lateChild.getAttribute("aria-hidden")).toBe("true");

    sibling.remove();
    await Promise.resolve();
    expect(sibling.hasAttribute("inert")).toBe(false);
    expect(sibling.hasAttribute("aria-hidden")).toBe(false);

    element.state = { activePath: null, tabs: [view] };
    expect(conversation.getAttribute("inert")).toBe("preserve-this-value");
    expect(conversation.getAttribute("aria-hidden")).toBe("false");
    expect(sibling.hasAttribute("inert")).toBe(false);
    expect(sibling.hasAttribute("aria-hidden")).toBe(false);
    expect(lateChild.hasAttribute("inert")).toBe(false);
    expect(lateChild.getAttribute("aria-hidden")).toBe("false");
  });

  it("restores the old main exactly when unmounted or reparented", () => {
    const view = textView("src/a.ts");
    const first = mount({ activePath: view.path, tabs: [view] });
    const secondMain = document.createElement("main");
    secondMain.className = "main-surface";
    const secondConversation = document.createElement("article");
    secondConversation.setAttribute("aria-hidden", "false");
    secondMain.append(secondConversation);
    document.body.append(secondMain);

    expect(first.conversation.hasAttribute("inert")).toBe(true);
    secondMain.append(first.element);
    expect(first.conversation.hasAttribute("inert")).toBe(false);
    expect(first.conversation.hasAttribute("aria-hidden")).toBe(false);
    expect(secondConversation.hasAttribute("inert")).toBe(true);
    expect(secondConversation.getAttribute("aria-hidden")).toBe("true");

    first.element.remove();
    expect(secondConversation.hasAttribute("inert")).toBe(false);
    expect(secondConversation.getAttribute("aria-hidden")).toBe("false");
  });

  it("falls back to Conversation for an absent active path and deduplicates tabs", () => {
    const first = textView("src/a.ts");
    const duplicate = textView("src/a.ts", "newer");
    const { element, shadow } = mount({ activePath: "missing.ts", tabs: [first, duplicate] });
    expect(element.state.activePath).toBeNull();
    expect(element.state.tabs).toHaveLength(1);
    expect(shadow.querySelector("[data-tab-kind='conversation']")?.getAttribute("aria-selected")).toBe("true");
    expect(shadow.querySelector(".conversation-panel, [role='tabpanel']")).toBeNull();
    expect(element.hasAttribute("data-file-active")).toBe(false);
  });

  it("gives a reopened tab a fresh ARIA id and focuses the replacement active tab", () => {
    const first = textView("src/a.ts");
    const second = textView("src/b.ts");
    const { element, shadow } = mount({ activePath: first.path, tabs: [first, second] });
    const originalId = fileTab(shadow, first.path).id;
    shadow.querySelector<HTMLButtonElement>(`button[data-close-path="${first.path}"]`)?.focus();

    element.state = { activePath: second.path, tabs: [second] };
    expect(shadow.activeElement).toBe(fileTab(shadow, second.path));

    element.state = { activePath: first.path, tabs: [second, first] };
    expect(fileTab(shadow, first.path).id).not.toBe(originalId);
    expect(fileTab(shadow, first.path).getAttribute("aria-controls")).toBe(
      shadow.querySelector(".preview-panel")?.id,
    );
  });

  it("uses an absolute z-31 overlay with a non-draggable 46px interactive tab strip", () => {
    const { shadow } = mount();
    const css = shadow.querySelector("style")?.textContent ?? "";
    expect(css).toContain("position: absolute");
    expect(css).toContain("z-index: 31");
    expect(css).toContain("grid-template-rows: 46px minmax(0, 1fr)");
    expect(css).toContain(".tab-strip");
    expect(css).toContain("    app-region: no-drag;\n    -webkit-app-region: no-drag;");
    expect(css).toContain("pointer-events: auto");
    expect(css).toContain(".tab-slot.active { background: var(--cle-main-active); }");
    expect(css).toContain(":host-context(.electron-dark)");
    expect(css).toContain(":host([data-theme=\"dark\"])");
    expect(css).toContain(".tok-comment");
    expect(css).toContain("--cle-syntax-keyword");
    expect(css).toContain(".code-editor-highlight");
    expect(css).toContain(".code-line-numbers");
    expect(css).toContain("position: sticky");
    expect(css).toContain("user-select: none");
    const lineNumberStart = css.indexOf(".code-line-numbers {");
    const lineNumberRule = css.slice(lineNumberStart, css.indexOf("}", lineNumberStart));
    expect(lineNumberRule).toContain("color: var(--cle-main-muted)");
    expect(css).toContain("grid-template-columns: var(--cle-line-number-width) minmax(max-content, 1fr)");
    expect(css).toContain("inset: 0 0 0 var(--cle-line-number-width)");
    expect(css).toContain(".code-editor:focus-visible { box-shadow: inset 0 0 0 2px var(--cle-main-line); }");
    expect(css).toContain("-webkit-text-fill-color: transparent");
    expect(css).toContain("caret-color: var(--cle-main-text)");
    expect(css).toContain("letter-spacing: 0");
    expect(css).toContain(".code-editor-stack.composing");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("lets an explicit light host keep a coherent light surface and syntax palette under a dark ancestor", () => {
    document.documentElement.dataset.theme = "dark";
    const { element, shadow } = mount();
    element.dataset.theme = "light";
    const css = shadow.querySelector("style")?.textContent ?? "";
    const baseStart = css.indexOf(":host {");
    const darkStart = css.indexOf(":host-context(.dark)");
    const lightStart = css.indexOf(':host([data-theme="light"]) {');
    const forcedColorsStart = css.indexOf("@media (forced-colors: active)");
    const declarations = (ruleStart: number, prefix: "main" | "syntax"): string[] => {
      const ruleEnd = css.indexOf("}", ruleStart);
      return css
        .slice(ruleStart, ruleEnd)
        .match(new RegExp(`--cle-${prefix}-[\\w-]+:\\s*[^;]+;`, "g")) ?? [];
    };

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(element.dataset.theme).toBe("light");
    expect(darkStart).toBeGreaterThan(baseStart);
    expect(lightStart).toBeGreaterThan(darkStart);
    expect(declarations(lightStart, "main")).toEqual(declarations(baseStart, "main"));
    expect(declarations(lightStart, "main")).toHaveLength(10);
    expect(declarations(lightStart, "syntax")).toEqual(declarations(baseStart, "syntax"));
    expect(declarations(lightStart, "syntax")).toHaveLength(14);
    expect(css).toContain(':host([data-theme="dark"])');
    expect(declarations(darkStart, "main")).toHaveLength(10);
    expect(declarations(darkStart, "main")).not.toEqual(declarations(baseStart, "main"));
    expect(declarations(darkStart, "syntax")).toHaveLength(14);
    expect(declarations(darkStart, "syntax")).not.toEqual(declarations(baseStart, "syntax"));
    expect(forcedColorsStart).toBeGreaterThan(lightStart);
    expect(css.slice(forcedColorsStart)).toContain("color: CanvasText");
    expect(css.slice(forcedColorsStart)).toContain("color: GrayText");
    expect(css.slice(forcedColorsStart)).toContain(".code-editor-highlight { display: none; }");
    expect(css.slice(forcedColorsStart)).toContain("color: GrayText");
    expect(css.slice(forcedColorsStart)).toContain("background: Canvas");
    expect(css.slice(forcedColorsStart)).toContain("-webkit-text-fill-color: CanvasText");
  });
});
