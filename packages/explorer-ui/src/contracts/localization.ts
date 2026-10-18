export type UiLocale='zh-CN'|'en';
export interface LanguagePreference { schema: 1; locale: UiLocale; revision: number; source: 'installer'|'menu'|'system-default' }
export type LanguageRequest=<T>(method: string,params?: Record<string,unknown>,timeout?: number) => Promise<T>;
export interface LanguageService {
  getLocale(): UiLocale;
  languagePreference(): Readonly<LanguagePreference>;
  languageDiagnostics(): { preference: LanguagePreference; issue: unknown; catalogKeys: number; persistence: string };
  parameterLanguage(): 'zh'|'en';
  translate(text: string): string;
  t(key: string,params?: Record<string,string|number>): string;
  subscribeLanguage(listener: () => void): () => void;
  applyLanguage(preference: unknown): void;
  refreshLanguage(): Promise<void>;
  connectLanguage(request: LanguageRequest): void;
  selectLanguage(locale: UiLocale): Promise<void>;
  localizeOwnedUi(root: HTMLElement|ShadowRoot): () => void;
}
