import { runtimeEvent } from './runtime-events';

/** Bounded diagnostics; frame callbacks measure scheduling, native counters measure drops. */
export function observeStartupVideoPlayback(video:HTMLVideoElement,preview:boolean) {
  const abort=new AbortController(),started=performance.now();
  let disposed=false,callback:number|undefined,lastFrame=0,maxCallbackGapMs=0,callbacks=0;
  let waitingSince:number|undefined,waitingMs=0,waitingCount=0,seeks=0,loops=0,lastTime=0;
  const snapshot=()=>{
    const q=video.getVideoPlaybackQuality?.();
    return {preview,elapsedMs:Math.round(performance.now()-started),currentTime:video.currentTime,
      width:video.videoWidth,height:video.videoHeight,readyState:video.readyState,networkState:video.networkState,
      paused:video.paused,seeking:video.seeking,visible:document.visibilityState==='visible',
      totalVideoFrames:q?.totalVideoFrames??null,droppedVideoFrames:q?.droppedVideoFrames??null,
      corruptedVideoFrames:q?.corruptedVideoFrames??null,frameCallbacks:callbacks,maxCallbackGapMs:Math.round(maxCallbackGapMs),
      waitingCount,waitingMs:Math.round(waitingMs+(waitingSince===undefined?0:performance.now()-waitingSince)),seeks,loops,
      callbackGapMeaning:'main-thread callback scheduling; not a decoder dropped-frame count'};
  };
  const frame=(now:number,metadata:VideoFrameCallbackMetadata)=>{
    if(disposed)return;callbacks++;
    if(lastFrame&&document.visibilityState==='visible')maxCallbackGapMs=Math.max(maxCallbackGapMs,now-lastFrame);
    if(metadata.mediaTime<lastTime-.1)loops++;
    lastFrame=now;lastTime=metadata.mediaTime;callback=video.requestVideoFrameCallback(frame);
  };
  if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(frame);
  for(const event of ['loadedmetadata','playing','waiting','stalled','seeking','seeked','error']){
    video.addEventListener(event,()=>{
      if(event==='waiting'){waitingSince??=performance.now();waitingCount++;}
      if(event==='playing'&&waitingSince!==undefined){waitingMs+=performance.now()-waitingSince;waitingSince=undefined;lastFrame=0;}
      if(event==='seeking'){seeks++;lastFrame=0;}
      runtimeEvent('startup-animation','video playback',event==='error'?'failed':'observed',{event,...snapshot(),mediaErrorCode:video.error?.code??null});
    },{signal:abort.signal});
  }
  const timer=setInterval(()=>runtimeEvent('startup-animation','video playback quality','observed',snapshot()),2000);
  return ()=>{if(disposed)return;disposed=true;clearInterval(timer);abort.abort();if(callback!==undefined)video.cancelVideoFrameCallback?.(callback);runtimeEvent('startup-animation','video playback summary','observed',snapshot());};
}
