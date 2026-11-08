// Each host script owns its deadline and pending observations. No global state.
function createAccountHostDeadline(budgetMs){
 const end=performance.now()+budgetMs,pending=new Set();let closed=false;
 return {
  call(run,{timeoutMs=8000,code='ACCOUNT_NATIVE_OBSERVATION_TIMEOUT',onUnknown,onLate}={}){
   const remaining=end-performance.now();if(closed||remaining<=0)return Promise.reject(Error(code));
   return new Promise((resolve,reject)=>{
    let settled=false,dispatched=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);pending.delete(cancel);error?reject(error):resolve(value);};
    const cancel=()=>finish(Error(code));
    const timer=setTimeout(()=>{if(dispatched)onUnknown?.();finish(Error(code));},Math.max(1,Math.min(timeoutMs,remaining)));
    pending.add(cancel);
    Promise.resolve().then(()=>{if(settled||closed||performance.now()>=end)throw Error(code);dispatched=true;return run();}).then(value=>{if(settled)onLate?.(value);else finish(null,value);},error=>finish(error));
   });
  },
  dispose(){closed=true;for(const cancel of [...pending])cancel();pending.clear();}
 };
}
