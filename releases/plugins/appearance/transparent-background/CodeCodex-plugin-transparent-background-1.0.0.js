(()=>{var l=Object.defineProperty;var u=(t,e)=>{for(var d in e)l(t,d,{get:e[d],enumerable:!0})};var a={};u(a,{applyPresentation:()=>b,clearPresentation:()=>g,installTransparentBackgroundStyle:()=>i,presentation:()=>p});var o="data-code-codex-transparent-background",m="--code-codex-window-background",c=`
html[${o}] {
  background-color: var(${m}) !important;
}

html[${o}] body,
html[${o}] body :where(
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

html[${o}] body :is(
  [class*="bg-gradient-to-t"],
  [class*="MainContentTopFade"]
) {
  background-image: none !important;
}
`,n="data-code-codex-transparent-background",r="--code-codex-window-background";function i(){let t=document.querySelector('style[data-code-codex-transparent-background="v1"]');t||(t=document.createElement("style"),t.dataset.codeCodexTransparentBackground="v1",(document.head??document.documentElement).append(t)),t.textContent!==c&&(t.textContent=c)}function p(){let t=document.documentElement,e=t.style.getPropertyValue(r).trim();return t.hasAttribute(n)&&e==="transparent"?e:void 0}function b(t){i();let e=document.documentElement;e.style.setProperty(r,t),e.setAttribute(n,"")}function g(){document.documentElement.removeAttribute(n),document.documentElement.style.removeProperty(r)}var s=Symbol.for("code-codex:plugin-modules:v1"),y=window[s]??(window[s]=new Map);y.set("transparent-background",{id:"transparent-background",api:1,version:"1.0.0",exports:a});})();
