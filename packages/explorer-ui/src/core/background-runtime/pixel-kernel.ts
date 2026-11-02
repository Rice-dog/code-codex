import {startPixelKernel} from '../../pixel-sculpt-kernel';
export const pixelMethods=['setDataset','setPaused','replayOpening'];
export function createPixelKernel(_host:HTMLElement,canvas:HTMLCanvasElement,settings:any,onError:(message:string)=>void){return startPixelKernel(canvas,onError,settings);}
