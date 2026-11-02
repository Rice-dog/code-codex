import {createScene,type OceanScene,type OceanEventHooks} from './scene.js';
import {normalize,type OceanOptions} from '../../../src/effects/shallow-ocean/options';
import {getLocale,subscribeLanguage} from '../../../src/i18n';

/** Offline native WebGL scene; normal/preview/startup have independent owners. */
export class ShallowOceanRenderer {
 readonly ready:Promise<void>;
 private readonly scene:OceanScene;
 private readonly scope=new AbortController();
 private readonly language:()=>void;
 private pointers=0;
 constructor(private readonly target:HTMLElement,canvas:HTMLCanvasElement,settings:OceanOptions,onError:(message:string)=>void,interactive=true,eventHooks?:OceanEventHooks){
  this.scene=createScene(target,canvas,normalize(settings),onError,undefined,eventHooks);this.ready=this.scene.ready;
  this.language=subscribeLanguage(()=>this.renderLanguage());this.renderLanguage();
  if(interactive){
   const forward=(event:PointerEvent)=>{
    if(this.scene.disposed||!event.isTrusted||event.composedPath().some(n=>n instanceof Element&&n.matches('button,a,input,textarea,select,[contenteditable="true"],dialog,[role="dialog"],[role="menu"],[role="menubar"],[popover]')))return;
    const r=target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)return;
    this.pointers++;canvas.dispatchEvent(new PointerEvent(event.type,{clientX:event.clientX-r.left,clientY:event.clientY-r.top,pointerId:event.pointerId,pointerType:event.pointerType,button:event.button,buttons:event.buttons}));
   };
   for(const type of ['pointermove','pointerdown','pointerup','pointercancel'] as const)window.addEventListener(type,forward,{capture:true,passive:true,signal:this.scope.signal});
  }
 }
 private renderLanguage(){const title=this.target.querySelector('div')?.shadowRoot?.querySelector('#intro-title');if(title){const h=title.querySelector('h1,h2,strong,b');if(h)h.textContent=getLocale()==='zh-CN'?'浅海来信':'Shallow Ocean Letters';}}
 setSettings(settings:OceanOptions){this.scene.setParameters(normalize(settings))}
 replay(){this.scene.replay()}
 addCreature(kind:string,u=.5,v=.5){this.scene.api?.addCreature(kind,u,v)}
 previewEvent(kind:string){this.scene.api?.previewEvent(kind)}
 action(action:string){this.scene.api?.action(action)}
 get diagnostics(){const snapshot=this.scene.snapshot();return snapshot?{...snapshot,pointerEvents:this.pointers}:null}
 dispose(){this.scope.abort();this.language();this.scene.dispose()}
}
