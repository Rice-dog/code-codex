import {WorkerBackgroundRenderer} from './worker-renderer';
/** The gallery remains in the host; only prepared numeric geometry crosses. */
export class PixelWorkerRenderer extends WorkerBackgroundRenderer {
 #introduced=false;
 constructor(source:string,private readonly canvas:HTMLCanvasElement,onError:(message?:string)=>void,settings:unknown,private readonly emit:(event:string,value:unknown)=>void){super('pixel-sculpt',source,canvas.parentElement??canvas,canvas,settings,onError);canvas.style.opacity='0';}
 setDataset(dataset:unknown,immediate=false){void this.call('setDataset',[dataset,immediate]).then(()=>{if(!this.#introduced){this.#introduced=true;this.replay();}}).catch(error=>{if(error?.name!=='AbortError')console.error('BG_PIXEL_ASSET_FAILED',error);});}
 override replay(){this.canvas.style.opacity='0';void this.call('replayOpening').then(()=>{this.canvas.style.opacity='1';}).catch(error=>{if(error?.name!=='AbortError')console.error('BG_PIXEL_OPENING_FAILED',error);});}
 setPaused(paused:boolean){void this.call('setPaused',[paused]).catch(error=>{if(error?.name!=='AbortError')console.error('BG_PIXEL_PAUSE_FAILED',error);});}
 protected override kernelEvent(event:string,value:unknown){this.emit(event,value);}
}
