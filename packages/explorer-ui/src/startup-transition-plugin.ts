import { setStartupBackgroundHold } from './background-startup-hold';
import { monitorStartupReadiness, startupContentVisible } from './startup-readiness';
import { loadStartupVideo, type StartupVideo } from "./startup-transition-media";
import { runtimeEvent } from "./runtime-events";
import { mountStartupTransition, type StartupTransitionController } from "./startup-transition";
import { STARTUP_BACKGROUNDS } from './startup-background';

const STORAGE_KEY = "code-codex:startup-transition:v1";
const LAUNCH_STATE = Symbol.for("code-codex:startup-transition:launch:v1");
const CONTROLLER_STATE = Symbol.for("code-codex:startup-transition:controller:v1");
const VISUAL_READY_PROPERTY = "__CODE_CODEX_STARTUP_VISUAL_READY__";

export interface StartupTransitionSettings {
  enabled: boolean;
  source: 'video' | 'background';
  backgroundId: string;
  backgroundFadeSeconds: number;
  minimumVisiblePercent: number;
  fadePercent: number;
  clipStart: number;
  clipEnd: number;
  playbackRate: number;
  videoBrightness: number;
  videoFit: "cover" | "contain";
}

export const DEFAULT_STARTUP_TRANSITION_SETTINGS: StartupTransitionSettings = {
  enabled: false,
  source: 'video',
  backgroundId: 'glow-horizon',
  backgroundFadeSeconds: 1,
  minimumVisiblePercent: 25,
  fadePercent: 15,
  clipStart: 0,
  clipEnd: 5,
  playbackRate: 1,
  videoBrightness: 0.8,
  videoFit: "cover",
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function readStartupTransitionSettings(): StartupTransitionSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as (Partial<StartupTransitionSettings> & { minimumVisibleMs?: number; exitDurationMs?: number }) | null;
    if (!saved || typeof saved !== "object") return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
    return {
      enabled: saved.enabled === true,
      source: saved.source === 'background' ? 'background' : 'video',
      backgroundId: STARTUP_BACKGROUNDS.some(([id])=>id===saved.backgroundId) ? saved.backgroundId! : 'glow-horizon',
      backgroundFadeSeconds: bounded(saved.backgroundFadeSeconds, 1, 0.1, 10),
      minimumVisiblePercent: bounded(saved.minimumVisiblePercent ?? (typeof saved.minimumVisibleMs === "number" ? saved.minimumVisibleMs / Math.max(100, ((saved.clipEnd ?? 5) - (saved.clipStart ?? 0)) / (saved.playbackRate ?? 1) * 1000) * 100 : undefined), 25, 0, 100),
      fadePercent: bounded(saved.fadePercent ?? (typeof saved.exitDurationMs === "number" ? saved.exitDurationMs / Math.max(100, ((saved.clipEnd ?? 5) - (saved.clipStart ?? 0)) / (saved.playbackRate ?? 1) * 1000) * 100 : undefined), 15, 0, 100),
      clipStart: bounded(saved.clipStart, 0, 0, 3600),
      clipEnd: bounded(saved.clipEnd, 5, 0.1, 3600),
      playbackRate: bounded(saved.playbackRate, 1, 0.5, 2),
      videoBrightness: bounded(saved.videoBrightness, 0.8, 0.4, 1.4),
      videoFit: saved.videoFit === "contain" ? "contain" : "cover",
    };
  } catch {
    return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
  }
}

export function writeStartupTransitionSettings(settings: StartupTransitionSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

let resolveVisualReady: ((ready: boolean) => void) | undefined;

export function prepareStartupTransitionHandoff(splashActive: boolean): void {
  if (!splashActive) return;
  const state = window as unknown as Record<string, unknown>;
  if (state[VISUAL_READY_PROPERTY]) return;
  state[VISUAL_READY_PROPERTY] = new Promise<boolean>((resolve) => { resolveVisualReady = resolve; });
}

function paintedFrame(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (painted: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(painted);
    };
    const timeout = window.setTimeout(() => finish(false), 1200);
    requestAnimationFrame(() => requestAnimationFrame(() => finish(true)));
  });
}

function videoOptions(settings: StartupTransitionSettings, video: StartupVideo | null) {
  return {
    clipStart: Math.min(settings.clipStart, Math.max(0, (video?.duration ?? 0) - 0.1)),
    clipEnd: Math.min(settings.clipEnd, video?.duration ?? settings.clipEnd),
    playbackRate: settings.playbackRate,
    videoBrightness: settings.videoBrightness,
    videoFit: settings.videoFit,
  };
}

/** Runs once per renderer document; CDP waits for its first painted frame. */
export async function startStartupTransitionOnLaunch(splashActive: boolean, loadingOnly = false): Promise<StartupTransitionController | undefined> {
  const state = window as unknown as Record<PropertyKey, unknown>;
  if (state[LAUNCH_STATE]) return getStartupTransitionController();
  state[LAUNCH_STATE] = true;
  const settings = readStartupTransitionSettings();
  if (!splashActive || !settings.enabled || !document.body) {
    runtimeEvent("startup-animation", "launch playback", "skipped", {reason:!settings.enabled ? "plugin disabled" : !splashActive ? "startup animation not requested" : "document body missing"});
    resolveVisualReady?.(false);
    return undefined;
  }
  setStartupBackgroundHold(true);
  let url: string | undefined;
  let controller: StartupTransitionController | undefined;
  try {
    runtimeEvent('startup-animation','source','selected',{source:settings.source,backgroundId:settings.source==='background'?settings.backgroundId:null});
    if(settings.source === 'background') {
      if(loadingOnly&&startupDocumentReady()) {resolveVisualReady?.(false);return undefined;}
      controller=mountStartupTransition({target:document.body,fullScreen:true,backgroundId:settings.backgroundId,clipStart:0,clipEnd:4,playbackRate:1,minimumVisiblePercent:100,fadeDurationMs:settings.backgroundFadeSeconds*1000,onComplete:()=>setStartupBackgroundHold(false)});
    } else {
    runtimeEvent("startup-animation","video lookup","started",{timeoutMs:10000,loadingOnly,enabled:settings.enabled});
    let lookupReason = "no stored video";
    let lookupTimer: number | undefined;
    const video = await Promise.race([
      loadStartupVideo().catch(error => { lookupReason=error instanceof Error ? `storage error: ${error.name}: ${error.message}` : `storage error: ${String(error)}`;return null; }),
      new Promise<null>((resolve) => { lookupTimer=window.setTimeout(() => {lookupReason="video lookup exceeded 10000 ms";resolve(null);},10000); }),
    ]);
    if (lookupTimer!==undefined) clearTimeout(lookupTimer);
    if (!video) { runtimeEvent("startup-animation","video lookup","failed",{reason:lookupReason}); resolveVisualReady?.(false); return undefined; }
    runtimeEvent("startup-animation","video lookup","passed",{bytes:video.blob.size,duration:video.duration,clipStart:settings.clipStart,clipEnd:settings.clipEnd,playbackRate:settings.playbackRate,minimumVisiblePercent:settings.minimumVisiblePercent,fadePercent:settings.fadePercent});
    if (loadingOnly && startupDocumentReady()) { runtimeEvent("startup-animation","launch playback","skipped",{reason:"native document already ready"}); resolveVisualReady?.(false); return undefined; }
    url = URL.createObjectURL(video.blob);
    controller = mountStartupTransition({
      target: document.body,
      fullScreen: true,
      ...(url ? { videoSrc: url } : {}),
      ...videoOptions(settings, video),
      minimumVisiblePercent: settings.minimumVisiblePercent,
      fadePercent: settings.fadePercent,
      onComplete: () => { setStartupBackgroundHold(false); if (url) URL.revokeObjectURL(url); },
    });
    }
    state[CONTROLLER_STATE] = controller;
    await controller.mediaReady;
    if (controller.phase === "complete") {
      runtimeEvent("startup-animation","video media","failed",{reason:"player ended before reveal; inspect player error or disposal events"});
      resolveVisualReady?.(false);
      return undefined;
    }
    runtimeEvent("startup-animation","video media","ready",{phase:controller.phase});
    if (!await paintedFrame()) {
      runtimeEvent("startup-animation","first painted frame","failed",{reason:"document visibility or painted-frame wait timed out"});
      controller.dispose();
      resolveVisualReady?.(false);
      return undefined;
    }
    controller.markRevealed();
    runtimeEvent("startup-animation","first painted frame","revealed",{phase:controller.phase});
    resolveVisualReady?.(true);
    return controller;
  } catch(error) {
    runtimeEvent("startup-animation","launch playback","failed",{reason:error instanceof Error ? `${error.name}: ${error.message}` : String(error)});
    if (controller) controller.dispose();
    else if (url) URL.revokeObjectURL(url);
    resolveVisualReady?.(false);
    return undefined;
  } finally {
    if (!controller || controller.phase === "complete") setStartupBackgroundHold(false);
  }
}

/** Shared with the early, bridge-free loading-page bundle. */
export function getStartupTransitionController(): StartupTransitionController | undefined {
  return (window as unknown as Record<PropertyKey, unknown>)[CONTROLLER_STATE] as StartupTransitionController | undefined;
}

export function startEarlyStartupTransition(): Promise<StartupTransitionController | undefined> {
  const state = window as unknown as Record<PropertyKey, unknown>;
  const pendingKey = Symbol.for("code-codex:startup-transition:early-promise:v1");
  if (state[pendingKey]) return state[pendingKey] as Promise<StartupTransitionController | undefined>;
  if (startupDocumentReady()) return Promise.resolve(undefined);
  prepareStartupTransitionHandoff(true);
  const pending = startStartupTransitionOnLaunch(true, true).then(controller => {
    if (!controller) return undefined;
    monitorStartupReadiness(controller);
    return controller;
  });
  state[pendingKey] = pending;
  return pending;
}

export function getEarlyStartupTransition(): Promise<StartupTransitionController | undefined> {
  return (window as unknown as Record<PropertyKey, unknown>)[Symbol.for("code-codex:startup-transition:early-promise:v1")] as Promise<StartupTransitionController | undefined>
    ?? Promise.resolve(getStartupTransitionController());
}

export function startupDocumentReady(): boolean {
  return document.readyState === 'complete' && startupContentVisible();
}
