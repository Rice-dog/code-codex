/** Background-only budgets. Scene contents, user settings and event clocks are not presets. */
export const PERFORMANCE_PROFILES = Object.freeze([
  Object.freeze({name:'low',fps:60,maxDpr:.85,maxPixels:1280*720,shadows:16,particles:.35,migration:360}),
  Object.freeze({name:'medium',fps:60,maxDpr:1.1,maxPixels:1920*1080,shadows:32,particles:.65,migration:720}),
  Object.freeze({name:'high',fps:60,maxDpr:1.6,maxPixels:2560*1440,shadows:64,particles:1,migration:1440})
]);
export function createPerformancePolicy(initial=0){
  let mode=0,level=1,nextFrame=0,elapsed=0,samples=0,slow=0,fast=0,cooldown=0,observedFps=0;
  const profile=()=>PERFORMANCE_PROFILES[level];
  function resetSampling(){elapsed=0;samples=0;slow=0;fast=0;}
  function setMode(value){mode=Number.isFinite(value)?Math.max(0,Math.min(3,Math.round(value))):0;level=mode===0?1:mode-1;nextFrame=0;cooldown=20;resetSampling();}
  setMode(initial);
  return {
    get profile(){return profile();},
    setMode,
    resetClock(){nextFrame=0;resetSampling();},
    shouldRender(now){
      const interval=1000/profile().fps;
      if(nextFrame&&now+.75<nextFrame)return false;
      nextFrame=nextFrame&&now-nextFrame<interval*3?nextFrame+interval:now+interval;
      return true;
    },
    pixelRatio(dpr,width,height){return Math.min(Math.max(.1,dpr||1),profile().maxDpr,Math.sqrt(profile().maxPixels/Math.max(1,width*height)));},
    observe(seconds){
      if(!Number.isFinite(seconds)||seconds<=0||seconds>.25)return false;
      elapsed+=seconds;samples++;cooldown=Math.max(0,cooldown-seconds);
      if(elapsed<4)return false;
      const mean=elapsed/samples;observedFps=1/mean;elapsed=0;samples=0;
      if(mode!==0)return false;
      const budget=1/profile().fps;
      slow=mean>budget*1.35?slow+1:0;fast=mean<budget*1.08?fast+1:0;
      const next=slow>=2?Math.max(0,level-1):fast>=3&&cooldown===0?Math.min(2,level+1):level;
      if(next===level)return false;
      level=next;cooldown=30;nextFrame=0;resetSampling();return true;
    },
    snapshot(){return {mode,profile:profile().name,targetFps:profile().fps,observedFps:Math.round(observedFps*10)/10,maxPixels:profile().maxPixels,shadowBudget:profile().shadows,particleScale:profile().particles,migrationBudget:profile().migration};}
  };
}
