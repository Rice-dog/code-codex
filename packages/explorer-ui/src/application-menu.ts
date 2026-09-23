interface ApplicationMenuActions {
  isExplorerVisible(): boolean;
  toggleExplorer(): void;
  openPreviewMarket(): void;
}

interface MenuMount {
  topBar: HTMLElement;
  menubar: HTMLElement;
  help: HTMLButtonElement;
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
${MENU_POPUP_SELECTOR} {
  position: fixed;
  z-index: 2147483000;
  min-width: 190px;
  padding: 5px;
  border: 1px solid var(--color-border-primary-outline, rgba(128, 128, 128, .24));
  border-radius: 10px;
  background: var(--color-surface-elevated-secondary, #fff);
  color: var(--color-text-primary, #1a1c1f);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .16);
  font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
${MENU_POPUP_SELECTOR}[hidden] { display: none !important; }
${MENU_POPUP_SELECTOR} > button {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
${MENU_POPUP_SELECTOR} > button:hover,
${MENU_POPUP_SELECTOR} > button:focus-visible {
  background: var(--color-background-primary-surface, rgba(128, 128, 128, .1));
  outline: none;
}
`;

function stateStore(): Record<PropertyKey, unknown> {
  return window as unknown as Record<PropertyKey, unknown>;
}

function findMenuMount(): MenuMount | null {
  const help = document.getElementById("application-menu-trigger-help-menu");
  if (!(help instanceof HTMLButtonElement) || help.getAttribute("aria-label") !== "Help") return null;
  const menubar = help.parentElement;
  if (!(menubar instanceof HTMLElement) || menubar.getAttribute("role") !== "menubar" ||
      menubar.getAttribute("aria-label") !== "Application menu") return null;
  const expected = ["file", "edit", "view", "help"].map((name) =>
    menubar.querySelector(`#application-menu-trigger-${name}-menu`));
  if (expected.some((button) => !(button instanceof HTMLButtonElement)) || expected[3] !== help) return null;
  const topBar = menubar.parentElement;
  if (!(topBar instanceof HTMLElement) || !topBar.isConnected || topBar.parentElement === null) return null;
  return { topBar, menubar, help };
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
  trigger.className = mount.help.className;
  trigger.textContent = "Code-Codex";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "code-codex-application-menu-popup");
  host.append(trigger);

  const popup = document.createElement("div");
  popup.dataset.codeCodexApplicationMenuPopup = "true";
  popup.id = "code-codex-application-menu-popup";
  popup.setAttribute("role", "menu");
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
  popup.append(treeItem, marketItem);

  // Keep this sibling separate from Codex's React-owned Radix menubar. It
  // shares the visual row without joining Radix's private keyboard collection.
  mount.topBar.insertBefore(host, mount.menubar.nextSibling);
  document.body.append(popup);

  const items = [treeItem, marketItem];
  const position = () => {
    if (popup.hidden) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8));
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - popup.offsetHeight - 8)}px`;
  };
  const close = (returnFocus = false) => {
    if (popup.hidden) return;
    popup.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus && trigger.isConnected) trigger.focus();
  };
  const open = (focusFirst = false) => {
    treeItem.textContent = actions.isExplorerVisible() ? "Hide File Tree" : "Show File Tree";
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    position();
    if (focusFirst) treeItem.focus();
  };

  trigger.addEventListener("click", () => popup.hidden ? open() : close(), { signal });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open();
      (event.key === "ArrowDown" ? treeItem : marketItem).focus();
    } else if (event.key === "Escape") {
      close(true);
    }
  }, { signal });
  popup.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }, { signal });
  treeItem.addEventListener("click", () => { close(); actions.toggleExplorer(); }, { signal });
  marketItem.addEventListener("click", () => { close(); actions.openPreviewMarket(); }, { signal });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && !host.contains(target) && !popup.contains(target)) close();
  }, { capture: true, signal });
  window.addEventListener("resize", position, { signal });
  window.addEventListener("scroll", position, { capture: true, signal });

  return {
    owner, mount, host, popup,
    dispose: () => {
      controller.abort();
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
      previous.mount.menubar === mount.menubar && previous.host.isConnected && previous.popup.isConnected) return;
  previous?.dispose();
  delete store[MENU_STATE];
  for (const old of document.querySelectorAll(`${MENU_HOST_SELECTOR}, ${MENU_POPUP_SELECTOR}`)) old.remove();
  if (!mount || !document.body) return;
  store[MENU_STATE] = createMenu(mount, actions);
}
