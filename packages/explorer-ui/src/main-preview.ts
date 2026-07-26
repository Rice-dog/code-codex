import { getFileIcon, icons } from "./icons";
import { MAX_SYNTAX_SOURCE_UNITS, highlightSyntaxForPath, type SyntaxHighlight } from "./syntax-highlight";

export const MAIN_PREVIEW_TAG = "codex-live-explorer-main-preview";
export const MAIN_PREVIEW_ACTIVATE_EVENT = "cle-main-preview-activate";
export const MAIN_PREVIEW_CLOSE_EVENT = "cle-main-preview-close";
export const MAIN_PREVIEW_DRAFT_EVENT = "cle-main-preview-draft";
export const MAIN_PREVIEW_SAVE_EVENT = "cle-main-preview-save";
export const MAIN_PREVIEW_RELOAD_EVENT = "cle-main-preview-reload";

export type MainPreviewLineEnding = "lf" | "crlf" | "none" | "mixed";

export type MainPreviewUnavailableReason =
  | "binary"
  | "invalid-utf8"
  | "sensitive"
  | "unsupported-type"
  | "unknown";

export interface MainPreviewFileBase {
  readonly path: string;
  readonly name: string;
}

export interface MainPreviewLoadingView extends MainPreviewFileBase {
  readonly kind: "loading";
}

export interface MainPreviewTextView extends MainPreviewFileBase {
  readonly kind: "text";
  readonly text: string;
  readonly sizeBytes: number;
  readonly truncated: boolean;
  readonly editable?: boolean;
  readonly version?: string;
  readonly lineEnding?: MainPreviewLineEnding;
}

export interface MainPreviewEmptyView extends MainPreviewFileBase {
  readonly kind: "empty";
  readonly sizeBytes: number;
  readonly editable?: boolean;
  readonly version?: string;
  readonly lineEnding?: MainPreviewLineEnding;
}

export interface MainPreviewUnsupportedView extends MainPreviewFileBase {
  readonly kind: "unsupported";
  readonly sizeBytes: number;
  readonly reason: MainPreviewUnavailableReason;
}

export interface MainPreviewErrorView extends MainPreviewFileBase {
  readonly kind: "error";
  readonly code: string;
  readonly message?: string;
}

export type MainPreviewFileView =
  | MainPreviewLoadingView
  | MainPreviewTextView
  | MainPreviewEmptyView
  | MainPreviewUnsupportedView
  | MainPreviewErrorView;

export interface MainPreviewState {
  readonly activePath: string | null;
  readonly tabs: readonly MainPreviewFileView[];
  readonly editor?: MainPreviewEditorState;
}

export interface MainPreviewEditorState {
  readonly path: string;
  readonly draft: string;
  readonly saving: boolean;
  readonly error?: string;
}

export type MainPreviewActivateDetail =
  | { readonly kind: "conversation" }
  | { readonly kind: "file"; readonly path: string };

export interface MainPreviewCloseDetail {
  readonly path: string;
}

export interface MainPreviewDraftDetail {
  readonly path: string;
  readonly text: string;
}

export interface MainPreviewPathDetail {
  readonly path: string;
}

export type MainPreviewActivateEvent = CustomEvent<MainPreviewActivateDetail>;
export type MainPreviewCloseEvent = CustomEvent<MainPreviewCloseDetail>;
export type MainPreviewDraftEvent = CustomEvent<MainPreviewDraftDetail>;
export type MainPreviewSaveEvent = CustomEvent<MainPreviewPathDetail>;
export type MainPreviewReloadEvent = CustomEvent<MainPreviewPathDetail>;

const CONVERSATION_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.25 3.25h11.5v7.5H7l-3.5 2.5v-2.5H2.25z"/></svg>`;

const mainPreviewStyles = String.raw`
  :host {
    --cle-main-bg: #ffffff;
    --cle-main-bar: #f7f7f5;
    --cle-main-raised: #fbfbfa;
    --cle-main-text: #20201e;
    --cle-main-muted: #6d6c67;
    --cle-main-faint: #96958f;
    --cle-main-line: rgba(24, 24, 22, 0.12);
    --cle-main-hover: rgba(24, 24, 22, 0.055);
    --cle-main-active: #ffffff;
    --cle-main-focus: #74736e;
    --cle-syntax-comment: #627062;
    --cle-syntax-string: #087a18;
    --cle-syntax-keyword: #6b00d7;
    --cle-syntax-number: #00717a;
    --cle-syntax-constant: #a3155b;
    --cle-syntax-type: #006e91;
    --cle-syntax-function: #075db7;
    --cle-syntax-property: #b54708;
    --cle-syntax-tag: #b4235a;
    --cle-syntax-attribute: #7a3db8;
    --cle-syntax-selector: #006f72;
    --cle-syntax-meta: #7047a3;
    --cle-syntax-inserted: #157347;
    --cle-syntax-deleted: #c12e35;
    position: absolute;
    z-index: 31;
    inset: 0;
    display: block;
    min-width: 0;
    min-height: 0;
    color: var(--cle-main-text);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: none;
    contain: layout style paint;
  }

  :host-context(.dark),
  :host-context(.electron-dark),
  :host-context([data-theme="dark"]),
  :host([data-theme="dark"]) {
    --cle-main-bg: #1d1d1c;
    --cle-main-bar: #232321;
    --cle-main-raised: #20201e;
    --cle-main-text: #ecece8;
    --cle-main-muted: #aaa9a3;
    --cle-main-faint: #7f7e79;
    --cle-main-line: rgba(255, 255, 255, 0.13);
    --cle-main-hover: rgba(255, 255, 255, 0.065);
    --cle-main-active: #1d1d1c;
    --cle-main-focus: #aaa9a3;
    --cle-syntax-comment: #9aa69a;
    --cle-syntax-string: #89d989;
    --cle-syntax-keyword: #c7a0ff;
    --cle-syntax-number: #75d0d6;
    --cle-syntax-constant: #ff91b8;
    --cle-syntax-type: #72d2e3;
    --cle-syntax-function: #88baff;
    --cle-syntax-property: #ff9d57;
    --cle-syntax-tag: #ff8fa5;
    --cle-syntax-attribute: #d0acff;
    --cle-syntax-selector: #76d5cf;
    --cle-syntax-meta: #c9a7f5;
    --cle-syntax-inserted: #76d39b;
    --cle-syntax-deleted: #ff969b;
  }

  :host([data-theme="light"]) {
    --cle-main-bg: #ffffff;
    --cle-main-bar: #f7f7f5;
    --cle-main-raised: #fbfbfa;
    --cle-main-text: #20201e;
    --cle-main-muted: #6d6c67;
    --cle-main-faint: #96958f;
    --cle-main-line: rgba(24, 24, 22, 0.12);
    --cle-main-hover: rgba(24, 24, 22, 0.055);
    --cle-main-active: #ffffff;
    --cle-main-focus: #74736e;
    --cle-syntax-comment: #627062;
    --cle-syntax-string: #087a18;
    --cle-syntax-keyword: #6b00d7;
    --cle-syntax-number: #00717a;
    --cle-syntax-constant: #a3155b;
    --cle-syntax-type: #006e91;
    --cle-syntax-function: #075db7;
    --cle-syntax-property: #b54708;
    --cle-syntax-tag: #b4235a;
    --cle-syntax-attribute: #7a3db8;
    --cle-syntax-selector: #006f72;
    --cle-syntax-meta: #7047a3;
    --cle-syntax-inserted: #157347;
    --cle-syntax-deleted: #c12e35;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button { color: inherit; font: inherit; }

  .surface {
    display: grid;
    grid-template-rows: 46px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    pointer-events: none;
  }

  .tab-strip {
    position: relative;
    display: flex;
    align-items: stretch;
    min-width: 0;
    height: 46px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    background: var(--cle-main-bar);
    border-bottom: 1px solid var(--cle-main-line);
    app-region: no-drag;
    -webkit-app-region: no-drag;
    pointer-events: auto;
  }

  .tab-strip::-webkit-scrollbar { display: none; }

  .tab-slot {
    display: flex;
    flex: 0 0 auto;
    min-width: 0;
    border-right: 1px solid var(--cle-main-line);
  }

  .tab-slot.active { background: var(--cle-main-active); }

  .preview-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    width: 100%;
    height: 45px;
    padding: 0 13px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--cle-main-muted);
    cursor: default;
    outline: none;
    white-space: nowrap;
  }

  .tab-slot.conversation { width: 142px; }
  .tab-slot.file { width: clamp(150px, 19vw, 238px); }
  .tab-slot.file .preview-tab { padding-right: 5px; }

  .preview-tab:hover { background: var(--cle-main-hover); color: var(--cle-main-text); }
  .preview-tab[aria-selected="true"] { background: var(--cle-main-active); color: var(--cle-main-text); }
  .preview-tab[aria-selected="true"]::after {
    content: "";
    position: absolute;
    right: 9px;
    bottom: 0;
    left: 9px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: currentColor;
    opacity: 0.78;
  }

  .preview-tab:focus-visible,
  .tab-close:focus-visible,
  .preview-panel:focus-visible {
    outline: 2px solid var(--cle-main-focus);
    outline-offset: -3px;
  }

  .tab-icon,
  .panel-icon,
  .state-icon {
    display: inline-flex;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }

  .tab-icon svg,
  .panel-icon svg,
  .state-icon svg,
  .tab-close svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-close {
    align-self: center;
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    margin: 0 5px 0 -4px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cle-main-faint);
    cursor: default;
    opacity: 0;
    outline: none;
  }

  .tab-slot:hover .tab-close,
  .tab-slot:focus-within .tab-close,
  .tab-slot.active .tab-close { opacity: 1; }
  .tab-close:hover { background: var(--cle-main-hover); color: var(--cle-main-text); }

  .panel-mount {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .preview-panel {
    display: grid;
    grid-template-rows: 35px minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
    pointer-events: auto;
    outline: none;
  }

  .preview-meta-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0 16px;
    border-bottom: 1px solid var(--cle-main-line);
    background: var(--cle-main-raised);
    color: var(--cle-main-muted);
    font-size: 11px;
  }

  .preview-location {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-metadata {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--cle-main-faint);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .preview-content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--cle-main-bg);
  }

  .preview-content.editor-mode {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .literal-text,
  .code-line-numbers,
  .code-editor-highlight,
  .code-editor {
    font: 12.5px/1.62 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0;
    tab-size: 4;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .code-reader {
    --cle-line-number-width: calc(2ch + 24px);
    display: grid;
    grid-template-columns: var(--cle-line-number-width) minmax(max-content, 1fr);
    align-items: stretch;
    width: max-content;
    min-width: 100%;
    min-height: 100%;
  }

  .code-line-numbers {
    margin: 0;
    padding: 20px 10px 48px 6px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: var(--cle-main-bg);
    border-right: 1px solid var(--cle-main-line);
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
    pointer-events: none;
  }

  .code-reader > .code-line-numbers {
    position: sticky;
    z-index: 1;
    left: 0;
    grid-column: 1;
    grid-row: 1;
  }

  .literal-text {
    grid-column: 2;
    grid-row: 1;
    min-width: max-content;
    margin: 0;
    padding: 20px 24px 48px 16px;
    color: var(--cle-main-text);
  }

  .code-editor-stack {
    --cle-line-number-width: calc(2ch + 24px);
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
  }

  .code-editor-highlight {
    position: absolute;
    inset: 0 0 0 var(--cle-line-number-width);
    margin: 0;
    padding: 20px 24px 48px;
    overflow: hidden;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    pointer-events: none;
    scrollbar-width: none;
  }

  .code-editor-highlight::-webkit-scrollbar { display: none; }

  .literal-text .syntax-code::after,
  .code-editor-highlight .syntax-code::after {
    content: "\200b";
  }

  .code-editor-line-numbers {
    position: absolute;
    z-index: 1;
    inset: 0 auto 0 0;
    width: var(--cle-line-number-width);
  }

  .code-editor {
    position: absolute;
    inset: 0 0 0 var(--cle-line-number-width);
    display: block;
    width: auto;
    height: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 20px 24px 48px;
    overflow: auto;
    resize: none;
    color: transparent;
    -webkit-text-fill-color: transparent;
    caret-color: var(--cle-main-text);
    background: transparent;
    border: 0;
    border-radius: 0;
    outline: none;
  }

  .code-editor::selection { color: transparent; background: rgba(80, 125, 190, 0.28); }
  .code-editor:focus-visible { box-shadow: inset 0 0 0 2px var(--cle-main-line); }

  .code-editor-stack.composing .code-editor-highlight { visibility: hidden; }
  .code-editor-stack.composing .code-editor {
    color: var(--cle-main-text);
    -webkit-text-fill-color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .editor-error {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 38px;
    padding: 7px 12px 7px 16px;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border-top: 1px solid var(--cle-main-line);
    font-size: 11px;
  }

  .editor-error-copy {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .editor-reload {
    flex: 0 0 auto;
    min-height: 24px;
    padding: 2px 8px;
    color: var(--cle-main-text);
    background: transparent;
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
  }

  .editor-reload:hover { background: var(--cle-main-hover); }
  .editor-reload:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }

  .syntax-code { color: inherit; font: inherit; }
  .tok-comment { color: var(--cle-syntax-comment); font-style: italic; }
  .tok-string { color: var(--cle-syntax-string); }
  .tok-keyword { color: var(--cle-syntax-keyword); }
  .tok-keyword { font-weight: 600; }
  .tok-number { color: var(--cle-syntax-number); }
  .tok-constant,
  .tok-variable { color: var(--cle-syntax-constant); }
  .tok-type { color: var(--cle-syntax-type); }
  .tok-function,
  .tok-link { color: var(--cle-syntax-function); }
  .tok-heading { color: var(--cle-syntax-keyword); }
  .tok-property { color: var(--cle-syntax-property); }
  .tok-tag { color: var(--cle-syntax-tag); }
  .tok-attribute { color: var(--cle-syntax-attribute); }
  .tok-selector { color: var(--cle-syntax-selector); }
  .tok-meta { color: var(--cle-syntax-meta); }
  .tok-operator { color: var(--cle-main-muted); }
  .tok-inserted { color: var(--cle-syntax-inserted); }
  .tok-deleted { color: var(--cle-syntax-deleted); }

  .view-state {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 180px;
    padding: 28px;
    text-align: center;
  }

  .state-card { max-width: 390px; color: var(--cle-main-muted); }
  .state-icon { width: 22px; height: 22px; margin: 0 auto 12px; color: var(--cle-main-faint); }
  .state-title { margin: 0 0 5px; color: var(--cle-main-text); font-size: 13px; font-weight: 600; }
  .state-copy { margin: 0; font-size: 12px; line-height: 1.55; }

  .spinner {
    width: 18px;
    height: 18px;
    margin: 0 auto 13px;
    border: 1.5px solid var(--cle-main-line);
    border-top-color: var(--cle-main-muted);
    border-radius: 50%;
    animation: cle-main-spin 720ms linear infinite;
  }

  @keyframes cle-main-spin { to { transform: rotate(360deg); } }

  @media (max-width: 680px) {
    .tab-slot.conversation { width: 126px; }
    .tab-slot.file { width: min(196px, 46vw); }
    .literal-text { padding: 16px 18px 40px 12px; }
    .code-line-numbers { padding: 16px 8px 40px 4px; }
    .code-editor-highlight,
    .code-editor { padding: 16px 18px 40px; }
    .preview-meta-bar { padding-inline: 12px; }
  }

  @media (prefers-color-scheme: dark) {
    :host(:not([data-theme="light"])) {
      --cle-main-bg: #1d1d1c;
      --cle-main-bar: #232321;
      --cle-main-raised: #20201e;
      --cle-main-text: #ecece8;
      --cle-main-muted: #aaa9a3;
      --cle-main-faint: #7f7e79;
      --cle-main-line: rgba(255, 255, 255, 0.13);
      --cle-main-hover: rgba(255, 255, 255, 0.065);
      --cle-main-active: #1d1d1c;
      --cle-main-focus: #aaa9a3;
      --cle-syntax-comment: #9aa69a;
      --cle-syntax-string: #89d989;
      --cle-syntax-keyword: #c7a0ff;
      --cle-syntax-number: #75d0d6;
      --cle-syntax-constant: #ff91b8;
      --cle-syntax-type: #72d2e3;
      --cle-syntax-function: #88baff;
      --cle-syntax-property: #ff9d57;
      --cle-syntax-tag: #ff8fa5;
      --cle-syntax-attribute: #d0acff;
      --cle-syntax-selector: #76d5cf;
      --cle-syntax-meta: #c9a7f5;
      --cle-syntax-inserted: #76d39b;
      --cle-syntax-deleted: #ff969b;
    }
  }

  @media (forced-colors: active) {
    .code-editor-highlight { display: none; }
    .code-line-numbers {
      color: GrayText;
      background: Canvas;
      border-right-color: GrayText;
    }
    .code-editor {
      color: CanvasText;
      -webkit-text-fill-color: CanvasText;
      background: Canvas;
    }
    .syntax-code [class^="tok-"] { color: CanvasText; forced-color-adjust: auto; }
    .syntax-code .tok-comment { color: GrayText; }
    .syntax-code .tok-keyword,
    .syntax-code .tok-heading { font-weight: 700; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; border-top-color: var(--cle-main-line); }
  }
`;

interface SuppressedAttributes {
  readonly inert: string | null;
  readonly ariaHidden: string | null;
}

type FocusSnapshot =
  | { readonly kind: "tab"; readonly path: string | null }
  | { readonly kind: "close"; readonly path: string }
  | { readonly kind: "panel" }
  | {
      readonly kind: "editor";
      readonly selectionStart: number;
      readonly selectionEnd: number;
      readonly selectionDirection: "forward" | "backward" | "none";
      readonly scrollTop: number;
      readonly scrollLeft: number;
    }
  | null;

let nextInstanceId = 0;

function fileNameFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path || "File";
}

function cloneView(view: MainPreviewFileView): MainPreviewFileView {
  const name = view.name || fileNameFromPath(view.path);
  switch (view.kind) {
    case "loading":
      return { kind: "loading", path: view.path, name };
    case "text":
      return {
        kind: "text",
        path: view.path,
        name,
        text: view.text,
        sizeBytes: view.sizeBytes,
        truncated: view.truncated,
        ...(view.editable === undefined ? {} : { editable: view.editable }),
        ...(view.version === undefined ? {} : { version: view.version }),
        ...(view.lineEnding === undefined ? {} : { lineEnding: view.lineEnding }),
      };
    case "empty":
      return {
        kind: "empty",
        path: view.path,
        name,
        sizeBytes: view.sizeBytes,
        ...(view.editable === undefined ? {} : { editable: view.editable }),
        ...(view.version === undefined ? {} : { version: view.version }),
        ...(view.lineEnding === undefined ? {} : { lineEnding: view.lineEnding }),
      };
    case "unsupported":
      return {
        kind: "unsupported",
        path: view.path,
        name,
        sizeBytes: view.sizeBytes,
        reason: view.reason,
      };
    case "error":
      return view.message === undefined
        ? { kind: "error", path: view.path, name, code: view.code }
        : { kind: "error", path: view.path, name, code: view.code, message: view.message };
  }
}

function normalizeState(state: MainPreviewState): MainPreviewState {
  const seen = new Set<string>();
  const tabs: MainPreviewFileView[] = [];
  for (const view of state.tabs) {
    if (!view.path || seen.has(view.path)) continue;
    seen.add(view.path);
    tabs.push(cloneView(view));
  }
  const activePath = state.activePath !== null && seen.has(state.activePath) ? state.activePath : null;
  const editor = state.editor && state.editor.path === activePath
    ? {
        path: state.editor.path,
        draft: state.editor.draft,
        saving: state.editor.saving,
        ...(state.editor.error === undefined ? {} : { error: state.editor.error }),
      }
    : undefined;
  return { activePath, tabs, ...(editor ? { editor } : {}) };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "Size unavailable";
  if (value < 1024) return `${Math.trunc(value)} B`;
  const units = ["KB", "MB", "GB"] as const;
  let amount = value / 1024;
  let unit: (typeof units)[number] = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index] ?? unit;
  }
  const digits = amount >= 10 || Number.isInteger(amount) ? 0 : 1;
  return `${amount.toFixed(digits)} ${unit}`;
}

function sourceLineCount(source: string): number {
  let count = 1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source.charCodeAt(index);
    if (character === 10) {
      count += 1;
    } else if (character === 13) {
      count += 1;
      if (index + 1 < source.length && source.charCodeAt(index + 1) === 10) index += 1;
    }
  }
  return count;
}

function unsupportedCopy(reason: MainPreviewUnavailableReason): string {
  switch (reason) {
    case "binary":
      return "Binary files are not shown in the text preview.";
    case "invalid-utf8":
      return "This file is not valid UTF-8 text.";
    case "sensitive":
      return "Preview is disabled for sensitive files.";
    case "unsupported-type":
      return "This file type does not support a text preview.";
    case "unknown":
      return "This file cannot be shown as text.";
  }
}

function restoreAttribute(element: Element, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

export class CodexLiveExplorerMainPreviewElement extends HTMLElement {
  readonly #shadow: ShadowRoot;
  readonly #tabList: HTMLElement;
  readonly #panelMount: HTMLElement;
  readonly #instanceId = ++nextInstanceId;
  readonly #tabIds = new Map<string, string>();
  readonly #suppressedChildren = new Map<Element, SuppressedAttributes>();
  readonly #syntaxCache = new Map<string, { source: string; highlight: SyntaxHighlight }>();
  #state: MainPreviewState = { activePath: null, tabs: [] };
  #rovingPath: string | null = null;
  #nextTabId = 0;
  #connected = false;
  #suppressedParent: Element | null = null;
  #childObserver: MutationObserver | null = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    this.#shadow.innerHTML = `
      <style>${mainPreviewStyles}</style>
      <div class="surface">
        <div class="tab-strip" role="tablist" aria-label="Conversation and file previews"></div>
        <div class="panel-mount"></div>
      </div>
    `;
    this.#tabList = this.#required<HTMLElement>(".tab-strip");
    this.#panelMount = this.#required<HTMLElement>(".panel-mount");
    this.#tabList.addEventListener("click", (event) => this.#onTabListClick(event));
    this.#tabList.addEventListener("keydown", (event) => this.#onTabListKeyDown(event));
    this.#shadow.addEventListener("keydown", (event) => this.#onShadowKeyDown(event as KeyboardEvent));
    this.#render();
  }

  connectedCallback(): void {
    this.#connected = true;
    this.#syncSuppression();
    queueMicrotask(() => {
      if (this.#connected) this.#scrollSelectedTabIntoView();
    });
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#syntaxCache.clear();
    this.#restoreSuppressedChildren();
  }

  get state(): MainPreviewState {
    const editor = this.#state.editor;
    return {
      activePath: this.#state.activePath,
      tabs: this.#state.tabs.map((view) => cloneView(view)),
      ...(editor
        ? {
            editor: {
              path: editor.path,
              draft: editor.draft,
              saving: editor.saving,
              ...(editor.error === undefined ? {} : { error: editor.error }),
            },
          }
        : {}),
    };
  }

  set state(state: MainPreviewState) {
    this.setState(state);
  }

  setState(state: MainPreviewState): void {
    const nextState = normalizeState(state);
    const enteringEditor = Boolean(nextState.editor && nextState.editor.path !== this.#state.editor?.path);
    const retainedPaths = new Set(nextState.tabs.map((view) => view.path));
    for (const path of this.#tabIds.keys()) {
      if (!retainedPaths.has(path)) this.#tabIds.delete(path);
    }
    for (const path of this.#syntaxCache.keys()) {
      const view = nextState.tabs.find((candidate) => candidate.path === path);
      const cached = this.#syntaxCache.get(path);
      if (view?.kind !== "text" || cached?.source !== view.text) this.#syntaxCache.delete(path);
    }
    const activeChanged = nextState.activePath !== this.#state.activePath;
    const rovingStillExists = this.#rovingPath === null || nextState.tabs.some((view) => view.path === this.#rovingPath);
    this.#state = nextState;
    if (activeChanged || !rovingStillExists) this.#rovingPath = nextState.activePath;
    this.#render();
    this.#syncSuppression();
    if (enteringEditor) {
      queueMicrotask(() => {
        if (this.#connected && this.#state.editor?.path === nextState.editor?.path) {
          this.#panelMount.querySelector<HTMLTextAreaElement>(".code-editor")?.focus();
        }
      });
    }
  }

  #render(): void {
    const focus = this.#captureFocus();
    this.toggleAttribute("data-file-active", this.#state.activePath !== null);
    this.toggleAttribute("data-editing", Boolean(this.#state.editor));
    this.#renderTabs();
    this.#renderPanel();
    this.#restoreFocus(focus);
    this.#scrollSelectedTabIntoView();
  }

  #renderTabs(): void {
    const fragment = this.ownerDocument.createDocumentFragment();
    const conversationSlot = this.ownerDocument.createElement("div");
    conversationSlot.className = `tab-slot conversation${this.#state.activePath === null ? " active" : ""}`;

    const conversationTab = this.ownerDocument.createElement("button");
    conversationTab.type = "button";
    conversationTab.className = "preview-tab";
    conversationTab.id = `cle-main-preview-${this.#instanceId}-conversation-tab`;
    conversationTab.setAttribute("role", "tab");
    conversationTab.setAttribute("aria-selected", String(this.#state.activePath === null));
    conversationTab.tabIndex = this.#rovingPath === null ? 0 : -1;
    conversationTab.dataset.tabKind = "conversation";
    conversationTab.append(this.#staticIcon(CONVERSATION_ICON, "tab-icon"), this.#textSpan("Conversation", "tab-label"));
    conversationSlot.append(conversationTab);
    fragment.append(conversationSlot);

    for (const view of this.#state.tabs) {
      const slot = this.ownerDocument.createElement("div");
      const active = view.path === this.#state.activePath;
      slot.className = `tab-slot file${active ? " active" : ""}`;

      const tab = this.ownerDocument.createElement("button");
      tab.type = "button";
      tab.className = "preview-tab";
      tab.id = this.#tabId(view.path);
      tab.title = view.path;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-controls", this.#panelId(view.path));
      tab.tabIndex = this.#rovingPath === view.path ? 0 : -1;
      tab.dataset.tabKind = "file";
      tab.dataset.path = view.path;
      tab.append(this.#staticIcon(getFileIcon(view.name).markup, "tab-icon"), this.#textSpan(view.name, "tab-label"));

      const close = this.ownerDocument.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.title = `Close ${view.name}`;
      close.setAttribute("aria-label", `Close ${view.name}`);
      close.dataset.closePath = view.path;
      close.innerHTML = icons.close;
      slot.append(tab, close);
      fragment.append(slot);
    }

    this.#tabList.replaceChildren(fragment);
  }

  #renderPanel(): void {
    if (this.#state.activePath === null) {
      this.#panelMount.replaceChildren();
      return;
    }

    const view = this.#state.tabs.find((candidate) => candidate.path === this.#state.activePath);
    if (!view) {
      this.#panelMount.replaceChildren();
      return;
    }

    const panel = this.ownerDocument.createElement("section");
    panel.className = "preview-panel";
    panel.id = this.#panelId(view.path);
    panel.tabIndex = 0;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", this.#tabId(view.path));
    if (view.kind === "loading") panel.setAttribute("aria-busy", "true");

    const metaBar = this.ownerDocument.createElement("header");
    metaBar.className = "preview-meta-bar";
    metaBar.append(this.#staticIcon(getFileIcon(view.name).markup, "panel-icon"));
    const location = this.#textSpan(view.path, "preview-location");
    location.title = view.path;
    metaBar.append(location, this.#textSpan(this.#metadataFor(view), "preview-metadata"));

    const content = this.ownerDocument.createElement("div");
    content.className = "preview-content";
    const editor = this.#state.editor?.path === view.path ? this.#state.editor : undefined;
    if (editor) content.classList.add("editor-mode");
    this.#renderViewContent(content, view, editor);
    panel.append(metaBar, content);
    this.#panelMount.replaceChildren(panel);
  }

  #renderViewContent(content: HTMLElement, view: MainPreviewFileView, editor?: MainPreviewEditorState): void {
    if (editor && (view.kind === "text" || view.kind === "empty")) {
      const stack = this.ownerDocument.createElement("div");
      stack.className = "code-editor-stack";
      const lineNumbers = this.#lineNumberGutter(stack, editor.draft, "code-editor-line-numbers");
      const mirror = this.ownerDocument.createElement("pre");
      mirror.className = "code-editor-highlight";
      mirror.setAttribute("aria-hidden", "true");
      const code = this.#highlightedCode(view.path, editor.draft);
      mirror.append(code);

      const textarea = this.ownerDocument.createElement("textarea");
      textarea.className = "code-editor";
      textarea.value = editor.draft;
      textarea.maxLength = MAX_SYNTAX_SOURCE_UNITS;
      textarea.wrap = "off";
      textarea.spellcheck = false;
      textarea.autocomplete = "off";
      textarea.setAttribute("autocapitalize", "off");
      textarea.setAttribute("autocorrect", "off");
      textarea.setAttribute("aria-label", `Edit ${view.name}`);
      textarea.setAttribute("aria-busy", String(editor.saving));
      let acceptedDraft = editor.draft;
      textarea.addEventListener("input", () => {
        if (textarea.value.length > MAX_SYNTAX_SOURCE_UNITS) {
          const selectionStart = Math.min(textarea.selectionStart, acceptedDraft.length);
          const selectionEnd = Math.min(textarea.selectionEnd, acceptedDraft.length);
          textarea.value = acceptedDraft;
          textarea.setSelectionRange(selectionStart, selectionEnd, textarea.selectionDirection);
          return;
        }
        acceptedDraft = textarea.value;
        this.#replaceHighlightedSource(code, view.path, textarea.value);
        this.#replaceLineNumbers(lineNumbers, stack, textarea.value);
        this.#syncEditorScroll(textarea);
        this.#dispatchPathEvent<MainPreviewDraftDetail>(MAIN_PREVIEW_DRAFT_EVENT, { path: view.path, text: textarea.value });
      });
      textarea.addEventListener("scroll", () => this.#syncEditorScroll(textarea), { passive: true });
      textarea.addEventListener("compositionstart", () => stack.classList.add("composing"));
      textarea.addEventListener("compositionend", () => {
        this.#replaceHighlightedSource(code, view.path, textarea.value);
        stack.classList.remove("composing");
        this.#syncEditorScroll(textarea);
      });
      stack.append(lineNumbers, mirror, textarea);
      content.append(stack);
      if (editor.error) {
        const error = this.ownerDocument.createElement("div");
        error.className = "editor-error";
        error.setAttribute("role", "alert");
        const copy = this.#textSpan(editor.error, "editor-error-copy");
        copy.title = editor.error;
        const reload = this.ownerDocument.createElement("button");
        reload.type = "button";
        reload.className = "editor-reload";
        reload.textContent = "Reload file";
        reload.addEventListener("click", () => {
          this.#dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_RELOAD_EVENT, { path: view.path });
        });
        error.append(copy, reload);
        content.append(error);
      }
      return;
    }
    switch (view.kind) {
      case "loading":
        content.append(this.#statePanel("Loading preview", "Reading this file from the local workspace.", "loading", view));
        return;
      case "text":
        if (view.text.length === 0) {
          content.append(this.#statePanel("Empty file", "This file is empty.", "empty", view));
          return;
        }
        {
          const reader = this.ownerDocument.createElement("div");
          reader.className = "code-reader";
          const lineNumbers = this.#lineNumberGutter(reader, view.text);
          const pre = this.ownerDocument.createElement("pre");
          pre.className = "literal-text";
          pre.setAttribute("aria-label", `${view.name} contents`);
          const code = this.#highlightedCode(view.path, view.text);
          pre.append(code);
          reader.append(lineNumbers, pre);
          content.append(reader);
        }
        return;
      case "empty":
        content.append(this.#statePanel("Empty file", "This file is empty.", "empty", view));
        return;
      case "unsupported":
        content.append(this.#statePanel("Preview unavailable", unsupportedCopy(view.reason), "unsupported", view));
        return;
      case "error":
        content.append(
          this.#statePanel("File preview failed", view.message || "The file could not be loaded. Select it again to retry.", "error", view),
        );
    }
  }

  #statePanel(
    title: string,
    copy: string,
    kind: "loading" | "empty" | "unsupported" | "error",
    view: MainPreviewFileView,
  ): HTMLElement {
    const panel = this.ownerDocument.createElement("div");
    panel.className = `view-state ${kind}`;
    if (kind === "loading") panel.setAttribute("role", "status");

    const card = this.ownerDocument.createElement("div");
    card.className = "state-card";
    if (kind === "loading") {
      const spinner = this.ownerDocument.createElement("div");
      spinner.className = "spinner";
      spinner.setAttribute("aria-hidden", "true");
      card.append(spinner);
    } else {
      const icon = kind === "error" ? icons.warning : getFileIcon(view.name).markup;
      card.append(this.#staticIcon(icon, "state-icon"));
    }
    const heading = this.ownerDocument.createElement("h2");
    heading.className = "state-title";
    heading.textContent = title;
    const paragraph = this.ownerDocument.createElement("p");
    paragraph.className = "state-copy";
    paragraph.textContent = copy;
    card.append(heading, paragraph);
    panel.append(card);
    return panel;
  }

  #metadataFor(view: MainPreviewFileView): string {
    switch (view.kind) {
      case "loading":
        return "Loading";
      case "text":
        return view.truncated ? `${formatBytes(view.sizeBytes)} \u00b7 Preview truncated` : formatBytes(view.sizeBytes);
      case "empty":
        return formatBytes(view.sizeBytes);
      case "unsupported":
        return formatBytes(view.sizeBytes);
      case "error":
        return view.code || "Preview error";
    }
  }

  #highlightedSource(path: string, source: string): SyntaxHighlight {
    const cached = this.#syntaxCache.get(path);
    if (cached?.source === source) return cached.highlight;
    const highlight = highlightSyntaxForPath(path, source);
    this.#syntaxCache.set(path, { source, highlight });
    return highlight;
  }

  #highlightedCode(path: string, source: string): HTMLElement {
    const code = this.ownerDocument.createElement("code");
    code.className = "syntax-code";
    this.#replaceHighlightedSource(code, path, source);
    return code;
  }

  #replaceHighlightedSource(code: HTMLElement, path: string, source: string): void {
    const highlighted = this.#highlightedSource(path, source);
    code.dataset.language = highlighted.language;
    code.toggleAttribute("data-highlight-limited", highlighted.limited);
    const fragment = this.ownerDocument.createDocumentFragment();
    for (const run of highlighted.runs) {
      const tokenText = source.slice(run.start, run.end);
      if (run.kind === "plain") {
        fragment.append(this.ownerDocument.createTextNode(tokenText));
      } else {
        const token = this.ownerDocument.createElement("span");
        token.className = `tok-${run.kind}`;
        token.textContent = tokenText;
        fragment.append(token);
      }
    }
    code.replaceChildren(fragment);
  }

  #lineNumberGutter(surface: HTMLElement, source: string, extraClass = ""): HTMLElement {
    const gutter = this.ownerDocument.createElement("pre");
    gutter.className = `code-line-numbers ${extraClass}`.trim();
    gutter.setAttribute("aria-hidden", "true");
    this.#replaceLineNumbers(gutter, surface, source);
    return gutter;
  }

  #replaceLineNumbers(gutter: HTMLElement, surface: HTMLElement, source: string): void {
    const lineCount = sourceLineCount(source);
    gutter.dataset.lineCount = String(lineCount);
    gutter.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
    const digits = Math.max(2, String(lineCount).length);
    surface.style.setProperty("--cle-line-number-width", `calc(${digits}ch + 24px)`);
  }

  #syncEditorScroll(editor: HTMLTextAreaElement): void {
    const mirror = editor.parentElement?.querySelector<HTMLElement>(".code-editor-highlight");
    if (!mirror) return;
    mirror.scrollTop = editor.scrollTop;
    mirror.scrollLeft = editor.scrollLeft;
    const lineNumbers = editor.parentElement?.querySelector<HTMLElement>(".code-editor-line-numbers");
    if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
  }

  #onTabListClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const close = target.closest<HTMLButtonElement>("button[data-close-path]");
    if (close) {
      const path = close.dataset.closePath;
      if (path) this.#dispatchClose(path);
      return;
    }
    const tab = target.closest<HTMLElement>("[role='tab']");
    if (tab && this.#tabList.contains(tab)) this.#activateTab(tab);
  }

  #onTabListKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[role='tab']") : null;
    if (!target || !this.#tabList.contains(target)) return;
    const focusedPath = this.#pathForTab(target);
    if (
      focusedPath !== null &&
      (event.key === "Delete" || (event.key.toLowerCase() === "w" && (event.ctrlKey || event.metaKey)))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#dispatchClose(focusedPath);
      return;
    }
    const tabs = this.#tabs();
    const index = tabs.indexOf(target);
    if (index < 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    this.#setRovingPath(this.#pathForTab(next));
    next.focus();
    this.#activateTab(next);
  }

  #onShadowKeyDown(event: KeyboardEvent): void {
    if (
      this.#state.editor &&
      event.key.toLocaleLowerCase() === "s" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.#dispatchPathEvent<MainPreviewPathDetail>(MAIN_PREVIEW_SAVE_EVENT, { path: this.#state.editor.path });
      return;
    }
    if (event.key !== "Escape" || this.#state.activePath === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.#rovingPath = null;
    if (!this.#dispatchActivate({ kind: "conversation" })) {
      this.#setRovingPath(this.#state.activePath);
      this.#focusActiveTab();
      return;
    }
    this.#setRovingPath(null);
    this.#tabForPath(null)?.focus();
  }

  #activateTab(tab: HTMLElement): void {
    const path = this.#pathForTab(tab);
    this.#setRovingPath(path);
    const activated = path === null
      ? this.#dispatchActivate({ kind: "conversation" })
      : this.#dispatchActivate({ kind: "file", path });
    if (!activated) {
      this.#setRovingPath(this.#state.activePath);
      this.#focusActiveTab();
    }
  }

  #dispatchActivate(detail: MainPreviewActivateDetail): boolean {
    return this.dispatchEvent(
      new CustomEvent<MainPreviewActivateDetail>(MAIN_PREVIEW_ACTIVATE_EVENT, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      }),
    );
  }

  #dispatchClose(path: string): void {
    this.dispatchEvent(
      new CustomEvent<MainPreviewCloseDetail>(MAIN_PREVIEW_CLOSE_EVENT, { bubbles: true, composed: true, detail: { path } }),
    );
  }

  #dispatchPathEvent<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(name, { bubbles: true, composed: true, detail }));
  }

  #setRovingPath(path: string | null): void {
    this.#rovingPath = path;
    for (const tab of this.#tabs()) tab.tabIndex = this.#pathForTab(tab) === path ? 0 : -1;
  }

  #pathForTab(tab: HTMLElement): string | null {
    return tab.dataset.tabKind === "file" ? (tab.dataset.path ?? null) : null;
  }

  #tabs(): HTMLElement[] {
    return Array.from(this.#tabList.querySelectorAll<HTMLElement>("[role='tab']"));
  }

  #tabForPath(path: string | null): HTMLElement | undefined {
    return this.#tabs().find((tab) => this.#pathForTab(tab) === path);
  }

  #captureFocus(): FocusSnapshot {
    const active = this.#shadow.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    if (active instanceof HTMLTextAreaElement && active.matches(".code-editor")) {
      return {
        kind: "editor",
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
        selectionDirection: active.selectionDirection,
        scrollTop: active.scrollTop,
        scrollLeft: active.scrollLeft,
      };
    }
    if (active.matches("[role='tab']")) return { kind: "tab", path: this.#pathForTab(active) };
    if (active.matches("button[data-close-path]")) {
      const path = active.dataset.closePath;
      return path ? { kind: "close", path } : null;
    }
    if (active.matches(".preview-panel")) return { kind: "panel" };
    return null;
  }

  #restoreFocus(focus: FocusSnapshot): void {
    if (!focus) return;
    if (focus.kind === "editor") {
      const editor = this.#panelMount.querySelector<HTMLTextAreaElement>(".code-editor");
      if (editor) {
        editor.focus();
        editor.setSelectionRange(focus.selectionStart, focus.selectionEnd, focus.selectionDirection);
        editor.scrollTop = focus.scrollTop;
        editor.scrollLeft = focus.scrollLeft;
        this.#syncEditorScroll(editor);
      } else {
        this.#focusActiveTab();
      }
      return;
    }
    if (focus.kind === "tab") {
      const tab = this.#tabForPath(focus.path);
      if (tab) tab.focus();
      else this.#focusActiveTab();
      return;
    }
    if (focus.kind === "close") {
      const button = Array.from(this.#tabList.querySelectorAll<HTMLButtonElement>("button[data-close-path]")).find(
        (candidate) => candidate.dataset.closePath === focus.path,
      );
      if (button) button.focus();
      else this.#focusActiveTab();
      return;
    }
    const panel = this.#panelMount.querySelector<HTMLElement>(".preview-panel");
    if (panel) panel.focus();
    else this.#focusActiveTab();
  }

  #tabId(path: string): string {
    let id = this.#tabIds.get(path);
    if (!id) {
      this.#nextTabId += 1;
      id = `cle-main-preview-${this.#instanceId}-file-tab-${this.#nextTabId}`;
      this.#tabIds.set(path, id);
    }
    return id;
  }

  #panelId(path: string): string {
    return `${this.#tabId(path)}-panel`;
  }

  #staticIcon(markup: string, className: string): HTMLElement {
    const icon = this.ownerDocument.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = markup;
    return icon;
  }

  #textSpan(text: string, className: string): HTMLSpanElement {
    const span = this.ownerDocument.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  #focusActiveTab(): void {
    (this.#tabForPath(this.#state.activePath) ?? this.#tabForPath(null))?.focus();
  }

  #scrollSelectedTabIntoView(): void {
    const selected = this.#tabForPath(this.#state.activePath);
    const slot = selected?.parentElement;
    if (!slot) return;
    const scrollIntoView = (slot as HTMLElement).scrollIntoView;
    if (typeof scrollIntoView === "function") scrollIntoView.call(slot, { block: "nearest", inline: "nearest" });
  }

  #syncSuppression(): void {
    const parent = this.#connected && this.#state.activePath !== null && this.parentElement?.matches("main.main-surface")
      ? this.parentElement
      : null;
    if (!parent) {
      this.#restoreSuppressedChildren();
      return;
    }
    if (this.#suppressedParent !== parent) {
      this.#restoreSuppressedChildren();
      this.#suppressedParent = parent;
      this.#childObserver = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.removedNodes) {
            if (node instanceof Element && node.parentElement !== parent) this.#restoreSuppressedChild(node);
          }
          for (const node of record.addedNodes) {
            if (node instanceof Element && node.parentElement === parent && node !== this) this.#suppressChild(node);
          }
        }
      });
      this.#childObserver.observe(parent, { childList: true });
    }
    for (const child of Array.from(parent.children)) {
      if (child !== this) this.#suppressChild(child);
    }
  }

  #suppressChild(child: Element): void {
    if (this.#suppressedChildren.has(child)) return;
    this.#suppressedChildren.set(child, {
      inert: child.getAttribute("inert"),
      ariaHidden: child.getAttribute("aria-hidden"),
    });
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
  }

  #restoreSuppressedChild(child: Element): void {
    const attributes = this.#suppressedChildren.get(child);
    if (!attributes) return;
    restoreAttribute(child, "inert", attributes.inert);
    restoreAttribute(child, "aria-hidden", attributes.ariaHidden);
    this.#suppressedChildren.delete(child);
  }

  #restoreSuppressedChildren(): void {
    this.#childObserver?.disconnect();
    this.#childObserver = null;
    for (const child of Array.from(this.#suppressedChildren.keys())) this.#restoreSuppressedChild(child);
    this.#suppressedChildren.clear();
    this.#suppressedParent = null;
  }

  #required<T extends Element>(selector: string): T {
    const element = this.#shadow.querySelector<T>(selector);
    if (!element) throw new Error(`Missing main preview element: ${selector}`);
    return element;
  }
}

export function registerMainPreviewElement(): void {
  if (!customElements.get(MAIN_PREVIEW_TAG)) {
    customElements.define(MAIN_PREVIEW_TAG, CodexLiveExplorerMainPreviewElement);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "codex-live-explorer-main-preview": CodexLiveExplorerMainPreviewElement;
  }

  interface HTMLElementEventMap {
    "cle-main-preview-activate": MainPreviewActivateEvent;
    "cle-main-preview-close": MainPreviewCloseEvent;
    "cle-main-preview-draft": MainPreviewDraftEvent;
    "cle-main-preview-save": MainPreviewSaveEvent;
    "cle-main-preview-reload": MainPreviewReloadEvent;
  }
}
