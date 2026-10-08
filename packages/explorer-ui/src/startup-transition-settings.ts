import { STARTUP_BACKGROUNDS } from './startup-background';

const STORAGE_KEY = "code-codex:startup-transition:v1";

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
  backgroundId: 'particle-image',
  backgroundFadeSeconds: 3,
  minimumVisiblePercent: 45,
  fadePercent: 3,
  clipStart: 29,
  clipEnd: 60.093016,
  playbackRate: 1,
  videoBrightness: 1.4,
  videoFit: "cover",
};

/** Apply the chosen default trim to a known video without creating an empty clip. */
export function startupDefaultClip(duration?: number): Pick<StartupTransitionSettings, "clipStart" | "clipEnd"> {
  const defaults = DEFAULT_STARTUP_TRANSITION_SETTINGS;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    return { clipStart: defaults.clipStart, clipEnd: defaults.clipEnd };
  }
  const span = Math.min(0.1, duration);
  const clipStart = defaults.clipStart >= duration ? 0 : Math.min(defaults.clipStart, duration - span);
  return { clipStart, clipEnd: Math.max(clipStart + span, Math.min(defaults.clipEnd, duration)) };
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function readStartupTransitionSettings(): StartupTransitionSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as (Partial<StartupTransitionSettings> & { minimumVisibleMs?: number; exitDurationMs?: number }) | null;
    if (!saved || typeof saved !== "object") return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
    const defaults = DEFAULT_STARTUP_TRANSITION_SETTINGS;
    const legacyDurationMs = Math.max(100, ((saved.clipEnd ?? defaults.clipEnd) - (saved.clipStart ?? defaults.clipStart)) / (saved.playbackRate ?? defaults.playbackRate) * 1000);
    return {
      enabled: saved.enabled === true,
      source: saved.source === 'background' || saved.source === 'video' ? saved.source : defaults.source,
      backgroundId: STARTUP_BACKGROUNDS.some(([id])=>id===saved.backgroundId) ? saved.backgroundId! : defaults.backgroundId,
      backgroundFadeSeconds: bounded(saved.backgroundFadeSeconds, defaults.backgroundFadeSeconds, 0.1, 10),
      minimumVisiblePercent: bounded(saved.minimumVisiblePercent ?? (typeof saved.minimumVisibleMs === "number" ? saved.minimumVisibleMs / legacyDurationMs * 100 : undefined), defaults.minimumVisiblePercent, 0, 100),
      fadePercent: bounded(saved.fadePercent ?? (typeof saved.exitDurationMs === "number" ? saved.exitDurationMs / legacyDurationMs * 100 : undefined), defaults.fadePercent, 0, 100),
      clipStart: bounded(saved.clipStart, defaults.clipStart, 0, 3600),
      clipEnd: bounded(saved.clipEnd, defaults.clipEnd, 0.1, 3600),
      playbackRate: bounded(saved.playbackRate, defaults.playbackRate, 0.5, 2),
      videoBrightness: bounded(saved.videoBrightness, defaults.videoBrightness, 0.4, 1.4),
      videoFit: saved.videoFit === "contain" || saved.videoFit === "cover" ? saved.videoFit : defaults.videoFit,
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
