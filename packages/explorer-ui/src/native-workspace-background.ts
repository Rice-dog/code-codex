import {BACKGROUND_SURFACE_ATTRIBUTES} from './components/styles/background-surfaces';
import {MAIN_SURFACE_SELECTOR} from './adapters/codex-26.715';

export const NATIVE_WORKSPACE_SELECTOR =
  ':is([data-app-shell-workspace="true"],[data-app-shell-workspace-row="true"])';
export const NATIVE_WORKSPACE_BACKING_SELECTOR =
  '[data-app-shell-surface-backing="true"].pointer-events-none';
export const NATIVE_PAGE_FRAME_SELECTOR =
  '[data-app-shell-frame="true"][data-app-shell-page-surface="true"]';
export const NATIVE_TURN_CHANGE_HEADER = '[class~="group/turn-diff-header"]';
export const NATIVE_TURN_CHANGE_CARD_SELECTOR =
  `${MAIN_SURFACE_SELECTOR} div:has(> ${NATIVE_TURN_CHANGE_HEADER})`;
const TURN_CHANGE_ROWS = `${NATIVE_TURN_CHANGE_CARD_SELECTOR} [class~="group/turn-diff-file-row"]`;
export const NATIVE_TURN_CHANGE_ROW_SELECTOR =
  `${TURN_CHANGE_ROWS} > :is(.contents,[data-state]) > button`;
const WRAPPED_TURN_CHANGE_ROW = `${MAIN_SURFACE_SELECTOR} [class~="group/turn-diff-file-row"] > [data-state]:not(.contents) > button`;
const MASK_SCOPE = 'html[data-code-codex-ui-mask-active]';
export const NATIVE_SECONDARY_LAYOUT = '[data-app-shell-main-content-layout]:is([data-app-shell-main-content-layout="default"],[data-app-shell-main-content-layout="full-bleed"])';
export const NATIVE_SECONDARY_STICKY_HEADER = `${MAIN_SURFACE_SELECTOR} [data-app-shell-focus-area="main"] [data-app-shell-inline-page-header] [data-sticky]:is([data-collapsible],[data-expand-search])`;
export const NATIVE_SECONDARY_TOP_FADE = `${MAIN_SURFACE_SELECTOR} ${NATIVE_SECONDARY_LAYOUT} .pointer-events-none.absolute.top-0[class*="--app-shell-content-fade"]`;
export const NATIVE_SECONDARY_CONTENT_BACKING = `${MAIN_SURFACE_SELECTOR} [data-app-shell-main-content-layout="full-bleed"] [data-app-shell-focus-area="main"] main.bg-surface.flex.h-full`;
export const NATIVE_SECONDARY_PAINT_SCOPE = `:is(${BACKGROUND_SURFACE_ATTRIBUTES.map(attribute=>`[${attribute}]`).join(',')},[data-code-codex-transparent-background])`;
const EDGE_SCROLL_LAYOUT = '[data-app-shell-main-content-layout="thread-edge-scroll"]';
export const CONVERSATION_TRANSPARENCY_SELECTOR =
  ':is([data-code-codex-ui-mask-active],[data-code-codex-transparent-background])';
export const NATIVE_CONVERSATION_TOP_FADE_SELECTOR = `${MAIN_SURFACE_SELECTOR} :is(
  [class*="MainContentTopFade"],
  ${EDGE_SCROLL_LAYOUT} .pointer-events-none.absolute.top-0[class*="--app-shell-content-fade"]
)`;

// The official shell draws this decorative layer behind both the injected
// tree and the conversation. Their own opacity controls cannot uncover it.
export const NATIVE_WORKSPACE_BACKGROUND_CSS = `
html:is(${BACKGROUND_SURFACE_ATTRIBUTES.map(attribute=>`[${attribute}]`).join(',')})
  ${NATIVE_WORKSPACE_SELECTOR} > ${NATIVE_WORKSPACE_BACKING_SELECTOR} {
  background: transparent !important;
}
${MASK_SCOPE} body ${NATIVE_PAGE_FRAME_SELECTOR} {
  background-image: none !important;
}
${MASK_SCOPE} body ${WRAPPED_TURN_CHANGE_ROW} {
  background-color: transparent !important;
}
${MASK_SCOPE} body ${WRAPPED_TURN_CHANGE_ROW}:hover {
  background-color: color-mix(in srgb,var(--color-background-primary-ghost-hover,rgba(128,128,128,.12)) 60%,transparent) !important;
}
html${CONVERSATION_TRANSPARENCY_SELECTOR} body ${NATIVE_CONVERSATION_TOP_FADE_SELECTOR} {
  background-color: transparent !important;
  background-image: none !important;
}
html${NATIVE_SECONDARY_PAINT_SCOPE} body :is(${NATIVE_SECONDARY_STICKY_HEADER},
  ${NATIVE_SECONDARY_TOP_FADE},${NATIVE_SECONDARY_CONTENT_BACKING}),
html${NATIVE_SECONDARY_PAINT_SCOPE} body ${NATIVE_SECONDARY_STICKY_HEADER}::before {
  background-color: transparent !important;
  background-image: none !important;
}
`;
