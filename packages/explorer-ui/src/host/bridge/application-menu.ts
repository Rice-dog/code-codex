import {ownRequestSlot} from '../../core/document-capability-owner';
type Request = <T>(method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<T>;
interface Connection { request?: Request }
const key = Symbol.for('code-codex:application-menu-capability:v1');
const store = window as unknown as Record<symbol, Connection>;
const connection = store[key] ??= {};
const methods = new Set(['explorer.official.update.prepare','explorer.host.updates.retry', 'explorer.host.updates.status', 'explorer.host.updates.open', 'explorer.login.startup.get', 'explorer.login.startup.set', 'explorer.installation.uninstall', 'explorer.installation.restart', 'explorer.welcome.consume']);

/** Uses the current authenticated document connection without revealing a tree. */
export function connectApplicationMenu(request: Request): void { ownRequestSlot(key,request); }
export function requestApplicationMenu<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!methods.has(method)) return Promise.reject(new Error('Unsupported application menu capability.'));
  if (!connection.request) return Promise.reject(new Error('Code-Codex is disconnected.'));
  return connection.request<T>(method, params, method === 'explorer.official.update.prepare' ? 45_000 : undefined);
}
