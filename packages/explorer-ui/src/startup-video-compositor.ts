import { clipDuration, projectDuration, type StartupVideoProject, type StartupClip } from './startup-video-project';
import type { StartupVideo } from './startup-transition-media';

/** Preview and startup share the same timeline clock and two independent decoders. */
export function mountStartupVideoComposition(target: HTMLElement, initial: StartupVideoProject, media: StartupVideo[], options: {
  loop?: boolean; onTime?: (time: number, playing: boolean) => void; onError?: (message: string, clip?: StartupClip) => void;
} = {}) {
  let project = initial, time = 0, playing = false, disposed = false, frame = 0, anchor = 0, anchorTime = 0;
  const urls = new Map<string, string>();
  const byId = new Map(media.map(v => [v.id, v]));
  const abort = new AbortController();
  const surface = document.createElement('div');
  surface.className = 'startup-composition';
  surface.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#000;isolation:isolate;';
  const layers = [0, 1].map(track => {
    const layer = document.createElement('div');
    layer.style.cssText = `position:absolute;inset:0;overflow:visible;z-index:${track};pointer-events:none;`;
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.dataset.track = `V${track + 1}`;
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none;';
    layer.append(video); surface.append(layer);
    return { layer, video, clip: undefined as StartupClip | undefined, source: '', wanted: 0 };
  });
  target.append(surface);
  let resolveReady = () => {};
  const mediaReady = new Promise<void>(resolve => { resolveReady = resolve; });
  let readySettled = false;
  const settle = () => { if (!readySettled) { readySettled = true; clearTimeout(timeout); resolveReady(); } };
  const timeout = window.setTimeout(() => { fail('Video frames did not become ready within 8 seconds.'); }, 8000);
  function fail(message: string, clip?: StartupClip) { if (disposed) return; pause(); settle(); options.onError?.(message, clip); }
  function sourceUrl(id: string) {
    if (!urls.has(id)) { const m = byId.get(id); if (m) urls.set(id, URL.createObjectURL(m.blob)); }
    return urls.get(id);
  }
  function checkReady() {
    if (layers.every(l => !l.clip || (l.video.readyState >= 2 && !l.video.seeking && Math.abs(l.video.currentTime - l.wanted) < .2))) settle();
  }
  for (const state of layers) {
    const { video } = state;
    video.addEventListener('loadedmetadata', () => {
      if (state.clip && state.clip.out > video.duration + .05) { fail('Clip exceeds its source duration.', state.clip); return; }
      try { video.currentTime = Math.min(state.wanted, Math.max(0, video.duration - .001)); } catch { /* loadeddata will retry */ }
    }, { signal: abort.signal });
    video.addEventListener('loadeddata', () => { sync(); checkReady(); }, { signal: abort.signal });
    video.addEventListener('seeked', () => { sync(); checkReady(); }, { signal: abort.signal });
    video.addEventListener('error', () => fail(`Video decode failed (media code ${video.error?.code ?? 'unknown'}).`, state.clip), { signal: abort.signal });
  }
  function sync() {
    const probe = Math.min(time, Math.max(0, projectDuration(project) - .001));
    for (let track = 0; track < 2; track++) {
      const state = layers[track]!;
      const c = project.tracks[track]!.find(c => probe >= c.start && probe < c.start + clipDuration(c));
      state.layer.hidden = !c; state.clip = c;
      if (!c) { state.video.pause(); continue; }
      state.wanted = c.in + Math.max(0, probe - c.start) * c.rate;
      const url = sourceUrl(c.videoId);
      if (!url) { fail(`Missing local video ${c.videoId}.`, c); return; }
      if (state.source !== c.videoId) { state.video.pause(); state.source = c.videoId; state.video.src = url; state.video.load(); }
      state.video.playbackRate = c.rate;
      state.video.style.objectFit = c.fit;
      state.video.style.transform = `translate(${c.x}%,${c.y}%) rotate(${c.rotation}deg) scale(${c.scale / 100})`;
      state.video.style.filter = `blur(${c.blur * Math.max(1, surface.clientWidth) / 1280}px) brightness(${c.brightness / 100}) contrast(${c.contrast / 100}) saturate(${c.saturation / 100})`;
      state.layer.style.opacity = String(c.opacity / 100);
      if (state.video.readyState >= 1 && !state.video.seeking && Math.abs(state.video.currentTime - state.wanted) > (playing ? .15 : .002)) {
        state.video.currentTime = Math.min(state.wanted, Math.max(0, state.video.duration - .001));
      }
      if (playing && state.video.paused && state.video.readyState >= 2) void state.video.play().catch(e => fail(`Video play rejected: ${String(e)}`, c));
      if (!playing) state.video.pause();
    }
    options.onTime?.(time, playing);
  }
  function tick(now: number) {
    if (!playing || disposed) return;
    time = anchorTime + (now - anchor) / 1000;
    const duration = projectDuration(project);
    if (time >= duration) {
      if (options.loop && duration > 0) { time %= duration; anchorTime = time; anchor = now; }
      else { time = duration; pause(); sync(); return; }
    }
    sync(); frame = requestAnimationFrame(tick);
  }
  function pause() { playing = false; cancelAnimationFrame(frame); layers.forEach(l => l.video.pause()); options.onTime?.(time, false); }
  function play() {
    if (disposed || !projectDuration(project)) return;
    if (time >= projectDuration(project)) time = 0;
    playing = true; anchorTime = time; anchor = performance.now(); sync(); cancelAnimationFrame(frame); frame = requestAnimationFrame(tick);
  }
  function seek(value: number) { time = Math.max(0, Math.min(projectDuration(project), value)); anchorTime = time; anchor = performance.now(); sync(); }
  const resize = new ResizeObserver(sync); resize.observe(surface);
  sync(); checkReady();
  return {
    mediaReady, surface, play, pause, seek,
    get time() { return time; }, get playing() { return playing; },
    update(next: StartupVideoProject) { project = next; seek(time); },
    dispose() { if (disposed) return; disposed = true; pause(); settle(); abort.abort(); resize.disconnect(); layers.forEach(l => { l.video.removeAttribute('src'); l.video.load(); }); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); surface.remove(); },
  };
}
