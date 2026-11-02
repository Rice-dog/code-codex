import type {AccountRequest,AccountsInfo} from './contracts';
type Dispatcher={dispatchMessage:(...args:any[])=>any};
interface Guard {owner:string;update(info:Pick<AccountsInfo,'owner'>,request:AccountRequest,end:()=>void):void;dispose?():void;}
const key=Symbol.for('code-codex:account-session-guard:v2');
/** Explicit native logout only. No visibility/unload/disconnect listener revokes credentials. */
export function installSessionGuard(dispatcher:Dispatcher,info:Pick<AccountsInfo,'owner'>,request:AccountRequest,ended:()=>void):void {
 const globals=window as unknown as Record<symbol,Guard|undefined>,existing=globals[key];
 if(existing){existing.update(info,request,ended);return;}
 // Retire an already-loaded v1 wrapper without stacking a second native cleanup.
 // Its original dispatch still forwards the official logout exactly once.
 const legacyKey=Symbol.for('code-codex:account-session-guard:v1'),legacy=globals[legacyKey];
 legacy?.update(info,async()=>({ended:true}) as any,()=>{});
 Object.defineProperty(window,legacyKey,{configurable:true,get:()=>({owner:'',update(){}}),set:()=>{}});
 const original=dispatcher.dispatchMessage;let owner=info.owner.id,call=request,onEnd=ended,pending=false;
 const guard:Guard={owner,update(next,nextCall,nextEnd){owner=next.owner.id;guard.owner=owner;call=nextCall;onEnd=nextEnd;}};
 globals[key]=guard;
 const wrapped=dispatcher.dispatchMessage=function(type:string,message:any,...rest:any[]){
  if(type!=='mcp-request'||message?.hostId!=='local'||message?.request?.method!=='account/logout')return original.call(this,type,message,...rest);
  if(pending)return;pending=true;
  void call<AccountsInfo>({action:'info'}).then(current=>{owner=current.owner.id;guard.owner=owner;return call({action:'session.end',owner});}).then(()=>{onEnd();original.call(dispatcher,type,message,...rest);},error=>{window.dispatchEvent(new CustomEvent('code-codex:account-session-error',{detail:'ACCOUNT_LOGOUT_INCOMPLETE: Child account logout could not be confirmed. Retry signing out. '+String(error)}));}).finally(()=>{pending=false;});
 };
 guard.dispose=()=>{if(dispatcher.dispatchMessage===wrapped)dispatcher.dispatchMessage=original;if(globals[key]===guard)delete globals[key];};
}
/** New guards unwrap completely; pre-suspension guards become local pass-through. */
export function suspendSessionGuard():void {
 const globals=window as unknown as Record<symbol,Guard|undefined>;
 for(const symbol of [key,Symbol.for('code-codex:account-session-guard:v1')]){
  const guard=globals[symbol];if(!guard)continue;
  if(guard.dispose)guard.dispose();
  else guard.update({owner:{id:'',label:''}},async()=>({owner:{id:'',label:''}}) as any,()=>{});
 }
}
