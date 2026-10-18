// controllers responsibility; original state keys, defaults and lifecycle retained.
import { usesClippedMainLayout } from "../../adapters/codex-layout-version";
import { getBootstrapConfig } from "../../bridge";
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_THEME_LEASE_KEY,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { type DarkBackgroundPluginId } from "../../contracts/explorer-model";
import { findCodexAppInitialModule,isCodexRpcNamespace } from "./theme-probe";
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



export async function discoverCodexAppearanceAdapter(): Promise<CodexAppearanceAdapter> {
  const moduleUrl=findCodexAppInitialModule();
  if(!moduleUrl) throw new Error("Codex Appearance module is unavailable");
  const moduleExports=await import(moduleUrl) as unknown as Record<string,unknown>;
  const adapters=Object.values(moduleExports).filter((value): value is {
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
  if(adapters.length===1&&adapter) {
    return { runAction: (action) => adapter.appActions.runInPrimaryWindow({ action }) };
  }

  // Codex 26.924 moved app actions out of the combined RPC namespace. Find
  // the single exported dispatcher by its implementation, not its minified
  // export name, which changes on every official build.
  const bootstrap=getBootstrapConfig();
  if(usesClippedMainLayout(bootstrap.codexVersion??bootstrap.version)) {
    const actions=Object.values(moduleExports).filter((value): value is (action: CodexAppearanceAction) => Promise<unknown> =>
      typeof value==="function"
      &&Function.prototype.toString.call(value).includes(".appActions")
      &&Function.prototype.toString.call(value).includes("runInPrimaryWindow({action:"));
    if(actions.length===1&&actions[0]) return { runAction: actions[0] };
  }
  throw new Error("Codex Appearance controls could not be identified safely");
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
