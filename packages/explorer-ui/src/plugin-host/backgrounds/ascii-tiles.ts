import {backgroundConstructor} from '../../background-plugin-runtime';
import type {AsciiTilesRenderer as Renderer} from '../../effects/ascii-tiles/renderer';
import {ManagedBackgroundController} from './managed';
import {ASCII_TILES_BACKGROUND_PLUGIN_ID,ASCII_TILES_SETTINGS_KEY,DEFAULT_ASCII_TILES_SETTINGS,normalizeAsciiTilesSettings,readAsciiTilesSettings,type AsciiTilesSettings} from '../../effects/ascii-tiles/model';
import {recordCaughtRuntimeError} from '../../runtime-operations';
const AsciiTilesRenderer=backgroundConstructor<typeof import('../../effects/ascii-tiles/renderer').AsciiTilesRenderer>('ascii-tiles','AsciiTilesRenderer');
export function writeAsciiTilesSettings(settings: AsciiTilesSettings): void {
  try {
    localStorage.setItem(ASCII_TILES_SETTINGS_KEY, JSON.stringify(settings));
  } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("writeAsciiTilesSettings", __codeCodexCaught);

    // The current session keeps working when DOM storage is unavailable.
  }
}




export class AsciiTilesBackgroundController extends ManagedBackgroundController<AsciiTilesSettings,Renderer>{
 constructor(){super({id:ASCII_TILES_BACKGROUND_PLUGIN_ID,packageId:'ascii-tiles',label:'ASCII Tiles Background',layerAttribute:'data-code-codex-ascii-tiles-layer',canvasClass:'code-codex-particle-canvas code-codex-ascii-tiles-canvas',defaults:DEFAULT_ASCII_TILES_SETTINGS,read:readAsciiTilesSettings,normalize:normalizeAsciiTilesSettings,persist:writeAsciiTilesSettings,color:s=>String(s.backgroundColor),create:(...args)=>new AsciiTilesRenderer(...args)})}
}
export const ASCII_TILES_BACKGROUND_CONTROLLER = Symbol.for("code-codex:ascii-tiles-background-controller:v1");



export function getAsciiTilesBackgroundController(): AsciiTilesBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[ASCII_TILES_BACKGROUND_CONTROLLER];
  if (existing instanceof AsciiTilesBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getAsciiTilesBackgroundController", __codeCodexCaught);
 /* Replace a stale controller. */ }
  }
  const controller = new AsciiTilesBackgroundController();
  globalState[ASCII_TILES_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
