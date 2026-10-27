import { getLocale, selectLanguage, subscribeLanguage, translate, t } from './i18n';
import { icons } from './icons';
import type { LoginStartupActions } from './contracts/login-startup';
import { LoginStartupController } from './features/startup/login-startup';

interface ApplicationMenuActions extends LoginStartupActions {
  isExplorerVisible(): boolean;
  toggleExplorer(): void;
  openPreviewMarket(): void;
  checkForUpdates(): void;
  openRuntimeInformation(): void;
  openInstallationFolder(): void;
  openUninstaller(): Promise<{ opened: boolean }>;
}

interface MenuMount {
  topBar: HTMLElement;
  menubar: HTMLElement;
  lastNativeTrigger: HTMLButtonElement;
}

interface MenuState {
  owner: object;
  mount: MenuMount;
  host: HTMLElement;
  popup: HTMLElement;
  dispose(): void;
}

const MENU_STATE = Symbol.for("code-codex:application-menu:v1");
const MENU_HOST_SELECTOR = "[data-code-codex-application-menu]";
const MENU_POPUP_SELECTOR = "[data-code-codex-application-menu-popup]";
const MENU_STYLE_SELECTOR = "style[data-code-codex-application-menu-style]";
const REPOSITORY_URL = "https://github.com/Rice-dog/code-codex";
const owner = {};

const MENU_CSS = `
${MENU_HOST_SELECTOR} {
  display: inline-flex;
  align-items: center;
  margin-inline-start: -6px;
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}
${MENU_HOST_SELECTOR} > button {
  -webkit-app-region: no-drag;
}
${MENU_HOST_SELECTOR} > button[aria-expanded="true"] {
  background: var(--color-codex-application-menu-selection, rgba(255,255,255,.96));
  color: var(--color-text, #1a1c1f);
}
${MENU_POPUP_SELECTOR} {
  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  width: min(220px, calc(100vw - 16px));
  max-height: calc(100vh - 12px);
  padding: 4px 0;
  border: 0;
  border-radius: var(--radius-sm, 7.5px);
  background: var(--color-codex-application-menu, #f8f8f9);
  color: var(--app-color-foreground-application-menu, #1a1c1f);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .42);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  overflow-y: auto;
  user-select: none;
  outline: none;
}
${MENU_POPUP_SELECTOR}[hidden] { display: none !important; }
${MENU_POPUP_SELECTOR} > :is(button, a) {
  display: block;
  box-sizing: border-box;
  width: calc(100% - 8px);
  margin: 0 4px;
  padding: 5px 16px;
  border: 0;
  border-radius: var(--radius-sm, 7.5px);
  background: transparent;
  color: inherit;
  font: 400 12px/18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
}
${MENU_POPUP_SELECTOR} > :is(button, a):hover,
${MENU_POPUP_SELECTOR} > :is(button, a):focus-visible {
  background: var(--color-background-primary-ghost-hover, rgba(26, 28, 31, .053));
  outline: none;
}
${MENU_POPUP_SELECTOR} > [role="separator"] {
  height: .5px;
  margin: 8px 0;
  background: var(--color-border-strong, rgba(26, 28, 31, .117));
}
${MENU_POPUP_SELECTOR} > [data-code-codex-language-trigger] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
${MENU_POPUP_SELECTOR} > [data-code-codex-login-startup] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
[data-code-codex-menu-check] { margin-inline-start: auto; font: inherit; }
[data-code-codex-menu-check][hidden] { display: none; }
${MENU_POPUP_SELECTOR} > button:disabled { opacity: .6; cursor: default; }
[data-code-codex-submenu-chevron] {
  display: flex;
  flex: 0 0 16px;
  margin-inline-start: auto;
  opacity: .55;
}
[data-code-codex-submenu-chevron] > svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}
`;

function stateStore(): Record<PropertyKey, unknown> {
  return window as unknown as Record<PropertyKey, unknown>;
}

function findMenuMount(): MenuMount | null {
  // Codex localizes the menu's visible and accessible labels. Its trigger IDs
  // and menubar role identify the native row without depending on any language.
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="menubar"]'))
    .map((menubar) => ({
      menubar,
      triggers: Array.from(menubar.querySelectorAll<HTMLButtonElement>(
        'button[id^="application-menu-trigger-"][id$="-menu"]',
      )),
    }))
    .filter(({ triggers }) => triggers.length >= 2);
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  if (!candidate) return null;
  const { menubar, triggers } = candidate;
  const lastNativeTrigger = triggers[triggers.length - 1];
  if (!lastNativeTrigger) return null;
  const topBar = menubar.parentElement;
  if (!(topBar instanceof HTMLElement) || !topBar.isConnected || topBar.parentElement === null) return null;
  return { topBar, menubar, lastNativeTrigger };
}

function ensureStyle(): void {
  let style = document.querySelector<HTMLStyleElement>(MENU_STYLE_SELECTOR);
  if (!style) {
    style = document.createElement("style");
    style.dataset.codeCodexApplicationMenuStyle = "true";
    (document.head ?? document.documentElement).append(style);
  }
  if (style.textContent !== MENU_CSS) style.textContent = MENU_CSS;
}

function createMenu(mount: MenuMount, actions: ApplicationMenuActions): MenuState {
  ensureStyle();
  const controller = new AbortController();
  const { signal } = controller;
  const host = document.createElement("span");
  host.dataset.codeCodexApplicationMenu = "true";
  host.className = "no-drag";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.id = "code-codex-application-menu-trigger";
  trigger.className = nativeTriggers().find(button => button.dataset.state !== 'open')?.className ?? mount.lastNativeTrigger.className;
  trigger.textContent = "Code-Codex";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.dataset.state = 'closed';
  trigger.setAttribute("aria-controls", "code-codex-application-menu-popup");
  host.append(trigger);

  const popup = document.createElement("div");
  popup.dataset.codeCodexApplicationMenuPopup = "true";
  popup.id = "code-codex-application-menu-popup";
  popup.setAttribute("role", "menu");
  popup.tabIndex = -1;
  popup.setAttribute("aria-labelledby", trigger.id);
  popup.hidden = true;
  const treeItem = document.createElement("button");
  treeItem.type = "button";
  treeItem.setAttribute("role", "menuitem");
  treeItem.tabIndex = -1;
  const marketItem = document.createElement("button");
  marketItem.type = "button";
  marketItem.setAttribute("role", "menuitem");
  marketItem.tabIndex = -1;
  marketItem.textContent = "Preview Market";
  const runtimeItem = document.createElement("button");
  runtimeItem.type = "button";
  runtimeItem.setAttribute("role", "menuitem");
  runtimeItem.tabIndex = -1;
  runtimeItem.textContent = "Runtime Information";
  const updateItem = document.createElement("button");
  updateItem.type = "button";
  updateItem.setAttribute("role", "menuitem");
  updateItem.tabIndex = -1;
  updateItem.textContent = "Check for Updates…";
  const installationItem = document.createElement("button");
  installationItem.type = "button";
  installationItem.setAttribute("role", "menuitem");
  installationItem.tabIndex = -1;
  installationItem.textContent = "Open Installation Folder";
  const loginStartupItem = document.createElement('button');
  loginStartupItem.type = 'button';
  loginStartupItem.tabIndex = -1;
  const loginStartup = new LoginStartupController(loginStartupItem, actions);
  const languageItem = document.createElement('button');
  languageItem.type = 'button';languageItem.setAttribute('role','menuitem');languageItem.tabIndex=-1;
  languageItem.setAttribute('aria-haspopup','menu');languageItem.setAttribute('aria-expanded','false');
  languageItem.dataset.codeCodexLanguageTrigger='true';
  const languageLabel=document.createElement('span');
  const languageChevron=document.createElement('span');
  languageChevron.dataset.codeCodexSubmenuChevron='true';
  languageChevron.setAttribute('aria-hidden','true');
  languageChevron.innerHTML=icons.chevron;
  languageItem.append(languageLabel,languageChevron);
  const languagePopup=document.createElement('div');
  languagePopup.dataset.codeCodexApplicationMenuPopup='language';
  languagePopup.id='code-codex-language-popup';languagePopup.setAttribute('role','menu');
  languagePopup.setAttribute('aria-label','Language');languagePopup.hidden=true;languagePopup.style.width='160px';
  languageItem.setAttribute('aria-controls',languagePopup.id);
  const languageOptions=([['zh-CN','中文（简体）'],['en','English']] as const).map(([locale,label])=>{
    const button=document.createElement('button');button.type='button';button.tabIndex=-1;
    button.setAttribute('role','menuitemradio');button.dataset.locale=locale;
    button.addEventListener('click',()=>{
      if(button.disabled)return;
      languageOptions.forEach(option=>option.disabled=true);
      void selectLanguage(locale).then(()=>close(true)).catch(error=>{
        window.alert(t('language.saveFailed')+'\n'+String(error));
      }).finally(()=>{languageOptions.forEach(option=>option.disabled=false);updateText();});
    },{signal});
    button.dataset.languageLabel=label;languagePopup.append(button);return button;
  });
  const repositoryItem = document.createElement("a");
  repositoryItem.href = REPOSITORY_URL;
  repositoryItem.target = "_blank";
  repositoryItem.rel = "noopener noreferrer";
  repositoryItem.setAttribute("role", "menuitem");
  repositoryItem.tabIndex = -1;
  repositoryItem.textContent = "Open GitHub Repository";
  const separator = document.createElement("div");
  separator.setAttribute("role", "separator");
  const uninstallSeparator = document.createElement('div');
  uninstallSeparator.setAttribute('role', 'separator');
  const uninstallItem = document.createElement('button');
  uninstallItem.type = 'button'; uninstallItem.tabIndex = -1;
  uninstallItem.setAttribute('role', 'menuitem');
  uninstallItem.dataset.codeCodexUninstall = 'true';
  popup.append(treeItem, marketItem, runtimeItem, installationItem, loginStartupItem, languageItem, separator, updateItem, repositoryItem, uninstallSeparator, uninstallItem);

  // Keep this sibling separate from Codex's React-owned Radix menubar. It
  // shares the visual row without joining Radix's private keyboard collection.
  mount.topBar.insertBefore(host, mount.menubar.nextSibling);
  document.body.append(popup);
  document.body.append(languagePopup);

  const items: HTMLElement[] = [treeItem, marketItem, runtimeItem, installationItem, loginStartupItem, languageItem, updateItem, repositoryItem, uninstallItem];
  const updateText=()=>{
    loginStartup.render();
    treeItem.textContent=t(actions.isExplorerVisible()?'menu.hideTree':'menu.showTree');
    for(const [item,key] of [[marketItem,'menu.market'],[runtimeItem,'menu.runtime'],[installationItem,'menu.installation'],[updateItem,'menu.updates'],[repositoryItem,'menu.repository'],[uninstallItem,'menu.uninstall']] as const)item.textContent=t(key);
    languageLabel.textContent=t('menu.language');
    languagePopup.setAttribute('aria-label',t('menu.language'));
    for(const button of languageOptions){const checked=button.dataset.locale===getLocale();button.setAttribute('aria-checked',String(checked));button.textContent=(checked?'✓  ':'　 ')+button.dataset.languageLabel;}
  };
  const unsubscribe=subscribeLanguage(()=>{updateText();position();});
  const closeSub=()=>{languagePopup.hidden=true;languageItem.setAttribute('aria-expanded','false');};
  const positionSub=()=>{
    if(languagePopup.hidden)return;
    const rect=languageItem.getBoundingClientRect();
    const right=popup.getBoundingClientRect().right;
    languagePopup.style.left=`${Math.max(8,right+languagePopup.offsetWidth<=window.innerWidth-8?right:popup.getBoundingClientRect().left-languagePopup.offsetWidth)}px`;
    languagePopup.style.top=`${Math.max(8,Math.min(rect.top,window.innerHeight-languagePopup.offsetHeight-8))}px`;
  };
  const openSub=(focus=false)=>{updateText();languagePopup.hidden=false;languageItem.setAttribute('aria-expanded','true');positionSub();if(focus)(languageOptions.find(option=>option.dataset.locale===getLocale())??languageOptions[0])?.focus();};
  const position = () => {
    if (popup.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - popup.offsetWidth - 8));
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(8, Math.min(Math.round(rect.bottom), window.innerHeight - popup.offsetHeight - 8))}px`;
    positionSub();
  };
  const close = (returnFocus = false) => {
    closeSub();
    if (popup.hidden) return;
    popup.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.dataset.state = 'closed';
    if (returnFocus && trigger.isConnected) trigger.focus();
  };
  const open = (focusFirst = false) => {
    dismissNativeMenu();
    void loginStartup.refresh();
    updateText();
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.dataset.state = 'open';
    position();
    if (focusFirst) treeItem.focus();
    else popup.focus({ preventScroll: true });
  };

  // Coordinate through DOM events/state, without joining React/Radix internals.
  function nativeTriggers(): HTMLButtonElement[] {
    return [...mount.menubar.querySelectorAll<HTMLButtonElement>('button[id^="application-menu-trigger-"][id$="-menu"]')];
  }
  const nativeOpen = () => nativeTriggers().some(button => button.getAttribute('aria-expanded') === 'true');
  function dismissNativeMenu(): void {
    if (!nativeOpen()) return;
    const content = document.getElementById('application-menu-content') ?? document.activeElement;
    content?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  }
  const openNative = (button: HTMLButtonElement) => {
    close();
    button.focus({ preventScroll: true });
    // Radix's public trigger event handles opening; click alone is not an opener.
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  };
  trigger.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    if (nativeOpen()) open();
  }, { signal });
  mount.menubar.addEventListener('pointerover', event => {
    if (popup.hidden || event.pointerType === 'touch') return;
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[id^="application-menu-trigger-"][id$="-menu"]');
    if (button && !button.disabled) openNative(button);
  }, { capture: true, signal });
  document.addEventListener('keydown', event => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[id^="application-menu-trigger-"][id$="-menu"]');
    const content = (event.target as Element | null)?.closest('[data-radix-menubar-content]');
    if (event.key === 'ArrowRight' && (button === mount.lastNativeTrigger || content?.getAttribute('aria-labelledby') === mount.lastNativeTrigger.id)) {
      event.preventDefault(); event.stopPropagation(); open(true);
    }
  }, { capture: true, signal });
  const nativeStateObserver = new MutationObserver(() => { if (!popup.hidden && nativeOpen()) close(); });
  nativeStateObserver.observe(mount.menubar, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });

  trigger.addEventListener("click", () => popup.hidden ? open() : close(), { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open();
      (event.key === "ArrowDown" ? treeItem : repositoryItem).focus();
    } else if (event.key === "Escape") {
      close(true);
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const buttons = nativeTriggers();
      const button = event.key === 'ArrowLeft' ? buttons.at(-1) : buttons[0];
      if (button) openNative(button);
    }
  }, { signal });
  popup.addEventListener("keydown", (event) => {
    if(document.activeElement===languageItem&&['ArrowRight','Enter',' '].includes(event.key)){event.preventDefault();openSub(true);return;}
    if(event.key==='Escape'&&!languagePopup.hidden){event.preventDefault();closeSub();languageItem.focus();return;}
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close();
    } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const buttons = nativeTriggers();
      const button = event.key === 'ArrowLeft' ? buttons.at(-1) : buttons[0];
      if (button) openNative(button);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const navigable = items.filter(item => !(item instanceof HTMLButtonElement) || !item.disabled);
      const index = navigable.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? navigable.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + navigable.length) % navigable.length;
      navigable[next]?.focus();
    }
  }, { signal });
  languageItem.addEventListener('pointerenter',()=>openSub(),{signal});
  languageItem.addEventListener('click',()=>languagePopup.hidden?openSub():closeSub(),{signal});
  for(const item of items)if(item!==languageItem)item.addEventListener('pointerenter',closeSub,{signal});
  languagePopup.addEventListener('keydown',event=>{
    if(['Escape','ArrowLeft'].includes(event.key)){event.preventDefault();closeSub();languageItem.focus();}
    else if(event.key==='Tab'){close();}
    else if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){
      event.preventDefault();const index=languageOptions.indexOf(document.activeElement as HTMLButtonElement);
      languageOptions[event.key==='Home'?0:event.key==='End'?1:(index+(event.key==='ArrowDown'?1:-1)+2)%2]?.focus();
    }
  },{signal});
  treeItem.addEventListener("click", () => { close(); actions.toggleExplorer(); }, { signal });
  marketItem.addEventListener("click", () => { close(); actions.openPreviewMarket(); }, { signal });
  runtimeItem.addEventListener("click", () => { close(); actions.openRuntimeInformation(); }, { signal });
  installationItem.addEventListener("click", () => { close(); actions.openInstallationFolder(); }, { signal });
  loginStartupItem.addEventListener('click', () => { close(); void loginStartup.toggle(); }, { signal });
  updateItem.addEventListener("click", () => { close(); actions.checkForUpdates(); }, { signal });
  repositoryItem.addEventListener("click", () => close(), { signal });
  uninstallItem.addEventListener('click', () => {
    if (uninstallItem.disabled) return;
    close(); uninstallItem.disabled = true;
    void actions.openUninstaller().catch(error => {
      window.alert(`Opening the Code-Codex uninstaller failed.\n${String(error)}`);
    }).finally(() => { uninstallItem.disabled = false; });
  }, { signal });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && !host.contains(target) && !popup.contains(target) && !languagePopup.contains(target)) close();
  }, { capture: true, signal });
  window.addEventListener("resize", position, { signal });
  window.addEventListener("scroll", position, { capture: true, signal });
  window.addEventListener('blur', () => close(), { signal });

  return {
    owner, mount, host, popup,
    dispose: () => {
      controller.abort();
      nativeStateObserver.disconnect();
      loginStartup.dispose();
      unsubscribe();languagePopup.remove();
      host.remove();
      popup.remove();
    },
  };
}

export function reconcileApplicationMenu(actions: ApplicationMenuActions): void {
  const store = stateStore();
  const previous = store[MENU_STATE] as MenuState | undefined;
  const mount = findMenuMount();
  if (previous?.owner === owner && mount && previous.mount.topBar === mount.topBar &&
      previous.mount.menubar === mount.menubar &&
      previous.mount.lastNativeTrigger === mount.lastNativeTrigger &&
      previous.host.isConnected && previous.popup.isConnected) return;
  previous?.dispose();
  delete store[MENU_STATE];
  for (const old of document.querySelectorAll(`${MENU_HOST_SELECTOR}, ${MENU_POPUP_SELECTOR}`)) old.remove();
  if (!mount || !document.body) return;
  store[MENU_STATE] = createMenu(mount, actions);
}
