import { runtimeEvent } from './runtime-events';
import { PLUGIN_PACKAGES, connectPluginPackages, ensurePluginPackage } from './plugin-runtime';

export interface BackgroundPackage {
  id: string; name: string; api: number; version: string; size: number; sha256: string; asset: string;
  resources?: Array<{asset:string;size:number;sha256:string}>;
  defaultImageCount?: number;
}
declare const __CODE_CODEX_PLUGIN_CATALOG__: BackgroundPackage[];
export const BACKGROUND_PACKAGES: readonly BackgroundPackage[] = PLUGIN_PACKAGES.filter(p => p.capabilities?.includes('background'));
export interface BackgroundModule {
  id: string; api: number; version: string;
  exports: Record<string, unknown>;
  prepareDefaults?(): Promise<void>;
  startup(target: HTMLElement, onError: (message?: string) => void): { dispose(): void; ready?: Promise<void> };
}
const KEY = Symbol.for('code-codex:background-modules:v1');
export function backgroundModules(): Map<string, BackgroundModule> {
  const host = window as unknown as Record<symbol, unknown>;
  return (host[KEY] ??= new Map()) as Map<string, BackgroundModule>;
}
export function backgroundModule(id: string): BackgroundModule {
  const module = backgroundModules().get(id);
  if (!module || module.api !== 1) throw new Error(`Background ${id} is not loaded. Download it in Preview Market first.`);
  return module;
}
type Request = <T>(method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<T>;
const loads = new Map<string, Promise<void>>();
export function connectBackgroundPackages(next: Request | undefined): void { connectPluginPackages(next); }
export async function ensureBackgroundPackage(id: string): Promise<void> {
  const info = BACKGROUND_PACKAGES.find(p => p.id === id);
  if (loads.has(id)) return loads.get(id);
  if (!info) throw new Error(`Background ${id} is unavailable. Download it in Preview Market first.`);
  const task = (async () => {
    runtimeEvent('background-package', 'load', 'started', { id, version: info.version });
    await ensurePluginPackage(id);
    const module = backgroundModule(id);
    if (module.version !== info.version) throw new Error(`Background ${id} registered an incompatible version.`);
    await module.prepareDefaults?.();
    runtimeEvent('background-package', 'load', 'passed', { id, version: info.version });
  })().finally(() => { loads.delete(id); });
  loads.set(id, task);
  return task;
}
export function cachedStartupBackground(id: string, target: HTMLElement, onError: (message?: string) => void) {
  return backgroundModule(id).startup(target, onError);
}
// Types remain those of the original renderer. No renderer implementation is
// imported here; the native loader registers only hash-verified release bytes.
export function backgroundConstructor<T extends new (...args: any[]) => any>(id: string, name: string): T {
  return function (...args: unknown[]) {
    const constructor = backgroundModule(id).exports[name];
    if (typeof constructor !== 'function') throw new Error(`Background ${id} has no ${name} factory.`);
    return Reflect.construct(constructor, args);
  } as unknown as T;
}
