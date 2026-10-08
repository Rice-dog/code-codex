import { runtimeEvent } from './runtime-events';
import type { StartupTransitionController } from './startup-transition';

const READINESS_MONITOR = Symbol.for('code-codex:startup-readiness-monitor:v1');
const STABLE_MS = 1000;
const MAX_FRAME_GAP_MS = 80;

function visible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function nativeContent(): { painted: boolean; kind: string; shell: boolean } {
  const login = document.querySelector('div.flex.h-full.w-full.items-center.justify-center.overflow-hidden.bg-surface');
  if (visible(login) && visible(login.querySelector('button:not(:disabled)'))) return { painted: true, kind: 'sign-in', shell: true };
  const main = document.querySelector('main:is(.main-surface, [data-app-shell-main-surface="default"])');
  const navigation = document.querySelector('nav[data-app-navigation-rail], [data-app-shell-sidebar-trigger], aside.app-shell-left-panel');
  const shell = visible(main) && !!navigation;
  const content = main?.querySelector('form, [data-composer-layout], [contenteditable="true"], [data-response-annotation-conversation], [data-app-action-timeline-scroll]');
  const busy = main?.querySelector('[data-app-startup-loading], [data-app-shell-loading], [data-app-initializing="true"]');
  return { painted: shell && visible(content ?? null) && !busy, kind: 'main-content', shell };
}

export function startupContentVisible(): boolean { return nativeContent().painted; }

/** Read-only readiness evidence. It does not alter or report readiness to official Codex. */
export function monitorStartupReadiness(controller: StartupTransitionController): void {
  const state = window as unknown as Record<symbol, unknown>;
  if (state[READINESS_MONITOR]) return;
  state[READINESS_MONITOR] = true;
  const started = performance.now();
  let stableSince: number | undefined;
  let lastFrame = started;
  let frames = 0;
  let resets = 0;
  let maxGap = 0;
  let nextReport = started + 5000;
  let lastState = '';
  let fallbackReported = false;
  let frame = 0;
  let taskObserver: PerformanceObserver | undefined;
  let pendingLongTask = false;
  let candidateSince: number | undefined;
  const dispose = () => { cancelAnimationFrame(frame); taskObserver?.disconnect(); };
  runtimeEvent('startup-animation', 'readiness monitor', 'started', {
    strategy: 'visible native Codex content plus stable painted frames', stableMs: STABLE_MS,
    maxFrameGapMs: MAX_FRAME_GAP_MS, officialPhaseDirectlyReadable: false,
    officialPhaseFallback: 'internal first_content_visible state is not exposed by the current renderer exports',
    contentFallbackMs: 60000, stabilityFallbackMs: 15000,
  });
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    taskObserver = new PerformanceObserver(list => {
      const tasks = list.getEntries().filter(entry => entry.duration >= 50);
      if (!tasks.length) return;
      pendingLongTask ||= tasks.some(task => task.duration > MAX_FRAME_GAP_MS);
      runtimeEvent('startup-animation', 'readiness long task', 'observed', {
        count: tasks.length, longestMs: Math.round(Math.max(...tasks.map(task => task.duration))),
      });
    });
    taskObserver.observe({ type: 'longtask' });
  }
  const tick = (now: number) => {
    if (controller.phase !== 'loading') { dispose(); return; }
    const gap = now - lastFrame; lastFrame = now; maxGap = Math.max(maxGap, gap);
    const content = nativeContent();
    const elapsed = now - started;
    const contentFallback = elapsed >= 60000 && content.shell;
    const candidate = document.visibilityState === 'visible' && document.readyState === 'complete'
      && (content.painted || contentFallback);
    if (candidate) candidateSince ??= now; else candidateSince = undefined;
    const currentState = `${content.painted}:${candidate}`;
    if (currentState !== lastState) {
      runtimeEvent('startup-animation', 'readiness evidence', 'changed', {
        elapsedMs: Math.round(elapsed), contentVisible: content.painted, contentKind: content.kind,
        documentState: document.readyState, documentVisible: document.visibilityState === 'visible',
      });
      lastState = currentState;
    }
    if (contentFallback && !fallbackReported) {
      runtimeEvent('startup-animation', 'readiness fallback', 'used', {
        reason: 'native content selector unavailable; using visible shell and stable frames',
        elapsedMs: Math.round(elapsed),
      });
      fallbackReported = true;
    }
    if (!candidate || gap > MAX_FRAME_GAP_MS || pendingLongTask) {
      if (stableSince !== undefined) {
        resets++;
        runtimeEvent('startup-animation', 'readiness stability', 'reset', {
          reason: !candidate ? 'readiness evidence changed' : pendingLongTask ? 'main thread long task' : 'frame gap',
          frameGapMs: Math.round(gap), resets,
        });
      }
      stableSince = undefined; frames = 0;
    } else {
      stableSince ??= now; frames++;
      if (now - stableSince >= STABLE_MS && frames >= 10 && controller.minimumRemainingMs <= 0) {
        runtimeEvent('startup-animation', 'readiness stability', 'passed', {
          elapsedMs: Math.round(elapsed), stableMs: Math.round(now - stableSince), frames, resets,
          maxFrameGapMs: Math.round(maxGap), fallbackUsed: fallbackReported, contentKind: content.kind,
        });
        dispose(); controller.signalReady(); return;
      }
    }
    if (candidateSince !== undefined && now - candidateSince >= 15000 && controller.minimumRemainingMs <= 0) {
      runtimeEvent('startup-animation', 'readiness fallback', 'used', {
        reason: 'native Codex content is visible but sustained rendering load prevents the stability window',
        elapsedMs: Math.round(elapsed), waitingMs: Math.round(now - candidateSince), maxFrameGapMs: Math.round(maxGap), resets,
      });
      dispose(); controller.signalReady(); return;
    }
    pendingLongTask = false;
    if (now >= nextReport) {
      runtimeEvent('startup-animation', 'readiness monitor', 'waiting', {
        elapsedMs: Math.round(elapsed), contentVisible: content.painted, frames, resets,
        stableMs: stableSince === undefined ? 0 : Math.round(now - stableSince), maxFrameGapMs: Math.round(maxGap),
      });
      nextReport = now + 5000;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
