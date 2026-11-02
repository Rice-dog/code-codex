import {startBlinkingSquaresKernel} from './blinking-squares';
import type {BlinkingSquaresSettings} from './blinking-squares-settings';
/** The same shader/interaction kernel used by the React host, without React DOM. */
export class BlinkingSquaresKernel {
 #config:{current:BlinkingSquaresSettings};
 #replay:(()=>void)|undefined;
 #dispose:(()=>void)|undefined;
 constructor(_host:HTMLElement,canvas:HTMLCanvasElement,settings:BlinkingSquaresSettings,onError:(message?:string)=>void){
  this.#config={current:settings};
  this.#dispose=startBlinkingSquaresKernel(canvas,this.#config,()=>{},onError,replay=>{this.#replay=replay;});
 }
 setSettings(settings:BlinkingSquaresSettings){this.#config.current=settings;}
 replay(){this.#replay?.();}
 dispose(){this.#dispose?.();this.#dispose=undefined;}
}
