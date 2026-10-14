import { runtimeEvent } from './runtime-events';

/** Compatibility cleanup only; original video-library storage is never touched. */
export function retireStartupCompositionState(): void {
  const host=window as unknown as Record<symbol,unknown>;
  const once=Symbol.for('code-codex:startup-composition-retired:v1');
  if(host[once])return;
  host[once]=true;
  for(const version of [1,2,3]){
    const key=Symbol.for(`code-codex:startup-render-manager:v${version}`);
    const old=host[key] as {abort?:AbortController;worker?:Worker;listeners?:Set<unknown>}|undefined;
    old?.abort?.abort();old?.worker?.terminate();old?.listeners?.clear();delete host[key];
  }
  delete host[Symbol.for('code-codex:startup-render-published:v1')];
  try{
    const request=indexedDB.deleteDatabase('code-codex-startup-render');
    request.onsuccess=()=>runtimeEvent('startup-animation','retired composition cache','removed',{originalVideoLibraryPreserved:true});
    request.onerror=()=>runtimeEvent('startup-animation','retired composition cache','failed',{reason:String(request.error),originalVideoLibraryPreserved:true});
    request.onblocked=()=>runtimeEvent('startup-animation','retired composition cache','deferred',{reason:'Another window still has the retired database open',originalVideoLibraryPreserved:true});
  }catch(error){runtimeEvent('startup-animation','retired composition cache','failed',{reason:String(error),originalVideoLibraryPreserved:true});}
}
