import english from '../../../../../resources/i18n/en.json';
import chinese from '../../../../../resources/i18n/zh-CN.json';
import { runtimeEvent } from '../../runtime-events';

import type { UiLocale,LanguagePreference,LanguageRequest as Request,LanguageService } from '../../contracts/localization';
import { localizeOwnedUi } from './owned-ui';
import { state,validPreference,applyLanguagePreference as applyLanguage } from './preference';
export { applyLanguagePreference as applyLanguage } from './preference';
const en: Readonly<Record<string,string>>=english,zh: Readonly<Record<string,string>>=chinese;
const reverse=new Map<string,string>();
const templates: Array<{ locale: UiLocale; pattern: RegExp; names: string[]; key: string; specificity: number }>=[];
const escapePattern=(v: string) => v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
for(const [locale,catalog] of [['en',en],['zh-CN',zh]] as const) {
  for(const [key,value] of Object.entries(catalog)) {
    const matches=[...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)]; if(!matches.length) continue;
    let pattern='^',offset=0; const names: string[]=[];
    for(const match of matches) { pattern+=escapePattern(value.slice(offset,match.index))+(/Label$/.test(match[1]!)? '([^\\s·]+)':['detail','execution','animations'].includes(match[1]!)? '(.*?)':'(.+?)'); names.push(match[1]!); offset=match.index!+match[0].length; }
    pattern+=escapePattern(value.slice(offset))+'$'; templates.push({ locale,pattern: new RegExp(pattern),names,key,specificity: value.replace(/\{[^}]+\}/g,'').length });
  }
}
templates.sort((a,b) => b.specificity-a.specificity);
for(const [k,v] of Object.entries(en)) { reverse.set(v,k); if(zh[k]) reverse.set(zh[k]!,k); }
export function getLocale(): UiLocale { return state.preference.locale; }
export function languagePreference(): Readonly<LanguagePreference> { return state.preference; }
export function languageDiagnostics() { return { preference: state.preference,issue: state.issue??null,catalogKeys: Object.keys(en).length,persistence: state.preference.revision>0? 'saved':'session-default' }; }
export function parameterLanguage(): 'zh'|'en' { return getLocale()==='zh-CN'? 'zh':'en'; }
export function translate(text: string): string {
  const k=reverse.get(text)??text,target=getLocale()==='zh-CN'? zh:en;
  if(target[k]) return target[k]!;
  if(text.length<=4096) for(const template of templates) {
    const match=template.pattern.exec(text); if(!match) continue;
    const values=Object.fromEntries(template.names.map((name,index) => [name,match[index+1]!]));
    // Only these count-label slots are product-owned vocabulary. File names,
    // paths and other interpolation values are never recursively translated.
    const labelSlots: Record<string,string[]>={ 'preview.csv.summary': ['rowLabel','columnLabel'],'preview.model.summary': ['meshLabel','resourceLabel'],'preview.notebook.summary': ['cellLabel'],'preview.drawio.summary': ['pageLabel'],'git.files.summary': ['fileLabel'] };
    for(const name of labelSlots[template.key]??[]) { if(values[name]) values[name]=translate(values[name]!); }
    if(template.key==='preview.model.summary') values.animations=values.animations?.replace(/[0-9][0-9.,]* animations?/g,value => translate(value))??'';
    if(en[template.key]?.startsWith('Code cell ')&&values.execution) values.execution=translate(values.execution);
    if(en[template.key]==='{action} model animation (Space)'&&values.action) values.action=translate(values.action);
    return (target[template.key]??en[template.key]??text).replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g,(all,name: string) => values[name]??all);
  }
  if(text.includes(' · ')) {
    const parts=text.split(' · ');
    // Composite statuses contain only catalog vocabulary and numeric units;
    // never translate an arbitrary user-provided name embedded in a sentence.
    if(parts.every(part => reverse.has(part)||/^[0-9.,]+\s*(?:%|B|KB|MB|GB|ms|s)?$/.test(part))) return parts.map(part => translate(part)).join(' · ');
  }
  return text;
}
const missingKeys=new Set<string>();
export function t(key: string,params: Record<string,string|number>={}): string {
  if(!reverse.has(key)&&!en[key]&&/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(key)) {
    if(!missingKeys.has(key)&&missingKeys.size<32) { missingKeys.add(key); runtimeEvent('localization','missing text','fallback',{ code: 'CC-LANG-TEXT-001',key }); }
    return translate('Language text is unavailable.');
  }
  return translate(key).replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g,(all,k: string) => Object.hasOwn(params,k)? String(params[k]):all);
}
export function subscribeLanguage(listener: () => void): () => void { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }
export async function refreshLanguage(): Promise<void> {
  if(!state.request) return;
  const before=state.preference;
  const result=await state.request<{ preference: LanguagePreference; issue?: unknown }>('explorer.language.get',{},5000);
  state.issue=result.issue; const issue=JSON.stringify(result.issue??null);
  if(issue!==state.lastIssue) { state.lastIssue=issue; if(result.issue) runtimeEvent('localization','resolve','fallback',{ issue: result.issue }); }
  // A first-install rollback can restore absence (revision 0). Accept that
  // authoritative snapshot only if no notification or save overtook this read.
  if(state.preference===before&&validPreference(result.preference)&&result.preference.revision<before.revision) {
    state.preference={ ...before,revision: 0 };
  }
  applyLanguage(result.preference);
}
export function connectLanguage(request: Request): void {
  state.request=(method,params,timeout) => {
    if(method!=='explorer.language.get'&&method!=='explorer.language.set') return Promise.reject(new Error('Language capability only supports language preferences.'));
    return request(method,params,timeout);
  };
  if(!state.connected) { state.connected=true; window.addEventListener('focus',() => { void refreshLanguage().catch(() => { }); }); }
  void refreshLanguage().catch(() => { });
}
export function selectLanguage(locale: UiLocale): Promise<void> {
  const run=async () => {
    if(!state.request) throw new Error(t('language.unavailable'));
    runtimeEvent('localization','save','started',{ locale,expectedRevision: state.preference.revision });
    try { applyLanguage(await state.request<LanguagePreference>('explorer.language.set',{ locale,expectedRevision: state.preference.revision },5000)); runtimeEvent('localization','save','passed',{ ...state.preference }); }
    catch(error) { runtimeEvent('localization','save','failed',{ code: 'CC-LANG-WRITE-001',reason: String(error) }); await refreshLanguage().catch(() => { }); throw error; }
  };
  const next=state.tail.then(run,run); state.tail=next.catch(() => { }); return next;
}

// A narrow host capability lets optional plugins share language without bundling
// installation dictionaries, native persistence, or DOM observers.
const service: LanguageService={ getLocale,languagePreference,languageDiagnostics,parameterLanguage,translate,t,subscribeLanguage,applyLanguage,refreshLanguage,connectLanguage,selectLanguage,localizeOwnedUi };
(window as unknown as Record<symbol,LanguageService>)[Symbol.for('code-codex:language-service:v1')]=service;
