import { clipFadeOpacity } from "./startup-transition-timeline";
import { runtimeEvent } from "./runtime-events";
declare const __CODE_CODEX_STARTUP_TRANSITION_CSS__: string;

export interface StartupTransitionOptions {
  target: HTMLElement;
  videoSrc?: string;
  clipStart?: number;
  clipEnd?: number;
  playbackRate?: number;
  videoOpacity?: number;
  videoBrightness?: number;
  videoFit?: "cover" | "contain";
  minimumVisiblePercent?: number;
  fadePercent?: number;
  fullScreen?: boolean;
  onComplete?: (reason: "ready" | "reduced-motion" | "disposed") => void;
}

export interface StartupTransitionController {
  signalReady(): void;
  markRevealed(): void;
  dispose(): void;
  readonly mediaReady: Promise<void>;
  readonly phase: "loading" | "exiting" | "complete";
}


function boundedMs(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

/** The shadow and top layer keep host app and background-plugin rules away from the preview. */
export function mountStartupTransition(options: StartupTransitionOptions): StartupTransitionController {
  const clipMilliseconds = Math.max(100, ((options.clipEnd ?? 5) - (options.clipStart ?? 0)) / (options.playbackRate ?? 1) * 1000);
  const minimumVisibleMs = clipMilliseconds * Math.min(100, boundedMs(options.minimumVisiblePercent, 25)) / 100;
  const exitDurationMs = clipMilliseconds * Math.min(100, boundedMs(options.fadePercent, 15)) / 100;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const host = document.createElement("div");
  host.className = "code-codex-startup-host";
  host.style.cssText = options.fullScreen
    ? "position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;z-index:2147483000;"
    : "position:absolute;inset:0;margin:0;padding:0;border:0;background:transparent;";
  if (options.fullScreen) host.setAttribute("popover", "manual");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = __CODE_CODEX_STARTUP_TRANSITION_CSS__;
  root.append(style);

  const overlay = document.createElement("div");
  overlay.className = `codex-startup${options.fullScreen ? " codex-startup--fullscreen" : " codex-startup--inline"}`;
  overlay.style.setProperty("--codex-startup-exit-ms", `${exitDurationMs}ms`);
  overlay.style.setProperty("--codex-startup-video-opacity", String(options.videoOpacity ?? 0.82));
  overlay.style.setProperty("--codex-startup-video-brightness", String(options.videoBrightness ?? 0.8));
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Codex is starting");
  overlay.innerHTML = `<div class="codex-startup__video" aria-hidden="true"></div>`;
  root.append(overlay);
  options.target.append(host);
  if (options.fullScreen && typeof host.showPopover === "function") {
    try { host.showPopover(); } catch { /* fixed-position fallback */ }
  }

  let phase: "loading" | "exiting" | "complete" = "loading";
  let ready = false;
  let revealedAt: number | undefined;
  let readyTimer: number | undefined;
  let exitTimer: number | undefined;
  let video: HTMLVideoElement | undefined;
  let frame: number | undefined;
  let exitArmed = false;
  let exitReason: "ready" = "ready";
  const clipStart = Math.max(0, options.clipStart ?? 0);
  const clipEnd = Math.max(clipStart + 0.1, options.clipEnd ?? Number.POSITIVE_INFINITY);

  const mediaReady = new Promise<void>((resolve) => {
    if (!options.videoSrc || reducedMotion) { resolve(); return; }
    video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = options.videoSrc;
    video.playbackRate = options.playbackRate ?? 1;
    video.style.objectFit = options.videoFit ?? "cover";
    video.setAttribute("aria-hidden", "true");
    const currentVideo = video;
    let settled = false;
    const finishLoading = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        overlay.classList.add("codex-startup--has-video");
        void currentVideo.play().catch(() => { runtimeEvent("startup-animation","video play","failed",{preview:!options.fullScreen,reason:"play promise rejected"}); finish("disposed"); });
      }
      resolve();
    };
    const timeout = window.setTimeout(finishLoading, 1800);
    currentVideo.addEventListener("loadeddata", finishLoading, { once: true });
    currentVideo.addEventListener("error", () => { runtimeEvent("startup-animation","video decode","failed",{preview:!options.fullScreen,mediaErrorCode:currentVideo.error?.code}); finishLoading(); finish("disposed"); }, { once: true });
    currentVideo.addEventListener("loadedmetadata", () => {
      if (clipStart < currentVideo.duration) currentVideo.currentTime = clipStart;
    }, { once: true });
    currentVideo.addEventListener("timeupdate", () => {
      if (!exitArmed && currentVideo.currentTime >= Math.min(clipEnd, currentVideo.duration)) currentVideo.currentTime = clipStart;
    });
    currentVideo.addEventListener("ended", () => {
      if (exitArmed) finish(exitReason);
      else { currentVideo.currentTime = clipStart; void currentVideo.play().catch(() => { runtimeEvent("startup-animation","video play","failed",{preview:!options.fullScreen,reason:"loop restart rejected"}); finish("disposed"); }); }
    });
    const tick = () => {
      if (phase === "complete") return;
      if (exitArmed && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const end = Math.min(clipEnd, currentVideo.duration);
        const opacity = clipFadeOpacity(currentVideo.currentTime, clipStart, end, exitDurationMs, currentVideo.playbackRate);
        if (opacity < 1) {
          phase = "exiting";
          overlay.style.transition = "none";
          overlay.style.opacity = String(opacity);
        }
        if (opacity === 0) { finish(exitReason); return; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    overlay.querySelector(".codex-startup__video")?.append(currentVideo);
  });

  function clearTimers(): void {
    if (readyTimer !== undefined) window.clearTimeout(readyTimer);
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
  }

  function finish(reason: "ready" | "reduced-motion" | "disposed"): void {
    if (phase === "complete") return;
    runtimeEvent("startup-animation", "player", "finished", {reason,preview:!options.fullScreen});
    phase = "complete";
    clearTimers();
    if (frame !== undefined) cancelAnimationFrame(frame);
    video?.pause();
    video?.removeAttribute("src");
    video?.load();
    if (host.matches(":popover-open")) host.hidePopover();
    host.remove();
    options.onComplete?.(reason);
  }

  function beginExit(reason: "ready"): void {
    if (phase === "complete" || exitArmed) return;
    runtimeEvent("startup-animation", "fade", "armed", {reason,preview:!options.fullScreen});
    if (reducedMotion) { finish("reduced-motion"); return; }
    exitReason = reason;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.error) {
      finish(reason); return;
    }
    exitArmed = true;
    const end = Math.min(clipEnd, video.duration);
    const remaining = Math.max(0, (end - video.currentTime) / video.playbackRate * 1000);
    // A stalled decoder cannot keep the startup layer blocking the app forever.
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    exitTimer = window.setTimeout(() => finish(reason), remaining + 1500);
  }

  function markRevealed(): void {
    if (phase !== "loading" || revealedAt !== undefined) return;
    revealedAt = performance.now();
    if (ready) signalReady();
  }

  function signalReady(): void {
    if (!ready) runtimeEvent("startup-animation", "native readiness", "signalled");
    if (phase !== "loading") return;
    ready = true;
    if (revealedAt === undefined || readyTimer !== undefined) return;
    const remainingMs = reducedMotion ? 0 : Math.max(0, minimumVisibleMs - (performance.now() - revealedAt));
    if (remainingMs === 0) beginExit("ready");
    else readyTimer = window.setTimeout(() => beginExit("ready"), remainingMs);
  }

  return {
    signalReady,
    markRevealed,
    dispose: () => finish("disposed"),
    mediaReady,
    get phase() { return phase; },
  };
}
