(() => {
  // Read-only structural probe. Never return text, titles, URLs, IDs, raw
  // class names, attributes containing user data, or local file paths.
  const selector = 'main.main-surface,main[data-app-shell-main-surface="default"]';
  const mains = [...document.querySelectorAll(selector)];
  const main = mains.length === 1 ? mains[0] : null;
  const parent = main?.parentElement ?? null;
  const triggerCount = document.querySelectorAll('[data-app-shell-sidebar-trigger]').length;
  let legacy = false;
  for (let shell = parent, depth = 0; shell && depth < 5; depth++, shell = shell.parentElement) {
    if (shell !== parent && shell !== parent?.parentElement) continue;
    const rails = shell.querySelectorAll(':scope > aside.app-shell-left-panel');
    if (rails.length === 1 && shell.querySelectorAll(selector).length === 1 && shell.querySelector(selector) === main) {
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
  const rowMainCount = row?.querySelectorAll(selector).length ?? 0;
  const ownerMainCount = owner?.querySelectorAll(selector).length ?? 0;
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
    { name: 'unique_main', expected: 1, actual: mains.length },
    { name: 'sidebar_trigger_present', expected: true, actual: triggerCount > 0 },
    { name: 'legacy_shell_or_workspace_row', expected: true, actual: legacy || !!row },
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
    diagnosticVersion: 2,
    topFrame: window === window.top,
    appOrigin: location.protocol === 'app:' && location.host === '-',
    readyState: document.readyState,
    mainCount: mains.length,
    sidebarTriggerCount: triggerCount,
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
