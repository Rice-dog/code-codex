import { WorkerBackgroundRenderer } from '../../../src/core/background-runtime/worker-renderer';
import type { SignalHandsSettings } from '../../../src/effects/signal-hands/model';

declare const __SIGNAL_HANDS_WORKER__: string;
const controls = 'button,a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],[role="menu"],[role="menubar"],[role="slider"],[role="listbox"],[popover],[data-code-codex-account-popup]';
type Gesture = { kind: 'scroll' | 'pose'; delta: number };

function verticalDelta(event: WheelEvent): number {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey ||
      event.composedPath().some(node => node instanceof Element && node.matches(controls)) ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return 0;
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
    event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
  return Number.isFinite(event.deltaY) ? event.deltaY * unit : 0;
}

export class SignalHandsRenderer extends WorkerBackgroundRenderer {
  private listeners?: AbortController;
  private retired = false;
  private queued: Gesture | undefined;
  private sending = false;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement, settings: SignalHandsSettings,
    private readonly report: (message?: string) => void, interactive = true) {
    super('signal-hands', __SIGNAL_HANDS_WORKER__, host, canvas, settings, report, { interactive });
    if (interactive) void this.ready.then(() => { if (!this.retired) this.listen(); }, () => {});
  }

  private listen(): void {
    this.listeners = new AbortController();
    const signal = this.listeners.signal;
    let armed = false;
    const onPose = (event: WheelEvent) => {
      if (!event.altKey || !event.cancelable) return;
      const delta = verticalDelta(event);
      if (!delta) return;
      event.preventDefault();
      this.enqueue('pose', delta);
    };
    const arm = (enabled: boolean) => {
      if (armed === enabled) return;
      armed = enabled;
      if (armed) window.addEventListener('wheel', onPose, { capture: true, passive: false, signal });
      else window.removeEventListener('wheel', onPose, true);
    };
    const passive = { capture: true, passive: true, signal };
    window.addEventListener('keydown', event => arm(event.altKey), passive);
    window.addEventListener('keyup', event => arm(event.altKey), passive);
    window.addEventListener('pointermove', event => arm(event.altKey), passive);
    window.addEventListener('pointerover', event => arm(event.altKey), passive);
    window.addEventListener('blur', () => arm(false), { signal });
    window.addEventListener('wheel', event => {
      if (event.altKey && !armed && event.cancelable) {
        // Alt may already be down when the user enters this window.
        window.addEventListener('wheel', onPose, { once: true, passive: false, signal });
      }
      arm(event.altKey);
      if (!event.altKey) {
        const delta = verticalDelta(event);
        if (delta) this.enqueue('scroll', delta);
      }
    }, passive);
  }

  // Keep at most one worker command in flight. A reversal replaces old momentum.
  private enqueue(kind: Gesture['kind'], delta: number): void {
    const previous = this.queued;
    const total = previous?.kind === kind && Math.sign(previous.delta) === Math.sign(delta)
      ? previous.delta + delta : delta;
    this.queued = { kind, delta: Math.max(-10000, Math.min(10000, total)) };
    if (!this.sending) void this.flush();
  }

  private async flush(): Promise<void> {
    this.sending = true;
    try {
      while (this.queued && this.listeners) {
        const { kind, delta } = this.queued;
        this.queued = undefined;
        await this.call(kind, [delta]);
      }
    } catch (error) {
      if (this.listeners) this.report(String(error));
    } finally {
      this.sending = false;
    }
  }

  override dispose(): void {
    this.retired = true;
    this.listeners?.abort();
    delete this.listeners;
    this.queued = undefined;
    super.dispose();
  }
}
