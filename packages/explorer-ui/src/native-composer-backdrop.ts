import {unexpectedPaint} from './host-paint-inspection';
import {MAIN_SURFACE_SELECTOR, activePageElements} from './adapters/codex-26.715';

// Native transcript decoration, outside the independently masked composer.
// Structural anchors survive CSS-module suffixes and footer remounts.
const footer = `${MAIN_SURFACE_SELECTOR} .thread-scroll-container > .pointer-events-none:has(> [data-thread-scroll-footer="true"])`;
export const NATIVE_COMPOSER_BACKDROP_CSS = [footer, `${footer}::before`, `${footer}::after`]
 .map(selector => `html[data-code-codex-ui-mask-active] body ${selector}`)
 .join(',\n') + '{background-color:transparent!important;background-image:none!important;}';

export function inspectComposerBackdrop(doc:Document):{status:'passed'|'issue'|'manual';detail:string} {
 if (!doc.documentElement.hasAttribute('data-code-codex-ui-mask-active')) return {status:'manual',detail:'Surface opacity is inactive; transparent footer paint was not exercised.'};
 const footers=activePageElements<HTMLElement>(doc, `${MAIN_SURFACE_SELECTOR} [data-thread-scroll-footer="true"]`)
  .filter(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0);
 if(!footers.length)return {status:'manual',detail:'No visible native thread footer is mounted; check an existing conversation with surface opacity active.'};
 const painted=unexpectedPaint(footers.flatMap(e=>e.parentElement?.matches('.pointer-events-none')?[e,e.parentElement]:[e]));
 return painted.length?{status:'issue',detail:`Native footer decoration adds paint above the conversation mask: ${painted.join(' | ')}`}:
  {status:'passed',detail:'Visible native footer and parent backgrounds, including generated before/after layers, are transparent. Current paint only; fold/remount and other themes require their own scenarios.'};
}
