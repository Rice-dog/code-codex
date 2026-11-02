import {ParticleImageRenderer,type ParticleBackgroundSettings,type PreparedParticleImage,type ParticleImageTransform} from '../../particle-image-startup';
import {kernelEvent} from './kernel-events';
export const particleMethods=['setPreparedImage','setImageTransform','setPaused','resize'];
export function createParticleKernel(_host:HTMLElement,canvas:HTMLCanvasElement,settings:ParticleBackgroundSettings,onError:(message:string)=>void){
 const renderer=new ParticleImageRenderer(canvas,onError,settings,
  (progress,complete)=>kernelEvent('particle-transition',{progress,complete}),
  progress=>kernelEvent('particle-opening',{progress}));
 return {
  setSettings(next:ParticleBackgroundSettings){renderer.setRenderSettings(next);},
  setPreparedImage(image:PreparedParticleImage,transform:ParticleImageTransform){return renderer.setPreparedImage(image,transform);},
  setImageTransform(transform:ParticleImageTransform){renderer.setImageTransform(transform);},
  setPaused(value:boolean){renderer.setPaused(value);},resize(){renderer.resize();},
  replay(){renderer.replayOpening();},dispose(){renderer.dispose();},
 };
}
