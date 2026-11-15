import {unexpectedPaint} from './host-paint-inspection';
import {quotaRemaining} from './features/accounts/quota';
import {AccountContinuationCycle,continueAfterQuota,isQuotaExhausted} from './features/accounts/auto-continue';
// Separate, on-demand read-only entry. Never imported by the switch/send path.
import {qualifyHostModules,managerRole,dispatcherRole} from '../../../resources/account-host-capabilities.js';
import {codex26715Adapter,activePageElements,MAIN_SURFACE_SELECTOR} from './adapters/codex-26.715';
import {nativeFiberChain,pickerOf} from './features/accounts/native-model-menu';
import {capabilities as nativeQuotaCapabilities} from './features/accounts/native-composer-quota';
import {inspectComposerBackdrop} from './native-composer-backdrop';
import {inspectSidePanelOpacity} from './native-side-panel-opacity';

type Check={id:string;status:'passed'|'issue'|'manual';scope:string;detail:string};
export async function probeHostUpdate(manifest:any):Promise<{checks:Check[];documentVersion:string|null}>{
 const checks:Check[]=[];
 const add=(id:string,status:Check['status'],detail:string,scope='actual-host-read-only')=>checks.push({id,status,scope,detail});
 if(location.href!=='app://-/index.html')return {checks:[{id:'host.document',status:'manual',scope:'actual-host-read-only',detail:'The qualified official main document is not available.'}],documentVersion:null};
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
  for(const version of ['unknown','1.0.0.0','99.9999.9999.0']){const p=await qualifyHostModules({version,initial:['./assets/app-initial-fixture.js'],shared:['./assets/app-shared-fixture.js']},async path=>path.includes('initial')?{a:Manager}:{a:bus});assert(p.compatibility==='capabilities');}
  add('regression.interfaces','passed','Executed production role alias, ambiguity, missing-method, getter exclusion and old/new/unknown-version fixtures without RPC.','controlled-production-regression');
 }catch{add('regression.interfaces','issue','A controlled production capability regression failed.','controlled-production-regression');}
 try{
  const root=document.createElement('div');root.innerHTML='<button data-app-shell-sidebar-trigger></button><div><aside class="app-shell-left-panel"></aside><main class="main-surface"></main></div>';
  assert(codex26715Adapter.qualifiesRenderer(root));assert(codex26715Adapter.supportsVersion('unknown'));
  root.querySelector('main')!.parentElement!.append(root.querySelector('main')!.cloneNode());assert(!codex26715Adapter.qualifiesRenderer(root));root.querySelectorAll('main').forEach(n=>n.remove());assert(!codex26715Adapter.qualifiesRenderer(root));
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
 // Qualify exactly the same interfaces used by production, without publishing
 // a profile, constructing managers, subscribing, reading accounts or sending RPC.
 let profile:any;
 const existing=(window as any)[Symbol.for('code-codex:account-host-profile:v1')];
 const observed=[existing?.initial?.split('#')[0],existing?.shared?.split('#')[0],...Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'),s=>s.src),...performance.getEntriesByType('resource').map(e=>e.name)];
 const loaded=new Set(observed.filter(Boolean).map(p=>{try{const u=new URL(p,location.href);return u.protocol===location.protocol&&u.host===location.host?'.'+u.pathname:'';}catch{return '';}}));
 const load=async(path:string)=>{if(!loaded.has(path))throw Error('HOST_UPDATE_MODULE_NOT_LOADED');return import(/* @vite-ignore */path);};
 try{profile=await qualifyHostModules(manifest,load);add('host.interfaces','passed','Production module qualification accepted the loaded conversation-manager and dispatcher contracts. No RPC was sent.');}
 catch(error:any){const stage=error?.stage;add('host.interfaces',stage==='role-selection'?'issue':'manual',stage==='role-selection'?'The initialized official modules do not satisfy production role uniqueness/required methods.':'Official module qualification could not complete in this document. Recheck after the native page is ready.');}
 if(profile?.contractRevision===2){try{const c=await nativeQuotaCapabilities(profile.initial);add('host.quota','passed',`Production quota capability discovery accepted ${c.gates.length} gate references and the native refresh effect. No subscriptions were changed.`);}catch(error){const stage=String(error).match(/stage=([a-z-]+)/)?.[1];const unavailable=['semantic-roles','source-budget','module-budget'].includes(stage??'');add('host.quota',unavailable?'manual':'issue',unavailable?'Quota role initialization was not established in this page. Recheck in a mounted native composer.':'Production quota capability discovery rejected the initialized native runtime. No subscriptions were changed.');}}
 else add('host.quota','manual','The numbered native quota runtime is not initialized in this document. Check a mounted composer before judging compatibility.');
 const mains=activePageElements(document,MAIN_SURFACE_SELECTOR);
 add('host.layout',mains.length===0?'manual':codex26715Adapter.qualifiesRenderer(document)?'passed':'issue',mains.length===0?'No native workspace is mounted; check an existing conversation and New Chat.':'Production workspace qualification checked active-page ownership, native rail and main surface.');
 // Inspect only the active main viewport, never a cached page or side-chat frame.
 const split=mains.flatMap(main=>Array.from(main.querySelectorAll<HTMLElement>('[data-app-shell-workspace-layout="split"][data-app-shell-right-panel-full-width="false"]'))).filter(view=>view.getBoundingClientRect().width>0);
 const frames=split.flatMap(view=>Array.from(view.children).filter((child):child is HTMLElement=>child instanceof HTMLElement&&/MainContentFrame[-_]/.test(child.className)).map(frame=>({view,frame})));
 if(frames.length===1){
  const {view,frame}=frames[0]!,v=view.getBoundingClientRect(),f=frame.getBoundingClientRect();
  const fits=f.left>=v.left-1&&f.right<=v.right+1;
  add('host.split-layout',fits?'passed':'issue',`Mounted main split frame ${fits?'fits':'extends beyond'} its viewport; leftOverflow=${Math.max(0,v.left-f.left).toFixed(2)}px; rightOverflow=${Math.max(0,f.right-v.right).toFixed(2)}px. No panel was opened.`);
 }else add('host.split-layout','manual','A unique visible native split viewport/frame is not mounted. Open a right-side panel and recheck with the tree expanded and collapsed.');
 const menubar=document.querySelector('[role="menubar"]');
 const triggers=menubar?.querySelectorAll('button[id^="application-menu-trigger-"][id$="-menu"]');
 add('host.menu',!menubar?'manual':triggers?.length?'passed':'issue',!menubar?'The native menu bar is not mounted.':'Native menu triggers and their owning menubar were inspected without opening menus.');
 const anchors=activePageElements<HTMLElement>(document,'[data-codex-composer-root] button[data-composer-navigation-target="reasoning"]');
 const roots=[...new Set(anchors.map(x=>x.closest('[data-codex-composer-root]')).filter(Boolean))];
 if(roots.length!==1){add('host.composer','manual','A unique mounted composer anchor was not available; check New Chat and an existing conversation separately.');add('host.models','manual','The native model picker is not mounted. Open its native menu, then recheck.');}
 else try{
  const anchor=anchors[0]!,chain=nativeFiberChain(anchor);
  const owners=chain.filter(f=>typeof f.type==='function'&&f.memoizedProps&&(f.memoizedProps.isResponseInProgress===undefined||typeof f.memoizedProps.isResponseInProgress==='boolean')&&(f.memoizedProps.submitDisabled===undefined||typeof f.memoizedProps.submitDisabled==='boolean')&&String(f.type).includes('handleSubmitLocal'));
  add('host.composer',owners.length===1?'passed':'issue','Mounted native composer owner and optional busy/disabled prop contracts were inspected. This does not certify quota projection or remote Send.');
  try{const picker=pickerOf(chain);add('host.models',Array.isArray(picker.models)?'passed':'issue','Production native model-picker prop discovery executed on the mounted owner. It did not select a model or alter the query cache.');}catch{add('host.models','manual','The native picker data component is not mounted until its menu opens. Open the native model menu, then recheck.');}
 }catch{add('host.composer','manual','The mounted anchor is not attached to a current native React owner. Check again in a native conversation.');add('host.models','manual','The mounted native React picker owner was unavailable.');}
 const owner=(window as any)[Symbol.for('code-codex:document-connection-owner:v2')];
 const retired=(window as any)[Symbol.for('code-codex:retired-document-bindings:v1')];
 add('host.ownership',!owner||owner.pending?'manual':retired?.has?.(owner.nativeBinding)?'issue':'passed',!owner||owner.pending?'Document ownership has not completed in this page. Recheck when the file tree is ready.':'The current document owner is committed and its binding is not retired. No handoff was requested.');
 // Styles are read only. Settings and background transitions are separate
 // manual scenarios when those pages/modes are not mounted.
 const style=getComputedStyle(document.documentElement);
 add('host.theme',style.getPropertyValue('--color-text').trim()||style.getPropertyValue('--color-token-text-primary').trim()?'passed':'manual','Current native theme tokens were inspected; light/dark transitions and Settings pages still require their own scenarios.');
 const backgroundActive=['data-code-codex-particle-image-background','data-code-codex-glow-horizon-background'].some(a=>document.documentElement.hasAttribute(a));
 const settings=activePageElements<HTMLElement>(document,`${MAIN_SURFACE_SELECTOR} [data-app-shell-focus-area="main"] [class~="electron:bg-surface"][class*="rounded-tl-lg"]`).filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
 if(!backgroundActive||!settings.length)add('host.settings-paint','manual','Open a native Settings page with a supported background active to inspect its actual shell paint; controls and cards keep their own style contracts.');
 else {const painted=unexpectedPaint(settings);add('host.settings-paint',painted.length?'issue':'passed',painted.length?`Native Settings shell has unexpected paint: ${painted.join(' | ')}`:'Mounted native Settings shell and its generated layers are transparent. Other pages, themes and transitions remain separate scenarios.');}
 const backdrop=inspectComposerBackdrop(document);
 add('host.composer-backdrop',backdrop.status,backdrop.detail);
 const sidePanel=inspectSidePanelOpacity(document);
 add('host.side-panel-paint',sidePanel.status,sidePanel.detail);
 return {checks,documentVersion:manifest.version??null};
}
