import { createStartupCinemaRenderer } from './startup-cinema-renderer';
import { runtimeEvent } from './runtime-events';
/** One decoder, shared edge-clamped renderer; no extra background dimming. */
export function attachStartupCinema(video: HTMLVideoElement, layer: HTMLElement) {
  const canvas=video.ownerDocument.createElement("canvas");
  canvas.className="startup-cinema-backdrop";canvas.setAttribute("aria-hidden","true");canvas.hidden=true;
  canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  let renderer:ReturnType<typeof createStartupCinemaRenderer>|undefined;
  let brightness=1;
  layer.prepend(canvas);
  video.style.zIndex="1";
  const abort=new AbortController();let enabled=false,disposed=false,frame=0,videoFrame:number|undefined;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;if(videoFrame!==undefined){video.cancelVideoFrameCallback?.(videoFrame);videoFrame=undefined;}};
  const draw=()=>{
    if(!enabled || disposed || video.readyState<2 || !video.videoWidth) return;
    const r=layer.getBoundingClientRect();const width=640,height=Math.max(2,Math.round(width*(r.height||180)/(r.width||640)));
    try{
      renderer??=createStartupCinemaRenderer(canvas);
      renderer.paint(width,height,video,brightness);
    }catch(error){enabled=false;canvas.hidden=true;stop();const reason=String(error);runtimeEvent('startup-animation','cinema renderer','failed',{reason,fallback:'single contained video'});layer.dispatchEvent(new CustomEvent('startup-cinema-error',{bubbles:true,composed:true,detail:reason}));}
  };
  const schedule=()=>{
    if(disposed || !enabled || video.paused || video.ended || frame || videoFrame!==undefined)return;
    if(typeof video.requestVideoFrameCallback==="function")videoFrame=video.requestVideoFrameCallback(()=>{videoFrame=undefined;draw();schedule();});
    else frame=requestAnimationFrame(()=>{frame=0;draw();schedule();});
  };
  for(const event of ["loadeddata","seeked","timeupdate","play","resize"]){video.addEventListener(event,()=>{draw();schedule();},{signal:abort.signal});}
  for(const event of ["pause","ended","emptied"]){video.addEventListener(event,()=>{stop();draw();},{signal:abort.signal});}
  const resize=new ResizeObserver(draw);resize.observe(layer);
  return {
    canvas,
    setOpacity(opacity:number){video.style.opacity=String(opacity);canvas.style.opacity=String(opacity);},
    update(fit:"cover"|"contain"|"cinema",level:number,opacity=1){
      brightness=level;
      enabled=fit==="cinema";canvas.hidden=!enabled;
      video.style.objectFit=enabled?"contain":fit;video.style.filter=brightness===1?'none':`brightness(${brightness})`;video.style.opacity=String(opacity);
      canvas.style.filter='none';canvas.style.opacity=String(opacity);
      if(enabled){draw();schedule();}else stop();
    },
    dispose(){if(disposed)return;disposed=true;stop();abort.abort();resize.disconnect();renderer?.dispose();canvas.remove();}
  };
}
