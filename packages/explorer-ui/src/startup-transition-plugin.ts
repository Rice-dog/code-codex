import { runtimeEvent } from './runtime-events';
import type { StartupTransitionController } from './startup-transition';
export { DEFAULT_STARTUP_TRANSITION_SETTINGS, readStartupTransitionSettings, writeStartupTransitionSettings, startupDefaultClip, type StartupTransitionSettings } from './startup-transition-settings';

const MODULE_KEY = Symbol.for('code-codex:plugin-modules:v1');
export const STARTUP_TRANSITION_PACKAGE_ID = 'codex-startup-transition';
type Player = typeof import('./startup-transition-player');
type Exports = Player & typeof import('./startup-transition') & typeof import('./startup-transition-media') & typeof import('./startup-transition-timeline') & typeof import('./startup-readiness');
/** Core contract only. Player, media and timeline implementations come from a verified download. */
export function startupTransitionModule(): Exports | undefined {
  const registry = (window as unknown as Record<symbol, unknown>)[MODULE_KEY] as Map<string, { api: number; exports: Exports }> | undefined;
  const module = registry?.get(STARTUP_TRANSITION_PACKAGE_ID);
  return module?.api === 1 ? module.exports : undefined;
}
export function requireStartupTransitionModule(): Exports {
  const module = startupTransitionModule();
  if (!module) throw new Error('Codex Startup Transition is not loaded. Download it in Preview Market first.');
  return module;
}
export function prepareStartupTransitionHandoff(active: boolean): void {
  startupTransitionModule()?.prepareStartupTransitionHandoff(active);
}
export function getStartupTransitionController(): StartupTransitionController | undefined {
  return (window as unknown as Record<symbol, unknown>)[Symbol.for('code-codex:startup-transition:controller:v1')] as StartupTransitionController | undefined;
}
export async function startStartupTransitionOnLaunch(active: boolean, loadingOnly = false): Promise<StartupTransitionController | undefined> {
  const module = startupTransitionModule();
  if (module) return module.startStartupTransitionOnLaunch(active, loadingOnly);
  runtimeEvent('startup-animation', 'launch playback', 'skipped', { reason: 'startup package is not downloaded or verified', networkRequested: false });
  return undefined;
}
export async function startEarlyStartupTransition(): Promise<StartupTransitionController | undefined> {
  const module = startupTransitionModule();
  if (module) return module.startEarlyStartupTransition();
  runtimeEvent('startup-animation', 'early playback', 'skipped', { reason: 'startup package is not downloaded or verified', networkRequested: false });
  return undefined;
}
export function getEarlyStartupTransition(): Promise<StartupTransitionController | undefined> {
  return (window as unknown as Record<symbol, unknown>)[Symbol.for('code-codex:startup-transition:early-promise:v1')] as Promise<StartupTransitionController | undefined>
    ?? Promise.resolve(getStartupTransitionController());
}
export function startupDocumentReady(): boolean {
  return startupTransitionModule()?.startupDocumentReady() ?? false;
}
