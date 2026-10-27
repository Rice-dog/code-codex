// controllers responsibility; original state keys, defaults and lifecycle retained.
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_THEME_LEASE_KEY,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { type DarkBackgroundPluginId } from "../../contracts/explorer-model";
import { findCodexAppInitialModule,findCodexAppearanceActionModules,isCodexRpcNamespace } from "./theme-probe";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import {
  isObjectRecord
} from "../../startup-background-renderers";



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



export interface ParticleThemeLease {
  readonly owner?: DarkBackgroundPluginId;
  readonly previousPreference: Exclude<CodexAppearanceTheme,"dark">;
  readonly forcedPreference: "dark";
}



export function isCodexAppearanceTheme(value: unknown): value is CodexAppearanceTheme {
  return value==="system"||value==="light"||value==="dark";
}



export function selectCodexAppearanceAdapter(moduleExports: Record<string,unknown>): CodexAppearanceAdapter|undefined {
  const values=[...new Set(Object.values(moduleExports))];
  const adapters=values.filter((value): value is {
    appActions: { runInPrimaryWindow: (request: { action: CodexAppearanceAction }) => Promise<unknown> };
    clientCoordination: { invalidateQueryCache: (request: { queryKey: readonly string[] }) => Promise<unknown> };
  } => {
    if(!isObjectRecord(value)||!isCodexRpcNamespace(value.appActions)||!isCodexRpcNamespace(value.clientCoordination)) {
      return false;
    }
    return typeof value.appActions.runInPrimaryWindow==="function"
      &&typeof value.clientCoordination.invalidateQueryCache==="function";
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

export async function discoverCodexAppearanceAdapter(): Promise<CodexAppearanceAdapter> {
  const initial=findCodexAppInitialModule();
  if(initial) {
    const adapter=selectCodexAppearanceAdapter(await import(initial) as Record<string,unknown>);
    if(adapter) return adapter;
  }
  const modules=findCodexAppearanceActionModules();
  if(modules.length>1) throw new Error("CC-APPEARANCE-ADAPTER-002: Multiple official app-action modules matched; no setting was changed.");
  if(modules[0]) {
    const adapter=selectCodexAppearanceAdapter(await import(modules[0]) as Record<string,unknown>);
    if(adapter) return adapter;
  }
  throw new Error("CC-APPEARANCE-ADAPTER-001: No supported official Appearance interface was found in the loaded modules. Background activation was cancelled without changing the theme.");
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



export async function runCodexAppearanceAction(action: CodexAppearanceAction): Promise<Record<string,unknown>> {
  const adapter=await getCodexAppearanceAdapter();
  const result=await adapter.runAction(action);
  if(!isObjectRecord(result)) throw new Error("Codex returned an invalid Appearance response");
  return result;
}



export async function readCodexAppearanceTheme(): Promise<CodexAppearanceTheme> {
  const result=await runCodexAppearanceAction({ type: "app.appearance.get" });
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



export function readParticleThemeLease(): ParticleThemeLease|undefined {
  try {
    const value: unknown=JSON.parse(localStorage.getItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY)||"null");
    if(!value||typeof value!=="object") return undefined;
    const lease=value as Partial<ParticleThemeLease>;
    if((lease.previousPreference==="system"||lease.previousPreference==="light")&&lease.forcedPreference==="dark") {
      const owner=lease.owner===PARTICLE_BACKGROUND_PLUGIN_ID
        ||lease.owner===BLACK_HOLE_BACKGROUND_PLUGIN_ID
        ||lease.owner===GLOW_HORIZON_BACKGROUND_PLUGIN_ID
        ||lease.owner===HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID
        ||lease.owner===AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID
        ||lease.owner===MILKY_WAY_BACKGROUND_PLUGIN_ID
        ||lease.owner==="code-codex.ascii-tiles-background"
        ||lease.owner===BLINKING_SQUARES_BACKGROUND_PLUGIN_ID
        ||lease.owner===MOUNTAIN_BACKGROUND_PLUGIN_ID
        ||lease.owner===PIXEL_SCULPT_BACKGROUND_PLUGIN_ID
        ||lease.owner===CLOUD_TRAIN_BACKGROUND_PLUGIN_ID
        ? lease.owner
        :undefined;
      return owner
        ? { owner,previousPreference: lease.previousPreference,forcedPreference: "dark" }
        :{ previousPreference: lease.previousPreference,forcedPreference: "dark" };
    }
  } catch(__codeCodexCaught) {
    recordCaughtRuntimeError("readParticleThemeLease",__codeCodexCaught);

    // Invalid or inaccessible storage is handled as an absent lease.
  }
  return undefined;
}



export function writeParticleThemeLease(lease: ParticleThemeLease): void {
  try {
    localStorage.setItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY,JSON.stringify(lease));
  } catch(__codeCodexCaught) {
    recordCaughtRuntimeError("writeParticleThemeLease",__codeCodexCaught);

    throw new Error("Code-Codex could not remember the current Appearance setting");
  }
}



export function transferParticleThemeLease(from: DarkBackgroundPluginId,to: DarkBackgroundPluginId): void {
  const lease=readParticleThemeLease();
  if(!lease) return;
  if(lease.owner===to) return;
  if(lease.owner&&lease.owner!==from) {
    throw new Error("Another Code-Codex background owns the Dark appearance lease");
  }
  writeParticleThemeLease({
    owner: to,
    previousPreference: lease.previousPreference,
    forcedPreference: "dark",
  });
}



export function clearParticleThemeLease(owner?: DarkBackgroundPluginId): void {
  try {
    const lease=readParticleThemeLease();
    if(owner&&lease?.owner&&lease.owner!==owner) return;
    localStorage.removeItem(PARTICLE_BACKGROUND_THEME_LEASE_KEY);
  } catch(__codeCodexCaught) {
    recordCaughtRuntimeError("clearParticleThemeLease",__codeCodexCaught);

    // The setting bridge still owns the authoritative theme preference.
  }
}
