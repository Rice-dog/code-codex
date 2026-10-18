export const style2 = String.raw`  .tree-shell {
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

`;
