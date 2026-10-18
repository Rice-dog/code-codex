/** API 1 export checks run before invoking trusted, downloaded module factories. */
export class PluginCapabilityError extends Error {
  readonly code = 'PLUGIN_EXPORT_TYPE';
  constructor(id: string, name: string, kind: string) {
    super(`Plugin ${id} export ${name} must provide an API 1 ${kind}.`);
    this.name = 'PluginCapabilityError';
  }
}
export function requireCallable<T>(id: string, name: string, value: unknown): T {
  if (typeof value !== 'function') throw new PluginCapabilityError(id, name, 'function');
  return value as T;
}
export function requireConstructor<T>(id: string, name: string, value: unknown): T {
  if (typeof value !== 'function') throw new PluginCapabilityError(id, name, 'constructor');
  try { Reflect.construct(Object, [], value); }
  catch { throw new PluginCapabilityError(id, name, 'constructor'); }
  return value as T;
}
