import { describe, expect, it } from "vitest";
import { styles, TREE_ROW_HEIGHT } from "../src/styles";

describe("Codex-aligned explorer styling", () => {
  it("uses neutral surfaces and one inherited UI type system", () => {
    expect(styles).toContain("--cle-paper: #ffffff");
    expect(styles).toContain("--cle-hover: #f2f3f3");
    expect(styles).toContain("--cle-selected: #f4f4f4");
    expect(TREE_ROW_HEIGHT).toBe(28);
    expect(styles).toContain(`--cle-row: ${TREE_ROW_HEIGHT}px`);
    expect(styles).toContain("font-family: inherit");
    expect(styles).not.toMatch(/Bahnschrift/);
    expect(styles).not.toMatch(/#f2f0e9|#faf8f1|#e05b32/);
  });

  it("matches the compact reference tree geometry and focus treatment", () => {
    expect(styles).toMatch(/\.file-filter\s*{[\s\S]*?height:\s*28px;[\s\S]*?border-radius:\s*10px;/);
    expect(styles).toMatch(/\.tree-row\s*{[\s\S]*?left:\s*10px;[\s\S]*?grid-template-columns:\s*16px minmax\(0, 1fr\) auto;/);
    expect(styles).toContain("(var(--depth) - 1) * 18px");
    expect(styles).toContain("repeating-linear-gradient(90deg, var(--cle-indent)");
    // The active row shows no focus outline; the selection background is the only cue.
    expect(styles).not.toMatch(/\.tree-shell:focus-visible \.tree-row\[data-active="true"\]/);
    expect(styles).toMatch(/\.tree-shell:focus-visible\[data-filter-empty="true"\][\s\S]*?outline:\s*2px solid var\(--cle-focus\)/);
    expect(styles).toMatch(/\.file-search:focus-within \.file-filter\s*{[\s\S]*?border-color:\s*var\(--cle-focus\)/);
    expect(styles).toContain("--cle-indent: #3a3c3f");
    expect(styles).toContain("--cle-input: #252628");
  });

  it("uses one rounded explorer card and leaves file preview layout to the main workbench", () => {
    expect(styles).toMatch(/:host\s*{[\s\S]*?background:\s*transparent;/);
    expect(styles).toMatch(/\.frame\s*{[\s\S]*?border:\s*1px solid var\(--cle-rule\);[\s\S]*?border-radius:\s*12px;/);
    expect(styles).not.toMatch(/\.frame\s*{[\s\S]*?border-inline-end:/);
    expect(styles).toMatch(/grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto;/);
    expect(styles).toMatch(/\.statusbar\s*{[\s\S]*?grid-row:\s*4;/);
    expect(styles).not.toContain(".file-preview");
    expect(styles).not.toContain("--cle-preview");
  });

  it("keeps header rows compact when a duplicate root label is hidden", () => {
    expect(styles).toMatch(/grid-template-areas:\s*"eyebrow actions"\s*"project project"\s*"root root"/);
    expect(styles).toMatch(/\.identity\s*{\s*display:\s*contents;/);
    expect(styles).toMatch(/\.eyebrow\s*{[\s\S]*?grid-area:\s*eyebrow;[\s\S]*?white-space:\s*nowrap;/);
    expect(styles).not.toContain(".eyebrow-label");
    expect(styles).not.toContain(".eyebrow-separator");
    expect(styles).toMatch(/\.project-name\s*{[\s\S]*?grid-area:\s*project;[\s\S]*?text-overflow:\s*ellipsis;/);
    expect(styles).toMatch(/\.root-label\s*{[\s\S]*?grid-area:\s*root;[\s\S]*?text-overflow:\s*ellipsis;/);
    expect(styles).toMatch(/\.masthead\[data-root-visible="false"\]\s*{[\s\S]*?grid-template-rows:\s*26px 20px;[\s\S]*?min-height:\s*59px;/);
    expect(styles).toContain(".root-label[hidden] { display: none; }");
    expect(styles).toMatch(/\.edit-mode-toggle\s*{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/);
  });

  it("keeps physical arrow directions stable and emphasizes only the reached endpoint", () => {
    expect(styles).toContain("--cle-scroll-thumb: #eeeeee");
    expect(styles).toContain("--cle-scroll-arrow-up: url(");
    expect(styles).toContain("--cle-scroll-arrow-down: url(");
    expect(styles).toContain("--cle-scroll-arrow-faded-up: url(");
    expect(styles).toContain("--cle-scroll-arrow-faded-down: url(");
    expect(styles).toMatch(/@supports not selector\(::-webkit-scrollbar\)[\s\S]*?scrollbar-color:\s*var\(--cle-scroll-thumb\) transparent;/);
    expect(styles).toMatch(/\.tree-shell::-webkit-scrollbar-thumb\s*{[\s\S]*?background(?:-color)?:\s*var\(--cle-scroll-thumb\);/);
    expect(styles).toMatch(/\.tree-shell::-webkit-scrollbar-button:vertical\s*{[\s\S]*?background-color:\s*transparent;[\s\S]*?background-image:\s*none;/);
    expect(styles).toMatch(/\.tree-shell::-webkit-scrollbar-button:vertical:increment:start,[\s\S]*?\.tree-shell::-webkit-scrollbar-button:vertical:decrement:end\s*{[\s\S]*?display:\s*none;[\s\S]*?height:\s*0;/);
    expect(styles).toMatch(/\.tree-shell::-webkit-scrollbar-button:vertical:decrement:start\s*{[\s\S]*?background-image:\s*var\(--cle-scroll-arrow-faded-up\);/);
    expect(styles).toMatch(/\.tree-shell::-webkit-scrollbar-button:vertical:increment:end\s*{[\s\S]*?background-image:\s*var\(--cle-scroll-arrow-faded-down\);/);
    expect(styles).toMatch(/\.tree-shell\[data-scroll-position="start"\]::-webkit-scrollbar-button:vertical:decrement:start\s*{[\s\S]*?background-image:\s*var\(--cle-scroll-arrow-up\);/);
    expect(styles).toMatch(/\.tree-shell\[data-scroll-position="end"\]::-webkit-scrollbar-button:vertical:increment:end\s*{[\s\S]*?background-image:\s*var\(--cle-scroll-arrow-down\);/);
    expect(styles).not.toMatch(/::-webkit-scrollbar-button[^}]*opacity:/);
    expect(styles).not.toContain("-webkit-mask-image");
  });

  it("uses a compact rounded context menu with visible keyboard focus", () => {
    expect(styles).toMatch(/\.context-menu\s*{[\s\S]*?width:\s*min\(208px,[\s\S]*?max-height:\s*calc\(100% - 12px\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?border-radius:\s*8px;/);
    expect(styles).toMatch(/\.context-menu-item\s*{[\s\S]*?height:\s*30px;[\s\S]*?border-radius:\s*6px;/);
    expect(styles).toMatch(/\.context-menu-item:focus-visible\s*{[\s\S]*?box-shadow:\s*inset 0 0 0 2px var\(--cle-focus\)/);
    expect(styles).toMatch(/\.context-menu-dialog\s*{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*8px;/);
    expect(styles).toMatch(/\.context-dialog-input:focus-visible\s*{[\s\S]*?border-color:\s*var\(--cle-focus\)/);
    expect(styles).toMatch(/\.action-notice\s*{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*9;/);
    expect(styles).toMatch(/@container \(max-width:\s*220px\)[\s\S]*?\.context-menu-label\s*{[\s\S]*?white-space:\s*normal;/);
    expect(styles).toContain(".action-notice[hidden] { display: none; }");
    expect(styles).toContain('.tree-row[data-context-target="true"]');
    expect(styles).toContain(".context-menu-icon svg");
  });

  it("gives drag sources and folder or root drop targets distinct feedback", () => {
    expect(styles).not.toMatch(/cursor:\s*grab(?:bing)?/);
    expect(styles).toMatch(/\.tree-row\[data-drag-source="true"\][\s\S]*?opacity:\s*\.55;/);
    expect(styles).toMatch(/\.tree-row\[data-drop-target="true"\][\s\S]*?box-shadow:\s*inset 0 0 0 2px var\(--cle-focus\)/);
    expect(styles).toMatch(/\.tree-shell\[data-drop-target="true"\][\s\S]*?box-shadow:\s*inset 0 0 0 2px var\(--cle-focus\)/);
    expect(styles).toMatch(/\.masthead\[data-drop-target="true"\][\s\S]*?box-shadow:\s*inset 0 0 0 2px var\(--cle-focus\)/);
  });

  it("distinguishes multi-selected rows and renders a marquee rectangle", () => {
    expect(styles).toContain("--cle-marquee-fill: rgba(46, 130, 210, 0.12)");
    expect(styles).toContain('.tree-row[data-selected="true"] { background: var(--cle-hover); }');
    expect(styles).toMatch(/\.tree-marquee\s*{[\s\S]*?background:\s*var\(--cle-marquee-fill\);[\s\S]*?border:\s*1px solid var\(--cle-focus\);[\s\S]*?border-radius:\s*0;/);
    expect(styles).toContain(".tree-marquee[hidden] { display: none; }");
    expect(styles).toMatch(/\.tree-row\[aria-selected="true"\],[\s\S]*?\.tree-row\[data-selected="true"\],[\s\S]*?border-radius:\s*0;/);
  });
});
