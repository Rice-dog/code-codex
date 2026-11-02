import type {BackgroundViewport} from './protocol';

/** Explicit browser-observation adapter for the existing shader kernels. No
 * native document, history, storage, Bridge or app object enters this lane. */
export function shaderEnvironment(offscreen:OffscreenCanvas,initial:BackgroundViewport,onFrame:()=>void){
 const scope=globalThis as any;
 let viewport=initial,visible=true,reduced=false;
 const resizeObservers=new Set<any>(),intersectionObservers=new Set<any>();
 const documentEvents=new EventTarget(),motion=Object.assign(new EventTarget(),{matches:false,media:'(prefers-reduced-motion: reduce)'});
 const bounds=()=>({...viewport,x:viewport.left,y:viewport.top,right:viewport.left+viewport.width,bottom:viewport.top+viewport.height,toJSON(){return this;}});
 const host=Object.assign(new EventTarget(),{getBoundingClientRect:bounds,closest:()=>null,style:{setProperty(){},removeProperty(){}},dataset:{},contains:()=>false});
 const contexts=new Map<string,any>(),dataset:Record<string,string>={};
 const canvas=new Proxy(offscreen as any,{
  get(target,key){
   if(key==='getBoundingClientRect')return bounds;
   if(key==='clientWidth'||key==='offsetWidth')return viewport.width;
   if(key==='clientHeight'||key==='offsetHeight')return viewport.height;
   if(key==='closest')return ()=>null;
   if(key==='parentElement')return host;
   if(key==='setPointerCapture'||key==='releasePointerCapture'||key==='replaceWith')return ()=>{};
   if(key==='style')return host.style;
   if(key==='dataset')return dataset;
   if(key==='getContext')return (name:string,options:any)=>{
    if(contexts.has(name))return contexts.get(name);
    const gl=target.getContext(name,options);if(!gl)return null;
    let framebuffer:any=null;
    const functions=new Map<PropertyKey,unknown>();
    const wrapped=new Proxy(gl,{get(ctx,property){
     const value=Reflect.get(ctx,property,ctx);if(typeof value!=='function')return value;
     if(!functions.has(property))functions.set(property,(...args:unknown[])=>{
      const result=Reflect.apply(value,ctx,args);
      if(property==='bindFramebuffer'&&(args[0]===ctx.FRAMEBUFFER||args[0]===ctx.DRAW_FRAMEBUFFER))framebuffer=args[1];
      if((property==='drawArrays'||property==='drawElements'||property==='drawArraysInstanced'||property==='drawElementsInstanced')&&framebuffer===null)onFrame();
      return result;
     });return functions.get(property);
    }});contexts.set(name,wrapped);return wrapped;
   };
   const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;
  },set(target,key,value){return Reflect.set(target,key,value,target);}
 });
 Object.defineProperties(host,{clientWidth:{get:()=>viewport.width},clientHeight:{get:()=>viewport.height}});
 const doc=Object.assign(documentEvents,{get hidden(){return !visible;},get visibilityState(){return visible?'visible':'hidden';}});
 // Object.assign evaluates getters, so retain live visibility accessors.
 Object.defineProperties(doc,{hidden:{get:()=>!visible},visibilityState:{get:()=>visible?'visible':'hidden'}});
 scope.window=scope;scope.document=doc;scope.matchMedia=()=>motion;
 scope.Element=class extends EventTarget{};
 Object.defineProperties(scope,{innerWidth:{configurable:true,get:()=>viewport.width},innerHeight:{configurable:true,get:()=>viewport.height},devicePixelRatio:{configurable:true,get:()=>viewport.dpr}});
 scope.ResizeObserver=class{constructor(readonly callback:any){resizeObservers.add(this);}observe(){this.callback([{target:host,contentRect:bounds()}]);}disconnect(){resizeObservers.delete(this);}};
 scope.IntersectionObserver=class{constructor(readonly callback:any){intersectionObservers.add(this);}observe(){this.callback([{target:host,isIntersecting:visible,intersectionRatio:visible?1:0}]);}disconnect(){intersectionObservers.delete(this);}};
 const event=(type:string,fields:Record<string,unknown>)=>{const e=new Event(type);for(const[k,v]of Object.entries(fields))Object.defineProperty(e,k,{value:v});return e;};
 return {host:host as unknown as HTMLElement,canvas:canvas as HTMLCanvasElement,
  viewport(next:BackgroundViewport){viewport=next;for(const o of resizeObservers)o.callback([{target:host,contentRect:bounds()}]);scope.dispatchEvent(new Event('resize'));},
  visibility(next:boolean){if(visible===next)return;visible=next;documentEvents.dispatchEvent(new Event('visibilitychange'));for(const o of intersectionObservers)o.callback([{target:host,isIntersecting:next,intersectionRatio:next?1:0}]);},
  motion(next:boolean){if(reduced===next)return;reduced=next;motion.matches=next;motion.dispatchEvent(new Event('change'));},
  input(type:string,fields:Record<string,unknown>){scope.dispatchEvent(event(type,fields));host.dispatchEvent(event(type,fields));offscreen.dispatchEvent(event(type,fields));},
  dispose(){resizeObservers.clear();intersectionObservers.clear();for(const gl of contexts.values())try{gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{}contexts.clear();},
 };
}
