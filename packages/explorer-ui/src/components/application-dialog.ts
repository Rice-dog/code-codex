import { getLocale, subscribeLanguage, t } from '../i18n';

/** App-owned confirmation: localized title/buttons, native modal focus isolation. */
export class ApplicationDialog {
  private dialog: HTMLDialogElement | undefined;
  private finish: ((accepted: boolean) => void) | undefined;

  confirm(titleKey: string, messageKey: string, acceptKey = 'dialog.confirm'): Promise<boolean> {
    this.dispose();
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    this.dialog = dialog;
    dialog.dataset.codeCodexApplicationDialog = 'true';
    const container = document.createElement('div');
    container.dataset.codeCodexDialogContent = 'true';
    dialog.append(container);
    // Codex resets dialog margins to zero; never rely on UA auto-centering.
    dialog.style.cssText = 'position:fixed;inset:50% auto auto 50%;margin:0;transform:translate(-50%,-50%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;width:min(448px,calc(100vw - 32px));padding:20px;border:1px solid var(--code-codex-dialog-border);border-radius:9px;background:var(--code-codex-dialog-surface);color:var(--code-codex-dialog-text);box-shadow:0 2px 8px #00000012;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif';
    // Host tokens can disappear independently after an official update. Own a
    // paired palette so a missing surface can never produce white-on-white.
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const html = document.documentElement;
      const explicitLight = html.dataset.theme === 'light' || html.classList.contains('light') || html.classList.contains('electron-light');
      const explicitDark = html.dataset.theme === 'dark' || html.classList.contains('dark') || html.classList.contains('electron-dark');
      const scheme = getComputedStyle(html).colorScheme.replace(/\bonly\b/g, '').trim();
      const dark = !explicitLight && (explicitDark || scheme === 'dark' || (scheme !== 'light' && preference.matches));
      const palette = dark
        ? { surface: '#202123', text: '#f5f5f5', border: '#62656a', action: '#f5f5f5', actionText: '#161616', focus: '#8ab4ff' }
        : { surface: '#ffffff', text: '#161616', border: '#767676', action: '#161616', actionText: '#ffffff', focus: '#0866d9' };
      dialog.style.colorScheme = dark ? 'dark' : 'light';
      for (const [name, value] of Object.entries(palette)) dialog.style.setProperty(`--code-codex-dialog-${name}`, value);
    };
    applyTheme();
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    preference.addEventListener('change', applyTheme);
    const root = container.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{display:block;color:var(--code-codex-dialog-text)}
      h2{margin:0 0 12px;font-size:17px;font-weight:600;line-height:1.4}p{margin:0;white-space:pre-line;overflow-wrap:anywhere}
      footer{display:flex;justify-content:flex-end;gap:12px;margin-top:32px}
      button{box-sizing:border-box;min-width:78px;min-height:34px;padding:6px 18px;border:1px solid var(--code-codex-dialog-border);border-radius:999px;background:var(--code-codex-dialog-surface);color:var(--code-codex-dialog-text);font:600 14px/20px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}
      button[data-accept]{background:var(--code-codex-dialog-action);color:var(--code-codex-dialog-actionText);border-color:transparent}
      button:focus-visible{outline:2px solid var(--code-codex-dialog-focus);outline-offset:3px}
    </style><h2 id="code-codex-confirm-title"></h2><p id="code-codex-confirm-message"></p><footer><button type="button" data-accept></button><button type="button" data-cancel autofocus></button></footer>`;
    const title = root.querySelector('h2')!;
    const message = root.querySelector('p')!;
    const accept = root.querySelector<HTMLButtonElement>('[data-accept]')!;
    const cancel = root.querySelector<HTMLButtonElement>('[data-cancel]')!;
    const render = () => {
      title.textContent = t(titleKey);
      message.textContent = t(messageKey);
      dialog.setAttribute('aria-label', title.textContent);
      dialog.setAttribute('aria-description', message.textContent);
      accept.textContent = t(acceptKey);
      cancel.textContent = t('dialog.cancel');
      dialog.lang = getLocale();
    };
    render();
    const unsubscribe = subscribeLanguage(render);
    document.body.append(dialog);
    return new Promise<boolean>(resolve => {
      let complete = false;
      const finish = (accepted: boolean) => {
        if (complete) return;
        complete = true;
        unsubscribe();
        themeObserver.disconnect();
        preference.removeEventListener('change', applyTheme);
        this.finish = undefined;
        this.dialog = undefined;
        if (dialog.open) dialog.close();
        dialog.remove();
        if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
        resolve(accepted);
      };
      this.finish = finish;
      accept.addEventListener('click', () => finish(true));
      cancel.addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.addEventListener('close', () => finish(false));
      try { dialog.showModal(); cancel.focus(); }
      catch { finish(false); }
    });
  }

  dispose(): void { this.finish?.(false); this.dialog?.remove(); this.dialog = undefined; }
}
