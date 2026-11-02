(async()=>{
 const namespace=await import(__HOST_SHARED__);const dispatcher=namespace[__HOST_DISPATCHER__];
 const started=Date.now(),deadline=started+8000,steps=[];let attempts=0;
 const reasons=new Map([
  ['workspace routing discovery failed','workspace-routing-discovery-failed'],
  ['workspace routing discovery timed out','workspace-routing-discovery-timeout'],
  ['Workspace routing is unavailable','workspace-routing-unavailable']
 ]);
 const failure=(code,reason,rpcCode=null)=>({failure:{code,reason,rpcCode,attempts,elapsedMs:Date.now()-started,steps}});
 const read=()=>new Promise(resolve=>{
  const id='code-codex-owner-'+crypto.randomUUID();let unsubscribe,done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);unsubscribe?.();resolve(value);};
  const timer=setTimeout(()=>finish({timeout:true}),Math.max(1,deadline-Date.now()));
  try{
   unsubscribe=dispatcher.subscribe('mcp-response',event=>{if(event.message?.id===id)finish({message:event.message});});
   dispatcher.dispatchMessage('mcp-request',{hostId:'local',request:{id,method:'account/read',params:{refreshToken:false}},priority:'interactive',timeoutMs:Math.max(1,deadline-Date.now())});
  }catch{finish({transport:true});}
 });
 for(;;){
  attempts++;const response=await read();
  if(response.timeout||Date.now()>deadline)return failure('ACCOUNT_HOST_TIMEOUT','official-read-timeout');
  if(response.transport)return failure('ACCOUNT_HOST_IDENTITY','official-read-transport');
  const message=response.message,error=message.error;
  if(error){
   const reason=reasons.get(error.message),rpcCode=Number.isSafeInteger(error.code)?error.code:null;
   // Only an explicit, known read failure may be retried. Timeouts and unknown
   // auth/protocol failures never refresh credentials or replay a turn.
   if(reason){
    steps.push({attempt:attempts,reason,rpcCode,elapsedMs:Date.now()-started});
    const delay=attempts===1?250:750;
    if(rpcCode===-32603&&attempts<3&&deadline-Date.now()>delay){await new Promise(resolve=>setTimeout(resolve,delay));continue;}
    return failure('ACCOUNT_WORKSPACE_ROUTING',reason,rpcCode);
   }
   return failure('ACCOUNT_HOST_IDENTITY','official-read-rejected',rpcCode);
  }
  const result=message.result;
  if(result?.account==null)return failure('ACCOUNT_SIGN_IN','official-account-missing');
  if(result.account.type!=='chatgpt')return failure('ACCOUNT_SIGN_IN','official-account-type');
  if(typeof result.account.email!=='string'||!result.account.email||result.account.email.length>=320)return failure('ACCOUNT_HOST_IDENTITY','official-account-schema');
  const workspace=result.workspaceRouting?.chatgptAccountId;
  if(workspace!=null&&(typeof workspace!=='string'||!workspace||workspace.length>=256))return failure('ACCOUNT_HOST_IDENTITY','official-routing-schema');
  return {email:result.account.email,plan:typeof result.account.planType==='string'&&/^[a-z][a-z0-9_-]{0,39}$/i.test(result.account.planType)?result.account.planType:null,workspace:workspace??null,observation:{attempts,elapsedMs:Date.now()-started,recovered:attempts>1,steps}};
 }
})()
