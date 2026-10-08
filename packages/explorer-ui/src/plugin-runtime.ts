import { runtimeEvent } from './runtime-events';

export type PluginCategory = 'appearance' | 'file-preview' | 'developer-tools';
export interface PluginPackage {
  id: string; name: string; category: PluginCategory; api: number; version: string;
  size: number; sha256: string; asset: string; relativePath?: string;
  capabilities?: string[]; dependencies?: string[];
  resources?: Array<{asset: string; size: number; sha256: string; relativePath?: string; kind?: string}>;
  defaultImageCount?: number;
}
export interface PluginModule { id: string; api: number; version: string; exports: Record<string, unknown>; }
declare const __CODE_CODEX_PLUGIN_CATALOG__: PluginPackage[];
export const PLUGIN_PACKAGES: readonly PluginPackage[] = typeof __CODE_CODEX_PLUGIN_CATALOG__ === 'undefined' ? [] : __CODE_CODEX_PLUGIN_CATALOG__;
export function pluginModules(): Map<string, PluginModule> {
  const host = window as unknown as Record<symbol, unknown>;
  return (host[Symbol.for('code-codex:plugin-modules:v1')] ??= new Map()) as Map<string, PluginModule>;
}
export function pluginModule(id: string): PluginModule {
  const module = pluginModules().get(id);
  if (!module || module.api !== 1) throw new Error(`Plugin ${id} is not loaded. Download it in Preview Market first.`);
  return module;
}
export function pluginExport<T>(id: string, name: string): T {
  const value = pluginModule(id).exports[name];
  if (value === undefined) throw new Error(`Plugin ${id} does not provide ${name}.`);
  return value as T;
}
type Request = <T>(method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<T>;
let request: Request | undefined;
const loads = new Map<string, Promise<void>>();
function verifiedModules(): Map<string,{fingerprint:string;module:PluginModule}> {
  const host=window as unknown as Record<symbol,unknown>;
  return (host[Symbol.for('code-codex:verified-plugin-modules:v1')]??=new Map()) as Map<string,{fingerprint:string;module:PluginModule}>;
}
function packageFingerprint(info: PluginPackage): string {
  return JSON.stringify([info.api,info.version,info.sha256,info.resources?.map(resource=>resource.sha256)??[]]);
}
function registeredModule(id:string):PluginModule|undefined {
  const backgrounds=(window as unknown as Record<symbol,Map<string,PluginModule>|undefined>)[Symbol.for('code-codex:background-modules:v1')];
  return pluginModules().get(id)??backgrounds?.get(id);
}
export function isPluginPackageLoaded(id:string):boolean {
  const info=PLUGIN_PACKAGES.find(p=>p.id===id),module=registeredModule(id),verified=verifiedModules().get(id);
  return !!info&&module?.api===info.api&&module.version===info.version&&verified?.fingerprint===packageFingerprint(info)&&verified.module===module;
}
export function connectPluginPackages(next: Request | undefined): void { request = next; }
export async function ensurePluginPackage(id: string): Promise<void> {
  const info = PLUGIN_PACKAGES.find(p => p.id === id);
  if(isPluginPackageLoaded(id))return;
  if (loads.has(id)) return loads.get(id);
  const current = request;
  if (!info || !current) throw new Error(`Plugin ${id} is unavailable. Download it in Preview Market first.`);
  const task = (async () => {
    runtimeEvent('plugin-package', 'load', 'started', {id, category: info.category, version: info.version});
    await current('explorer.plugins.load', {id}, 30_000);
    const module = registeredModule(id);
    if (!module || module.api !== info.api || module.version !== info.version) throw new Error(`Plugin ${id} registered an incompatible module.`);
    verifiedModules().set(id,{fingerprint:packageFingerprint(info),module});
    runtimeEvent('plugin-package', 'load', 'passed', {id, category: info.category, version: info.version});
    window.dispatchEvent(new CustomEvent('code-codex:plugin-loaded', {detail: {id}}));
  })().finally(() => loads.delete(id));
  loads.set(id, task);
  return task;
}
