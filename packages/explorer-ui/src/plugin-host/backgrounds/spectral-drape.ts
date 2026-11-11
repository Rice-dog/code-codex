import {backgroundConstructor} from '../../background-plugin-runtime';
import type {SpectralDrapeRenderer as Renderer} from '../../effects/spectral-drape/renderer';
import {ManagedBackgroundController} from './managed';
import {SPECTRAL_DRAPE_BACKGROUND_PLUGIN_ID,SPECTRAL_DRAPE_SETTINGS_KEY,DEFAULT_SPECTRAL_DRAPE_SETTINGS,normalizeSpectralDrapeSettings,readSpectralDrapeSettings,type SpectralDrapeSettings} from '../../effects/spectral-drape/model';
import {recordCaughtRuntimeError} from '../../runtime-operations';
const SpectralDrapeRenderer=backgroundConstructor<typeof import('../../effects/spectral-drape/renderer').SpectralDrapeRenderer>('spectral-drape','SpectralDrapeRenderer');
export function writeSpectralDrapeSettings(settings: SpectralDrapeSettings): void {
  try {
    localStorage.setItem(SPECTRAL_DRAPE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("writeSpectralDrapeSettings", __codeCodexCaught);

    // The current session keeps working when DOM storage is unavailable.
  }
}




export class SpectralDrapeBackgroundController extends ManagedBackgroundController<SpectralDrapeSettings,Renderer>{
 constructor(){super({id:SPECTRAL_DRAPE_BACKGROUND_PLUGIN_ID,packageId:'spectral-drape',label:'Spectral Drape Background',layerAttribute:'data-code-codex-spectral-drape-layer',canvasClass:'code-codex-particle-canvas code-codex-spectral-drape-canvas',defaults:DEFAULT_SPECTRAL_DRAPE_SETTINGS,read:readSpectralDrapeSettings,normalize:normalizeSpectralDrapeSettings,persist:writeSpectralDrapeSettings,disposeOnRendererError:true,deferPresentationUntilReady:true,color:s=>String(s.backgroundColor),create:(...args)=>new SpectralDrapeRenderer(...args)})}
}
export const SPECTRAL_DRAPE_BACKGROUND_CONTROLLER = Symbol.for("code-codex:spectral-drape-background-controller:v1");



export function getSpectralDrapeBackgroundController(): SpectralDrapeBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[SPECTRAL_DRAPE_BACKGROUND_CONTROLLER];
  if (existing instanceof SpectralDrapeBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getSpectralDrapeBackgroundController", __codeCodexCaught);
 /* Replace a stale controller. */ }
  }
  const controller = new SpectralDrapeBackgroundController();
  globalState[SPECTRAL_DRAPE_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
