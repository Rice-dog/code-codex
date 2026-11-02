import './worker-globals';
import {shaderEnvironment} from './worker-environment';
import {BACKGROUND_PROTOCOL,visualState,visualPayload,viewportState} from './protocol';
import {connectKernelEvents} from './kernel-events';
// Replaced only by the per-package compiler with that package's exact kernel.
import {createKernel,kernelMethods} from 'code-codex:background-kernel';

const scope=globalThis as any;
let session='',sequence=0,disposed=false,renderer:any,environment:ReturnType<typeof shaderEnvironment>|undefined;
let frameCount=0,first=false,lastSample=0;
const reply=(type:string,details:Record<string,unknown>={})=>scope.postMessage({v:BACKGROUND_PROTOCOL,session,type,...details});
const failed=(error:unknown)=>reply('failed',{code:'BG_WORKER_RENDER_FAILED',message:String(error instanceof Error?error.message:error).slice(0,1500)});
scope.addEventListener('error',(e:ErrorEvent)=>failed(e.error??e.message));
scope.addEventListener('unhandledrejection',(e:PromiseRejectionEvent)=>failed(e.reason));
scope.addEventListener('message',(event:MessageEvent)=>{
 const m=event.data;
 if(disposed||!m||m.v!==BACKGROUND_PROTOCOL||typeof m.session!=='string')return;
 try{
  if(m.type==='init'){
   if(session||!(m.canvas instanceof OffscreenCanvas)||m.session.length>100)throw Error('BG_INIT_INVALID: Invalid or duplicate background initialization.');
   session=m.session;
   connectKernelEvents((event,value)=>reply('event',{event,value:visualPayload(value)}));
   const viewport=viewportState(m.viewport,m.viewport.dpr);
   environment=shaderEnvironment(m.canvas,viewport,()=>{
    frameCount++;
    if(!first){first=true;reply('first-frame',{frames:frameCount});if(m.held===true)queueMicrotask(()=>environment?.visibility(false));}
    const now=performance.now();if(now-lastSample>=1000){lastSample=now;reply('sample',{frames:frameCount,at:now});}
   });
   environment.motion(m.reduced===true);
   renderer=createKernel(environment.host,environment.canvas,visualState(m.settings),(message:unknown)=>{if(message)failed(message);});
   return;
  }
  if(m.session!==session||!Number.isSafeInteger(m.seq)||m.seq<=sequence)return;
  sequence=m.seq;
  if(m.type==='state'){
   if(m.settings!==undefined){const settings=visualState(m.settings);if(renderer.setSettings)renderer.setSettings(settings);else renderer.updateSettings?.(settings);}
   if(m.viewport)environment?.viewport(viewportState(m.viewport,m.viewport.dpr));
   if(typeof m.reduced==='boolean')environment?.motion(m.reduced);
   if(typeof m.visible==='boolean')environment?.visibility(m.visible);
   if(m.input){const {type,...fields}=m.input;if(!['pointermove','pointerdown','pointerup','pointercancel','pointerleave','wheel','keydown'].includes(type))throw Error('BG_INPUT_METHOD: Unsupported background input.');environment?.input(type,visualState(fields) as Record<string,unknown>);}
   reply('ack',{seq:m.seq});return;
  }
  if(m.type==='replay'){renderer.replay?.();reply('ack',{seq:m.seq});return;}
  if(m.type==='call'){
   if(typeof m.method!=='string'||!kernelMethods.includes(m.method)||!Array.isArray(m.args)||m.args.length>8||!Number.isSafeInteger(m.callId))throw Error('BG_KERNEL_COMMAND: The visual kernel command is not supported.');
   const args=visualPayload(m.args) as unknown[];reply('ack',{seq:m.seq});
   Promise.resolve().then(()=>renderer[m.method](...args)).then(value=>reply('result',{callId:m.callId,value:visualPayload(value??null)}),error=>reply('result',{callId:m.callId,error:String(error).slice(0,1500)}));return;
  }
  if(m.type==='dispose'){
   disposed=true;try{renderer?.dispose();}finally{environment?.dispose();reply('disposed');setTimeout(()=>scope.close(),0);}return;
  }
  throw Error('BG_WORKER_METHOD: Unsupported background command.');
 }catch(error){failed(error);}
});
