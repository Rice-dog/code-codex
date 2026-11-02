import {WorkerBackgroundRenderer} from './worker-renderer';
import type {ParticleBackgroundSettings,PreparedParticleImage,ParticleImageTransform} from '../../particle-image-startup';
export class ParticleWorkerRenderer extends WorkerBackgroundRenderer {
 #count=0;#opening=1;#settings:ParticleBackgroundSettings;
 constructor(source:string,canvas:HTMLCanvasElement,onError:(message:string)=>void,settings:ParticleBackgroundSettings,
  private readonly transition:(progress:number,complete:boolean)=>void,private readonly opening:(progress:number)=>void=()=>{}){
  super('particle-image',source,canvas.parentElement??canvas,canvas,settings,message=>{if(message)onError(message);});this.#settings=settings;this.#opening=settings.introEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches?0:1;
 }
 get count(){return this.#count;}
 get openingProgress(){return this.#opening;}
 get openingRemainingSeconds(){return Math.max(0,(1-this.#opening)*this.#settings.introDuration);}
 setRenderSettings(settings:ParticleBackgroundSettings){const prior=this.#settings;this.#settings=settings;if(!settings.introEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches)this.#opening=1;else if(!prior.introEnabled)this.#opening=0;this.setSettings(settings);}
 setPreparedImage(image:PreparedParticleImage,transform:ParticleImageTransform):Promise<boolean>{
  this.#count=image.targetCount;
  // Prepared cache ownership stays in the host. Do not send the source Blob,
  // IDB records, URLs or metadata names into the visual lane.
  return this.call<boolean>('setPreparedImage',[{width:image.width,height:image.height,targetCount:image.targetCount,normalizedHomes:image.normalizedHomes,colors:image.colors,seeds:image.seeds},transform]);
 }
 renderPreparedFrame(){return this.count>0;}
 replayOpening(){this.#opening=this.#settings.introEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches?0:1;this.replay();}
 setImageTransform(transform:ParticleImageTransform){void this.call('setImageTransform',[transform]).catch(e=>this.report(e));}
 setPaused(paused:boolean){void this.call('setPaused',[paused]).catch(e=>this.report(e));}
 readonly resize=()=>{void this.call('resize').catch(e=>this.report(e));};
 protected override kernelEvent(event:string,value:any){
  if(event==='particle-transition')this.transition(value.progress,value.complete);
  if(event==='particle-opening'){this.#opening=this.#settings.introEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches?value.progress:1;this.opening(this.#opening);}
 }
 private report(error:unknown){if(!(error instanceof DOMException&&error.name==='AbortError'))console.error('BG_PARTICLE_COMMAND_FAILED',error);}
}
