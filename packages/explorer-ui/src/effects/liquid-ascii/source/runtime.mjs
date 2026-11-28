import { FlipLiquidAsciiSimulation } from "./flip-fluid.mjs";
import { normalizeOptions } from "./options.mjs";
import { LiquidOpening, openingGlyph } from "./opening.mjs";

/** Shared by React preview and the isolated Code-Codex drawing worker. */
export class LiquidAsciiRenderer {
  /** @param {(message: string) => void} onError */
  constructor(host, canvas, settings = {}, onError = (_message) => {}, onFrame = () => {}) {
    this.host = host; this.canvas = canvas; this.onError = onError; this.onFrame = onFrame;
    this.options = normalizeOptions(settings);
    this.motion = matchMedia("(prefers-reduced-motion: reduce)");
    this.rect = host.getBoundingClientRect();
    this.visible = !document.hidden; this.intersecting = true;
    this.frame = 0; this.lastTs = 0; this.dead = false; this.previous = null;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx) throw Error("LIQUID_CANVAS_UNAVAILABLE: Canvas 2D is unavailable.");
    this.sim = new FlipLiquidAsciiSimulation(this.rect.width || 920, this.rect.height || 500, this.options);
    this.opening = new LiquidOpening(this.options, this.motion.matches);
    this.resizeObserver = new ResizeObserver(() => {
      this.rect = host.getBoundingClientRect(); this.draw(); this.schedule();
    });
    this.resizeObserver.observe(host);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.intersecting = entry?.isIntersecting ?? true; this.visibility();
    });
    this.intersectionObserver.observe(host);
    this.visibilityHandler = () => { this.visible = !document.hidden; this.visibility(); };
    this.motionHandler = () => {
      if (this.motion.matches) this.opening.restart({ ...this.options, introEnabled: false }, true);
      this.draw(); this.visibility();
    };
    this.moveHandler = (event) => this.pointer(event);
    this.leaveHandler = () => { this.previous = null; this.sim.clearPointer(); };
    document.addEventListener("visibilitychange", this.visibilityHandler);
    this.motion.addEventListener("change", this.motionHandler);
    host.addEventListener("pointermove", this.moveHandler);
    host.addEventListener("pointerdown", this.moveHandler);
    host.addEventListener("pointerleave", this.leaveHandler);
    this.draw(); this.schedule();
  }
  setSettings(settings) {
    const before = this.options;
    this.options = normalizeOptions(settings);
    if (before.introEnabled !== this.options.introEnabled) this.replay();
    if (!this.options.interactive || this.options.paused) this.leaveHandler();
    this.draw(); this.visibility();
  }
  replay() {
    this.opening.restart(this.options, this.motion.matches);
    this.lastTs = 0; this.draw(); this.schedule();
  }
  splash(strength = 1.25, direction = 1) {
    if (this.motion.matches || this.options.paused) return;
    this.sim.splash(strength, direction); this.schedule();
  }
  pointer(event) {
    const o = this.options;
    if (this.dead || !this.visible || !this.intersecting || !o.interactive || o.paused || this.motion.matches) return;
    const r = this.rect, x = (event.clientX - r.left) / Math.max(1, r.width);
    const y = (event.clientY - r.top) / Math.max(1, r.height);
    if (x < 0 || x > 1 || y < 0 || y > 1) { this.leaveHandler(); return; }
    const now = performance.now() / 1000, p = this.previous;
    const dt = p ? Math.max(0.008, now - p.time) : 1;
    this.sim.setPointer(x, y, p ? (x - p.x) * this.sim.simWidth / dt : 0,
      p ? (y - p.y) * this.sim.simHeight / dt : 0);
    this.previous = { x, y, time: now };
    this.schedule();
  }
  visibility() {
    if (this.dead) return;
    this.lastTs = 0;
    if (!this.visible || !this.intersecting || this.motion.matches ||
      (!this.opening.active(this.options) && (this.options.paused || this.options.speed === 0))) {
      cancelAnimationFrame(this.frame); this.frame = 0;
    } else this.schedule();
  }
  schedule() {
    if (this.frame || this.dead || !this.visible || !this.intersecting || this.motion.matches) return;
    if (!this.opening.active(this.options) && (this.options.paused || this.options.speed === 0)) return;
    this.frame = requestAnimationFrame((ts) => {
      this.frame = 0;
      if (this.dead || !this.visible || !this.intersecting) return;
      const dt = this.lastTs ? Math.min(0.035, Math.max(0, (ts - this.lastTs) / 1000)) : 0.016;
      this.lastTs = ts;
      try {
        if (this.opening.advance(dt, this.options, this.motion.matches) &&
          this.options.introStrength > 0 && !this.options.paused) {
          this.sim.splash(0.55 * this.options.introStrength, 1);
        }
        if (!this.options.paused) this.sim.step(dt, this.options);
        this.draw(); this.schedule();
      } catch (error) { this.dispose(); this.onError(String(error)); }
    });
  }
  draw() {
    if (this.dead) return;
    const o = this.options, w = Math.max(1, this.rect.width), h = Math.max(1, this.rect.height);
    const dpr = Math.min(2, Math.max(1, devicePixelRatio || 1));
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    }
    this.sim.resize(w, h, o.cellSize, o.fillHeight, false);
    const buf = this.sim.computeAsciiBuffer(o.characters);
    const { cols, rows } = this.sim, ctx = this.ctx, cell = o.cellSize;
    this.host.dataset.cols = String(cols); this.host.dataset.rows = String(rows);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = o.backgroundColor; ctx.fillRect(0, 0, w, h);
    ctx.font = Math.max(6, Math.round(cell * 0.9)) + "px " + o.fontFamily;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = o.color;
    const ox = Math.floor((w - cols * cell) * 0.5), oy = Math.floor((h - rows * cell) * 0.5);
    const intro = this.opening.active(o);
    for (let row = 0; row < rows; row++) {
      const cy = oy + (row + 0.5) * cell;
      for (let col = 0; col < cols; col++) {
        const ch = o.characters[buf[row * cols + col]];
        if (!ch || ch === " ") continue;
        const alpha = intro ? openingGlyph(this.opening.elapsed, o.introDuration, col / cols, row / rows, o.introStrength) : 1;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha * o.opacity;
        ctx.fillText(ch, ox + (col + 0.5) * cell, cy);
      }
    }
    ctx.globalAlpha = 1; this.onFrame();
  }
  dispose() {
    if (this.dead) return;
    this.dead = true; cancelAnimationFrame(this.frame); this.frame = 0;
    this.resizeObserver.disconnect(); this.intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.motion.removeEventListener("change", this.motionHandler);
    this.host.removeEventListener("pointermove", this.moveHandler);
    this.host.removeEventListener("pointerdown", this.moveHandler);
    this.host.removeEventListener("pointerleave", this.leaveHandler);
    this.sim.clearPointer();
  }
}
