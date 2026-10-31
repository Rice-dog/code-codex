import { backgroundTreeSurfaceStyles } from './background-surfaces';
import { TREE_ROW_HEIGHT } from './tokens';
export const style0 = String.raw`
  :host([data-home-view-hidden]) { display: none !important; }
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

  /* macOS draws the window controls and the app header inside the page, so a
     drawer from the very top would cover them. Open to the right of the
     official 36px icon column (x=8..44) so that column stays usable. */
  :host([data-placement="drawer"][data-platform="mac"]) {
    inset: 52px auto 0 52px;
    height: calc(100vh - 52px);
  }

  :host([data-placement="drawer"][data-collapsed="true"]) {
    inset: 88px auto auto 0;
    height: 42px;
    min-height: 42px;
    filter: drop-shadow(4px 4px 12px rgba(0, 0, 0, .16));
  }

  /* Collapsed on macOS: one more 36px function button in the official sidebar's
     icon column, whose last button ends at y=220 (8px gap, same x). */
  :host([data-placement="drawer"][data-platform="mac"][data-collapsed="true"]) {
    inset: 228px auto auto 8px;
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    filter: none;
  }
  .collapsed-tab .rail-icon { display: none; }
  /* A background plugin paints .collapsed-tab with an !important dark surface
     (specificity 0,3,1). Out-rank it, otherwise the function button turns into
     a dark block beside the official icon column. */
  :host([data-platform="mac"][data-collapsed="true"]) .collapsed-tab {
    background: transparent !important;
    border: 0;
    border-radius: 8px;
    color: var(--cle-muted);
  }
  :host([data-platform="mac"][data-collapsed="true"]) .collapsed-tab:hover {
    color: var(--cle-ink);
    background: var(--cle-hover) !important;
  }
  :host([data-platform="mac"]) .collapsed-tab > svg { display: none; }
  :host([data-platform="mac"]) .collapsed-tab .rail-icon {
    display: grid;
    place-items: center;
  }
  :host([data-platform="mac"]) .collapsed-tab .rail-icon svg {
    width: 20px;
    height: 20px;
    transform: none;
    stroke-width: 1.15;
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

  ${backgroundTreeSurfaceStyles}

`;
