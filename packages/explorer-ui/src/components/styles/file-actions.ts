export const style3 = String.raw`  .context-menu {
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
    position: fixed;
    inset: auto;
    margin: 0;
    z-index: 2147483647;
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
  .action-notice[data-tone="progress"] { box-shadow: inset 3px 0 var(--cle-focus), 0 6px 18px rgba(0, 0, 0, .16); }
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

`;
