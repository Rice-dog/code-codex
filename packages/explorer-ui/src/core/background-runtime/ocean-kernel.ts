// @ts-nocheck -- Explicit, worker-local slots for the preserved standalone scene UI.
import {createScene} from '../../../plugins/appearance/shallow-ocean/scene';
import {kernelEvent} from './kernel-events';

/** These inert slots satisfy the scene's private legacy controls. They are not
 * a DOM bridge: no app node, selector, URL or storage is reachable through them. */
class SceneSlot extends EventTarget {
 style={setProperty(){},removeProperty(){}};dataset={};children=[];hidden=false;
 classes=new Set();classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),toggle:(name,force)=>{const add=force??!this.classes.has(name);if(add)this.classes.add(name);else this.classes.delete(name);return add;},contains:name=>this.classes.has(name)};
 static sea;slots=new Map();parentElement=this;
 append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
 appendChild(node){this.append(node);return node;}
 querySelector(selector){if(selector==='#sea')return SceneSlot.sea;if(!this.slots.has(selector))this.slots.set(selector,new SceneSlot());return this.slots.get(selector);}
 querySelectorAll(){return [];}
 attachShadow(){return this;}
 setAttribute(){} getAttribute(){return null;} remove(){} replaceWith(){} scrollBy(){}
}
export const oceanMethods=['addCreature','previewEvent','action','cancelEvent','includeEvents'];
export function createOceanKernel(host,canvas,settings,onError){
 const doc=globalThis.document;SceneSlot.sea=canvas;
 doc.createElement=(tag)=>tag==='canvas'?new OffscreenCanvas(1,1):new SceneSlot();
 // createScene owns its own private query scope, with the real transferred
 // canvas replacing the sea slot. No native application document is copied.
 const shell=new SceneSlot(),shadow=new SceneSlot();shell.attachShadow=()=>shadow;
 const create=doc.createElement;let creations=0;
 doc.createElement=(tag)=>tag==='div'&&creations++===0?shell:create(tag);
 shadow.slots.set('#sea',canvas);
 const originalAppend=host.append;host.append=()=>{};
 let included=['school','dolphin','storm','meteor','duo'];
 let scene;for(const type of ['pointerdown','pointerup'])canvas.addEventListener(type,event=>{if(scene?.api?.intro.snapshot().active)event.stopImmediatePropagation();});
 scene=createScene(host,canvas,settings,onError,undefined,{
  included:()=>included,started:kind=>kernelEvent('ocean-event',kind),
 });
 // Worker input arrives in viewport coordinates; the legacy scene uses local
 // coordinates (its main-thread adapter already subtracts the target origin).
 scene.pointerOrigin=()=>canvas.getBoundingClientRect();
 host.append=originalAppend;
 // The host starts its visible opening after receiving actual first-frame
 // readiness. Do not spend that timeline in shader or UI message-queue delay.
 void scene.ready.catch(()=>{});
 const timer=setInterval(()=>{const snapshot=scene.snapshot();if(snapshot)kernelEvent('ocean-snapshot',snapshot);},1000);
 return {
  setSettings(next){scene.setParameters(next);kernelEvent('ocean-snapshot',scene.snapshot());},replay(){scene.replay();kernelEvent('ocean-opening',scene.api.intro.snapshot());},
  addCreature(kind,u,v){scene.api?.addCreature(kind,u,v);return scene.snapshot();},
  previewEvent(kind){scene.api?.previewEvent(kind);kernelEvent('ocean-snapshot',scene.snapshot());},action(value){scene.api?.action(value);kernelEvent('ocean-snapshot',scene.snapshot());},cancelEvent(){scene.api?.cancelEvent();kernelEvent('ocean-snapshot',scene.snapshot());},
  includeEvents(values){included=values;},
  dispose(){clearInterval(timer);scene.dispose();},
 };
}
