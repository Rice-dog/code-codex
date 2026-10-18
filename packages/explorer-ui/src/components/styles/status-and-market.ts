export const style4 = String.raw`  .statusbar {
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

  .update-popover {
    position: absolute;
    right: 8px;
    bottom: calc(100% + 8px);
    z-index: 21;
    width: min(276px, calc(100% - 16px));
    padding: 13px;
    color: var(--cle-ink);
    background: var(--cle-paper-raised);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 10px;
    box-shadow: 0 14px 34px rgba(12, 18, 28, .2), 0 3px 10px rgba(12, 18, 28, .12);
    animation: cle-market-in 130ms cubic-bezier(.2, .8, .2, 1) both;
  }
  .update-popover[hidden] { display: none; }
  .update-popover::after {
    content: "";
    position: absolute;
    right: 18px;
    bottom: -6px;
    width: 10px;
    height: 10px;
    background: var(--cle-paper-raised);
    border-right: 1px solid var(--cle-rule-strong);
    border-bottom: 1px solid var(--cle-rule-strong);
    transform: rotate(45deg);
  }
  .update-popover h3 {
    margin: 0;
    color: var(--cle-ink);
    font-size: 13px;
    font-weight: 650;
    line-height: 18px;
  }
  .update-message {
    margin: 4px 0 12px;
    color: var(--cle-muted);
    font-size: 11px;
    line-height: 16px;
  }
  .update-actions {
    display: flex;
    justify-content: flex-end;
    gap: 7px;
  }
  .update-actions button {
    min-width: 58px;
    min-height: 27px;
    padding: 4px 10px;
    color: var(--cle-ink);
    background: var(--cle-paper);
    border: 1px solid var(--cle-rule-strong);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
  }
  .update-actions .update-install {
    color: #fff;
    background: var(--cle-focus);
    border-color: var(--cle-focus);
  }
  .update-actions button:hover:not(:disabled) { filter: brightness(.96); }
  .update-actions button:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 2px; }
  .update-actions button:disabled { cursor: default; opacity: .65; }

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
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px 8px 14px;
    border-bottom: 1px solid var(--cle-rule);
  }
  .preview-market-header h3 {
    flex: 1;
    margin: 0;
    color: var(--cle-ink);
    font-size: 13px;
    font-weight: 650;
    line-height: 18px;
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
    position: relative;
    display: grid;
    align-content: start;
    gap: 8px;
    height: min(300px, calc(100vh - 210px));
    padding: 8px;
    overflow: auto;
  }
  .preview-market-list[data-preview-market-category="developer-tools"] {
    padding-right: 18px;
    overflow-y: hidden;
  }
  .preview-market-list[data-preview-market-category="developer-tools"]::after {
    position: absolute;
    z-index: 2;
    top: 8px;
    right: 2px;
    bottom: 8px;
    width: 10px;
    background: var(--cle-scroll-thumb);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-radius: 999px;
    content: "";
    pointer-events: none;
  }
  .preview-market-section {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .preview-market-section[hidden] { display: none; }
  .preview-market-categories {
    display: grid;
    width: fit-content;
    grid-template-columns: repeat(3, max-content);
    gap: 2px;
    padding: 2px;
    background: var(--cle-subtle);
    border: 1px solid var(--cle-rule);
    border-radius: 7px;
  }
  .preview-market-category {
    min-width: 0;
    padding: 5px 6px;
    color: var(--cle-muted);
    background: transparent;
    border: 0;
    border-radius: 5px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 650;
    line-height: 14px;
    letter-spacing: .01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-market-category:hover { color: var(--cle-ink); background: var(--cle-hover); }
  .preview-market-category[aria-selected="true"] {
    color: var(--cle-ink);
    background: var(--cle-paper);
    box-shadow: 0 1px 2px rgba(12, 18, 28, .08);
  }
  .preview-market-category:focus-visible { outline: 2px solid var(--cle-focus); outline-offset: 1px; }
  .preview-market-section-list {
    display: grid;
    gap: 8px;
  }
`;
