// Shared native Settings backing used by Particle, Glow and local media.
// Match the observed focus-area/utility-class structure, never a CSS-module hash.
// Content cards and form controls inside this backing retain their native styles.
export function nativeSettingsBackgroundCss(attribute:string):string {
 return `html[${attribute}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
):has(
  [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"]
) {
  background-color: transparent !important;
  background-image: none !important;
}

html[${attribute}] body :is(
  main.main-surface,
  [data-app-shell-main-surface="default"]
) [data-app-shell-focus-area="main"] > div > div[class*="electron\\:bg-surface"][class*="rounded-tl-lg"] {
  background-color: transparent !important;
  background-image: none !important;
}`;
}
