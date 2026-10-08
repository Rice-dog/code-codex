const TRANSPARENT_BACKGROUND_ATTRIBUTE='data-code-codex-transparent-background';
const TRANSPARENT_BACKGROUND_COLOR_PROPERTY='--code-codex-window-background';
const TRANSPARENT_BACKGROUND_CSS = `
html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] {
  background-color: var(${TRANSPARENT_BACKGROUND_COLOR_PROPERTY}) !important;
}

html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body,
html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body :where(
  div,
  main,
  aside,
  section,
  article,
  header,
  footer,
  nav,
  form,
  dialog,
  ul,
  ol,
  li,
  button,
  input,
  textarea,
  select
):not([role="img"]):not([data-icon]):not([class*="icon" i]) {
  background-color: transparent !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

html[${TRANSPARENT_BACKGROUND_ATTRIBUTE}] body :is(
  [class*="bg-gradient-to-t"],
  [class*="MainContentTopFade"]
) {
  background-image: none !important;
}
`;
const ATTRIBUTE='data-code-codex-transparent-background';
const COLOR='--code-codex-window-background';
export function installTransparentBackgroundStyle():void{
 let style=document.querySelector<HTMLStyleElement>('style[data-code-codex-transparent-background="v1"]');
 if(!style){style=document.createElement('style');style.dataset.codeCodexTransparentBackground='v1';(document.head??document.documentElement).append(style);}
 if(style.textContent!==TRANSPARENT_BACKGROUND_CSS)style.textContent=TRANSPARENT_BACKGROUND_CSS;
}
export function presentation():string|undefined{const root=document.documentElement;const color=root.style.getPropertyValue(COLOR).trim();return root.hasAttribute(ATTRIBUTE)&&color==='transparent'?color:undefined;}
export function applyPresentation(background:string):void{installTransparentBackgroundStyle();const root=document.documentElement;root.style.setProperty(COLOR,background);root.setAttribute(ATTRIBUTE,'');}
export function clearPresentation():void{document.documentElement.removeAttribute(ATTRIBUTE);document.documentElement.style.removeProperty(COLOR);}
