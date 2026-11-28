import {backgroundConstructor} from '../../background-plugin-runtime';
import type {WorkerBackgroundRenderer as Renderer} from '../../core/background-runtime/worker-renderer';
import {ManagedBackgroundController} from './managed';
import {LIQUID_ASCII_BACKGROUND_PLUGIN_ID,LIQUID_ASCII_SETTINGS_KEY,DEFAULT_LIQUID_ASCII_SETTINGS,normalizeLiquidAsciiSettings,readLiquidAsciiSettings,type LiquidAsciiSettings} from '../../effects/liquid-ascii/model';
import {recordCaughtRuntimeError} from '../../runtime-operations';
const LiquidAsciiRenderer=backgroundConstructor<new(host:HTMLElement,canvas:HTMLCanvasElement,settings:LiquidAsciiSettings,onError:(message?:string)=>void)=>Renderer>('liquid-ascii','LiquidAsciiRenderer');
export function writeLiquidAsciiSettings(settings: LiquidAsciiSettings): void {
  try {
    localStorage.setItem(LIQUID_ASCII_SETTINGS_KEY, JSON.stringify(settings));
  } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("writeLiquidAsciiSettings", __codeCodexCaught);

    // The current session keeps working when DOM storage is unavailable.
  }
}




export class LiquidAsciiBackgroundController extends ManagedBackgroundController<LiquidAsciiSettings,Renderer>{
 constructor(){super({id:LIQUID_ASCII_BACKGROUND_PLUGIN_ID,packageId:'liquid-ascii',label:'Liquid ASCII Background',layerAttribute:'data-code-codex-liquid-ascii-layer',canvasClass:'code-codex-particle-canvas code-codex-liquid-ascii-canvas',defaults:DEFAULT_LIQUID_ASCII_SETTINGS,read:readLiquidAsciiSettings,normalize:normalizeLiquidAsciiSettings,persist:writeLiquidAsciiSettings,disposeOnRendererError:true,deferPresentationUntilReady:true,color:s=>String(s.backgroundColor),create:(...args)=>new LiquidAsciiRenderer(...args)})}
}
export const LIQUID_ASCII_BACKGROUND_CONTROLLER = Symbol.for("code-codex:liquid-ascii-background-controller:v1");



export function getLiquidAsciiBackgroundController(): LiquidAsciiBackgroundController {
  const globalState = window as unknown as Record<PropertyKey, unknown>;
  const existing = globalState[LIQUID_ASCII_BACKGROUND_CONTROLLER];
  if (existing instanceof LiquidAsciiBackgroundController) return existing;
  if (existing && typeof existing === "object" && "dispose" in existing && typeof existing.dispose === "function") {
    try { existing.dispose(); } catch (__codeCodexCaught) {
      recordCaughtRuntimeError("getLiquidAsciiBackgroundController", __codeCodexCaught);
 /* Replace a stale controller. */ }
  }
  const controller = new LiquidAsciiBackgroundController();
  globalState[LIQUID_ASCII_BACKGROUND_CONTROLLER] = controller;
  return controller;
}
