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
  videoFit: "cover" | "contain" | "cinema";
  selectedVideoId: string;
  videoOrder: string[];
  playbackMode: "fixed" | "sequence" | "random";
  nextVideoId: string;
  lastPlayedVideoId: string;
  videoProfiles: Record<string, StartupVideoProfile>;
}

export type StartupVideoProfile = Pick<StartupTransitionSettings, "clipStart" | "clipEnd" | "playbackRate" | "videoBrightness" | "videoFit" | "minimumVisiblePercent" | "fadePercent">;
export function startupVideoProfile(s: StartupTransitionSettings): StartupVideoProfile {
  return {clipStart:s.clipStart,clipEnd:s.clipEnd,playbackRate:s.playbackRate,videoBrightness:s.videoBrightness,videoFit:s.videoFit,minimumVisiblePercent:s.minimumVisiblePercent,fadePercent:s.fadePercent};
}
export function startupPlaybackVideoId(s: StartupTransitionSettings): string {
  return s.playbackMode === "fixed" ? s.selectedVideoId : s.nextVideoId || s.selectedVideoId;
}
export function settingsForStartupVideo(s: StartupTransitionSettings, id: string, duration: number): StartupTransitionSettings {
  const profile = s.videoProfiles[id] ?? (id === s.selectedVideoId ? startupVideoProfile(s) : {...startupVideoProfile(s),...startupDefaultClip(duration)});
  return {...s,...profile,selectedVideoId:id};
}
export function advanceStartupVideo(s: StartupTransitionSettings, played: string): StartupTransitionSettings {
  const ids=s.videoOrder;
  const others=ids.filter(id=>id!==played);
  const next=s.playbackMode === "sequence" ? ids[(Math.max(0,ids.indexOf(played))+1)%ids.length]
    : s.playbackMode === "random" ? others[Math.floor(Math.random()*others.length)] : s.selectedVideoId;
  return {...s,lastPlayedVideoId:played,nextVideoId:next || played};
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
  selectedVideoId: "selected", videoOrder: [], playbackMode: "sequence", nextVideoId: "selected", lastPlayedVideoId: "", videoProfiles: {},
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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as (Partial<StartupTransitionSettings> & { minimumVisibleMs?: number; exitDurationMs?: number; advancedOptions?: boolean; project?: {version?:number} }) | null;
    if (!saved || typeof saved !== "object") return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
    const defaults = DEFAULT_STARTUP_TRANSITION_SETTINGS;
    const legacyDurationMs = Math.max(100, ((saved.clipEnd ?? defaults.clipEnd) - (saved.clipStart ?? defaults.clipStart)) / (saved.playbackRate ?? defaults.playbackRate) * 1000);
    // Retired advanced preferences must not overwrite the original basic profile.
    const profiles=normalizeProfiles(saved.videoProfiles);
    if(saved.advancedOptions===true || (saved.advancedOptions===undefined&&saved.project?.version===1)){
      const profile=profiles[saved.selectedVideoId??'selected']??startupVideoProfile(defaults);
      Object.assign(saved,profile);
    }
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
      videoFit: ["contain", "cover", "cinema"].includes(saved.videoFit ?? "") ? saved.videoFit! : defaults.videoFit,
      selectedVideoId: typeof saved.selectedVideoId === "string" && saved.selectedVideoId.length <= 256 ? saved.selectedVideoId : "selected",
      videoOrder: Array.isArray(saved.videoOrder) ? [...new Set(saved.videoOrder.filter((id): id is string=>typeof id === "string" && id.length>0 && id.length<=256))].slice(0,32) : [],
      playbackMode: "sequence",
      nextVideoId: typeof saved.nextVideoId === "string" && saved.nextVideoId.length<=256 ? saved.nextVideoId : "selected",
      lastPlayedVideoId: typeof saved.lastPlayedVideoId === "string" && saved.lastPlayedVideoId.length<=256 ? saved.lastPlayedVideoId : "",
      videoProfiles: normalizeProfiles(saved.videoProfiles),
    };
  } catch {
    return { ...DEFAULT_STARTUP_TRANSITION_SETTINGS };
  }
}

export function writeStartupTransitionSettings(settings: StartupTransitionSettings): boolean {
  try {
    const profiles = {...settings.videoProfiles};
    if (settings.selectedVideoId) profiles[settings.selectedVideoId] = startupVideoProfile(settings);
    for(const id of Object.keys(profiles))if(id!==settings.selectedVideoId&&!settings.videoOrder.includes(id))delete profiles[id];
    const {enabled,source,backgroundId,backgroundFadeSeconds,minimumVisiblePercent,fadePercent,clipStart,clipEnd,playbackRate,videoBrightness,videoFit,selectedVideoId,videoOrder,nextVideoId,lastPlayedVideoId}=settings;
    localStorage.setItem(STORAGE_KEY,JSON.stringify({enabled,source,backgroundId,backgroundFadeSeconds,minimumVisiblePercent,fadePercent,clipStart,clipEnd,playbackRate,videoBrightness,videoFit,selectedVideoId,videoOrder,playbackMode:'sequence',nextVideoId,lastPlayedVideoId,videoProfiles:profiles}));
    return true;
  } catch {
    return false;
  }
}

function normalizeProfiles(value: unknown): Record<string, StartupVideoProfile> {
  const result: Record<string, StartupVideoProfile> = Object.create(null);
  if (!value || typeof value !== "object") return result;
  for(const [id,p] of Object.entries(value).slice(0,32)) {
    if(!id || id.length>256 || !p || typeof p!=="object") continue;
    const v=p as Partial<StartupVideoProfile>, d=DEFAULT_STARTUP_TRANSITION_SETTINGS;
    result[id]={clipStart:bounded(v.clipStart,d.clipStart,0,3600),clipEnd:bounded(v.clipEnd,d.clipEnd,.1,3600),playbackRate:bounded(v.playbackRate,d.playbackRate,.5,2),videoBrightness:bounded(v.videoBrightness,d.videoBrightness,.4,1.4),minimumVisiblePercent:bounded(v.minimumVisiblePercent,d.minimumVisiblePercent,0,100),fadePercent:bounded(v.fadePercent,d.fadePercent,0,100),videoFit:v.videoFit==="contain"||v.videoFit==="cinema"?v.videoFit:"cover"};
  }
  return result;
}
