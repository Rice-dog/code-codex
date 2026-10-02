import type { StartupVideo } from "./startup-transition-media";
import type { StartupTransitionSettings } from "./startup-transition-plugin";

const MIN_CLIP_SECONDS = 0.1;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatTimelineTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const remaining = tenths - minutes * 600;
  return `${minutes}:${String(Math.floor(remaining / 10)).padStart(2, "0")}.${remaining % 10}`;
}

export function startupTimelineGeometry(settings: StartupTransitionSettings, videoDuration: number) {
  const duration = Number.isFinite(videoDuration) ? Math.max(MIN_CLIP_SECONDS, videoDuration) : 5;
  const clipStart = clamp(settings.clipStart, 0, duration - MIN_CLIP_SECONDS);
  const clipEnd = clamp(settings.clipEnd, clipStart + MIN_CLIP_SECONDS, duration);
  const clipPlaybackSeconds = (clipEnd - clipStart) / settings.playbackRate;
  const timingEndMs = clipPlaybackSeconds * 1000;
  const fadeMs = settings.fadePercent / 100 * timingEndMs;
  return {
    duration,
    clipStart,
    clipEnd,
    clipPlaybackSeconds,
    fadeMs,
    startPercent: clipStart / duration * 100,
    endPercent: clipEnd / duration * 100,
    minimumPercent: clamp(settings.minimumVisiblePercent, 0, 100),
    earliestFadePercent: (timingEndMs - fadeMs) / timingEndMs * 100,
    earliestFadeEndPercent: 100,
  };
}

export function moveTimelineBoundary(
  edge: "start" | "end",
  rawSeconds: number,
  settings: StartupTransitionSettings,
  duration: number,
): Pick<StartupTransitionSettings, "clipStart" | "clipEnd"> {
  const geometry = startupTimelineGeometry(settings, duration);
  const rounded = Math.round(rawSeconds * 10) / 10;
  return edge === "start"
    ? { clipStart: clamp(rounded, 0, geometry.clipEnd - MIN_CLIP_SECONDS), clipEnd: geometry.clipEnd }
    : { clipStart: geometry.clipStart, clipEnd: clamp(rounded, geometry.clipStart + MIN_CLIP_SECONDS, geometry.duration) };
}

function waitForVideo(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked", signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, complete);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", fail);
    };
    const complete = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Video thumbnails are unavailable")); };
    const timeout = window.setTimeout(fail, 4000);
    video.addEventListener(eventName, complete, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", fail, { once: true });
    if (signal.aborted) fail();
  });
}

/** Samples a few local frames for the editor strip; no image leaves this computer. */
export async function sampleStartupVideoFrames(video: StartupVideo, signal: AbortSignal, count = 7): Promise<string[]> {
  const source = URL.createObjectURL(video.blob);
  const player = document.createElement("video");
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) { URL.revokeObjectURL(source); return []; }
  player.muted = true;
  player.playsInline = true;
  player.preload = "auto";
  try {
    const metadata = waitForVideo(player, "loadedmetadata", signal);
    player.src = source;
    await metadata;
    const frames: string[] = [];
    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) break;
      const time = Math.min(video.duration - 0.05, video.duration * ((index + 0.5) / count));
      const seeked = waitForVideo(player, "seeked", signal);
      player.currentTime = time;
      await seeked;
      const sourceWidth = player.videoWidth;
      const sourceHeight = player.videoHeight;
      if (!sourceWidth || !sourceHeight) continue;
      const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      context.drawImage(player, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      frames.push(canvas.toDataURL("image/jpeg", 0.68));
    }
    return frames;
  } finally {
    player.removeAttribute("src");
    player.load();
    URL.revokeObjectURL(source);
  }
}

/** The fade occupies the tail of the selected clip, measured in playback seconds. */
export function clipFadeOpacity(time: number, start: number, end: number, fadeMs: number, rate: number): number {
  const span = Math.min(Math.max(0, end - start), Math.max(0, fadeMs) / 1000 * rate);
  if (time >= end - 0.01) return 0;
  return span > 0 ? clamp((end - time) / span, 0, 1) : 1;
}
