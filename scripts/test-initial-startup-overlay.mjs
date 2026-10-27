import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../packages/explorer-ui/package.json', import.meta.url));
const { build } = require('esbuild');
const entry = new URL('../packages/explorer-ui/src/startup-transition-early.ts', import.meta.url);
const bundle = await build({
  stdin: { contents: readFileSync(entry, 'utf8'), loader: 'ts', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', plugins: [{ name: 'fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path.endsWith('runtime-events')
        ? 'export const runtimeEvent=(...args)=>events.push(args);export const lastStartupFailureOrSkip=()=>undefined;'
        : args.path.endsWith('startup-transition-plugin')
          ? 'export const readStartupTransitionSettings=()=>({enabled});export const startupTransitionModule=()=>available?{}:undefined;export const startupDocumentReady=()=>false;export const startEarlyStartupTransition=async()=>controller;'
          : '', loader: 'js' }));
  } }],
});

for (const mode of ['timeout', 'normal', 'disabled', 'missing']) {
  const timers = new Map(), frames = [], events = [];
  let serial = 0, disposed = 0;
  const controller = { phase: 'loading', dispose() { disposed++; this.phase = 'complete'; } };
  const window = {
    setTimeout(callback, ms) { timers.set(++serial, { callback, ms }); return serial; },
    clearTimeout(id) { timers.delete(id); },
  };
  window.top = window;
  const context = vm.createContext({ window, document: { body: {}, readyState: 'complete' },
    location: { protocol: 'app:', host: '-', pathname: '/index.html', search: '' },
    controller, events, enabled: mode !== 'disabled', available: mode !== 'missing',
    requestAnimationFrame(callback) { frames.push(callback); }, Symbol, Date, Error });
  vm.runInContext(bundle.outputFiles[0].text, context);
  await new Promise(resolve => setImmediate(resolve));
  if (mode === 'timeout') {
    assert.equal(timers.size, 1);
    const timer = [...timers.values()][0];
    assert.equal(timer.ms, 120_000);
    timer.callback();
    assert.equal(disposed, 1);
    assert.equal(window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage, 'waiting-native');
    frames.shift()();
    assert.equal(window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage, 'waiting-native');
    assert.equal(timers.size, 0);
    const released = events.find(e => e[1] === 'early overlay');
    assert.equal(released[3].nativeReadyInferred, false);
    assert.equal(released[3].failureInferred, false);
  } else if (mode === 'normal') {
    controller.phase = 'complete'; frames.shift()();
    assert.equal(timers.size, 0); assert.equal(disposed, 0);
    assert.equal(window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage, 'complete');
  } else {
    assert.equal(timers.size, 0); assert.equal(disposed, 0);
    assert.equal(window.__CODE_CODEX_EARLY_STARTUP_STATUS__.stage, 'skipped');
  }
}
console.log('PASS: delayed overlay disposal, no false readiness/failure, normal completion, disabled and missing package.');
