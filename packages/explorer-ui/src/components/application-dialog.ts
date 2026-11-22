import { getLocale, subscribeLanguage, t } from '../i18n';
import { icons } from '../icons';

/** App-owned modal: localized content, native focus isolation and cleanup. */
export class ApplicationDialog {
  private dialog: HTMLDialogElement | undefined;
  private finish: ((accepted: boolean) => void) | undefined;

  confirm(titleKey: string, messageKey: string, acceptKey = 'dialog.confirm'): Promise<boolean> {
    return this.open(titleKey, messageKey, acceptKey);
  }

  welcome(image: string, consume: () => Promise<boolean>, onQuickTour: () => void): Promise<boolean> {
    return this.open('welcome.title', 'welcome.description', 'welcome.start', { image, consume, onQuickTour });
  }

  private open(titleKey: string, messageKey: string, acceptKey: string,
    welcome?: { image: string; consume: () => Promise<boolean>; onQuickTour: () => void }): Promise<boolean> {
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
    if (welcome) {
      dialog.dataset.codeCodexWelcome = 'true';
      dialog.style.cssText += ';width:min(480px,calc(100vw - 32px));border:0;border-radius:16px;padding:0;visibility:hidden;box-shadow:0 20px 25px -5px #0003';
      container.dataset.welcome = 'true';
      const style = document.createElement('style');
      style.textContent = 'dialog[data-code-codex-welcome]::backdrop{background:transparent;backdrop-filter:none}';
      dialog.append(style);
    }
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
      :host([data-welcome]){position:relative}
      :host([data-welcome]) img{display:block;width:100%;height:214px;object-fit:cover}
      :host([data-welcome]) h2{font-size:23px;line-height:1.25;margin:0 0 14px}
      :host([data-welcome]) p{font-size:16px;line-height:1.45;opacity:.8}
      :host([data-welcome]) .content{padding:24px clamp(18px,5vw,32px) 30px;text-align:center}
      :host([data-welcome]) footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:16px}
      :host([data-welcome]) footer button{min-width:0;min-height:44px;padding-inline:8px}
      :host([data-welcome]) button[data-cancel]{position:absolute;top:8px;right:8px;display:grid;place-items:center;width:44px;min-width:0;height:44px;padding:0;color:#fff;background:transparent;border:0}
      :host([data-welcome]) button[data-cancel] svg{display:block;width:18px;height:18px;pointer-events:none}
      :host([data-welcome]) button[data-cancel]:hover{background:#ffffff25}
      @media(max-width:440px){:host([data-welcome]) img{height:180px}}
    </style><h2 id="code-codex-confirm-title"></h2><p id="code-codex-confirm-message"></p><footer><button type="button" data-accept></button><button type="button" data-cancel autofocus></button></footer>`;
    const title = root.querySelector('h2')!;
    const message = root.querySelector('p')!;
    const accept = root.querySelector<HTMLButtonElement>('[data-accept]')!;
    const cancel = root.querySelector<HTMLButtonElement>('[data-cancel]')!;
    let quickTour: HTMLButtonElement | undefined;
    if (welcome) {
      cancel.innerHTML = icons.close;
      const image = document.createElement('img');
      image.alt = '';
      image.src = welcome.image;
      const content = document.createElement('div');
      content.className = 'content';
      const footer = accept.parentElement!;
      quickTour = document.createElement('button');
      quickTour.type = 'button';
      quickTour.dataset.quickTour = 'true';
      footer.append(quickTour);
      content.append(title, message, footer);
      root.append(image, content, cancel);
    }
    const render = () => {
      title.textContent = t(titleKey);
      message.textContent = t(messageKey);
      dialog.setAttribute('aria-label', title.textContent);
      dialog.setAttribute('aria-description', message.textContent);
      accept.textContent = t(acceptKey);
      if (quickTour) quickTour.textContent = t('welcome.quickTour');
      if (welcome) cancel.setAttribute('aria-label', t('welcome.close'));
      else cancel.textContent = t('dialog.cancel');
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
      quickTour?.addEventListener('click', () => {
        finish(true);
        welcome?.onQuickTour();
      });
      cancel.addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.addEventListener('close', () => finish(false));
      try {
        dialog.showModal();
        if (welcome) {
          void welcome.consume().then(consumed => {
            if (complete) return;
            if (!consumed) { finish(false); return; }
            dialog.style.visibility = '';
            cancel.focus({ preventScroll: true });
          }).catch(() => finish(false));
        } else cancel.focus();
      }
      catch { finish(false); }
    });
  }

  dispose(): void { this.finish?.(false); this.dialog?.remove(); this.dialog = undefined; }

  containsEvent(event: Event): boolean {
    return this.dialog !== undefined && event.composedPath().includes(this.dialog);
  }
}
