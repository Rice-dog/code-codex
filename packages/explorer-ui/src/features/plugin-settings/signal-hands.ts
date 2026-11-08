import { appearanceCardMarkup } from '../../components/plugin-card';
import { pluginIconMarkup } from '../../components/plugin-icons';
import type { BackgroundCommands } from '../../contracts/appearance';
import { SIGNAL_HANDS_BACKGROUND_PLUGIN_ID, type SignalHandsSettings } from '../../effects/signal-hands/model';
import { icons } from '../../icons';
import { getLocale, subscribeLanguage, t, translate } from '../../i18n';
import { isPluginPackageLoaded } from '../../plugin-runtime';
import { recordCaughtRuntimeError } from '../../runtime-operations';

const panelId = 'cle-signal-hands-settings';
const ranges = ['stage', 'pointerStrength', 'flowStrength'] as const;
const modes = ['brush', 'magnet', 'threads'] as const;

export function signalHandsCardMarkup(): string {
  return appearanceCardMarkup({
    id: SIGNAL_HANDS_BACKGROUND_PLUGIN_ID, title: 'Signal Between', className: 'signal-hands-card',
    icon: pluginIconMarkup('signal-hands'), statusId: 'cle-signal-hands-status',
    settingsClass: 'particle-settings-trigger signal-hands-settings', settingsId: panelId,
  });
}

function rangeMarkup(key: typeof ranges[number]): string {
  const id = `cle-signal-hands-${key}`;
  return `<div class="particle-control-row">
    <label for="${id}" data-i18n-key="signalHands.${key}"></label>
    <input id="${id}" type="range" min="0" max="100" step="1" data-signal-range="${key}">
    <span class="particle-control-value"><output for="${id}"></output></span>
  </div>`;
}

export function signalHandsPanelMarkup(): string {
  return `<section id="${panelId}" class="particle-settings-panel" popover="manual" role="dialog"
      aria-modal="false" aria-labelledby="cle-signal-hands-title">
    <header class="particle-settings-header">
      <div class="particle-settings-heading"><p>Appearance</p><h3 id="cle-signal-hands-title" data-plugin-name>Signal Between</h3></div>
      <div class="particle-settings-header-actions">
        <button type="button" class="particle-settings-close" aria-label="Close settings">${icons.close}</button>
      </div>
    </header>
    <div class="particle-settings-scroll"><fieldset class="particle-settings-group">
      <legend data-i18n-key="signalHands.interaction"></legend>
      <label class="particle-toggle-row"><span data-i18n-key="signalHands.motion"></span><input type="checkbox" data-signal-motion></label>
      <div class="particle-control-row">
        <label for="cle-signal-hands-mode" data-i18n-key="signalHands.pointerMode"></label>
        <select id="cle-signal-hands-mode">${modes.map(mode => `<option value="${mode}" data-i18n-key="signalHands.${mode}"></option>`).join('')}</select>
      </div>
      ${ranges.map(rangeMarkup).join('')}
      <p data-signal-pointer-hint></p><p data-i18n-key="signalHands.scrollHint"></p>
    </fieldset>
    <p class="particle-plugin-error" role="status" hidden></p></div>
  </section>`;
}

interface SignalHandsSettingsPorts {
  readonly shadow: ShadowRoot;
  readonly runtime: {
    readonly enabled: boolean;
    readonly pending: boolean;
    readonly error: string | undefined;
    readonly settings: SignalHandsSettings;
    updateSettings(settings: SignalHandsSettings): void;
    subscribe(listener: () => void): () => void;
  };
  readonly actions: BackgroundCommands;
  readonly enabled: () => boolean;
  readonly closeOthers: () => void;
  readonly notice: (message: string) => void;
}

export class SignalHandsSettingsController {
  readonly #card: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #trigger: HTMLButtonElement;
  readonly #action: HTMLButtonElement;
  #scope: AbortController | undefined;

  constructor(private readonly ports: SignalHandsSettingsPorts) {
    this.#card = ports.shadow.querySelector<HTMLElement>('.signal-hands-card')!;
    this.#panel = ports.shadow.getElementById(panelId)!;
    this.#trigger = this.#card.querySelector<HTMLButtonElement>('.signal-hands-settings')!;
    this.#action = this.#card.querySelector<HTMLButtonElement>('.preview-extension-action')!;
  }

  start(): void {
    this.stop();
    this.#scope = new AbortController();
    const options = { signal: this.#scope.signal };
    options.signal.addEventListener('abort', this.ports.runtime.subscribe(() => this.render()), { once: true });
    options.signal.addEventListener('abort', subscribeLanguage(() => this.render()), { once: true });
    this.#action.addEventListener('click', () => {
      void this.ports.actions.toggle(SIGNAL_HANDS_BACKGROUND_PLUGIN_ID).catch(error => {
        recordCaughtRuntimeError('Toggle Signal Between', error);
        this.ports.notice(String(error));
      });
    }, options);
    this.#trigger.addEventListener('click', () => this.open ? this.close(true) : this.show(), options);
    this.#panel.querySelector('.particle-settings-close')!.addEventListener('click', () => this.close(true), options);
    this.#panel.addEventListener('input', event => {
      const input = event.target;
      const settings = { ...this.ports.runtime.settings };
      if (input instanceof HTMLSelectElement) {
        const mode = modes.find(value => value === input.value);
        if (!mode) return;
        settings.pointerMode = mode;
      } else if (input instanceof HTMLInputElement && input.hasAttribute('data-signal-motion')) {
        settings.motion = input.checked;
      } else if (input instanceof HTMLInputElement) {
        const key = ranges.find(key => key === input.dataset.signalRange);
        if (!key) return;
        settings[key] = input.valueAsNumber / 100;
      } else return;
      this.ports.runtime.updateSettings(settings);
    }, options);
    window.addEventListener('resize', () => this.position(), options);
    this.ports.shadow.addEventListener('scroll', () => this.position(), { ...options, capture: true });
    this.render();
  }

  get open(): boolean { return this.#panel.matches(':popover-open'); }
  containsEvent(event: Event): boolean {
    return event.composedPath().includes(this.#panel) || event.composedPath().includes(this.#trigger);
  }

  show(): void {
    this.ports.closeOthers();
    this.#panel.showPopover();
    this.#trigger.setAttribute('aria-expanded', 'true');
    this.position();
    this.#panel.querySelector<HTMLButtonElement>('.particle-settings-close')!.focus();
  }

  close(focus = false): void {
    if (this.open) this.#panel.hidePopover();
    this.#trigger.setAttribute('aria-expanded', 'false');
    if (focus) this.#trigger.focus();
  }

  position(): void {
    if (!this.open) return;
    const edge = 12;
    const width = Math.min(344, innerWidth - 2 * edge);
    const maxHeight = innerHeight - 2 * edge;
    const card = this.#card.getBoundingClientRect();
    const beside = card.right + 8 + width <= innerWidth - edge;
    const style = this.#panel.style;
    style.width = `${width}px`;
    style.maxHeight = `${maxHeight}px`;
    style.left = `${beside ? card.right + 8 : innerWidth - edge - width}px`;
    style.top = `${Math.max(edge, Math.min(card.top, innerHeight - edge - Math.min(this.#panel.scrollHeight, maxHeight)))}px`;
    this.#panel.dataset.side = beside ? 'right' : 'overlay';
  }

  render(): void {
    const { runtime, actions } = this.ports;
    const enabled = this.ports.enabled();
    this.#panel.lang = getLocale();
    this.#card.setAttribute('aria-busy', String(runtime.pending));
    this.#panel.setAttribute('aria-busy', String(runtime.pending));
    // The market owns Download, Checking and Loading until the package is ready.
    if (isPluginPackageLoaded('signal-hands') && !this.#action.dataset.packageLoadingOwner) {
      this.#action.textContent = translate(runtime.pending ? 'Applying…' : enabled ? 'Disable' : 'Enable');
      this.#action.disabled = actions.busy || runtime.pending;
      this.#action.dataset.enabled = String(enabled);
      this.#action.setAttribute('aria-pressed', String(enabled));
      this.#action.setAttribute('aria-label', t(enabled ? 'Disable {name}' : 'Enable {name}', {name: t('plugin.name.signal-hands')}));
      const status = this.#card.querySelector<HTMLElement>('.preview-extension-status')!;
      status.textContent = translate(enabled ? (runtime.enabled ? 'Enabled' : 'Enabled · Not applied') : 'Installed');
      status.dataset.enabled = String(enabled && runtime.enabled);
    }
    this.#trigger.setAttribute('aria-label', t('signalHands.configure'));
    const { settings } = runtime;
    const motion = this.#panel.querySelector<HTMLInputElement>('[data-signal-motion]')!;
    motion.checked = settings.motion;
    motion.disabled = runtime.pending;
    const mode = this.#panel.querySelector<HTMLSelectElement>('#cle-signal-hands-mode')!;
    mode.value = settings.pointerMode;
    mode.disabled = runtime.pending;
    for (const key of ranges) {
      const input = this.#panel.querySelector<HTMLInputElement>(`[data-signal-range="${key}"]`)!;
      input.value = String(Math.round(settings[key] * 100));
      input.disabled = runtime.pending;
      const value = `${input.value}%`;
      input.setAttribute('aria-valuetext', value);
      this.#panel.querySelector<HTMLOutputElement>(`output[for="${input.id}"]`)!.value = value;
    }
    this.#panel.querySelector('[data-signal-pointer-hint]')!.textContent = t(`signalHands.${settings.pointerMode}Hint`);
    const error = this.#panel.querySelector<HTMLElement>('.particle-plugin-error')!;
    error.textContent = runtime.error ?? '';
    error.hidden = !runtime.error;
  }

  stop(): void {
    this.close();
    this.#scope?.abort();
    this.#scope = undefined;
  }
}
