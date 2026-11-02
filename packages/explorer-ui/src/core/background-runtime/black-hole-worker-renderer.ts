import {WorkerBackgroundRenderer} from './worker-renderer';
export class BlackHoleWorkerRenderer extends WorkerBackgroundRenderer{
 constructor(source:string,host:HTMLElement,canvas:HTMLCanvasElement,settings:unknown,onError:(message?:string)=>void){
  super('black-hole',source,host,canvas,settings,onError);
  canvas.style.opacity='0';
  void this.ready.then(()=>{super.replay();canvas.style.opacity='1';}).catch(()=>{});
 }
}
