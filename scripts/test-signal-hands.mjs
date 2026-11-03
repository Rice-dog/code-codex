// Exercises the compiled marketplace and verified package in a real browser.
// Only the native Bridge and Codex appearance module are supplied by the fixture.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { launchFixture, delay } from './browser-fixture.mjs';
import { verifiedPluginSources } from './plugin-package-files.mjs';
import { builtExplorerTag } from './ui-build-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'packages/explorer-ui/dist');
const tag = builtExplorerTag(root);
const catalog = JSON.parse(await readFile(resolve(dist, 'plugins/catalog.json'), 'utf8'));
const plugin = catalog.find(item => item.id === 'signal-hands');
assert.ok(plugin?.capabilities.includes('background'));
const sources = verifiedPluginSources(resolve(dist, 'plugins'), plugin);
const template = await readFile(resolve(root, 'scripts/fixtures/import-home.html'), 'utf8');
const html = template.replace('<head>', '<head><link rel="modulepreload" href="/app-initial-fixture.js">')
  .replace('<script src="__BUNDLE_URL__">', '<script src="/bridge.js"></script><script src="/explorer.js">');
const bridge = () => {
  const request = window.__codeCodex.request;
  // Keep the actual Worker and its payload; observe, rather than synthesize, the
  // signed wheel deltas received by the filtered input lane.
  window.scrollDeltas = [];
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(message, ...rest) {
    if (message?.type === 'call' && message.method === 'scroll') window.scrollDeltas.push(message.args[0]);
    return post.call(this, message, ...rest);
  };
  let installed = false;
  window.__codeCodex.request = async message => {
    const { method, params } = message;
    if (method === 'explorer.plugins.status') return [{id:'signal-hands', installed}];
    if (method === 'explorer.plugins.install' && params.id === 'signal-hands') {
      installed = true;
      return { installed };
    }
    if (method === 'explorer.plugins.load' && params.id === 'signal-hands') {
      if (!installed) throw Error('Signal Between has not been downloaded');
      for (const source of await (await fetch('/package.json')).json()) (0, eval)(source);
      return { loaded: true };
    }
    if (method === 'explorer.window.transparency.set') return {enabled:params.enabled, background:'transparent'};
    return request(message);
  };
};
const routes = new Map([
  ['/bridge.js', ['text/javascript', '(' + bridge.toString() + ')()']],
  ['/explorer.js', ['text/javascript', await readFile(resolve(dist, 'explorer.js'))]],
  ['/package.json', ['application/json', JSON.stringify(sources)]],
  ['/app-initial-fixture.js', ['text/javascript',
    'export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??"dark"})},clientCoordination:{invalidateQueryCache:async()=>({})}};']],
  ['/', ['text/html; charset=utf-8', html]],
]);
const server = createServer((req,res) => {
  const route = routes.get(req.url);
  if (!route) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',route[0]); res.end(route[1]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchFixture('http://127.0.0.1:' + server.address().port + '/');
  const evaluate = browser.evaluate;
  async function wait(expression) {
    for (let i=0; i<300; i++) { if(await evaluate(expression)) return; await delay(50); }
    throw Error(expression + ' did not become true: ' + JSON.stringify(await evaluate('({errors, diagnostics: window.rt?.diagnostics, status: window.rt?.error})')));
  }
  const tree = 'document.querySelector(' + JSON.stringify(tag) + ')';
  await wait(tree + '?.dataset.state === "ready"');
  await evaluate(tree + '.openPreviewMarket()');
  await evaluate('window.shadow = ' + tree + '.shadowRoot; window.card=shadow.querySelector(".signal-hands-card"); window.action=card.querySelector(".preview-extension-action"); window.rt=window[Symbol.for("code-codex:signal-hands-controller:v1")]; void 0');
  await wait('action.textContent === "Download"');
  await evaluate('action.click()');
  await wait('action.textContent === "Enable"');
  assert.equal(await evaluate('rt.enabled'), false, 'Download should not activate the background');
  await evaluate('action.click()');
  await wait('rt.enabled && rt.diagnostics.phase === "running" && !action.disabled');
  await evaluate('window.field=document.querySelector("[data-code-codex-signal-hands-layer] canvas"); void 0');
  // Draw the transferred canvas into a second canvas to read displayed pixels;
  // readiness alone would pass for an empty or uniformly painted background.
  await wait('(()=>{const c=document.createElement("canvas");c.width=300;c.height=175;const ctx=c.getContext("2d");ctx.drawImage(field,0,0,c.width,c.height);const p=ctx.getImageData(0,0,c.width,c.height).data;let ink=0;for(let i=0;i<p.length;i+=4)if(p[i+2]-p[i]>18&&p[i+2]>60)ink++;return ink>100})()');
  await evaluate('card.querySelector(".signal-hands-settings").click(); window.panel=shadow.getElementById("cle-signal-hands-settings"); void 0');
  await wait('panel.matches(":popover-open")');
  await evaluate('const flow=panel.querySelector("[data-signal-range=flowStrength]");flow.value=0;flow.dispatchEvent(new Event("input",{bubbles:true}));');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("code-codex:signal-hands-settings:v1")).flowStrength'), 0);
  await evaluate('flow.value=85;flow.dispatchEvent(new Event("input",{bubbles:true}));panel.querySelector(".particle-settings-close").click();');
  // Exercise the same wheel event that drives native scrolling, in both directions.
  await evaluate('window.scroller=document.createElement("section");scroller.style.cssText="position:fixed;right:0;top:0;width:25vw;height:100vh;overflow:auto;z-index:2147483647";scroller.innerHTML="<div style=\'height:5000px\'></div>";document.body.append(scroller);scroller.scrollTop=900;');
  const point = await evaluate('({x:innerWidth-50,y:innerHeight/2})');
  for (const deltaY of [180,-180]) {
    const before = await evaluate('scroller.scrollTop');
    await browser.command('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY});
    await wait((deltaY > 0 ? 'scroller.scrollTop >= ' : 'scroller.scrollTop <= ') + (before + deltaY));
    await wait('scrollDeltas.at(-1) === ' + deltaY);
  }
  // Optional artwork-only capture for visual review (no host UI or user data).
  if (process.env.CODE_CODEX_TEST_OUTPUT) {
    const image = await evaluate('(()=>{const c=document.createElement("canvas");c.width=960;c.height=Math.round(960*field.height/field.width);c.getContext("2d").drawImage(field,0,0,c.width,c.height);return c.toDataURL("image/webp",0.90).split(",")[1]})()');
    await mkdir(process.env.CODE_CODEX_TEST_OUTPUT, {recursive:true});
    await writeFile(resolve(process.env.CODE_CODEX_TEST_OUTPUT,'signal-hands.webp'), Buffer.from(image,'base64'));
  }
  await evaluate('scroller.remove(); action.click();');
  await wait('!rt.enabled && !document.querySelector("[data-code-codex-signal-hands-layer]") && !window[Symbol.for("code-codex:background-isolation:v1")]?.size');
  await evaluate('action.click()');
  await wait('rt.enabled && rt.settings.flowStrength === 0.85 && !action.disabled');
  await evaluate('action.click()');
  await wait('!rt.enabled && !window[Symbol.for("code-codex:background-isolation:v1")]?.size');
  assert.deepEqual(await evaluate('errors'), []);
  console.log('Signal Between: cold download, first painted frame, settings, native scroll in both directions, disable/re-enable and worker teardown passed.');
} finally {
  try { await browser?.close(); } finally { server.close(); }
}
