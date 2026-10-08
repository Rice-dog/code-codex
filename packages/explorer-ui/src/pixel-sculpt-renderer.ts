import { PIXEL_SCULPT_CONTROLS_HTML, startPixelSculptRuntime } from "./pixel-sculpt-runtime";

import { PIXEL_SCULPT_DEFAULTS, type PixelSculptSettings } from './pixel-sculpt-settings';
export { PIXEL_SCULPT_DEFAULTS, normalizePixelSculptSettings, readPixelSculptBackgroundSettings, writePixelSculptBackgroundSettings } from './pixel-sculpt-settings';
export type { PixelSculptSettings } from './pixel-sculpt-settings';
export class PixelSculptRenderer {
 readonly ready: Promise<void>;
 readonly firstFrame: Promise<void>;
 #controls: HTMLElement;
 #runtime: ReturnType<typeof startPixelSculptRuntime>;
 #active = false;
 constructor(layer:HTMLElement,canvas:HTMLCanvasElement,settings:PixelSculptSettings,onError:(message:string|undefined)=>void,persist=true){
   this.#controls=document.createElement('div');this.#controls.className='pixel-sculpt-controls';this.#controls.innerHTML=PIXEL_SCULPT_CONTROLS_HTML;
   this.#runtime=startPixelSculptRuntime(canvas,this.#controls,onError,{persist});this.ready=this.#runtime.ready.then(()=>undefined);this.firstFrame=this.#runtime.firstFrame.then(()=>undefined);
   this.#runtime.setPaused(true);layer.style.backgroundColor='#07070a';
 }
 mountControls(container:HTMLElement,language:'zh'|'en'):void {if(this.#controls.parentElement!==container){container.replaceChildren(this.#controls);}this.#runtime.language(language);}
 setActive(active:boolean,settings:PixelSculptSettings):void {this.#active=active;this.#runtime.setPaused(!active||settings.paused);}
 setSettings(settings:PixelSculptSettings):void {this.#runtime.setPaused(!this.#active||settings.paused);}
 resumeOpening():void {this.#runtime.resumeOpening();}
 replay():void {this.#runtime.replay();}
 reset():void {this.#runtime.reset();}
 dispose():void {this.#runtime.dispose();}
}


/** An independent, read-only image-library renderer for startup and its preview. */
export function mountPixelSculptStartupBackground(target: HTMLElement, canvas: HTMLCanvasElement, onError: (message?: string) => void): {ready: Promise<void>;dispose(): void} {
  const renderer = new PixelSculptRenderer(target, canvas, {paused:false}, message => onError(message), false);
  let disposed = false;
  renderer.setActive(true, {paused:false});
  const ready = renderer.ready.then(async () => {
    let timer: number | undefined;
    try {
      await Promise.race([renderer.firstFrame, new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('Pixel Sculpt startup first frame timed out')), 10000);
      })]);
    } finally { if (timer !== undefined) window.clearTimeout(timer); }
    if (disposed) throw new Error('Pixel Sculpt startup preparation was canceled');
  });
  // Callers await this promise; attaching a handler also protects immediate disposal.
  void ready.catch(() => {});
  return {ready,dispose(){if(disposed)return;disposed=true;renderer.dispose();canvas.remove();}};
}
