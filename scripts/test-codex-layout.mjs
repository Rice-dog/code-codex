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

for (const [name, markup] of Object.entries(fixtures)) {
  const file = join(temp, `${name}.html`);
  writeFileSync(file, `<!doctype html><html><head><style>
    [data-app-shell-workspace-row] { display: flex; width: 1200px; height: 400px; }
    ._Workspace_gs442_2 { display: contents; }
    ._MainContentClip_gs442_2 { display: flex; flex: 1; }
    .content-holder { display: flex; flex: 1; }
    aside { width: 300px; flex: none; }
    main { flex: 1; }
  </style></head><body>${markup}<script>
    window.exports = {};
    ${adapter}\n${versions}
    const main = document.querySelector('main');
    const legacy = Boolean(qualifiedAppShellForMain(main));
    const current = qualifiedWorkspaceRowForMain(main);
    const probe = Boolean(eval(${JSON.stringify(expression)}));
    if (current) {
      const tree = document.createElement('div');
      tree.style.cssText = 'width:260px;flex:none;height:400px';
      current.row.insertBefore(tree, current.workspace);
      const railRight = current.row.querySelector('aside').getBoundingClientRect().right;
      const treeRect = tree.getBoundingClientRect();
      const mainLeft = main.getBoundingClientRect().left;
      window.treeBetween = treeRect.left >= railRight && mainLeft >= treeRect.right;
    }
    document.documentElement.dataset.result = JSON.stringify({
      legacy, current: Boolean(current), probe, treeBetween: window.treeBetween ?? false,
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
  assert.equal(result.probe, name.startsWith("current") || name === "old", `${name}: CDP qualification`);
  assert.equal(result.legacy, name === "old", `${name}: legacy layout`);
  assert.equal(result.current, name.startsWith("current"), `${name}: current layout`);
  assert.equal(result.treeBetween, name.startsWith("current"), `${name}: inline file tree position`);
  assert.equal(result.oldVersion, false);
  assert.equal(result.newVersion, true);
  process.stdout.write(`${name}: ${JSON.stringify(result)}\n`);
}
