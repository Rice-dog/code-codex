import * as player from './startup-transition-player';
import * as transition from './startup-transition';
import * as media from './startup-transition-media';
import * as timeline from './startup-transition-timeline';
import * as readiness from './startup-readiness';

declare const __CODE_CODEX_STARTUP_PACKAGE_VERSION__: string;
const host = window as unknown as Record<symbol, unknown>;
const key = Symbol.for('code-codex:plugin-modules:v1');
const registry = (host[key] ??= new Map()) as Map<string, unknown>;
registry.set('codex-startup-transition', {
  id: 'codex-startup-transition', api: 1, version: __CODE_CODEX_STARTUP_PACKAGE_VERSION__,
  exports: { ...player, ...transition, ...media, ...timeline, ...readiness },
});
