// controllers responsibility; original state keys, defaults and lifecycle retained.
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_THEME_LEASE_KEY,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID } from "../../core/configuration/explorer";
import { type DarkBackgroundPluginId } from "../../contracts/explorer-model";
import { recordCaughtRuntimeError } from "../../runtime-operations";
import type {CodexAppearanceTheme} from './appearance-actions';
export {codexAppearanceAdapterPromise,discoverCodexAppearanceAdapter,getCodexAppearanceAdapter,isCodexAppearanceTheme,readCodexAppearanceTheme,runCodexAppearanceAction,selectCodexAppearanceAdapter,writeCodexAppearanceTheme} from './appearance-actions';
export type {CodexAppearanceAction,CodexAppearanceAdapter,CodexAppearanceTheme} from './appearance-actions';



export interface ParticleThemeLease {
  readonly owner?: DarkBackgroundPluginId;
  readonly previousPreference: Exclude<CodexAppearanceTheme,"dark">;
  readonly forcedPreference: "dark";
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
        ||lease.owner==="code-codex.spectral-drape-background"
        ||lease.owner==="code-codex.ascii-tiles-background"
        ||lease.owner==="code-codex.shallow-ocean-background"
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
