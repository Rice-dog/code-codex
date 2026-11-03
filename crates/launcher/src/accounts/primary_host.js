(async()=>{
 const p=__PARAMS__,profile=__PROFILE__,namespace=await import(profile.shared),matches=new Set();
 for(const v of Object.values(namespace)){if(!v||typeof v!=='object')continue;const d=Object.getOwnPropertyDescriptors(v);if(d.appServerManagers?.value&&d.executionHosts?.value&&d.clientCoordination?.value&&d.appActions?.value)matches.add(d.appServerManagers.value);}
 if(matches.size!==1)return {failure:{code:'ACCOUNT_PRIMARY_CAPABILITY',stage:'primary-manager'}};
 const service=[...matches][0].dup();let opened,manager;
 try{
  opened=service.open('local');const ready=await opened;if(ready.status!=='ready')throw Error('ACCOUNT_RPC_UNAVAILABLE');manager=ready.manager.dup();
  const slot=Symbol.for('code-codex:primary-login-observation:v1');
  if(p.mode==='observation'){const v=window[slot];return v?{loginId:v.loginId,finished:v.finished,success:v.success}:null;}
  if(p.mode==='cancel'){const value=await manager.sendRequest('account/login/cancel',{loginId:p.loginId},{timeoutMs:8000});const v=window[slot];if(v?.loginId===p.loginId)v.dispose();return value;}
  let cursor;const seen=new Set();let count=0;
  for(let page=0;;page++){
   if(page>=64)throw Error('ACCOUNT_NATIVE_LOADED_BOUND');
   const list=await manager.sendRequest('thread/loaded/list',{limit:256,...(cursor?{cursor}:{})},{timeoutMs:8000});
   if(!Array.isArray(list?.data)||list.data.some(id=>typeof id!=='string')||list.nextCursor!=null&&typeof list.nextCursor!=='string')throw Error('ACCOUNT_NATIVE_LOADED_PROTOCOL');
   for(const id of list.data){const state=await manager.getThreadExecutionState(id);if(typeof state?.inProgress!=='boolean')throw Error('ACCOUNT_RPC_STATE_UNKNOWN');if(state.inProgress)throw Error('ACCOUNT_TURN_ACTIVE');count++;}
   if(!list.nextCursor)break;if(seen.has(list.nextCursor))throw Error('ACCOUNT_NATIVE_LOADED_CURSOR');seen.add(list.nextCursor);cursor=list.nextCursor;
  }
  if(p.mode==='check')return {idle:true,checkedThreads:count};
  if(p.mode!=='start')throw Error('ACCOUNT_PRIMARY_PROTOCOL');
  window[slot]?.dispose?.();
  const observation={loginId:'',finished:false,success:false,dispose(){clearTimeout(this.timer);this.lease?.[Symbol.dispose]?.();this.client?.[Symbol.dispose]?.();this.lease=undefined;this.client=undefined;},lease:undefined,client:manager.dup(),timer:undefined};
  window[slot]=observation;
  try{observation.lease=await manager.subscribe({type:'notification',key:{hostId:'local'},methods:['account/login/completed'],listener:message=>{if(message.params?.loginId!==observation.loginId)return;observation.finished=true;observation.success=message.params.success===true;observation.dispose();}});}catch{observation.dispose();throw Error('ACCOUNT_PRIMARY_OBSERVATION');}
  observation.timer=setTimeout(()=>observation.dispose(),300000);
  // Standard managed OAuth preserves official persistence and refresh behavior.
  let result;try{result=await manager.sendRequest('account/login/start',{type:'chatgpt',appBrand:'codex',useHostedLoginSuccessPage:false},{timeoutMs:8000});}catch(error){observation.dispose();throw error;}
  observation.loginId=result?.loginId??'';
  if(result?.type!=='chatgpt'||typeof result.loginId!=='string'||typeof result.authUrl!=='string'){observation.dispose();throw Error('ACCOUNT_PRIMARY_LOGIN_PROTOCOL');}
  return {loginId:result.loginId,authUrl:result.authUrl,checkedThreads:count};
 }catch(error){return {failure:{code:String(error?.message??'').match(/^ACCOUNT_[A-Z_]+$/)?.[0]??'ACCOUNT_PRIMARY_RPC',stage:'primary-official-auth'}};}
 finally{manager?.[Symbol.dispose]();opened?.[Symbol.dispose]?.();service[Symbol.dispose]();}
})()
