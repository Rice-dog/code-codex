const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

/** Character-only tide reveal: no overlay, moving rectangle, or global dimming. */
export function openingGlyph(elapsed, duration, x, y, strength = 1) {
  const t = clamp(elapsed / duration);
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  const crest = Math.sin(x * Math.PI * 2 - t * 4) * 0.09 * strength;
  const arrival = (1 - y) * 0.55 + crest * Math.sin(t * Math.PI);
  return smooth((t * 1.22 - arrival) / 0.23);
}

export class LiquidOpening {
  constructor(options, reduced = false) { this.restart(options, reduced); }
  restart(options, reduced = false) {
    this.elapsed = reduced || !options.introEnabled ? options.introDuration : 0;
    this.impulsed = this.elapsed > 0;
  }
  advance(dt, options, reduced = false) {
    if (reduced || !options.introEnabled) this.elapsed = options.introDuration;
    else this.elapsed = Math.min(options.introDuration, this.elapsed + dt);
    const pulse = !this.impulsed && this.elapsed >= options.introDuration * 0.16;
    if (pulse) this.impulsed = true;
    return pulse;
  }
  active(options) { return options.introEnabled && this.elapsed < options.introDuration; }
}
