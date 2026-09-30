import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const requireUi = createRequire(join(root, "packages/explorer-ui/package.json"));
const ts = requireUi("typescript");
const adapter = ts.transpileModule(
  readFileSync(join(root, "packages/explorer-ui/src/adapters/codex-26.715.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText.replaceAll(/^export /gm, "");
const versions = ts.transpileModule(
  readFileSync(join(root, "packages/explorer-ui/src/adapters/codex-layout-version.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText.replaceAll(/^export /gm, "");
const rust = readFileSync(join(root, "crates/cdp-client/src/lib.rs"), "utf8");
const declaration = rust.split(/\r?\n/).find((line) => line.startsWith("const RENDERER_LAYOUT_PROBE: &str = "));
assert.ok(declaration, "CDP renderer probe must exist");
const expression = JSON.parse(declaration.slice(declaration.indexOf('"'), -1))
  .replace("window===window.top&&location.protocol==='app:'&&location.host==='-'&&", "");
const diagnosticExpression = readFileSync(join(root, "crates/cdp-client/src/renderer-layout-diagnostic.js"), "utf8")
  .replace("__PREDICATE__", expression);
const injectionSource = readFileSync(join(root, "packages/explorer-ui/src/inject.ts"), "utf8");
const pageBackgroundCss = injectionSource.match(/const PAGE_SURFACE_BACKGROUND_CSS = `([\s\S]*?)`;/)?.[1];
assert.ok(pageBackgroundCss);

const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const temp = join(root, "artifacts", "layout-probe");
mkdirSync(temp, { recursive: true });
const fixtures = {
  old: `<button data-app-shell-sidebar-trigger></button><div class="shell"><aside class="app-shell-left-panel"></aside><main class="main-surface"></main></div>`,
  current: `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside><div class="_Workspace_gs442_2"><div class="_MainContentClip_gs442_2"><main class="main-surface" data-app-shell-main-surface="default"></main></div></div></div>`,
  currentWithTabs: `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside><div class="_Workspace_gs442_2" data-app-shell-unified-tab-strip="true"><div class="_MainContentClip_gs442_2"><main class="main-surface" data-app-shell-main-surface="default"></main></div></div></div>`,
  currentWrapped: `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside><div class="content-holder"><div class="_Workspace_gs442_2"><div class="_MainContentClip_gs442_2"><main class="main-surface" data-app-shell-main-surface="default"></main></div></div></div></div>`,
  unrelated: `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside><div class="_Workspace_gs442_2" data-app-shell-unified-tab-strip="false"><div class="wrong-wrapper"><main class="main-surface"></main></div></div></div>`,
  wrongOrder: `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><div class="content-holder"><div class="_MainContentClip_gs442_2"><main class="main-surface"></main></div></div><aside class="app-shell-left-panel"></aside></div>`,
};
const page = (active, id) => `<div class="contents" data-app-shell-active-page="${active}"><div class="_Workspace_gs442_2"><header><span data-app-shell-titlebar-content>Private title</span></header><div class="_MainContentClip_gs442_2"><main data-app-shell-main-surface="default"><div data-above-composer-conversation-id="${id}"></div><div data-response-annotation-conversation="${id}"></div></main></div></div></div>`;
fixtures.currentCached = `<main class="bg-surface" hidden></main><button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside>${page(true, 'thread_current_001')}${page(false, 'thread_cached_002')}</div>`;
fixtures.twoActivePages = `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside>${page(true, 'thread_current_001')}${page(true, 'thread_other_003')}</div>`;
fixtures.inactiveOnly = `<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside>${page(false, 'thread_cached_002')}</div>`;
const featureRail = '<nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home"></button></nav>';
const featureShell = '<div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"></aside><div class="_Workspace_gs442_2"><div class="_MainContentClip_gs442_2"><main data-app-shell-main-surface="default"></main></div></div></div>';
fixtures.nativeFeature = featureRail + featureShell;
fixtures.homeMissingTrigger = featureRail.replace('builtin:home"', 'builtin:home" aria-current="page"') + featureShell;
fixtures.featureWrongOrder = featureRail + fixtures.wrongOrder.replace('<button data-app-shell-sidebar-trigger></button>', '');
fixtures.featureDuplicateRail = featureRail + featureRail + featureShell;

for (const [name, markup] of Object.entries(fixtures)) {
  const file = join(temp, `${name}.html`);
  writeFileSync(file, `<!doctype html><html data-code-codex-particle-image-background><head><style>
    ${pageBackgroundCss}
    .sidebar-navigation, .bg-surface { background: rgb(24,24,24); }
    ._MainContentTopFade_new { background-image: linear-gradient(black,transparent); }
    [data-app-shell-workspace-row] { display: flex; width: 1200px; height: 400px; }
    ._Workspace_gs442_2 { display: contents; }
    [data-app-shell-active-page=true] { display: contents; }
    [data-app-shell-active-page=false] { display: none; }
    ._MainContentClip_gs442_2 { display: flex; flex: 1; }
    .content-holder { display: flex; flex: 1; }
    aside { width: 300px; flex: none; }
    main { flex: 1; }
  </style></head><body>${markup}<div data-app-shell-page-surface="true"><div class="sidebar-navigation" id="mask-sidebar"></div><div data-thread-scroll-footer="true"><div class="pointer-events-none bg-surface" id="mask-footer"></div></div><div data-app-shell-main-content-top-fade="visible"><div class="_MainContentTopFade_new" id="mask-fade"></div></div></div><p>private-conversation-text-must-not-leak</p><script>
    window.exports = {};
    ${adapter}\n${versions}
    const mains = activePageElements(document, exports.MAIN_SURFACE_SELECTOR);
    const main = mains.length === 1 ? mains[0] : null;
    const legacy = Boolean(main && qualifiedAppShellForMain(main));
    const current = main ? qualifiedWorkspaceRowForMain(main) : null;
    const probe = Boolean(eval(${JSON.stringify(expression)}));
    const diagnostic = eval(${JSON.stringify(diagnosticExpression)});
    const backgroundPassed = getComputedStyle(document.querySelector('#mask-sidebar')).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(document.querySelector('#mask-footer')).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(document.querySelector('#mask-fade')).backgroundImage === 'none';
    document.documentElement.removeAttribute('data-code-codex-particle-image-background');
    const nativeBackgroundPassed = getComputedStyle(document.querySelector('#mask-footer')).backgroundColor === 'rgb(24, 24, 24)';
    if (current) {
      const tree = document.createElement('div');
      tree.style.cssText = 'width:260px;flex:none;height:400px';
      current.row.insertBefore(tree, current.workspace);
      const railRight = current.row.querySelector('aside').getBoundingClientRect().right;
      const treeRect = tree.getBoundingClientRect();
      const mainLeft = main.getBoundingClientRect().left;
      window.treeBetween = treeRect.left >= railRight && mainLeft >= treeRect.right;
      if (${JSON.stringify(name)} === 'currentCached') {
        window.initialThread = annotationConsensusThreadId();
        const pages = document.querySelectorAll('[data-app-shell-active-page]');
        pages[0].setAttribute('data-app-shell-active-page', 'false');
        pages[1].setAttribute('data-app-shell-active-page', 'true');
        const nextMain = activePageElements(document, exports.MAIN_SURFACE_SELECTOR)[0];
        const nextMount = qualifiedWorkspaceRowForMain(nextMain);
        nextMount.row.insertBefore(tree, nextMount.workspace);
        window.switchPassed = Boolean(eval(${JSON.stringify(expression)})) &&
          annotationConsensusThreadId() === 'thread_cached_002' &&
          nextMain.getBoundingClientRect().left >= tree.getBoundingClientRect().right;
      }
    }
    document.documentElement.dataset.result = JSON.stringify({
      legacy, current: Boolean(current), probe, diagnostic, treeBetween: window.treeBetween ?? false,
      initialThread: window.initialThread, switchPassed: window.switchPassed,
      backgroundPassed, nativeBackgroundPassed,
      oldVersion: usesClippedMainLayout('26.923.9999.0'),
      newVersion: usesClippedMainLayout('26.924.2738.0'),
    });
  </script></body></html>`);
  const output = execFileSync(chrome, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-extensions",
    `--user-data-dir=${join(temp, `chrome-${name}`)}`, "--dump-dom", `file:///${file.replaceAll("\\", "/")}`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 });
  const encoded = output.match(/data-result="([^"]+)"/)?.[1];
  assert.ok(encoded, `${name}: browser did not run the fixture`);
  const result = JSON.parse(encoded.replaceAll("&quot;", '"'));
  assert.equal(result.probe, name.startsWith("current") || name === "old" || name === "nativeFeature", `${name}: CDP qualification`);
  assert.equal(result.diagnostic.accepted, result.probe, `${name}: diagnostic matches production predicate`);
  assert.ok(result.diagnostic.checks.every((check) => typeof check.name === "string" && typeof check.actual !== "string"));
  assert.ok(!JSON.stringify(result.diagnostic).includes("private-conversation-text"), `${name}: diagnostics must not read page text`);
  assert.equal(result.backgroundPassed, true, `${name}: background removes duplicate native masks`);
  assert.equal(result.nativeBackgroundPassed, true, `${name}: disabling effects restores native surfaces`);
  if (name === "currentWrapped") {
    assert.equal(result.diagnostic.rowChildren.length, 2);
    assert.equal(result.diagnostic.rowChildren[1].containsMain, true);
    assert.equal(result.diagnostic.rowChildren[1].workspaceClass, false);
    assert.equal(result.diagnostic.mainAncestors.some((ancestor) => ancestor.workspaceClass), true);
  }
  if (name === "currentCached") {
    assert.equal(result.initialThread, 'thread_current_001', 'cached thread annotations must be ignored');
    assert.equal(result.switchPassed, true, 'activity-only page swap must preserve qualification and tree position');
    assert.equal(result.diagnostic.totalMainCount, 2);
    assert.equal(result.diagnostic.inactiveMainCount, 1);
  }
  assert.equal(result.legacy, name === "old", `${name}: legacy layout`);
  assert.equal(result.current, name.startsWith("current"), `${name}: current layout`);
  assert.equal(result.treeBetween, name.startsWith("current"), `${name}: inline file tree position`);
  assert.equal(result.oldVersion, false);
  assert.equal(result.newVersion, true);
  process.stdout.write(`${name}: qualified=${result.probe}, rowChildren=${result.diagnostic.rowChildCount}\n`);
}
