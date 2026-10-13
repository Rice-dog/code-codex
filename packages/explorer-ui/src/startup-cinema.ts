/** One decoder: the blurred backdrop is sampled from the foreground video. */
export function attachStartupCinema(video: HTMLVideoElement, layer: HTMLElement) {
  const canvas=video.ownerDocument.createElement("canvas");
  canvas.className="startup-cinema-backdrop";canvas.setAttribute("aria-hidden","true");canvas.hidden=true;
  canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;transform:scale(1.12);pointer-events:none;";
  layer.prepend(canvas);
  video.style.zIndex="1";
  const abort=new AbortController();let enabled=false,disposed=false,frame=0,videoFrame:number|undefined;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;if(videoFrame!==undefined){video.cancelVideoFrameCallback?.(videoFrame);videoFrame=undefined;}};
  const draw=()=>{
    if(!enabled || disposed || video.readyState<2 || !video.videoWidth) return;
    const r=layer.getBoundingClientRect();const width=320,height=Math.max(1,Math.round(width*(r.height||180)/(r.width||320)));
    if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
    const scale=Math.max(width/video.videoWidth,height/video.videoHeight);
    canvas.getContext("2d")?.drawImage(video,(width-video.videoWidth*scale)/2,(height-video.videoHeight*scale)/2,video.videoWidth*scale,video.videoHeight*scale);
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
    update(fit:"cover"|"contain"|"cinema",brightness:number,opacity=1){
      enabled=fit==="cinema";canvas.hidden=!enabled;
      video.style.objectFit=enabled?"contain":fit;video.style.filter=`brightness(${brightness})`;video.style.opacity=String(opacity);
      canvas.style.filter=`blur(18px) brightness(${brightness*.5})`;canvas.style.opacity=String(opacity);
      if(enabled){draw();schedule();}else stop();
    },
    dispose(){if(disposed)return;disposed=true;stop();abort.abort();resize.disconnect();canvas.remove();}
  };
}
