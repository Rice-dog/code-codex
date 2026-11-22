type OwnedFunction=((...args:any[])=>any)&{runtimeVersion?:string};
const version=()=>typeof __CODE_CODEX_VERSION__==='string'?__CODE_CODEX_VERSION__:'0.0.0';
const acceptable=(next:string|undefined,current:string|undefined):boolean=>{if(!next)return !current;const a=next.split('.').map(Number),b=(current??'0.0.0').split('.').map(Number);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]!>b[i]!;}return true;};
/** Keep the same object for previously loaded modules, but reject unversioned/older writes. */
export function ownRequestSlot<T extends (...args:any[])=>any>(key:symbol,next:T):void {
 const globals=window as unknown as Record<symbol,{request?:OwnedFunction}>,slot=globals[key]??={};
 let current=slot.request;const tagged=next as OwnedFunction;tagged.runtimeVersion=version();
 Object.defineProperty(slot,'request',{configurable:true,enumerable:true,get:()=>current,set:(candidate:OwnedFunction|undefined)=>{if(candidate&&acceptable(candidate.runtimeVersion,current?.runtimeVersion))current=candidate;}});
 slot.request=tagged;
}
interface RetainedConnection {nativeBinding?:string|undefined;dispose():void}
interface Owner {version:string;identity?:string|undefined;nativeBinding?:string|undefined;pending?:boolean;retainedAccounts?:RetainedConnection;dispose():void}
const ownerKey=Symbol.for('code-codex:document-connection-owner:v2');
const retiredKey=Symbol.for('code-codex:retired-document-bindings:v1');
const retiredBindings=():Set<string>=>((window as unknown as Record<symbol,any>)[retiredKey]??=new Set<string>());
/** A superseded UI binding cannot reclaim this document, even at the same version. */
export const documentBindingRetired=(binding:string|undefined):boolean=>!!binding&&retiredBindings().has(binding);
export function retireDocumentBinding(binding:string|undefined):void {if(binding)retiredBindings().add(binding);}
function ownDocumentSlot():void {
 const globals=window as unknown as Record<symbol,any>;
 const descriptor=Object.getOwnPropertyDescriptor(window,ownerKey);
 if(descriptor?.set)return;
 let owner=globals[ownerKey] as Owner|undefined;
 // Older loaded bundles also assign this shared slot. Reject their retired
 // claim before their before() callback can release the working endpoint.
 Object.defineProperty(window,ownerKey,{configurable:true,get:()=>owner,set:(next:Owner|undefined)=>{
  if(next?.pending&&documentBindingRetired(next.nativeBinding))throw Object.assign(Error('ACCOUNT_RUNTIME_RETIRED: The candidate no longer owns this document. No connection was replaced.'),{code:'ACCOUNT_RUNTIME_RETIRED'});
  owner=next;
 }});
}
/** Legacy bundles call the public dispose before assigning. Expose a no-op facade to them. */
export async function replaceDocumentConnection(create:()=>{dispose():void},before:()=>Promise<void>=async()=>{},identity?:string,verifiedReplacement=false,nativeBinding?:string,retainAccounts=false):Promise<boolean> {
 ownDocumentSlot();if(documentBindingRetired(nativeBinding))return false;
 const globals=window as unknown as Record<symbol,any>,privateKey=ownerKey,legacyKey=Symbol.for('code-codex:application-connection:v1');
 const prior=globals[privateKey] as Owner|undefined;if(prior&&(!acceptable(version(),prior.version)||(prior.pending&&!(verifiedReplacement&&prior.version!==version()))||(identity!==undefined&&prior.identity===identity)))return false;
 const previous=prior??globals[legacyKey],claim:Owner={version:version(),identity,nativeBinding,pending:true,dispose:()=>previous?.dispose()};globals[privateKey]=claim;
 const facade={dispose(){}};Object.defineProperty(window,legacyKey,{configurable:true,get:()=>facade,set:()=>{}});
 try{
  await before();if(globals[privateKey]!==claim)return false;const connection=create();
  if(retainAccounts&&previous){
   // Only the old execution connection survives. A later UI upgrade transfers
   // that same connection and immediately disposes the superseded UI bridge.
   claim.retainedAccounts=prior?.retainedAccounts??{nativeBinding:prior?.nativeBinding,dispose:()=>previous.dispose()};
   if(prior?.retainedAccounts){delete prior.retainedAccounts;previous.dispose();}
  }else{
   previous?.dispose();
   if(prior?.retainedAccounts){
    if(prior.retainedAccounts.nativeBinding!==nativeBinding)retireDocumentBinding(prior.retainedAccounts.nativeBinding);
    prior.retainedAccounts.dispose();
   }
  }
  // This marker blocks bootstrap admission only. It does not dispose the
  // previous execution connection, which may still be serving active tasks.
  if(prior?.nativeBinding!==nativeBinding)retireDocumentBinding(prior?.nativeBinding);
  claim.dispose=()=>connection.dispose();claim.pending=false;return true;
 }
 catch(error){if(globals[privateKey]===claim){if(prior)globals[privateKey]=prior;else delete globals[privateKey];}throw error;}
}
/** Called only after the old account lease has completed its existing handoff. */
export function releaseRetainedAccountConnection():void {
 const owner=(window as unknown as Record<symbol,Owner|undefined>)[ownerKey],retained=owner?.retainedAccounts;
 if(!owner||!retained)return;
 delete owner.retainedAccounts;
 if(retained.nativeBinding!==owner.nativeBinding)retireDocumentBinding(retained.nativeBinding);
 retained.dispose();
}
