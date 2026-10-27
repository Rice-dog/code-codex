type Request = <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
interface Connection { request?: Request }
const key = Symbol.for('code-codex:application-menu-capability:v1');
const store = window as unknown as Record<symbol, Connection>;
const connection = store[key] ??= {};
const methods = new Set(['explorer.login.startup.get', 'explorer.login.startup.set', 'explorer.installation.uninstall']);

/** Uses the current authenticated document connection without revealing a tree. */
export function connectApplicationMenu(request: Request): void { connection.request = request; }
export function requestApplicationMenu<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!methods.has(method)) return Promise.reject(new Error('Unsupported application menu capability.'));
  if (!connection.request) return Promise.reject(new Error('Code-Codex is disconnected.'));
  return connection.request<T>(method, params);
}
