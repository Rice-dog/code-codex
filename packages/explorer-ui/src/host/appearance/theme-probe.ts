// constants responsibility; original state keys, defaults and lifecycle retained.
import { CODEX_DARK_APPLY_TIMEOUT_MS } from "../../core/configuration/explorer";
import { recordCaughtRuntimeError } from "../../runtime-operations";



export function isCodexRpcNamespace(value: unknown): value is Record<string,unknown> {
  // Stable Codex exposes RPC namespaces as callable proxies; older builds used objects.
  return value!==null&&(typeof value==="object"||typeof value==="function");
}



export function findCodexAppInitialModule(): string|undefined {
  const candidates=[
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"][href]'),(link) => link.href),
    ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[type=module][src]"),(script) => script.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name),
  ];
  return candidates.find((candidate) => {
    try {
      return /\/app-initial-[^/]+\.js$/.test(new URL(candidate,location.href).pathname);
    } catch(__codeCodexCaught) {
      recordCaughtRuntimeError("findCodexAppInitialModule",__codeCodexCaught);

      return false;
    }
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
