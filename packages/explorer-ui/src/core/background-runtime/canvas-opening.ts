/** Optional compositor presentation; drawing stays in the render worker. */
export class CanvasOpening {
 #track:Animation;#started=false;#dead=false;#visible=true;
 readonly #motion=matchMedia('(prefers-reduced-motion: reduce)');
 constructor(private readonly canvas:HTMLCanvasElement,private readonly kind:'gravity'|'relief'){
  this.#track=canvas.animate([{opacity:0},{opacity:1}],{duration:1,fill:'both'});this.#track.pause();this.#track.currentTime=0;
  this.#motion.addEventListener('change',this.#reduce);
 }
 #reduce=()=>{if(this.#motion.matches&&this.#started)this.#track.finish();};
 start(){
  if(this.#dead)return;this.#started=true;
  // Install the new effect before cancelling the gate: never expose a full
  // canvas in between two tracks, even when first-ready and visibility race.
  const old=this.#track;
  this.#track=this.canvas.animate(this.kind==='gravity'
   ?[{opacity:0,transform:'scale(1.12)',clipPath:'circle(0% at 50% 50%)'},{opacity:1,transform:'scale(1)',clipPath:'circle(75% at 50% 50%)'}]
   :[{opacity:0,transform:'translateY(14px)',clipPath:'inset(100% 0 0 0)'},{opacity:1,transform:'translateY(0)',clipPath:'inset(0% 0 0 0)'}],
   {duration:this.kind==='gravity'?1600:1100,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
  old.cancel();if(this.#motion.matches)this.#track.finish();else if(!this.#visible)this.#track.pause();
 }
 visible(value:boolean){this.#visible=value;if(!this.#started)return;if(value){if(this.#track.playState==='paused')this.#track.play();}else if(this.#track.playState==='running')this.#track.pause();}
 dispose(){if(this.#dead)return;this.#dead=true;this.#track.cancel();this.#motion.removeEventListener('change',this.#reduce);}
}
