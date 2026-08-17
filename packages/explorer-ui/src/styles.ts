export const TREE_ROW_HEIGHT = 28;

export const styles = String.raw`
  :host {
    --cle-width: 260px;
    --cle-row: ${TREE_ROW_HEIGHT}px;
    --cle-paper: #ffffff;
    --cle-paper-raised: #ffffff;
    --cle-subtle: #f7f7f7;
    --cle-ink: #1a1c1f;
    --cle-muted: #64666a;
    --cle-rule: #e4e4e4;
    --cle-rule-strong: #d7d7d7;
    --cle-scroll-thumb: #eeeeee;
    --cle-scroll-arrow-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23e7e7e7%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23e7e7e7%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-faded-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23f1f1f1%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-faded-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23f1f1f1%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
    --cle-hover: #f2f3f3;
    --cle-selected: #f4f4f4;
    --cle-indent: #ededed;
    --cle-input: #ffffff;
    --cle-placeholder: #85878b;
    --cle-signal: #2e82d2;
    --cle-added: #1d8156;
    --cle-modified: #8a5a00;
    --cle-deleted: #b42318;
    --cle-renamed: #1d70b7;
    --cle-focus: #2e82d2;
    --cle-resize-handle: rgba(46, 130, 210, 0.1);
    --cle-marquee-fill: rgba(46, 130, 210, 0.12);
    --cle-icon-neutral: #85888d;
    --cle-icon-blue: #2473a8;
    --cle-icon-gold: #866200;
    --cle-icon-green: #207a48;
    --cle-icon-orange: #b3502d;
    --cle-icon-violet: #7256a8;
    --cle-icon-red: #af4242;
    --cle-icon-teal: #15747b;
    color-scheme: light dark;
    display: block;
    position: relative;
    width: var(--cle-width);
    min-width: min(var(--cle-width), 100vw);
    height: 100%;
    min-height: 180px;
    color: var(--cle-ink);
    background: transparent;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.4;
    box-sizing: border-box;
    contain: layout style paint;
    container-type: inline-size;
    isolation: isolate;
    animation: cle-panel-in 160ms ease-out both;
  }

  :host([data-placement="drawer"]) {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 2147483000;
    height: 100vh;
    filter: drop-shadow(10px 0 24px rgba(0, 0, 0, .18));
  }

  :host([data-placement="drawer"][data-collapsed="true"]) {
    inset: 88px auto auto 0;
    height: 42px;
    min-height: 42px;
    filter: drop-shadow(4px 4px 12px rgba(0, 0, 0, .16));
  }

  :host([data-collapsed="true"]) {
    --cle-width: 40px !important;
    min-width: 40px;
    width: 40px;
  }

  :host-context(.dark),
  :host-context(.electron-dark),
  :host-context([data-theme="dark"]),
  :host([data-theme="dark"]) {
    --cle-paper: #1f1f1f;
    --cle-paper-raised: #242424;
    --cle-subtle: #242424;
    --cle-ink: #f2f2f2;
    --cle-muted: #a3a3a3;
    --cle-rule: #3a3a3a;
    --cle-rule-strong: #454545;
    --cle-scroll-thumb: #666666;
    --cle-scroll-arrow-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%235c5c5c%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%235c5c5c%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-faded-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23373737%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
    --cle-scroll-arrow-faded-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23373737%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
    --cle-hover: #2b2c2e;
    --cle-selected: #303133;
    --cle-indent: #3a3c3f;
    --cle-input: #252628;
    --cle-placeholder: #92959a;
    --cle-signal: #69aaf5;
    --cle-added: #62c990;
    --cle-modified: #e5ad43;
    --cle-deleted: #ff7b72;
    --cle-renamed: #74b9f2;
    --cle-focus: #69aaf5;
    --cle-resize-handle: rgba(105, 170, 245, 0.1);
    --cle-marquee-fill: rgba(105, 170, 245, 0.18);
    --cle-icon-neutral: #adafb3;
    --cle-icon-blue: #79b8e6;
    --cle-icon-gold: #dfbd62;
    --cle-icon-green: #69c98e;
    --cle-icon-orange: #ef9470;
    --cle-icon-violet: #b9a1e3;
    --cle-icon-red: #ed9191;
    --cle-icon-teal: #6bc4c9;
  }

  @media (prefers-color-scheme: dark) {
    :host(:not([data-theme="light"])) {
      --cle-paper: #1f1f1f;
      --cle-paper-raised: #242424;
      --cle-subtle: #242424;
      --cle-ink: #f2f2f2;
      --cle-muted: #a3a3a3;
      --cle-rule: #3a3a3a;
      --cle-rule-strong: #454545;
      --cle-scroll-thumb: #666666;
      --cle-scroll-arrow-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%235c5c5c%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
      --cle-scroll-arrow-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%235c5c5c%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
      --cle-scroll-arrow-faded-up: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23373737%22%20d=%22M4%20.5%208%204.5H0Z%22/%3E%3C/svg%3E");
      --cle-scroll-arrow-faded-down: url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%208%205%22%3E%3Cpath%20fill=%22%23373737%22%20d=%22M0%20.5H8L4%204.5Z%22/%3E%3C/svg%3E");
      --cle-hover: #2b2c2e;
      --cle-selected: #303133;
      --cle-indent: #3a3c3f;
      --cle-input: #252628;
      --cle-placeholder: #92959a;
      --cle-signal: #69aaf5;
      --cle-added: #62c990;
      --cle-modified: #e5ad43;
      --cle-deleted: #ff7b72;
      --cle-renamed: #74b9f2;
      --cle-focus: #69aaf5;
      --cle-resize-handle: rgba(105, 170, 245, 0.1);
      --cle-marquee-fill: rgba(105, 170, 245, 0.18);
      --cle-icon-neutral: #adafb3;
      --cle-icon-blue: #79b8e6;
      --cle-icon-gold: #dfbd62;
      --cle-icon-green: #69c98e;
      --cle-icon-orange: #ef9470;
      --cle-icon-violet: #b9a1e3;
      --cle-icon-red: #ed9191;
      --cle-icon-teal: #6bc4c9;
    }
  }

  :host-context(html[data-code-codex-transparent-background]) :is(
    .frame,
    .masthead,
    .file-search-toolbar,
    .file-filter,
    .tree-shell,
    .loading-chip,
    .context-menu,
    .context-dialog-input,
    .action-notice,
    .state-action,
    .statusbar,
    .preview-market-popover,
    .preview-extension,
    .collapsed-tab
  ),
  :host-context(html[data-code-codex-transparent-background]) .preview-market-popover::after {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  :host-context(html[data-code-codex-particle-image-background]) .frame {
    background-color: rgba(16, 17, 20, .68) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  :host-context(html[data-code-codex-particle-image-background]) :is(
    .tree-shell,
    .file-search-toolbar
  ) {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  :host-context(html[data-code-codex-particle-image-background]) :is(
    .masthead,
    .statusbar
  ) {
    background-color: rgba(24, 25, 28, .78) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  :host-context(html[data-code-codex-particle-image-background]) .file-filter {
    background-color: rgba(30, 31, 35, .86) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  :host-context(html[data-code-codex-particle-image-background]) :is(
    .loading-chip,
    .context-menu,
    .context-dialog-input,
    .action-notice,
    .state-action,
    .preview-market-popover,
    .preview-extension,
    .collapsed-tab
  ),
  :host-context(html[data-code-codex-particle-image-background]) .preview-market-popover::after {
    background-color: var(--cle-paper-raised) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button { font: inherit; }

  .frame {
    position: relative;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--cle-paper);
    border: 1px solid var(--cle-rule);
    border-radius: 12px;
  }

  .activity-bus {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 4;
    width: 2px;
    background: var(--cle-signal);
    opacity: 0;
    transform-origin: top;
    transition: opacity 120ms ease;
  }

  :host([data-busy="true"]) .activity-bus {
    opacity: .8;
    animation: cle-bus 900ms ease-in-out infinite alternate;
  }
  :host([data-state="error"]) .activity-bus,
  :host([data-state="incompatible"]) .activity-bus {
    background: var(--cle-deleted);
    opacity: 1;
  }

  .masthead {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "eyebrow actions"
      "project project"
      "root root";
    grid-template-rows: 26px 20px 16px;
    column-gap: 8px;
    min-height: 75px;
    padding: 8px 8px 5px 12px;
    background: var(--cle-paper-raised);
    border-bottom: 1px solid var(--cle-rule);
  }
  .masthead[data-root-visible="false"] {
    grid-template-areas:
      "eyebrow actions"
      "project project";
    grid-template-rows: 26px 20px;
    min-height: 59px;
  }
  .masthead { grid-row: 1; }
  .masthead[data-drop-target="true"] {
    box-shadow: inset 0 0 0 2px var(--cle-focus);
  }

  .identity { display: contents; }
  .eyebrow {
    grid-area: eyebrow;
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    color: var(--cle-muted);
    font-size: 11px;
    font-weight: 500;
    line-height: 26px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .edit-mode-toggle { flex: none; }
  .edit-mode-toggle {
    display: inline;
    margin: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 3px;
    cursor: pointer;
    font: inherit;
    line-height: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
    text-underline-offset: 2px;
  }
  .edit-mode-toggle:hover:not(:disabled) { color: var(--cle-ink); }
  .edit-mode-toggle[aria-pressed="true"] { color: var(--cle-signal); }
  .edit-mode-toggle:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 1px; }
  .edit-mode-toggle:disabled { cursor: default; opacity: .58; text-decoration: none; }
  .project-name {
    grid-area: project;
    min-width: 0;
    overflow: hidden;
    margin: 0;
    color: var(--cle-ink);
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .root-label {
    grid-area: root;
    min-width: 0;
    overflow: hidden;
    color: var(--cle-muted);
    font-size: 12px;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .root-label[hidden] { display: none; }

  .masthead-actions {
    grid-area: actions;
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }
  .icon-button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }
  .icon-button:hover { color: var(--cle-ink); background: var(--cle-hover); }
  .icon-button:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: -2px; }
  .icon-button svg,
  .file-search-icon svg,
  .node-icon svg,
  .twisty svg,
  .context-menu-icon svg,
  .state-mark svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .file-search-toolbar {
    grid-row: 2;
    padding: 8px 10px 4px;
    background: var(--cle-paper);
  }
  .file-search-toolbar[hidden] { display: none; }
  .file-search {
    position: relative;
    display: block;
    width: 100%;
  }
  .file-search-icon {
    position: absolute;
    inset: 6px auto auto 10px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    color: var(--cle-placeholder);
    pointer-events: none;
  }
  .file-filter {
    width: 100%;
    height: 28px;
    padding: 0 10px 0 30px;
    color: var(--cle-ink);
    caret-color: var(--cle-focus);
    background: var(--cle-input);
    border: 1px solid var(--cle-rule);
    border-radius: 10px;
    outline: none;
    font: inherit;
    line-height: 26px;
  }
  .file-filter::placeholder { color: var(--cle-placeholder); opacity: 1; }
  .file-search:focus-within .file-filter {
    border-color: var(--cle-focus);
    box-shadow: 0 0 0 1px var(--cle-focus);
  }
  .file-search:focus-within .file-search-icon { color: var(--cle-focus); }
  .file-filter::-webkit-search-cancel-button { opacity: .58; cursor: pointer; }

  .tree-shell {
    position: relative;
    grid-row: 3;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--cle-paper);
  }
  @supports selector(::-webkit-scrollbar) {
    .tree-shell { scrollbar-color: auto; scrollbar-width: auto; }
    .tree-shell::-webkit-scrollbar { width: 10px; height: 10px; }
    .tree-shell::-webkit-scrollbar-track { background: transparent; }
    .tree-shell::-webkit-scrollbar-thumb {
      min-height: 32px;
      background: var(--cle-scroll-thumb);
      background-clip: padding-box;
      border: 2px solid transparent;
      border-radius: 999px;
    }
    .tree-shell::-webkit-scrollbar-button:vertical {
      -webkit-appearance: none;
      appearance: none;
      display: block;
      height: 12px;
      background-color: transparent;
      background-position: center;
      background-repeat: no-repeat;
      background-size: 8px 5px;
      border: 0;
      background-image: none;
    }
    .tree-shell::-webkit-scrollbar-button:vertical:increment:start,
    .tree-shell::-webkit-scrollbar-button:vertical:decrement:end {
      display: none;
      height: 0;
    }
    .tree-shell::-webkit-scrollbar-button:vertical:decrement:start {
      background-image: var(--cle-scroll-arrow-faded-up);
    }
    .tree-shell::-webkit-scrollbar-button:vertical:increment:end {
      background-image: var(--cle-scroll-arrow-faded-down);
    }
    .tree-shell[data-scroll-position="start"]::-webkit-scrollbar-button:vertical:decrement:start {
      background-image: var(--cle-scroll-arrow-up);
    }
    .tree-shell[data-scroll-position="end"]::-webkit-scrollbar-button:vertical:increment:end {
      background-image: var(--cle-scroll-arrow-down);
    }
  }
  @supports not selector(::-webkit-scrollbar) {
    .tree-shell {
      scrollbar-color: var(--cle-scroll-thumb) transparent;
      scrollbar-width: thin;
    }
  }
  .tree-shell[data-switching="true"] { opacity: .55; }
  .loading-veil {
    position: absolute;
    inset: 111px 0 28px;
    z-index: 3;
    display: none;
    align-items: start;
    justify-content: center;
    padding-top: 16px;
    pointer-events: none;
  }
  .loading-veil[aria-hidden="false"] { display: flex; }
  .loading-chip {
    padding: 5px 9px;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule);
    border-radius: 999px;
    box-shadow: 0 3px 12px rgba(0, 0, 0, .1);
    font-size: 11px;
    line-height: 16px;
  }
  .tree-shell:focus-visible { outline: none; }
  .tree-shell[data-drop-target="true"] {
    box-shadow: inset 0 0 0 2px var(--cle-focus);
  }
  .state[data-drop-target="true"] {
    box-shadow: inset 0 0 0 2px var(--cle-focus);
  }
  .tree-shell:focus-visible[data-filter-empty="true"] {
    outline: 2px solid var(--cle-focus);
    outline-offset: -2px;
  }
  .tree-spacer { position: relative; min-width: 100%; }
  .tree-window { position: absolute; inset: 0 0 auto 0; }
  .tree-marquee {
    position: absolute;
    inset-inline: 10px;
    z-index: 5;
    background: var(--cle-marquee-fill);
    border: 1px solid var(--cle-focus);
    border-radius: 0;
    pointer-events: none;
  }
  .tree-marquee[hidden] { display: none; }

  .file-filter-empty {
    position: absolute;
    inset: 18px 12px auto;
    z-index: 2;
    color: var(--cle-muted);
    font-size: 12px;
    line-height: 18px;
    text-align: center;
  }
  .file-filter-empty[hidden] { display: none; }

  .tree-row {
    position: absolute;
    left: 10px;
    right: 10px;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    column-gap: 8px;
    align-items: center;
    height: var(--cle-row);
    padding: 0 8px 0 calc(8px + (var(--depth) - 1) * 18px);
    color: var(--cle-ink);
    border-radius: 7px;
    font-size: 13px;
    font-weight: 400;
    line-height: 18px;
    cursor: default;
    user-select: none;
  }
  .tree-row::before {
    content: "";
    position: absolute;
    inset-block: 0;
    left: 16px;
    width: calc((var(--depth) - 1) * 18px);
    background: repeating-linear-gradient(90deg, var(--cle-indent) 0 1px, transparent 1px 18px);
    pointer-events: none;
  }
  .tree-row[aria-level="1"]::before { display: none; }
  .tree-row:hover { background: var(--cle-hover); }
  .tree-row[aria-selected="true"] { background: var(--cle-hover); }
  .tree-row[data-selected="true"] { background: var(--cle-hover); }
  .tree-row[data-context-target="true"] { background: var(--cle-hover); }
  .tree-row[data-drag-source="true"] {
    opacity: .55;
  }
  .tree-row[data-drop-target="true"] {
    background: var(--cle-selected);
    box-shadow: inset 0 0 0 2px var(--cle-focus);
  }
  .tree-row:hover,
  .tree-row[aria-selected="true"],
  .tree-row[data-selected="true"],
  .tree-row[data-context-target="true"],
  .tree-row[data-drop-target="true"] {
    border-radius: 0;
  }
  .tree-row[data-change="deleted"] {
    opacity: .72;
    text-decoration: line-through;
    text-decoration-color: var(--cle-deleted);
  }
  .tree-row[data-kind="utility"] { color: var(--cle-muted); font-style: italic; }

  .twisty {
    display: grid;
    place-items: center;
    width: 16px;
    height: var(--cle-row);
    padding: 0;
    color: var(--cle-placeholder);
    background: none;
    border: 0;
  }
  .twisty svg { width: 16px; height: 16px; transition: transform 120ms ease; }
  .tree-row[aria-expanded="true"] .twisty svg { transform: rotate(90deg); }
  .twisty.blank { visibility: hidden; }
  .node-icon { display: grid; place-items: center; width: 16px; height: var(--cle-row); color: var(--cle-muted); }
  .node-icon[data-icon-category="code"],
  .node-icon[data-icon-category="document"] { color: var(--cle-icon-blue); }
  .node-icon[data-icon-category="web"],
  .node-icon[data-icon-category="archive"],
  .node-icon[data-icon-category="version-control"] { color: var(--cle-icon-orange); }
  .node-icon[data-icon-category="content"],
  .node-icon[data-icon-category="lockfile"],
  .node-icon[data-icon-category="generic"] { color: var(--cle-icon-neutral); }
  .node-icon[data-icon-category="data"],
  .node-icon[data-icon-category="config"] { color: var(--cle-icon-gold); }
  .node-icon[data-icon-category="media"] { color: var(--cle-icon-violet); }
  .node-icon[data-icon-category="database"] { color: var(--cle-icon-teal); }
  .node-icon[data-icon-category="terminal"] { color: var(--cle-icon-green); }
  .node-icon[data-icon-kind="typescript"],
  .node-icon[data-icon-kind="go"],
  .node-icon[data-icon-kind="c"],
  .node-icon[data-icon-kind="cpp"],
  .node-icon[data-icon-kind="css"],
  .node-icon[data-icon-kind="document"] { color: var(--cle-icon-blue); }
  .node-icon[data-icon-kind="javascript"],
  .node-icon[data-icon-kind="yaml"],
  .node-icon[data-icon-kind="env"] { color: var(--cle-icon-gold); }
  .node-icon[data-icon-kind="rust"],
  .node-icon[data-icon-kind="html"],
  .node-icon[data-icon-kind="git"],
  .node-icon[data-icon-kind="archive"] { color: var(--cle-icon-orange); }
  .node-icon[data-icon-kind="kotlin"],
  .node-icon[data-icon-kind="csharp"],
  .node-icon[data-icon-kind="sass"],
  .node-icon[data-icon-kind="diagram"],
  .node-icon[data-icon-kind="image"],
  .node-icon[data-icon-kind="video"] { color: var(--cle-icon-violet); }
  .node-icon[data-icon-kind="java"],
  .node-icon[data-icon-kind="pdf"] { color: var(--cle-icon-red); }
  .node-icon[data-icon-kind="markdown"],
  .node-icon[data-icon-kind="spreadsheet"],
  .node-icon[data-icon-kind="shell"] { color: var(--cle-icon-green); }
  .node-icon[data-icon-kind="python"],
  .node-icon[data-icon-kind="database"] { color: var(--cle-icon-teal); }
  .node-icon[data-icon-kind="powershell"] { color: var(--cle-icon-blue); }
  .node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-row[data-change="added"] .node-name { color: var(--cle-added); }
  .tree-row[data-change="modified"] .node-name { color: var(--cle-modified); }
  .tree-row[data-change="renamed"] .node-name { color: var(--cle-renamed); }

  .badge {
    min-width: 18px;
    padding: 0 5px;
    color: #ffffff;
    background: var(--cle-muted);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: center;
  }
  .badge[data-change="added"] { background: var(--cle-added); }
  .badge[data-change="modified"] { background: var(--cle-modified); }
  .badge[data-change="deleted"] { background: var(--cle-deleted); }
  .badge[data-change="renamed"] { background: var(--cle-renamed); }

  .context-menu {
    position: absolute;
    z-index: 8;
    display: grid;
    width: min(208px, calc(100% - 12px));
    max-height: calc(100% - 12px);
    padding: 4px;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 8px;
    box-shadow: 0 9px 28px rgba(0, 0, 0, .18), 0 2px 7px rgba(0, 0, 0, .08);
  }
  .context-menu[hidden] { display: none; }
  .context-menu-item {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    width: 100%;
    height: 30px;
    padding: 0 8px;
    color: var(--cle-ink);
    background: transparent;
    border: 0;
    border-radius: 6px;
    outline: none;
    font: inherit;
    letter-spacing: 0;
    text-align: start;
    cursor: default;
  }
  .context-menu-item:hover:not(:disabled) { background: var(--cle-hover); }
  .context-menu-item:focus-visible {
    background: var(--cle-hover);
    box-shadow: inset 0 0 0 2px var(--cle-focus);
  }
  .context-menu-item[data-danger="true"]:hover:not(:disabled),
  .context-menu-item[data-danger="true"]:focus-visible { color: var(--cle-deleted); }
  .context-menu-item:disabled { opacity: .52; }
  .context-menu-icon {
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    color: var(--cle-muted);
  }
  .context-menu-item[data-danger="true"]:hover:not(:disabled) .context-menu-icon,
  .context-menu-item[data-danger="true"]:focus-visible .context-menu-icon { color: var(--cle-deleted); }
  .context-menu-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .context-menu-separator {
    height: 9px;
    margin: 0 6px;
    border-top: 1px solid var(--cle-rule);
    transform: translateY(4px);
  }

  .context-menu-dialog {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 5px 4px 4px;
  }
  .context-dialog-heading {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 0 2px;
  }
  .context-dialog-title {
    min-width: 0;
    overflow: hidden;
    color: var(--cle-ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .context-dialog-input {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    color: var(--cle-ink);
    background: var(--cle-input);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    outline: none;
    font: inherit;
    letter-spacing: 0;
  }
  .context-dialog-input:focus-visible {
    border-color: var(--cle-focus);
    box-shadow: 0 0 0 1px var(--cle-focus);
  }
  .context-dialog-input[aria-invalid="true"] { border-color: var(--cle-deleted); }
  .context-dialog-question,
  .context-dialog-warning {
    min-width: 0;
    margin: 0;
    padding: 0 2px;
    overflow-wrap: anywhere;
  }
  .context-dialog-question {
    overflow: hidden;
    color: var(--cle-ink);
    font-size: 12px;
    font-weight: 500;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .context-dialog-warning {
    color: var(--cle-muted);
    font-size: 11px;
    line-height: 16px;
  }
  .context-dialog-error {
    padding: 0 2px;
    color: var(--cle-deleted);
    font-size: 11px;
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  .context-dialog-error[hidden] { display: none; }
  .context-dialog-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .context-dialog-button {
    min-width: 0;
    height: 28px;
    padding: 0 7px;
    overflow: hidden;
    color: var(--cle-ink);
    background: transparent;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    outline: none;
    font: inherit;
    font-size: 12px;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .context-dialog-button:hover:not(:disabled) { background: var(--cle-hover); }
  .context-dialog-button:focus-visible { box-shadow: inset 0 0 0 2px var(--cle-focus); }
  .context-dialog-button.primary {
    color: var(--cle-paper);
    background: var(--cle-ink);
    border-color: var(--cle-ink);
  }
  .context-dialog-button.primary:hover:not(:disabled) { opacity: .88; }
  .context-dialog-button.primary.danger {
    color: #ffffff;
    background: var(--cle-deleted);
    border-color: var(--cle-deleted);
  }
  .context-dialog-button:disabled { opacity: .52; cursor: default; }

  .action-notice {
    position: absolute;
    inset: auto 8px 36px;
    z-index: 9;
    min-width: 0;
    min-height: 30px;
    padding: 7px 9px 7px 11px;
    overflow-wrap: anywhere;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 7px;
    box-shadow: inset 3px 0 var(--cle-added), 0 6px 18px rgba(0, 0, 0, .16);
    font-size: 11px;
    line-height: 16px;
  }
  .action-notice[data-tone="error"] { box-shadow: inset 3px 0 var(--cle-deleted), 0 6px 18px rgba(0, 0, 0, .16); }
  .action-notice[hidden] { display: none; }

  .clipboard-proxy {
    position: fixed;
    inset: 0 auto auto -10000px;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .state {
    grid-row: 3;
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 100%;
    padding: 30px 20px;
    color: var(--cle-muted);
  }
  .state[hidden] { display: none; }
  .state-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: var(--cle-muted);
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 8px;
  }
  .state-title {
    margin: 4px 0 0;
    color: var(--cle-ink);
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
  }
  .state-copy { max-width: 32ch; margin: 0; font-size: 12px; line-height: 18px; }
  .state-action {
    justify-self: start;
    margin-top: 5px;
    padding: 6px 10px;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    cursor: pointer;
  }
  .state-action:hover { background: var(--cle-hover); }
  .state-action:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 2px; }

  .statusbar {
    position: relative;
    z-index: 12;
    grid-row: 4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    padding: 0 10px 0 12px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border-top: 1px solid var(--cle-rule);
    font-size: 11px;
    line-height: 16px;
  }
  .preview-market-button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    min-height: 24px;
    margin: 0 0 0 -6px;
    padding: 2px 6px;
    overflow: hidden;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
  }
  .preview-market-button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-market-button svg {
    flex: 0 0 auto;
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.25;
  }
  .preview-market-button:hover,
  .preview-market-button[aria-expanded="true"] {
    color: var(--cle-ink);
    background: var(--cle-hover);
  }
  .preview-market-button:focus-visible {
    outline: 2px solid var(--cle-focus);
    outline-offset: 0;
  }

  .preview-market-popover {
    position: absolute;
    z-index: 20;
    bottom: calc(100% + 8px);
    left: 8px;
    width: min(320px, calc(100% - 16px));
    max-height: min(390px, calc(100vh - 126px));
    overflow: visible;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 10px;
    box-shadow: 0 14px 34px rgba(12, 18, 28, 0.2), 0 3px 10px rgba(12, 18, 28, 0.12);
    font-size: 12px;
    line-height: 1.45;
    animation: cle-market-in 130ms cubic-bezier(.2, .8, .2, 1) both;
  }
  .preview-market-popover[hidden] { display: none; }
  .preview-market-popover::after {
    content: "";
    position: absolute;
    bottom: -6px;
    left: 18px;
    width: 10px;
    height: 10px;
    background: var(--cle-paper-raised);
    border-right: 1px solid var(--cle-rule-strong);
    border-bottom: 1px solid var(--cle-rule-strong);
    transform: rotate(45deg);
  }
  .preview-market-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 13px 10px 14px;
    border-bottom: 1px solid var(--cle-rule);
  }
  .preview-market-header h3 {
    margin: 0;
    color: var(--cle-ink);
    font-size: 13px;
    font-weight: 650;
    line-height: 18px;
  }
  .preview-market-header p {
    margin: 1px 0 0;
    color: var(--cle-muted);
    font-size: 10.5px;
  }
  .preview-market-close {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
  }
  .preview-market-close:hover { color: var(--cle-ink); background: var(--cle-hover); }
  .preview-market-close:focus-visible,
  .preview-extension-action:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 1px; }
  .preview-market-close svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
  }
  .preview-market-list {
    display: grid;
    gap: 12px;
    max-height: min(300px, calc(100vh - 210px));
    padding: 8px;
    overflow: auto;
  }
  .preview-market-section {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .preview-market-section-title {
    padding: 0 2px;
    color: var(--cle-muted);
    font-size: 10px;
    font-weight: 650;
    line-height: 15px;
    letter-spacing: .01em;
  }
  .preview-market-section-list {
    display: grid;
    gap: 8px;
  }
  .preview-extension {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 9px;
    padding: 10px;
    background: var(--cle-paper);
    border: 1px solid var(--cle-rule);
    border-radius: 8px;
  }
  .preview-extension-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    color: var(--cle-icon-blue);
    background: color-mix(in srgb, var(--cle-icon-blue) 10%, var(--cle-paper));
    border: 1px solid color-mix(in srgb, var(--cle-icon-blue) 20%, var(--cle-rule));
    border-radius: 8px;
  }
  .preview-extension-icon svg {
    width: 23px;
    height: 23px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.15;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .preview-extension-copy { min-width: 0; }
  .preview-extension-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .appearance-extension .preview-extension-title-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .preview-extension h4 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--cle-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-extension-status {
    flex: 0 0 auto;
    padding: 1px 5px;
    color: var(--cle-muted);
    background: var(--cle-subtle);
    border-radius: 999px;
    font-size: 9px;
    line-height: 15px;
  }
  .preview-extension-status[data-enabled="true"] {
    color: var(--cle-added);
    background: color-mix(in srgb, var(--cle-added) 11%, var(--cle-paper));
  }
  .preview-extension-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .preview-extension-meta span {
    padding: 1px 5px;
    color: var(--cle-muted);
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 4px;
    font: 9.5px/14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .preview-extension-action {
    grid-column: 2;
    justify-self: start;
    min-width: 58px;
    min-height: 25px;
    padding: 3px 10px;
    color: #ffffff;
    background: var(--cle-signal);
    border: 1px solid color-mix(in srgb, var(--cle-signal) 80%, #000000);
    border-radius: 5px;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
  }
  .preview-extension-action:hover { filter: brightness(1.06); }
  .preview-extension-action:disabled {
    cursor: default;
    filter: none;
    opacity: .56;
  }
  .preview-extension-action[data-enabled="true"] {
    color: var(--cle-muted);
    background: transparent;
    border-color: var(--cle-rule-strong);
  }

  .preview-extension-actions {
    display: flex;
    grid-column: 2;
    align-items: center;
    justify-self: start;
    gap: 5px;
  }
  .preview-extension-actions > .preview-extension-action { grid-column: auto; }
  .particle-settings-trigger {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 25px;
    height: 25px;
    padding: 0;
    color: var(--cle-muted);
    background: transparent;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
  }
  .particle-settings-trigger:hover,
  .particle-settings-trigger[aria-expanded="true"] {
    color: var(--cle-ink);
    background: var(--cle-hover);
  }
  .particle-settings-trigger svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.3;
  }
  .particle-background-extension .preview-extension-icon {
    color: var(--cle-icon-violet);
    background: color-mix(in srgb, var(--cle-icon-violet) 10%, var(--cle-paper));
    border-color: color-mix(in srgb, var(--cle-icon-violet) 22%, var(--cle-rule));
  }

  .particle-settings-panel {
    position: fixed;
    z-index: 2147483646;
    inset: auto;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(344px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    margin: 0;
    padding: 0;
    overflow: visible;
    min-width: 0;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 8px;
    box-shadow: 0 20px 52px rgba(0, 0, 0, .34), 0 4px 14px rgba(0, 0, 0, .2);
    font-size: 12px;
    line-height: 1.45;
    animation: cle-particle-settings-in 130ms cubic-bezier(.2, .8, .2, 1) both;
  }
  .particle-settings-panel:not(:popover-open),
  .particle-settings-panel[hidden] { display: none; }
  .particle-settings-panel::backdrop { background: transparent; }
  .particle-settings-panel[data-side="right"] { transform-origin: left top; }
  .particle-settings-panel[data-side="right"]::before {
    position: absolute;
    top: var(--cle-particle-settings-anchor-y, 24px);
    left: -6px;
    width: 10px;
    height: 10px;
    background: var(--cle-paper-raised);
    border-bottom: 1px solid var(--cle-rule-strong);
    border-left: 1px solid var(--cle-rule-strong);
    content: "";
    transform: translateY(-50%) rotate(45deg);
  }
  .particle-settings-panel[data-side="overlay"] { transform-origin: center top; }
  .particle-settings-header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 12px 12px 10px 13px;
    background: var(--cle-paper-raised);
    border-bottom: 1px solid var(--cle-rule);
    border-radius: 8px 8px 0 0;
  }
  .particle-settings-heading { min-width: 0; }
  .particle-settings-header h3 {
    margin: 0;
    overflow: hidden;
    color: var(--cle-ink);
    font-size: 13px;
    font-weight: 650;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .particle-settings-header p {
    margin: 1px 0 0;
    color: var(--cle-muted);
    font-size: 10px;
    line-height: 15px;
  }
  .particle-settings-close {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
  }
  .particle-settings-close:hover {
    color: var(--cle-ink);
    background: var(--cle-hover);
  }
  .particle-settings-close svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
  }
  .particle-settings-scroll {
    display: grid;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    max-height: calc(100vh - 78px);
    padding: 9px 10px 11px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: var(--cle-scroll-thumb) transparent;
    scrollbar-width: thin;
  }
  .particle-settings-group {
    display: grid;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .particle-settings-group + .particle-settings-group {
    padding-top: 9px;
    border-top: 1px solid var(--cle-rule);
  }
  .particle-settings-group legend {
    width: 100%;
    margin: 0 0 1px;
    padding: 0;
    color: var(--cle-muted);
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .particle-settings-group > :is(.particle-toggle-row, .particle-color-row) { margin-inline: 0; }
  .particle-settings-panel .particle-plugin-error { grid-column: auto; }
  .particle-settings-trigger:focus-visible,
  .particle-settings-close:focus-visible,
  .particle-settings-panel :is(button, summary, input):focus-visible,
  .particle-settings-panel .particle-library-add:focus-within {
    outline: 2px solid var(--cle-focus);
    outline-offset: 1px;
  }
  .particle-control-row {
    display: grid;
    grid-template-columns: minmax(72px, .8fr) minmax(72px, 1.2fr) minmax(42px, auto);
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 26px;
    color: var(--cle-muted);
    font-size: 10px;
  }
  .particle-control-row > :first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .particle-control-row input[type="range"] {
    width: 100%;
    min-width: 0;
    margin: 0;
    accent-color: var(--cle-signal);
    cursor: pointer;
  }
  .particle-control-row output {
    min-width: 42px;
    color: var(--cle-ink);
    font: 9.5px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .particle-source-details {
    min-width: 0;
    overflow: hidden;
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 7px;
  }
  .particle-source-details[open] { padding-bottom: 8px; }
  .particle-source-summary {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 5px 8px;
    color: var(--cle-ink);
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
    list-style: none;
    user-select: none;
  }
  .particle-source-summary::-webkit-details-marker { display: none; }
  .particle-source-summary::before {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-right: 1px solid var(--cle-muted);
    border-bottom: 1px solid var(--cle-muted);
    content: "";
    transform: rotate(-45deg);
  }
  .particle-source-details[open] .particle-source-summary::before {
    transform: rotate(45deg) translate(-1px, -1px);
  }
  .particle-source-summary:hover { background: var(--cle-hover); }
  .particle-source-count {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--cle-muted);
    font: 9px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .particle-library-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0 8px 7px;
  }
  .particle-library-add,
  .particle-library-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 3px 7px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9.5px;
    line-height: 15px;
  }
  .particle-library-add {
    position: relative;
    color: var(--cle-ink);
    border-color: color-mix(in srgb, var(--cle-signal) 48%, var(--cle-rule));
  }
  .particle-library-add input[type="file"] {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .particle-library-clear { margin-left: auto; }
  .particle-library-add:hover,
  .particle-library-clear:hover:not(:disabled) { background: var(--cle-hover); }
  .particle-library-add:has(input:disabled),
  .particle-library-clear:disabled {
    cursor: default;
    opacity: .5;
  }
  .particle-library-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    min-width: 0;
    margin: 0 8px;
  }
  .particle-library-empty {
    grid-column: 1 / -1;
    margin: 0;
    padding: 10px 7px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px dashed var(--cle-rule-strong);
    border-radius: 6px;
    font-size: 9.5px;
    line-height: 1.45;
    text-align: center;
  }
  .particle-library-empty[hidden] { display: none; }
  .particle-library-item {
    position: relative;
    min-width: 0;
  }
  .particle-library-select {
    display: grid;
    width: 100%;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
  }
  .particle-library-select:hover { border-color: var(--cle-rule-strong); }
  .particle-library-item.is-selected .particle-library-select,
  .particle-library-item:has(.particle-library-select[aria-pressed="true"]) .particle-library-select {
    border-color: var(--cle-signal);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cle-signal) 20%, transparent);
  }
  .particle-library-item.is-active .particle-library-select {
    box-shadow: inset 0 0 0 1px var(--cle-ink);
  }
  .particle-library-thumb {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--cle-subtle);
    filter: grayscale(1);
  }
  .particle-library-name {
    display: block;
    min-width: 0;
    padding: 3px 4px 4px;
    overflow: hidden;
    font-size: 8.5px;
    line-height: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .particle-library-order,
  .particle-library-live {
    position: absolute;
    z-index: 2;
    pointer-events: none;
  }
  .particle-library-order {
    top: 4px;
    left: 4px;
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    color: #ffffff;
    background: var(--cle-signal);
    border: 1px solid color-mix(in srgb, #ffffff 48%, transparent);
    border-radius: 999px;
    font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .particle-library-live {
    right: 4px;
    bottom: 21px;
    padding: 1px 4px;
    color: var(--cle-ink);
    background: color-mix(in srgb, var(--cle-paper-raised) 88%, transparent);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 3px;
    font: 700 7px/11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: .05em;
  }
  .particle-library-delete {
    position: absolute;
    z-index: 3;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 19px;
    height: 19px;
    padding: 0 0 1px;
    color: var(--cle-ink);
    background: color-mix(in srgb, var(--cle-paper-raised) 88%, transparent);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    opacity: 0;
  }
  .particle-library-item:hover .particle-library-delete,
  .particle-library-delete:focus-visible { opacity: 1; }
  .particle-library-delete:hover {
    color: #ffffff;
    background: var(--cle-deleted);
    border-color: var(--cle-deleted);
  }
  .particle-toggle-row,
  .particle-color-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 27px;
    margin: 0 8px;
    color: var(--cle-muted);
    font-size: 9.5px;
  }
  .particle-toggle-row input[type="checkbox"] {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--cle-signal);
    cursor: pointer;
  }
  .particle-toggle-row input:disabled {
    cursor: default;
    opacity: .5;
  }
  .particle-color-row input[type="color"] {
    width: 29px;
    height: 21px;
    padding: 2px;
    overflow: hidden;
    background: var(--cle-input);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
  }
  .particle-plugin-error {
    grid-column: 1 / -1;
    margin: 0;
    padding: 6px 7px;
    color: var(--cle-deleted);
    background: color-mix(in srgb, var(--cle-deleted) 8%, var(--cle-paper));
    border: 1px solid color-mix(in srgb, var(--cle-deleted) 30%, var(--cle-rule));
    border-radius: 5px;
    font-size: 9.5px;
    line-height: 1.4;
  }
  .particle-plugin-error[hidden] { display: none; }
  .status-code {
    color: var(--cle-ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  .resize-handle {
    position: absolute;
    inset: 0 -4px 0 auto;
    z-index: 8;
    width: 8px;
    cursor: ew-resize;
    touch-action: none;
  }
  .resize-handle::after { content: ""; position: absolute; inset: 0 3px; background: transparent; }
  .resize-handle:hover::after,
  .resize-handle[data-resizing="true"]::after { background: var(--cle-resize-handle); }

  .collapsed-tab {
    display: none;
    width: 100%;
    height: 100%;
    padding: 0;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule);
    border-radius: 0 7px 7px 0;
    cursor: pointer;
  }
  .collapsed-tab:hover { background: var(--cle-hover); }
  .collapsed-tab svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    transform: rotate(180deg);
  }
  :host([data-collapsed="true"]) .frame,
  :host([data-collapsed="true"]) .resize-handle { display: none; }
  :host([data-collapsed="true"]) .collapsed-tab { display: grid; place-items: center; }

  .sr-only {
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

  @keyframes cle-panel-in {
    from { opacity: 0; transform: translateX(-3px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes cle-bus { from { opacity: .35; } to { opacity: .9; } }

  @media (max-width: 820px) {
    :host {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 2147483000;
      height: 100vh;
      filter: drop-shadow(10px 0 24px rgba(0, 0, 0, .18));
    }
  }

  @container (max-width: 220px) {
    .masthead {
      column-gap: 4px;
      padding-inline: 8px 4px;
    }
    .masthead-actions { gap: 0; }
    .icon-button { width: 24px; }
    .context-menu-item {
      height: auto;
      min-height: 30px;
      padding-block: 6px;
    }
    .context-menu-label {
      line-height: 16px;
      white-space: normal;
    }
    .particle-library-grid { gap: 4px; }
  }

  @media (hover: none) {
    .particle-library-delete { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    :host,
    :host([data-busy="true"]) .activity-bus,
    .preview-market-popover,
    .particle-settings-panel { animation: none !important; }
    .activity-bus,
    .twisty svg { transition: none; }
  }

  @keyframes cle-market-in {
    from { opacity: 0; transform: translateY(5px) scale(.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes cle-particle-settings-in {
    from { opacity: 0; transform: translateY(3px) scale(.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
`;
