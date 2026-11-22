// constants responsibility; original state keys, defaults and lifecycle retained.
import { CODEX_DARK_APPLY_TIMEOUT_MS } from "../../core/configuration/explorer";



export {findCodexAppInitialModule,findCodexAppInitialModules,findCodexAppearanceActionModules,findCodexNumberedRuntimes,isCodexRpcNamespace} from './appearance-actions';

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
  if (codexDarkThemeApplied()) return Promise.resolve();
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
      resolve();
    };
    const check=(): void => {
      if(codexDarkThemeApplied()) finish();
    };
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
