import { backgroundPreviewSurfaceStyles } from './background-surfaces';
// Domain extracted from the original explorer composition; behavior and storage contracts retained.


export const mainPreviewStyles = String.raw`
  :host([data-home-suspended]) { display: none !important; }
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

  :host-context(html[data-code-codex-transparent-background]) :is(
    .tab-strip,
    .tab-slot.active,
    .preview-tab[aria-selected="true"],
    .preview-panel,
    .preview-meta-bar,
    .preview-content,
    .code-minimap,
    .code-vertical-scrollbar,
    .code-line-numbers,
    .code-editor-stack,
    .code-editor-highlight,
    .code-editor,
    .editor-error,
    .markdown-reader,
    .markdown-truncated,
    .csv-preview,
    .csv-table-scroll,
    .diagram-preview,
    .diagram-canvas,
    .notebook-preview,
    .model-preview,
    .model-preview-toolbar,
    .model-preview-stage,
    .media-preview[data-kind="pdf"],
    .pdf-preview-toolbar,
    .pdf-page-stage,
    .office-preview,
    .office-preview-notice,
    .office-sheet-tabs,
    .office-sheet-viewport,
    .office-preview-toolbar,
    .office-slide-viewport,
    .rpv-root,
    .rpv-stage,
    .rpv-viewport,
    .rpv-status
  ) {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${backgroundPreviewSurfaceStyles}

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

  :host([data-clipped-layout="true"]) .surface {
    --cle-preview-header-height: 42px;
    grid-template-rows: var(--cle-preview-header-height) minmax(0, 1fr);
  }

  :host([data-clipped-layout="true"]) .tab-strip {
    height: var(--cle-preview-header-height);
    align-self: start;
    width: calc(100% - 124px);
    background: var(--cle-main-bg);
  }

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
  :host([data-clipped-layout="true"]) .tab-slot {
    flex: 0 0 144px;
    width: 144px;
  }
  :host([data-clipped-layout="true"]) .tab-slot.active,
  :host([data-clipped-layout="true"]) .preview-tab[aria-selected="true"] {
    background: var(--cle-main-bar);
  }
  :host([data-clipped-layout="true"]) .preview-tab {
    height: 41px;
    gap: 6px;
    padding-inline: 10px;
    font-size: 13px;
    line-height: var(--cle-native-title-line-height, 24px);
  }
  :host([data-clipped-layout="true"]) .tab-slot.conversation .preview-tab {
    padding-left: 17px;
  }
  :host([data-clipped-layout="true"]) .tab-icon {
    width: 14px;
    height: 14px;
  }
  :host([data-clipped-layout="true"]) .tab-close {
    width: 22px;
    height: 22px;
    margin: 0 3px 0 -2px;
    padding: 5px;
  }
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

  .preview-content.editor-mode.markdown-editor-mode {
    display: block;
    overflow: auto;
  }

  .git-diff-reader {
    min-width: max-content;
    margin: 0;
    padding: 10px 0 24px;
    color: var(--cle-main-muted);
    font: 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    tab-size: 4;
  }

  .git-diff-line {
    display: block;
    min-height: 18px;
    padding: 0 16px;
    white-space: pre;
  }

  .git-diff-line-add {
    color: var(--cle-syntax-inserted);
    background: color-mix(in srgb, var(--cle-syntax-inserted) 13%, transparent);
  }

  .git-diff-line-remove {
    color: var(--cle-syntax-deleted);
    background: color-mix(in srgb, var(--cle-syntax-deleted) 13%, transparent);
  }

  .git-diff-line-hunk {
    color: var(--cle-syntax-meta);
    background: color-mix(in srgb, var(--cle-syntax-meta) 8%, transparent);
  }

  .git-diff-line-header { color: var(--cle-main-faint); }

  .media-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    padding: 24px;
    overflow: hidden;
  }

  .media-preview-image,
  .media-preview-video,
  .media-preview-audio {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .media-preview-image {
    width: auto;
    height: auto;
  }

  .media-preview-video {
    width: min(100%, 1200px);
    height: auto;
    background: #000000;
  }

  .media-preview[data-kind="pdf"] {
    display: block;
    padding: 0;
    overflow: auto;
    background: var(--cle-main-raised);
  }

  .media-preview-pdf {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    min-height: 100%;
  }

  .pdf-preview-toolbar {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 42px;
    padding: 6px 12px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
    border-bottom: 1px solid var(--cle-main-line);
    backdrop-filter: blur(10px);
  }

  .pdf-preview-toolbar button {
    min-width: 70px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .pdf-preview-toolbar button:hover:not(:disabled) { background: var(--cle-main-hover); }
  .pdf-preview-toolbar button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }
  .pdf-preview-toolbar button[aria-disabled="true"] { cursor: default; opacity: .42; }

  .pdf-page-status {
    min-width: 84px;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-align: center;
  }

  .pdf-page-stage {
    display: grid;
    place-items: start center;
    min-width: 0;
    min-height: 100%;
    padding: 24px;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .pdf-page-canvas {
    display: block;
    max-width: 100%;
    height: auto;
    background: #ffffff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .22), 0 1px 3px rgba(0, 0, 0, .2);
  }

  .pdf-preview-loading,
  .pdf-page-error {
    align-self: center;
    max-width: 440px;
    margin: auto;
    padding: 24px;
    color: var(--cle-main-muted);
    text-align: center;
  }

  .pdf-page-error { color: var(--cle-syntax-deleted); }

  @media (max-width: 640px) {
    .pdf-preview-toolbar { gap: 6px; }
    .pdf-preview-toolbar button { min-width: 60px; padding-inline: 8px; }
    .pdf-page-stage { padding: 12px; }
  }

  .media-preview-audio {
    width: min(100%, 720px);
    height: 54px;
  }

  .model-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .model-preview-toolbar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    min-height: 42px;
    padding: 6px 12px 6px 14px;
    border-bottom: 1px solid var(--cle-main-line);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
  }

  .model-preview-summary {
    min-width: 0;
    overflow: hidden;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-preview-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
  }

  .model-preview-actions button {
    min-width: 54px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .model-preview-actions button:hover:not(:disabled) { background: var(--cle-main-hover); }
  .model-preview-actions button:focus-visible,
  .model-preview-canvas:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: -3px; }
  .model-preview-actions button:disabled { cursor: default; opacity: .42; }
  .model-preview-actions button[hidden] { display: none; }

  .model-preview-stage {
    position: relative;
    min-width: 0;
    min-height: 220px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--cle-main-text) 4%, transparent), transparent 52%),
      var(--cle-main-bg);
    touch-action: none;
  }

  .model-preview-canvas {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    outline: none;
  }

  .model-preview-status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    color: var(--cle-main-muted);
    font-size: 12px;
    text-align: center;
    pointer-events: none;
  }

  .model-preview-help {
    position: absolute;
    right: 12px;
    bottom: 10px;
    max-width: calc(100% - 24px);
    padding: 5px 8px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 86%, transparent);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .model-preview-toolbar { padding-inline: 8px; }
    .model-preview-actions { gap: 4px; }
    .model-preview-actions button { min-width: 48px; padding-inline: 7px; }
    .model-preview-help { display: none; }
  }



  .office-preview {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
  }

  .office-preview-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .office-preview[data-has-notice="true"] {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .office-preview[data-has-notice="true"] .office-preview-stage {
    height: auto;
  }

  .office-preview-loading {
    display: grid;
    min-height: 100%;
    place-items: center;
    padding: 24px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    text-align: center;
  }

  .office-preview[data-kind="docx"] {
    overflow: auto;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-preview[data-kind="docx"] .office-preview-stage {
    height: auto;
    min-height: 100%;
    padding: 24px;
    box-sizing: border-box;
  }

  .office-word-document {
    width: max-content;
    min-width: 100%;
    margin: 0 auto;
    color: #1f2328;
    font-family: Aptos, Calibri, "Segoe UI", sans-serif;
  }

  .office-word-document > div {
    display: flex !important;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 0 !important;
    background: transparent !important;
  }

  .office-word-document section {
    flex: 0 0 auto;
    margin: 0 auto 20px;
    background: #ffffff;
    box-shadow: 0 8px 28px rgba(0, 0, 0, .22), 0 1px 3px rgba(0, 0, 0, .2) !important;
  }

  .office-word-document section.office-word-unpaginated {
    height: auto !important;
    min-height: 0 !important;
    box-shadow: none !important;
  }

  .office-word-document section.office-word-unpaginated > header,
  .office-word-document section.office-word-unpaginated > footer {
    position: static !important;
  }

  .office-word-document section.office-word-oversized {
    height: auto !important;
  }

  .office-word-document p[data-cle-docx-paragraph-continuation="true"] {
    list-style-type: none !important;
    counter-increment: none !important;
    counter-reset: none !important;
    counter-set: none !important;
  }

  .office-word-document p[data-cle-docx-paragraph-continuation="true"]::before {
    display: none !important;
    content: none !important;
    counter-increment: none !important;
  }

  .office-word-document section img {
    max-width: 100%;
  }

  .office-preview-notice {
    display: block;
    padding: 8px 12px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border-top: 1px solid var(--cle-main-line);
    font-size: 11px;
    text-align: center;
  }

  .office-workbook,
  .office-presentation {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .office-sheet-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    min-height: 38px;
    padding: 5px 8px 0;
    overflow-x: auto;
    overflow-y: hidden;
    box-sizing: border-box;
    background: var(--cle-main-raised);
    border-bottom: 1px solid var(--cle-main-line);
    scrollbar-width: thin;
  }

  .office-sheet-tabs button {
    flex: 0 0 auto;
    max-width: 220px;
    min-height: 28px;
    padding: 4px 10px;
    overflow: hidden;
    color: var(--cle-main-muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .office-sheet-tabs button:hover { color: var(--cle-main-text); background: var(--cle-main-hover); }
  .office-sheet-tabs button[aria-selected="true"] {
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border-color: var(--cle-main-line);
    border-bottom-color: var(--cle-main-bg);
  }
  .office-sheet-tabs button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: -2px; }
  .office-sheet-overflow { flex: 0 0 auto; padding: 0 7px; color: var(--cle-main-faint); font-size: 11px; }

  .office-sheet-viewport {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--cle-main-bg);
  }

  .office-sheet-table {
    width: max-content;
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }

  .office-sheet-table caption {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .office-sheet-table th,
  .office-sheet-table td {
    min-width: 72px;
    height: 26px;
    padding: 4px 7px;
    box-sizing: border-box;
    overflow: hidden;
    border-right: 1px solid var(--cle-main-line);
    border-bottom: 1px solid var(--cle-main-line);
    text-align: left;
    text-overflow: ellipsis;
    vertical-align: middle;
    white-space: pre;
  }

  .office-sheet-table thead th {
    position: sticky;
    z-index: 2;
    top: 0;
    min-width: 72px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 500;
    text-align: center;
  }

  .office-sheet-table tbody th,
  .office-sheet-corner {
    position: sticky;
    z-index: 1;
    left: 0;
    min-width: 44px;
    width: 44px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 400;
    text-align: right;
  }

  .office-sheet-corner { z-index: 3 !important; top: 0; }

  .office-preview-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 42px;
    padding: 6px 12px;
    box-sizing: border-box;
    color: var(--cle-main-muted);
    background: color-mix(in srgb, var(--cle-main-bg) 94%, transparent);
    border-bottom: 1px solid var(--cle-main-line);
  }

  .office-preview-toolbar button {
    min-width: 70px;
    min-height: 28px;
    padding: 4px 10px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .office-preview-toolbar button:hover:not([aria-disabled="true"]) { background: var(--cle-main-hover); }
  .office-preview-toolbar button:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }
  .office-preview-toolbar button[aria-disabled="true"] { cursor: default; opacity: .42; }
  .office-page-status {
    min-width: 96px;
    color: var(--cle-main-muted);
    font-size: 11px;
    text-align: center;
  }

  .office-slide-viewport {
    display: grid;
    min-width: 0;
    min-height: 0;
    padding: 20px;
    overflow: auto;
    box-sizing: border-box;
    place-items: center;
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-slide-viewport > * { max-width: 100%; }

  .office-preview[data-kind="ppt"] .office-slide-viewport {
    padding: 0;
    overflow: hidden;
    place-items: stretch;
  }

  .office-preview[data-kind="ppt"] .rpv-root {
    width: 100%;
    height: 100%;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
    border: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .office-preview[data-kind="ppt"] .rpv-workspace {
    min-height: 100%;
    max-height: 100%;
  }

  .office-preview[data-kind="ppt"] .rpv-stage,
  .office-preview[data-kind="ppt"] .rpv-viewport,
  .office-preview[data-kind="ppt"] .rpv-status {
    background: color-mix(in srgb, var(--cle-main-raised) 88%, var(--cle-main-text));
  }

  .office-preview[data-kind="ppt"] .rpv-viewport { padding: 20px; }

  .office-native-slide {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    background: #fff;
  }

  @media (max-width: 640px) {
    .office-preview[data-kind="docx"] .office-preview-stage { padding: 12px; }
    .office-preview-toolbar { gap: 6px; }
    .office-preview-toolbar button { min-width: 60px; padding-inline: 8px; }
    .office-slide-viewport { padding: 10px; }
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

  .markdown-reader {
    min-width: 0;
    min-height: 100%;
    padding: 0 0 64px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }

  .markdown-body {
    width: min(100%, 920px);
    margin: 0 auto;
    padding: 30px clamp(24px, 5vw, 52px) 20px;
    color: var(--cle-main-text);
    font: 14px/1.62 -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", sans-serif;
    overflow-wrap: anywhere;
  }
  .markdown-editor { min-height: 100%; }
  .markdown-editor-surface {
    min-height: calc(100% - 64px);
    caret-color: var(--cle-main-text);
    cursor: text;
    outline: none;
  }
  .markdown-editor-surface:focus-visible {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cle-main-focus) 42%, transparent);
  }
  .markdown-editor-surface[data-limit-reached="true"] {
    box-shadow: inset 0 0 0 1px var(--cle-syntax-deleted);
  }
  .markdown-editor-surface a { cursor: text; }
  .markdown-editor-surface .task-list-item input { cursor: pointer; }
  .markdown-editor-surface .markdown-image-placeholder {
    cursor: default;
    user-select: none;
  }
  .markdown-front-matter-placeholder,
  .markdown-comment-placeholder {
    display: block;
    margin: 0 0 16px;
    padding: 7px 10px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px dashed var(--cle-main-line);
    border-radius: 5px;
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    user-select: all;
  }
  .markdown-comment-placeholder {
    display: inline-flex;
    margin: 0 3px;
    padding-block: 1px;
  }
  .markdown-body > :first-child { margin-top: 0 !important; }
  .markdown-body > :last-child { margin-bottom: 0 !important; }
  .markdown-body h1,
  .markdown-body h2,
  .markdown-body h3,
  .markdown-body h4,
  .markdown-body h5,
  .markdown-body h6 {
    margin: 1.45em 0 .6em;
    color: var(--cle-main-text);
    font-weight: 600;
    line-height: 1.25;
  }
  .markdown-body h1 {
    padding-bottom: .28em;
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 2em;
    font-weight: 500;
  }
  .markdown-body h2 {
    padding-bottom: .26em;
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 1.5em;
    font-weight: 500;
  }
  .markdown-body h3 { font-size: 1.25em; }
  .markdown-body h4 { font-size: 1em; }
  .markdown-body h5 { font-size: .875em; }
  .markdown-body h6 { color: var(--cle-main-muted); font-size: .85em; }
  .markdown-body p,
  .markdown-body blockquote,
  .markdown-body ul,
  .markdown-body ol,
  .markdown-body table,
  .markdown-body pre { margin: 0 0 16px; }
  .markdown-body ul,
  .markdown-body ol { padding-left: 2em; }
  .markdown-body li + li { margin-top: .25em; }
  .markdown-body li > p { margin: 8px 0; }
  .markdown-body blockquote {
    padding: 1px 0 1px 16px;
    color: var(--cle-main-muted);
    border-left: 4px solid var(--cle-main-line);
  }
  .markdown-body blockquote > :last-child { margin-bottom: 0; }
  .markdown-body hr {
    height: 2px;
    margin: 24px 0;
    background: var(--cle-main-line);
    border: 0;
  }
  .markdown-body a {
    color: var(--cle-syntax-function);
    text-decoration: none;
    cursor: not-allowed;
  }
  .markdown-body a:hover { text-decoration: underline; }
  .markdown-body strong { font-weight: 650; }
  .markdown-body code {
    padding: .12em .32em;
    color: var(--cle-main-text);
    background: var(--cle-main-hover);
    border: 1px solid var(--cle-main-line);
    border-radius: 4px;
    font: .91em/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  }
  .markdown-body pre {
    max-width: 100%;
    padding: 14px 16px;
    overflow: auto;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    tab-size: 4;
  }
  .markdown-body pre code {
    display: block;
    min-width: max-content;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
    font-size: 12.5px;
    line-height: 1.55;
    white-space: pre;
  }
  .markdown-body table {
    display: block;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    border-spacing: 0;
    border-collapse: collapse;
  }
  .markdown-body th,
  .markdown-body td {
    padding: 6px 12px;
    border: 1px solid var(--cle-main-line);
  }
  .markdown-body th {
    font-weight: 600;
    background: var(--cle-main-raised);
  }
  .markdown-body .markdown-align-left { text-align: left; }
  .markdown-body .markdown-align-center { text-align: center; }
  .markdown-body .markdown-align-right { text-align: right; }
  .markdown-body tr:nth-child(2n) td { background: var(--cle-main-hover); }
  .markdown-body .task-list { padding-left: .4em; list-style: none; }
  .markdown-body .task-list-item { list-style: none; }
  .markdown-body .task-list-item input {
    width: 14px;
    height: 14px;
    margin: 0 7px 0 0;
    vertical-align: -2px;
    accent-color: var(--cle-main-focus);
  }
  .markdown-image-placeholder {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px dashed var(--cle-main-line);
    border-radius: 5px;
    font-size: 11px;
  }
  .markdown-truncated {
    width: min(100%, 920px);
    margin: 18px auto -10px;
    padding: 8px clamp(24px, 5vw, 52px);
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border-bottom: 1px solid var(--cle-main-line);
    font-size: 11px;
  }

  .csv-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 18px clamp(12px, 2.5vw, 28px) 24px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .csv-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 0 2px 13px;
  }
  .csv-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .csv-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .csv-mode {
    flex: 0 0 auto;
    padding: 4px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 999px;
    font-size: 10.5px;
    white-space: nowrap;
  }
  .csv-notices { display: grid; flex: 0 0 auto; gap: 6px; margin: 0 0 10px; }
  .csv-notice {
    padding: 7px 9px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .csv-warning { color: var(--cle-main-text); }
  .csv-table-scroll {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 8px;
  }
  .csv-table-scroll:focus-visible {
    outline: 2px solid var(--cle-main-focus);
    outline-offset: 2px;
  }
  .csv-table {
    width: max-content;
    min-width: 100%;
    border-spacing: 0;
    border-collapse: separate;
    color: var(--cle-main-text);
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-variant-numeric: tabular-nums;
  }
  .csv-table th,
  .csv-table td {
    min-width: 112px;
    max-width: 360px;
    padding: 6px 10px;
    border-right: 1px solid var(--cle-main-line);
    border-bottom: 1px solid var(--cle-main-line);
    vertical-align: top;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    unicode-bidi: plaintext;
    tab-size: 4;
  }
  .csv-table tr > :last-child { border-right: 0; }
  .csv-table tbody tr:last-child > * { border-bottom: 0; }
  .csv-column-header {
    position: sticky;
    top: 0;
    z-index: 2;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    font-weight: 600;
    text-align: center !important;
    user-select: none;
  }
  .csv-row-number {
    position: sticky;
    left: 0;
    z-index: 1;
    width: 48px;
    min-width: 48px !important;
    max-width: 48px !important;
    color: var(--cle-main-faint);
    background: var(--cle-main-raised);
    font-weight: 500;
    text-align: right !important;
    user-select: none;
  }
  .csv-corner { top: 0; z-index: 3; text-align: center !important; }
  .csv-table tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--cle-main-hover) 58%, transparent); }
  .csv-table tbody tr:hover td { background: var(--cle-main-hover); }
  .csv-caption {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .diagram-preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 100%;
    padding: 18px clamp(12px, 2.5vw, 28px) 28px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .diagram-header {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 0 2px 13px;
  }
  .diagram-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .diagram-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .diagram-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 7px; }
  .diagram-page-label { color: var(--cle-main-muted); font-size: 10.5px; }
  .diagram-page-select {
    max-width: 220px;
    height: 28px;
    padding: 0 25px 0 8px;
    color: var(--cle-main-text);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font: 11px/1.2 "Segoe UI", sans-serif;
  }
  .diagram-page-select:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 2px; }
  .diagram-notices { display: grid; flex: 0 0 auto; gap: 6px; margin: 0 0 10px; }
  .diagram-notice {
    padding: 7px 9px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
  }
  .diagram-canvas {
    display: grid;
    flex: 1 1 auto;
    place-items: start center;
    min-width: 0;
    min-height: 240px;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 8px;
  }
  .diagram-canvas:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 2px; }
  .diagram-canvas svg { display: block; flex: 0 0 auto; max-width: none; height: auto; min-height: 220px; }
  .diagram-status {
    align-self: stretch;
    width: min(100%, 520px);
    margin: auto;
    padding: 40px 24px;
    color: var(--cle-main-muted);
    font-size: 12px;
    line-height: 1.55;
    text-align: center;
  }
  .diagram-status.error { color: var(--cle-main-text); }

  .notebook-preview {
    min-width: 0;
    min-height: 100%;
    padding: 24px clamp(14px, 3vw, 34px) 64px;
    color: var(--cle-main-text);
    background: var(--cle-main-bg);
  }
  .notebook-shell { width: min(100%, 1040px); margin: 0 auto; }
  .notebook-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin: 0 0 18px;
    padding: 0 2px 14px;
    border-bottom: 1px solid var(--cle-main-line);
  }
  .notebook-title { margin: 0 0 4px; font-size: 15px; font-weight: 650; line-height: 1.35; }
  .notebook-summary { color: var(--cle-main-muted); font-size: 11px; line-height: 1.5; }
  .notebook-mode {
    flex: 0 0 auto;
    padding: 4px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 999px;
    font-size: 10.5px;
    white-space: nowrap;
  }
  .notebook-notice {
    margin: 0 0 14px;
    padding: 8px 10px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px solid var(--cle-main-line);
    border-radius: 7px;
    font-size: 11px;
    line-height: 1.45;
  }
  .notebook-cells { display: grid; gap: 14px; }
  .notebook-cell {
    --cle-notebook-prompt-width: 62px;
    display: grid;
    grid-template-columns: var(--cle-notebook-prompt-width) minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    background: var(--cle-main-bg);
    border: 1px solid var(--cle-main-line);
    border-radius: 9px;
  }
  .notebook-cell.markdown { border-color: transparent; background: transparent; }
  .notebook-prompt {
    grid-column: 1;
    padding: 14px 9px 12px 6px;
    color: var(--cle-main-faint);
    background: var(--cle-main-raised);
    border-right: 1px solid var(--cle-main-line);
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
  }
  .notebook-cell.markdown .notebook-prompt { color: transparent; background: transparent; border-right-color: transparent; }
  .notebook-cell-body { grid-column: 2; min-width: 0; overflow: hidden; }
  .notebook-source,
  .notebook-raw,
  .notebook-output pre {
    margin: 0;
    font: 12.5px/1.58 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    tab-size: 4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .notebook-source { padding: 14px 16px; overflow: auto; white-space: pre; }
  .notebook-source code { display: block; min-width: max-content; font: inherit; }
  .notebook-raw { padding: 14px 16px; color: var(--cle-main-muted); }
  .notebook-markdown.markdown-body {
    width: auto;
    margin: 0;
    padding: 4px 12px 2px 16px;
    font-size: 14px;
  }
  .notebook-markdown .notebook-image-placeholder { margin-block: 3px; }
  .notebook-image-placeholder {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 8px;
    color: var(--cle-main-muted);
    background: var(--cle-main-raised);
    border: 1px dashed var(--cle-main-line);
    border-radius: 5px;
    font-size: 11px;
  }
  .notebook-outputs { border-top: 1px solid var(--cle-main-line); }
  .notebook-output { min-width: 0; padding: 11px 16px; overflow: auto; }
  .notebook-output + .notebook-output { border-top: 1px solid var(--cle-main-line); }
  .notebook-output.stderr,
  .notebook-output.error { color: var(--cle-syntax-deleted); background: color-mix(in srgb, var(--cle-syntax-deleted) 5%, transparent); }
  .notebook-output.unsupported { color: var(--cle-main-muted); font-size: 11px; }
  .notebook-output-image {
    display: block;
    max-width: 100%;
    max-height: min(70vh, 920px);
    margin: 0 auto;
    object-fit: contain;
  }
  .notebook-rich-html { color: var(--cle-main-text); font-size: 12.5px; line-height: 1.55; overflow-wrap: anywhere; }
  .notebook-rich-html > :first-child { margin-top: 0; }
  .notebook-rich-html > :last-child { margin-bottom: 0; }
  .notebook-rich-html table { max-width: 100%; border-collapse: collapse; }
  .notebook-rich-html th,
  .notebook-rich-html td { padding: 5px 9px; border: 1px solid var(--cle-main-line); text-align: left; }
  .notebook-rich-html th { background: var(--cle-main-raised); font-weight: 600; }
  .notebook-rich-html pre { overflow: auto; white-space: pre; }
  .notebook-limited { color: var(--cle-main-muted); }

  @media (max-width: 680px) {
    .csv-preview { padding-inline: 9px; }
    .csv-header { display: block; }
    .csv-mode { display: inline-block; margin-top: 8px; }
    .csv-table th,
    .csv-table td { min-width: 96px; padding-inline: 8px; }
    .diagram-preview { padding-inline: 9px; }
    .diagram-header { display: block; }
    .diagram-controls { margin-top: 8px; }
    .notebook-preview { padding-inline: 10px; }
    .notebook-header { display: block; }
    .notebook-mode { display: inline-block; margin-top: 8px; }
    .notebook-cell { --cle-notebook-prompt-width: 44px; }
    .notebook-prompt { padding-inline: 3px 6px; font-size: 10px; }
    .notebook-source,
    .notebook-output,
    .notebook-raw { padding-inline: 11px; }
    .notebook-markdown.markdown-body { padding-inline: 10px 4px; }
  }

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
    .model-preview * { scroll-behavior: auto !important; }
  }

  @media (max-width: 640px) {
    .markdown-body { padding: 22px 18px 16px; }
    .markdown-truncated { padding-inline: 18px; }
  }
`;
