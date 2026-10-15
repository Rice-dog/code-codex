import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchFixture, delay } from './browser-fixture.mjs';
import { verifiedPluginSources } from './plugin-package-files.mjs';

// Deliberately starts without installedBackgroundFixture: core must work with
// an empty optional-package cache, including when an old preference is enabled.
const root = resolve(import.meta.dirname, '..');
const ui = resolve(root, 'packages/explorer-ui');
const version = JSON.parse(readFileSync(resolve(ui, 'package.json'), 'utf8')).version;
const out = resolve(root, `artifacts/optional-startup-v${version}`);
mkdirSync(out, { recursive: true });
const fixture = readFileSync(resolve(root, 'scripts/test-startup-source-settings.mjs'), 'utf8');
const home = fixture.match(/const home = `([^`]+)`;/)[1];
const css = fixture.match(/<style>([\s\S]*?)<\/style>/)[1];
const core = readFileSync(resolve(ui, 'dist/explorer.js'), 'utf8');
const directory = resolve(ui, 'dist/plugins');
const catalog = JSON.parse(readFileSync(resolve(directory, 'catalog.json'), 'utf8'));
const startup = catalog.find(p => p.id === 'codex-startup-transition');
const startupSource = verifiedPluginSources(directory, startup).join('\n');
const others = catalog.filter(p => p !== startup).map(p => verifiedPluginSources(directory, p).join('\n')).join('\n');
const baseline = process.argv.includes('--expect-baseline-failure');
const reports = [];
const server = createServer((req, res) => {
  const scenario = new URL(req.url, 'http://fixture').searchParams.get('case') ?? 'empty';
  if (req.url.startsWith('/core.js')) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end((scenario === 'others' ? others : '') + core);
  } else if (req.url.endsWith('.js')) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end('export const adapter={appActions:{runInPrimaryWindow:async()=>({mode:"dark"})},clientCoordination:{invalidateQueryCache:async()=>({})}};');
  } else {
    res.setHeader('Content-Type', 'text/html');
    const content = scenario === 'no-task' ? home.replaceAll('data-app-action-sidebar-thread-active="true"', '').replaceAll('data-response-annotation-conversation="thread_startup_source_001"', '').replaceAll('data-above-composer-conversation-id="thread_startup_source_001"', '') : home;
    res.end(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="modulepreload" href="/app-fixture.js"><style>${css}</style></head><body><div id="native-root">${content}</div><script>
window.errors=[];window.nativeCalls=[];window.runtimeEvents=[];window.loaded=false;
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:${scenario === 'enabled'},selectedVideoId:'preserved-original',clipStart:2,clipEnd:12}));
${scenario === 'incompatible' ? "window[Symbol.for('code-codex:plugin-modules:v1')]=new Map([['codex-startup-transition',{api:2,exports:{}}]]);" : ''}
window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.1007.9446.0',supported:true,centralizedStorage:true};
window.__codeCodex={request:async({method,params})=>{
 nativeCalls.push({method,params});
 if(method==='explorer.settings.get'||method==='explorer.settings.set')return{collapsed:false,panelWidth:260,startupTransitionEnabled:${scenario === 'enabled'}};
 if(method==='explorer.context')return{threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};
 if(method==='explorer.list')return{entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};
 if(method==='explorer.watch.start')return{watching:true};
 if(method==='explorer.plugins.status')return ${JSON.stringify(catalog.map(p => ({id:p.id,installed:scenario === 'others' && p !== startup})))}.map(p=>p.id==='codex-startup-transition'&&loaded?{...p,installed:true}:p);
 if(method==='explorer.plugins.load')return{loaded:true};
 if(method==='explorer.storage.request'){if(params.action==='settings.read')return{'code-codex:startup-transition:v1':JSON.stringify({enabled:${scenario === 'enabled'},selectedVideoId:'preserved-original',clipStart:2,clipEnd:12})};if(params.action==='media.list')return[];return{saved:true,verified:true};}
 if(method==='explorer.runtime.append'){runtimeEvents.push(...(params.events??[]));return{accepted:(params.events??[]).length};}
 return{};
}};
</script><script src="/core.js?case=${scenario}"></script></body></html>`);
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
try {
  for (const scenario of baseline ? ['empty'] : ['empty', 'enabled', 'others', 'incompatible', 'no-task']) {
    const browser = await launchFixture(`http://127.0.0.1:${server.address().port}/index.html?case=${scenario}`);
    const report = { scenario, version, checks: [] };
    const ev = expression => browser.evaluate(expression);
    const wait = async expression => {
      for (let n = 0; n < 160; n++) { if (await ev(expression)) return; await delay(50); }
      throw Error('Timeout ' + expression);
    };
    const check = async (name, expression) => { assert.ok(await ev(expression), `${scenario}: ${name}`); report.checks.push(name); };
    try {
      await wait(`!!document.querySelector('code-codex-v${version.replaceAll('.', '-')}')`);
      await ev(`window.h=document.querySelector('code-codex-v${version.replaceAll('.', '-')}');window.q=s=>h.shadowRoot.querySelector(s)`);
      if (baseline) {
        await wait(`errors.some(e=>e.includes('Codex Startup Transition is not loaded'))`);
        await check('Old core aborts before context/list when optional Startup is absent', `!nativeCalls.some(c=>c.method==='explorer.context'||c.method==='explorer.list')`);
      } else {
        if (scenario !== 'no-task') {
          await wait(`nativeCalls.some(c=>c.method==='explorer.watch.start')&&h.shadowRoot.textContent.includes('README.md')`);
          await check('Local task resolves and lists files without optional Startup', `nativeCalls.some(c=>c.method==='explorer.context')&&nativeCalls.some(c=>c.method==='explorer.list')`);
          await check('Tree displays a real fixture file instead of its initial WAIT shell', `q('#cle-tree').textContent.includes('README.md')`);
        } else {
          await delay(700);
          await check('No task clears context without inventing a filesystem root', `!nativeCalls.some(c=>c.method==='explorer.context'||c.method==='explorer.list')&&nativeCalls.some(c=>c.method==='explorer.context.clear')`);
        }
        await check('No uncaught error, automatic download or automatic Startup load', `errors.length===0&&!nativeCalls.some(c=>c.method==='explorer.plugins.install'||c.method==='explorer.plugins.load'&&c.params?.id==='codex-startup-transition')`);
        await check('Missing optional module preserves selected video and clip settings', `JSON.parse(localStorage.getItem('code-codex:startup-transition:v1')).selectedVideoId==='preserved-original'`);
        await ev('h.openPreviewMarket();h.openPreviewMarket()');
        await check('Missing player settings stay disabled and market offers Download', `q('.startupTransition-settings-trigger').disabled&&q('.startupTransition-enable').textContent==='Download'`);
        await check('Repeated renders report optional absence once without marking it as a failure', `(()=>{const events=[...runtimeEvents,...(window[Symbol.for('code-codex:runtime-events:v1')]?.events??[])].filter(e=>e.source==='startup-animation'&&e.action==='settings renderer');return events.length===1&&events[0].outcome==='skipped'&&events[0].details.coreInitializationContinues===true&&events[0].details.networkRequested===false})()`);
        if (scenario === 'others') {
          await ev(`document.querySelector('[data-app-action-sidebar-thread-id]').setAttribute('data-app-action-sidebar-thread-id','local:thread_startup_source_002');document.querySelector('[data-response-annotation-conversation]').setAttribute('data-response-annotation-conversation','thread_startup_source_002');document.querySelector('[data-above-composer-conversation-id]').setAttribute('data-above-composer-conversation-id','thread_startup_source_002')`);
          await wait(`nativeCalls.some(c=>c.method==='explorer.context'&&c.params.threadId==='thread_startup_source_002')&&nativeCalls.filter(c=>c.method==='explorer.watch.start').length>=2`);
          await check('Changing the active local task still resolves and watches the new context', `q('#cle-tree').textContent.includes('README.md')&&errors.length===0`);
        }
        if (scenario === 'empty') {
          await ev(`window.loaded=true;${startupSource}\nh.openPreviewMarket();`);
          await wait(`!q('.startupTransition-settings-trigger').disabled&&!q('.startupTransition-settings-trigger').hidden`);
          await ev(`q('.startupTransition-settings-trigger').click()`);
          await wait(`q('#cle-startupTransition-settings').matches(':popover-open')`);
          await check('Explicitly registered verified Startup opens its original settings on the same tree', `document.querySelector('code-codex-v${version.replaceAll('.', '-')}')===h&&!!q('.startupTransition-timeline')&&q('#cle-tree').textContent.includes('README.md')&&errors.length===0`);
          await ev(`q('.startupTransition-close').click()`);
          const shot = await browser.command('Page.captureScreenshot', {format:'png'});
          writeFileSync(resolve(out, 'empty-cache-tree.png'), Buffer.from(shot.data, 'base64'));
        }
      }
      report.errors = await ev('errors');
      report.calls = await ev(`nativeCalls.map(c=>({method:c.method,id:c.params?.id}))`);
      report.passed = true;
      console.log(`${scenario}: ${report.checks.length} checks passed`);
    } catch (error) {
      report.passed = false; report.error = String(error); report.errors = await ev('errors');
      report.events = await ev(`[...runtimeEvents,...(window[Symbol.for('code-codex:runtime-events:v1')]?.events??[])]`);
      report.appendCalls = await ev(`nativeCalls.filter(c=>c.method==='explorer.runtime.append')`);
      report.calls = await ev('nativeCalls.map(c=>c.method)'); throw error;
    } finally { reports.push(report); await browser.close(); }
  }
} finally {
  writeFileSync(resolve(out, baseline ? 'baseline.json' : 'results.json'), JSON.stringify({version,classification:'Production bundle in isolated Chrome; simulated native bridge, no official Codex/Win10 cold launch',reports}, null, 2));
  await new Promise(r=>server.close(r));
}
