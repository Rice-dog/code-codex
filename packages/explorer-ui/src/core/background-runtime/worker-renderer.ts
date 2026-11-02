import {ResourceScope} from '../lifecycle/resource-scope';
import {BACKGROUND_PROTOCOL,visualState,visualPayload,viewportState,type BackgroundViewport} from './protocol';
import {backgroundStartupHeld} from '../../background-startup-hold';
import {runtimeEvent} from '../../runtime-events';

interface VisualUpdate {settings?:unknown;viewport?:BackgroundViewport;visible?:boolean;reduced?:boolean;input?:Record<string,unknown>;}
interface BackgroundDiagnostic {id:string;mode:'worker';phase:string;frames:number;pending:number;error?:string;}
const registry=()=>{
 const host=window as unknown as Record<symbol,Map<object,BackgroundDiagnostic>>;
 return host[Symbol.for('code-codex:background-isolation:v1')]??=new Map();
};
/** One autonomous visual worker. The validated containing plugin owns the
 * embedded worker bytes; no URL, credentials or general host capability is sent. */
export class WorkerBackgroundRenderer {
 readonly ready:Promise<void>;
 readonly firstFrame:Promise<void>;
 #resolve!:()=>void;#reject!:(error:unknown)=>void;
 #scope:ResourceScope;
 #worker:Worker;
 #session=crypto.randomUUID();
 #sequence=0;#pending=0;#latest:VisualUpdate|undefined;
 #commands:Record<string,unknown>[]=[];
 #calls=new Map<number,{resolve:(value:any)=>void;reject:(error:unknown)=>void;timer:ReturnType<typeof setTimeout>}>();
 #callSequence=0;
 #first=false;#dead=false;#shown=true;
 #viewport:BackgroundViewport;
 #ackTimer:ReturnType<typeof setTimeout>|undefined;
 #diagnostic:BackgroundDiagnostic;
 constructor(id:string,source:string,private readonly host:HTMLElement,canvas:HTMLCanvasElement,settings:unknown,private readonly onError:(message?:string)=>void=()=>{},options:{interactive?:boolean}={}){
  if(typeof Worker!=='function'||typeof canvas.transferControlToOffscreen!=='function')throw Error('BG_BACKEND_UNAVAILABLE: Independent background rendering is unavailable.');
  const initial=visualState(settings),initialViewport=viewportState(host.getBoundingClientRect(),devicePixelRatio||1);
  this.#diagnostic={id,mode:'worker',phase:'preparing',frames:0,pending:0};registry().set(this,this.#diagnostic);
  this.#scope=new ResourceScope(error=>runtimeEvent('background','resource release','failed',{id,error:String(error)}));
  this.ready=this.firstFrame=new Promise<void>((resolve,reject)=>{this.#resolve=resolve;this.#reject=reject;});void this.ready.catch(()=>{});
  this.#viewport=initialViewport;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  this.#scope.own(()=>URL.revokeObjectURL(url));
  try{this.#worker=new Worker(url,{name:'code-codex-background-'+id});}
  catch(error){this.#scope.dispose();registry().delete(this);throw error;}
  const worker=this.#worker;
  const deadline=setTimeout(()=>this.#fail('BG_FIRST_FRAME_TIMEOUT: The background did not produce a first frame within 15 seconds.'),15000);
  this.#scope.own(()=>clearTimeout(deadline));
  this.#scope.listen(canvas,'webglcontextlost',event=>{event.preventDefault();this.#fail('BG_WORKER_CONTEXT_LOST: The transferred background graphics context was lost. Enable the background again to retry.');});
  this.#scope.listen(worker,'error',event=>this.#fail('BG_WORKER_ERROR: '+(event as ErrorEvent).message));
  this.#scope.listen(worker,'messageerror',()=>this.#fail('BG_WORKER_PROTOCOL: The background response could not be decoded.'));
  this.#scope.listen(worker,'message',event=>{
   const m=(event as MessageEvent).data;
   if(this.#dead||m?.v!==BACKGROUND_PROTOCOL||m.session!==this.#session)return;
   if(m.type==='failed'){this.#fail('BG_WORKER_RENDER_FAILED: '+String(m.message).slice(0,1500));return;}
   if(m.type==='first-frame'&&!this.#first){this.#first=true;this.#diagnostic.frames=m.frames??1;clearTimeout(deadline);this.#diagnostic.phase='running';this.#resolve();this.#visibility();runtimeEvent('background','isolated first frame','ready',{id,backend:'worker'});}
   if(m.type==='sample'&&Number.isSafeInteger(m.frames))this.#diagnostic.frames=m.frames;
   if(m.type==='event'&&typeof m.event==='string')this.kernelEvent(m.event,m.value);
   if(m.type==='result'&&Number.isSafeInteger(m.callId)){const call=this.#calls.get(m.callId);if(call){clearTimeout(call.timer);this.#calls.delete(m.callId);if(m.error)call.reject(Error('BG_KERNEL_FAILED: '+String(m.error)));else call.resolve(m.value);}}
   if(m.type==='ack'&&m.seq===this.#pending){clearTimeout(this.#ackTimer);this.#ackTimer=undefined;this.#pending=0;this.#diagnostic.pending=0;this.#flush();}
  });
  const resize=new ResizeObserver(()=>{
   const next=viewportState(this.host.getBoundingClientRect(),devicePixelRatio||1);
   if(JSON.stringify(next)!==JSON.stringify(this.#viewport)){this.#viewport=next;this.#update({viewport:next});}
  });resize.observe(host);this.#scope.own(()=>resize.disconnect());
  const intersection=new IntersectionObserver(entries=>{this.#shown=entries[0]?.isIntersecting??true;this.#visibility();});intersection.observe(host);this.#scope.own(()=>intersection.disconnect());
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.#scope.listen(motion,'change',()=>this.#update({reduced:motion.matches}));
  this.#scope.listen(document,'visibilitychange',()=>this.#visibility());
  this.#scope.listen(window,'code-codex:background-hold-changed',()=>this.#visibility());
  this.#scope.listen(window,'pagehide',()=>this.dispose());
  const input=(event:Event)=>{
   if(!this.#first||this.#dead||options.interactive===false)return;
   if(!['pointerup','pointercancel'].includes(event.type)&&event.composedPath().some(node=>node instanceof Element&&node.matches('button,a,input,textarea,select,[contenteditable],dialog,[role="menu"],[role="menubar"],[popover]')))return;
   const p=event as PointerEvent,rect=this.#viewport;
   if(event instanceof PointerEvent&&!['pointermove','pointerleave','pointerup','pointercancel'].includes(event.type)&&(p.clientX<rect.left||p.clientX>rect.left+rect.width||p.clientY<rect.top||p.clientY>rect.top+rect.height))return;
   // Never forward typed characters, key labels, DOM nodes or application state.
   const fields:Record<string,unknown>={type:event.type};
   if(event instanceof PointerEvent)Object.assign(fields,{clientX:p.clientX,clientY:p.clientY,pointerId:p.pointerId,button:p.button,buttons:p.buttons,isPrimary:p.isPrimary,pointerType:p.pointerType});
   else if(event instanceof WheelEvent){const prior=this.#commands.find(m=>m.type==='state'&&(m.input as any)?.type==='wheel');if(prior){const wheel=prior.input as any;wheel.deltaX=Math.max(-10000,Math.min(10000,wheel.deltaX+event.deltaX));wheel.deltaY=Math.max(-10000,Math.min(10000,wheel.deltaY+event.deltaY));return;}Object.assign(fields,{deltaX:event.deltaX,deltaY:event.deltaY,deltaMode:event.deltaMode,clientX:event.clientX,clientY:event.clientY});}
   else if(event instanceof KeyboardEvent)Object.assign(fields,{repeat:event.repeat,isComposing:event.isComposing,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,key:'',code:''});
   if(event.type==='pointermove'){
    if(p.clientX<rect.left||p.clientX>rect.left+rect.width||p.clientY<rect.top||p.clientY>rect.top+rect.height)fields.type='pointerleave';
    this.#update({input:fields});
   }else if(this.#commands.length<8){this.#commands.push({type:'state',input:fields});this.#flush();}
   else this.#fail('BG_INPUT_QUEUE_FULL: Background input exceeded the bounded discrete-event queue.');
  };
  for(const type of ['pointermove','pointerleave','pointerdown','pointerup','pointercancel','wheel','keydown'])this.#scope.listen(window,type,input,{passive:true});
  try{const transferred=canvas.transferControlToOffscreen();worker.postMessage({v:BACKGROUND_PROTOCOL,session:this.#session,type:'init',canvas:transferred,settings:initial,viewport:this.#viewport,reduced:motion.matches,held:backgroundStartupHeld(host)},[transferred]);}
  catch(error){this.#fail('BG_CANVAS_TRANSFER: '+String(error));}
 }
 get diagnostics(){return {...this.#diagnostic};}
 setSettings(settings:unknown):void{this.#update({settings:visualState(settings)});}
 updateSettings(settings:unknown):void{this.setSettings(settings);}
 replay():void{if(this.#dead)return;if(this.#commands.length>=8)throw Error('BG_COMMAND_QUEUE_FULL: Wait for the pending visual command.');this.#commands.push({type:'replay'});this.#flush();}
 protected kernelEvent(_event:string,_value:unknown):void{}
 protected activityChanged(_visible:boolean):void{}
 protected call<T=unknown>(method:string,args:unknown[]=[],timeoutMs=30000):Promise<T>{
  if(this.#dead)return Promise.reject(Error('BG_KERNEL_DISPOSED: The visual worker has been retired.'));
  if(this.#calls.size>=8||this.#commands.length>=8)return Promise.reject(Error('BG_COMMAND_QUEUE_FULL: Wait for the pending visual command.'));
  const payload=visualPayload(args),callId=++this.#callSequence;
  const result=new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>{this.#calls.delete(callId);reject(Error('BG_KERNEL_TIMEOUT: The visual command did not confirm completion. It was not replayed.'));},timeoutMs);this.#calls.set(callId,{resolve,reject,timer});});
  this.#commands.push({type:'call',method,args:payload,callId});this.#flush();return result;
 }
 resumeOpening():void{this.replay();}
 #visibility=():void=>{const visible=!document.hidden&&this.#shown&&(!this.#first||!backgroundStartupHeld(this.host));this.#update({visible});this.activityChanged(visible);};
 #update(patch:VisualUpdate){if(this.#dead)return;this.#latest={...this.#latest,...patch};this.#flush();}
 #flush(){
  if(this.#dead||this.#pending)return;
  let message:Record<string,unknown>;
  // Apply control state before commands, then discrete releases before moves.
  // A continuous pointer stream cannot starve a release or visual command.
  if(this.#latest&&['settings','viewport','visible','reduced'].some(key=>key in this.#latest!)){const {input,...state}=this.#latest;message={type:'state',...state};this.#latest=input?{input}:undefined;}
  else if(this.#commands.length)message=this.#commands.shift()!;
  else if(this.#latest){message={type:'state',...this.#latest};this.#latest=undefined;}
  else return;
  this.#pending=++this.#sequence;this.#diagnostic.pending=1;
  try{this.#worker.postMessage({v:BACKGROUND_PROTOCOL,session:this.#session,seq:this.#pending,...message});}catch(error){this.#fail('BG_WORKER_SEND_FAILED: '+String(error));return;}
  this.#ackTimer=setTimeout(()=>this.#fail('BG_WORKER_ACK_TIMEOUT: The visual worker stopped acknowledging bounded updates.'),5000);
 }
 #fail(message:string){if(this.#dead)return;this.#diagnostic.phase='failed';this.#diagnostic.error=message;this.#reject(Error(message));runtimeEvent('background','visual worker','failed',{id:this.#diagnostic.id,session:this.#session,sequence:this.#sequence,pending:this.#pending,message});try{this.onError(message);}finally{this.dispose();}}
 dispose():void{
  if(this.#dead)return;this.#dead=true;this.#scope.dispose();clearTimeout(this.#ackTimer);this.#latest=undefined;this.#commands=[];
  if(!this.#first)this.#reject(new DOMException('Background preparation was cancelled.','AbortError'));
  for(const call of this.#calls.values()){clearTimeout(call.timer);call.reject(new DOMException('Background command was cancelled.','AbortError'));}this.#calls.clear();
  const worker=this.#worker,session=this.#session,seq=++this.#sequence;
  this.#diagnostic.phase='disposing';
  let stopped=false;const finish=()=>{if(stopped)return;stopped=true;clearTimeout(deadline);worker.terminate();registry().delete(this);};
  const deadline=setTimeout(()=>{runtimeEvent('background','worker disposal','unconfirmed',{id:this.#diagnostic.id,timeoutMs:1500});finish();},1500);
  worker.addEventListener('message',event=>{if(event.data?.session===session&&event.data?.type==='disposed')finish();});
  try{worker.postMessage({v:BACKGROUND_PROTOCOL,session,seq,type:'dispose'});}catch{finish();}
 }
}
