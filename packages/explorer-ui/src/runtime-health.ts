import { runtimeEvent } from './runtime-events';
import { isHomeWorkspaceView } from './home-view';
import { isNativeLoginView } from './native-login';
import {observeNativeStructure,OWNED_ROOT_CONNECTED} from './native-structure-changes';

/** Read-only metadata: never call getContext(), copy DOM text, inspect URLs or restart effects. */
export function rendererHealth(): Record<string, unknown> {
  const trees = [...document.querySelectorAll<HTMLElement>('[data-code-codex-owned]')].filter(e => /^code-codex-v/.test(e.localName));
  const treeState = trees.slice(0, 4).map(tree => {
    const rect = tree.getBoundingClientRect(), style = getComputedStyle(tree);
    return { connected: tree.isConnected, state: tree.dataset.state ?? 'unknown', hidden: tree.hidden,
      display: style.display, visibility: style.visibility, width: Math.round(rect.width), height: Math.round(rect.height),
      shadowAvailable: !!tree.shadowRoot };
  });
  let localStorage: Record<string, unknown>;
  try { localStorage = { accessible: true, entryCount: window.localStorage.length, valuesOmitted: true }; }
  catch { localStorage = { accessible: false, reason: 'Storage access denied or unavailable' }; }
  return { schema: 1, documentState: document.readyState, visibility: document.visibilityState, onlineHint: navigator.onLine,
    onlineInterpretation: 'Browser hint, not proof that GitHub or the proxy can be reached.',
    homeDetected: isHomeWorkspaceView(), loginDetected: isNativeLoginView(document), mainCount: document.querySelectorAll('main').length,
    mountCount: document.querySelectorAll('[data-code-codex-mount]').length, treeCount: trees.length, trees: treeState,
    localStorage, officialInitialization: 'not observable in full', compatibility: 'snapshot alone does not qualify renderer layout',
    dimensions: { width: innerWidth, height: innerHeight, devicePixelRatio }, readOnly: true };
}

export function observeRendererHealth(): void {
  const key = Symbol.for('code-codex:runtime-health:v2');
  const host = window as unknown as Record<symbol, unknown>;
  if (host[key]) return;
  host[key] = true;
  // A pre-v2 document already owns resource/network/long-task listeners. Reuse
  // them during hot takeover; its private legacy timer retires on page unload.
  const legacy=!!host[Symbol.for('code-codex:runtime-health:v1')];
  const watched = new WeakSet<EventTarget>();
  let windowStart = performance.now(), count = 0, suppressed = 0, previous = '';
  const emit = (action: string, outcome: string, details: Record<string, unknown>) => {
    if (performance.now() - windowStart > 10_000) {
      if (suppressed) runtimeEvent('renderer-health', 'observation limit', 'throttled', { suppressedCount: suppressed });
      windowStart = performance.now(); count = 0; suppressed = 0;
    }
    if (++count > 10) { suppressed++; return; }
    runtimeEvent('renderer-health', action, outcome, details);
  };
  const watch = (root: Document | ShadowRoot) => {
    if(legacy)return;
    if (watched.has(root)) return; watched.add(root);
    root.addEventListener('error', event => {
      const target = event.target;
      if (!(target instanceof Element) || target === document.documentElement) return;
      if (!['VIDEO', 'AUDIO', 'IMG', 'SCRIPT', 'LINK'].includes(target.tagName)) return;
      const media = target instanceof HTMLMediaElement ? { mediaCode: target.error?.code ?? null, readyState: target.readyState,
        networkState: target.networkState, paused: target.paused } : {};
      emit('resource failure', 'failed', { elementKind: target.tagName, ...media, scope: root instanceof ShadowRoot ? 'plugin shadow root' : 'document',
        errorCode: 'RESOURCE_LOAD', observation: 'Resource error observed; response status and source ownership may be unavailable.' });
    }, true);
    root.addEventListener('webglcontextlost', () => emit('WebGL context', 'failed', { errorCode: 'GPU_CONTEXT_LOST', observation: 'Context lost; driver/root cause not inferred. Existing controller recovery remains responsible.' }), true);
    root.addEventListener('webglcontextrestored', () => emit('WebGL context', 'restored', { observation: 'Context restored event; not proof every effect has redrawn.' }), true);
  };
  const snapshot = () => {
    watch(document);
    for (const element of document.querySelectorAll('[data-code-codex-owned],[data-code-codex-runtime-information]')) {
      if (element.shadowRoot && (/^code-codex-v/.test(element.localName) || element.hasAttribute('data-code-codex-runtime-information'))) watch(element.shadowRoot);
    }
    const details = rendererHealth(), encoded = JSON.stringify(details);
    if (encoded !== previous) { emit('structural state', 'observed', details); previous = encoded; }
  };
  snapshot();
  let frame:number|undefined;
  const schedule=()=>{if(!document.hidden&&frame===undefined)frame=requestAnimationFrame(()=>{frame=undefined;snapshot();});};
  const structure=observeNativeStructure(schedule);
  window.addEventListener(OWNED_ROOT_CONNECTED,schedule);
  window.addEventListener('resize',schedule);
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('pagehide',()=>{structure.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);window.removeEventListener(OWNED_ROOT_CONNECTED,schedule);window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);},{once:true});
  if(legacy)return;
  window.addEventListener('online', () => emit('network hint', 'online', { reliableReachability: false }));
  window.addEventListener('offline', () => emit('network hint', 'offline', { reliableReachability: false }));
  try {
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('unsupported');
    const observer = new PerformanceObserver(list => {
      const tasks = list.getEntries().filter(entry => entry.duration >= 250);
      if (!document.hidden && tasks.length) emit('main thread delay', 'observed', { count: tasks.length,
        longestMs: Math.round(Math.max(...tasks.map(t => t.duration))), cause: 'not established', thresholdMs: 250 });
    });
    observer.observe({ type: 'longtask', buffered: false });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  } catch { emit('main thread observation', 'unavailable', { reason: 'Long-task PerformanceObserver unsupported' }); }
}

export async function checkRendererHealth(): Promise<void> {
  runtimeEvent('renderer-health', 'manual support snapshot', 'observed', rendererHealth());
  if (!navigator.storage?.estimate) {
    runtimeEvent('renderer-health', 'storage estimate', 'unavailable', { reason: 'Storage estimate API unavailable' }); return;
  }
  // Estimation only: no write test, persisted-data deletion or permission request.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const estimate = await Promise.race([navigator.storage.estimate(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Storage estimate exceeded 1500 ms')), 1500);
    })]);
    runtimeEvent('renderer-health', 'storage estimate', 'observed', { quotaBytes: estimate.quota ?? null, usageBytes: estimate.usage ?? null,
      interpretation: 'Origin estimate only; not a guarantee of space for a specific file write.' });
  } catch { runtimeEvent('renderer-health', 'storage estimate', 'unavailable', { reason: 'Estimate unavailable or timed out', limitMs: 1500 }); }
  finally { clearTimeout(timer); }
}
