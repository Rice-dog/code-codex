export const style1 = String.raw`  *, *::before, *::after { box-sizing: border-box; }
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
  .frame[data-git-history-open="true"] {
    grid-template-rows: auto auto minmax(0, 1fr) var(--cle-git-history-height, 33.333%) auto;
  }
  .frame[data-git-history-open="true"] .statusbar { grid-row: 5; }
  .frame[data-git-history-resizing="true"] { cursor: ns-resize; user-select: none; }

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

`;
