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
interface Owner {version:string;identity?:string|undefined;nativeBinding?:string|undefined;pending?:boolean;dispose():void}
/** Legacy bundles call the public dispose before assigning. Expose a no-op facade to them. */
export async function replaceDocumentConnection(create:()=>{dispose():void},before:()=>Promise<void>=async()=>{},identity?:string,verifiedReplacement=false,nativeBinding?:string):Promise<boolean> {
 const globals=window as unknown as Record<symbol,any>,privateKey=Symbol.for('code-codex:document-connection-owner:v2'),legacyKey=Symbol.for('code-codex:application-connection:v1');
 const prior=globals[privateKey] as Owner|undefined;if(prior&&(!acceptable(version(),prior.version)||(prior.pending&&!(verifiedReplacement&&prior.version!==version()))||(identity!==undefined&&prior.identity===identity)))return false;
 const previous=prior??globals[legacyKey],claim:Owner={version:version(),identity,nativeBinding,pending:true,dispose:()=>previous?.dispose()};globals[privateKey]=claim;
 const facade={dispose(){}};Object.defineProperty(window,legacyKey,{configurable:true,get:()=>facade,set:()=>{}});
 try{await before();if(globals[privateKey]!==claim)return false;const connection=create();previous?.dispose();claim.dispose=()=>connection.dispose();claim.pending=false;return true;}
 catch(error){if(globals[privateKey]===claim){if(prior)globals[privateKey]=prior;else delete globals[privateKey];}throw error;}
}
