import '../../core/background-runtime/worker-globals';
import {shaderEnvironment} from '../../core/background-runtime/worker-environment';
import {BACKGROUND_PROTOCOL,visualState,viewportState} from '../../core/background-runtime/protocol';
import {LiquidAsciiRenderer} from './source/runtime.mjs';

const scope=globalThis as any;
let session='',seq=0,dead=false,renderer:LiquidAsciiRenderer|undefined;
let env:ReturnType<typeof shaderEnvironment>|undefined,frames=0,first=false,lastSample=0;
const reply=(type:string,data:Record<string,unknown>={})=>scope.postMessage({v:BACKGROUND_PROTOCOL,session,type,...data});
const fail=(error:unknown)=>reply('failed',{message:String(error).slice(0,1500)});
scope.addEventListener('error',(event:ErrorEvent)=>fail(event.error??event.message));
scope.addEventListener('unhandledrejection',(event:PromiseRejectionEvent)=>fail(event.reason));
scope.addEventListener('message',(event:MessageEvent)=>{
 const m=event.data;
 if(dead||!m||m.v!==BACKGROUND_PROTOCOL||typeof m.session!=='string')return;
 try{
  if(m.type==='init'){
   if(session||m.session.length>100||!(m.canvas instanceof OffscreenCanvas))throw Error('LIQUID_INIT_INVALID');
   session=m.session;
   env=shaderEnvironment(m.canvas,viewportState(m.viewport,m.viewport.dpr),()=>{});
   env.motion(m.reduced===true);
   renderer=new LiquidAsciiRenderer(env.host,m.canvas,visualState(m.settings),fail,()=>{
    frames++;
    if(!first){first=true;reply('first-frame',{frames});if(m.held)queueMicrotask(()=>env?.visibility(false));}
    const now=performance.now();if(now-lastSample>=1000){lastSample=now;reply('sample',{frames});}
   });return;
  }
  if(m.session!==session||!Number.isSafeInteger(m.seq)||m.seq<=seq)return;
  seq=m.seq;
  if(m.type==='state'){
   if(m.settings!==undefined)renderer?.setSettings(visualState(m.settings));
   if(m.viewport)env?.viewport(viewportState(m.viewport,m.viewport.dpr));
   if(typeof m.reduced==='boolean')env?.motion(m.reduced);
   if(typeof m.visible==='boolean')env?.visibility(m.visible);
   if(m.input){const {type,...fields}=m.input;if(!['pointermove','pointerdown','pointerup','pointercancel','pointerleave','wheel','keydown'].includes(type))throw Error('LIQUID_INPUT_INVALID');env?.input(type,visualState(fields) as Record<string,unknown>);}
   reply('ack',{seq});return;
  }
  if(m.type==='replay'){renderer?.replay();reply('ack',{seq});return;}
  if(m.type==='dispose'){dead=true;renderer?.dispose();env?.dispose();reply('disposed');setTimeout(()=>scope.close(),0);return;}
  throw Error('LIQUID_COMMAND_INVALID');
 }catch(error){fail(error);}
});
