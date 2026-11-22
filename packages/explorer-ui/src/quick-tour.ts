import { getLocale, subscribeLanguage, t } from './i18n';
import { observeNativeStructure } from './native-structure-changes';

const OWNER = Symbol.for('code-codex:quick-tour:v1');
const owners = () => window as unknown as Record<symbol, (() => void) | undefined>;
const steps = ['market', 'update', 'menu'] as const;
type Step = typeof steps[number];

export function quickTourTarget(step: Step, explorer: ShadowRoot | null, root: Document = document): HTMLElement | null {
  const candidates = step === 'menu'
    ? root.querySelectorAll<HTMLElement>('[data-code-codex-application-menu] > #code-codex-application-menu-trigger')
    : explorer?.querySelectorAll<HTMLElement>(step === 'market' ? 'button.preview-market-button' : 'button.status-code');
  return candidates?.length === 1 ? candidates[0]! : null;
}

export function missingQuickTourTargets(explorer: ShadowRoot): Step[] {
  return steps.filter(step => !quickTourTarget(step, explorer));
}

export function disposeQuickTour(): void {
  owners()[OWNER]?.();
}

const styles = `
  [popover]{position:fixed;inset:0;margin:0;padding:0;border:0;max-width:none;max-height:none;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none;color:inherit}
  .highlight{position:absolute;border:2px solid #408cf0;border-radius:8px;box-shadow:0 0 0 100vmax rgb(0 0 0 / 20%);pointer-events:none}
  .card{position:absolute;box-sizing:border-box;width:min(312px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:14px;border:1px solid var(--color-border-strong,light-dark(#ddd,#494949));border-radius:12px;background:var(--color-codex-application-menu,light-dark(#fff,#242424));color:var(--app-color-foreground-application-menu,light-dark(#191919,#f6f6f6));box-shadow:0 6px 20px #0004;pointer-events:auto;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
  .step{font-size:12px;opacity:.75}
  h2{margin:4px 0 5px;font-size:15px;font-weight:600}
  p{margin:0;overflow-wrap:anywhere}
  footer{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-top:12px}
  button{border:1px solid transparent;border-radius:999px;padding:5px 11px;min-height:30px;font:inherit;color:inherit;background:transparent;cursor:pointer}
  button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
  [data-next]{background:light-dark(#242424,#f6f6f6);color:light-dark(#fff,#161616)}
  [data-next]:hover{background:light-dark(#3e3e3e,#dcdcdc)}
  [data-reveal]{margin-top:8px;border-color:var(--color-border-strong,light-dark(#ddd,#555))}
  button:focus-visible{outline:2px solid #408cf0;outline-offset:2px}
`;

export function openQuickTour(options: {
  explorerRoot: () => ShadowRoot | null;
  revealExplorer?: () => void;
}): void {
  disposeQuickTour();
  const previous = document.activeElement;
  const host = document.createElement('div');
  host.dataset.codeCodexOwned = 'true';
  host.dataset.codeCodexQuickTour = 'true';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles}</style>
    <div popover="manual">
      <div class="highlight" hidden></div>
      <section class="card" role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body">
        <div aria-live="polite">
          <div class="step"></div>
          <h2 id="tour-title"></h2>
          <p id="tour-body"></p>
        </div>
        <button type="button" data-reveal hidden></button>
        <footer><button type="button" data-skip></button><button type="button" data-next></button></footer>
      </section>
    </div>`;
  const layer = root.querySelector<HTMLElement>('[popover]')!;
  const card = root.querySelector<HTMLElement>('.card')!;
  const highlight = root.querySelector<HTMLElement>('.highlight')!;
  const reveal = root.querySelector<HTMLButtonElement>('[data-reveal]')!;
  const skip = root.querySelector<HTMLButtonElement>('[data-skip]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
  const controller = new AbortController();
  const { signal } = controller;
  const margin = 12;
  let index = 0;
  let frame = 0;
  let target: HTMLElement | null = null;
  const layout = new ResizeObserver(schedulePosition);
  const structure = observeNativeStructure(schedulePosition);

  function schedulePosition(): void {
    if (frame || signal.aborted) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      position();
    });
  }

  function position(): void {
    const step = steps[index]!;
    const current = quickTourTarget(step, options.explorerRoot());
    if (current !== target) {
      if (target) layout.unobserve(target);
      if (current) layout.observe(current);
      target = current;
    }
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const rect = target?.getBoundingClientRect();
    const visible = rect && rect.width > 0 && rect.height > 0
      && rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height
      && target?.checkVisibility({ visibilityProperty: true });
    highlight.hidden = !visible;
    reveal.hidden = Boolean(visible || step === 'menu' || !options.revealExplorer);
    if (visible) {
      highlight.style.left = `${Math.max(0, rect.left - 3)}px`;
      highlight.style.top = `${Math.max(0, rect.top - 3)}px`;
      highlight.style.right = `${Math.max(0, width - rect.right - 3)}px`;
      highlight.style.bottom = `${Math.max(0, height - rect.bottom - 3)}px`;
    }
    const cardWidth = card.offsetWidth;
    const cardHeight = card.offsetHeight;
    const center = visible ? (rect.left + rect.right) / 2 : width / 2;
    const top = visible
      ? (height - rect.bottom >= cardHeight + margin || rect.top < cardHeight + margin
        ? rect.bottom + margin : rect.top - cardHeight - margin)
      : (height - cardHeight) / 2;
    card.style.left = `${Math.max(margin, Math.min(width - cardWidth - margin, center - cardWidth / 2))}px`;
    card.style.top = `${Math.max(margin, Math.min(height - cardHeight - margin, top))}px`;
  }

  function render(): void {
    const step = steps[index]!;
    host.lang = getLocale();
    root.querySelector('.step')!.textContent = t('quickTour.progress', { current: index + 1, total: steps.length });
    root.querySelector('h2')!.textContent = t(`quickTour.${step}.title`);
    root.querySelector('p')!.textContent = t(`quickTour.${step}.description`);
    reveal.textContent = t('quickTour.reveal');
    skip.textContent = t('quickTour.skip');
    next.textContent = t(index === steps.length - 1 ? 'quickTour.done' : 'quickTour.next');
    position();
  }

  const unsubscribe = subscribeLanguage(render);
  function close(): void {
    const restoreFocus = document.activeElement === host || document.activeElement === document.body;
    controller.abort();
    cancelAnimationFrame(frame);
    structure.disconnect();
    layout.disconnect();
    unsubscribe();
    host.remove();
    if (owners()[OWNER] === close) delete owners()[OWNER];
    if (restoreFocus && previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
  }
  next.addEventListener('click', () => {
    if (index === steps.length - 1) close();
    else { index++; render(); }
  }, { signal });
  skip.addEventListener('click', close, { signal });
  reveal.addEventListener('click', () => {
    options.revealExplorer?.();
    schedulePosition();
    next.focus({ preventScroll: true });
  }, { signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.activeElement === host) {
      event.preventDefault();
      event.stopPropagation();
    }
    close();
  }, { capture: true, signal });
  window.addEventListener('scroll', schedulePosition, { capture: true, passive: true, signal });
  window.addEventListener('resize', schedulePosition, { signal });
  window.addEventListener('pagehide', close, { once: true, signal });
  owners()[OWNER] = close;
  document.body.append(host);
  layer.showPopover();
  layout.observe(card);
  render();
  next.focus({ preventScroll: true });
}
