import {loadHostNamespace,nativeAccountServices} from '../../../../../resources/account-host-capabilities.js';
import {runtimeEvent} from '../../runtime-events';

const isObjectRecord = (value:unknown): value is Record<string,unknown> =>
  value!==null && typeof value==='object' && !Array.isArray(value);

export function isCodexRpcNamespace(value: unknown): value is Record<string,unknown> {
  // Stable Codex exposes RPC namespaces as callable proxies; older builds used objects.
  return value!==null&&(typeof value==="object"||typeof value==="function");
}



function appearanceModuleCandidates(): readonly string[] {
  const hints=(window as unknown as Record<symbol,{schema?:number;initial?:unknown;appearance?:unknown}|undefined>)[Symbol.for('code-codex:appearance-module-hints:v1')];
  const native=hints?.schema===1?[hints.initial,hints.appearance].flatMap(v=>Array.isArray(v)&&v.length<=4?v.filter((x):x is string=>typeof x==='string'&&x.length<=256):[]):[];
  const profile=(window as unknown as Record<symbol,{initial?:string;appearance?:string[]}|undefined>)[Symbol.for('code-codex:account-host-profile:v1')];
  const candidates=[
    ...native,
    ...(profile?.initial?[profile.initial]:[]),...(profile?.appearance??[]),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href]'),(link) => link.href),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[type=module][src]"),(script) => script.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ];
  return [...new Set(candidates.flatMap(candidate=>{try{return [new URL(candidate,location.href).href];}catch{return [];}}))];
}

export function findCodexAppInitialModule(): string|undefined {
  return findCodexAppInitialModules()[0];
}
export function findCodexAppInitialModules(): readonly string[] {
  return appearanceModuleCandidates().filter((candidate) => {
    try {
      const url=new URL(candidate,location.href);return url.protocol===location.protocol&&url.host===location.host&&!url.search&&!url.hash&&/\/app-initial-[A-Za-z0-9_-]+\.js$/.test(url.pathname);
    } catch {
      return false;
    }
  });
}

/** Only a loaded/preloaded official role module may supply the split dispatcher. */
export function findCodexAppearanceActionModules(): readonly string[] {
  return appearanceModuleCandidates().filter((candidate) => {
    try {
      const url = new URL(candidate, location.href);
      return url.protocol === location.protocol && url.host === location.host
        && !url.search && !url.hash
        && /\/run-app-action-in-primary-window-[^/]+\.js$/.test(url.pathname);
    } catch { return false; }
  });
}



export function findCodexNumberedRuntimes():readonly string[]{
 const hints=(window as unknown as Record<symbol,{schema?:number;runtimes?:unknown}|undefined>)[Symbol.for('code-codex:appearance-module-hints:v1')];
 const candidates=hints?.schema===1&&Array.isArray(hints.runtimes)&&hints.runtimes.length<=4?hints.runtimes:[];
 return [...new Set(candidates.filter((v):v is string=>typeof v==='string'&&v.length<=200&&/^\.\/assets\/[0-9]+\.[A-Za-z0-9_-]+\.js$/.test(v)))];
}

export type CodexAppearanceTheme="system"|"light"|"dark";



export type CodexAppearanceAction=
  |{ readonly type: "app.appearance.get" }
  |{
    readonly type: "app.appearance.set_mode";
    readonly mode: CodexAppearanceTheme;
  };



export interface CodexAppearanceAdapter {
  readonly runAction: (action: CodexAppearanceAction) => Promise<unknown>;
}



export function isCodexAppearanceTheme(value: unknown): value is CodexAppearanceTheme {
  return value==="system"||value==="light"||value==="dark";
}



export function selectCodexAppearanceAdapter(moduleExports: Record<string,unknown>): CodexAppearanceAdapter|undefined {
  const values=[...new Set(Object.values(moduleExports))];
  const nativeServices=new Set<unknown>(nativeAccountServices(moduleExports));
  const adapters=values.filter((value): value is {
    appActions: { runInPrimaryWindow: (request: { action: CodexAppearanceAction }) => Promise<unknown> };
  } => {
    if(!isObjectRecord(value)||!isCodexRpcNamespace(value.appActions)) {
      return false;
    }
    return typeof value.appActions.runInPrimaryWindow==="function"
      &&(nativeServices.has(value)||isCodexRpcNamespace(value.clientCoordination)
        &&typeof value.clientCoordination.invalidateQueryCache==="function");
  });
  const adapter=adapters[0];
  if(adapters.length>1) throw new Error("CC-APPEARANCE-ADAPTER-002: Multiple official Appearance namespaces matched; no setting was changed.");
  if(adapters.length===1&&adapter) {
    return { runAction: (action) => adapter.appActions.runInPrimaryWindow({ action }) };
  }

  // Older builds re-export this function from app-initial; newer builds keep
  // it in the preloaded role module. Never depend on a minified export name.
  const actions=values.filter((value): value is (action: CodexAppearanceAction) => Promise<unknown> =>
      typeof value==="function"
      &&/\.appActions\b/.test(Function.prototype.toString.call(value))
      &&/\.runInPrimaryWindow\s*\(\s*\{\s*action\s*:/.test(Function.prototype.toString.call(value)));
  if(actions.length>1) throw new Error("CC-APPEARANCE-ADAPTER-002: Multiple official Appearance dispatchers matched; no setting was changed.");
  if(actions[0]) return { runAction: actions[0] };
  return undefined;
}

export async function discoverCodexAppearanceAdapter(
  load: (path:string)=>Promise<Record<string,unknown>> = path=>import(/* @vite-ignore */path),
): Promise<CodexAppearanceAdapter> {
  const numbered=findCodexNumberedRuntimes();
  const initial=findCodexAppInitialModules();
  const modules=findCodexAppearanceActionModules();
  const counts={initialCandidates:initial.length,actionCandidates:modules.length,runtimeCandidates:numbered.length,independentHints:!!(window as unknown as Record<symbol,unknown>)[Symbol.for('code-codex:appearance-module-hints:v1')],accountRuntimeRequired:false};
  runtimeEvent("appearance","adapter discovery","started",{stage:"module-discovery",...counts});
  if(initial.length>1||modules.length>1) {
    runtimeEvent("appearance","adapter discovery","failed",{stage:"module-ambiguity",...counts});
    throw new Error("CC-APPEARANCE-ADAPTER-002: Multiple official Appearance role modules matched. stage=module-ambiguity; no setting was changed.");
  }
  if(numbered.length>1)throw new Error("CC-APPEARANCE-ADAPTER-002: Multiple official runtimes matched; no setting was changed.");
  let importsFailed=0,unmatchedExports=0;
  for(const path of numbered){
    const adapter=selectCodexAppearanceAdapter(await loadHostNamespace(path+'#cc-host=appearance',load));
    if(adapter){
      runtimeEvent("appearance","adapter discovery","confirmed",{stage:"export-contract",role:"numbered",...counts});
      return adapter;
    }
    unmatchedExports++;
  }
  for(const [role,paths] of [["initial",initial],["action",modules]] as const) {
    for(const path of paths) {
      let namespace:Record<string,unknown>;
      try{namespace=await load(path);}catch{
        importsFailed++;runtimeEvent("appearance","adapter discovery","unavailable",{stage:"module-import",role,...counts});continue;
      }
      const adapter=selectCodexAppearanceAdapter(namespace);
      if(adapter){runtimeEvent("appearance","adapter discovery","confirmed",{stage:"export-contract",role,...counts});return adapter;}
      unmatchedExports++;
    }
  }
  const stage=importsFailed?"module-import":unmatchedExports?"export-contract":"module-discovery";
  runtimeEvent("appearance","adapter discovery","failed",{stage,importsFailed,unmatchedExports,...counts});
  throw new Error(`CC-APPEARANCE-ADAPTER-001: No supported official Appearance interface was found. stage=${stage}; initialCandidates=${initial.length}; actionCandidates=${modules.length}; runtimeCandidates=${numbered.length}; importsFailed=${importsFailed}; unmatchedExports=${unmatchedExports}; accountRuntimeRequired=false; background activation was cancelled without changing the theme.`);
}



export let codexAppearanceAdapterPromise: Promise<CodexAppearanceAdapter>|undefined;



export function getCodexAppearanceAdapter(): Promise<CodexAppearanceAdapter> {
  if(!codexAppearanceAdapterPromise) {
    codexAppearanceAdapterPromise=discoverCodexAppearanceAdapter().catch((error: unknown) => {
      codexAppearanceAdapterPromise=undefined;
      throw error;
    });
  }
  return codexAppearanceAdapterPromise;
}



export async function runCodexAppearanceAction(action: CodexAppearanceAction, adapter?:CodexAppearanceAdapter): Promise<Record<string,unknown>> {
  const result=await (adapter??await getCodexAppearanceAdapter()).runAction(action);
  if(!isObjectRecord(result)) throw new Error("Codex returned an invalid Appearance response");
  return result;
}



export async function readCodexAppearanceTheme(adapter?:CodexAppearanceAdapter): Promise<CodexAppearanceTheme> {
  const result=await runCodexAppearanceAction({ type: "app.appearance.get" },adapter);
  if(!isCodexAppearanceTheme(result.mode)) {
    throw new Error("Codex returned an unsupported Appearance setting");
  }
  return result.mode;
}



export async function writeCodexAppearanceTheme(value: CodexAppearanceTheme): Promise<void> {
  const result=await runCodexAppearanceAction({ type: "app.appearance.set_mode",mode: value });
  if(result.mode!==value) {
    throw new Error("Codex did not confirm the Appearance change");
  }
}
