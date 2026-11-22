import {activePageElements,MAIN_SURFACE_SELECTOR,NATIVE_FIXED_TITLEBAR_SELECTOR} from './adapters/codex-26.715';
import {NATIVE_SECONDARY_CONTENT_BACKING,NATIVE_SECONDARY_PAINT_SCOPE,NATIVE_SECONDARY_STICKY_HEADER,NATIVE_SECONDARY_TOP_FADE} from './native-workspace-background';
import {inspectSidePanelOpacity} from './native-side-panel-opacity';
import {unexpectedPaint} from './host-paint-inspection';
import type {ProbeResult} from './host-update-background';

const railSelector='[data-app-navigation-rail]';
const secondaryPaint={
  header:NATIVE_SECONDARY_STICKY_HEADER,
  edge:NATIVE_SECONDARY_TOP_FADE,
  content:NATIVE_SECONDARY_CONTENT_BACKING,
} as const;
const visible=(node:Element)=>node.checkVisibility()&&node.getBoundingClientRect().height>0;
const manual=(detail:string):ProbeResult=>({status:'manual',detail});

export function inspectNavigationDestination(doc:Document,id:string):ProbeResult {
  const rails=activePageElements(doc,railSelector).filter(visible);
  if(rails.length!==1)return manual('A unique visible native navigation rail is required.');
  const selector=id==='explore'?'button[data-slot="popover-trigger"][aria-haspopup="dialog"]':
    `:is(button,a)[data-sidebar-destination="builtin:${id}"]`;
  const entries=[...rails[0]!.querySelectorAll(selector)].filter(visible);
  if(!entries.length)return manual(`Native navigation destination ${id} is not available for this host or account.`);
  const accessible=entries.length===1&&!!(entries[0]!.getAttribute('aria-label')?.trim()||entries[0]!.textContent?.trim());
  return {status:accessible?'passed':'issue',detail:`Native navigation destination ${id}: ${entries.length} visible entries. Navigation was not triggered.`};
}

export function inspectSecondaryPaint(doc:Document,kind:keyof typeof secondaryPaint):ProbeResult {
  if(!doc.documentElement.matches(NATIVE_SECONDARY_PAINT_SCOPE))return manual('No supported background or native window transparency is active.');
  const nodes=activePageElements(doc,secondaryPaint[kind]).filter(visible);
  if(!nodes.length)return manual(`No mounted native secondary page ${kind} layer was available.`);
  const paint=unexpectedPaint(nodes);
  return {status:paint.length?'issue':'passed',detail:paint.length
    ?`Native secondary page ${kind} still paints a backing: ${paint[0]}.`
    :`Checked ${nodes.length} visible secondary page ${kind} layer(s), including generated layers.`};
}

/** Find broad paint by where it lands, independently of the repair selectors. */
export function inspectSecondaryPaintCoverage(doc: Document): ProbeResult {
  if (!doc.documentElement.matches(NATIVE_SECONDARY_PAINT_SCOPE)) return manual('No supported background or native window transparency is active.');
  const pages = activePageElements(doc, MAIN_SURFACE_SELECTOR).filter(page => visible(page) &&
    page.querySelector('[data-app-shell-main-content-layout="default"], [data-app-shell-main-content-layout="full-bleed"]') &&
    !page.querySelector('[data-codex-composer-root], [data-app-shell-main-content-layout="thread-edge-scroll"]'));
  if (pages.length !== 1) return manual('A unique visible native secondary page is required for region paint inspection.');
  const page = pages[0]!;
  const viewport = page.getBoundingClientRect();
  const view = doc.defaultView!;
  const candidates = [page, ...page.querySelectorAll('main, section, header, footer, div')];
  if (candidates.length > 1600) return manual('The secondary page exceeds the bounded region inspection.');
  for (const node of candidates) {
    if (node.closest('[inert], [data-app-shell-active-page="false"], [role="dialog"], [popover], button, a, article, [role="listitem"]')) continue;
    const bounds = node.getBoundingClientRect();
    const width = Math.min(viewport.right, bounds.right) - Math.max(viewport.left, bounds.left);
    const height = Math.min(viewport.bottom, bounds.bottom) - Math.max(viewport.top, bounds.top);
    if (width < viewport.width * .85 || height <= 0 || !node.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) continue;
    const region = height > viewport.height * .6 ? 'content' : bounds.top < viewport.top + 96 ? 'top' : bounds.bottom > viewport.bottom - 48 ? 'bottom' : null;
    if (!region) continue;
    const paint = unexpectedPaint([node])[0];
    if (paint) return {status:'issue',detail:`Unexpected secondary ${region} paint (${Math.round(width)} × ${Math.round(height)} CSS px): ${paint}.`};
    const style = view.getComputedStyle(node);
    if (region !== 'content' && style.boxShadow !== 'none') return {status:'issue',detail:`Unexpected secondary ${region} shadow: ${style.boxShadow}.`};
  }
  return {status:'passed',detail:'Broad top, content and bottom paint was checked independently of the repair selectors.'};
}

const toolbarButtons={
  share:'button:is([aria-label="Share"],[aria-label="分享"],[data-testid="share-button"])',
  summary:'button[aria-pressed]:is([aria-label="Toggle pinned summary"],[aria-label="切换固定摘要"])',
  tabs:'button[data-app-shell-workspace-layout-toggle="main"]',
} as const;
type ToolbarAction=keyof typeof toolbarButtons;
const overlaps=(a:DOMRect,b:DOMRect)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;

export function inspectConversationToolbar(doc:Document) {
  const header=activePageElements(doc,NATIVE_FIXED_TITLEBAR_SELECTOR).filter(visible);
  const main=activePageElements(doc,MAIN_SURFACE_SELECTOR).filter(visible);
  const candidates=header.length===1?header[0]!:main.length===1?main[0]!:undefined;
  const buttons=new Map((Object.entries(toolbarButtons) as [ToolbarAction,string][]).map(([action,selector])=>
    [action,candidates?[...candidates.querySelectorAll(selector)].filter(visible):[]]));
  return (action:ToolbarAction,paintOnly=false):ProbeResult=>{
    const matches=buttons.get(action)!;
    if(!candidates||!matches.length)return manual(`The native ${action} toolbar action is not mounted or its accessible action could not be identified.`);
    const button=matches[0]!,bounds=button.getBoundingClientRect(),toolbar=header[0]?.getBoundingClientRect();
    if(paintOnly){
      if(!doc.documentElement.matches(NATIVE_SECONDARY_PAINT_SCOPE))return manual('A background or window transparency must be active to check the native toolbar backing.');
      if(matches.length!==1)return {status:'issue',detail:`The native ${action} backing has ambiguous owners.`};
      const backing=button.closest('[data-app-shell-focus-area="main"]:not(button)')??header[0];
      if(!backing||backing===main[0])return manual(`No independent native ${action} toolbar backing was found.`);
      const paint=unexpectedPaint([backing]);
      return {status:paint.length?'issue':'passed',detail:paint.length?`Native ${action} toolbar has an opaque backing or gradient: ${paint[0]}.`:`The native ${action} toolbar backing and generated layers let the background through.`};
    }
    const svg=button.querySelector('svg')?.getBoundingClientRect();
    const named=!!(button.getAttribute('aria-label')?.trim()||button.textContent?.trim());
    const clipped=bounds.left< -1||bounds.right>doc.documentElement.clientWidth+1||
      !!toolbar&&(bounds.left<toolbar.left-1||bounds.right>toolbar.right+1)||
      !!svg&&(svg.width===0||svg.height===0||svg.left<bounds.left-1||svg.right>bounds.right+1||svg.top<bounds.top-1||svg.bottom>bounds.bottom+1);
    const squeezed=bounds.width+1<bounds.height;
    const collision=[...buttons.values()].flat().some(other=>other!==button&&overlaps(bounds,other.getBoundingClientRect()));
    if(matches.length!==1||!named||clipped||squeezed||collision)return {status:'issue',detail:`Native ${action} toolbar control is duplicated, unnamed, clipped, squeezed or overlapping.`};
    return {status:'passed',detail:`Native ${action} control fits the toolbar and does not overlap the other named actions.`};
  };
}

export function inspectToolbarPanelPaint(doc:Document,action:'summary'|'tabs'):ProbeResult {
  return inspectSidePanelOpacity(doc,action==='summary'?'summary':'right');
}
