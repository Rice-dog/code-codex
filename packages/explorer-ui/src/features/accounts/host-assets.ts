import {dispatcherRole} from '../../../../../resources/account-host-capabilities.js';
import {rpcManagerService} from './rpc-observation';
type Native=Record<string,any>;
const release=(value:Native|undefined)=>{try{value?.[Symbol.dispose as unknown as string]?.();}catch{}};
/** One official request, using the same owned native manager as account operations. */
export async function hostAssetRequest(namespace:Native,method:string,params:Native,timeoutMs=method==='account/rateLimitResetCredit/consume'?12000:30000):Promise<unknown>{
 const service=rpcManagerService(namespace),mutation=method==='account/rateLimitResetCredit/consume';
 const timeout=()=>Error(mutation?'ACCOUNT_RESET_OUTCOME_UNKNOWN: Official reset confirmation timed out. No automatic retry is permitted.':'ACCOUNT_USAGE_TIMEOUT: The native quota read timed out. Sign-in expiration was not inferred.');
 if(typeof service?.open==='function'){
  let registry:Native|undefined,opened:Native|undefined,client:Native|undefined,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
  try{
   registry=service.dup();opened=registry!.open('local');
   const operation=(async()=>{
    const ready=await opened;
    if(ended)return;
    if(ready?.status!=='ready'||typeof ready.manager?.sendRequest!=='function')throw Error('ACCOUNT_USAGE_HOST: The native account backend is not ready. No request was sent.');
    client=ready.manager.dup();
    try{return await client!.sendRequest(method,params,{timeoutMs});}
    catch(error){if(!mutation)throw error;throw Error('ACCOUNT_RESET_FAILED: stage=official-response; rpcCode='+String(Number.isSafeInteger((error as Native)?.code)?(error as Native).code:'unknown')+'; reset outcome was not confirmed. Verify before another attempt.');}
   })();
   return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(timeout()),timeoutMs);})]);
  }finally{ended=true;clearTimeout(timer);release(client);release(opened);release(registry);}
 }
 // Legacy hosts expose only the qualified dispatcher. Never fall back after dispatch.
 const dispatcher=dispatcherRole(namespace).value;
 if(typeof dispatcher?.subscribe!=='function'||typeof dispatcher.dispatchMessage!=='function')throw Error('ACCOUNT_USAGE_HOST: The qualified quota capability is unavailable.');
 const id='code-codex-quota-'+crypto.randomUUID();
 return await new Promise((resolve,reject)=>{
  let unsubscribe:(()=>void)|undefined;
  const finish=()=>{clearTimeout(timer);unsubscribe?.();};
  const timer=setTimeout(()=>{finish();reject(timeout());},timeoutMs);
  unsubscribe=dispatcher.subscribe('mcp-response',(event:Native)=>{if(event.message?.id!==id)return;finish();if(event.message.error)reject(Error(mutation?'ACCOUNT_RESET_FAILED: stage=official-response; rpcCode='+String(Number.isSafeInteger(event.message.error.code)?event.message.error.code:'unknown')+'; reset outcome was not confirmed. Verify before another attempt.':'ACCOUNT_USAGE_UNAVAILABLE: The official quota read failed.'));else resolve(event.message.result);});
  try{dispatcher.dispatchMessage('mcp-request',{hostId:'local',request:{id,method,params},priority:'interactive',timeoutMs});}catch(error){finish();reject(mutation?Error('ACCOUNT_RESET_OUTCOME_UNKNOWN: Official delivery was not confirmed. No automatic retry is permitted.'):error);}
 });
}
