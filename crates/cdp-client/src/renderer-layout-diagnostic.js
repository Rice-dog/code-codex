(() => {
  // Read-only structural probe. Never return text, titles, URLs, IDs, raw
  // class names, attributes containing user data, or local file paths.
  const selector = 'main.main-surface,main[data-app-shell-main-surface="default"]';
  const active = root => [...root.querySelectorAll(selector)].filter(e => !e.closest('[data-app-shell-active-page="false"]'));
  const allMains = [...document.querySelectorAll(selector)];
  const mains = active(document);
  const loginPanels = [...document.querySelectorAll('div.flex.h-full.w-full.items-center.justify-center.overflow-hidden.bg-surface')].filter(e =>
    !e.closest('[data-app-shell-active-page="false"]') && (e.classList.contains('pb-6') || e.classList.contains('pb-12')) &&
    [...e.children].some(c => c.classList.contains('w-[340px]') && c.classList.contains('flex-col') && c.querySelector('button') && c.querySelector('svg')));
  const nativeLoginPage = mains.length === 0 && loginPanels.length === 1 &&
    !document.querySelector('nav[data-app-navigation-rail],aside.app-shell-left-panel,[data-app-shell-sidebar-trigger]');
  const main = mains.length === 1 ? mains[0] : null;
  const parent = main?.parentElement ?? null;
  const triggerCount = document.querySelectorAll('[data-app-shell-sidebar-trigger]').length;
  const navs = document.querySelectorAll('nav[data-app-navigation-rail="true"]');
  const homes = [...document.querySelectorAll('nav[data-app-navigation-rail="true"] [data-sidebar-destination="builtin:home"]')]
    .filter(e => !e.closest('[data-app-shell-active-page="false"]'));
  const nativeFeaturePage = navs.length === 1 && homes.length === 1 && homes[0].getAttribute('aria-current') !== 'page';
  let legacy = false;
  for (let shell = parent, depth = 0; shell && depth < 5; depth++, shell = shell.parentElement) {
    if (shell !== parent && shell !== parent?.parentElement) continue;
    const rails = shell.querySelectorAll(':scope > aside.app-shell-left-panel');
    if (rails.length === 1 && active(shell).length === 1 && active(shell)[0] === main) {
      legacy = true;
    }
  }
  const row = main?.closest('[data-app-shell-workspace-row="true"]') ?? null;
  const children = row ? [...row.children] : [];
  const rails = children.filter(child => child.matches('aside.app-shell-left-panel'));
  const owners = children.filter(child => child.contains(main));
  const owner = owners.length === 1 ? owners[0] : null;
  const railBeforeOwner = rails.length === 1 && !!owner && children.indexOf(rails[0]) < children.indexOf(owner);
  const clip = !!parent?.className.includes('MainContentClip');
  const rowMainCount = row ? active(row).length : 0;
  const ownerMainCount = owner ? active(owner).length : 0;
  const tag = element => ['DIV', 'ASIDE', 'MAIN', 'SECTION', 'ARTICLE', 'HEADER', 'NAV'].includes(element.tagName) ? element.tagName : 'OTHER';
  const workspaceClass = element => [...element.classList].some(name => name === 'Workspace' || name.startsWith('_Workspace_'));
  const clippedCount = count => Math.min(count, 32);
  const rowChildren = children.slice(0, 8).map((child, index) => ({
    index,
    tag: tag(child),
    childCount: clippedCount(child.children.length),
    containsMain: !!main && child.contains(main),
    directRail: child.matches('aside.app-shell-left-panel'),
    workspaceClass: workspaceClass(child),
    unifiedTabAttribute: child.hasAttribute('data-app-shell-unified-tab-strip'),
    activePage: child.getAttribute('data-app-shell-active-page') === 'true',
    inactivePage: child.getAttribute('data-app-shell-active-page') === 'false',
  }));
  const mainAncestors = [];
  for (let node = main, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
    mainAncestors.push({
      depth,
      tag: tag(node),
      childCount: clippedCount(node.children.length),
      workspaceRow: node === row,
      directRowChild: !!row && node.parentElement === row,
      mainClip: node.className?.includes?.('MainContentClip') === true,
      workspaceClass: workspaceClass(node),
    });
    if (node === row) break;
  }
  const checks = [
    { name: 'top_frame', expected: true, actual: window === window.top },
    { name: 'app_origin', expected: true, actual: location.protocol === 'app:' && location.host === '-' },
    ...(nativeLoginPage ? [{ name: 'native_login_surface', expected: true, actual: nativeLoginPage }] : [
      { name: 'unique_main', expected: 1, actual: mains.length },
      { name: 'sidebar_trigger_or_native_feature_rail', expected: true, actual: triggerCount > 0 || nativeFeaturePage },
      { name: 'legacy_shell_or_workspace_row', expected: true, actual: legacy || !!row },
    ]),
  ];
  if (row && !legacy) checks.push(
    { name: 'row_unique_main', expected: 1, actual: rowMainCount },
    { name: 'main_content_clip', expected: true, actual: clip },
    { name: 'one_direct_rail', expected: 1, actual: rails.length },
    { name: 'one_main_owner_child', expected: 1, actual: owners.length },
    { name: 'rail_before_main_owner', expected: true, actual: railBeforeOwner },
    { name: 'owner_unique_main', expected: 1, actual: ownerMainCount },
  );
  const explorer = document.querySelector('[data-code-codex-owned="true"]');
  const explorerStyle = explorer ? getComputedStyle(explorer) : null;
  return {
    diagnosticVersion: 4,
    topFrame: window === window.top,
    appOrigin: location.protocol === 'app:' && location.host === '-',
    readyState: document.readyState,
    mainCount: mains.length,
    totalMainCount: allMains.length,
    inactiveMainCount: allMains.length - mains.length,
    activePageCount: document.querySelectorAll('[data-app-shell-active-page="true"]').length,
    sidebarTriggerCount: triggerCount,
    nativeFeaturePage,
    nativeLoginPage,
    legacyShellMatch: legacy,
    workspaceRowPresent: !!row,
    rowMainCount,
    mainContentClip: clip,
    directRailCount: rails.length,
    workspaceCount: owners.length,
    unifiedTabStripCount: children.filter(child => child.hasAttribute('data-app-shell-unified-tab-strip')).length,
    railBeforeWorkspace: railBeforeOwner,
    workspaceContainsMain: !!owner && owner.contains(main),
    accepted: __PREDICATE__,
    checks,
    rowChildCount: children.length,
    rowChildren,
    mainAncestors,
    explorer: {
      count: document.querySelectorAll('[data-code-codex-owned="true"]').length,
      placement: explorer?.getAttribute('data-placement') === 'inline' ? 'inline' : explorer?.getAttribute('data-placement') === 'drawer' ? 'drawer' : 'unknown',
      display: explorerStyle?.display === 'none' ? 'none' : explorerStyle ? 'shown' : 'unknown',
      visibility: explorerStyle?.visibility === 'hidden' ? 'hidden' : explorerStyle ? 'visible' : 'unknown',
    },
  };
})()
