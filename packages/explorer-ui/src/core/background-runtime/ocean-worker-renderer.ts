import {WorkerBackgroundRenderer} from './worker-renderer';
import {normalize,type OceanOptions} from '../../effects/shallow-ocean/options';
import type {OceanEventHooks} from '../../../plugins/appearance/shallow-ocean/scene';
import {getLocale,subscribeLanguage} from '../../i18n';
import {openingTimeline,openingPhases} from '../../../plugins/appearance/shallow-ocean/source/opening-timeline';

export class OceanWorkerRenderer extends WorkerBackgroundRenderer {
 #visible=true;
 #snapshot:any=null;#included='';#title:HTMLElement;#animation?:Animation;#reveal?:Animation;#introduced=false;#language:()=>void;#motionCleanup:()=>void;
 constructor(source:string,private readonly target:HTMLElement,canvas:HTMLCanvasElement,settings:OceanOptions,onError:(message:string)=>void,_interactive=true,private readonly hooks?:OceanEventHooks){
  super('shallow-ocean',source,target,canvas,normalize(settings),message=>{if(message)onError(message.includes('SHALLOW_OCEAN_RENDER_FAILED')?message:'SHALLOW_OCEAN_RENDER_FAILED: '+message);},{interactive:_interactive});
  this.#title=document.createElement('div');this.#title.dataset.oceanOpeningTitle='';this.#title.setAttribute('aria-hidden','true');
  this.#title.style.cssText="position:absolute;inset:0;display:grid;align-content:center;justify-items:center;gap:17px;pointer-events:none;z-index:7;color:#e5f8ee;text-align:center;text-shadow:0 2px 24px #063d4a66;opacity:0;will-change:opacity,transform";
  const caption=document.createElement('span');caption.textContent='O C E A N  S H A L L O W S';caption.style.cssText='font-size:9px;letter-spacing:5px;text-indent:5px;opacity:.65';
  const heading=document.createElement('b');heading.style.cssText="font:400 clamp(28px,5vw,46px)/1.4 'Fraunces','Songti SC','SimSun',serif;letter-spacing:.22em;text-indent:.22em";
  const line=document.createElement('i');line.style.cssText='width:38px;height:1px;background:linear-gradient(90deg,transparent,#c9e9da99,transparent)';this.#title.append(caption,heading,line);target.append(this.#title);
  const language=()=>{heading.textContent=getLocale()==='zh-CN'?'\u6d45\u6d77\u6765\u4fe1':'Shallow Ocean Letters';};language();this.#language=subscribeLanguage(language);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const reduce=()=>{if(motion.matches){this.#animation?.cancel();this.#reveal?.cancel();}};
  motion.addEventListener('change',reduce);this.#motionCleanup=()=>motion.removeEventListener('change',reduce);
  if(settings.introEnabled&&!motion.matches){this.#reveal=target.animate([{opacity:0},{opacity:1}],{duration:openingPhases(settings.introDuration).reveal*1000,fill:'both'});this.#reveal.pause();this.#reveal.currentTime=0;}
  // The worker can prepare frames before the official UI services its message
  // queue. Start the visible sequence at host readiness, not shader warm-up.
  void this.ready.then(()=>this.resumeOpening()).catch(()=>{});
  this.syncIncluded();
 }
 private command(method:string,args:unknown[]=[]){void this.call(method,args).catch(error=>{if(error?.name!=='AbortError')console.error('BG_OCEAN_COMMAND_FAILED',method,error);});}
 private syncIncluded(){if(!this.hooks)return;const values=this.hooks.included(),key=JSON.stringify(values);if(key!==this.#included){this.#included=key;this.command('includeEvents',[values]);}}
 override setSettings(settings:OceanOptions){super.setSettings(normalize(settings));if(!settings.introEnabled){this.#animation?.cancel();this.#reveal?.cancel();}this.syncIncluded();}
 async addCreature(kind:string,u=.5,v=.5){this.#snapshot=await this.call('addCreature',[kind,u,v]);}
 previewEvent(kind:string){this.command('previewEvent',[kind]);}
 cancelEvent(){this.command('cancelEvent');}
 action(value:string){this.command('action',[value]);}
 override get diagnostics():any{return this.#snapshot?{...super.diagnostics,...this.#snapshot}:super.diagnostics;}
 protected override activityChanged(visible:boolean){this.#visible=visible;if(visible){if(this.#animation?.playState==='paused')this.#animation.play();if(this.#introduced&&this.#reveal?.playState==='paused')this.#reveal.play();}else{if(this.#animation?.playState==='running')this.#animation.pause();if(this.#reveal?.playState==='running')this.#reveal.pause();}}
 override resumeOpening(){this.#introduced=false;super.resumeOpening();}
 protected override kernelEvent(event:string,value:any){
  if(event==='ocean-snapshot'){this.#snapshot=value;this.syncIncluded();}
  if(event==='ocean-event'){this.hooks?.started(value);this.syncIncluded();}
  if(event==='ocean-opening'){
   this.#animation?.cancel();if(!value.active){this.#reveal?.cancel();return;}
   const frames=Array.from({length:241},(_,i)=>{const p=i/240,t=openingTimeline(p*value.duration,value.duration);return {offset:p,opacity:t.titleOpacity,transform:`translateY(${t.titleY}px)`};});
   this.#animation=this.#title.animate(frames,{duration:value.duration*1000,fill:'both'});this.#animation.currentTime=value.elapsed*1000;if(!this.#visible)this.#animation.pause();
   // Fade the entire presentation, including its solid base, only on first
   // reveal/covered-startup release. Manual replay must not flash the sea away.
   if(!this.#introduced){this.#introduced=true;const prior=this.#reveal;this.#reveal=this.target.animate([{opacity:0},{opacity:1}],{duration:openingPhases(value.duration).reveal*1000,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'});prior?.cancel();this.#reveal.currentTime=Math.min(value.elapsed,openingPhases(value.duration).reveal)*1000;if(!this.#visible)this.#reveal.pause();}
  }
 }
 override dispose(){this.#animation?.cancel();this.#reveal?.cancel();this.#title?.remove();this.#language?.();this.#motionCleanup?.();super.dispose();}
}
