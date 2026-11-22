// Shared native page backings used by Particle, Glow and local media.
// Native cached pages can insert display:contents wrappers below the focus area.
// Match layout contracts, leaving controls, menus and media content native.
export const NATIVE_SETTINGS_MAIN = ':is(main.main-surface, [data-app-shell-main-surface="default"])';
export const NATIVE_SETTINGS_PANEL = '[data-app-shell-focus-area="main"] [class~="electron:bg-surface"][class*="rounded-tl-lg"]';
export const NATIVE_SETTINGS_PAGE = '[data-app-shell-focus-area="main"] div.bg-surface.flex:is(.h-full, .min-h-full, .flex-1):not([data-app-shell-main-content-layout="thread-edge-scroll"] *):not([role="dialog"]):not([role="dialog"] *):not([role="menu"]):not([role="menu"] *):not([data-radix-popper-content-wrapper] *)';
export const NATIVE_SETTINGS_BACKING = 'data-code-codex-native-settings-backing';
export function nativeSettingsBackgroundCss(attribute:string):string {
 const main=NATIVE_SETTINGS_MAIN;
 return `html[${attribute}] body ${main}[${NATIVE_SETTINGS_BACKING}],
html[${attribute}] body ${main} :is(${NATIVE_SETTINGS_PANEL}, ${NATIVE_SETTINGS_PAGE}),
html[${attribute}] body ${main}[${NATIVE_SETTINGS_BACKING}] [class*="WorkspaceContent"]::before,
html[${attribute}] body ${main} [data-app-shell-focus-area="main"] [data-app-shell-inline-page-header] [data-collapsible][data-sticky]::before {
  background-color: transparent !important;
  background-image: none !important;
}

/* Native Settings section cards read this variable directly in their shared
 * component. Keep their borders and foreground/control state unchanged. */
html[${attribute}] body ${main} [class~="group/settings"] {
  --color-background-panel: transparent;
}`;
}
