import catalog from '../../../resources/plugin-definitions.json';
import {APPLICATION_MENU_ITEMS} from './contracts/application-menu-items';
import type {ProbeResult} from './host-update-background';
import {NATIVE_FIXED_TITLEBAR_SELECTOR} from './adapters/codex-26.715';
import {readPluginPins} from './components/plugin-pins';
import {pluginIconIds,type PluginIconId} from './components/plugin-icons';
import type {NativeAccountAdapter} from './features/accounts/native-adapter';

const result = (valid:boolean,detail:string):ProbeResult => ({status:valid?'passed':'issue',detail});
const unavailable = (detail:string):ProbeResult => ({status:'manual',detail});

export function inspectTreeTitlebarClearance(doc:Document,tree:HTMLElement|undefined):ProbeResult {
  if(!tree?.matches('[data-placement="inline"][data-mount-strategy="known:workspace-row"]')||tree.hasAttribute('data-home-view-hidden'))
    return unavailable('A visible inline file tree in the native workspace row is required.');
  const headers=[...doc.querySelectorAll(NATIVE_FIXED_TITLEBAR_SELECTOR)].filter(header=>
    !header.closest('[data-app-shell-active-page="false"]')&&header.getBoundingClientRect().width>0&&getComputedStyle(header).position==='fixed');
  if(!headers.length)return unavailable('This workspace does not expose a visible fixed conversation titlebar.');
  const right=tree.getBoundingClientRect().right;
  if(right<=0)return unavailable('The inline file tree has no visible geometry.');
  const clearance=Math.min(...headers.map(header=>header.getBoundingClientRect().left-right));
  return result(clearance>=-1,`Native fixed conversation header clearance: ${Math.round(clearance)} CSS px beyond the file tree. Negative clearance indicates overlap.`);
}

export function inspectTreeVersionControl(tree:HTMLElement|undefined,version:string|undefined):ProbeResult {
  const root=tree?.shadowRoot;
  if(!root)return unavailable('The owned file tree is not mounted.');
  const button=root.querySelector<HTMLButtonElement>('footer button.status-code');
  const dialog=root.getElementById(button?.getAttribute('aria-controls')??'');
  const feedback=button?.dataset.feedback;
  const label=button?.textContent?.trim()??'';
  const validLabel=/^v\d+\.\d+\.\d+$/.test(label)&&(!version||label===`v${version}`||feedback==='update');
  return result(!!button&&!!dialog?.matches('[role="dialog"]')&&!!dialog.querySelector('.update-install')&&
    !!dialog.querySelector('.update-later')&&(validLabel||!!feedback)&&!!button.getAttribute('aria-label'),
    'Footer version caption, accessible manual trigger, and owned update dialog with install and defer controls.');
}

export function inspectTreeShortcuts(tree:HTMLElement|undefined):ProbeResult {
  const root=tree?.shadowRoot;
  if(!root)return unavailable('The owned file tree is not mounted.');
  const nav=root.querySelector('footer nav.plugin-shortcuts');
  const menu=root.querySelector('.plugin-shortcut-menu[role="menu"]');
  const eligible=new Set([...root.querySelectorAll<HTMLElement>('.preview-extension:not([hidden]) [data-plugin-icon]')]
    .map(icon=>icon.dataset.pluginIcon).filter(id=>pluginIconIds.includes(id as PluginIconId)));
  const expected=readPluginPins().filter(id=>eligible.has(id));
  const direct=[...nav?.querySelectorAll<HTMLButtonElement>('[data-plugin-shortcut]')??[]];
  const overflow=[...menu?.querySelectorAll<HTMLButtonElement>('[data-plugin-shortcut]')??[]];
  const actual=[...direct,...overflow];
  return result(!!nav&&!!menu&&!!nav.querySelector('.plugin-shortcut-more')===!!overflow.length&&
    actual.length===expected.length&&actual.every((button,i)=>button.dataset.pluginShortcut===expected[i]&&
      !!button.getAttribute('aria-label')&&!!button.querySelector('svg'))&&overflow.every(button=>button.getAttribute('role')==='menuitem'),
    `Checked pin order, labels, icons and overflow ownership for ${expected.length} shortcut(s).`);
}

export function inspectTreeControl(tree:HTMLElement|undefined,selector:string,label:string):ProbeResult {
  const root=tree?.shadowRoot;
  if(!root)return unavailable('The owned file tree is not mounted.');
  const nodes=root.querySelectorAll(selector);
  const control=nodes[0];
  const name=control?.getAttribute('aria-label')?.trim()||control?.textContent?.trim();
  return result(nodes.length===1&&!!name,`Checked the unique, named ${label} control in the owned file tree.`);
}

export function inspectAccountPanel(tree:HTMLElement|undefined,kind:'identity'|'quota'|'actions'):ProbeResult {
  const panel=tree?.shadowRoot?.querySelector('.accounts-panel');
  if(!panel)return unavailable('The optional account settings panel is not mounted.');
  if(kind==='actions')return result([
    '.accounts-settings-trigger[aria-controls="cle-accounts-settings"]','.accounts-enable[aria-pressed]',
    '.accounts-close','.accounts-auto-continue[role="switch"]','.accounts-follow-logout[role="switch"]','.accounts-primary-cancel',
  ].every(selector=>tree?.shadowRoot?.querySelectorAll(selector).length===1),'Checked settings, routing switch, close, auto-continue, follow-logout and primary-cancel controls.');
  const rows=[...panel.querySelectorAll<HTMLElement>('.accounts-connection')];
  if(!panel.matches(':popover-open')||!rows.length)return unavailable('There are no materialized account cards to inspect in this document.');
  if(kind==='identity')return result(rows.filter(row=>row.dataset.host==='true').length===1&&rows.every(row=>
    ['true','false'].includes(row.dataset.signed??'')&&!!row.querySelector('.accounts-login-dot[aria-label]')),
    `Checked separate, accessible login states for ${rows.length} account card(s).`);
  const signed=rows.filter(row=>row.dataset.signed==='true'&&!row.querySelector('.account-api-model'));
  if(!signed.length)return unavailable('No signed-in official account card is available.');
  const quotas=signed.map(row=>row.querySelector<HTMLElement>('.account-quota[data-quota-resets]'));
  const phases=quotas.map(quota=>quota?.dataset.quotaPhase??'unobserved');
  const ready=phases.filter(phase=>phase==='ready').length;
  const loading=phases.filter(phase=>phase==='loading').length;
  const unavailableCount=phases.filter(phase=>phase==='unavailable').length;
  const missing=phases.length-ready-loading-unavailableCount;
  const valid=quotas.every((quota,i)=>!!quota&&quota.querySelectorAll('.account-quota-value').length===2&&
    quota.querySelectorAll('.account-quota-reset').length===2&&quota.querySelectorAll('[data-account-asset]').length===2&&
    (phases[i]!=='ready'||[...quota.querySelectorAll('.account-quota-value')].every(value=>/^\d+(?:\.\d)?%$/.test(value.textContent??''))));
  const status=!valid||missing?'issue':ready===signed.length?'passed':'manual';
  return {status,detail:`Official account quota cards: ${ready} complete, ${loading} reading, ${unavailableCount} provider results unavailable, ${missing} without a read state. Checked both windows, reset fields and asset controls without sending a request.`};
}

export function inspectMenuActions(doc: Document, menuExpected: boolean): ProbeResult & {items:Record<string,ProbeResult>} {
  const trigger = doc.getElementById('code-codex-application-menu-trigger');
  const root = doc.getElementById(trigger?.getAttribute('aria-controls')??'');
  if (!root) return {status:menuExpected?'issue':'manual',detail:'The owned Code-Codex menu is not mounted.',items:{}};

  const groups = [
    [root, APPLICATION_MENU_ITEMS.main],
    [doc.getElementById('code-codex-compatibility-popup'), APPLICATION_MENU_ITEMS.compatibility],
    [doc.getElementById('code-codex-language-popup'), APPLICATION_MENU_ITEMS.language],
  ] as const;
  const failures: string[] = [];
  const items:Record<string,ProbeResult>={};
  for (const [panel, expected] of groups) {
    const rows = panel ? [...panel.children].filter(row=>row.matches('[role^="menuitem"]')) : [];
    const ids = rows.map(row=>row.getAttribute('data-code-codex-menu-item'));
    for (const id of expected) {
      const matches = rows.filter(row=>row.getAttribute('data-code-codex-menu-item')===id);
      const item = matches[0];
      const submenu = item?.getAttribute('aria-haspopup') === 'menu'
        ? doc.getElementById(item.getAttribute('aria-controls') ?? '') : null;
      // The real popup populates translated labels in its existing open path.
      const bad=matches.length!==1 || (!root.hidden && !item?.textContent?.trim())
          || (item?.getAttribute('aria-haspopup') === 'menu' && (!submenu?.matches('[role="menu"]')
            || (submenu.hasAttribute('popover') && (item as HTMLButtonElement).popoverTargetElement !== submenu)));
      if(bad)failures.push(id);
      items[id]={status:bad?'issue':'passed',detail:`Code-Codex menu ${id}: ${bad?'native entry unavailable, ambiguous or unnamed':'mounted in its expected menu'}.`};
    }
    if (ids.length!==expected.length || ids.some((id,index)=>id!==expected[index])) failures.push('menu-order');
  }
  const actions = groups.flatMap(([, ids])=>[...ids]);
  return {items,status:failures.length?'issue':'passed',detail:failures.length
    ? `Missing, ambiguous or misplaced Code-Codex menu entries: ${failures.join(', ')}.`
    : `Mounted menu entries checked without opening them: ${actions.join(', ')}. Action effects require their own acceptance.`};
}

export function inspectClosedMenuIndicators(doc:Document):ProbeResult {
  const panel=doc.getElementById('code-codex-language-popup');
  if(!panel)return unavailable('The Language submenu is not mounted.');
  if(panel.hasAttribute('popover')?panel.matches(':popover-open'):!panel.hidden)
    return unavailable('Close the Language submenu to inspect its hidden indicators.');
  const checks=[...panel.querySelectorAll('[data-code-codex-menu-check] svg')];
  if(!checks.length)return unavailable('The submenu has not created its language indicators yet.');
  const visible=checks.some(check=>check.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}));
  return result(!visible,visible?'A closed Language submenu has a rendered selection indicator.':'Closed Language submenu selection indicators do not paint.');
}

export function inspectAccountExecution(globals:Record<symbol,unknown>):{owner:ProbeResult;route:ProbeResult} {
  const documentOwner=globals[Symbol.for('code-codex:document-connection-owner:v2')] as
    {nativeBinding?:string;pending?:boolean;retainedAccounts?:{nativeBinding?:string}}|undefined;
  const capability=globals[Symbol.for('code-codex:accounts-capability:v1')] as
    {request?:{runtimeIdentity?:string}}|undefined;
  const runtime=globals[Symbol.for('code-codex:multi-account-runtime:v1')] as
    {enabled?:boolean;pending?:unknown;adapter?:Pick<NativeAccountAdapter,'info'|'status'>&{request?:{runtimeIdentity?:string}}}|undefined;
  const stopped=(detail:string)=>({owner:unavailable(detail),route:unavailable(detail)});
  if(!documentOwner?.nativeBinding||documentOwner.pending)return stopped('A committed document connection is required.');
  if(runtime?.enabled!==true)return stopped('Account routing is disabled or has not initialized in this document.');
  const binding=capability?.request?.runtimeIdentity;
  if(binding&&binding!==documentOwner.nativeBinding){
    const retained=binding===documentOwner.retainedAccounts?.nativeBinding;
    return {owner:retained?unavailable('The UI is committed but the previous account endpoint is still retained. Verify its eventual handoff when idle.'):
      result(false,'The account endpoint belongs to neither the current UI nor its retained executor.'),route:unavailable('Account ownership must settle before comparing the active route.')};
  }
  const adapter=runtime.adapter;
  if(!binding||runtime.pending||!adapter)return stopped('The account endpoint or adapter has not completed its handoff.');
  const status=adapter.status();
  if(!status.active||!status.supported)return stopped('The mounted account adapter is not active and qualified.');
  const adapterBinding=adapter.request?.runtimeIdentity;
  if(!adapterBinding)return stopped('The active adapter does not expose a qualified execution binding.');
  if(adapterBinding!==binding)return {owner:result(false,'The active account adapter retained a different endpoint from the current account capability.'),
    route:unavailable('Account ownership must settle before comparing the active route.')};
  const owner=result(true,'The active account adapter and committed UI share the current native endpoint.');
  if(adapter.info.nativeRouting!==true)return {owner,route:unavailable('This adapter does not expose the native per-conversation routing contract.')};
  if(!status.conversationId)return {owner,route:unavailable('An existing conversation is needed to compare the saved selection and mounted route.')};
  const selected=adapter.info.selected[status.conversationId]??'host';
  const actual=adapter.info.nativeRoutes?.[status.conversationId]??'host';
  if(actual!==selected)return {owner,route:status.sendBlocked?
    unavailable('The saved account differs from the mounted route and sending is blocked. Verify restoration before accepting Send.'):
    result(false,'The saved account differs from the mounted route while sending is allowed.')};
  return {owner,route:result(true,'The visible conversation’s saved account and mounted route agree. No request was sent.')};
}

export const BACKGROUND_PLUGIN_IDS = catalog.plugins.filter(plugin=>plugin.capabilities.includes('background')).map(plugin=>plugin.id);
const marketCategories = new Map(catalog.plugins.map(plugin=>[plugin.id,plugin.category]));

export function inspectMarketCards(tree: HTMLElement | undefined) {
  const sections = new Map<string, number>();
  const cards = new Map<string, Element[]>();
  for (const section of tree?.shadowRoot?.querySelectorAll('[data-preview-market-section]') ?? []) {
    const category = section.getAttribute('data-preview-market-section')!;
    sections.set(category,(sections.get(category)??0)+1);
  }
  for (const icon of tree?.shadowRoot?.querySelectorAll('.preview-extension [data-plugin-icon]') ?? []) {
    const id = icon.getAttribute('data-plugin-icon')!;
    const card = icon.closest('.preview-extension')!;
    const matches = cards.get(id);
    if (matches) matches.push(card);
    else cards.set(id,[card]);
  }
  return (...ids: string[]): [ProbeResult['status'], string] => {
    if (!tree) return ['manual', 'The owned Plugin Market template is not mounted.'];
    const invalid = ids.filter(id=>{
      const category = marketCategories.get(id);
      const matching = cards.get(id);
      const card = matching?.[0];
      return !category || sections.get(category)!==1 || matching?.length!==1 || !card
        || card.closest('[data-preview-market-section]')?.getAttribute('data-preview-market-section')!==category
        || !card.querySelector('h4')?.textContent?.trim()
        || card.querySelectorAll('button.preview-extension-action').length!==1;
    });
    return invalid.length
      ? ['issue', `Missing, ambiguous or incomplete market entries: ${invalid.join(', ')}.`]
      : ['passed', `Mounted market cards and actions: ${ids.join(', ')}. Package behavior is checked separately.`];
  };
}
