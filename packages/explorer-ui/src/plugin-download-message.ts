import {t} from './i18n';

/** User-facing download guidance. Native evidence stays in runtime diagnostics. */
export function pluginDownloadMessage(error: unknown): string {
  const value = error && typeof error === 'object' ? error as {code?:unknown;message?:unknown;errorCode?:unknown;error?:unknown} : {};
  const code = String(value.code ?? value.errorCode ?? '');
  const message = String(value.message ?? value.error ?? (typeof error === 'string' ? error : ''));
  let key = 'unknown';
  if (code === 'PLUGIN_CANCELLED') key = 'cancelled';
  else if (code === 'PLUGIN_BUSY') key = 'busy';
  else if (code.endsWith('HTTP_RATE_LIMIT')) key = 'rateLimit';
  else if (code.endsWith('HTTP_NOT_FOUND') || code === 'PLUGIN_API_ASSET') key = 'missingFile';
  else if (code === 'PLUGIN_CATALOG' || code === 'PLUGIN_ID' || code === 'PLUGIN_ORIGIN_API_METADATA') key = 'configuration';
  else if (code === 'PLUGIN_INTEGRITY') key = 'integrity';
  else if (code === 'PLUGIN_CACHE') key = 'storage';
  else if (code.endsWith('HTTP_AUTH') || code.endsWith('HTTP_FORBIDDEN')) key = 'access';
  else if (code.includes('PROXY')) key = 'proxy';
  else if (code.endsWith('TLS_HANDSHAKE')) key = 'connection';
  else if (code.includes('TLS') || code.includes('CERTIFICATE')) key = 'certificate';
  else if (code.includes('TIMEOUT') || code === 'TIMEOUT') key = 'timeout';
  else if (code.endsWith('HTTP_SERVER')) key = 'server';
  else if (code.includes('DNS') || code.includes('CONNECT') || code.includes('BODY_INTERRUPTED') || code.includes('NETWORK')) key = 'connection';
  else if (code.includes('REDIRECT')) key = 'redirect';
  else if (code === 'PLUGIN_API_METADATA' || code.includes('DECODE')) key = 'response';
  // Older cores return status messages without a code. Recognize only their
  // explicit diagnosis, never guess from an arbitrary 403 or generic failure.
  else if (!code && message.includes('The server rate limit was reached.')) key = 'rateLimit';
  else if (!code && message.includes('The requested release or asset was not found')) key = 'missingFile';
  return t(`plugins.downloadError.${key}`);
}
