(async()=>{
 const p=__PARAMS__,profile=__PROFILE__,slot=Symbol.for('code-codex:primary-login-observation:v1');
 if(p.mode==='observation'){const v=window[slot];return v?{operationId:v.operationId,loginId:v.loginId,finished:v.finished,success:v.success,expired:v.expired===true}:null;}
 const deadline=createAccountHostDeadline(18000);const read=run=>deadline.call(run,{code:'ACCOUNT_PRIMARY_OBSERVATION_TIMEOUT'});
 let stage='primary-manager',count=0,authorizationRequested=false,service,opened,manager;
 try{
 const namespace=await read(()=>profile.shared.includes("#cc-host=")?loadHostNamespace(profile.shared):import(profile.shared));
 const registry=rpcManagerService(namespace,['dup','open']);
 if(!registry)return {failure:{code:'ACCOUNT_PRIMARY_CAPABILITY',stage:'primary-manager'}};
 service=registry.dup();stage='manager-ready';
  const ready=await read(()=>{opened=service.open('local');return opened;});if(ready.status!=='ready')throw Error('ACCOUNT_RPC_UNAVAILABLE');manager=ready.manager.dup();
  if(p.mode==='cancel'){stage='authorization-cancel';const value=await manager.sendRequest('account/login/cancel',{loginId:p.loginId},{timeoutMs:8000});if(!['canceled','notFound'].includes(value?.status))throw Error('ACCOUNT_PRIMARY_CANCEL_PROTOCOL');const v=window[slot];if(v?.loginId===p.loginId)v.dispose();return value;}
  let cursor;const seen=new Set();
  for(let page=0;;page++){
   if(page>=64)throw Error('ACCOUNT_NATIVE_LOADED_BOUND');
   stage='idle-list';const list=await read(()=>manager.sendRequest('thread/loaded/list',{limit:256,...(cursor?{cursor}:{})},{timeoutMs:8000}));
   if(!Array.isArray(list?.data)||list.data.some(id=>typeof id!=='string')||list.nextCursor!=null&&typeof list.nextCursor!=='string')throw Error('ACCOUNT_NATIVE_LOADED_PROTOCOL');
   for(const id of list.data){stage='idle-thread';const state=await read(()=>manager.getThreadExecutionState(id));let active=state?.inProgress;if(typeof active!=='boolean'){const native=await read(()=>manager.sendRequest('thread/read',{threadId:id,includeTurns:false},{timeoutMs:8000}));const status=native?.thread?.status?.type;if(status==='idle')active=false;else if(status==='active')active=true;else throw Error('ACCOUNT_RPC_STATE_UNKNOWN');}if(active)throw Error('ACCOUNT_TURN_ACTIVE');count++;}
   if(!list.nextCursor)break;if(seen.has(list.nextCursor))throw Error('ACCOUNT_NATIVE_LOADED_CURSOR');seen.add(list.nextCursor);cursor=list.nextCursor;
  }
  if(p.mode==='check')return {idle:true,checkedThreads:count};
  throw Error('ACCOUNT_PRIMARY_PROTOCOL');
 }catch(error){return {failure:{code:String(error?.message??'').match(/^ACCOUNT_[A-Z_]+\b/)?.[0]??'ACCOUNT_PRIMARY_RPC',stage,checkedThreads:count,authorizationRequested,rpcCode:Number.isSafeInteger(error?.code)?error.code:null}};}
 finally{deadline.dispose();for(const capability of [manager,opened,service])try{capability?.[Symbol.dispose]?.();}catch{}}
})()
