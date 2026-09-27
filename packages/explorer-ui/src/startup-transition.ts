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
  minimumVisibleMs?: number;
  maximumWaitMs?: number;
  exitDurationMs?: number;
  fullScreen?: boolean;
  onComplete?: (reason: "ready" | "timeout" | "reduced-motion" | "disposed") => void;
}

export interface StartupTransitionController {
  signalReady(): void;
  markRevealed(): void;
  dispose(): void;
  readonly mediaReady: Promise<void>;
  readonly phase: "loading" | "exiting" | "complete";
}

const DEFAULT_MINIMUM_MS = 1150;
const DEFAULT_MAXIMUM_MS = 8000;
const DEFAULT_EXIT_MS = 760;

function boundedMs(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback;
}

/** The shadow and top layer keep host app and background-plugin rules away from the preview. */
export function mountStartupTransition(options: StartupTransitionOptions): StartupTransitionController {
  const minimumVisibleMs = boundedMs(options.minimumVisibleMs, DEFAULT_MINIMUM_MS);
  const maximumWaitMs = Math.max(minimumVisibleMs, boundedMs(options.maximumWaitMs, DEFAULT_MAXIMUM_MS));
  const exitDurationMs = boundedMs(options.exitDurationMs, DEFAULT_EXIT_MS);
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
  overlay.innerHTML = `
    <div class="codex-startup__video" aria-hidden="true"></div>
    <div class="codex-startup__grid" aria-hidden="true"></div>
    <div class="codex-startup__glow" aria-hidden="true"></div>
    <div class="codex-startup__rail" aria-hidden="true"><span>INITIALIZING WORKSPACE</span><span>001 / 001</span></div>
    <div class="codex-startup__center">
      <div class="codex-startup__symbol" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="codex-startup__wordmark">CODEX<span class="codex-startup__period">.</span></div>
      <div class="codex-startup__subtitle">YOUR WORKSPACE IS COMING INTO FOCUS</div>
    </div>
    <div class="codex-startup__foot" aria-hidden="true"><span class="codex-startup__footline"></span><span>READY WHEN YOU ARE</span></div>
  `;
  root.append(overlay);
  options.target.append(host);
  if (options.fullScreen && typeof host.showPopover === "function") {
    try { host.showPopover(); } catch { /* fixed-position fallback */ }
  }

  let phase: "loading" | "exiting" | "complete" = "loading";
  let ready = false;
  let revealedAt: number | undefined;
  let readyTimer: number | undefined;
  let timeoutTimer: number | undefined;
  let exitTimer: number | undefined;
  let video: HTMLVideoElement | undefined;
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
        void currentVideo.play().catch(() => overlay.classList.remove("codex-startup--has-video"));
      }
      resolve();
    };
    const timeout = window.setTimeout(finishLoading, 1800);
    currentVideo.addEventListener("loadeddata", finishLoading, { once: true });
    currentVideo.addEventListener("error", finishLoading, { once: true });
    currentVideo.addEventListener("loadedmetadata", () => {
      if (clipStart < currentVideo.duration) currentVideo.currentTime = clipStart;
    }, { once: true });
    currentVideo.addEventListener("timeupdate", () => {
      if (currentVideo.currentTime >= Math.min(clipEnd, currentVideo.duration)) currentVideo.currentTime = clipStart;
    });
    currentVideo.addEventListener("ended", () => { currentVideo.currentTime = clipStart; void currentVideo.play(); });
    overlay.querySelector(".codex-startup__video")?.append(currentVideo);
  });

  function clearTimers(): void {
    if (readyTimer !== undefined) window.clearTimeout(readyTimer);
    if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
    if (exitTimer !== undefined) window.clearTimeout(exitTimer);
  }

  function finish(reason: "ready" | "timeout" | "reduced-motion" | "disposed"): void {
    if (phase === "complete") return;
    phase = "complete";
    clearTimers();
    video?.pause();
    video?.removeAttribute("src");
    video?.load();
    if (host.matches(":popover-open")) host.hidePopover();
    host.remove();
    options.onComplete?.(reason);
  }

  function beginExit(reason: "ready" | "timeout"): void {
    if (phase !== "loading") return;
    if (reducedMotion) { finish("reduced-motion"); return; }
    phase = "exiting";
    overlay.classList.add("codex-startup--exiting");
    overlay.setAttribute("aria-hidden", "true");
    if (exitDurationMs === 0) finish(reason);
    else exitTimer = window.setTimeout(() => finish(reason), exitDurationMs);
  }

  function markRevealed(): void {
    if (phase !== "loading" || revealedAt !== undefined) return;
    revealedAt = performance.now();
    timeoutTimer = window.setTimeout(() => beginExit("timeout"), maximumWaitMs);
    if (ready) signalReady();
  }

  function signalReady(): void {
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
