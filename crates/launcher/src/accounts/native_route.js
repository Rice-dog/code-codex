(async()=>{
 const params=__PARAMS__,profile=__PROFILE__;
 // Keep the official provider on existing official conversations. The relay
 // selects the API destination, credential and model independently.
 let originalProvider;
 const provider=api=>api&&originalProvider==='code_codex_api'?'code_codex_api':'openai';
 const configuration=(baseUrl,api)=>{
  const modelProvider=provider(api);
  const config={thread_unload_delay_secs:0,model_provider:modelProvider};
  if(baseUrl)config.features={enable_request_compression:false};
  if(api)config.model=api.model;
  if(modelProvider==='code_codex_api'){
   config.model_providers={code_codex_api:{name:'Code-Codex API',base_url:baseUrl,wire_api:'responses',requires_openai_auth:false,supports_websockets:false,request_max_retries:0,stream_max_retries:0}};
  }else if(baseUrl){
   config.openai_base_url=baseUrl;
  }
  return config;
 };
 const resumeParams=(id,baseUrl,api)=>({threadId:id,excludeTurns:true,cwd:before.cwd,modelProvider:provider(api),...(api?{model:api.model}:{}),config:configuration(baseUrl,api)});
 const deadline=createAccountHostDeadline(params.mode==='switch'?95000:45000);let mutationUnknown=false;
 const read=run=>deadline.call(run),mutate=run=>deadline.call(run,{timeoutMs:12000,code:'ACCOUNT_NATIVE_RECOVERY_PENDING',onUnknown:()=>{mutationUnknown=true;}});
 const namespace=await read(()=>profile.shared.includes("#cc-host=")?loadHostNamespace(profile.shared):import(profile.shared)),matches=new Set();
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
 let phase='native-route-open',switched=false,resumeOutcome='not-requested',pendingPin,previous,subscriptionTouched=false,before,settings,permissions;
 const step=(name,details={})=>{phase=name;if(timeline.length<24)timeline.push({stage:name,elapsedMs:Math.round(performance.now()-started),...details});};
 const loaded=async id=>{
  let cursor;const seen=new Set();
  for(let page=0;page<64;page++){
   const value=await read(()=>manager.sendRequest('thread/loaded/list',{limit:256,...(cursor?{cursor}:{})},{timeoutMs:8000}));
   if(!Array.isArray(value?.data)||value.data.some(v=>typeof v!=='string')||value.nextCursor!=null&&typeof value.nextCursor!=='string')throw Error('ACCOUNT_NATIVE_LOADED_PROTOCOL');
   if(value.data.includes(id))return true;
   if(!value.nextCursor)return false;
   if(seen.has(value.nextCursor))throw Error('ACCOUNT_NATIVE_LOADED_CURSOR');
   seen.add(value.nextCursor);cursor=value.nextCursor;
  }
  throw Error('ACCOUNT_NATIVE_LOADED_BOUND');
 };
 // The host removes a closing actor from loaded/list before it permits a new
 // resume. Only its explicit close-in-progress rejection proves non-acceptance.
 const closing=error=>/\bis closing; retry thread\/resume after the thread is closed\b/i.test(String(error?.message??error));
 const rpcErrorCode=error=>{const code=error?.code??error?.error?.code;return Number.isInteger(code)&&code>=-32768&&code<=-32000?code:null;};
 const resume=async(id,baseUrl,api,recovering=false)=>{
  const deadline=performance.now()+6000;
  for(let attempt=1;;attempt++){
   if(!recovering)resumeOutcome='unverified';
   try{
    const value=await mutate(()=>manager.sendRequest('thread/resume',resumeParams(id,baseUrl,api),{timeoutMs:12000}));
    if(!recovering){switched=true;resumeOutcome='accepted';}
    return value;
   }catch(error){
    if(!closing(error)){
     if(!recovering&&[-32600,-32601,-32602].includes(rpcErrorCode(error)))resumeOutcome='failed';
     throw error;
    }
    if(!recovering)resumeOutcome='closing';
    step(recovering?'native-route-original-closing':'native-route-resume-closing',{attempt,rejection:'thread-closing'});
    if(attempt>=13||performance.now()>=deadline)throw Error('ACCOUNT_NATIVE_THREAD_CLOSING');
    await new Promise(resolve=>setTimeout(resolve,Math.min(500,Math.max(0,deadline-performance.now()))));
    if((await read(()=>manager.getThreadExecutionState(id)))?.inProgress!==false)throw Error('ACCOUNT_TURN_ACTIVE');
    if(!recovering&&await loaded(id)){
     resumeOutcome='unverified';
     throw Error('ACCOUNT_NATIVE_RESUME_RACE');
    }
   }
  }
 };
 const pinRoute=async(id,baseUrl,binding,api)=>{
  const pin=pendingPin={binding,baseUrl,api,manager:manager.dup(),valid:false,preparing:true,owned:[]};
  pin.owned.push(pin.manager);
  for(const acquire of [()=>manager.retainActiveConversation(id),()=>manager.subscribe({type:'thread',key:{hostId:'local',threadId:id},field:'resumeState',listener:value=>{if(!pin.preparing&&value!=='resumed')pin.valid=false;}})]){
   let pending;const ready=await deadline.call(()=>{pending=acquire();pin.owned.push(pending);return pending;},{onLate:lease=>lease?.[Symbol.dispose]?.()});const lease=ready.dup();pin.owned.push(lease);pin.owned.splice(pin.owned.indexOf(pending),1);pending[Symbol.dispose]?.();lease.onRpcBroken(()=>{pin.valid=false;});
  }
  pin.preparing=false;pin.valid=true;pins.set(id,pin);pendingPin=undefined;
 };
 const pathKey=v=>{if(typeof v!=='string')return '';if(v.startsWith(String.fromCharCode(92,92,63,92)))v=v.slice(4);return v.replaceAll(String.fromCharCode(92),'/').replace(/\/+$/,'').toLowerCase();};
 const verifyHistory=(resumed,id,api)=>{
  if(resumed?.thread?.id!==id)throw Error('ACCOUNT_NATIVE_THREAD_ID');
  if(pathKey(resumed.thread.path)!==pathKey(before.path))throw Error('ACCOUNT_NATIVE_HISTORY_PATH');
  if(pathKey(resumed.thread.cwd)!==pathKey(before.cwd))throw Error('ACCOUNT_WORKSPACE_CHANGED');
  if(resumed.modelProvider!==provider(api)||api&&resumed.model!==api.model)throw Error('ACCOUNT_NATIVE_PROVIDER');
 };
 const restoreView=async(resumed,id)=>{
  const roots=permissions?.runtimeWorkspaceRoots?.filter(v=>typeof v==='string')??[before.cwd];
  const result=await mutate(()=>manager.resumeConversation({conversationId:id,workspaceRoots:roots.length?roots:[before.cwd],model:resumed.model??null,reasoningEffort:resumed.reasoningEffort??null,serviceTier:resumed.serviceTier??null,collaborationMode:resumed.collaborationMode??null,preserveServerConfiguration:true}));
  if(result?.status&&result.status!=='ready')throw Error('ACCOUNT_NATIVE_VIEW_NOT_READY');
 };
 try{
  const update=await read(()=>{opened=service.open('local');return opened;});
  if(update.status!=='ready')throw Error('ACCOUNT_RPC_UNAVAILABLE');
  manager=update.manager.dup();
  const id=params.threadId,state=await read(()=>manager.getThreadExecutionState(id));
  if(typeof state?.inProgress!=='boolean')throw Error('ACCOUNT_RPC_STATE_UNKNOWN');
  if(params.mode==='state')return {inProgress:state.inProgress,activeTurnId:state.activeTurnId??null};
  previous=pins.get(id);
  let reusable=false;
  if(previous?.binding===params.binding&&previous.baseUrl===params.baseUrl&&JSON.stringify(previous.api??null)===JSON.stringify(params.api??null)&&previous.valid){
   try{const context=await read(()=>manager.getFollowUpContext(id));reusable=await read(()=>previous.manager.getHostId())==='local'&&context?.needsResume===false&&context?.resumeState==='resumed';}catch{previous.valid=false;}
  }
  if(params.mode==='check')return {ready:reusable,inProgress:state.inProgress,routed:!!previous?.baseUrl,recoveryPending:!!previous&&!previous.valid,diagnostics:{stage:'native-route-check',pinPresent:!!previous,pinValid:previous?.valid===true,bindingMatches:previous?.binding===params.binding,resumeVerified:reusable}};
  if(state.inProgress)throw Error('ACCOUNT_TURN_ACTIVE');
  step('native-route-metadata');
  before=(await read(()=>manager.sendRequest('thread/read',{threadId:id,includeTurns:false},{timeoutMs:8000}))).thread;
  originalProvider=before?.modelProvider;
  if(params.mode==='adopt'){
   if(previous||!params.baseUrl||before.modelProvider!==provider(params.api))throw Error('ACCOUNT_DRAFT_NATIVE_PROVIDER');
   const context=await read(()=>manager.getFollowUpContext(id));if(context?.needsResume!==false||context?.resumeState!=='resumed')throw Error('ACCOUNT_DRAFT_NATIVE_STATE');
   await pinRoute(id,params.baseUrl,params.binding,params.api);
   return {ready:true,routed:true,id,path:before.path,cwd:before.cwd,permissionsPreserved:true};
  }
  const metadata=await read(()=>manager.getCachedConversationMetadata(id));
  originalProvider??=metadata?.modelProvider;
  if(originalProvider&&!['openai','code_codex_api'].includes(originalProvider))throw Error('ACCOUNT_NATIVE_PROVIDER');
  if(reusable)return {ready:true,id,path:before.path,cwd:before.cwd,permissionsPreserved:true,reusedNativeExecution:true};
  permissions=await read(()=>manager.getCurrentPermissions(id));settings={threadId:id};
  for(const key of ['approvalPolicy','approvalsReviewer'])if(permissions?.[key]!=null)settings[key]=permissions[key];
  if(typeof permissions?.activePermissionProfile?.id==='string')settings.permissions=permissions.activePermissionProfile.id;
  else if(permissions?.sandboxPolicy)settings.sandboxPolicy=permissions.sandboxPolicy;
  const verify=await read(()=>manager.getThreadExecutionState(id));if(verify.inProgress!==false)throw Error('ACCOUNT_TURN_ACTIVE');
  // Keep the previous endpoint as recovery evidence until a cold resume succeeds.
  // unsubscribe removes a subscription; current official hosts retain the actor.
  release(previous);
  step('native-route-unsubscribe');
  subscriptionTouched=true;
  const unsubscribed=await mutate(()=>manager.sendRequest('thread/unsubscribe',{threadId:id},{timeoutMs:8000}));
  if(!['unsubscribed','notSubscribed','notLoaded'].includes(unsubscribed?.status))throw Error('ACCOUNT_NATIVE_UNSUBSCRIBE_PROTOCOL');
  // Official unsubscribe is idempotent, not an unload acknowledgement. A thread
  // loaded with the host default can retain its actor for a full minute.
  const waitMs=Math.max(50,Math.min(params.unloadTimeoutMs??70000,70000));
  step('native-route-unload',{unsubscribeStatus:unsubscribed.status,timeoutMs:waitMs});
  const deadline=performance.now()+waitMs;let checks=0;
  while(await loaded(id)){
   checks++;
   if(performance.now()>=deadline){step('native-route-unload',{loaded:true,checks});throw Error('ACCOUNT_NATIVE_UNLOAD_PENDING');}
   // Never turn an unsubscribe acknowledgement into proof of an unloaded actor.
   await new Promise(resolve=>setTimeout(resolve,Math.min(200,Math.max(0,deadline-performance.now()))));
  }
  step('native-route-unloaded',{loaded:false,checks});
  step('native-route-resume');
  const resumed=await resume(id,params.baseUrl,params.api);
  verifyHistory(resumed,id,params.api);
  step('native-route-permissions');
  if(Object.keys(settings).length>1){const {threadId:_,...patch}=settings;await mutate(()=>manager.updateThreadPermissions(id,patch));}
  step('native-route-cache');
  // Backend closed/resumed notifications and canonical reads remain native.
  // This does not replace the conversation store or inject assistant messages.
  await restoreView(resumed,id);
  const afterPermissions=await read(()=>manager.getCurrentPermissions(id));
  if(settings.permissions&&afterPermissions?.activePermissionProfile?.id!==settings.permissions)throw Error('ACCOUNT_PERMISSIONS_CHANGED');
  if(params.baseUrl)await pinRoute(id,params.baseUrl,params.binding,params.api);
  else pins.delete(id);
  step('native-route-verified',{coldResume:true,defaultEndpoint:!params.baseUrl});
  return {ready:true,id,path:before.path,resumedPath:resumed.thread.path,cwd:before.cwd,permissionsPreserved:true,diagnostics:{timeline,coldResume:true}};
 }catch(error){
  const failedStage=phase==='native-route-resume-closing'?'native-route-resume':phase;let originalSubscriptionRestored=false,subscriptionRecovery='not-required';
  // The actor is unchanged when unload wasn't confirmed. Reattach that same
  // endpoint, preserving its listener and identity; never claim the new target.
  if(!mutationUnknown&&subscriptionTouched&&!switched&&['not-requested','closing'].includes(resumeOutcome)&&before&&manager){
   try{
    step('native-route-preserve-original');
    if((await read(()=>manager.getThreadExecutionState(params.threadId)))?.inProgress!==false)throw Error('ACCOUNT_TURN_ACTIVE');
    const restored=await resume(params.threadId,previous?.baseUrl,previous?.api,true);
    verifyHistory(restored,params.threadId,previous?.api);
    await restoreView(restored,params.threadId);
    if(previous?.baseUrl)await pinRoute(params.threadId,previous.baseUrl,previous.binding,previous.api);
    else pins.delete(params.threadId);
    originalSubscriptionRestored=true;
    subscriptionRecovery='verified';
    step('native-route-original-subscription-restored',{defaultEndpoint:!previous?.baseUrl});
   }catch(recovery){subscriptionRecovery=String(recovery?.message??'Unknown restoration failure').match(/^ACCOUNT_[A-Z_]+$/)?.[0]??'ACCOUNT_NATIVE_RECOVERY_UNVERIFIED';step('native-route-original-subscription-unverified',{code:subscriptionRecovery});}
  }
  const reason=String(error?.message??'Unknown native route failure').replace(/https?:\/\/[^\s"']+/g,'<url>').replace(/Bearer\s+[^\s]+/gi,'Bearer <credential>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'<credential>').slice(0,512);
  const rpcCode=rpcErrorCode(error);
  return {failure:{code:mutationUnknown?'ACCOUNT_NATIVE_RECOVERY_PENDING':reason.match(/^ACCOUNT_[A-Z_]+$/)?.[0]??'ACCOUNT_NATIVE_ROUTE',stage:failedStage,switched,reason,rpcCode},diagnostics:{timeline,resumeOutcome,previousPinRetained:!!previous,subscriptionTouched,originalSubscriptionRestored,subscriptionRecovery,previousEndpointReleased:false}};
 }
 finally{deadline.dispose();release(pendingPin);manager?.[Symbol.dispose]();opened?.[Symbol.dispose]?.();service[Symbol.dispose]();}
})()
