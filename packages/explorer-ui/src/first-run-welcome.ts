import { ApplicationDialog } from './components/application-dialog';
import { requestApplicationMenu } from './host/bridge/application-menu';
import { welcomeSurfaceState } from './welcome-surface';
import { recordCaughtRuntimeError } from './runtime-operations';

const OWNER = Symbol.for('code-codex:first-run-welcome:v1');
const owners = () => window as unknown as Record<symbol, (() => void) | undefined>;

export function disposeWelcome(): void {
  owners()[OWNER]?.();
}

function showWelcome(image: string, consume: () => Promise<boolean>, onQuickTour: () => void): void {
  const globals = owners();
  const dialog = new ApplicationDialog();
  function dispose(): void {
    dialog.dispose();
    window.removeEventListener('pagehide', dispose);
    if (globals[OWNER] === dispose) delete globals[OWNER];
  }
  globals[OWNER] = dispose;
  window.addEventListener('pagehide', dispose, { once: true });
  void dialog.welcome(image, consume, onQuickTour).finally(dispose);
}

export function openWelcomeFromMenu(image: string, onQuickTour: () => void): void {
  disposeWelcome();
  showWelcome(image, async () => true, onQuickTour);
}

/** Ordinary starts return before allocating observers or making requests. */
export function reconcileFirstRunWelcome(pendingImage: string | undefined, onQuickTour: () => void): void {
  if (!pendingImage || owners()[OWNER]) return;
  const image = pendingImage;
  const globals = owners();
  const controller = new AbortController();
  const { signal } = controller;
  let frame = 0;
  const observer = new MutationObserver(queue);
  function queue() {
    if (frame || signal.aborted) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (welcomeSurfaceState() !== 'ready') return;
      dispose();
      showWelcome(image, async () => {
        try {
          const result = await requestApplicationMenu<{ consumed: boolean }>('explorer.welcome.consume');
          return result?.consumed === true;
        } catch (error) {
          recordCaughtRuntimeError('first-run welcome', error);
          return false;
        }
      }, onQuickTour);
    });
  }
  function dispose() {
    cancelAnimationFrame(frame);
    observer.disconnect();
    controller.abort();
    window.removeEventListener('pagehide', dispose);
    if (globals[OWNER] === dispose) delete globals[OWNER];
  }
  globals[OWNER] = dispose;
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributeFilter: ['aria-current', 'data-app-startup-loading', 'data-app-shell-loading', 'data-app-initializing'],
  });
  document.addEventListener('visibilitychange', queue, { signal });
  window.addEventListener('code-codex:background-hold-changed', queue, { signal });
  window.addEventListener('pagehide', dispose, { once: true });
  queue();
}
