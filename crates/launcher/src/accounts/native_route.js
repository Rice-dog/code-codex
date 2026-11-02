(async()=>{
 const params=__PARAMS__,profile=__PROFILE__;
 const namespace=await import(profile.shared),matches=new Set();
 for(const value of Object.values(namespace)){
  if(!value||typeof value!=='object')continue;
  const d=Object.getOwnPropertyDescriptors(value);
  if(d.appServerManagers?.value&&d.executionHosts?.value&&d.clientCoordination?.value&&d.appActions?.value)matches.add(d.appServerManagers.value);
 }
 if(matches.size!==1)return {failure:{code:'ACCOUNT_RPC_SERVICE',stage:'native-route-service'}};
 const service=[...matches][0].dup();let manager,opened;
 const slot=Symbol.for('code-codex:native-account-pins:v1');
 const pins=window[slot]??(window[slot]=new Map());
 const release=pin=>{if(!pin)return;pin.valid=false;for(const value of pin.owned)try{value[Symbol.dispose]?.()}catch{}};
 const started=performance.now(),timeline=[];
 let phase='native-route-open',switched=false,pendingPin,previous,subscriptionRemoved=false;
 const step=(name,details={})=>{phase=name;if(timeline.length<24)timeline.push({stage:name,elapsedMs:Math.round(performance.now()-started),...details});};
 const loaded=async id=>{
  let cursor;const seen=new Set();
  for(let page=0;page<64;page++){
   const value=await manager.sendRequest('thread/loaded/list',{limit:256,...(cursor?{cursor}:{})});
   if(!Array.isArray(value?.data)||value.data.some(v=>typeof v!=='string')||value.nextCursor!=null&&typeof value.nextCursor!=='string')throw Error('ACCOUNT_NATIVE_LOADED_PROTOCOL');
   if(value.data.includes(id))return true;
   if(!value.nextCursor)return false;
   if(seen.has(value.nextCursor))throw Error('ACCOUNT_NATIVE_LOADED_CURSOR');
   seen.add(value.nextCursor);cursor=value.nextCursor;
  }
  throw Error('ACCOUNT_NATIVE_LOADED_BOUND');
 };
 const pinRoute=async(id,baseUrl,binding)=>{
  const pin=pendingPin={binding,baseUrl,manager:manager.dup(),valid:false,preparing:true,owned:[]};
  pin.owned.push(pin.manager);
  for(const pending of [manager.retainActiveConversation(id),manager.subscribe({type:'thread',key:{hostId:'local',threadId:id},field:'resumeState',listener:value=>{if(!pin.preparing&&value!=='resumed')pin.valid=false;}})]){
   const lease=(await pending).dup();pin.owned.push(lease);pending[Symbol.dispose]?.();lease.onRpcBroken(()=>{pin.valid=false;});
  }
  pin.preparing=false;pin.valid=true;pins.set(id,pin);pendingPin=undefined;
 };
 try{
  opened=service.open('local');const update=await opened;
  if(update.status!=='ready')throw Error('ACCOUNT_RPC_UNAVAILABLE');
  manager=update.manager.dup();
  const id=params.threadId,state=await manager.getThreadExecutionState(id);
  if(typeof state?.inProgress!=='boolean')throw Error('ACCOUNT_RPC_STATE_UNKNOWN');
  if(params.mode==='state')return {inProgress:state.inProgress,activeTurnId:state.activeTurnId??null};
  previous=pins.get(id);
  let reusable=false;
  if(previous?.binding===params.binding&&previous.baseUrl===params.baseUrl&&previous.valid){
   try{const context=await manager.getFollowUpContext(id);reusable=await previous.manager.getHostId()==='local'&&context?.needsResume===false&&context?.resumeState==='resumed';}catch{previous.valid=false;}
  }
  if(params.mode==='check')return {ready:reusable,inProgress:state.inProgress,routed:!!previous?.baseUrl,recoveryPending:!!previous&&!previous.valid,diagnostics:{stage:'native-route-check',pinPresent:!!previous,pinValid:previous?.valid===true,bindingMatches:previous?.binding===params.binding,resumeVerified:reusable}};
  if(state.inProgress)throw Error('ACCOUNT_TURN_ACTIVE');
  step('native-route-metadata');
  const before=(await manager.sendRequest('thread/read',{threadId:id,includeTurns:false})).thread;
  const metadata=await manager.getCachedConversationMetadata(id);
  if(metadata?.modelProvider&&metadata.modelProvider!=='openai')throw Error('ACCOUNT_NATIVE_PROVIDER');
  if(reusable)return {ready:true,id,path:before.path,cwd:before.cwd,permissionsPreserved:true,reusedNativeExecution:true};
  const permissions=await manager.getCurrentPermissions(id),settings={threadId:id};
  for(const key of ['approvalPolicy','approvalsReviewer'])if(permissions?.[key]!=null)settings[key]=permissions[key];
  if(typeof permissions?.activePermissionProfile?.id==='string')settings.permissions=permissions.activePermissionProfile.id;
  else if(permissions?.sandboxPolicy)settings.sandboxPolicy=permissions.sandboxPolicy;
  const verify=await manager.getThreadExecutionState(id);if(verify.inProgress!==false)throw Error('ACCOUNT_TURN_ACTIVE');
  // Keep the previous endpoint as recovery evidence until a cold resume succeeds.
  // unsubscribe removes a subscription; current official hosts retain the actor.
  release(previous);
  step('native-route-unsubscribe');
  const unsubscribed=await manager.sendRequest('thread/unsubscribe',{threadId:id});
  if(unsubscribed?.status!=='unsubscribed')throw Error('ACCOUNT_NATIVE_UNSUBSCRIBE');
  subscriptionRemoved=true;
  step('native-route-unload');
  const deadline=performance.now()+Math.max(50,Math.min(params.unloadTimeoutMs??8000,8000));let checks=0;
  while(await loaded(id)){
   checks++;
   if(performance.now()>=deadline){step('native-route-unload',{loaded:true,checks});throw Error('ACCOUNT_NATIVE_UNLOAD_PENDING');}
   // Never turn an unsubscribe acknowledgement into proof of an unloaded actor.
   await new Promise(resolve=>setTimeout(resolve,Math.min(200,Math.max(0,deadline-performance.now()))));
  }
  step('native-route-unloaded',{loaded:false,checks});
  switched=true;step('native-route-resume');
  const resumed=await manager.sendRequest('thread/resume',{threadId:id,excludeTurns:true,cwd:before.cwd,config:{thread_unload_delay_secs:0,...(params.baseUrl?{openai_base_url:params.baseUrl}:{})}});
  const pathKey=v=>{if(typeof v!=='string')return '';if(v.startsWith(String.fromCharCode(92,92,63,92)))v=v.slice(4);return v.replaceAll(String.fromCharCode(92),'/').replace(/\/+$/,'').toLowerCase();};
  if(resumed?.thread?.id!==id)throw Error('ACCOUNT_NATIVE_THREAD_ID');
  if(pathKey(resumed.thread.path)!==pathKey(before.path))throw Error('ACCOUNT_NATIVE_HISTORY_PATH');
  if(pathKey(resumed.thread.cwd)!==pathKey(before.cwd))throw Error('ACCOUNT_WORKSPACE_CHANGED');
  if(resumed.modelProvider!=='openai')throw Error('ACCOUNT_NATIVE_PROVIDER');
  step('native-route-permissions');
  if(Object.keys(settings).length>1){const {threadId:_,...patch}=settings;await manager.updateThreadPermissions(id,patch);}
  step('native-route-cache');
  // Backend closed/resumed notifications and canonical reads remain native.
  // This does not replace the conversation store or inject assistant messages.
  const roots=permissions?.runtimeWorkspaceRoots?.filter(v=>typeof v==='string')??[before.cwd];
  await manager.resumeConversation({conversationId:id,workspaceRoots:roots.length?roots:[before.cwd],model:resumed.model??null,reasoningEffort:resumed.reasoningEffort??null,serviceTier:resumed.serviceTier??null,collaborationMode:resumed.collaborationMode??null,preserveServerConfiguration:true});
  const afterPermissions=await manager.getCurrentPermissions(id);
  if(settings.permissions&&afterPermissions?.activePermissionProfile?.id!==settings.permissions)throw Error('ACCOUNT_PERMISSIONS_CHANGED');
  if(params.baseUrl)await pinRoute(id,params.baseUrl,params.binding);
  else pins.delete(id);
  step('native-route-verified',{coldResume:true,defaultEndpoint:!params.baseUrl});
  return {ready:true,id,path:before.path,resumedPath:resumed.thread.path,cwd:before.cwd,permissionsPreserved:true,diagnostics:{timeline,coldResume:true}};
 }catch(error){
  const failedStage=phase;let originalSubscriptionRestored=false;
  // The actor is unchanged when unload wasn't confirmed. Reattach that same
  // endpoint, preserving its listener and identity; never claim the new target.
  if(subscriptionRemoved&&!switched&&previous?.baseUrl&&manager){
   try{
    step('native-route-preserve-original');
    await manager.sendRequest('thread/resume',{threadId:params.threadId,excludeTurns:true,config:{openai_base_url:previous.baseUrl,thread_unload_delay_secs:0}});
    await pinRoute(params.threadId,previous.baseUrl,previous.binding);
    originalSubscriptionRestored=true;
   }catch{step('native-route-original-subscription-unverified');}
  }
  const reason=String(error?.message??'Unknown native route failure').replace(/https?:\/\/[^\s"']+/g,'<url>').replace(/Bearer\s+[^\s]+/gi,'Bearer <credential>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'<credential>').slice(0,512);
  return {failure:{code:reason.match(/^ACCOUNT_[A-Z_]+$/)?.[0]??'ACCOUNT_NATIVE_ROUTE',stage:failedStage,switched,reason},diagnostics:{timeline,previousPinRetained:!!previous,originalSubscriptionRestored,previousEndpointReleased:false}};
 }
 finally{release(pendingPin);manager?.[Symbol.dispose]();opened?.[Symbol.dispose]?.();service[Symbol.dispose]();}
})()
