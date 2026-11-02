import assert from 'node:assert/strict';
import {openingTimeline,openingPhases} from '../packages/explorer-ui/plugins/appearance/shallow-ocean/source/opening-timeline.js';
import {install} from '../packages/explorer-ui/plugins/appearance/shallow-ocean/source/opening-animation.js';
const checks=[];
for(const duration of [1.5,5.2,12]){
 const phases=openingPhases(duration);
 assert.ok(phases.reveal>0&&phases.reveal<=1);
 let prior=0;
 for(let i=0;i<=1000;i++){
  const t=duration*i/1000,state=openingTimeline(t,duration);
  assert.ok(state.opacity>=prior&&state.opacity<=1);prior=state.opacity;
  if(t<=phases.reveal)assert.equal(state.titleOpacity,0);
  if(t<=phases.prelude)assert.equal(state.cameraProgress,0);
 }
 assert.equal(openingTimeline(phases.reveal,duration).opacity,1);
 assert.equal(openingTimeline(phases.prelude,duration).titleOpacity,1);
 assert.equal(openingTimeline(duration,duration).cameraProgress,1);
 checks.push(`Reveal, title, camera ordering and continuity at ${duration}s`);
}
const motion=new EventTarget();motion.matches=false;
const camera={zoom:1,position:{x:3,y:4},left:-10,right:10,top:10,bottom:-10,updateProjectionMatrix(){},updateMatrixWorld(){}};
const body={style:{setProperty(){}},classList:{toggle(){},remove(){}}},title={style:{}};
const root={};install(root,{body},{},()=>motion);
const intro=root.OceanOpening.create({camera,title,body});intro.replay();
const initial=intro.snapshot();intro.advance(.7);
assert.equal(title.style.opacity,'0');assert.equal(camera.zoom,initial.zoom);
intro.advance(.6);assert.ok(Number(title.style.opacity)>.9);assert.equal(camera.zoom,initial.zoom);
intro.advance(1);assert.ok(camera.zoom<initial.zoom&&camera.zoom>1);
intro.advance(8);assert.equal(intro.active,false);assert.deepEqual(camera.position,{x:3,y:4});assert.equal(camera.zoom,1);
checks.push('Actual opening keeps camera still through reveal/title, then restores home');
intro.replay();intro.advance(.9);intro.replay();assert.equal(intro.snapshot().elapsed,0);
intro.configure({enabled:0});assert.equal(intro.active,false);assert.equal(camera.zoom,1);
intro.replay({enabled:1});motion.matches=true;motion.dispatchEvent(new Event('change'));assert.equal(intro.active,false);assert.equal(camera.zoom,1);
intro.replay();assert.equal(intro.active,false);intro.dispose();
checks.push('Replay, disabled opening, reduced motion and disposal restore framing');
console.log(JSON.stringify({passed:true,checks},null,2));
