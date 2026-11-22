import {unexpectedPaint} from './host-paint-inspection';

// Native panels keep their own controls. Reuse Surface's utility preference,
// painting a single backing instead of fading content or stacking masks.
export const SIDE_PANEL_ROOTS = 'aside[data-app-shell-focus-area="right-panel"], [data-summary-panel-variant="summary"][data-summary-panel-density]';
export const SIDE_PANEL_BACKINGS = 'aside[data-app-shell-focus-area="right-panel"] [data-app-shell-compact-page-gutter], aside[data-app-shell-focus-area="right-panel"] [data-new-tab-scroll-root]';
export const NATIVE_SIDE_PANEL_OPACITY_CSS = `
html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active] body :is(${SIDE_PANEL_ROOTS}) {
  --app-shell-panel-background: transparent;
  background-color:rgba(16,17,20,var(--code-codex-mask-utility)) !important;
  background-image:none !important;
}
html[data-code-codex-ui-mask-active][data-code-codex-ui-mask-active] body :is(${SIDE_PANEL_BACKINGS}) {
  background-color:transparent !important;
  background-image:none !important;
}`;

export function inspectSidePanelOpacity(root:Document,area?:'summary'|'right'):{status:'passed'|'issue'|'manual';detail:string} {
  const style = (node:Element) => root.defaultView!.getComputedStyle(node);
  const alpha=style(root.documentElement).getPropertyValue('--code-codex-mask-utility').trim();
  const visible=(selector:string)=>Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&style(e).visibility==='visible';});
  const panels=visible(SIDE_PANEL_ROOTS).filter(panel=>{
    if(!area)return true;
    const bounds=panel.getBoundingClientRect();
    const visibleWidth=Math.min(bounds.right,root.documentElement.clientWidth)-Math.max(0,bounds.left);
    return (area==='summary')===panel.hasAttribute('data-summary-panel-variant')&&
      visibleWidth>bounds.width/2&&bounds.bottom>0&&bounds.top<root.documentElement.clientHeight;
  });
  if(!root.documentElement.hasAttribute('data-code-codex-ui-mask-active')||!alpha||!panels.length)return {status:'manual',detail:'Open a native summary or side panel with UI Surface Opacity active to inspect its backing.'};
  const expected=Number(alpha),bad=panels.some(e=>{const s=style(e),m=s.backgroundColor.match(/^rgba?\(([^)]+)\)$/);const parts=m?.[1]?.split(',').map(Number);return !parts||Math.abs((parts[3]??1)-expected)>.005||s.backgroundImage!=='none';});
  const paint=unexpectedPaint(visible(SIDE_PANEL_BACKINGS).filter(node=>panels.some(panel=>panel.contains(node))));
  return {status:bad||paint.length?'issue':'passed',detail:bad||paint.length?'Native side-panel backing does not follow the utility opacity or has repeated paint.':'Mounted native side/summary backings follow utility opacity with no repeated inner paint. Browser, terminal and media content are excluded.'};
}
