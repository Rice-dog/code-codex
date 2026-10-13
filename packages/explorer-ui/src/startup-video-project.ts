/** Static, bounded two-track project. Times are project/source seconds; no keyframes. */
export interface StartupClip {
  id: string; videoId: string; start: number; in: number; out: number;
  rate: number; scale: number; x: number; y: number; rotation: number;
  opacity: number; blur: number; brightness: number; contrast: number; saturation: number;
  fit: 'cover' | 'contain';
}
export interface StartupVideoProject { version: 1; tracks: [StartupClip[], StartupClip[]] }
export const CLIP_EFFECT_DEFAULTS = { rate: 1, scale: 100, x: 0, y: 0, rotation: 0, opacity: 100, blur: 0, brightness: 100, contrast: 100, saturation: 100, fit: 'contain' as const };
export const CLIP_RANGES = { rate: [.5, 2, .05], scale: [10, 300, 1], x: [-100, 100, 1], y: [-100, 100, 1], rotation: [-180, 180, 1], opacity: [0, 100, 1], blur: [0, 40, .5], brightness: [0, 200, 1], contrast: [0, 200, 1], saturation: [0, 200, 1] } as const;
export function clipDuration(c: StartupClip): number { return (c.out - c.in) / c.rate; }
export function projectDuration(p: StartupVideoProject): number { return Math.max(0, ...p.tracks.flat().map(c => c.start + clipDuration(c))); }
export function projectVideoIds(p: StartupVideoProject): string[] { return [...new Set(p.tracks.flat().map(c => c.videoId))]; }
export function newStartupClip(videoId: string, duration: number, start = 0): StartupClip {
  return { id: crypto.randomUUID(), videoId, start, in: 0, out: Math.min(3600, duration), ...CLIP_EFFECT_DEFAULTS };
}
export function canPlaceClip(track: StartupClip[], c: StartupClip): boolean {
  const end = c.start + clipDuration(c);
  return c.start >= 0 && c.out - c.in >= .05 && end <= 3600 && track.every(other => other.id === c.id || end <= other.start + .001 || c.start >= other.start + clipDuration(other) - .001);
}
export function normalizeStartupProject(value: unknown): StartupVideoProject | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<StartupVideoProject>;
  if (v.version !== 1 || !Array.isArray(v.tracks) || v.tracks.length !== 2) return null;
  const tracks: [StartupClip[], StartupClip[]] = [[], []];
  const ids = new Set<string>();
  const num = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  for (let t = 0; t < 2; t++) {
    if (!Array.isArray(v.tracks[t])) return null;
    for (const raw of v.tracks[t]!.slice(0, 16)) {
      if (!raw || typeof raw !== 'object') continue;
      if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 256 || ids.has(raw.id) || typeof raw.videoId !== 'string' || !raw.videoId || raw.videoId.length > 256) continue;
      const c: StartupClip = { id: raw.id, videoId: raw.videoId, start: num(raw.start, 0, 0, 3600), in: num(raw.in, 0, 0, 3600), out: num(raw.out, 0, 0, 3600), ...CLIP_EFFECT_DEFAULTS };
      for (const key of Object.keys(CLIP_RANGES) as (keyof typeof CLIP_RANGES)[]) c[key] = num(raw[key], CLIP_EFFECT_DEFAULTS[key], CLIP_RANGES[key][0], CLIP_RANGES[key][1]);
      c.fit = raw.fit === 'cover' ? 'cover' : 'contain';
      if (canPlaceClip(tracks[t]!, c)) { tracks[t]!.push(c); ids.add(c.id); }
    }
    tracks[t]!.sort((a, b) => a.start - b.start);
  }
  return { version: 1, tracks };
}
