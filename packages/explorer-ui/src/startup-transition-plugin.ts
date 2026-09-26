import { loadStartupVideo, type StartupVideo } from "./startup-transition-media";
import { mountStartupTransition, type StartupTransitionController } from "./startup-transition";

const STORAGE_KEY = "code-codex:startup-transition:v1";
const LAUNCH_STATE = Symbol.for("code-codex:startup-transition:launch:v1");
const VISUAL_READY_PROPERTY = "__CODE_CODEX_STARTUP_VISUAL_READY__";

export interface StartupTransitionSettings {
  enabled: boolean;
  minimumVisibleMs: number;
  maximumWaitMs: number;
  exitDurationMs: number;
  clipStart: number;
  clipEnd: number;
  playbackRate: number;
  videoOpacity: number;
  videoBrightness: number;
  videoFit: "cover" | "contain";
}

export const DEFAULT_STARTUP_TRANSITION_SETTINGS: StartupTransitionSettings = {
  enabled: false,
  minimumVisibleMs: 1150,
  maximumWaitMs: 8000,
  exitDurationMs: 760,
  clipStart: 0,
  clipEnd: 5,
  playbackRate: 1,
  videoOpacity: 0.82,
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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StartupTransitionSettings> | null;
    if (!saved || typeof saved !== "object") return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
    return {
      enabled: saved.enabled === true,
      minimumVisibleMs: bounded(saved.minimumVisibleMs, 1150, 0, 15000),
      maximumWaitMs: bounded(saved.maximumWaitMs, 8000, 3000, 30000),
      exitDurationMs: bounded(saved.exitDurationMs, 760, 0, 2000),
      clipStart: bounded(saved.clipStart, 0, 0, 3600),
      clipEnd: bounded(saved.clipEnd, 5, 0.1, 3600),
      playbackRate: bounded(saved.playbackRate, 1, 0.5, 2),
      videoOpacity: bounded(saved.videoOpacity, 0.82, 0.2, 1),
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
    videoOpacity: settings.videoOpacity,
    videoBrightness: settings.videoBrightness,
    videoFit: settings.videoFit,
  };
}

export function previewStartupTransition(
  target: HTMLElement,
  settings = readStartupTransitionSettings(),
  video: StartupVideo | null = null,
): StartupTransitionController {
  const url = video ? URL.createObjectURL(video.blob) : undefined;
  const controller = mountStartupTransition({
    target,
    ...(url ? { videoSrc: url } : {}),
    ...videoOptions(settings, video),
    minimumVisibleMs: settings.minimumVisibleMs,
    maximumWaitMs: settings.maximumWaitMs,
    exitDurationMs: settings.exitDurationMs,
    onComplete: () => { if (url) URL.revokeObjectURL(url); },
  });
  void controller.mediaReady.then(async () => {
    if (!await paintedFrame()) { controller.dispose(); return; }
    controller.markRevealed();
    controller.signalReady();
  });
  return controller;
}

/** Runs once per renderer document; CDP waits for its first painted frame. */
export async function startStartupTransitionOnLaunch(splashActive: boolean): Promise<StartupTransitionController | undefined> {
  const state = window as unknown as Record<PropertyKey, unknown>;
  if (state[LAUNCH_STATE]) return undefined;
  state[LAUNCH_STATE] = true;
  const settings = readStartupTransitionSettings();
  if (!splashActive || !settings.enabled || !document.body) {
    resolveVisualReady?.(false);
    return undefined;
  }
  let url: string | undefined;
  let controller: StartupTransitionController | undefined;
  try {
    const video = await Promise.race([
      loadStartupVideo().catch(() => null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
    ]);
    url = video ? URL.createObjectURL(video.blob) : undefined;
    controller = mountStartupTransition({
      target: document.body,
      fullScreen: true,
      ...(url ? { videoSrc: url } : {}),
      ...videoOptions(settings, video),
      minimumVisibleMs: settings.minimumVisibleMs,
      maximumWaitMs: settings.maximumWaitMs,
      exitDurationMs: settings.exitDurationMs,
      onComplete: () => { if (url) URL.revokeObjectURL(url); },
    });
    await controller.mediaReady;
    if (!await paintedFrame()) {
      controller.dispose();
      resolveVisualReady?.(false);
      return undefined;
    }
    controller.markRevealed();
    resolveVisualReady?.(true);
    return controller;
  } catch {
    if (controller) controller.dispose();
    else if (url) URL.revokeObjectURL(url);
    resolveVisualReady?.(false);
    return undefined;
  }
}
