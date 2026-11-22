import {UPDATE_MOUNT_READY} from './host-update-mount';
import {inspectComposerBackdrop} from './native-composer-backdrop';
import {inspectSidePanelOpacity} from './native-side-panel-opacity';
import {nativeSettingsBackgroundCss} from './native-background-surfaces';
import {CONVERSATION_TRANSPARENCY_SELECTOR,NATIVE_CONVERSATION_TOP_FADE_SELECTOR,NATIVE_PAGE_FRAME_SELECTOR,NATIVE_TURN_CHANGE_CARD_SELECTOR,NATIVE_TURN_CHANGE_ROW_SELECTOR,NATIVE_WORKSPACE_BACKING_SELECTOR,NATIVE_WORKSPACE_SELECTOR} from './native-workspace-background';
import {BACKGROUND_SURFACE_ATTRIBUTES} from './components/styles/background-surfaces';
import {unexpectedPaint} from './host-paint-inspection';
import {activePageElements,SPLIT_MAIN_VIEW_SELECTOR,SPLIT_MAIN_FRAME_SELECTOR} from './adapters/codex-26.715';
import {inspectSecondaryPaint, inspectSecondaryPaintCoverage} from './host-navigation-inspection';

export type ProbeResult = {status:'passed'|'issue'|'manual';detail:string};
export type UpdateCheck = ProbeResult & {id:string;scope:string};
const treeSelector = '[data-code-codex-owned="true"]';
const scope = 'isolated-mounted-regression';
const backgroundAttribute = 'data-code-codex-glow-horizon-background';

export function mountedExplorer(): HTMLElement | undefined {
  const trees = [...document.querySelectorAll<HTMLElement>(treeSelector)].filter(tree =>
    tree.shadowRoot?.querySelector('.preview-market-popover'));
  return trees.length === 1 ? trees[0] : undefined;
}

export async function waitForUpdateMount(expectedVersion: string): Promise<void> {
  const ready = () => {
    const owner = Reflect.get(window, Symbol.for('code-codex:document-connection-owner:v2'));
    return owner?.version === expectedVersion && !owner.pending && !!mountedExplorer();
  };
  if (ready()) return;
  // The existing native probe also has a deadline. This earlier limit only
  // releases a missing mount and lets the available results reach the ledger.
  await new Promise<void>(resolve => {
    const listeners = new AbortController();
    const finish = () => {
      listeners.abort();
      clearTimeout(deadline);
      resolve();
    };
    const deadline = setTimeout(finish, 4000);
    window.addEventListener(UPDATE_MOUNT_READY, () => { if (ready()) finish(); }, {signal:listeners.signal});
    window.addEventListener('pagehide', finish, {once:true,signal:listeners.signal});
  });
}

export function inspectSplitLayout(doc: Document): ProbeResult {
  const visible = (el:Element) => {
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0 && !el.closest('[data-app-shell-active-page="false"],[inert],[aria-hidden="true"]');
  };
  const views = [...doc.querySelectorAll(SPLIT_MAIN_VIEW_SELECTOR)]
    .filter(v => v.closest('main') && visible(v));
  const panels = [...doc.querySelectorAll('aside[data-app-shell-focus-area="right-panel"]')].filter(visible);
  if (views.length !== 1 || panels.length !== 1) return {
    status:'manual',detail:'A unique visible native split and right panel are required for live geometry validation.'
  };
  const view = views[0]!;
  const frames = [...view.children].filter(el => el.matches(SPLIT_MAIN_FRAME_SELECTOR) && visible(el));
  if (frames.length !== 1) return {status:'manual',detail:'The mounted split does not expose a unique measurable main frame.'};
  const viewport = view.getBoundingClientRect();
  const boxes = [frames[0]!, ...frames[0]!.querySelectorAll('[data-codex-composer-root]')].filter(visible).map(el=>el.getBoundingClientRect());
  const left = Math.max(0, ...boxes.map(box=>viewport.left-box.left));
  const right = Math.max(0, ...boxes.map(box=>box.right-viewport.right));
  return {status:left<=1&&right<=1?'passed':'issue',detail:`Main frame and visible composers: leftOverflow=${left.toFixed(2)}px, rightOverflow=${right.toFixed(2)}px.`};
}

export function inspectTreeTopAlignment(tree: HTMLElement | undefined): ProbeResult {
  const workspace = tree?.parentElement;
  if (tree?.dataset.placement !== 'inline' || tree.dataset.mountStrategy !== 'known:workspace-row'
      || !workspace?.matches(NATIVE_WORKSPACE_SELECTOR)) {
    return {status:'manual',detail:'An inline file tree in a qualified native workspace is required.'};
  }
  const frame = tree.getBoundingClientRect();
  if (!frame.width || !frame.height) {
    return {status:'manual',detail:'The inline file tree is not visible.'};
  }
  const offset = frame.top - workspace.getBoundingClientRect().top;
  return {status:Math.abs(offset)<=1?'passed':'issue',
    detail:`File tree top relative to the native workspace: ${offset.toFixed(2)} CSS px.`};
}

export function inspectWorkspaceBackingPaint(doc: Document, main: Element | undefined, tree: HTMLElement | undefined): ProbeResult {
  const root = doc.documentElement;
  const workspace = main?.closest(NATIVE_WORKSPACE_SELECTOR);
  const backings = workspace ? [...workspace.children].filter(el=>el.matches(NATIVE_WORKSPACE_BACKING_SELECTOR)
    && el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0) : [];
  if (!BACKGROUND_SURFACE_ATTRIBUTES.some(attribute=>root.hasAttribute(attribute))
      || !main || backings.length!==1) {
    return {status:'manual',detail:'An active background and a unique mounted native workspace backing are required.'};
  }
  const nodes = backings.slice();
  if (root.hasAttribute('data-code-codex-ui-mask-active')) {
    const style = doc.defaultView!.getComputedStyle(root);
    if (style.getPropertyValue('--code-codex-mask-conversation').trim()==='0') nodes.push(main);
    const treeFrame = tree && tree.parentElement===workspace
      ? tree.shadowRoot?.querySelector(tree.dataset.collapsed==='true'?'.collapsed-tab':'.frame') : null;
    if (treeFrame?.getBoundingClientRect().height && style.getPropertyValue('--code-codex-mask-tree').trim()==='0') nodes.push(treeFrame);
  }
  const painted = unexpectedPaint(nodes);
  return {status:painted.length?'issue':'passed',detail:painted.length
    ? `Unexpected workspace backing paint: ${painted.join(' | ')}`
    : 'The shared native backing and any mounted zero-opacity surfaces are transparent.'};
}

export function inspectConversationTopPaint(doc: Document): ProbeResult {
  if (!doc.documentElement.matches(CONVERSATION_TRANSPARENCY_SELECTOR)) {
    return {status:'manual',detail:'No conversation transparency mode is active.'};
  }
  const fades = activePageElements(doc,NATIVE_CONVERSATION_TOP_FADE_SELECTOR).filter(el=>{
    const box = el.getBoundingClientRect();
    return box.width>0 && box.height>0 && !el.closest('[inert]')
      && doc.defaultView!.getComputedStyle(el).visibility==='visible';
  });
  if (!fades.length) return {status:'manual',detail:'No visible native top scroll decoration is mounted.'};
  const painted = unexpectedPaint(fades);
  return painted.length
    ? {status:'issue',detail:`Native top scroll decoration adds paint above the conversation mask: ${painted.join(' | ')}`}
    : {status:'passed',detail:'Mounted native top scroll decoration adds no color or gradient above the conversation mask.'};
}

export function inspectNativeSurfaceLayers(doc: Document, main: Element | undefined): [ProbeResult, ProbeResult] {
  const root = doc.documentElement;
  const inactive: ProbeResult = {status:'manual',detail:'Surface Opacity and a visible native conversation are required.'};
  if (!main || !root.hasAttribute('data-code-codex-ui-mask-active')) return [inactive,inactive];
  const frame = main.closest(NATIVE_PAGE_FRAME_SELECTOR);
  const shell = paintResult(frame?[frame]:[],'native page-frame backing');
  const cards = activePageElements(doc,NATIVE_TURN_CHANGE_CARD_SELECTOR).filter(el=>main.contains(el) && el.getBoundingClientRect().height>0);
  const rows = activePageElements(doc,NATIVE_TURN_CHANGE_ROW_SELECTOR).filter(el=>main.contains(el)
    && el.getBoundingClientRect().height>0 && !el.matches(':hover'));
  const zero = doc.defaultView!.getComputedStyle(root).getPropertyValue('--code-codex-mask-changes').trim()==='0';
  return [shell, rows.length ? paintResult(zero?[...cards,...rows]:rows,'turn-change backing and file rows')
    : {status:'manual',detail:'No visible, non-hovered turn-change file rows are mounted.'}];
}

function paintResult(nodes: Element[], label: string): ProbeResult {
  if (!nodes.length) return {status:'manual',detail:`No mounted ${label} to inspect.`};
  const painted = unexpectedPaint(nodes);
  return painted.length ? {status:'issue',detail:`Unexpected paint on ${label}: ${painted.join(' | ')}`}
    : {status:'passed',detail:`No extra paint on ${label}.`};
}

export function inspectSettingsPaint(doc:Document): ProbeResult {
  const root = doc.documentElement;
  const active = BACKGROUND_SURFACE_ATTRIBUTES.some(attribute=>root.hasAttribute(attribute));
  const targets = [...doc.querySelectorAll('main [data-app-shell-focus-area="main"] [class~="electron:bg-surface"][class*="rounded-tl-lg"]')]
    .filter(el => el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0 && !el.closest('[data-app-shell-active-page="false"]'));
  if (!active || !targets.length) return {status:'manual',detail:'An active supported background and a mounted native Settings shell are required for live paint validation.'};
  const painted = unexpectedPaint(targets);
  return {status:painted.length?'issue':'passed',detail:painted.length?`Unexpected Settings shell paint: ${painted.join(' | ')}`:'The mounted Settings shell and generated layers are transparent.'};
}

export function inspectCollapsedTreePaint(root:Document):ProbeResult {
 const alpha=root.defaultView!.getComputedStyle(root.documentElement).getPropertyValue('--code-codex-mask-tree').trim();
 const rails=Array.from(root.querySelectorAll<HTMLElement>('[data-code-codex-owned="true"][data-collapsed="true"]')).flatMap(h=>Array.from(h.shadowRoot?.querySelectorAll<HTMLElement>('.collapsed-tab')??[])).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&root.defaultView!.getComputedStyle(e).visibility==='visible';});
 if(!root.documentElement.hasAttribute('data-code-codex-ui-mask-active')||!alpha||!rails.length)return {status:'manual',detail:'Collapse the file tree with UI Surface Opacity and a background active to inspect its expand rail.'};
 const bad=rails.some(e=>{const s=root.defaultView!.getComputedStyle(e),parts=s.backgroundColor.match(/^rgba?\(([^)]+)\)$/)?.[1]?.split(',').map(Number);return !parts||Math.abs((parts[3]??1)-Number(alpha))>.005||s.backgroundImage!=='none';});
 return {status:bad?'issue':'passed',detail:bad?'Collapsed file-tree expand rail does not follow the file-tree opacity.':'Mounted collapsed file-tree expand rail follows the file-tree opacity.'};
}
function withFrame<T>(run:(doc:Document)=>T):T|undefined {
  if (!document.body) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');
  frame.setAttribute('aria-hidden','true');
  frame.setAttribute('data-code-codex-update-sandbox','');
  frame.inert = true;
  frame.style.cssText = 'position:fixed;left:-2000px;top:0;width:800px;height:480px;border:0;visibility:hidden;pointer-events:none;';
  document.body.append(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc?.body || !doc.head) return;
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    doc.head.append(policy);
    return run(doc);
  } finally { frame.remove(); }
}

function addStyle(root:Document|ShadowRoot, text:string):void {
  const doc = 'head' in root ? root : root.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = text;
  if ('head' in root) root.head.append(style);
  else root.append(style);
}

function mountExplorerStyles(doc:Document, tree:HTMLElement|undefined):ShadowRoot|undefined {
  if (!tree?.shadowRoot) return;
  const host = doc.createElement('div');
  host.style.cssText = 'width:324px; position:relative; margin-top:400px;';
  doc.body.append(host);
  const shadow = host.attachShadow({mode:'open'});
  for (const style of tree.shadowRoot.querySelectorAll('style')) addStyle(shadow, style.textContent ?? '');
  return shadow;
}

function checkMarket(doc:Document, tree:HTMLElement|undefined, shadow:ShadowRoot|undefined):ProbeResult {
  const market = tree?.shadowRoot?.querySelector<HTMLElement>('.preview-market-popover');
  if (!shadow || !market) return {status:'manual',detail:'The production market template is unavailable in this installation.'};
  const copy = doc.importNode(market,true);
  copy.hidden = false;
  shadow.append(copy);
  const list = copy.querySelector<HTMLElement>('.preview-market-list');
  const sections = [...copy.querySelectorAll<HTMLElement>('[data-preview-market-section]')];
  if (!list || sections.length !== 3) return {status:'issue',detail:'The production market layout lacks its list or three categories.'};
  const results = sections.map(section => {
    const category = section.dataset.previewMarketSection;
    for (const candidate of sections) candidate.hidden = candidate !== section;
    list.dataset.previewMarketCategory = category;
    const viewport = list.clientHeight;
    const range = Math.max(0,list.scrollHeight-viewport);
    const overflow = doc.defaultView!.getComputedStyle(list).overflowY;
    return {category,viewport,range,ok:viewport>0&&['auto','scroll'].includes(overflow)};
  });
  return {status:results.every(item=>item.ok)?'passed':'issue',detail:results.map(item=>
    `${item.category}: viewport=${item.viewport}px, verticalRange=${item.range}px${item.ok?'':' (blocked)'}`).join('. ') + '. No scrolling was performed.'};
}

export function runBackgroundChecks(requested: ReadonlySet<string>, tree:HTMLElement|undefined):UpdateCheck[] {
  if (!requested.size) return [];
  const checks = withFrame(doc => {
    const result:UpdateCheck[] = [];
    const add = (id:string, test:()=>ProbeResult) => {
      if (!requested.has(id)) return;
      try {result.push({id,scope,...test()});}
      catch {result.push({id,scope,status:'manual',detail:'The isolated layout could not be measured.'});}
    };
    const explorer = requested.has('background.market-layout') || requested.has('background.tree-rail-paint') || requested.has('background.surface-transitions')
      ? mountExplorerStyles(doc,tree) : undefined;
    add('background.market-layout',()=>checkMarket(doc,tree,explorer));
    add('background.tree-rail-paint',()=>{
      const rail = tree?.shadowRoot?.querySelector('.collapsed-tab');
      if (!explorer || !rail) return {status:'manual',detail:'The production collapsed tree control is unavailable.'};
      const host = explorer.host as HTMLElement;
      host.dataset.codeCodexOwned = 'true';
      host.dataset.collapsed = 'true';
      explorer.append(doc.importNode(rail,true));
      doc.documentElement.setAttribute('data-code-codex-ui-mask-active','');
      for (const alpha of [0,.5,1]) {
        doc.documentElement.style.setProperty('--code-codex-mask-tree',String(alpha));
        const sample = inspectCollapsedTreePaint(doc);
        if (sample.status !== 'passed') return sample;
      }
      return {status:'passed',detail:'The production collapsed rail follows tree opacity 0%, 50%, and 100%.'};
    });
    const nativeChecks = ['background.split-layout','background.composer-backdrop','background.conversation-top-paint','background.side-panel-paint','background.settings-paint','background.nav-page-paint','background.surface-transitions'];
    if (!nativeChecks.some(id=>requested.has(id))) return result;
    const shell = document.querySelector<HTMLStyleElement>('style[data-code-codex-shell-layout]');
    if (!shell?.textContent) return result;
    addStyle(doc,shell.textContent);
    addStyle(doc,nativeSettingsBackgroundCss(backgroundAttribute));
    addStyle(doc,`body {margin:0} .contract-view {width:260px} .MainContentFrame-contract {width:700px}
      .contract-viewport {height:20px} .contract-paint {background-color:#272727}
      .contract-footer::before {content:'';background-image:linear-gradient(black, transparent)}
      .contract-top {width:100%;height:40px;background-image:var(--app-shell-content-fade,linear-gradient(black,transparent))}`);
    doc.documentElement.setAttribute('data-code-codex-ui-mask-active','');
    doc.documentElement.setAttribute(backgroundAttribute,'');
    const stage = doc.createElement('section');
    stage.innerHTML = `<div data-code-codex-owned="true" data-placement="inline" data-mount-strategy="known:workspace-row"></div>
      <div><main class="main-surface">
        <div class="contract-view" data-app-shell-workspace-layout="split" data-app-shell-right-panel-full-width="false"><div class="MainContentFrame-contract contract-viewport"><div data-codex-composer-root class="contract-viewport"></div></div></div>
        <div data-app-shell-main-content-layout="thread-edge-scroll"><div class="contract-top pointer-events-none absolute top-0 h-[var(--app-shell-content-fade-height)]"></div></div>
        <div class="thread-scroll-container"><div class="pointer-events-none contract-footer"><div class="contract-viewport" data-thread-scroll-footer="true"></div></div></div>
        <div data-app-shell-focus-area="main"><div class="electron:bg-surface rounded-tl-lg contract-viewport contract-paint"></div></div>
      </main><aside class="contract-viewport contract-paint" data-app-shell-focus-area="right-panel"><div class="contract-paint contract-viewport" data-new-tab-scroll-root></div></aside></div>`;
    doc.body.append(stage);
    add('background.split-layout',()=>inspectSplitLayout(doc));
    add('background.composer-backdrop',()=>inspectComposerBackdrop(doc));
    add('background.conversation-top-paint',()=>inspectConversationTopPaint(doc));
    add('background.settings-paint',()=>inspectSettingsPaint(doc));
    add('background.nav-page-paint',()=>{
      const secondary = doc.createElement('main');
      secondary.className='main-surface';
      secondary.innerHTML = `<div data-app-shell-main-content-layout="default">
        <div class="contract-top pointer-events-none absolute top-0 h-[var(--app-shell-content-fade-height)]"></div>
        <div data-app-shell-focus-area="main"><div data-app-shell-inline-page-header>
          <div data-sticky="true" data-expand-search="true" class="contract-viewport contract-sticky"><button>Search</button></div>
          <div data-sticky="true" data-collapsible="true" class="contract-viewport contract-sticky">Legacy</div>
        </div></div>
        </div><div data-app-shell-main-content-layout="full-bleed"><div data-app-shell-focus-area="main">
          <div class="contents"><main class="bg-surface flex h-full contract-viewport contract-paint"></main></div>
          <div role="dialog" class="contract-paint contract-viewport"></div>
        </div></div>`;
      addStyle(doc,'.contract-sticky::before {content:"";background:black}');
      doc.body.append(secondary);
      try{
        for(const kind of ['header','edge','content'] as const){
          const sample=inspectSecondaryPaint(doc,kind);
          if(sample.status!=='passed')return sample;
        }
        if(!unexpectedPaint([secondary.querySelector('[role="dialog"]')!]).length)
          return {status:'issue',detail:'The independent dialog lost its own backing.'};
        return {status:'passed',detail:'New and legacy sticky headers, secondary top gradient, and full-bleed backing were measured with production CSS. A neighboring dialog kept its native backing.'};
      }finally{secondary.remove();}
    });
    add('background.surface-transitions', () => {
      const root = doc.documentElement;
      const secondary = doc.createElement('main');
      secondary.className = 'main-surface';
      secondary.style.cssText = 'position:relative;width:480px;height:240px';
      secondary.innerHTML = `<div data-app-shell-main-content-layout="default" class="contract-viewport">
        <div data-app-shell-focus-area="main"><div data-app-shell-inline-page-header>
          <div data-sticky data-expand-search class="contract-viewport contract-sticky"></div>
        </div></div></div>`;
      addStyle(doc, '.contract-sticky::before {content:"";background:black}');
      doc.body.append(secondary);
      try {
        const header = secondary.querySelector('.contract-sticky')!;
        root.removeAttribute(backgroundAttribute);
        if (!unexpectedPaint([header]).length) return {status:'issue',detail:'Native header paint was not restored with the background off.'};
        root.setAttribute(backgroundAttribute, '');
        const page = inspectSecondaryPaintCoverage(doc);
        if (page.status !== 'passed') return page;
        const unknown = doc.createElement('div');
        unknown.style.cssText = 'position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(black,transparent);pointer-events:none';
        secondary.append(unknown);
        const negative = inspectSecondaryPaintCoverage(doc);
        unknown.remove();
        if (negative.status !== 'issue' || inspectSecondaryPaintCoverage(doc).status !== 'passed') {
          return {status:'issue',detail:'A renamed top-edge paint layer was missed or persisted after removal.'};
        }
      } finally {
        root.setAttribute(backgroundAttribute, '');
        secondary.remove();
      }

      const panel = stage.querySelector('aside')!;
      const split = stage.querySelector('[data-app-shell-workspace-layout]')!;
      const summary = doc.createElement('section');
      summary.dataset.summaryPanelVariant = 'summary';
      summary.dataset.summaryPanelDensity = 'comfortable';
      summary.style.cssText = 'position:fixed;top:30px;left:100px;width:180px;height:100px';
      panel.hidden = true;
      split.removeAttribute('data-app-shell-workspace-layout');
      if (inspectSplitLayout(doc).status !== 'manual') return {status:'issue',detail:'The closed split was reported as mounted.'};
      panel.hidden = false;
      split.setAttribute('data-app-shell-workspace-layout','split');
      if (inspectSplitLayout(doc).status !== 'passed') return {status:'issue',detail:'The opened split clipped its conversation frame.'};
      doc.body.append(summary);
      for (const alpha of [1,.5,0]) {
        root.style.setProperty('--code-codex-mask-utility',String(alpha));
        const paint = inspectSidePanelOpacity(doc);
        if (paint.status !== 'passed') return paint;
      }
      summary.remove();
      if (inspectSidePanelOpacity(doc,'summary').status !== 'manual') return {status:'issue',detail:'The closed summary was reported as mounted.'};

      const rail = tree?.shadowRoot?.querySelector('.collapsed-tab');
      if (!explorer || !rail) return {status:'manual',detail:'Page and panel transitions passed; the production collapsed-tree control was unavailable.'};
      const host = explorer.host as HTMLElement;
      host.dataset.codeCodexOwned = 'true';
      if (!explorer.querySelector('.collapsed-tab')) explorer.append(doc.importNode(rail,true));
      root.style.setProperty('--code-codex-mask-tree','0');
      for (const collapsed of [true,false,true]) {
        host.dataset.collapsed = String(collapsed);
        if (inspectCollapsedTreePaint(doc).status !== (collapsed ? 'passed' : 'manual')) {
          return {status:'issue',detail:'Tree fold and reopen did not preserve the transparent collapsed rail.'};
        }
      }
      return {status:'passed',detail:'Background off/on, an unknown painted edge, split and summary open/close, opacity changes and tree fold/reopen passed in the isolated host.'};
    });
    add('background.side-panel-paint',()=>{
      for (const alpha of [0,.5,1]) {
        doc.documentElement.style.setProperty('--code-codex-mask-utility',String(alpha));
        const sample = inspectSidePanelOpacity(doc);
        if (sample.status !== 'passed') return sample;
      }
      return {status:'passed',detail:'Production side-panel backings match opacity 0%, 50%, and 100% on the isolated layout.'};
    });
    return result;
  }) ?? [];
  for (const id of requested) if (!checks.some(check=>check.id===id)) checks.push({id,scope,status:'manual',detail:'The production style or temporary layout document was unavailable.'});
  return checks;
}
