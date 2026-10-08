import { runtimeEvent } from './runtime-events';

const KEY = Symbol.for('code-codex:background-startup-hold:v1');
type Opening = { resumeOpening?: () => void; replay?: () => void; dispose?: () => void };
type Pending = { layer: Element; callback: FrameRequestCallback; native?: number | undefined };
type HoldState = { active: boolean; layers: Set<Element>; next: number; pending: Map<number, Pending>; painted: WeakSet<Element>; openings: WeakMap<Element, Opening> };
function state(): HoldState {
  const shared = window as unknown as Record<symbol, unknown>;
  return (shared[KEY] ??= { active: false, layers: new Set(), next: -1, pending: new Map(), painted: new WeakSet(), openings: new WeakMap() }) as HoldState;
}
function layerOf(target: Element): Element | null { return target.closest('[data-code-codex-particle-layer]'); }

/** Applies only to the main background, never the splash or settings preview. */
export function registerBackgroundOpening(target: Element, opening: Opening): void {
  const layer = layerOf(target);
  if (!layer) return;
  state().openings.set(layer, opening);
  if (state().active) state().layers.add(layer);
  state().painted.delete(layer);
}
export function setStartupBackgroundHold(active: boolean): void {
  const s = state();
  if (s.active === active) return;
  s.active = active;
  runtimeEvent('background-opening', 'startup hold', active ? 'started' : 'released', { pendingFrames: s.pending.size });
  if (active) { s.painted = new WeakSet(); return; }
  const layers = new Set([...s.layers, ...[...s.pending.values()].map(p => p.layer)]);
  s.layers.clear();
  // Reset opening clocks before resuming; wall time spent covered must not advance an intro.
  for (const layer of layers) {
    try { const opening = s.openings.get(layer);
      if (opening?.resumeOpening) opening.resumeOpening(); else opening?.replay?.(); }
    catch (error) { runtimeEvent('background-opening', 'opening reset', 'failed', { reason: String(error) }); }
  }
  for (const [id, p] of s.pending) if (p.native === undefined) schedule(id, p);
  runtimeEvent('background-opening', 'main background opening', 'resumed', { backgrounds: layers.size });
}
function schedule(id: number, p: Pending): void {
  p.native = requestAnimationFrame(now => {
    const s = state(); p.native = undefined;
    if (!s.pending.has(id)) return;
    if (s.active && s.painted.has(p.layer)) return; // Park without repeatedly rendering beneath the splash.
    s.pending.delete(id);
    if (s.active) {
      s.painted.add(p.layer); s.layers.add(p.layer);
      runtimeEvent('background-opening', 'initial frame', 'prepared');
    }
    p.callback(now);
  });
}
export function requestBackgroundFrame(target: Element, callback: FrameRequestCallback): number {
  const layer = layerOf(target);
  if (!layer) return requestAnimationFrame(callback);
  const s = state(), id = s.next--;
  const p: Pending = { layer, callback };
  s.pending.set(id, p);
  schedule(id, p);
  return id;
}
export function cancelBackgroundFrame(id: number): void {
  if (id >= 0) { cancelAnimationFrame(id); return; }
  const s = state(), p = s.pending.get(id);
  if (p?.native !== undefined) cancelAnimationFrame(p.native);
  s.pending.delete(id);
}
