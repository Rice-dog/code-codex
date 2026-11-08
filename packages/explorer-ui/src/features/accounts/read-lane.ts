/** Bounded read observations. Cancellation retires local observation, never replays work. */
export function waitForAccount<T>(job:Promise<T>,timeoutMs:number,code:string,signal?:AbortSignal):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let settled=false;
  const finish=(error:unknown,value?:T)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)reject(error);else resolve(value as T);};
  const cancel=()=>finish(Error('ACCOUNT_OBSERVATION_CANCELLED: The owning account operation ended. No task was sent.'));
  const timer=setTimeout(()=>finish(Error(code+': Account observation exceeded its deadline. Idle or sign-in expiration was not inferred.')),timeoutMs);
  job.then(value=>finish(undefined,value),error=>finish(error));
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 });
}
/** One flight per read key and service generation. No completed-value caching. */
export class AccountReadLane {
 #pending=new Map<string,Promise<unknown>>();#abort=new AbortController();#generation=0;
 read<T>(key:string,run:()=>Promise<T>,timeoutMs:number,code:string):Promise<T>{
  const old=this.#pending.get(key);if(old)return old as Promise<T>;
  const generation=this.#generation;
  const work=Promise.resolve().then(()=>{if(generation!==this.#generation)throw Error('ACCOUNT_OBSERVATION_STALE: The native observation owner changed.');return run();});
  const job=waitForAccount(work,timeoutMs,code,this.#abort.signal).then(value=>{if(generation!==this.#generation)throw Error('ACCOUNT_OBSERVATION_STALE: The native observation owner changed.');return value;});
  this.#pending.set(key,job);void job.finally(()=>{if(this.#pending.get(key)===job)this.#pending.delete(key);}).catch(()=>{});return job;
 }
 reset():void{this.#generation++;this.#abort.abort();this.#abort=new AbortController();this.#pending.clear();}
}
