import type { LanguageService } from '../../contracts/localization';

export type OwnedLanguageService = LanguageService & { readonly runtimeVersion?: string };
const key = Symbol.for('code-codex:language-service:v1');
const registryKey = Symbol.for('code-codex:language-service-owner:v1');
interface Registry { current: OwnedLanguageService }

function versionParts(value: string | undefined): number[] | undefined {
  return value && /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : undefined;
}

/** Old injected scripts may still assign the v1 slot before declining UI ownership. */
export function installLanguageService(service: OwnedLanguageService): boolean {
  const host = window as unknown as Record<symbol, unknown>;
  const existing = host[key] as OwnedLanguageService | undefined;
  const registry = (host[registryKey] ??= { current: existing ?? service }) as Registry;
  const accept = (candidate: OwnedLanguageService) => {
    const next = versionParts(candidate?.runtimeVersion), current = versionParts(registry.current.runtimeVersion);
    if (!next) return;
    if(current)for(let i=0;i<3;i++){
      if(next[i]===current[i])continue;
      if(next[i]!<current[i]!)return;
      break;
    }
    registry.current = candidate;
  };
  accept(service);
  Object.defineProperty(window, key, {
    configurable: true,
    enumerable: false,
    get: () => registry.current,
    set: (candidate: OwnedLanguageService) => accept(candidate),
  });
  return registry.current===service;
}
