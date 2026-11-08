// constants responsibility; original state keys, defaults and lifecycle retained.
import { CODEX_DARK_APPLY_TIMEOUT_MS } from "../../core/configuration/explorer";
import { recordCaughtRuntimeError } from "../../runtime-operations";



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
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("findCodexAppInitialModule",__codeCodexCaught);

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



export function codexDarkThemeApplied(): boolean {
  const root=document.documentElement;
  const dark=root.classList.contains("electron-dark")
    ||root.classList.contains("dark")
    ||root.dataset.theme==="dark";
  const light=root.classList.contains("electron-light")
    ||root.classList.contains("light")
    ||root.dataset.theme==="light";
  return dark&&!light;
}



export function waitForCodexDarkTheme(): Promise<void> {
  return new Promise((resolve,reject) => {
    let settled=false;
    let timer=0;
    let observer: MutationObserver|undefined;
    const cleanup=(): void => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
    const finish=(): void => {
      if(settled) return;
      settled=true;
      cleanup();
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const check=(): void => {
      if(codexDarkThemeApplied()) finish();
    };
    if(codexDarkThemeApplied()) {
      finish();
      return;
    }
    observer=new MutationObserver(check);
    observer.observe(document.documentElement,{ attributes: true,attributeFilter: ["class","data-theme"] });
    timer=window.setTimeout(() => {
      if(settled) return;
      settled=true;
      cleanup();
      reject(new Error("Codex did not finish applying Dark appearance"));
    },CODEX_DARK_APPLY_TIMEOUT_MS);
    check();
  });
}

export function findCodexNumberedRuntimes():readonly string[]{
 const hints=(window as unknown as Record<symbol,{schema?:number;runtimes?:unknown}|undefined>)[Symbol.for('code-codex:appearance-module-hints:v1')];
 const candidates=hints?.schema===1&&Array.isArray(hints.runtimes)&&hints.runtimes.length<=4?hints.runtimes:[];
 return [...new Set(candidates.filter((v):v is string=>typeof v==='string'&&v.length<=200&&/^\.\/assets\/[0-9]+\.[A-Za-z0-9_-]+\.js$/.test(v)))];
}
