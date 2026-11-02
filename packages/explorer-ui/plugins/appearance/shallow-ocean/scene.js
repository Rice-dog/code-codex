import * as Three from 'three-ocean-r128';
import {installScene} from './install-scene.js';
import {runScene} from './source/main.js';
import {SCENE_HTML,SCENE_CSS} from './source/page';
import {requestBackgroundFrame,cancelBackgroundFrame} from '../../../src/background-startup-hold';

/** Owns one native scene. Standalone globals/CSS/storage never escape this scope. */
export function createScene(target,canvas,settings,onError,onSettings,eventHooks){
 const scope=new SceneScope(target,canvas,settings,onError,onSettings);scope.eventHooks=eventHooks;
 try{installScene(scope);scope.api=runScene(scope);if(!scope.api)throw Error('Scene initialization did not return its API');scope.start();}
 catch(error){scope.fail(error);}
 return scope;
}
class SceneScope{
 disposed=false;active=true;api;onSize;frames=new Map();timers=new Set();resources=new Set();events=new Map();sequence=0;first=false;shown=true;paused=false;
 constructor(target,canvas,settings,onError,onSettings){
  this.offscreen=typeof OffscreenCanvas==='function'&&canvas instanceof OffscreenCanvas;
  this.target=target;this.canvas=canvas;this.onError=onError;this.onSettings=onSettings;this.abort=new AbortController();
  this.ready=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject});
  this.shell=globalThis.document.createElement('div');this.shell.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden';target.append(this.shell);
  const shadow=this.shell.attachShadow({mode:'open'}),style=globalThis.document.createElement('style');
  style.textContent=SCENE_CSS.replace(/\bbody\b/g,'.scene-body')+'\n:host{display:block;width:100%;height:100%}.scene-body{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#174f69}.scene-body>.ui,.scene-body>#notice,.scene-body>#loading,.scene-body>#restore,.scene-body>#vortex-label{display:none!important}#sea{position:absolute;inset:0;display:block;width:100%;height:100%}';
  this.body=globalThis.document.createElement('div');this.body.className='scene-body';this.body.innerHTML=SCENE_HTML;shadow.append(style,this.body);
  this.body.querySelector('#sea').replaceWith(canvas);canvas.id='sea';canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
  this.matchMedia=globalThis.matchMedia.bind(globalThis);this.motion=this.matchMedia('(prefers-reduced-motion: reduce)');
  const self=this;
  this.document={body:this.body,createElement:globalThis.document.createElement.bind(globalThis.document),querySelector:s=>shadow.querySelector(s),querySelectorAll:s=>shadow.querySelectorAll(s),get hidden(){return !self.active},addEventListener:(type,fn)=>this.listen(type,fn)};
  const types={};
  for(const [name,value]of Object.entries(Three)){
   // r128 Scene.dispose is a removed API that only logs an error. Track actual
   // GPU owners, and forget resources the source has already released on rebuild.
   types[name]=typeof value==='function'&&!value.prototype?.isScene&&(name==='WebGLRenderer'||typeof value.prototype?.dispose==='function')?new Proxy(value,{construct(t,args,newTarget){const instance=Reflect.construct(t,args,newTarget);self.resources.add(instance);const dispose=instance.dispose;instance.dispose=function(...args){self.resources.delete(instance);return dispose.apply(this,args)};return instance}}):value;
  }
  this.window={THREE:types,AudioContext:globalThis.AudioContext,webkitAudioContext:globalThis.webkitAudioContext,get innerWidth(){return self.width},get innerHeight(){return self.height}};
  this.localStorage={getItem:()=>JSON.stringify(settings),setItem:(_key,value)=>{try{this.onSettings?.(JSON.parse(value))}catch(error){this.fail(error)}}};
  this.requestAnimationFrame=fn=>{const id=++this.sequence;this.frames.set(id,{fn,handle:0});this.schedule(id);return id};
  this.setTimeout=(fn,ms)=>{const id=globalThis.setTimeout(()=>{this.timers.delete(id);if(!this.disposed){try{fn()}catch(e){this.fail(e)}}},ms);this.timers.add(id);return id};
  this.clearTimeout=id=>{globalThis.clearTimeout(id);this.timers.delete(id)};
  // The webpage's keyboard/UI shortcuts must never intercept Codex input.
  this.addEventListener=(type,fn)=>{if(type==='resize')this.listen(type,fn)};
  this.resize=new ResizeObserver(()=>{this.onSize?.();this.emit('resize')});this.resize.observe(target);
  this.intersection=new IntersectionObserver(entries=>{this.shown=entries[0]?.isIntersecting??true;this.refreshActivity()});this.intersection.observe(target);
  const signal=this.abort.signal;
  globalThis.document.addEventListener('visibilitychange',()=>this.refreshActivity(),{signal});
  this.motion.addEventListener('change',()=>this.refreshActivity(),{signal});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.fail(new Error('WebGL context was lost. Disable and enable the background to retry.'))},{signal});
  this.deadline=globalThis.setTimeout(()=>this.fail(new Error('Scene did not render its first frame within 30 seconds')),30000);
 }
 get width(){return Math.max(1,this.target.clientWidth)}
 get height(){return Math.max(1,this.target.clientHeight)}
 listen(type,fn){const list=this.events.get(type)??[];list.push(fn);this.events.set(type,list)}
 emit(type){for(const fn of this.events.get(type)??[])fn()}
 schedule(id){const item=this.frames.get(id);if(!item||item.handle||this.disposed||!this.active)return;item.handle=requestBackgroundFrame(this.target,now=>{this.frames.delete(id);if(!this.disposed&&this.active){try{item.fn(now)}catch(error){this.fail(error)}}})}
 refreshActivity(){
  const active=!globalThis.document.hidden&&this.shown&&(!this.first||(!this.paused&&!this.motion.matches));if(active===this.active)return;this.active=active;
  if(!active){for(const item of this.frames.values()){cancelBackgroundFrame(item.handle);item.handle=0}this.api?.audioSuspend()}
  this.emit('visibilitychange');
  if(active){this.api?.audioResume();for(const id of this.frames.keys())this.schedule(id)}
 }
 firstFrame(){if(this.first)return;this.first=true;globalThis.clearTimeout(this.deadline);this.resolve();queueMicrotask(()=>this.refreshActivity())}
 start(){this.refreshActivity()}
 setPaused(value){this.paused=value;this.refreshActivity()}
 fail(error){if(this.disposed)return;const failure=new Error('SHALLOW_OCEAN_RENDER_FAILED: '+String(error?.message??error));this.reject(failure);this.onError?.(failure.message);this.dispose()}
 setParameters(values){if(this.disposed)return;const current=this.api.parameters();for(const[key,value]of Object.entries(values))if(current[key]!==value)this.api.setParameter(key,value,false)}
 replay(){
  // Reset the source delta clock as well as the opening. A parked startup
  // frame must not consume all wall time spent underneath the splash.
  this.emit('visibilitychange');this.api?.intro.replay();
 }
 snapshot(){return this.api?{...this.api.stats,parameters:this.api.parameters(),intro:this.api.intro.snapshot(),frames:this.api.frameCount(),glError:this.api.glError(),paused:!this.active,resourceCount:this.resources.size}:null}
 dispose(){
  if(this.disposed)return;this.disposed=true;globalThis.clearTimeout(this.deadline);this.abort.abort();this.resize.disconnect();this.intersection.disconnect();
  for(const item of this.frames.values())cancelBackgroundFrame(item.handle);this.frames.clear();for(const id of this.timers)globalThis.clearTimeout(id);this.timers.clear();
  try{this.api?.disposeScene()}catch{}this.api=undefined;delete this.window.ocean;this.reject(new DOMException('Scene disposed','AbortError'));
  const renderers=[...this.resources].filter(r=>typeof r.forceContextLoss==='function'&&typeof r.getContext==='function');
  for(const resource of this.resources){if(renderers.includes(resource))continue;try{resource.dispose()}catch{}}
  // r128 owns dispose on the renderer instance. Release GPU owners first,
  // then renderer caches/listeners and finally the context, exactly once.
  for(const renderer of renderers){try{renderer.dispose()}catch{}try{renderer.forceContextLoss()}catch{}}
  this.resources.clear();this.events.clear();this.shell.remove();
 }
}
