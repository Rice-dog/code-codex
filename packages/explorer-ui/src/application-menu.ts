import { getLocale, selectLanguage, subscribeLanguage, translate, t } from './i18n';
import { icons } from './icons';
import {nativeMenuCheckSvg} from './components/menu-check';
import type { LoginStartupActions } from './contracts/login-startup';
import { LoginStartupController } from './features/startup/login-startup';
import { APPLICATION_MENU_ITEMS } from './contracts/application-menu-items';

interface ApplicationMenuActions extends LoginStartupActions {
  isExplorerVisible(): boolean;
  toggleExplorer(): void;
  openPreviewMarket(): void;
  openQuickTour(): void;
  checkForUpdates(): void;
  openRuntimeInformation(): void;
  openInstallationFolder(): void;
  hostUpdateStatus?(): Promise<{latest?:{type?:string;counts?:{pluginDependency?:number;needsReview?:number}};scan?:{status?:string};analysis?:{status?:string;message?:string;manualRetryRequired?:boolean};validation?:{status?:string;counts?:{issues?:number;manualGroups?:number};checkCounts?:{passed?:number;issues?:number;manual?:number};evidenceCounts?:{passed?:number;issues?:number;manual?:number}}}> ;
  retryHostUpdates?(): Promise<{scheduled:boolean}>;
  openHostUpdates?(): Promise<{opened:boolean}>;
  restartCodeCodex(): Promise<{ scheduled: boolean }>;
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
  -webkit-app-region: no-drag;
}
${MENU_POPUP_SELECTOR}[hidden] { display: none !important; }
/* Submenus retain their measured boxes without taking input or focus. */
${MENU_POPUP_SELECTOR}:is([popover]:not(:popover-open), [hidden]:not([data-code-codex-application-menu-popup="true"])) {
  display: block !important;
  visibility: hidden;
  pointer-events: none;
}
${MENU_POPUP_SELECTOR}[popover] { inset: auto; margin: 0; }
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
  transition: none;
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
${MENU_POPUP_SELECTOR} > [aria-haspopup="menu"] {
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
[data-code-codex-menu-check] { display:inline-flex; align-items:center; flex:none; width:17px; height:17px; margin-inline-start:auto; }
[data-code-codex-application-menu-popup] > button[role="menuitemradio"] { display:flex; align-items:center; justify-content:space-between; gap:16px; }
[data-code-codex-menu-check][hidden] { display: none; }
[role="menuitemradio"][aria-checked="false"] > [data-code-codex-menu-check] { visibility: hidden; }
${MENU_POPUP_SELECTOR} > button:disabled { opacity: .6; cursor: default; }
/* A fresh read blocks writes without flashing the normal menu foreground. */
${MENU_POPUP_SELECTOR} > button:disabled[data-code-codex-startup-read="true"] { opacity: 1; }
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
  const hostUpdatesItem=document.createElement('button');hostUpdatesItem.type='button';hostUpdatesItem.tabIndex=-1;hostUpdatesItem.setAttribute('role','menuitem');hostUpdatesItem.dataset.codeCodexHostUpdates='true';
  const retryUpdatesItem=document.createElement('button');retryUpdatesItem.type='button';retryUpdatesItem.tabIndex=-1;retryUpdatesItem.setAttribute('role','menuitem');retryUpdatesItem.dataset.codeCodexHostUpdatesRetry='true';
  const installationItem = document.createElement("button");
  installationItem.type = "button";
  installationItem.setAttribute("role", "menuitem");
  installationItem.tabIndex = -1;
  installationItem.textContent = "Open Installation Folder";
  const restartItem = document.createElement('button');
  restartItem.type = 'button'; restartItem.tabIndex = -1;
  restartItem.setAttribute('role','menuitem'); restartItem.dataset.codeCodexRestart='true';
  const loginStartupItem = document.createElement('button');
  loginStartupItem.type = 'button';
  loginStartupItem.tabIndex = -1;
  const loginStartup = new LoginStartupController(loginStartupItem, actions);
  const createSubmenu = (name: string) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.tabIndex = -1;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-haspopup', 'menu');
    const label = document.createElement('span');
    const chevron = document.createElement('span');
    chevron.dataset.codeCodexSubmenuChevron = 'true';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = icons.chevron;
    item.append(label, chevron);

    const panel = document.createElement('div');
    panel.dataset.codeCodexApplicationMenuPopup = name;
    panel.id = `code-codex-${name}-popup`;
    panel.setAttribute('role', 'menu');
    const nativePopover = typeof panel.showPopover === 'function' && 'popoverTargetElement' in item;
    if (nativePopover) {
      panel.popover = 'manual';
      item.popoverTargetElement = panel;
    } else {
      panel.hidden = true;
      item.setAttribute('aria-expanded', 'false');
    }
    item.setAttribute('aria-controls', panel.id);
    return { item, label, panel, setOpen(open: boolean) {
      if (nativePopover) {
        if (open) (panel.showPopover as (options: { source: HTMLButtonElement }) => void)({ source: item });
        else panel.hidePopover();
      } else {
        panel.hidden = !open;
        item.setAttribute('aria-expanded', String(open));
      }
    } };
  };
  const language = createSubmenu('language');
  language.item.dataset.codeCodexLanguageTrigger = 'true';
  const languagePopup = language.panel;
  languagePopup.style.width = '160px';
  const compatibility = createSubmenu('compatibility');
  compatibility.item.dataset.codeCodexCompatibilityTrigger = 'true';
  compatibility.panel.append(hostUpdatesItem, retryUpdatesItem);
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
  const quickTourItem = document.createElement('button');
  quickTourItem.type = 'button';
  quickTourItem.tabIndex = -1;
  quickTourItem.setAttribute('role', 'menuitem');
  quickTourItem.dataset.codeCodexQuickTourAction = 'true';
  popup.append(treeItem, marketItem, quickTourItem, runtimeItem, installationItem, compatibility.item, language.item, separator, updateItem, repositoryItem, uninstallSeparator, loginStartupItem, restartItem, uninstallItem);

  // Keep this sibling separate from Codex's React-owned Radix menubar. It
  // shares the visual row without joining Radix's private keyboard collection.
  mount.topBar.insertBefore(host, mount.menubar.nextSibling);
  document.body.append(popup, languagePopup, compatibility.panel);

  const items: HTMLElement[] = [treeItem, marketItem, quickTourItem, runtimeItem, installationItem, compatibility.item, language.item, updateItem, repositoryItem, loginStartupItem, restartItem, uninstallItem];
  for (const [name, group] of [
    ['main', items],
    ['compatibility', [hostUpdatesItem, retryUpdatesItem]],
    ['language', languageOptions],
  ] as const) {
    group.forEach((item, index) => { item.dataset.codeCodexMenuItem = APPLICATION_MENU_ITEMS[name][index]!; });
  }
  const submenus = [
    { ...language, options: languageOptions, key: 'menu.language' },
    { ...compatibility, options: [hostUpdatesItem, retryUpdatesItem], key: 'menu.hostCompatibility' },
  ] as const;
  type Submenu = typeof submenus[number];
  let activeSubmenu: Submenu | undefined;
  let hostStatus: Awaited<ReturnType<NonNullable<ApplicationMenuActions['hostUpdateStatus']>>> | undefined;
  const renderHostReport = () => {
    const counts = hostStatus?.latest?.counts;
    const priority = (counts?.pluginDependency ?? 0) + (counts?.needsReview ?? 0);
    const hasChanges = ['update', 'analysis_refresh'].includes(hostStatus?.latest?.type ?? '') && priority > 0;
    const validation = hostStatus?.validation;
    let suffix = hasChanges ? String(priority) : '';
    if (validation && ['passed', 'manual_required', 'issues_found'].includes(validation.status ?? '')) {
      const issues = Math.max(validation.counts?.issues ?? 0, (validation.checkCounts?.issues ?? 0)+(validation.evidenceCounts?.issues ?? 0));
      const manual = validation.counts?.manualGroups ?? 0;
      suffix = issues || manual ? t('menu.hostValidationSummary', { issues, manual }) : t('menu.hostValidationPassed');
    }
    hostUpdatesItem.textContent = t('menu.hostUpdates') + (suffix ? ` (${suffix})` : '');
  };
  const updateText=()=>{
    loginStartup.render();
    treeItem.textContent=t(actions.isExplorerVisible()?'menu.hideTree':'menu.showTree');
    quickTourItem.textContent = t('welcome.quickTour');
    for(const [item,key] of [[marketItem,'menu.market'],[runtimeItem,'menu.runtime'],[retryUpdatesItem,'menu.hostUpdatesRetry'],[installationItem,'menu.installation'],[restartItem,'menu.restart'],[updateItem,'menu.updates'],[repositoryItem,'menu.repository'],[uninstallItem,'menu.uninstall']] as const)item.textContent=t(key);
    for (const { label, panel, key } of submenus) {
      label.textContent = t(key);
      panel.setAttribute('aria-label', t(key));
    }
    renderHostReport();
    for(const button of languageOptions){const checked=button.dataset.locale===getLocale();button.setAttribute('aria-checked',String(checked));const label=document.createElement('span');label.textContent=button.dataset.languageLabel!;const check=document.createElement('span');check.dataset.codeCodexMenuCheck='true';check.setAttribute('aria-hidden','true');check.innerHTML=nativeMenuCheckSvg;button.replaceChildren(label,check);}
  };
  const unsubscribe=subscribeLanguage(()=>{updateText();position();});
  const closeSub = (returnFocus = false) => {
    if (!activeSubmenu) return;
    const { item, setOpen } = activeSubmenu;
    activeSubmenu = undefined;
    setOpen(false);
    if (returnFocus) item.focus({ preventScroll: true });
  };
  const positionSub = ({ item, panel }: Submenu, rootRect: DOMRect) => {
    const rect = item.getBoundingClientRect();
    const {width,height}=panel.getBoundingClientRect();
    return {panel,left:Math.max(8,rootRect.right+width<=window.innerWidth-8?rootRect.right:rootRect.left-width),
      top:Math.max(8,Math.min(rect.top,window.innerHeight-height-8))};
  };
  const positionSubmenus = () => {
    const rootRect = popup.getBoundingClientRect();
    const positions = submenus.map(submenu => positionSub(submenu, rootRect));
    for (const {panel,left,top} of positions) {
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
  };
  const openSub = (submenu: Submenu, focus = false) => {
    if (activeSubmenu !== submenu) {
      closeSub();
      activeSubmenu = submenu;
      submenu.setOpen(true);
    }
    if (focus) {
      const enabled = submenu.options.filter(option => !option.disabled);
      (enabled.find(option => option.dataset.locale === getLocale()) ?? enabled[0])?.focus({ preventScroll: true });
    }
  };
  const position = () => {
    if (popup.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - popup.offsetWidth - 8));
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(8, Math.min(Math.round(rect.bottom), window.innerHeight - popup.offsetHeight - 8))}px`;
    positionSubmenus();
  };
  let hostStatusEpoch=0;
  const close = (returnFocus = false) => {
    hostStatusEpoch++;
    closeSub();
    if (popup.hidden) return;
    popup.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.dataset.state = 'closed';
    if (returnFocus && trigger.isConnected) trigger.focus();
  };
  const open = (focusFirst = false) => {
    const statusEpoch=++hostStatusEpoch;
    dismissNativeMenu();
    void loginStartup.refresh();
    hostStatus = undefined;
    hostUpdatesItem.title = '';
    delete hostUpdatesItem.dataset.reportStatus;
    delete hostUpdatesItem.dataset.analysisStatus;
    delete hostUpdatesItem.dataset.validationStatus;
    updateText();
    popup.hidden = false;
    void actions.hostUpdateStatus?.().then(value=>{
      if(signal.aborted||popup.hidden||statusEpoch!==hostStatusEpoch)return;
      hostStatus = value;
      renderHostReport();
      positionSubmenus();
      const validation = value.validation;
      hostUpdatesItem.dataset.reportStatus=value.scan?.status??'pending';
      hostUpdatesItem.dataset.analysisStatus=value.analysis?.status??'unknown';
      hostUpdatesItem.dataset.validationStatus=validation?.status??'pending';
      if(validation&&['passed','manual_required','issues_found'].includes(validation.status??'')){
        const manual = validation.counts?.manualGroups ?? 0;
        const isolated=validation.evidenceCounts;
        const evidence=isolated?` Isolated evidence: ${isolated.passed??0} passed, ${isolated.issues??0} issues, ${isolated.manual??0} unavailable.`:'';
        hostUpdatesItem.title=`Automatic checks: ${validation.checkCounts?.passed??0} passed, ${validation.checkCounts?.issues??0} issues, ${validation.checkCounts?.manual??0} unavailable.${evidence} ${manual} grouped acceptance actions remain. See VALIDATION.md.`;
      }else hostUpdatesItem.title=validation?.status==='refresh_required'?'HOST_UPDATE_VALIDATION_STALE: Recheck official Codex updates to validate with the current engine/rules.':'';
      if(value.analysis?.manualRetryRequired)hostUpdatesItem.title=value.analysis.message??'HOST_UPDATE_RULES_CHANGED: Recheck official Codex updates.';
      else if(['partial','unavailable','failed','retry_required'].includes(value.scan?.status??''))hostUpdatesItem.title='HOST_UPDATE_INCOMPLETE: Inventory is incomplete; no no-impact conclusion was made.';
    }).catch(()=>{if(!signal.aborted&&!popup.hidden&&statusEpoch===hostStatusEpoch)hostUpdatesItem.title='HOST_UPDATE_REPORT: Update status is unavailable.';});
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
    const submenu = submenus.find(({ item }) => item === document.activeElement);
    if (submenu && ['ArrowRight', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openSub(submenu, true);
      return;
    }
    if (event.key === 'Escape' && activeSubmenu) {
      event.preventDefault();
      closeSub(true);
      return;
    }
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
      closeSub();
      navigable[next]?.focus();
    }
  }, { signal });
  for (const submenu of submenus) {
    submenu.item.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') openSub(submenu);
    }, { signal });
    submenu.item.addEventListener('click', event => { event.preventDefault(); openSub(submenu, true); }, { signal });
    submenu.panel.addEventListener('keydown', event => {
      if (['Escape', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        closeSub(true);
      } else if (event.key === 'Tab') {
        close();
      } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const enabled = submenu.options.filter(option => !option.disabled);
        const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
          (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
        enabled[next]?.focus();
      }
    }, { signal });
  }
  for (const item of items) {
    if (!submenus.some(submenu => submenu.item === item)) item.addEventListener('pointerenter', () => closeSub(), { signal });
  }
  treeItem.addEventListener("click", () => { close(); actions.toggleExplorer(); }, { signal });
  marketItem.addEventListener("click", () => { close(); actions.openPreviewMarket(); }, { signal });
  quickTourItem.addEventListener('click', () => { close(true); actions.openQuickTour(); }, { signal });
  runtimeItem.addEventListener("click", () => { close(); actions.openRuntimeInformation(); }, { signal });
  installationItem.addEventListener("click", () => { close(); actions.openInstallationFolder(); }, { signal });
  retryUpdatesItem.addEventListener('click',()=>{if(retryUpdatesItem.disabled)return;close();retryUpdatesItem.disabled=true;void actions.retryHostUpdates?.().catch(error=>window.alert(`Starting the official update scan failed.\n${String(error)}`)).finally(()=>{retryUpdatesItem.disabled=false;});},{signal});
  hostUpdatesItem.addEventListener('click',()=>{if(hostUpdatesItem.disabled)return;close();hostUpdatesItem.disabled=true;void actions.openHostUpdates?.().catch(error=>window.alert(`Opening the official update report failed.\n${String(error)}`)).finally(()=>{hostUpdatesItem.disabled=false;});},{signal});
  restartItem.addEventListener('click', () => {
    if(restartItem.disabled)return;
    close(); restartItem.disabled=true;
    void actions.restartCodeCodex().then(result=>{if(result?.scheduled!==true)throw Error('Restart was not scheduled.');}).catch(error=>{
      window.alert(`Restarting Code-Codex failed.\n${String(error)}`);
    }).finally(()=>{restartItem.disabled=false;});
  }, {signal});
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
    if (target instanceof Node && !host.contains(target) && !popup.contains(target) && !activeSubmenu?.panel.contains(target)) close();
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
      unsubscribe();
      for (const { panel } of submenus) panel.remove();
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
