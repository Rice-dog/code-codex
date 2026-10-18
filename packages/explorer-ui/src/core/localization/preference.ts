import type { LanguagePreference,LanguageRequest as Request } from '../../contracts/localization';
import { runtimeEvent } from '../../runtime-events';
export interface State { preference: LanguagePreference; listeners: Set<() => void>; request?: Request; tail: Promise<void>; connected?: boolean; issue?: unknown; lastIssue?: string }
const key=Symbol.for('code-codex:language:v1');
const globals=window as unknown as Record<symbol,State>;
export const state: State=globals[key]??={ preference: { schema: 1,locale: 'en',revision: 0,source: 'system-default' },listeners: new Set(),tail: Promise.resolve() };
export function validPreference(v: LanguagePreference): boolean { return !!v&&v.schema===1&&['zh-CN','en'].includes(v.locale)&&Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<=0xffffffff&&['installer','menu','system-default'].includes(v.source); }
export function applyLanguagePreference(p: unknown): void {
  if(!p||typeof p!=='object') return;
  const v=p as LanguagePreference;
  if(!validPreference(v)) return;
  if(v.revision<state.preference.revision) return;
  const changed=v.locale!==state.preference.locale||v.revision!==state.preference.revision;
  state.preference={ ...v };
  if(changed) for(const listener of [...state.listeners]) { try { listener(); } catch(error) { runtimeEvent('localization','apply','failed',{ code: 'CC-LANG-APPLY-001',reason: String(error) }); } }
}
// Native early injection supplies only a language snapshot, never a capability token.
const initialHost=window as unknown as { __CODE_CODEX_INITIAL_LANGUAGE__?: unknown };
if(initialHost.__CODE_CODEX_INITIAL_LANGUAGE__) { applyLanguagePreference(initialHost.__CODE_CODEX_INITIAL_LANGUAGE__); delete initialHost.__CODE_CODEX_INITIAL_LANGUAGE__; }
