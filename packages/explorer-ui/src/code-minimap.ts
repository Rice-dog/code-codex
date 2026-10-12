import { SYNTAX_TOKEN_KINDS, type SyntaxHighlight, type SyntaxTokenKind } from "./syntax-highlight";
import { runtimeEvent } from "./runtime-events";

export const CODE_MINIMAP_PREFERENCE = "code-codex:code-minimap:v1";

export const codeMinimapStyles = `
  .code-surface { display: grid; grid-template-columns: minmax(0, 1fr) 96px var(--code-scrollbar-width, 0px); min-width: 0; min-height: 0; overflow: hidden; }
  .code-surface[data-minimap-hidden] { grid-template-columns: minmax(0, 1fr) var(--code-scrollbar-width, 0px); }
  .code-surface[data-minimap-hidden] > .code-minimap { display: none; }
  /* A non-auto inherited scrollbar-color makes Chromium ignore the WebKit
     dimensions below, restoring the source's unwanted vertical track. */
  .code-source-scroller, .code-vertical-scrollbar { scrollbar-color: auto; scrollbar-width: auto; }
  .code-source-scroller::-webkit-scrollbar { width: 0; height: 12px; }
  .code-source-scroller::-webkit-scrollbar-thumb, .code-vertical-scrollbar::-webkit-scrollbar-thumb { background: var(--cle-main-muted); border: 3px solid transparent; background-clip: padding-box; border-radius: 8px; }
  .code-source-scroller::-webkit-scrollbar-track, .code-vertical-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .code-vertical-scrollbar { min-width: 0; align-self: start; overflow-x: hidden; overflow-y: scroll; background: var(--cle-main-bg); }
  .code-vertical-scrollbar::-webkit-scrollbar { width: 12px; }
  .code-vertical-scrollbar > div { width: 1px; pointer-events: none; }
  .code-minimap { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: var(--cle-main-bg); touch-action: none; cursor: pointer; color: var(--cle-main-text); }
  .code-minimap canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
  .code-minimap-slider { position: absolute; left: 0; right: 0; background: var(--cle-main-hover); border-block: 1px solid var(--cle-main-line); pointer-events: none; opacity: 0; }
  .code-minimap[data-viewport-visible] .code-minimap-slider { opacity: 1; }
  .code-minimap:hover .code-minimap-slider, .code-minimap:focus-visible .code-minimap-slider, .code-minimap[data-dragging] .code-minimap-slider { background: color-mix(in srgb, var(--cle-main-text) 14%, transparent); }
  .code-minimap:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: -2px; }
  .code-minimap-colors { position: absolute; width: 0; height: 0; overflow: hidden; visibility: hidden; }
  .code-surface:not([data-minimap-hidden]) .code-editor:focus-visible { box-shadow: inset 0 2px 0 var(--cle-main-line), inset 0 -2px 0 var(--cle-main-line); }
  .minimap-toggle { flex: 0 0 auto; display: grid; place-items: center; width: 25px; height: 25px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: var(--cle-main-faint); cursor: pointer; }
  .minimap-toggle[aria-pressed="true"] { color: var(--cle-main-text); background: var(--cle-main-hover); }
  .minimap-toggle:hover { color: var(--cle-main-text); background: var(--cle-main-hover); }
  .minimap-toggle:focus-visible { outline: 2px solid var(--cle-main-focus); outline-offset: 1px; }
  .minimap-toggle svg { width: 16px; height: 16px; }
  @media (forced-colors: active) { .code-minimap { border-color: GrayText; } .code-minimap-slider { border: 2px solid Highlight; background: transparent !important; } }
`;

interface MinimapMark { readonly column: number; readonly text: string; readonly kind: SyntaxTokenKind }

/** Read only navigation over the source already authorized/loaded by the preview.
 * At most 80 columns per line are retained; no duplicate source DOM or file reads. */
export class CodeMinimap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly slider: HTMLElement;
  private readonly scrollbar: HTMLElement;
  private readonly scrollExtent: HTMLElement;
  private readonly probes = new Map<SyntaxTokenKind, HTMLElement>();
  private readonly resize: ResizeObserver;
  private readonly theme: MutationObserver;
  private readonly abort = new AbortController();
  private readonly win: Window;
  private rows: MinimapMark[][] = [[]];
  private frame = 0;
  private dirty = true;
  private disposed = false;
  private suspended = false;
  private enabled: boolean;
  private hidden: boolean | null = null;
  private mapHeight = 0;
  private pitch = 3;
  private sliderTop = 0;
  private sliderHeight = 0;
  private hovered = false;
  private activityTimer = 0;
  private lastScrollTop = 0;
  private drag: { id: number; y: number; scroll: number } | null = null;

  constructor(private readonly surface: HTMLElement, private readonly scroller: HTMLElement,
    private readonly sourceElement: HTMLElement, enabled: boolean, truncated: boolean) {
    const doc = surface.ownerDocument;
    this.win = doc.defaultView!;
    this.enabled = enabled;
    this.element = doc.createElement("div");
    this.element.className = "code-minimap";
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "scrollbar");
    this.element.setAttribute("aria-orientation", "vertical");
    this.element.setAttribute("aria-label", truncated ? "Code minimap (loaded portion only)" : "Code minimap");
    this.element.title = truncated ? "Loaded portion only · Click or drag to navigate" : "Click or drag to navigate · Arrow keys to scroll";
    this.scroller.id ||= `code-minimap-content-${++minimapSequence}`;
    this.element.setAttribute("aria-controls", this.scroller.id);
    this.canvas = doc.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.slider = doc.createElement("div");
    this.slider.className = "code-minimap-slider";
    const colors = doc.createElement("div");
    colors.className = "code-minimap-colors";
    colors.setAttribute("aria-hidden", "true");
    for (const kind of SYNTAX_TOKEN_KINDS) {
      const probe = doc.createElement("span");
      probe.className = `tok-${kind}`;
      colors.append(probe);
      this.probes.set(kind, probe);
    }
    this.element.append(this.canvas, this.slider, colors);
    // Keep the editing/reading element as the authoritative scroll position.
    // A native scroll track outside the minimap mirrors its vertical range;
    // its horizontal scrollbar and caret auto-scroll remain on the source.
    this.scrollbar = doc.createElement("div");
    this.scrollbar.className = "code-vertical-scrollbar";
    this.scrollbar.setAttribute("aria-hidden", "true");
    this.scrollbar.tabIndex = -1;
    this.scrollExtent = doc.createElement("div");
    this.scrollbar.append(this.scrollExtent);
    scroller.classList.add("code-source-scroller");
    surface.append(this.element, this.scrollbar);
    const options = { signal: this.abort.signal };
    this.lastScrollTop = scroller.scrollTop;
    scroller.addEventListener("scroll", () => {
      if (this.lastScrollTop !== scroller.scrollTop) this.showScrollActivity();
      this.lastScrollTop = scroller.scrollTop;
      this.syncScrollbar(); this.schedule();
    }, { ...options, passive: true });
    this.scrollbar.addEventListener("scroll", () => {
      if (scroller.scrollTop !== this.scrollbar.scrollTop) scroller.scrollTop = this.scrollbar.scrollTop;
      this.schedule();
    }, { ...options, passive: true });
    this.element.addEventListener("pointerdown", (event) => this.pointerDown(event), options);
    this.element.addEventListener("pointerenter", () => { this.hovered = true; this.updateViewportVisibility(); }, options);
    this.element.addEventListener("pointerleave", () => {
      this.hovered = false; this.clearScrollActivity(); this.updateViewportVisibility();
    }, options);
    this.element.addEventListener("pointermove", (event) => this.pointerMove(event), options);
    this.element.addEventListener("pointerup", () => this.endDrag(), options);
    this.element.addEventListener("pointercancel", () => this.endDrag(), options);
    this.element.addEventListener("lostpointercapture", () => this.endDrag(), options);
    this.element.addEventListener("keydown", (event) => {
      const line = this.lineHeight();
      const delta: Record<string, number> = { ArrowDown: line, ArrowUp: -line, PageDown: scroller.clientHeight, PageUp: -scroller.clientHeight };
      if (event.key in delta) scroller.scrollTop += delta[event.key]!;
      else if (event.key === "Home") scroller.scrollTop = 0;
      else if (event.key === "End") scroller.scrollTop = scroller.scrollHeight;
      else return;
      event.preventDefault(); this.showScrollActivity(); this.schedule();
    }, options);
    this.element.addEventListener("wheel", (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? this.lineHeight() : event.deltaMode === 2 ? scroller.clientHeight : 1;
      scroller.scrollTop += event.deltaY * unit;
      scroller.scrollLeft += event.deltaX * unit;
      this.schedule();
    }, { ...options, passive: false });
    this.win.addEventListener("resize", () => this.invalidate(), options);
    this.win.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.invalidate(), options);
    this.resize = new ResizeObserver(() => this.invalidate());
    this.resize.observe(surface);
    this.resize.observe(scroller);
    this.theme = new MutationObserver(() => this.invalidate());
    // Observe only ancestors, never the editor's token/typing subtree.
    // The preview constructs this surface before inserting its panel.
    queueMicrotask(() => {
      if (this.disposed) return;
      let ancestor: Element | null = surface;
      while (ancestor) {
        this.theme.observe(ancestor, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        const parent: Element | null = ancestor.parentElement;
        ancestor = parent ?? ((ancestor.getRootNode() as ShadowRoot).host ?? null);
      }
    });
    this.setEnabled(enabled);
    runtimeEvent("code-minimap", "controller", "created", { enabled, truncated });
  }

  setSource(source: string, highlight: SyntaxHighlight): void {
    const rows: MinimapMark[][] = [[]];
    let row = 0, column = 0;
    for (const run of highlight.runs) {
      let text = "", start = column;
      const flush = () => { if (text) rows[row]!.push({ column: start, text, kind: run.kind }); text = ""; };
      for (const char of source.slice(run.start, run.end)) {
        if (char === "\n") { flush(); rows.push([]); row++; column = 0; start = 0; }
        else if (char === "\r") { /* CRLF has one line break. */ }
        else {
          const width = char === "\t" ? 4 - column % 4 : (char.codePointAt(0)! >= 0x2e80 ? 2 : 1);
          if (column < 80) text += char === "\t" ? " ".repeat(width) : char;
          column += width;
        }
      }
      flush();
    }
    this.rows = rows;
    this.invalidate();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled; this.endDrag();
    if (!enabled) this.resetViewportVisibility();
    this.invalidate();
  }
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    runtimeEvent("code-minimap", "controller", suspended ? "suspended" : "resumed");
    if (suspended) { this.endDrag(); this.resetViewportVisibility(); this.win.cancelAnimationFrame(this.frame); this.frame = 0; }
    else this.invalidate();
  }
  private invalidate(): void { this.dirty = true; this.schedule(); }
  private schedule(): void {
    if (this.disposed || this.suspended || this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  private lineHeight(): number { return Number.parseFloat(this.win.getComputedStyle(this.sourceElement).lineHeight) || 20.25; }
  private paddingTop(): number { return Number.parseFloat(this.win.getComputedStyle(this.sourceElement).paddingTop) || 0; }
  private updateViewportVisibility(): void {
    this.element.toggleAttribute("data-viewport-visible", !this.disposed && !this.suspended && this.enabled && this.hidden !== true && (this.hovered || this.drag !== null || this.activityTimer !== 0));
  }
  private clearScrollActivity(): void {
    this.win.clearTimeout(this.activityTimer); this.activityTimer = 0;
  }
  private resetViewportVisibility(): void {
    this.clearScrollActivity(); this.hovered = false; this.updateViewportVisibility();
  }
  private showScrollActivity(): void {
    if (this.disposed || this.suspended || !this.enabled || this.surface.clientWidth < 520) return;
    this.clearScrollActivity();
    this.activityTimer = this.win.setTimeout(() => {
      this.activityTimer = 0; this.updateViewportVisibility();
    }, 800);
    this.updateViewportVisibility();
  }
  private syncScrollbar(): void {
    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    this.surface.style.setProperty("--code-scrollbar-width", maxScroll ? "12px" : "0px");
    // Editor footer stays outside the track; a horizontal scrollbar changes
    // clientHeight, so copy the scroll RANGE rather than the total source height.
    this.scrollbar.style.height = `${this.scroller.offsetHeight}px`;
    this.scrollbar.style.marginTop = `${Math.max(0, this.scroller.getBoundingClientRect().top - this.surface.getBoundingClientRect().top)}px`;
    this.scrollExtent.style.height = `${this.scrollbar.clientHeight + maxScroll}px`;
    if (this.scrollbar.scrollTop !== this.scroller.scrollTop) this.scrollbar.scrollTop = this.scroller.scrollTop;
  }
  private paint(): void {
    const hidden = !this.enabled || this.surface.clientWidth < 520;
    this.surface.toggleAttribute("data-minimap-hidden", hidden);
    if (hidden !== this.hidden) {
      this.hidden = hidden;
      runtimeEvent("code-minimap", "visibility", hidden ? "hidden" : "shown", { reason: !this.enabled ? "preference disabled" : this.surface.clientWidth < 520 ? "narrow pane" : "enabled" });
    }
    this.syncScrollbar();
    if (hidden || this.element.clientHeight === 0) { this.endDrag(); this.resetViewportVisibility(); return; }
    this.updateViewportVisibility();
    const width = this.element.clientWidth, height = this.element.clientHeight;
    this.pitch = Math.min(3, Math.max(0, height - 12) / this.rows.length);
    this.mapHeight = this.pitch * this.rows.length;
    if (this.dirty) {
      this.dirty = false;
      const dpr = Math.min(2, this.win.devicePixelRatio || 1);
      this.canvas.width = Math.ceil(width * dpr);
      this.canvas.height = Math.ceil(height * dpr);
      const context = this.canvas.getContext("2d");
      if (context) {
        context.scale(dpr, dpr);
        context.font = "1.67px monospace";
        context.textBaseline = "top";
        const colors = new Map([...this.probes].map(([kind, probe]) => [kind, this.win.getComputedStyle(probe).color]));
        context.save(); context.beginPath(); context.rect(6, 6, width - 12, height - 12); context.clip();
        for (let index = 0; index < this.rows.length; index++) {
          for (const mark of this.rows[index]!) {
            context.fillStyle = colors.get(mark.kind)!;
            if (this.pitch >= 2) context.fillText(mark.text, 6 + mark.column, 6 + index * this.pitch);
            else {
              // When rows overlap, use bounded strokes rather than unreadable glyphs.
              let col = mark.column;
              for (const char of mark.text) { if (char !== " ") context.fillRect(6 + col, 6 + index * this.pitch, 0.8, Math.max(0.35, this.pitch * 0.7)); col += char.codePointAt(0)! >= 0x2e80 ? 2 : 1; }
            }
          }
        }
        context.restore();
      } else runtimeEvent("code-minimap", "canvas", "unavailable");
    }
    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    this.sliderHeight = Math.min(this.mapHeight, Math.max(18, this.scroller.clientHeight / this.lineHeight() * this.pitch));
    this.sliderTop = 6 + (maxScroll ? this.scroller.scrollTop / maxScroll * (this.mapHeight - this.sliderHeight) : 0);
    this.slider.style.top = `${this.sliderTop}px`;
    this.slider.style.height = `${this.sliderHeight}px`;
    this.element.setAttribute("aria-valuemin", "0");
    this.element.setAttribute("aria-valuemax", String(Math.round(maxScroll)));
    this.element.setAttribute("aria-valuenow", String(Math.round(this.scroller.scrollTop)));
    this.element.setAttribute("aria-valuetext", `Line ${Math.min(this.rows.length, 1 + Math.floor(Math.max(0, this.scroller.scrollTop - this.paddingTop()) / this.lineHeight()))} of ${this.rows.length}`);
  }
  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.suspended) return;
    event.preventDefault();
    this.paint();
    if (this.mapHeight <= 0) return;
    const y = event.clientY - this.element.getBoundingClientRect().top;
    if (y < this.sliderTop || y > this.sliderTop + this.sliderHeight) {
      const line = Math.max(0, (y - 6) / this.pitch);
      this.scroller.scrollTop = line * this.lineHeight() + this.paddingTop() - this.scroller.clientHeight / 2;
    }
    this.drag = { id: event.pointerId, y: event.clientY, scroll: this.scroller.scrollTop };
    this.element.setPointerCapture(event.pointerId);
    this.element.setAttribute("data-dragging", "");
    this.updateViewportVisibility();
    this.element.focus({ preventScroll: true });
    this.schedule();
  }
  private pointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    const rect = this.element.getBoundingClientRect();
    this.hovered = event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom;
    const maxScroll = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    const travel = this.mapHeight - this.sliderHeight;
    if (travel > 0) this.scroller.scrollTop = this.drag.scroll + (event.clientY - this.drag.y) * maxScroll / travel;
    this.schedule();
  }
  private endDrag(): void {
    const drag = this.drag; this.drag = null;
    if (drag && this.element.hasPointerCapture(drag.id)) this.element.releasePointerCapture(drag.id);
    this.element.removeAttribute("data-dragging");
    if (drag && !this.hovered) {
      this.clearScrollActivity(); this.lastScrollTop = this.scroller.scrollTop;
    }
    this.updateViewportVisibility();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.endDrag(); this.resetViewportVisibility();
    runtimeEvent("code-minimap", "controller", "disposed", { lineCount: this.rows.length });
    this.win.cancelAnimationFrame(this.frame); this.frame = 0;
    this.abort.abort(); this.resize.disconnect(); this.theme.disconnect();
    this.scroller.classList.remove("code-source-scroller");
    this.scrollbar.remove(); this.surface.style.removeProperty("--code-scrollbar-width");
    this.rows = []; this.probes.clear(); this.canvas.width = this.canvas.height = 0;
  }
}

let minimapSequence = 0;
