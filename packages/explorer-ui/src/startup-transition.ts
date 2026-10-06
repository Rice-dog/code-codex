import { runtimeEvent } from "./runtime-events";
import { mountStartupBackground } from "./startup-background";
declare const __CODE_CODEX_STARTUP_TRANSITION_CSS__: string;

export interface StartupTransitionOptions {
  target: HTMLElement;
  videoSrc?: string;
  backgroundId?: string;
  clipStart?: number;
  clipEnd?: number;
  playbackRate?: number;
  videoBrightness?: number;
  videoFit?: "cover" | "contain";
  minimumVisiblePercent?: number;
  fadePercent?: number;
  fadeDurationMs?: number;
  fullScreen?: boolean;
  onComplete?: (reason: "ready" | "reduced-motion" | "disposed") => void;
}

export interface StartupTransitionController {
  signalReady(): void;
  markRevealed(): void;
  dispose(): void;
  readonly mediaReady: Promise<void>;
  readonly minimumRemainingMs: number;
  readonly phase: "loading" | "exiting" | "complete";
}


function boundedMs(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

/** The shadow and top layer keep host app and background-plugin rules away from the preview. */
export function mountStartupTransition(options: StartupTransitionOptions): StartupTransitionController {
  const clipMilliseconds = Math.max(100, ((options.clipEnd ?? 5) - (options.clipStart ?? 0)) / (options.playbackRate ?? 1) * 1000);
  const minimumVisibleMs = clipMilliseconds * Math.min(100, boundedMs(options.minimumVisiblePercent, 25)) / 100;
  const exitDurationMs = options.fadeDurationMs === undefined
    ? clipMilliseconds * Math.min(100, boundedMs(options.fadePercent, 15)) / 100
    : Math.min(10000, boundedMs(options.fadeDurationMs, 1000));
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
  let background: ReturnType<typeof mountStartupBackground> | undefined;
  let frame: number | undefined;
  let exitArmed = false;
  let exitStartedAt: number | undefined;
  let exitReason: "ready" = "ready";
  const clipStart = Math.max(0, options.clipStart ?? 0);
  const clipEnd = Math.max(clipStart + 0.1, options.clipEnd ?? Number.POSITIVE_INFINITY);

  let settleMediaReady = () => {};
  const mediaReady = new Promise<void>((resolve) => {
    settleMediaReady = resolve;
    if (options.backgroundId && !reducedMotion) {
      try {
        background = mountStartupBackground(overlay.querySelector<HTMLElement>('.codex-startup__video')!, options.backgroundId, message => {
          if(message) {runtimeEvent('startup-animation','background renderer','failed',{id:options.backgroundId,reason:message});finish('disposed');}
        });
        if(phase === 'complete') { background.dispose(); resolve();return; }
        runtimeEvent('startup-animation','background renderer','preparing',{id:options.backgroundId});
        void Promise.resolve(background.ready).then(() => {
          if (phase !== 'complete') {
            overlay.classList.add('codex-startup--has-video');
            runtimeEvent('startup-animation','background renderer','started',{id:options.backgroundId});
          }
          resolve();
        }, error => {
          if (phase !== 'complete') {
            runtimeEvent('startup-animation','background renderer','failed',{id:options.backgroundId,reason:String(error)});
            finish('disposed');
          }
          resolve();
        });
        return;
      } catch(error) {runtimeEvent('startup-animation','background renderer','failed',{id:options.backgroundId,reason:String(error)});finish('disposed');resolve();return;}
    }
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
      if (phase !== "complete" && currentVideo.currentTime >= Math.min(clipEnd, currentVideo.duration)) currentVideo.currentTime = clipStart;
    });
    currentVideo.addEventListener("ended", () => {
      if (phase === "complete") return;
      currentVideo.currentTime = clipStart; void currentVideo.play().catch(() => { runtimeEvent("startup-animation","video play","failed",{preview:!options.fullScreen,reason:"loop restart rejected"}); finish("disposed"); });
    });
    const tick = () => {
      if (phase === "complete") return;
      if (exitStartedAt !== undefined) {
        const opacity = Math.max(0, 1 - (performance.now() - exitStartedAt) / exitDurationMs);
        overlay.style.opacity = String(opacity);
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
    settleMediaReady();
    clearTimers();
    if (frame !== undefined) cancelAnimationFrame(frame);
    video?.pause();
    background?.dispose();
    video?.removeAttribute("src");
    video?.load();
    if (host.matches(":popover-open")) host.hidePopover();
    host.remove();
    options.onComplete?.(reason);
  }

  function beginExit(reason: "ready"): void {
    if (phase === "complete" || exitArmed) return;
    runtimeEvent("startup-animation", "fade", "armed", {reason,preview:!options.fullScreen,currentVideoTime:video?.currentTime,durationMs:exitDurationMs,minimumVisibleMs});
    if (reducedMotion) { finish("reduced-motion"); return; }
    exitReason = reason;
    if (!background && (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.error)) {
      finish(reason); return;
    }
    if (exitDurationMs === 0) { finish(reason); return; }
    exitArmed = true;
    phase = "exiting";
    exitStartedAt = performance.now();
    overlay.style.transition = background ? `opacity ${exitDurationMs}ms linear` : "none";
    overlay.style.opacity = background ? "0" : "1";
    // Use elapsed time so fade continues across clip loops or a stalled decoder.
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    exitTimer = window.setTimeout(() => finish(reason), exitDurationMs);
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
    runtimeEvent("startup-animation", "readiness exit", remainingMs === 0 ? "starting" : "waiting for minimum", {currentVideoTime:video?.currentTime,remainingMinimumMs:Math.round(remainingMs),fadeDurationMs:exitDurationMs});
    if (remainingMs === 0) beginExit("ready");
    else readyTimer = window.setTimeout(() => beginExit("ready"), remainingMs);
  }

  return {
    signalReady,
    markRevealed,
    dispose: () => finish("disposed"),
    mediaReady,
    get minimumRemainingMs() { return reducedMotion ? 0 : Math.max(0, minimumVisibleMs - (revealedAt === undefined ? 0 : performance.now() - revealedAt)); },
    get phase() { return phase; },
  };
}
