import '../core/localization/runtime';
import { installInjector } from '../inject';
import { ExplorerBridge,getBootstrapConfig } from '../bridge';
import { initializeRendererStorage } from '../renderer-storage';
import {connectAccounts,requestAccounts,suspendAccounts} from '../host/bridge/accounts';
import { connectApplicationMenu } from '../host/bridge/application-menu';
import {replaceDocumentConnection} from '../core/document-capability-owner';
import {retireLegacyAccountAdapter} from '../features/accounts/legacy-handoff';
import {installSessionGuard,suspendSessionGuard} from '../features/accounts/session-guard';
import {MULTI_ACCOUNT_AVAILABLE} from '../core/configuration/optional-features';
import {discoverSharedDispatcher} from '../../../../resources/account-host-capabilities.js';
import {runtimeEvent} from '../runtime-events';

/** Composition owns startup ordering. Preference failures must not hide recovery UI. */
export function startApplication(): void {
  const key=Symbol.for('code-codex:application-startup:v1'),globals=window as unknown as Record<symbol,{version:string;cancel():void}>;
  const prior=globals[key],version=__CODE_CODEX_VERSION__;
  if(prior){const a=prior.version.split('.').map(Number),b=version.split('.').map(Number);let comparison=0;for(let i=0;i<3;i++){if(a[i]!==b[i]){comparison=a[i]!>b[i]!?1:-1;break;}}if(comparison>0)return;prior.cancel();}
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;globals[key]={version,cancel(){cancelled=true;clearTimeout(timer);}};
  const attempt=async(count:number):Promise<void>=>{
    if(cancelled)return;
    try{if(await startOwnedApplication(()=>!cancelled))return;}
    catch(error){const value=(error as {code?:unknown})?.code,code=typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,63}$/.test(value)?value:String(error).match(/ACCOUNT_[A-Z_]+/)?.[0];const waiting=code==='ACCOUNT_UPGRADE_ACTIVE'||code==='ACCOUNT_HANDOFF_YIELDED';runtimeEvent('startup','document handoff','deferred',{code:'CC-START-ACCOUNTS-UPGRADE-001',errorCode:code,attempt:count,retryMs:3000,reason:String(error),endpointAvailable:waiting,taskSent:false});if(!waiting)console.warn('CC-START-ACCOUNTS-UPGRADE-001: Activation is waiting for a verified connection and idle account runtime.',error);}
    if(!cancelled)timer=setTimeout(()=>void attempt(count+1),3000);
  };
  void attempt(1);
}
async function startOwnedApplication(current:()=>boolean): Promise<boolean> {
  const bootstrap=getBootstrapConfig();
  if(!bootstrap.token) {
    installInjector();
    return true;
  }
  // Document-scoped commands must survive dismissal/disposal of the file tree.
  // Replace the previous composition connection on hot activation, never on hover.
  const storageBridge=new ExplorerBridge(bootstrap.token!,bootstrap.binding,bootstrap.receiver,12_000,false);
  let acquiredAccountOwner:string|undefined,candidateReleaseAttempted=false;
  try{
    // A surviving JS binding/DOM version is not a live native service. Probe the
    // candidate transport before retiring the previous connection or its tasks.
    await storageBridge.request('explorer.language.get',{},5000);
    if(!current()){storageBridge.dispose();return true;}
    const recovery=async<T>(params:Record<string,unknown>):Promise<T>=>{
      const result=await storageBridge.request<T>('explorer.accounts.request',params,55_000);
      if(params.action==='info'){const owner=(result as {owner?:{id?:unknown}})?.owner?.id;if(typeof owner==='string')acquiredAccountOwner=owner;}
      return result;
    };
    if(!await replaceDocumentConnection(()=>({dispose:()=>storageBridge.dispose()}),async()=>{
      await retireLegacyAccountAdapter(recovery,current);
      if(!MULTI_ACCOUNT_AVAILABLE&&acquiredAccountOwner){
        candidateReleaseAttempted=true;
        await recovery({action:'release',owner:acquiredAccountOwner});acquiredAccountOwner=undefined;
      }
      if(!current())throw Error('CC-START-HANDOFF-RETIRED: A newer activation owns startup.');
    },bootstrap.token,true,bootstrap.binding)){storageBridge.dispose();return false;}
  }catch(error){
    // A cancelled candidate can already own an idle lease after its recovery
    // probe. Release that exact candidate before discarding its only transport.
    if(acquiredAccountOwner&&!candidateReleaseAttempted){try{await storageBridge.request('explorer.accounts.request',{action:'release',owner:acquiredAccountOwner},55_000);runtimeEvent('accounts','account.handoff','candidate-released',{nativeBinding:bootstrap.binding,reason:'candidate-not-published',taskSent:false});}catch(cleanup){runtimeEvent('accounts','account.handoff','candidate-release-failed',{nativeBinding:bootstrap.binding,error:String(cleanup),taskSent:false});}}
    storageBridge.dispose();runtimeEvent('startup','document handoff','failed',{reason:String(error),previousConnectionRetained:true});throw error;
  }
  storageBridge.connectServices();
  connectApplicationMenu(storageBridge.request.bind(storageBridge));
  if(MULTI_ACCOUNT_AVAILABLE)connectAccounts(storageBridge.request.bind(storageBridge),bootstrap.binding);
  else {suspendSessionGuard();suspendAccounts();}
  // An available account runtime owns its explicit logout boundary. A suspended
  // feature leaves official logout untouched and does not discover account services.
  let guardTimer:ReturnType<typeof setTimeout>|undefined;
  try{if(MULTI_ACCOUNT_AVAILABLE){const dispatcher=await Promise.race([discoverSharedDispatcher(),new Promise<never>((_,reject)=>{guardTimer=setTimeout(()=>reject(Error('ACCOUNT_HOST_PROBE_TIMEOUT: Logout capability discovery exceeded five seconds.')),5000);})]);if(current())installSessionGuard(dispatcher,{owner:{id:'',label:''}},requestAccounts,()=>window.dispatchEvent(new Event('code-codex:account-session-ended')));}}
  catch(error){console.warn('CC-START-ACCOUNT-GUARD-001: The qualified account logout boundary could not be installed.',error);}
  finally{clearTimeout(guardTimer);}
  if(!bootstrap.centralizedStorage) { installInjector(); return true; }
  void initializeRendererStorage().then(() => {
    installInjector();
  },error => {
    console.warn('CC-START-STORAGE-001: Native preference restoration failed; mounting recovery interface.',error);
    installInjector();
  });
  return true;
}
