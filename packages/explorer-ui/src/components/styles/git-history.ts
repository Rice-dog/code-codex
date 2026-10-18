export const style6 = String.raw`  .git-history-extension .preview-extension-icon {
    color: var(--cle-added);
    background: color-mix(in srgb, var(--cle-added) 9%, var(--cle-paper));
    border-color: color-mix(in srgb, var(--cle-added) 22%, var(--cle-rule));
  }
  .git-history-panel {
    position: relative;
    z-index: 2;
    grid-row: 4;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
    color: var(--cle-ink);
    background: var(--cle-paper);
    border: 1px solid var(--cle-rule-strong);
    border-bottom: 0;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -8px 20px rgba(12, 18, 28, .06);
    font-size: 13px;
    line-height: 1.45;
    animation: cle-git-panel-in 150ms cubic-bezier(.2, .8, .2, 1) both;
    app-region: no-drag;
    -webkit-app-region: no-drag;
  }
  .git-history-panel[hidden] { display: none; }
  .git-history-resize-handle {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    align-self: stretch;
    min-width: 0;
    cursor: ns-resize;
    touch-action: none;
  }
  .git-history-resize-handle:focus-visible { outline: 1px solid var(--cle-focus); outline-offset: -1px; }
  .git-history-toolbar-actions {
    position: absolute;
    top: 1px;
    right: 5px;
    z-index: 1;
    display: flex;
    gap: 3px;
    background: color-mix(in srgb, var(--cle-subtle) 60%, var(--cle-paper));
  }
  .git-history-toolbar-actions button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
  }
  .git-history-toolbar-actions button[hidden] { display: none; }
  .git-history-toolbar-actions button:hover { color: var(--cle-ink); background: var(--cle-hover); }
  .git-history-toolbar-actions button:disabled { cursor: default; opacity: .45; }
  .git-history-toolbar-actions svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.35;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .git-history-toolbar {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 28px;
    padding: 1px 91px 1px 11px;
    background: color-mix(in srgb, var(--cle-subtle) 60%, transparent);
    border-bottom: 1px solid var(--cle-rule);
    border-radius: 8px 8px 0 0;
  }
  .git-history-branch {
    min-width: 0;
    overflow: hidden;
    font: 650 13px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .git-history-body { min-height: 0; overflow: hidden; }
  .git-history-list-view,
  .git-history-detail-view { height: 100%; overflow: auto; }
  .git-history-state {
    padding: 36px 24px;
    color: var(--cle-muted);
    text-align: center;
  }
  .git-history-list { padding: 6px 8px; }
  .git-history-commit {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    width: 100%;
    padding: 8px 8px 8px 2px;
    color: var(--cle-ink);
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    font: inherit;
  }
  .git-history-commit:hover { background: var(--cle-hover); }
  .git-history-rail::before {
    content: "";
    position: absolute;
    top: -8px;
    bottom: -8px;
    left: 8px;
    width: 1px;
    background: var(--cle-rule-strong);
  }
  .git-history-rail::after {
    content: "";
    position: absolute;
    top: 15px;
    left: 5px;
    width: 7px;
    height: 7px;
    background: var(--cle-paper-raised);
    border: 2px solid var(--cle-added);
    border-radius: 50%;
    box-sizing: border-box;
  }
  .git-history-commit:hover .git-history-rail::after { background: var(--cle-hover); }
  .git-history-commit-copy { display: grid; min-width: 0; gap: 4px; }
  .git-history-commit-copy strong {
    overflow: hidden;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .git-history-commit-meta { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--cle-muted); font-size: 10.5px; }
  .git-history-commit-meta code { color: var(--cle-signal); font: 600 10.5px/15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .git-history-commit-meta span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .git-history-commit-meta time { flex: 0 0 auto; }
  .git-history-load-more {
    margin: 5px 10px 12px;
    padding: 5px 9px;
    color: var(--cle-muted);
    background: transparent;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    cursor: pointer;
    font: 600 11.5px/17px inherit;
  }
  .git-history-load-more { width: calc(100% - 20px); }
  .git-history-load-more:hover { color: var(--cle-ink); background: var(--cle-hover); }
  .git-history-detail-view { padding: 8px 10px 14px; box-sizing: border-box; }
  .git-history-detail h4 { margin: 2px 2px 5px; font-size: 13px; line-height: 18px; }
  .git-history-detail h5 { margin: 16px 2px 7px; color: var(--cle-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .git-history-detail-meta { display: flex; gap: 8px; margin: 0 2px 10px; color: var(--cle-muted); font-size: 11px; }
  .git-history-detail-meta code { color: var(--cle-signal); }
  .git-history-file { border-top: 1px solid var(--cle-rule); }
  .git-history-file-actions {
    display: block;
  }
  .git-history-file-actions button {
    color: var(--cle-ink);
    background: transparent;
    border: 0;
    cursor: pointer;
    font: inherit;
  }
  .git-history-file-open {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 7px 3px;
    text-align: left;
  }
  .git-history-file-actions button:hover { background: var(--cle-hover); }
  .git-history-file-status { font: 700 11px/17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center; color: var(--cle-signal); }
  .git-history-file-status.status-a { color: var(--cle-added); }
  .git-history-file-status.status-d { color: var(--cle-deleted); }
  .git-history-file-path { overflow-wrap: anywhere; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .git-history-note { margin: 7px; color: var(--cle-muted); font-size: 10.5px; }
  .git-history-panel button:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 1px; }

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
  .black-hole-background-extension .preview-extension-icon {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 10%, var(--cle-paper));
    border-color: color-mix(in srgb, #f59e0b 24%, var(--cle-rule));
  }
  .black-hole-background-extension .preview-extension-icon svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.1;
  }
  .glow-horizon-background-extension .preview-extension-icon {
    color: #a558fb;
    background: color-mix(in srgb, #a558fb 10%, var(--cle-paper));
    border-color: color-mix(in srgb, #a558fb 24%, var(--cle-rule));
  }
  .glow-horizon-background-extension .preview-extension-icon svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.1;
  }
  .heavenly-cloud-background-extension .preview-extension-icon {
    color: #38e8ff;
    background: color-mix(in srgb, #38e8ff 10%, var(--cle-paper));
    border-color: color-mix(in srgb, #38e8ff 24%, var(--cle-rule));
  }
  .heavenly-cloud-background-extension .preview-extension-icon svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.1;
  }

  .particle-settings-panel {
    position: fixed;
    z-index: 2147483646;
    app-region: no-drag;
    -webkit-app-region: no-drag;
    pointer-events: auto;
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
  .particle-settings-header-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
  }
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
  .startupTransition-settings-panel { width: min(800px, calc(100vw - 24px)); }
  .custom-background-panel { container-type: inline-size; }
  .custom-background-panel::before { display: none; }
  .custom-background-panel [hidden] { display: none !important; }
  .custom-background-panel .custom-parameters > legend:has(.cle-bilingual-label) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .custom-background-panel .custom-parameters .custom-background-reset {
    text-transform: none;
    letter-spacing: normal;
  }
  .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"] {
    appearance: none; position: relative; width: 30px; height: 17px; flex: 0 0 auto;
    margin: 0; border: 1px solid var(--cle-rule-strong); border-radius: 999px;
    background: var(--cle-hover); cursor: pointer;
  }
  .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"]::before {
    content: ""; position: absolute; width: 11px; height: 11px; left: 2px; top: 2px;
    border-radius: 50%; background: var(--cle-muted); transition: transform 120ms ease;
  }
  .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"]:checked { background: var(--cle-signal); }
  .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"]:checked::before { transform: translateX(13px); background: #fff; }
  .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"]:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .startupTransition-settings-panel .startupTransition-advanced-row input[type="checkbox"]::before { transition: none; } }

  .startupTransition-settings-panel .particle-settings-scroll { display: flex; flex-direction: column; align-items: stretch; }
  .startupTransition-settings-panel .startupTransition-parameter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 48px; }
  .startupTransition-parameter-grid legend { grid-column: 1 / -1; }
  .startupTransition-parameter-grid .particle-control-row { min-width: 0; grid-template-columns: 104px minmax(72px, 1fr) minmax(42px, auto); gap: 6px; }
  @media (max-width: 640px) {
    .startupTransition-settings-panel .startupTransition-parameter-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @container (max-width: 640px) {
    .custom-background-panel .startupTransition-parameter-grid { grid-template-columns: minmax(0, 1fr); }
  }
  .startupTransition-settings-panel .particle-settings-scroll > p { margin: 0; font-size: 11px; line-height: 1.4; }
  .startupTransition-settings-panel .particle-settings-scroll > p .cle-bilingual-label span { white-space: normal; overflow: visible; text-overflow: clip; }
  .particle-settings-group {
    display: grid;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .black-hole-renderer-settings[hidden] {
    display: none;
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

  /* Bilingual labels keep the Chinese name primary while preserving a compact
     English reference on a second line.  The wrapper is intentionally generic
     so headings, legends, controls, toggles, and buttons can share the same
     markup without changing the panel's width. */
  .cle-bilingual-label {
    display: grid;
    min-width: 0;
    max-width: 100%;
    align-content: center;
    gap: 0;
    line-height: 1.15;
    white-space: normal;
  }
  [data-appearance-plugin="code-codex.custom-background-background"][data-language="zh"] .cle-bilingual-label-en,
  [data-appearance-plugin="code-codex.custom-background-background"][data-language="en"] .cle-bilingual-label-zh { display:none !important; }
  .cle-bilingual-label-zh,
  .cle-bilingual-label-en {
    display: block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cle-bilingual-label-zh {
    color: inherit;
    font-size: 1em;
    font-weight: inherit;
    line-height: 14px;
  }
  .cle-bilingual-label-en {
    color: var(--cle-muted);
    font-size: .78em;
    font-weight: 500;
    line-height: 11px;
    letter-spacing: 0;
    text-transform: none;
  }
  .particle-settings-header .cle-bilingual-label,
  .particle-settings-group legend .cle-bilingual-label,
  .particle-morph-curve-head .cle-bilingual-label {
    overflow: visible;
    text-overflow: clip;
  }
  .particle-settings-header h3:has(.cle-bilingual-label),
  .particle-settings-header h3.cle-bilingual-label,
  .particle-settings-group legend:has(.cle-bilingual-label),
  .particle-settings-group legend.cle-bilingual-label {
    display: grid;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
  .particle-settings-header p.cle-bilingual-label {
    display: grid;
    white-space: normal;
  }
  .particle-settings-header .cle-bilingual-label-zh {
    font-size: 1em;
    line-height: 15px;
  }
  .particle-settings-header .cle-bilingual-label-en {
    font-size: .72em;
    line-height: 11px;
  }
  .particle-settings-group legend .cle-bilingual-label {
    gap: 1px;
  }
  .particle-settings-group legend .cle-bilingual-label-en {
    font-size: .86em;
    line-height: 11px;
    font-weight: 600;
  }
  .particle-image-transform-identity .cle-bilingual-label {
    display: grid;
    gap: 0;
    line-height: 11px;
    letter-spacing: 0;
    text-transform: none;
  }
  .particle-image-transform-identity .cle-bilingual-label-zh {
    font-size: 8px;
    line-height: 11px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
  }
  .particle-image-transform-identity .cle-bilingual-label-en {
    font-size: 7px;
    line-height: 10px;
    font-weight: 600;
  }
  .particle-settings-panel :is(.particle-toggle-row, .particle-color-row) .cle-bilingual-label {
    justify-self: stretch;
  }
  .particle-settings-panel :is(.particle-library-add, .particle-library-clear, .particle-image-transform-reset, .particle-opening-replay, .particle-morph-curve-reset) .cle-bilingual-label,
  .particle-settings-panel :is(.particle-library-add, .particle-library-clear, .particle-image-transform-reset, .particle-opening-replay, .particle-morph-curve-reset).cle-bilingual-label,
  .black-hole-preset-toolbar button .cle-bilingual-label,
  .black-hole-preset-toolbar button.cle-bilingual-label {
    display: grid;
    align-content: center;
    justify-items: center;
    text-align: center;
  }
  .particle-settings-panel :is(.particle-library-add, .particle-library-clear, .particle-image-transform-reset, .particle-opening-replay, .particle-morph-curve-reset) .cle-bilingual-label-en,
  .black-hole-preset-toolbar button .cle-bilingual-label-en {
    font-size: .72em;
    line-height: 10px;
  }
  .particle-settings-panel :is(.particle-library-add, .particle-library-clear, .particle-image-transform-reset, .particle-opening-replay, .particle-morph-curve-reset):has(.cle-bilingual-label),
  .particle-settings-panel :is(.particle-library-add, .particle-library-clear, .particle-image-transform-reset, .particle-opening-replay, .particle-morph-curve-reset).cle-bilingual-label,
  .black-hole-preset-toolbar button:has(.cle-bilingual-label),
  .black-hole-preset-toolbar button.cle-bilingual-label {
    min-height: 32px;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
  .particle-settings-panel[data-language="zh"] .cle-bilingual-label-en,
  .particle-settings-panel[data-language="en"] .cle-bilingual-label-zh {
    display: none;
  }
  .particle-settings-panel[data-language] .cle-bilingual-label {
    display: block;
    line-height: inherit;
    white-space: inherit;
  }
  .particle-settings-panel[data-language] :is(.cle-bilingual-label-zh, .cle-bilingual-label-en) {
    max-width: 100%;
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
  }
  .black-hole-preset-toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--cle-rule);
  }
  .black-hole-preset-toolbar button {
    min-width: 0;
    min-height: 25px;
    padding: 3px 5px;
    overflow: hidden;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .black-hole-preset-toolbar button:hover:not(:disabled),
  .black-hole-preset-toolbar button[aria-pressed="true"] {
    color: var(--cle-ink);
    background: color-mix(in srgb, #f59e0b 10%, var(--cle-paper-raised));
    border-color: color-mix(in srgb, #f59e0b 45%, var(--cle-rule-strong));
  }
  .black-hole-preset-toolbar button:disabled { cursor: default; opacity: .55; }
  .black-hole-preset-toolbar .black-hole-reset {
    color: var(--cle-muted);
    background: var(--cle-subtle);
  }
  /* The four preset columns are narrow; keep bilingual names readable even
     when the markup uses a compact 中文 / English string instead of spans. */
  .black-hole-preset-toolbar button {
    min-height: 32px;
    overflow: visible;
    line-height: 12px;
    text-overflow: clip;
    white-space: normal;
  }
  .glow-horizon-direction-toolbar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    padding-bottom: 9px;
    border-bottom: 1px solid var(--cle-rule);
  }
  .glow-horizon-direction-toolbar button {
    min-width: 0;
    min-height: 34px;
    padding: 3px 5px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9.5px;
    font-weight: 600;
    line-height: 12px;
  }
  .glow-horizon-direction-toolbar button:hover:not(:disabled),
  .glow-horizon-direction-toolbar button[aria-pressed="true"] {
    color: var(--cle-ink);
    background: color-mix(in srgb, #a558fb 12%, var(--cle-paper-raised));
    border-color: color-mix(in srgb, #a558fb 45%, var(--cle-rule-strong));
  }
  .glow-horizon-direction-toolbar button:disabled { cursor: default; opacity: .55; }
  .glow-horizon-direction-toolbar .glow-horizon-direction-symbol {
    display: block;
    margin-bottom: 1px;
    font-size: 14px;
    line-height: 15px;
  }
  .glow-horizon-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding-top: 2px;
  }
  .glow-horizon-actions button {
    min-height: 30px;
    padding: 4px 8px;
    color: var(--cle-muted);
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
  }
  .glow-horizon-actions button:hover {
    color: var(--cle-ink);
    background: color-mix(in srgb, #a558fb 12%, var(--cle-subtle));
    border-color: color-mix(in srgb, #a558fb 45%, var(--cle-rule-strong));
  }
  .heavenly-cloud-quality-toolbar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }
  .blinkingSquares-settings-panel .heavenly-cloud-quality-toolbar {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .heavenly-cloud-quality-toolbar button {
    min-width: 0;
    min-height: 40px;
    padding: 4px 6px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9.5px;
    font-weight: 600;
    line-height: 12px;
  }
  .heavenly-cloud-quality-toolbar button strong {
    display: block;
    margin-bottom: 2px;
    color: #38e8ff;
    font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }
  .heavenly-cloud-quality-toolbar button:hover:not(:disabled),
  .heavenly-cloud-quality-toolbar button[aria-pressed="true"] {
    color: var(--cle-ink);
    background: color-mix(in srgb, #38e8ff 10%, var(--cle-paper-raised));
    border-color: color-mix(in srgb, #38e8ff 42%, var(--cle-rule-strong));
  }
  .heavenly-cloud-quality-toolbar button:disabled { cursor: default; opacity: .55; }
  .heavenly-cloud-paused-row { margin: 0 0 8px; }
  .heavenly-cloud-actions button:hover {
    background: color-mix(in srgb, #38e8ff 10%, var(--cle-subtle));
    border-color: color-mix(in srgb, #38e8ff 42%, var(--cle-rule-strong));
  }
  .particle-settings-trigger:focus-visible,
  .particle-settings-close:focus-visible,
  .particle-settings-panel :is(button, summary, input):focus-visible,
  .particle-settings-panel output:focus-visible,
  .particle-settings-panel .particle-image-transform-editor:focus-visible,
  .particle-settings-panel .particle-library-add:focus-within {
    outline: 2px solid var(--cle-focus);
    outline-offset: 1px;
  }
  .particle-control-row {
    display: grid;
    grid-template-columns: minmax(92px, .9fr) minmax(72px, 1.1fr) minmax(42px, auto);
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 34px;
    color: var(--cle-muted);
    font-size: 10px;
  }
  .particle-control-row > :first-child,
  .particle-control-row > :first-child .cle-bilingual-label {
    min-width: 0;
  }
  .particle-control-row > :first-child {
    overflow: visible;
    white-space: normal;
  }
  .particle-control-row > :first-child .cle-bilingual-label {
    overflow: visible;
    text-overflow: clip;
  }
  .particle-control-row input[type="range"] {
    width: 100%;
    min-width: 0;
    margin: 0;
    accent-color: var(--cle-signal);
    cursor: pointer;
  }
  .particle-control-value {
    display: grid;
    min-width: 42px;
    justify-items: end;
  }
  .particle-control-value > * { grid-area: 1 / 1; }
  .particle-control-row output {
    box-sizing: border-box;
    width: 100%;
    min-width: 42px;
    padding: 0 3px;
    color: var(--cle-ink);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: text;
    font: 9.5px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
  }
  .particle-control-row output:hover {
    background: var(--cle-hover);
    border-color: var(--cle-rule);
  }
  .particle-control-row output[hidden],
  .particle-value-editor[hidden] { display: none; }
  .particle-value-editor {
    box-sizing: border-box;
    width: 64px;
    max-width: 100%;
    min-width: 0;
    height: 20px;
    margin: 0;
    padding: 0 4px;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-focus);
    border-radius: 4px;
    appearance: textfield;
    font: 9.5px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .particle-value-editor::-webkit-inner-spin-button,
  .particle-value-editor::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  .particle-morph-curve-control {
    display: grid;
    gap: 5px;
    min-width: 0;
    margin-top: 2px;
    padding: 7px;
    background: color-mix(in srgb, var(--cle-subtle) 82%, var(--cle-paper-raised));
    border: 1px solid var(--cle-rule);
    border-radius: 7px;
  }
  .particle-morph-curve-head,
  .particle-morph-curve-actions {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .particle-morph-curve-head {
    justify-content: space-between;
    gap: 8px;
    min-height: 23px;
    color: var(--cle-ink);
    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
  }
  .particle-morph-curve-actions {
    flex: 0 0 auto;
    gap: 6px;
  }
  .particle-morph-curve-mode {
    max-width: 92px;
    overflow: hidden;
    color: var(--cle-muted);
    font: 700 8px/13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: .045em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .particle-morph-curve-reset {
    min-width: 42px;
    min-height: 22px;
    margin: 0;
    padding: 2px 7px;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9px;
    line-height: 15px;
  }
  .particle-morph-curve-reset:hover:not(:disabled) {
    color: var(--cle-ink);
    background: var(--cle-hover);
    border-color: color-mix(in srgb, var(--cle-signal) 45%, var(--cle-rule-strong));
  }
  .particle-morph-curve-reset:focus-visible {
    outline: 2px solid var(--cle-focus);
    outline-offset: 1px;
  }
  .particle-morph-curve-reset:disabled {
    cursor: default;
    opacity: .46;
  }
  .particle-morph-curve-editor {
    display: block;
    width: 100%;
    height: auto;
    min-width: 0;
    overflow: visible;
    color: var(--cle-signal);
    background:
      linear-gradient(180deg,
        color-mix(in srgb, var(--cle-paper) 54%, var(--cle-subtle)),
        color-mix(in srgb, var(--cle-subtle) 82%, #000000 18%));
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    box-shadow: inset 0 1px color-mix(in srgb, var(--cle-ink) 4%, transparent);
    touch-action: none;
    user-select: none;
  }
  .particle-morph-curve-grid,
  .particle-morph-curve-diagonal,
  .particle-morph-curve-tangent,
  .particle-morph-curve-path,
  .particle-morph-curve-path-glow,
  .particle-morph-curve-keyframe,
  .particle-morph-curve-axis {
    pointer-events: none;
  }
  .particle-morph-curve-grid-line {
    fill: none;
    stroke: color-mix(in srgb, var(--cle-muted) 18%, transparent);
    stroke-width: .75;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-diagonal {
    fill: none;
    stroke: color-mix(in srgb, var(--cle-muted) 32%, transparent);
    stroke-dasharray: 2 4;
    stroke-width: .8;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-tangent {
    stroke: color-mix(in srgb, var(--cle-signal) 46%, transparent);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-path,
  .particle-morph-curve-path-glow {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-path-glow {
    stroke: color-mix(in srgb, var(--cle-signal) 22%, transparent);
    stroke-width: 7;
  }
  .particle-morph-curve-path {
    stroke: var(--cle-signal);
    stroke-width: 2;
  }
  .particle-morph-curve-nodes { overflow: visible; }
  .particle-morph-curve-node,
  .particle-morph-curve-handle {
    cursor: grab;
    outline: none;
  }
  .particle-morph-curve-node-hit,
  .particle-morph-curve-hit {
    fill: transparent;
    pointer-events: all;
  }
  .particle-morph-curve-node-knob,
  .particle-morph-curve-knob {
    fill: var(--cle-paper-raised);
    stroke: var(--cle-signal);
    stroke-width: 1.6;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-node-knob {
    stroke: color-mix(in srgb, var(--cle-signal) 78%, var(--cle-muted));
    stroke-width: 1.4;
  }
  .particle-morph-curve-node:hover .particle-morph-curve-node-knob,
  .particle-morph-curve-node.is-selected .particle-morph-curve-node-knob,
  .particle-morph-curve-node[aria-selected="true"] .particle-morph-curve-node-knob,
  .particle-morph-curve-handle:hover .particle-morph-curve-knob {
    fill: var(--cle-signal);
    stroke: var(--cle-ink);
    stroke-width: 2;
  }
  .particle-morph-curve-node:hover .particle-morph-curve-node-hit,
  .particle-morph-curve-node.is-selected .particle-morph-curve-node-hit,
  .particle-morph-curve-node[aria-selected="true"] .particle-morph-curve-node-hit {
    fill: color-mix(in srgb, var(--cle-signal) 10%, transparent);
    stroke: color-mix(in srgb, var(--cle-signal) 62%, transparent);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-node:focus-visible .particle-morph-curve-node-knob,
  .particle-morph-curve-handle:focus-visible .particle-morph-curve-knob {
    fill: var(--cle-signal);
    stroke: var(--cle-ink);
    stroke-width: 2.4;
  }
  .particle-morph-curve-node:focus-visible .particle-morph-curve-node-hit,
  .particle-morph-curve-handle:focus-visible .particle-morph-curve-hit {
    fill: color-mix(in srgb, var(--cle-focus) 14%, transparent);
    stroke: var(--cle-focus);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-keyframe {
    fill: var(--cle-paper-raised);
    stroke: var(--cle-signal);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .particle-morph-curve-axis {
    fill: var(--cle-muted);
    font: 700 5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: .1em;
  }
  .particle-morph-curve-editor.is-dragging,
  .particle-morph-curve-editor[data-dragging="true"],
  .particle-morph-curve-node.is-dragging,
  .particle-morph-curve-handle.is-dragging {
    cursor: grabbing;
  }
  .particle-morph-curve-editor.is-dragging :is(.particle-morph-curve-node, .particle-morph-curve-handle),
  .particle-morph-curve-editor[data-dragging="true"] :is(.particle-morph-curve-node, .particle-morph-curve-handle) {
    cursor: grabbing;
  }
  .particle-morph-curve-control[data-disabled="true"],
  .particle-morph-curve-control[aria-disabled="true"] {
    opacity: .56;
  }
  .particle-morph-curve-control[data-disabled="true"] :is(.particle-morph-curve-editor, .particle-morph-curve-node, .particle-morph-curve-handle),
  .particle-morph-curve-control[aria-disabled="true"] :is(.particle-morph-curve-editor, .particle-morph-curve-node, .particle-morph-curve-handle),
  .particle-morph-curve-editor[aria-disabled="true"] :is(.particle-morph-curve-node, .particle-morph-curve-handle) {
    cursor: default;
    pointer-events: none;
  }
  .particle-morph-curve-help {
    margin: 0;
    color: var(--cle-muted);
    font-size: 8.5px;
    line-height: 13px;
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
  .particle-image-transform-editor {
    display: grid;
    gap: 6px;
    min-width: 0;
    margin: 0 8px 7px;
    padding: 7px;
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule);
    border-radius: 6px;
  }
  .particle-image-transform-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .particle-image-transform-identity {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .particle-image-transform-identity > div {
    display: grid;
    min-width: 0;
  }
  .particle-image-transform-identity span {
    color: var(--cle-muted);
    font-size: 8px;
    font-weight: 700;
    line-height: 11px;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .particle-image-transform-name {
    min-width: 0;
    overflow: hidden;
    color: var(--cle-ink);
    font-size: 9.5px;
    font-weight: 600;
    line-height: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .particle-image-transform-thumb {
    display: block;
    width: 28px;
    height: 28px;
    object-fit: cover;
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 4px;
    filter: grayscale(1);
  }
  .particle-image-transform-thumb[hidden] { display: none; }
  .particle-image-transform-editor[data-empty="true"] .particle-image-transform-identity {
    grid-template-columns: minmax(0, 1fr);
  }
  .particle-opening-replay,
  .particle-image-transform-reset {
    flex: 0 0 auto;
    min-height: 22px;
    padding: 2px 7px;
    color: var(--cle-muted);
    background: transparent;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9px;
  }
  .particle-opening-replay:hover:not(:disabled),
  .particle-image-transform-reset:hover:not(:disabled) {
    color: var(--cle-ink);
    background: var(--cle-hover);
  }
  .particle-opening-replay:disabled,
  .particle-image-transform-reset:disabled {
    cursor: default;
    opacity: .45;
  }
  .particle-image-transform-controls {
    display: grid;
    gap: 1px;
  }
  .particle-image-transform-controls .particle-control-row {
    grid-template-columns: minmax(88px, .95fr) minmax(68px, 1fr) 58px;
    min-height: 32px;
  }
  .particle-image-transform-empty {
    display: none;
    margin: 0;
    color: var(--cle-muted);
    font-size: 9px;
    line-height: 14px;
  }
  .particle-image-transform-editor[data-empty="true"] .particle-image-transform-controls { display: none; }
  .particle-image-transform-editor[data-empty="true"] .particle-image-transform-empty { display: block; }
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
  .particle-library-select:disabled { cursor: default; }
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
  .particle-library-adjust {
    position: absolute;
    z-index: 3;
    bottom: 21px;
    left: 3px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--cle-ink);
    background: color-mix(in srgb, var(--cle-paper-raised) 88%, transparent);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    opacity: .82;
    touch-action: manipulation;
  }
  .particle-library-adjust[aria-pressed="true"] {
    color: var(--cle-paper);
    background: var(--cle-ink);
    border-color: var(--cle-ink);
    opacity: 1;
  }
  .particle-library-adjust:hover:not(:disabled):not([aria-pressed="true"]) {
    background: var(--cle-hover);
    opacity: 1;
  }
  .particle-library-adjust:disabled {
    cursor: default;
    opacity: .45;
  }
  .particle-library-adjust svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.3;
  }
  .particle-library-item:hover .particle-library-delete,
  .particle-library-delete:focus-visible { opacity: 1; }
  .particle-library-delete:hover {
    color: #ffffff;
    background: var(--cle-deleted);
    border-color: var(--cle-deleted);
  }
  .particle-library-delete:disabled {
    cursor: default;
    opacity: 0;
  }
  .particle-library-item:hover .particle-library-delete:disabled { opacity: 0; }
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
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 22px;
    margin-right: -4px;
    padding: 2px 4px;
    color: var(--cle-ink);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }
  .status-code:hover:not(:disabled) { background: var(--cle-hover); }
  .status-code:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 0; }
  .status-code:disabled { cursor: default; }
  .status-code::after {
    display: none;
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    font-size: 9px;
    font-weight: 700;
    line-height: 8px;
    text-align: center;
  }
  .status-code[data-update-state="checking"]::after {
    display: block;
    content: "";
    border: 1px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: cle-version-check 650ms linear infinite;
  }
  .status-code[data-feedback="latest"]::after {
    display: block;
    content: "✓";
    color: var(--cle-added);
  }
  .status-code[data-update-state="updateAvailable"]::after {
    display: block;
    content: "↑";
    width: 8px;
    height: 10px;
    font-size: 11px;
    line-height: 10px;
    color: var(--cle-added);
    opacity: 0.8;
  }
  .status-code[data-feedback="error"]::after {
    display: block;
    content: "·";
    color: var(--cle-muted);
  }
  .status-code[data-feedback="latest"] {
    animation: cle-version-current 1s ease-in-out both;
  }
  .status-code[data-feedback="update"], .status-code[data-feedback="update"]:hover:not(:disabled) {
    background-image: linear-gradient(100deg, #dc616e, #c89224, #31986d, #3988d4, #a268d4, #dc616e);
    background-size: 250% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    animation: cle-version-rainbow 2s linear both;
    transition: opacity 250ms ease;
  }
  .status-code[data-feedback="update"][data-feedback-phase="in"] {
    animation: cle-version-rainbow 2s linear both, cle-version-enter 250ms ease both;
  }
  .status-code[data-feedback="update"][data-feedback-phase="out"] { opacity: 0; }
  @keyframes cle-version-rainbow { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
  @keyframes cle-version-enter { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes cle-version-current { 0%,100% { color: var(--cle-ink); } 50% { color: #319b87; } }
  @media (prefers-reduced-motion: reduce) {
    .status-code[data-feedback] { animation: none !important; transition: none; transform: none; opacity: 1 !important; }
    .status-code[data-feedback="update"], .status-code[data-feedback="update"]:hover:not(:disabled) { background-image: none; color: var(--cle-focus); }
  }
  @media (forced-colors: active) {
    .status-code[data-feedback="update"], .status-code[data-feedback="update"]:hover:not(:disabled) { background-image: none; color: ButtonText; }
    .status-code[data-update-state="updateAvailable"]::after { color: Highlight; opacity: 1; }
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
    .update-popover,
    .git-history-panel,
    .particle-settings-panel,
    .status-code[data-update-state="checking"]::after { animation: none !important; }
    .activity-bus,
    .twisty svg,
  }

  @keyframes cle-market-in {
    from { opacity: 0; transform: translateY(5px) scale(.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes cle-git-panel-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
.pixel-sculpt-controls .panel{position:fixed;z-index:6;right:20px;top:20px;width:300px;max-height:calc(100vh - 40px);overflow:auto;padding:15px;border:1px solid var(--line);border-radius:17px;background:var(--panel);backdrop-filter:blur(26px) saturate(130%);box-shadow:0 24px 70px rgba(0,0,0,.42)}.pixel-sculpt-controls .panel::-webkit-scrollbar{width:5px}.pixel-sculpt-controls .panel::-webkit-scrollbar-thumb{background:#2f2d36;border-radius:9px}.pixel-sculpt-controls .ph{display:flex;align-items:start;justify-content:space-between;gap:10px;margin-bottom:12px}.pixel-sculpt-controls .ph h2{font-size:13px;margin:1px 0 3px}.pixel-sculpt-controls .ph p{font-size:10.5px;color:#85858f;margin:0}.pixel-sculpt-controls .reset,.pixel-sculpt-controls .ghost{border:1px solid var(--line);border-radius:8px;background:#14141a;color:#bdbdc5;padding:6px 8px;font-size:10px;cursor:pointer}.pixel-sculpt-controls .reset:hover,.pixel-sculpt-controls .ghost:hover{background:#1b1b22;color:#fff}.pixel-sculpt-controls .actions{display:flex;gap:6px;align-items:center}.pixel-sculpt-controls .lang-switch{display:flex;padding:2px;border:1px solid var(--line);border-radius:9px;background:#101015}.pixel-sculpt-controls .lang-switch button{border:0;background:transparent;color:#777783;border-radius:6px;padding:4px 6px;font-size:9.5px;cursor:pointer}.pixel-sculpt-controls .lang-switch button.on{background:#2b2432;color:#f5efff;box-shadow:inset 0 0 0 1px rgba(167,139,250,.14)}.pixel-sculpt-controls .row{margin:10px 0 13px}.pixel-sculpt-controls .row-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:10.5px;color:#b8b8c0}.pixel-sculpt-controls .row-head output{font-variant-numeric:tabular-nums;color:#ededf1}.pixel-sculpt-controls .seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px}.pixel-sculpt-controls .seg button{min-width:0;border:1px solid rgba(255,255,255,.075);background:#131319;color:#8f8f99;border-radius:7px;padding:7px 4px;font-size:9.5px;cursor:pointer;white-space:nowrap}.pixel-sculpt-controls .seg button.on{background:#292132;color:#f3ecff;border-color:#655177;box-shadow:inset 0 0 0 1px rgba(167,139,250,.15)}.pixel-sculpt-controls input[type=range]{appearance:none;width:100%;height:3px;border-radius:99px;background:linear-gradient(90deg,#a78bfa var(--pct,50%),#34313d var(--pct,50%));outline:none;cursor:pointer}.pixel-sculpt-controls input[type=range]::-webkit-slider-thumb{appearance:none;width:10px;height:10px;border-radius:50%;background:#f5f2ff;border:2px solid #9e82e7;box-shadow:0 0 0 2px rgba(158,130,231,.12)}.pixel-sculpt-controls .toggle-line{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:10.5px;color:#b8b8c0}.pixel-sculpt-controls .toggle{position:relative;width:31px;height:17px}.pixel-sculpt-controls .toggle input{opacity:0;width:0;height:0}.pixel-sculpt-controls .toggle span{position:absolute;inset:0;border-radius:99px;background:#2d2b34;border:1px solid #3a3743;transition:.2s}.pixel-sculpt-controls .toggle span:after{content:"";position:absolute;width:11px;height:11px;left:2px;top:2px;border-radius:50%;background:#aaa7b1;transition:.2s}.pixel-sculpt-controls .toggle input:checked+span{background:#5f4b75;border-color:#8066a0}.pixel-sculpt-controls .toggle input:checked+span:after{transform:translateX(14px);background:#fff}.pixel-sculpt-controls .color-row{display:grid;grid-template-columns:1fr 40px;gap:8px;align-items:center}.pixel-sculpt-controls .color-row input[type=text]{width:100%;background:#111117;border:1px solid var(--line);border-radius:7px;color:#dddde5;padding:7px 8px;font-size:9.5px;outline:none}.pixel-sculpt-controls .color-row input[type=color]{appearance:none;width:40px;height:29px;border:1px solid var(--line);border-radius:7px;background:#111117;padding:3px}.pixel-sculpt-controls .file-row{display:flex;align-items:center;gap:8px;min-width:0}.pixel-sculpt-controls .file-row button{flex:0 0 auto;border:1px solid rgba(167,139,250,.32);background:#211a2b;color:#eee9f7;border-radius:7px;font-size:9.5px;padding:7px 10px;cursor:pointer}.pixel-sculpt-controls .file-row button:hover{background:#2b2237;border-color:rgba(167,139,250,.55)}.pixel-sculpt-controls .file-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#85858f;font-size:9.5px}.pixel-sculpt-controls .gallery-block{padding:10px;border:1px solid rgba(255,255,255,.065);border-radius:11px;background:rgba(7,7,11,.28)}.pixel-sculpt-controls .gallery-strip{display:flex;gap:7px;margin-top:9px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}.pixel-sculpt-controls .gallery-empty{display:grid;place-items:center;width:100%;min-height:48px;border:1px dashed rgba(255,255,255,.09);border-radius:8px;color:#696975;font-size:9px}.pixel-sculpt-controls .gallery-item{position:relative;flex:0 0 68px;height:72px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#111117;overflow:hidden;transition:border-color .18s,transform .18s,box-shadow .18s,opacity .18s}.pixel-sculpt-controls .gallery-item:hover{transform:translateY(-1px);border-color:rgba(167,139,250,.38)}.pixel-sculpt-controls .gallery-item.on{border-color:#a78bfa;box-shadow:0 0 0 2px rgba(167,139,250,.13)}.pixel-sculpt-controls .gallery-preview{display:block;width:100%;height:48px;padding:0;border:0;background:#0b0b10;cursor:pointer}.pixel-sculpt-controls .gallery-preview img{width:100%;height:100%;object-fit:cover;display:block;transition:opacity .18s,filter .18s}.pixel-sculpt-controls .gallery-item.is-excluded .gallery-preview img{opacity:.34;filter:grayscale(.7)}.pixel-sculpt-controls .gallery-item .remove{position:absolute;right:3px;top:3px;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:rgba(5,5,8,.78);color:#ddd;font:11px/16px sans-serif;cursor:pointer;opacity:0;transition:opacity .16s}.pixel-sculpt-controls .gallery-item:hover .remove,.pixel-sculpt-controls .gallery-item:focus-within .remove{opacity:1}.pixel-sculpt-controls .gallery-order{height:23px;display:grid;grid-template-columns:15px 1fr;align-items:center;border-top:1px solid rgba(255,255,255,.065);background:#0e0e14;color:#696975;font:9px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.pixel-sculpt-controls .gallery-order span{text-align:right}.pixel-sculpt-controls .gallery-order input{width:100%;height:22px;min-width:0;padding:0 4px;border:0;background:transparent;color:#c8b8ff;font:10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:center;font-variant-numeric:tabular-nums;outline:none;-moz-appearance:textfield}.pixel-sculpt-controls .gallery-order input::-webkit-inner-spin-button,.pixel-sculpt-controls .gallery-order input::-webkit-outer-spin-button{appearance:none;margin:0}.pixel-sculpt-controls .gallery-order input:focus{background:rgba(167,139,250,.1);color:#fff}.pixel-sculpt-controls .gallery-item.is-excluded .gallery-order input{color:#62616c}.pixel-sculpt-controls .gallery-order-hint{margin-top:3px;color:#686873;font-size:8.5px;letter-spacing:.02em}.pixel-sculpt-controls .gallery-nav{display:grid;grid-template-columns:32px 1fr 32px;gap:6px;align-items:center;margin-top:7px}.pixel-sculpt-controls .gallery-nav button{height:26px;border:1px solid var(--line);border-radius:7px;background:#14141a;color:#aaa9b2;cursor:pointer}.pixel-sculpt-controls .gallery-nav button:hover:not(:disabled){color:#fff;background:#1e1b25}.pixel-sculpt-controls .gallery-nav button:disabled{opacity:.35;cursor:default}.pixel-sculpt-controls .gallery-index{text-align:center;color:#777783;font-size:9px;font-variant-numeric:tabular-nums}

.pixel-sculpt-controls{--line:var(--cle-rule);color:var(--cle-ink);font-size:12px;line-height:1.45}.pixel-sculpt-controls .panel{position:static;width:100%;max-height:none;overflow:visible;padding:0;border:0;background:transparent;box-shadow:none;backdrop-filter:none}.pixel-sculpt-controls .ph{display:none}.pixel-sculpt-controls .row{margin:0;padding:6px 0}.pixel-sculpt-controls .row-head{margin-bottom:4px;color:var(--cle-ink);font-size:11px}.pixel-sculpt-controls .row-head output{color:var(--cle-muted);font-size:11px}.pixel-sculpt-controls input[type=range]{height:3px;background:linear-gradient(90deg,var(--cle-signal) var(--pct,50%),var(--cle-rule-strong) var(--pct,50%));min-width:0}.pixel-sculpt-controls input[type=range]::-webkit-slider-thumb{width:11px;height:11px;background:var(--cle-paper-raised);border:1px solid var(--cle-signal);box-shadow:0 0 0 2px color-mix(in srgb,var(--cle-signal) 18%,transparent)}.pixel-sculpt-controls .seg{gap:5px}.pixel-sculpt-controls .seg button{background:var(--cle-paper);border:1px solid var(--cle-rule);border-radius:5px;color:var(--cle-muted);padding:6px 4px;font-size:10px}.pixel-sculpt-controls .seg button.on{background:var(--cle-hover);border-color:var(--cle-signal);box-shadow:none;color:var(--cle-ink)}.pixel-sculpt-controls .toggle-line{margin:0;padding:7px 0;color:var(--cle-ink);font-size:11px}.pixel-sculpt-controls .toggle{width:30px;height:16px}.pixel-sculpt-controls .toggle span{background:var(--cle-rule-strong);border-color:var(--cle-muted)}.pixel-sculpt-controls .toggle input:checked+span{background:var(--cle-signal);border-color:var(--cle-signal)}.pixel-sculpt-controls .toggle span:after{background:var(--cle-paper-raised)}.pixel-sculpt-controls .divider{height:1px;background:var(--cle-rule);margin:8px 0}.pixel-sculpt-controls .gallery-block{padding:8px;border:1px solid var(--cle-rule);border-radius:6px;background:var(--cle-paper)}.pixel-sculpt-controls .gallery-empty{border-color:var(--cle-rule);color:var(--cle-muted)}.pixel-sculpt-controls .gallery-item{background:var(--cle-paper);border-color:var(--cle-rule)}.pixel-sculpt-controls .gallery-item.on{border-color:var(--cle-signal);box-shadow:0 0 0 2px color-mix(in srgb,var(--cle-signal) 18%,transparent)}.pixel-sculpt-controls .gallery-order{background:var(--cle-paper);border-color:var(--cle-rule)}.pixel-sculpt-controls .file-row button,.pixel-sculpt-controls .gallery-nav button,.pixel-sculpt-controls .reset,.pixel-sculpt-controls .ghost{background:var(--cle-paper);border-color:var(--cle-rule);color:var(--cle-ink)}.pixel-sculpt-controls .color-row input[type=text]{background:var(--cle-paper);border-color:var(--cle-rule);color:var(--cle-ink)}.pixel-sculpt-controls [hidden]{display:none!important}.pixel-sculpt-controls .toggle input{position:absolute;inset:0;width:100%;height:100%;opacity:0;z-index:2;cursor:pointer}

  /* Pixel Sculpt keeps its renderer-owned control IDs and events, while the
     presentation follows the same compact component language as Particle Image. */
  .pixelSculpt-settings-panel .particle-settings-scroll { gap: 10px; }
  .pixelSculpt-settings-panel .pixelSculpt-controls-host { min-width: 0; }
  .pixelSculpt-settings-panel .pixelSculpt-disabled {
    margin: 0;
    padding: 8px;
    color: var(--cle-muted);
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 6px;
    font-size: 9.5px;
    line-height: 1.45;
  }
  .pixelSculpt-settings-panel .pixelSculpt-disabled[hidden] { display: none; }
  .pixelSculpt-settings-panel .pixelSculpt-paused-row {
    margin: 0;
    padding-top: 9px;
    border-top: 1px solid var(--cle-rule);
  }
  .pixelSculpt-settings-panel .pixelSculpt-actions {
    grid-template-columns: minmax(0, 1fr);
    margin-top: -2px;
  }
  .pixelSculpt-settings-panel .pixelSculpt-actions button:hover {
    background: var(--cle-hover);
    border-color: color-mix(in srgb, var(--cle-signal) 45%, var(--cle-rule-strong));
  }

  .pixel-sculpt-controls {
    color: var(--cle-ink);
    font-size: 10px;
    line-height: 1.45;
  }
  .pixel-sculpt-controls .panel {
    position: static;
    display: grid;
    gap: 0;
    width: 100%;
    max-height: none;
    padding: 0;
    overflow: visible;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
  }
  .pixel-sculpt-controls .ph { display: none; }
  .pixel-sculpt-controls .row:not(.gallery-block) {
    display: grid;
    grid-template-columns: minmax(92px, .9fr) minmax(72px, 1.1fr) minmax(42px, auto);
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 34px;
    margin: 0;
    padding: 0;
    color: var(--cle-muted);
    font-size: 10px;
  }
  .pixel-sculpt-controls .row:not(.gallery-block) > .row-head { display: contents; }
  .pixel-sculpt-controls .row:not(.gallery-block) > .row-head > span {
    grid-column: 1;
    min-width: 0;
    overflow: visible;
    color: var(--cle-muted);
    white-space: normal;
  }
  .pixel-sculpt-controls .row:not(.gallery-block) > .row-head > output {
    grid-column: 3;
    grid-row: 1;
    box-sizing: border-box;
    width: 100%;
    min-width: 42px;
    padding: 0 3px;
    color: var(--cle-ink);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: text;
    font: 9.5px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
  }
  .pixel-sculpt-controls .row:not(.gallery-block) > .row-head > output:hover {
    background: var(--cle-hover);
    border-color: var(--cle-rule);
  }
  .pixel-sculpt-controls .row:not(.gallery-block) > input[type="range"] {
    grid-column: 2;
    grid-row: 1;
  }
  .pixel-sculpt-controls input[type="range"] {
    width: 100%;
    min-width: 0;
    height: auto;
    margin: 0;
    appearance: auto;
    accent-color: var(--cle-signal);
    background: transparent;
    border-radius: 0;
    cursor: pointer;
  }
  .pixel-sculpt-controls input[type="range"]::-webkit-slider-thumb {
    appearance: auto;
    width: auto;
    height: auto;
    background: initial;
    border: initial;
    border-radius: initial;
    box-shadow: none;
  }
  .pixel-sculpt-controls .seg {
    grid-column: 2 / 4;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 5px;
    min-width: 0;
  }
  .pixel-sculpt-controls .seg button {
    min-width: 0;
    min-height: 25px;
    padding: 3px 5px;
    overflow: hidden;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 9.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pixel-sculpt-controls .seg button:hover,
  .pixel-sculpt-controls .seg button.on {
    color: var(--cle-ink);
    background: var(--cle-hover);
    border-color: color-mix(in srgb, var(--cle-signal) 45%, var(--cle-rule-strong));
    box-shadow: none;
  }
  .pixel-sculpt-controls .toggle-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 27px;
    margin: 0 8px;
    padding: 0;
    color: var(--cle-muted);
    font-size: 9.5px;
  }
  .pixel-sculpt-controls .toggle {
    position: static;
    display: block;
    width: 14px;
    height: 14px;
  }
  .pixel-sculpt-controls .toggle input {
    position: static;
    width: 14px;
    height: 14px;
    margin: 0;
    opacity: 1;
    accent-color: var(--cle-signal);
    cursor: pointer;
  }
  .pixel-sculpt-controls .toggle > span { display: none; }
  .pixel-sculpt-controls .divider {
    height: 1px;
    margin: 9px 0;
    background: var(--cle-rule);
  }

  .pixel-sculpt-controls .gallery-block {
    display: block;
    min-width: 0;
    margin: 0 0 6px;
    padding: 0 0 8px;
    overflow: hidden;
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 7px;
  }
  .pixel-sculpt-controls .gallery-block > .row-head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    margin: 0;
    padding: 5px 8px;
    color: var(--cle-ink);
    font-size: 10.5px;
    font-weight: 600;
  }
  .pixel-sculpt-controls .gallery-block > .row-head output {
    min-width: 0;
    margin-left: auto;
    color: var(--cle-muted);
    font: 9px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .pixel-sculpt-controls .file-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0 8px 7px;
  }
  .pixel-sculpt-controls .file-row button,
  .pixel-sculpt-controls .gallery-nav button {
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
  .pixel-sculpt-controls .file-row button {
    flex: 0 0 auto;
    color: var(--cle-ink);
    border-color: color-mix(in srgb, var(--cle-signal) 48%, var(--cle-rule));
  }
  .pixel-sculpt-controls .file-row button:disabled {
    cursor: default;
    opacity: .5;
  }
  .pixel-sculpt-controls .file-row button:hover,
  .pixel-sculpt-controls .gallery-nav button:hover:not(:disabled) { background: var(--cle-hover); }
  .pixel-sculpt-controls .file-row span {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--cle-muted);
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pixel-sculpt-controls .gallery-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    min-width: 0;
    margin: 0 8px;
    padding: 0;
    overflow: visible;
  }
  .pixel-sculpt-controls .gallery-empty {
    grid-column: 1 / -1;
    display: block;
    width: auto;
    min-height: 0;
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
  .pixel-sculpt-controls .gallery-item {
    position: relative;
    min-width: 0;
    height: auto;
    overflow: visible;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    transition: none;
  }
  .pixel-sculpt-controls .gallery-item:hover { transform: none; }
  .pixel-sculpt-controls .gallery-preview {
    display: grid;
    width: 100%;
    height: auto;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    color: var(--cle-muted);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule);
    border-radius: 6px;
    cursor: pointer;
  }
  .pixel-sculpt-controls .gallery-preview:hover { border-color: var(--cle-rule-strong); }
  .pixel-sculpt-controls .gallery-item.is-selected .gallery-preview {
    border-color: var(--cle-signal);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cle-signal) 20%, transparent);
  }
  .pixel-sculpt-controls .gallery-item.is-active .gallery-preview {
    box-shadow: inset 0 0 0 1px var(--cle-ink);
  }
  .pixel-sculpt-controls .gallery-preview img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--cle-subtle);
    filter: none;
  }
  .pixel-sculpt-controls .gallery-name {
    display: block;
    min-width: 0;
    padding: 3px 4px 4px;
    overflow: hidden;
    font-size: 8.5px;
    line-height: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pixel-sculpt-controls .gallery-item .remove {
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
  .pixel-sculpt-controls .gallery-item:hover .remove,
  .pixel-sculpt-controls .gallery-item:focus-within .remove { opacity: 1; }
  .pixel-sculpt-controls .gallery-item .remove:hover {
    color: #ffffff;
    background: var(--cle-deleted);
    border-color: var(--cle-deleted);
  }
  .pixel-sculpt-controls .gallery-order {
    position: absolute;
    z-index: 2;
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
    pointer-events: none;
    font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .pixel-sculpt-controls .gallery-live {
    position: absolute;
    z-index: 2;
    right: 4px;
    bottom: 21px;
    padding: 1px 4px;
    color: var(--cle-ink);
    background: color-mix(in srgb, var(--cle-paper-raised) 88%, transparent);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 3px;
    pointer-events: none;
    font: 700 7px/11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: .05em;
  }
  .pixel-sculpt-controls .gallery-nav {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 6px;
    margin: 6px 8px 0;
  }
  .pixel-sculpt-controls .gallery-nav button { height: 24px; padding: 0; }
  .pixel-sculpt-controls .gallery-nav button:disabled { cursor: default; opacity: .5; }
  .pixel-sculpt-controls .gallery-index {
    color: var(--cle-muted);
    font: 9px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    text-align: center;
  }

  .pixel-sculpt-controls .color-row {
    grid-template-columns: minmax(0, 1fr) 29px !important;
    gap: 8px !important;
    min-height: 34px !important;
  }
  .pixel-sculpt-controls .color-row > div {
    display: grid;
    grid-template-columns: minmax(92px, .9fr) minmax(72px, 1.1fr);
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .pixel-sculpt-controls .color-row > div > .row-head {
    margin: 0;
    color: var(--cle-muted);
    font-size: 10px;
  }
  .pixel-sculpt-controls .color-row input[type="text"] {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 22px;
    padding: 2px 6px;
    color: var(--cle-ink);
    background: var(--cle-input);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    outline: 0;
    font: 9.5px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .pixel-sculpt-controls .color-row input[type="color"] {
    width: 29px;
    height: 21px;
    padding: 2px;
    overflow: hidden;
    appearance: auto;
    background: var(--cle-input);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    cursor: pointer;
  }
  .pixel-sculpt-controls [hidden] { display: none !important; }
  .startupTransition-preview-workspace {
    flex: none;
    overflow: hidden;
    border: 1px solid #45464a;
    border-radius: 10px;
    background: #202124;
  }
  #cle-startupTransition-settings [hidden] { display: none !important; }
  .startupTransition-preview-stage {
    position: relative;
    aspect-ratio: 16 / 9;
    height: auto;
    min-height: 178px;
    overflow: hidden;
    background: #080b0e;
  }
  .startupTransition-video-still {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: .65;
  }
  .startupTransition-video-still[hidden], .startupTransition-timeline-handle[hidden], .startupTransition-timeline-playhead[hidden] { display: none !important; }
  .startupTransition-timeline {
    display: grid;
    gap: 5px;
    padding: 8px 9px 10px;
    border-top: 1px solid #414247;
    color: #d3d4d7;
    background: #202124;
  }
  .startupTransition-transport { display: flex; align-items: center; justify-content: center; gap: 4px; padding: 0; flex-shrink: 0; }
  .startupTransition-transport button { display: grid; place-items: center; width: 30px; height: 28px; padding: 5px; color: #dddde0; background: transparent; border: 0; border-radius: 4px; cursor: pointer; }
  .startupTransition-transport button:hover { background: #37383d; }
  .startupTransition-transport button:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 2px; }
  .startupTransition-transport button:disabled { opacity: .4; cursor: default; }
  .startupTransition-transport svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .startupTransition-play-icon path { fill: currentColor; stroke: none; }
  .startupTransition-play .startupTransition-pause-icon, .startupTransition-play[data-playing="true"] .startupTransition-play-icon { display: none; }
  .startupTransition-play[data-playing="true"] .startupTransition-pause-icon { display: block; }
  .startupTransition-timeline-heading,
  .startupTransition-timeline-timing {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    font-size: 9px;
  }
  .startupTransition-timeline-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; }
  .startupTransition-timeline-heading .startupTransition-transport { grid-column: 2; grid-row: 1; }
  .startupTransition-timeline-heading strong { white-space: nowrap; }
  .startupTransition-timeline-heading output { grid-column: 3; grid-row: 1; min-width: 0; text-align: right; }
  .startupTransition-timeline-heading strong { font-size: 10px; font-weight: 600; line-height: 1.3; }
  .startupTransition-timeline-heading output,
  .startupTransition-timeline-timing output,
  .startupTransition-timeline-ruler,
  .startupTransition-timeline-legend { font: 9px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .startupTransition-timeline-heading output { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #b4e5cd; }
  .startupTransition-timeline-ruler { display: flex; justify-content: space-between; margin: 0 7px; color: #82968c; }
  .startupTransition-timeline-ruler span { position: relative; }
  .startupTransition-timeline-ruler span::after { content: ""; position: absolute; top: 100%; left: 50%; width: 1px; height: 4px; background: #71877d; }
  .startupTransition-timeline-track { position: relative; height: 48px; margin: 0 7px; touch-action: none; }
  .startupTransition-timeline-frames { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px; overflow: hidden; border-radius: 3px; background: #303136; }
  .startupTransition-timeline-frame { background: linear-gradient(135deg, #34353a, #26272c 60%, #3e3f45); background-position: center; background-size: cover; }
  .startupTransition-timeline-empty { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; padding: 0 8px; color: #b6c8bd; background: #202124e0; font-size: 9px; text-align: center; }
  .startupTransition-timeline[data-has-video="true"] .startupTransition-timeline-empty { display: none; }
  .startupTransition-timeline-selection { position: absolute; z-index: 2; top: 0; bottom: 0; left: var(--clip-start, 0%); right: calc(100% - var(--clip-end, 100%)); border-top: 2px solid #9de5bd; border-bottom: 2px solid #9de5bd; box-shadow: inset 0 0 15px #9de5bd1c; pointer-events: none; }
  .startupTransition-timeline-mask { position: absolute; z-index: 1; top: 0; bottom: 0; background: #121316cf; pointer-events: none; }
  .startupTransition-timeline-mask--left { left: 0; width: var(--clip-start, 0%); }
  .startupTransition-timeline-mask--right { right: 0; width: calc(100% - var(--clip-end, 100%)); }
  .startupTransition-timeline-handle { position: absolute; z-index: 4; top: -2px; bottom: -2px; left: 0; width: 15px; display: grid; place-items: center; transform: translateX(-50%); border: 1px solid #d5ffe4; border-radius: 3px; background: #a2e7bd; box-shadow: 0 1px 7px #000a; cursor: ew-resize; touch-action: none; }
  .startupTransition-timeline-handle span { height: 16px; width: 3px; border-left: 1px solid #37634b; border-right: 1px solid #37634b; }
  .startupTransition-timeline-handle:active { background: #d5ffe4; }
  .startupTransition-timeline-handle:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .startupTransition-timeline-playhead { position: absolute; z-index: 3; top: -5px; bottom: -3px; width: 2px; background: #f4c595; box-shadow: 0 0 8px #f4c595; pointer-events: none; }
  .startupTransition-timeline-playhead::before { content: ""; position: absolute; top: -3px; left: -4px; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 5px solid #f4c595; }
  .startupTransition-timeline-timing-track { position: relative; height: 3px; margin: 8px 7px 2px; border-radius: 2px; }
  .startupTransition-timeline-timing-clip { position: absolute; top: 0; bottom: 0; left: var(--clip-start, 0%); right: calc(100% - var(--clip-end, 100%)); background: #35363b; border-radius: 2px; }
  .startupTransition-timeline-timing-track span { cursor: help; outline-offset: 3px; }
  .startupTransition-timeline-timing-track span::before { content: ""; position: absolute; inset: -5px 0; }
  .startupTransition-timeline-minimum { position: absolute; inset: 0 auto 0 0; width: var(--minimum-end, 0%); min-width: 3px; border-radius: 2px; background: #609f83; }
  .startupTransition-timeline-fade { position: absolute; top: 0; bottom: 0; left: var(--fade-start, 0%); width: calc(var(--fade-end, 100%) - var(--fade-start, 0%)); min-width: 3px; background: linear-gradient(90deg, #e6ad71, #ae6873); }
  .startupTransition-timeline-timeout { position: absolute; top: -1px; bottom: -1px; left: var(--timeout-at, 100%); width: 2px; background: #cdd9ce; }
  .startupTransition-timeline-timeout::before { inset: -5px -4px !important; }
  .startupTransition-media-actions { display: flex; gap: 8px; margin: 2px 0 0; }
  .startup-video-library { flex: 0 0 auto; box-sizing: border-box; width: 100%; min-width: 0; justify-self: stretch; padding: 8px 0 !important; border: 1px solid var(--cle-rule); border-radius: 7px; background: var(--cle-subtle); }
  .startup-video-library .particle-library-grid { width: calc(100% - 16px); max-width: 462px; margin: 0 8px; box-sizing: border-box; }
  .startup-video-library .particle-source-summary { cursor: default; }
  .startup-examples-control { flex: 0 0 96px; width: 96px; height: 22px; margin-inline-start: 8px; }
  .startup-examples-download,.startup-examples-progress { box-sizing: border-box; width: 100%; height: 22px; border: 1px solid var(--cle-rule); border-radius: 5px; background: transparent; color: var(--cle-muted); font: inherit; font-size: 10px; line-height: 20px; padding: 0 6px; }
  .startup-examples-download { cursor: pointer; }
  .startup-examples-download:hover:not(:disabled) { color: var(--cle-ink); background: var(--cle-hover); }
  .startup-examples-download:disabled { opacity: .5; cursor: default; }
  .startup-examples-download:focus-visible { outline: 1px solid var(--cle-muted); outline-offset: 2px; }
  .startup-examples-progress { display: block; position: relative; overflow: hidden; text-align: center; padding: 0; }
  .startup-examples-progress-fill { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--cle-muted); opacity: .16; }
  .startup-examples-progress-label { position: relative; font-size: 9px; }
  .startup-examples-control [hidden] { display: none !important; }
  .startup-video-library .particle-source-summary::before { display: none; }
  .startup-video-library-count { color: var(--cle-muted); font-weight: 400; font: 9px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .startup-video-library .particle-library-toolbar { margin-bottom: 0; }
  .startup-video-library .particle-library-clear { margin-left: 0; }
  .startup-video-library .particle-library-thumb { filter: none; }
  .startup-video-library .particle-library-delete svg {
    width: 14px; height: 14px; fill: none; stroke: currentColor;
    stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
  }
  .startup-video-library .particle-library-item:focus-within .particle-library-delete:not(:disabled) { opacity: 1; }
  .startup-video-library .startupTransition-add-card { border-style: dashed; color: var(--cle-muted); }
  .startup-video-library .startup-video-add-preview { display: grid; place-items: center; background: transparent; }
  .startup-video-library .startup-video-add-preview svg {
    width: 28px; height: 28px; fill: none; stroke: currentColor;
    stroke-width: 1.5; stroke-linecap: round;
  }
  .startup-video-library .startupTransition-add-card:hover:not(:disabled) { color: var(--cle-ink); background: var(--cle-hover); border-color: var(--cle-signal); }
  .startup-video-library .startupTransition-add-card:focus-visible { outline: 2px solid var(--cle-signal); outline-offset: 2px; }
  .startup-video-library .startupTransition-add-card:disabled { opacity: .45; }
  .startup-video-library .startup-video-library-summary,.startupTransition-library-summary { margin: 0 0 0 auto; font-size: 9px; color: var(--cle-muted); }
  .startup-video-pager { display: flex; align-items: center; justify-content: space-between; margin: 0 8px; }
  .startup-video-pager output { color: var(--cle-muted); font: 9px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .startup-video-pager button { min-width: 30px; }
  .startupTransition-library-grid { margin: 0 8px; }
  .startup-video-library .startupTransition-video-info { display: none; }
  .startupTransition-library-grid span.particle-library-thumb { display: grid; place-items: center; }
  .startupTransition-library-grid span.particle-library-thumb svg { width: 28px; height: 28px; }
  .startupTransition-media-actions button {
    padding: 6px 9px;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    color: var(--cle-ink);
    background: var(--cle-input);
    cursor: pointer;
    font: inherit;
  }
  .startupTransition-media-actions button:disabled { opacity: .5; cursor: default; }
  .startupTransition-video-info { margin: 4px 0 0; color: var(--cle-muted); font-size: 11px; overflow-wrap: anywhere; }
  .startupTransition-fit-row select,
  .custom-background-panel .particle-control-row select,
  #cle-startupTransition-settings .particle-control-row select {
    grid-column: 2 / 4;
    width: 100%;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--cle-rule-strong);
    border-radius: 5px;
    color: var(--cle-ink);
    background: var(--cle-input);
    font: inherit;
  }
  .startupTransition-background-controls p { color: var(--cle-muted); font-size: 11px; line-height: 1.5; }
  @keyframes cle-version-check { to { transform: rotate(360deg); } }
  @keyframes cle-particle-settings-in {
    from { opacity: 0; transform: translateY(3px) scale(.99); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
`;
