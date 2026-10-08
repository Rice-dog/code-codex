import { installedBackgroundFixture } from './background-package-fixture.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

// This fixture uses the production bundle and a separate browser/profile. It
// never connects to, launches, closes, or changes the user's Codex instance.
const root = resolve(import.meta.dirname, '..');
const label = process.argv[2] ?? 'current';
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const directory = join(root, 'artifacts', `startup-source-settings-${label}`);
mkdirSync(directory, { recursive: true });
const bundle = installedBackgroundFixture(root) + readFileSync(join(root, 'packages/explorer-ui/dist/explorer.js'),'utf8');
const sourceVersion = JSON.parse(readFileSync(join(root, 'packages/explorer-ui/package.json'), 'utf8')).version;
const version = bundle.toString('utf8').match(/current version v(\d+\.\d+\.\d+)/)?.[1];
assert.ok(version, 'production bundle version found');
const tag = `code-codex-v${version.replaceAll('.', '-')}`;
const home = `<nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home" aria-current="page">Home</button></nav><button hidden data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_startup_source_001">Fixture project</button></div></aside><div data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_fixture" data-app-shell-page-surface="true"><header data-app-shell-titlebar="true"><span data-app-shell-titlebar-content>Fixture conversation</span></header><div class="_MainContentClip_fixture"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_fixture"><article data-response-annotation-conversation="thread_startup_source_001">Fixture contents</article><div data-thread-scroll-footer="true"><div data-above-composer-conversation-id="thread_startup_source_001"></div><form data-codex-composer><textarea aria-label="Message"></textarea><button>Send</button></form></div></div></main></div></div></div></div>`;
const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="modulepreload" href="/app-initial-startup-source.js"><style>
*{box-sizing:border-box}html,body,#native-root{height:100%;width:100%;margin:0}body{font:13px 'Segoe UI';color:#ddd;background:#181818}#native-root{display:flex}nav{width:50px;flex:none}aside{width:220px;flex:none}[data-app-shell-workspace-row]{display:flex;flex:1;min-width:0;height:100%}._Workspace_fixture{display:contents}._MainContentClip_fixture{display:flex;flex:1;min-width:0}main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;margin-top:8px;background:#181818}header[data-app-shell-titlebar]{position:fixed;left:270px;top:8px;height:52px;right:0;pointer-events:none}._WorkspaceContent_fixture{flex:1;display:flex;flex-direction:column;min-height:0;padding-top:52px}article{flex:1;padding:25px}textarea{height:80px;width:100%}form{padding:12px;margin:10px;border:1px solid #444;border-radius:12px}#native-root button{padding:8px;border:1px solid #555;background:#242424;color:#fff;border-radius:6px}
</style></head><body><div id="native-root">${home}</div><script>
window.fixtureErrors=[];addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.928.2636.0',supported:true};
window.__codeCodex={request:async({method,params})=>{if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};if(method==='explorer.window.transparency.set')return {enabled:params.enabled,background:'transparent'};if(method==='explorer.context')return {threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};if(method==='explorer.list')return {entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};if(method==='explorer.watch.start')return {watching:true};return {};}};
if(!localStorage.getItem('code-codex:startup-transition:v1'))localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({source:'background',backgroundId:'glow-horizon',backgroundFadeSeconds:1,clipStart:0,clipEnd:1,playbackRate:1,videoBrightness:.8,minimumVisiblePercent:25,fadePercent:15}));
</script><script src="/explorer.js"></script></body></html>`;
writeFileSync(join(directory, 'fixture.html'), html);
const server = createServer((request, response) => {
  if (request.url === '/explorer.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
  else if (request.url === '/app-initial-startup-source.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`); }
  else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const profile = mkdtempSync(join(tmpdir(), 'code-codex-startup-source-test-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--window-size=1500,1000', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
const report = { version, sourceVersion, mode: 'isolated production-bundle browser fixture', date: new Date().toISOString(), bundleSha256: createHash('sha256').update(bundle).digest('hex'), cases: [], checks: [], failures: [], browserErrors: [], cleanup: {} };
let socket;
let session;
let sequence = 0;
const pending = new Map();
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const command = (method, params = {}, targetSession = session) => new Promise((resolveCommand, rejectCommand) => {
  const id = ++sequence;
  const timeout = setTimeout(() => { pending.delete(id); rejectCommand(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve: result => { clearTimeout(timeout); resolveCommand(result); }, reject: error => { clearTimeout(timeout); rejectCommand(error); } });
  socket.send(JSON.stringify({ id, method, params, ...(targetSession ? { sessionId: targetSession } : {}) }));
});
const evaluate = async expression => {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const check = (name, actual, passed) => { report.checks.push({ name, passed, actual }); if (!passed) report.failures.push(name); };
const shadow = `document.querySelector('${tag}').shadowRoot`;
const snapshot = () => evaluate(`(()=>{const s=${shadow},p=s.querySelector('#cle-startupTransition-settings'),scroll=p.querySelector('.particle-settings-scroll'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {open:p.matches(':popover-open'),source:s.querySelector('#cle-startupTransition-source').value,panel:rect(p),viewport:{width:innerWidth,height:innerHeight},scroll:{clientHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight,scrollTop:scroll.scrollTop},previewCount:s.querySelectorAll('.startupTransition-background-live').length,controls:[...p.querySelectorAll('[data-startup-transition-setting]')].map(i=>({key:i.dataset.startupTransitionSetting,hidden:i.closest('fieldset').hidden,display:getComputedStyle(i.closest('fieldset')).display,disabled:i.disabled,value:i.value,rect:rect(i)})),saved:JSON.parse(localStorage.getItem('code-codex:startup-transition:v1')),videoPresent:!!s.querySelector('.startupTransition-video-still').src}})()`);
const open = async () => {
  await evaluate(`(()=>{const e=document.querySelector('${tag}'),s=e.shadowRoot;e.openPreviewMarket();s.querySelector('[data-appearance-plugin="code-codex.startup-transition"]').scrollIntoView({block:'center'});})()`);
  await delay(100);
  await evaluate(`${shadow}.querySelector('.startupTransition-settings-trigger').click()`);
  await delay(200);
};
const switchSource = async source => { await evaluate(`(()=>{const x=${shadow}.querySelector('#cle-startupTransition-source');x.value=${JSON.stringify(source)};x.dispatchEvent(new Event('change',{bubbles:true}));})()`); await delay(120); };
const dragRange = async (key, fraction, name) => {
  await evaluate(`${shadow}.querySelector('[data-startup-transition-setting="${key}"]').scrollIntoView({block:'center'})`);
  await delay(100);
  const before = await evaluate(`(()=>{const s=${shadow},i=s.querySelector('[data-startup-transition-setting="${key}"]'),r=i.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,value:Number(i.value),min:Number(i.min),max:Number(i.max),step:Number(i.step),hit:s.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===i,visible:r.top>=0&&r.bottom<=innerHeight};})()`);
  if (!before.visible || !before.hit || before.width <= 0 || before.height <= 0) { check(name, before, false); return; }
  const inset = 7;
  const requested = before.min + (before.max - before.min) * fraction;
  const targetFraction = Math.abs(before.value - requested) <= before.step * 2 ? .24 : fraction;
  const thumb = before.x + inset + (before.width - inset * 2) * (before.value - before.min) / (before.max - before.min);
  const destination = before.x + inset + (before.width - inset * 2) * targetFraction;
  const mouse = (type, x, buttons) => command('Input.dispatchMouseEvent', { type, x, y: before.y + before.height / 2, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  await mouse('mouseMoved', thumb, 0);
  await mouse('mousePressed', thumb, 1);
  for (let index = 1; index <= 8; index++) { await mouse('mouseMoved', thumb + (destination - thumb) * index / 8, 1); await delay(15); }
  await mouse('mouseReleased', destination, 0);
  await delay(80);
  const after = await evaluate(`(()=>{const s=${shadow},i=s.querySelector('[data-startup-transition-setting="${key}"]'),saved=JSON.parse(localStorage.getItem('code-codex:startup-transition:v1'));return {value:Number(i.value),saved:saved[${JSON.stringify(key)}],output:i.parentElement.querySelector('output').value,open:s.querySelector('#cle-startupTransition-settings').matches(':popover-open')};})()`);
  const expected = before.min + (before.max - before.min) * targetFraction;
  check(name, { before, after, expected }, after.open && after.value !== before.value && Math.abs(after.value - expected) <= before.step * 2 && after.saved === after.value);
};
try {
  const browserUrl = await new Promise((resolveUrl, rejectUrl) => {
    let stderr = '';
    const timeout = setTimeout(() => rejectUrl(new Error('Chrome endpoint timeout')), 15000);
    browser.stderr.on('data', chunk => { stderr += chunk; const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolveUrl(match[1]); } });
    browser.once('error', error => { clearTimeout(timeout); rejectUrl(error); });
  });
  socket = new WebSocket(browserUrl);
  await new Promise((resolveOpen, rejectOpen) => { socket.onopen = resolveOpen; socket.onerror = rejectOpen; });
  socket.onmessage = event => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); } };
  const { targetInfos } = await command('Target.getTargets');
  ({ sessionId: session } = await command('Target.attachToTarget', { targetId: targetInfos.find(target => target.type === 'page').targetId, flatten: true }));
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url });
  for (let i = 0; i < 120 && !(await evaluate(`document.querySelector('${tag}')?.dataset.state==='ready'`)); i++) await delay(50);
  assert.equal(await evaluate(`document.querySelector('${tag}')?.dataset.state==='ready'`), true, 'fixture host ready');
  // A generated local video exercises the same IndexedDB loading path as saved
  // user media, without reading, copying, or changing any user file.
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const context=c.getContext('2d'),stream=c.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const stopped=new Promise(r=>recorder.onstop=r);let phase=0;const timer=setInterval(()=>{context.fillStyle=phase++%2?'blue':'red';context.fillRect(0,0,160,90)},50);recorder.start();await new Promise(r=>setTimeout(r,1200));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:'video/webm'});await new Promise((resolve,reject)=>{const request=indexedDB.open('code-codex-startup-transition',1);request.onupgradeneeded=()=>request.result.createObjectStore('video',{keyPath:'id'});request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('video','readwrite');transaction.objectStore('video').put({id:'selected',blob,name:'source-switch-fixture.webm',duration:1.2,size:blob.size,type:blob.type});transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>reject(transaction.error);}});})()`);
  for (const [name, width, height] of [['desktop', 1500, 1000], ['short', 1100, 650], ['narrow', 600, 700]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await delay(150);
    await open();
    await switchSource('background');
    // Reopening once establishes the exact valid background-panel position that
    // the user's Plugin -> Video transition expands in place.
    await evaluate(`${shadow}.querySelector('.startupTransition-close').click()`);
    await open();
    const before = await snapshot();
    await switchSource('video');
    const after = await snapshot();
    report.cases.push({ name, before, after });
    check(`${name}: panel remains open after source switch`, after.open, after.open);
    check(`${name}: expanded panel within viewport`, after.panel, after.panel.y >= -0.5 && after.panel.bottom <= height + 0.5 && after.panel.x >= -0.5 && after.panel.right <= width + 0.5);
    check(`${name}: four video ranges displayed and enabled`, after.controls, after.controls.length === 4 && after.controls.every(control => !control.hidden && control.display !== 'none' && !control.disabled && control.rect.width > 0 && control.rect.height > 0));
    check(`${name}: old background preview released`, after.previewCount, after.previewCount === 0);
    const screenshot = await command('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(directory, `${name}-plugin-to-video.png`), Buffer.from(screenshot.data, 'base64'));
    for (const [key, fraction] of [['playbackRate', .76], ['videoBrightness', .66], ['minimumVisiblePercent', .61], ['fadePercent', .37]]) await dragRange(key, fraction, `${name}: real mouse drag ${key}`);
    for (let index = 0; index < 2; index++) { await switchSource('background'); await switchSource('video'); }
    const repeated = await snapshot();
    check(`${name}: repeat switches preserve live video controls`, repeated, repeated.open && repeated.source === 'video' && repeated.previewCount === 0 && repeated.controls.every(control => !control.hidden && control.rect.height > 0));
    await evaluate(`${shadow}.querySelector('.startupTransition-close').click()`);
  }
  await open();
  // Preserve only this fixture's generated record, then use the production
  // Remove button to exercise the empty-video state without changing settings.
  await evaluate(`(async()=>{window.fixtureSavedVideo=await new Promise((resolve,reject)=>{const request=indexedDB.open('code-codex-startup-transition',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,read=db.transaction('video','readonly').objectStore('video').get('selected');read.onsuccess=()=>{db.close();resolve(read.result)};read.onerror=()=>{db.close();reject(read.error)}}});${shadow}.querySelector('.startupTransition-remove').click();})()`);
  for (let i = 0; i < 100 && await evaluate(`!!${shadow}.querySelector('.startupTransition-video-still').src`); i++) await delay(30);
  await switchSource('background');
  await evaluate(`${shadow}.querySelector('.startupTransition-close').click()`);
  await open();
  await switchSource('video');
  const empty = await snapshot();
  report.emptyVideo = empty;
  check('empty video: source switch retains visible adjustable controls', empty, empty.open && !empty.videoPresent && empty.controls.every(control => !control.hidden && !control.disabled && control.rect.height > 0));
  check('empty video: expanded panel within viewport', empty.panel, empty.panel.y >= -.5 && empty.panel.bottom <= empty.viewport.height + .5);
  for (const [key, fraction] of [['playbackRate', .82], ['videoBrightness', .72], ['minimumVisiblePercent', .69], ['fadePercent', .43]]) await dragRange(key, fraction, `empty video: real mouse drag ${key}`);
  const emptyValues = await evaluate(`JSON.parse(localStorage.getItem('code-codex:startup-transition:v1'))`);
  await evaluate(`${shadow}.querySelector('.startupTransition-close').click()`);
  await evaluate(`(async()=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('code-codex-startup-transition',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,transaction=db.transaction('video','readwrite');transaction.objectStore('video').put(window.fixtureSavedVideo);transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>{db.close();reject(transaction.error)}}})})()`);
  await open();
  const restored = await snapshot();
  report.videoRestored = restored;
  check('saved video reloading preserves values adjusted without media', restored, restored.videoPresent && restored.source === 'video' && restored.controls.every(control => Number(control.value) === emptyValues[control.key]));
  const persisted = await evaluate(`JSON.parse(localStorage.getItem('code-codex:startup-transition:v1'))`);
  // Observe a new document before checking ready; the previous document can
  // still report ready immediately after Page.reload acknowledges the request.
  const previousDocument = await evaluate('performance.timeOrigin');
  await command('Page.reload');
  for (let i = 0; i < 200 && !(await evaluate(`performance.timeOrigin!==${previousDocument}&&document.querySelector('${tag}')?.dataset.state==='ready'`)); i++) await delay(50);
  assert.equal(await evaluate(`performance.timeOrigin!==${previousDocument}&&document.querySelector('${tag}')?.dataset.state==='ready'`), true, 'reloaded fixture host ready');
  await open();
  const reloaded = await snapshot();
  report.reloaded = reloaded;
  check('reload retains Video source and changed slider values', { persisted, controls: reloaded.controls }, reloaded.source === 'video' && reloaded.controls.every(control => Number(control.value) === persisted[control.key]));
  check('reload retains saved video', reloaded.videoPresent, reloaded.videoPresent);
  await evaluate(`${shadow}.querySelector('.startupTransition-reset').click()`);
  const reset = await snapshot();
  check('Reset applies promoted timing and appearance defaults', reset.saved,
    reset.saved.minimumVisiblePercent === 45 && reset.saved.fadePercent === 3 && reset.saved.videoBrightness === 1.4 && reset.saved.backgroundFadeSeconds === 3);
  check('Reset clamps the promoted trim to a short saved video', reset.saved,
    reset.saved.clipStart === 0 && Math.abs(reset.saved.clipEnd - 1.2) < .01);
  check('Reset preserves enable state and restores default source selection', reset.saved,
    reset.saved.enabled === persisted.enabled && reset.saved.source === 'video' && reset.saved.backgroundId === 'particle-image');
  report.browserErrors = await evaluate('window.fixtureErrors');
  check('no uncaught browser errors', report.browserErrors, report.browserErrors.length === 0);
} catch (error) {
  report.failures.push('fixture execution'); report.error = error.stack ?? String(error);
  if (socket?.readyState === WebSocket.OPEN && session) {
    try { report.debug = await evaluate(`({errors:window.fixtureErrors,body:document.body.innerHTML.slice(0,2000),attributes:[...document.documentElement.attributes].map(a=>[a.name,a.value]),host:document.querySelector('${tag}')?{attributes:[...document.querySelector('${tag}').attributes].map(a=>[a.name,a.value]),shadow:document.querySelector('${tag}').shadowRoot?.textContent.slice(-1500)}:null})`); } catch {}
  }
}
finally {
  if (socket?.readyState === WebSocket.OPEN) await Promise.race([command('Browser.close', {}, undefined).catch(() => {}), delay(2000)]);
  socket?.close();
  if (browser.exitCode === null) browser.kill();
  for (let i = 0; i < 30 && browser.exitCode === null; i++) await delay(100);
  report.cleanup.browserExited = browser.exitCode !== null || browser.signalCode !== null;
  await new Promise(resolveClose => server.close(resolveClose));
  report.cleanup.serverClosed = !server.listening;
  // The recursively removed directory was created by this test, is an exact
  // child of the OS temp directory, and has our unique prefix.
  const resolvedProfile = resolve(profile);
  const expectedPrefix = resolve(tmpdir()) + sep + 'code-codex-startup-source-test-';
  assert.ok(resolvedProfile.startsWith(expectedPrefix));
  try { rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); report.cleanup.profileRemoved = true; }
  catch (error) { report.cleanup.profileRemoved = false; report.cleanup.error = String(error); report.failures.push('temporary browser profile cleanup'); }
  report.passed = report.failures.length === 0;
  writeFileSync(join(directory, 'results.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.failures, cases: report.cases.map(({ name, before, after }) => ({ name, before: before.panel, after: after.panel, viewport: after.viewport })), cleanup: report.cleanup, ...(report.error ? { error: report.error } : {}) }, null, 2));
if (!report.passed) process.exitCode = 1;
