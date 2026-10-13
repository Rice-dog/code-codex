import {canPlaceClip, clipDuration, type StartupClip, type StartupVideoProject} from './startup-video-project';

/** Screen-distance snapping; all accepted positions remain project/source seconds. */
export function snapStartupClip(clip: StartupClip, project: StartupVideoProject, track: number, options: {
  mode: 'move' | 'in' | 'out'; threshold: number; playhead: number; sourceDuration: number;
}): {clip: StartupClip; time: number | null} {
  const points = [...new Set([0, options.playhead, ...project.tracks.flat().filter(c=>c.id!==clip.id).flatMap(c=>[c.start,c.start+clipDuration(c)])])];
  const edges=options.mode==='move'?[clip.start,clip.start+clipDuration(clip)]:[options.mode==='in'?clip.start:clip.start+clipDuration(clip)];
  const candidates=edges.flatMap((edge,index)=>points.map(time=>({time,delta:time-edge,end:options.mode==='move'&&index===1})))
    .filter(c=>Math.abs(c.delta)<=options.threshold).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));
  for(const {time,delta,end} of candidates){
    const next={...clip};
    if(options.mode==='out')next.out=next.in+(time-next.start)*next.rate;
    else {next.start=options.mode==='move'&&end?time-clipDuration(next):time;if(options.mode==='in')next.in+=(delta*next.rate);}
    if(next.in<0||next.out>options.sourceDuration+.001||!canPlaceClip(project.tracks[track]!,next))continue;
    return {clip:next,time};
  }
  return {clip,time:null};
}
