import { observeNativeLogin } from './native-login-observation';
export { NATIVE_LOGIN_SELECTOR } from './native-login-observation';

export function nativeLoginSurface(root: ParentNode = document): HTMLElement | null {
  return observeNativeLogin(root).surface;
}

export function isNativeLoginView(root: ParentNode = document): boolean {
  if (nativeLoginSurface(root)) return true;
  // Also hide the explorer while the native login route is loading.
  const url = new URL(window.location.href);
  return /^\/(login|logout|welcome|select-workspace)(\/|$)/.test(url.pathname) ||
    /^#\/?(login|logout|welcome|select-workspace)([/?]|$)/.test(url.hash);
}

export function reconcileLoginBackground(): void {
  const panel = nativeLoginSurface();
  const login = isNativeLoginView();
  document.documentElement.toggleAttribute("data-code-codex-login-screen", login);
  const backdrops = new Set<Element>();
  if (panel) for (let parent = panel.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) backdrops.add(parent);
  for (const old of document.querySelectorAll('[data-code-codex-login-surface], [data-code-codex-login-backdrop]')) {
    if (old !== panel) old.removeAttribute("data-code-codex-login-surface");
    if (!backdrops.has(old)) old.removeAttribute("data-code-codex-login-backdrop");
  }
  panel?.setAttribute("data-code-codex-login-surface", "");
  for (const parent of backdrops) parent.setAttribute("data-code-codex-login-backdrop", "");
}

export const LOGIN_BACKGROUND_CSS = `
html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) [data-code-codex-login-backdrop] {
  background-color: transparent !important; background-image: none !important;
}
html:is([data-code-codex-particle-image-background], [data-code-codex-glow-horizon-background]) [data-code-codex-login-surface] {
  background-color: rgba(11,12,15,var(--code-codex-mask-login, .58)) !important;
  background-image: none !important;
}
`;
