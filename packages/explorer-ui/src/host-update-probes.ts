import {inspectCollapsedTreePaint,inspectConversationTopPaint,inspectNativeSurfaceLayers,inspectSettingsPaint,inspectSplitLayout,inspectTreeTopAlignment,inspectWorkspaceBackingPaint,mountedExplorer,runBackgroundChecks,waitForUpdateMount} from './host-update-background';
import {AccountUsageStore,quotaRemaining} from './features/accounts/quota';
import {quotaElement,updateQuota} from './features/accounts/quota-view';
import {AccountContinuationCycle,apiContinuationSettings,continueAfterQuota,isQuotaExhausted} from './features/accounts/auto-continue';
// Separate, on-demand read-only entry. Never imported by the switch/send path.
import {qualifyHostModules,managerRole,dispatcherRole,rpcManagerService} from '../../../resources/account-host-capabilities.js';
import {codex26715Adapter,activePageElements,MAIN_SURFACE_SELECTOR} from './adapters/codex-26.715';
import {nativeFiberChain,pickerOf} from './features/accounts/native-model-menu';
import {capabilities as nativeQuotaCapabilities,composerQuotaSubscriptions} from './features/accounts/native-composer-quota';
import {inspectComposerBackdrop} from './native-composer-backdrop';
import {inspectSidePanelOpacity} from './native-side-panel-opacity';
import {welcomeSurfaceState} from './welcome-surface';
import {missingQuickTourTargets} from './quick-tour';
import {discoverCodexAppearanceAdapter,readCodexAppearanceTheme} from './host/appearance/appearance-actions';
import {BACKGROUND_PLUGIN_IDS,inspectAccountExecution,inspectAccountPanel,inspectClosedMenuIndicators,inspectMarketCards,inspectMenuActions,inspectTreeControl,inspectTreeShortcuts,inspectTreeTitlebarClearance,inspectTreeVersionControl} from './host-update-feature-inspection';
import {wrapOfficialUpdateService} from './official-update-service';
import {UpdatesController,type UpdatesControllerPorts} from './features/workspace/updates';
import {DEFAULT_STARTUP_TRANSITION_SETTINGS,settingsForStartupVideo,startupDefaultClip,startupPlaybackVideoId} from './startup-transition-settings';
import {clipFadeOpacity,moveTimelineBoundary,startupTimelineGeometry} from './startup-transition-timeline';
import {inspectConversationToolbar,inspectNavigationDestination,inspectSecondaryPaint,inspectSecondaryPaintCoverage,inspectToolbarPanelPaint} from './host-navigation-inspection';
import {AccountList} from './features/accounts/account-list';
import {ACCOUNT_UI_CHANGED,type AccountsInfo} from './features/accounts/contracts';
import {canRetainWorkspaceMount} from './host-update-mount';

const documentOwnerKey=Symbol.for('code-codex:document-connection-owner:v2');
function watchAccountHandoff():{settled:Promise<void>;dispose:()=>void}|undefined {
 const globals=window as unknown as Record<symbol,{retainedAccounts?:unknown}|undefined>;
 const original=globals[documentOwnerKey];
 if(!original?.retainedAccounts)return;
 const controller=new AbortController();
 let dispose:()=>void=()=>{};
 const settled=new Promise<void>(resolve=>{
  dispose=()=>{controller.abort();clearTimeout(timer);resolve();};
  const timer=setTimeout(dispose,4000);
  const changed=()=>{if(globals[documentOwnerKey]!==original||!original.retainedAccounts)dispose();};
  for(const name of [ACCOUNT_UI_CHANGED,'code-codex:accounts-connected','code-codex:account-handoff-committed'])
    window.addEventListener(name,changed,{signal:controller.signal});
  window.addEventListener('pagehide',dispose,{once:true,signal:controller.signal});
 });
 return {settled,dispose};
}

function inspectCachedAccountCards():Check[] {
 const runtime=(window as unknown as Record<symbol,{adapter?:{info?:AccountsInfo;usage?:AccountUsageStore}}|undefined>)[Symbol.for('code-codex:multi-account-runtime:v1')];
 const info=runtime?.adapter?.info;
 const observations=(observer:(kind:'identity'|'quota')=>{status:Check['status'];detail:string}):Check[]=>
  (['identity','quota'] as const).map(kind=>{
   const id='host.account-panel-'+kind;
   return {id:'isolated.'+id,evidenceFor:id,scope:'isolated-live-cache',...observer(kind)};
  });
 if(!info?.owner.id||!info.owner.label)
  return observations(()=>({status:'manual',detail:'No previously observed account identity is available for isolated card rendering.'}));
 const host=document.createElement('div');
 const shadow=host.attachShadow({mode:'open'});
 const panel=document.createElement('div');
 panel.className='accounts-panel';
 shadow.append(panel);
 const list=new AccountList(shadow,panel,()=>{throw Error('Compatibility account cards have no actions.');});
 try{
  list.render(info,false,runtime?.adapter?.usage);
  return observations(kind=>inspectAccountPanel(host,kind,true));
 } finally{list.dispose();}
}

function checkAccountRoutingContract():Check[] {
 const info={nativeRouting:true,selected:{fixture:'child'},nativeRoutes:{fixture:'child'}};
 const globals:Record<symbol,unknown>={
  [documentOwnerKey]:{nativeBinding:'new',retainedAccounts:{nativeBinding:'old'}},
  [Symbol.for('code-codex:accounts-capability:v1')]:{request:{runtimeIdentity:'old'}},
  [Symbol.for('code-codex:multi-account-runtime:v1')]:{enabled:true,adapter:{
   request:{runtimeIdentity:'new'},info,
   status:()=>({supported:true,active:true,conversationId:'fixture',sendBlocked:false}),
  }},
 };
 const retained=inspectAccountExecution(globals);
 globals[documentOwnerKey]={nativeBinding:'new'};
 globals[Symbol.for('code-codex:accounts-capability:v1')]={request:{runtimeIdentity:'new'}};
 const committed=inspectAccountExecution(globals);
 info.nativeRoutes.fixture='host';
 const stale=inspectAccountExecution(globals);
 return [
  {id:'isolated.host.account-execution-owner',evidenceFor:'host.account-execution-owner',scope:'controlled-production-regression',
   status:retained.owner.status==='manual'&&committed.owner.status==='passed'?'passed':'issue',
   detail:'The account owner probe distinguishes a retained executor from a committed endpoint.'},
  {id:'isolated.host.account-execution-route',evidenceFor:'host.account-execution-route',scope:'controlled-production-regression',
   status:committed.route.status==='passed'&&stale.route.status==='issue'?'passed':'issue',
   detail:'The route probe accepts a matching saved route and rejects a stale route that can still send.'},
 ];
}

export {inspectCollapsedTreePaint} from './host-update-background';

type Check={id:string;status:'passed'|'issue'|'manual';scope:string;detail:string;evidenceFor?:string};
export function inspectMarketScroll(root:Document):Pick<Check,'status'|'detail'> {
 const lists=Array.from(root.querySelectorAll<HTMLElement>('[data-code-codex-owned="true"]')).flatMap(h=>Array.from(h.shadowRoot?.querySelectorAll<HTMLElement>('.preview-market-list')??[])).filter(e=>!e.hidden&&e.getBoundingClientRect().height>0);
 if(!lists.length)return {status:'manual',detail:'Open Plugin Market to inspect its native scroll container; wheel, keyboard and scrollbar interaction need their separate scenario.'};
 const blocked=lists.some(e=>!['auto','scroll'].includes(getComputedStyle(e).overflowY));
 return {status:blocked?'issue':'passed',detail:blocked?'The mounted plugin list blocks native vertical scrolling.':'The mounted plugin list permits native vertical scrolling. This read-only check does not move it.'};
}
export async function probeHostUpdate(manifest:any, options?:{version:string;background:string[]}):Promise<{checks:Check[];documentVersion:string|null}>{
 const checks:Check[]=[];
 const add=(id:string,status:Check['status'],detail:string,scope='actual-host-read-only')=>checks.push({id,status,scope,detail});
 if(location.href!=='app://-/index.html')return {checks:[{id:'host.document',status:'manual',scope:'actual-host-read-only',detail:'The qualified official main document is not available.'}],documentVersion:null};
 const readiness = options ? waitForUpdateMount(options.version) : undefined;
 const accountHandoff=options ? watchAccountHandoff() : undefined;
 // Controlled regressions reuse production functions in private objects and
 // detached DOM, so future update checks execute the negative cases too.
 const assert=(v:unknown)=>{if(!v)throw Error('probe regression');};
 const refuses=(fn:()=>unknown)=>{try{fn();}catch{return true;}return false;};
 try{
  class Manager{getConversation(){}startTurn(){}getStreamRole(){}onNotification(){}onRequest(){}executeTurnStart(){}sendAppServerResponse(){}}
  const bus={subscribe(){throw Error('never subscribe');},dispatchMessage(){throw Error('never dispatch');}};
  assert(managerRole({a:Manager,alias:Manager}).value===Manager);assert(dispatcherRole({a:bus,alias:bus}).value===bus);
  class Other extends Manager{}assert(refuses(()=>managerRole({a:Manager,b:Other})));assert(refuses(()=>managerRole({a:class Missing{}})));
  let reads=0;assert(refuses(()=>dispatcherRole({a:{get subscribe(){reads++;return ()=>{};},dispatchMessage(){}}})));assert(reads===0);
  const service={dup(){throw Error('never acquire');},open(){throw Error('never open');},subscribe(){throw Error('never subscribe');}};
  const services={appServerManagers:service,executionHosts:{},clientCoordination:{},appActions:{}};
  assert(rpcManagerService({services,alias:services})===service);
  assert(refuses(()=>rpcManagerService({services,other:{...services,appServerManagers:{...service}}})));
  for(const version of ['unknown','1.0.0.0','99.9999.9999.0']){const p=await qualifyHostModules({version,initial:['./assets/app-initial-fixture.js'],shared:['./assets/app-shared-fixture.js']},async path=>path.includes('initial')?{a:Manager}:{a:bus});assert(p.compatibility==='capabilities');}
  add('regression.interfaces','passed','Executed production role alias, ambiguity, missing-method, getter exclusion and old/new/unknown-version fixtures without RPC.','controlled-production-regression');
 }catch{add('regression.interfaces','issue','A controlled production capability regression failed.','controlled-production-regression');}
 try{
  const root=document.createElement('div');root.innerHTML='<button data-app-shell-sidebar-trigger></button><div><aside class="app-shell-left-panel"></aside><main class="main-surface"></main></div>';
  assert(codex26715Adapter.qualifiesRenderer(root));assert(codex26715Adapter.supportsVersion('unknown'));
  root.querySelector('main')!.parentElement!.append(root.querySelector('main')!.cloneNode());assert(!codex26715Adapter.qualifiesRenderer(root));root.querySelectorAll('main').forEach(n=>n.remove());assert(!codex26715Adapter.qualifiesRenderer(root));
  root.innerHTML='<button data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><div data-app-shell-workspace="true"><aside class="app-shell-left-panel"></aside><div data-app-shell-active-page="true"><div class="contents"><main data-app-shell-main-surface="default" data-codex-history-swipe-page="true"></main></div></div></div></div>';
  assert(codex26715Adapter.qualifiesRenderer(root));
  root.querySelector('main')!.removeAttribute('data-codex-history-swipe-page');assert(!codex26715Adapter.qualifiesRenderer(root));
  const marker=(id:string)=>`<div data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:${id}"></div>`;
  for(const hidden of ['inert','aria-hidden="true"','inert aria-hidden="true"']){
   root.innerHTML=marker('thread_active')+`<div ${hidden}>`+marker('thread_hidden')+'</div>';
   assert(codex26715Adapter.activeThreadId(root)==='thread_active');
  }
  root.innerHTML=marker('thread_active')+marker('thread_other');assert(codex26715Adapter.activeThreadId(root)===null);
  add('regression.layout','passed','Executed production layout qualification and collapsed-sidebar thread identity positive/ambiguous fixtures on detached DOM.','controlled-production-regression');
 }catch{add('regression.layout','issue','A controlled production layout regression failed.','controlled-production-regression');}
 try{
  const picker={models:[],modelOptions:[],onSelectModel(){throw Error('never select');},onOpenChange(){throw Error('never open');}};
  assert((pickerOf([{memoizedProps:picker}]) as unknown)===picker);assert(refuses(()=>pickerOf([{memoizedProps:{...picker,modelOptions:null}}])));
  add('regression.models','passed','Executed production picker prop qualification with valid and missing-array fixtures; no callback was called.','controlled-production-regression');
 }catch{add('regression.models','issue','A controlled production model-picker regression failed.','controlled-production-regression');}
 // Exercise production decision logic with local values only; no account service exists here.
 try{
  const now=Date.now(),window=(usedPercent:number,windowDurationMins:number)=>({usedPercent,windowDurationMins,resetsAt:Math.floor(now/1000)+3600});
  const raw={rateLimits:{primary:window(25,300),secondary:window(60,10080)}};
  assert(quotaRemaining(raw,now).fiveHour===75&&quotaRemaining(raw,now).weekly===40);
  assert(quotaRemaining({},now).fiveHour===null);
  assert(quotaRemaining({rateLimits:{primary:window(100,300)}},now).fiveHour===0);
  assert(!isQuotaExhausted({status:'failed',error:{codexErrorInfo:'httpConnectionFailed'}}));
  assert(isQuotaExhausted({status:'failed',error:{codexErrorInfo:'usageLimitExceeded'}}));
  const first=new AccountContinuationCycle(['a','b','b','c'],'a'),second=new AccountContinuationCycle(['a','b'],'a');
  let reads=0,prepared=0,sent=0;
  const ports={current:()=>true,available:()=>true,quota:async()=>{reads++;return raw;},prepare:async()=>{prepared++;},resume:async()=>{sent++;},phase:()=>{},event:()=>{}};
  assert(await continueAfterQuota(first,ports)==='continued');assert(reads===1&&prepared===1&&sent===1);
  assert(second.next()==='b');first.cancel();assert(await continueAfterQuota(first,ports)==='cancelled');assert(sent===1);
  const cancelled=new AccountContinuationCycle(['a','b'],'a');
  assert(await continueAfterQuota(cancelled,{...ports,prepare:async()=>{cancelled.cancel();}})==='cancelled');assert(sent===1);
  add('regression.account-behavior','passed','Production quota unknown/zero/window mapping, terminal classification, independent cycles, one continuation and cancellation exercised with local ports only. Live routing/provider acceptance remain separate.','controlled-production-regression');
 }catch{add('regression.account-behavior','issue','A controlled quota/continuation behavior regression failed.','controlled-production-regression');}
 const controlled='controlled-production-regression';
 async function regression(id:string,detail:string,run:()=>unknown){
  try{await run();add(id,'passed',detail,controlled);}
  catch{add(id,'issue',detail+' The controlled scenario failed.',controlled);}
 }
 await regression('regression.tree-route-mount','The existing inline file tree keeps its slot during a conversation transition. Narrow and forced drawer modes, missing or ambiguous native rails, and retired mounts bypass retention.',()=>{
  const row=document.createElement('div');
  row.dataset.appShellWorkspaceRow='true';
  row.dataset.codeCodexOwned='true';
  row.style.cssText='position:fixed;left:-2000px;visibility:visible';
  const rail=document.createElement('aside');
  rail.className='app-shell-left-panel';
  const explorer=document.createElement('div');
  explorer.dataset.placement='inline';
  explorer.dataset.mountStrategy='known:workspace-row';
  row.append(rail,explorer);
  document.body.append(row);
  try{
   assert(canRetainWorkspaceMount(explorer,1200,false));
   assert(!canRetainWorkspaceMount(explorer,820,false)&&!canRetainWorkspaceMount(explorer,1200,true));
   const duplicate=rail.cloneNode() as HTMLElement;
   row.prepend(duplicate);
   assert(!canRetainWorkspaceMount(explorer,1200,false));
   duplicate.remove();
   rail.hidden=true;
   assert(!canRetainWorkspaceMount(explorer,1200,false));
   rail.remove();
   assert(!canRetainWorkspaceMount(explorer,1200,false));
  }finally{row.remove();}
  assert(!canRetainWorkspaceMount(explorer,1200,false));
 });
 await regression('regression.account-api-continuation','The production continuation preserves an allowed API model, uses its safe fallback, skips official quota on API, and does not rotate on throttling, disconnect or user cancellation.',async()=>{
  const api={model:'fallback',models:['fallback','allowed']};
  const matched=apiContinuationSettings({model:'allowed',effort:'high'},api);
  const fallback=apiContinuationSettings({model:'official',effort:'high'},api);
  assert(matched.model==='allowed'&&matched.effort==='high'&&fallback.model==='fallback'&&fallback.effort==='medium');
  assert(!isQuotaExhausted({status:'failed',error:{codexErrorInfo:{httpConnectionFailed:{httpStatusCode:429}}}}));
  assert(!isQuotaExhausted({status:'failed',error:{codexErrorInfo:'responseStreamDisconnected'}}));
  assert(!isQuotaExhausted({status:'interrupted',error:{codexErrorInfo:'usageLimitExceeded'}}));
  const cycle=new AccountContinuationCycle(['official','api'],'official');
  const steps:string[]=[];
  const ports={current:()=>true,available:()=>true,isApi:(id:string)=>id==='api',quota:async()=>{throw Error('never read official quota for API');},
   prepare:async(id:string)=>{steps.push('prepare:'+id);},resume:async(id:string)=>{steps.push('send:'+id);},phase:()=>{},event:()=>{}};
  assert(await continueAfterQuota(cycle,ports)==='continued');
  assert(await continueAfterQuota(cycle,ports)==='unavailable'&&steps.join(',')==='prepare:api,send:api');
 });
 await regression('regression.account-quota-card','Production read-only usage store and card: unobserved values, complete windows, decimal and zero quota, reset labels and disabled asset actions.',async()=>{
  const now=Date.now(),reset=Math.floor(now/1000)+3600;
  const raw={rateLimits:{primary:{usedPercent:100,windowDurationMins:300,resetsAt:reset},secondary:{usedPercent:2.5,windowDurationMins:10080,resetsAt:reset}}};
  const store=new AccountUsageStore(async()=>raw,()=>{},()=>now);
  const view=quotaElement('host',true);
  updateQuota(view,store);
  assert(view.dataset.quotaPhase==='unobserved'&&view.querySelector('.account-quota-value')?.textContent==='—');
  await store.observeRead('host',async()=>raw);
  updateQuota(view,store);
  assert(view.dataset.quotaPhase==='ready'&&[...view.querySelectorAll('.account-quota-value')].map(number=>number.textContent).join(',')==='0%,97.5%');
  assert(view.querySelectorAll('.account-quota-reset').length===2&&[...view.querySelectorAll('[data-account-asset]')].every(button=>button.getAttribute('aria-disabled')==='true'));
  store.dispose();
 });
 await regression('regression.official-update-handoff','Production official update wrapper: prepare precedes install, receiver and arguments survive, and failed preparation blocks native dispatch.',async()=>{
  const steps:string[]=[];
  const original={installUpdate(...args:unknown[]){assert(this===original&&args[0]==='fixture');steps.push('install');return 'handed-off';}};
  const service={appUpdates:original};
  const stop=wrapOfficialUpdateService(service,async()=>{steps.push('prepare');});
  assert(await service.appUpdates.installUpdate('fixture')==='handed-off'&&steps.join(',')==='prepare,install');
  stop();assert(service.appUpdates===original);
  const retire=wrapOfficialUpdateService(service,async()=>{throw Error('denied fixture');});
  await Promise.resolve(service.appUpdates.installUpdate('fixture')).then(()=>assert(false),(error:unknown)=>assert(String(error).includes('denied fixture')));
  retire();assert(steps.length===2);
 });
 const calls:string[]=[],feedback:string[]=[];
 const version=__CODE_CODEX_VERSION__,next=version.replace(/\d+$/,n=>String(Number(n)+1));
 const bridge={available:true,request:async(method:string,params:{latestVersion?:string})=>{
  calls.push(method);
  if(method==='explorer.update.install'){assert(params.latestVersion===next);return {latestVersion:next,launched:true,windowReady:false};}
  const startup=method==='explorer.update.startup',latestVersion=startup?version:next;
  return {currentVersion:version,latestVersion,status:startup?'upToDate':'updateAvailable',tagName:`v${latestVersion}`,releaseUrl:`https://github.com/Rice-dog/code-codex/releases/tag/v${latestVersion}`};
 }};
 const noop=()=>{},updatePopover=document.createElement('div');
 const host={bridge,connected:true,state:'ready',versionFeedback:{cancel:noop,show:(kind:string)=>feedback.push(kind)},
  actionNotice:document.createElement('div'),hideActionNotice:noop,renderStatus:noop,showActionNotice:noop,showActionProgress:noop,closePreviewMarket:noop,
  updateMessage:document.createElement('p'),updatePopover,statusCode:document.createElement('button'),
  updateInstallButton:document.createElement('button'),updateLaterButton:document.createElement('button')} as unknown as UpdatesControllerPorts;
 const controller=new UpdatesController(host,noop);
 await regression('regression.tree-version-startup','Production startup version check: one lookup and delivery to the version feedback renderer.',async()=>{
  await controller.checkStartupVersion();
  await controller.checkStartupVersion();
  assert(calls.join()==='explorer.update.startup'&&feedback.join()==='latest');
 });
 await regression('regression.tree-version-manual','Production manual version check: release lookup, confirmation and dismissal.',async()=>{
  await controller.checkForUpdates();
  assert(calls.at(-1)==='explorer.update.check'&&!updatePopover.hidden&&controller.updateCandidate?.latestVersion===next);
  controller.closeUpdateDialog(false);assert(updatePopover.hidden);
 });
 await regression('regression.tree-version-install','Production installer entry: selected version delivery and separate process-launch and visible-window outcomes.',async()=>{
  await controller.checkForUpdates();
  await controller.installUpdate();
  assert(calls.at(-1)==='explorer.update.install'&&updatePopover.hidden&&controller.updateCheckSummary.includes('has not been confirmed'));
 });
 const start={...DEFAULT_STARTUP_TRANSITION_SETTINGS,clipStart:2,clipEnd:10,playbackRate:2,fadePercent:25,selectedVideoId:'chosen'};
 await regression('regression.startup-video-selection','Production startup media profile: chosen source and short-clip defaults.',()=>{
  assert(startupPlaybackVideoId(start)==='chosen'&&settingsForStartupVideo(start,'short',3).clipEnd===3&&startupDefaultClip(3).clipStart===0);
 });
 await regression('regression.startup-video-timeline','Production startup timeline: trim bounds, playback rate and fade at start, midpoint and end.',()=>{
  const geometry=startupTimelineGeometry(start,12);
  assert(geometry.clipPlaybackSeconds===4&&geometry.fadeMs===1000&&moveTimelineBoundary('start',99,start,12).clipStart===9.9);
  assert(clipFadeOpacity(2,2,10,geometry.fadeMs,2)===1&&clipFadeOpacity(9,2,10,geometry.fadeMs,2)===0.5&&clipFadeOpacity(10,2,10,geometry.fadeMs,2)===0);
 });
 // Qualify exactly the same interfaces used by production, without publishing
 // a profile, constructing managers, subscribing, reading accounts or sending RPC.
 let profile:any;
 const existing=(window as any)[Symbol.for('code-codex:account-host-profile:v1')];
 const observed=[existing?.initial?.split('#')[0],existing?.shared?.split('#')[0],...Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src],link[rel="modulepreload"][href]'),e=>e.getAttribute('src')??e.getAttribute('href')),...performance.getEntriesByType('resource').map(e=>e.name)];
 const loaded=new Set(observed.filter(Boolean).map(p=>{try{const u=new URL(p,location.href);return u.protocol===location.protocol&&u.host===location.host&&!u.search&&!u.hash?u.href:'';}catch{return '';}}));
 const load=async(path:string)=>{if(!loaded.has(new URL(path,location.href).href))throw Error('HOST_UPDATE_MODULE_NOT_LOADED');return import(/* @vite-ignore */path);};
 try{profile=await qualifyHostModules(manifest,load);add('host.interfaces','passed',profile.managerExport?'The loaded conversation-manager and dispatcher contracts qualified.':'The loaded native RPC manager service and dispatcher contracts qualified.');}
 catch(error:any){
  const issue=error?.stage==='role-selection';
  const role=['conversation-manager','dispatcher','rpc-manager-service'].includes(error?.capability)?error.capability:'unknown';
  add('host.interfaces',issue?'issue':'manual',issue?`The initialized role ${role} did not qualify (matches: ${Number.isInteger(error?.matches)?error.matches:'unknown'}).`:'Official module qualification could not complete in this document. Recheck after the native page is ready.');
 }
 await readiness;
 const mains=activePageElements(document,MAIN_SURFACE_SELECTOR);
 add('host.layout',mains.length===0?'manual':codex26715Adapter.qualifiesRenderer(document)?'passed':'issue',mains.length===0?'No native workspace is mounted; check an existing conversation and New Chat.':'Production workspace qualification checked active-page ownership, native rail and main surface.');
 const explorer = mountedExplorer();
 const marketCards = inspectMarketCards(explorer);
 add('host.plugin-backgrounds',...marketCards(...BACKGROUND_PLUGIN_IDS));
 add('host.plugin-codex-startup-transition',...marketCards('codex-startup-transition'));
 add('host.plugin-surface-opacity',...marketCards('surface-opacity'));
 add('host.plugin-transparent-background',...marketCards('transparent-background'));
 add('host.plugin-markdown-preview',...marketCards('markdown-preview'));
 add('host.plugin-csv-preview',...marketCards('csv-preview'));
 add('host.plugin-diagram-preview',...marketCards('diagram-preview'));
 add('host.plugin-image-preview',...marketCards('image-preview'));
 add('host.plugin-video-preview',...marketCards('video-preview'));
 add('host.plugin-pdf-preview',...marketCards('pdf-preview'));
 add('host.plugin-audio-preview',...marketCards('audio-preview'));
 add('host.plugin-office-preview',...marketCards('office-preview'));
 add('host.plugin-notebook-preview',...marketCards('notebook-preview'));
 add('host.plugin-model-preview',...marketCards('model-preview'));
 add('host.plugin-git-history',...marketCards('git-history'));
 add('host.plugin-multi-account',...marketCards('multi-account'));
 add('host.plugin-lan-remote',...marketCards('lan-remote'));
 const conversationTop = inspectConversationTopPaint(document);
 add('host.conversation-top-paint',conversationTop.status,conversationTop.detail);
 const [pageFrame,changeCard] = inspectNativeSurfaceLayers(document,mains.length===1?mains[0]:undefined);
 add('host.page-frame-paint',pageFrame.status,pageFrame.detail);
 add('host.turn-change-paint',changeCard.status,changeCard.detail);
 const topAlignment = inspectTreeTopAlignment(explorer);
 add('host.tree-top-alignment',topAlignment.status,topAlignment.detail);
 const fields=({status,detail}:Pick<Check,'status'|'detail'>)=>[status,detail] as const;
 add('host.nav-home',...fields(inspectNavigationDestination(document,'home')));
 add('host.nav-space',...fields(inspectNavigationDestination(document,'space')));
 add('host.nav-scheduled',...fields(inspectNavigationDestination(document,'automations')));
 add('host.nav-plugins',...fields(inspectNavigationDestination(document,'customize')));
 add('host.nav-explore',...fields(inspectNavigationDestination(document,'explore')));
 add('host.nav-code-review',...fields(inspectNavigationDestination(document,'pull-requests')));
 add('host.nav-sites',...fields(inspectNavigationDestination(document,'sites')));
 add('host.nav-page-header',...fields(inspectSecondaryPaint(document,'header')));
 add('host.nav-page-edge',...fields(inspectSecondaryPaint(document,'edge')));
 add('host.nav-page-content',...fields(inspectSecondaryPaint(document,'content')));
 add('host.nav-region-paint',...fields(inspectSecondaryPaintCoverage(document)));
 const toolbar=inspectConversationToolbar(document);
 add('host.toolbar-share',...fields(toolbar('share')));
 add('host.toolbar-summary',...fields(toolbar('summary')));
 add('host.toolbar-tabs',...fields(toolbar('tabs')));
 add('host.toolbar-share-paint',...fields(toolbar('share',true)));
 add('host.toolbar-summary-paint',...fields(inspectToolbarPanelPaint(document,'summary')));
 add('host.toolbar-tabs-paint',...fields(inspectToolbarPanelPaint(document,'tabs')));
 add('host.tree-titlebar-clearance',...fields(inspectTreeTitlebarClearance(document,explorer)));
 add('host.tree-version-control',...fields(inspectTreeVersionControl(explorer,options?.version)));
 add('host.tree-shortcuts',...fields(inspectTreeShortcuts(explorer)));
 add('host.tree-refresh',...fields(inspectTreeControl(explorer,'.masthead button.refresh','directory refresh')));
 add('host.tree-collapse',...fields(inspectTreeControl(explorer,'.masthead button.collapse','tree collapse')));
 add('host.tree-dismiss',...fields(inspectTreeControl(explorer,'.masthead button.disable','tree dismissal')));
 add('host.tree-filter',...fields(inspectTreeControl(explorer,'input.file-filter[aria-controls="cle-tree"]','loaded-file filter')));
 add('host.tree-edit',...fields(inspectTreeControl(explorer,'button.edit-mode-toggle[aria-pressed]','editing mode')));
 add('host.tree-resize',...fields(inspectTreeControl(explorer,'.resize-handle[role="separator"][aria-valuenow]','tree resize handle')));
 add('host.account-panel-actions',...fields(inspectAccountPanel(explorer,'actions')));
 add('host.account-panel-identity',...fields(inspectAccountPanel(explorer,'identity')));
 add('host.account-panel-quota',...fields(inspectAccountPanel(explorer,'quota')));
 const updateHandoff=(window as unknown as Record<symbol,unknown>)[Symbol.for('code-codex:official-update-handoff:v1')];
 add('host.official-update-hook',typeof updateHandoff==='function'?'passed':explorer&&mains.length?'issue':'manual',
   typeof updateHandoff==='function'?'The production official update service wrapper owns this document.':'The official update service wrapper was not observed in this document.');
 const workspaceBacking = inspectWorkspaceBackingPaint(document,mains.length===1?mains[0]:undefined,explorer);
 add('host.workspace-backing-paint',workspaceBacking.status,workspaceBacking.detail);
 const split = inspectSplitLayout(document);
 add('host.split-layout',split.status,split.detail);
 const menubar=document.querySelector('[role="menubar"]');
 const triggers=menubar?.querySelectorAll('button[id^="application-menu-trigger-"][id$="-menu"]');
 add('host.menu',!menubar?'manual':triggers?.length?'passed':'issue',!menubar?'The native menu bar is not mounted.':'Native menu triggers and their owning menubar were inspected without opening menus.');
 const menuActions = inspectMenuActions(document,!!explorer&&(triggers?.length??0)>=2);
 add('host.menu-actions',menuActions.status,menuActions.detail);
 add('host.menu-closed-indicators',...fields(inspectClosedMenuIndicators(document)));
 const menuItem=(id:string)=>fields(menuActions.items[id]??menuActions);
 add('menu.file-tree',...menuItem('file-tree'));
 add('menu.plugin-market',...menuItem('plugin-market'));
 add('menu.quick-tour',...menuItem('quick-tour'));
 add('menu.runtime-information',...menuItem('runtime-information'));
 add('menu.installation-folder',...menuItem('installation-folder'));
 add('menu.compatibility',...menuItem('compatibility'));
 add('menu.compatibility-report',...menuItem('compatibility-report'));
 add('menu.compatibility-recheck',...menuItem('compatibility-recheck'));
 add('menu.language',...menuItem('language'));
 add('menu.language-zh-CN',...menuItem('language-zh-CN'));
 add('menu.language-en',...menuItem('language-en'));
 add('menu.check-updates',...menuItem('check-updates'));
 add('menu.repository',...menuItem('repository'));
 add('menu.login-startup',...menuItem('login-startup'));
 add('menu.restart',...menuItem('restart'));
 add('menu.uninstall',...menuItem('uninstall'));
 const anchors=activePageElements<HTMLButtonElement>(document,'[data-codex-composer-root] button[data-composer-navigation-target="reasoning"]')
   .filter(anchor=>!anchor.closest('[inert],[aria-hidden="true"]')&&anchor.checkVisibility());
 if(profile?.contractRevision===2){
  try{
   const capability=await nativeQuotaCapabilities(profile.initial);
   if(anchors.length!==1)add('host.quota','manual','Quota modules qualified. A unique visible composer is required to verify mounted subscriptions.');
   else {
    const {found}=composerQuotaSubscriptions(anchors[0]!,capability);
    add('host.quota','passed',`The native composer has ${found.length} qualified quota subscriptions (${found.map(item=>item.gate).join(', ')}). No subscriptions were changed.`);
   }
  }catch(error){
   const stage=String(error).match(/stage=([a-z-]+)/)?.[1]??'module-import';
   const unavailable=anchors.length!==1&&['module-import','semantic-roles','quota-family'].includes(stage);
   add('host.quota',unavailable?'manual':'issue',unavailable
    ?'Quota role initialization was not established in this page. Recheck in a mounted native composer.'
    :`Production quota capability discovery rejected the native runtime at ${stage}. No subscriptions were changed.`);
  }
 }else add('host.quota','manual','The numbered native quota runtime is not initialized in this document. Check a mounted composer before judging compatibility.');
 const welcome = welcomeSurfaceState();
 const welcomeStatus = welcome === 'ready' ? 'passed' : welcome === 'unready' && anchors.length === 1 ? 'issue' : 'manual';
 add('host.welcome-surface', welcomeStatus, welcomeStatus === 'passed'
   ? 'The production welcome gate recognizes this mounted Codex workspace. No dialog or install state was changed.'
   : welcomeStatus === 'issue'
     ? 'A native home composer is mounted, but the production welcome gate did not recognize ready content.'
     : 'A visible, ready Codex home view is unavailable for the welcome gate check. First-install behavior remains separate.');
 const tourExplorer = explorer?.shadowRoot;
 if (tourExplorer && menubar && triggers?.length) {
  const missing = missingQuickTourTargets(tourExplorer);
  add('host.quick-tour-targets', missing.length ? 'issue' : 'passed', missing.length
   ? `Quick tour targets missing or ambiguous: ${missing.join(', ')}.`
   : 'Quick tour resolves both owned file-tree footer controls and the Code-Codex application menu; no actions were triggered.');
 } else {
  add('host.quick-tour-targets', 'manual', 'A mounted file tree and native menu bar are needed to verify quick tour target resolution.');
 }
 const roots=[...new Set(anchors.map(x=>x.closest('[data-codex-composer-root]')).filter(Boolean))];
 if(roots.length!==1){add('host.composer','manual','A unique mounted composer anchor was not available; check New Chat and an existing conversation separately.');add('host.models','manual','The native model picker is not mounted. Open its native menu, then recheck.');}
 else try{
  const anchor=anchors[0]!,chain=nativeFiberChain(anchor);
  const owners=chain.filter(f=>typeof f.type==='function'&&f.memoizedProps&&(f.memoizedProps.isResponseInProgress===undefined||typeof f.memoizedProps.isResponseInProgress==='boolean')&&(f.memoizedProps.submitDisabled===undefined||typeof f.memoizedProps.submitDisabled==='boolean')&&String(f.type).includes('handleSubmitLocal'));
  add('host.composer',owners.length===1?'passed':'issue','Mounted native composer owner and optional busy/disabled prop contracts were inspected. This does not certify quota projection or remote Send.');
  try{const picker=pickerOf(chain);add('host.models',Array.isArray(picker.models)?'passed':'issue','Production native model-picker prop discovery executed on the mounted owner. It did not select a model or alter the query cache.');}catch{add('host.models','manual','The native picker data component is not mounted until its menu opens. Open the native model menu, then recheck.');}
 }catch{add('host.composer','manual','The mounted anchor is not attached to a current native React owner. Check again in a native conversation.');add('host.models','manual','The mounted native React picker owner was unavailable.');}
 // Styles are read only. Settings and background transitions are separate
 // manual scenarios when those pages/modes are not mounted.
 const style=getComputedStyle(document.documentElement);
 add('host.theme',style.getPropertyValue('--color-text').trim()||style.getPropertyValue('--color-token-text-primary').trim()?'passed':'manual','Current native theme tokens were inspected; light/dark transitions and Settings pages still require their own scenarios.');
 if(!mains.length||!explorer){
  add('host.appearance-action','manual','A mounted official workspace and Code-Codex connection are required to read the Appearance preference.');
 }else try{
  await readCodexAppearanceTheme(await discoverCodexAppearanceAdapter(load));
  add('host.appearance-action','passed','The background controller’s production adapter read a recognized official Appearance preference. No setting was changed.');
 }catch(error){
  const unloaded=String(error).includes('HOST_UPDATE_MODULE_NOT_LOADED')||String(error).includes('stage=module-import');
  add('host.appearance-action',unloaded?'manual':'issue',unloaded?'An official Appearance module has not been observed in this document.':'The production background adapter could not read the official Appearance preference on the mounted workspace.');
 }
 const settings=inspectSettingsPaint(document);
 add('host.settings-paint',settings.status,settings.detail);
 const backdrop=inspectComposerBackdrop(document);
 add('host.composer-backdrop',backdrop.status,backdrop.detail);
 const sidePanel=inspectSidePanelOpacity(document);
 add('host.side-panel-paint',sidePanel.status,sidePanel.detail);
 const treeRail=inspectCollapsedTreePaint(document);
 add('host.tree-rail-paint',treeRail.status,treeRail.detail);
 const owner=(window as any)[Symbol.for('code-codex:document-connection-owner:v2')];
 const retired=(window as any)[Symbol.for('code-codex:retired-document-bindings:v1')];
 add('host.ownership',!owner||owner.pending?'manual':retired?.has?.(owner.nativeBinding)?'issue':'passed',!owner||owner.pending?'Document ownership has not completed in this page. Recheck when the file tree is ready.':'The current document owner is committed and its binding is not retired. No handoff was requested.');
 const marketScroll=inspectMarketScroll(document);
 add('host.market-scroll',marketScroll.status,marketScroll.detail);
 if(options){
  checks.push(...runBackgroundChecks(new Set(options.background),explorer));
  checks.push(...inspectCachedAccountCards(),...checkAccountRoutingContract());
 }
 let accountExecution=inspectAccountExecution(window as unknown as Record<symbol,unknown>);
 if(accountHandoff&&accountExecution.owner.status==='manual'){
  await accountHandoff.settled;
  accountExecution=inspectAccountExecution(window as unknown as Record<symbol,unknown>);
 }
 accountHandoff?.dispose();
 add('host.account-execution-owner',...fields(accountExecution.owner));
 add('host.account-execution-route',...fields(accountExecution.route));
 return {checks,documentVersion:manifest.version??null};
}
