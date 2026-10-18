export const style5 = String.raw`  .preview-extension {
    --cle-market-enable: #e5f0fe;
    --cle-download: #f1eef8;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 9px;
    padding: 10px;
    background: var(--cle-paper);
    border: 1px solid var(--cle-rule);
    border-radius: 8px;
  }
  .preview-extension[hidden] { display: none !important; }
  .preview-extension[data-package-pending="true"] .preview-extension-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  .preview-extension[data-package-pending="true"] .preview-extension-title-row { width: 100%; }
  .preview-extension-icon { align-self: start; }
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
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .preview-extension h4 {
    min-width: 0;
    margin: 0;
    color: var(--cle-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 17px;
    overflow-wrap: anywhere;
    white-space: normal;
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
  .preview-extension-status[hidden],
  .preview-extension-download progress[hidden] { display: none; }
  .preview-extension-download {
    align-self: stretch;
    grid-column: 2;
    display: grid;
    gap: 4px;
    min-width: 0;
    color: var(--cle-muted);
    font-size: 9.5px;
    line-height: 15px;
  }
  .preview-extension-download progress {
    display: block;
    width: 100%;
    height: 4px;
    overflow: hidden;
    border: 0;
    border-radius: 2px;
    background: var(--cle-subtle);
    accent-color: var(--cle-signal);
  }
  .preview-extension-download progress::-webkit-progress-bar { background: var(--cle-subtle); }
  .preview-extension-download progress::-webkit-progress-value { background: var(--cle-signal); }
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
    color: #173b66;
    background: var(--cle-market-enable);
    border: 1px solid color-mix(in srgb, var(--cle-market-enable) 80%, #69aaf5);
    border-radius: 5px;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
  }
  .preview-extension-action:hover { filter: brightness(1.06); }
  .preview-extension-action[data-package-action="download"] {
    color: #34204f;
    background: var(--cle-download);
    border: 1px solid color-mix(in srgb, var(--cle-download) 80%, #7854b8);
  }
  .preview-extension-action:disabled {
    cursor: default;
    filter: none;
    opacity: .56;
  }
  .preview-extension-action:is([data-enabled="true"], [aria-pressed="true"]) {
    color: var(--cle-muted);
    background: transparent;
    border-color: var(--cle-rule-strong);
  }

`;
