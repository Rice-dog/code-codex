import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture} from './browser-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/native-composer-quota');
await mkdir(out,{recursive:true});
// An initialized semantic runtime, not a copied production predicate. Production
// capability discovery, mounted-fiber traversal, leases and Send run unchanged.
const runtime=`
const atoms=[{},{},{}];
const family=i=>({kind:'readable-family',scope:{id:'quota'+i},resolve:()=>({resolve:()=>atoms[i]})});
export const gates=[family(0),family(1),{cache:'cached',scope:{id:'quota2'},resolve:()=>atoms[2]}];
export {atoms};
export function runtime(){}
runtime.c={q:{exports:{h:gates[0],r:gates[1]}},s:{exports:{reset:gates[2]}},react:{exports:{}}};
runtime.m={q:function(){let z=0,h=(0,a.b)(x,(k,{get:g})=>g(q,k).hardBlocked),r=(0,a.b)(x,(k,{get:g})=>g(q,k).active);a.d(t,{h:h,r:r});return 'luna_reserve rate_limit_upsell';},s:function(){return 'authenticatedAccountId authLoading rate_limit?.allowed .windowMinutes=== .resetsAt===';},react:function(){function update(a,b,c,d){b.value=c,b.getSnapshot=d,changed(b)&&render(a)}}};
runtime.e=()=>{};runtime.C=()=>{};
`;
const fixture=`
import {NativeComposerQuota} from './features/accounts/native-composer-quota';
import {ComposerAccountSelector} from './features/accounts/composer-selector';
import {atoms,gates} from '/assets/123.fixture.js';
window.make=async(options={})=>{
 window.selector?.dispose();window.quota?.dispose();window.selector=undefined;window.quota=undefined;
 document.body.innerHTML='<main data-app-shell-active-page="true"><div data-codex-composer-root><textarea>preserved draft</textarea><span><button data-composer-navigation-target="reasoning">Model</button></span><button aria-label="Send message">Send</button></div></main>';
 const element=document.querySelector('[data-codex-composer-root]'),anchor=element.querySelector('[data-composer-navigation-target]'),send=element.querySelector('[aria-label="Send message"]');
 const conversationId=options.existing?'thread-A':null;
 window.state={active:true,supported:true,selected:'B',conversationId,busy:false,preparing:false,sendBlocked:false};
 window.native={permission:false,auth:false,busy:false,sent:0,prepared:0,reads:0,notices:[],effects:0};
 const connection={id:'B',label:'Connected',email:'child@example.test',...(options.api?{api:{model:'example-model',baseUrl:'https://example.test/v1'}}:{})};
 window.account={info:{owner:{id:'fixture-owner',label:'host@example.test'},profile:{initial:'./assets/123.fixture.js'},connections:[connection],nativeRoutes:conversationId?{[conversationId]:'B'}:{}},status:()=>state,apiChoice:()=>undefined,usage:{revision:0,remaining:()=>({fiveHour:options.exhausted?0:100,weekly:100}),creditAllowed:()=>false,resetTimes:()=>({fiveHour:null,weekly:null}),refresh:()=>{}},requiresSendPreparation:()=>true,prepareSend:async()=>{native.prepared++}};
 function Composer(){const handleSubmitLocal=()=>{};return handleSubmitLocal;}
 const props={submitDisabled:true,...(Object.hasOwn(options,'response')?{isResponseInProgress:options.response}:{})};
 const snapshots=atoms.map(()=>({getSnapshot:()=>true,subscribe:()=>{},prepare:()=>{}}));
 window.snapshots=snapshots;window.originals=snapshots.map(s=>s.getSnapshot);
 window.recompute=()=>{native.effects++;send.disabled=native.permission||native.auth||native.busy||snapshots.some(s=>s.getSnapshot());};
 const identity=options.identity??(conversationId?{placement:'main',kind:'local',conversationId}:{kind:'new',entrypoint:'home',routeConversationId:null,browserTabMentionConversationId:null});
 if(options.wrongIdentity)identity.conversationId='other';
 const composerNode={value:identity};
 const context=new Map([['composer',composerNode],...(options.alias?[['composerAlias',composerNode]]:[]),...(options.otherIdentity?[['otherComposer',{value:options.otherIdentity}]]:[]),...gates.map((g,i)=>[g.scope.id,{store:new Map([[atoms[i],true]])}])]);
 const hooks=snapshots.map((s,i)=>{const store=new Map([[atoms[i],true]]),derived={read:get=>get(atoms[i])};const mode=options.subscriptions==='mixed'?(i===0?'store':'holder'):options.subscriptions;return {memoizedState:[s,mode==='holder'?[{atom:derived,store},undefined]:mode==='store'?[store,derived]:[atoms[i]]]};});hooks.forEach((h,i)=>h.next=hooks[i+1]??null);
 function update(a,b,c,d){native.effects++;window.recompute();}
 const effects=snapshots.flatMap(s=>[{deps:[s.subscribe],create:()=>{}},{deps:null,create:update.bind(null)}]);effects.forEach((e,i)=>e.next=effects[(i+1)%effects.length]);
 const fiber={type:Composer,memoizedProps:props,dependencies:{firstContext:{memoizedValue:context}},memoizedState:hooks[0],updateQueue:{lastEffect:effects.at(-1)}};
 const host={stateNode:{},child:fiber};host.stateNode.current=host;fiber.return=host;
 const button={return:fiber};fiber.child=button;
 if(options.ambiguous){const duplicate={...fiber,return:host,child:fiber};host.child=duplicate;fiber.return=duplicate;}
 if(options.missing)fiber.type=function Unrelated(){};
 anchor.__reactFiber$fixture=button;element.__reactFiber$fixture=fiber;
 window.anchor=anchor;window.send=send;window.fiber=fiber;
 send.addEventListener('click',()=>{native.sent++});window.recompute();
 if(options.selector){window.selector=new ComposerAccountSelector(account,message=>native.notices.push(message));}
 else {window.quota=new NativeComposerQuota(account,()=>quota.update(anchor));quota.update(anchor);await quota.ready(true);}
 return true;
};
`;
await build({stdin:{contents:fixture,loader:'ts',resolveDir:resolve(root,'packages/explorer-ui/src')},bundle:true,format:'esm',external:['/assets/*'],outfile:resolve(out,'fixture.js')});
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url?.endsWith('.js')?'application/javascript':'text/html');res.end(req.url==='/assets/123.fixture.js'?runtime:req.url==='/fixture.js'?await readFile(resolve(out,'fixture.js')):'<!doctype html><script type="module" src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
const check=async(name,expression)=>{assert.equal(await browser.evaluate(expression),true,name);checks.push(name);};
try{
 await check('Quota readiness reports its completed frame so Send does not wait a second frame',`(async()=>{await make();const original=requestAnimationFrame;let frames=0;window.requestAnimationFrame=callback=>{frames++;return original(callback);};try{return await quota.ready(true)===true&&frames===1;}finally{window.requestAnimationFrame=original;}})()`);
 for(const existing of [false,true])for(const response of ['omitted',false,true]){
  await check(`${existing?'Existing':'New'} composer accepts ${response} response prop and projects only its three gates`,`(async()=>{await make(${JSON.stringify({existing,...(response==='omitted'?{}:{response})})});return quota.diagnostics().ready&&quota.diagnostics().subscriptions===3&&!send.disabled&&snapshots.every(s=>s.getSnapshot()===false)&&originals.every(s=>s()===true);})()`);
 }
 await check('API selection uses the same native quota subscriptions without a service read',`(async()=>{await make({api:true});return quota.diagnostics().ready&&!send.disabled&&native.reads===0;})()`);
 await check('Legacy new/main identity remains compatible',`(async()=>{await make({identity:{kind:'new',placement:'main'}});return quota.diagnostics().ready&&!send.disabled;})()`);
 await check('Repeated context aliases refer to one native composer',`(async()=>{await make({alias:true});return quota.diagnostics().ready&&!send.disabled;})()`);
 for(const identity of [{kind:'new',entrypoint:'panel'},{kind:'new',entrypoint:'preview'},{kind:'new',entrypoint:'library-preview'},{kind:'new',entrypoint:'pull-request-review'},{kind:'new'},{kind:'local',placement:'side',conversationId:null},{kind:'cloud'},{kind:'chatgpt'},{kind:'new',entrypoint:'panel',placement:'main'}])await check(`Non-home composer is not mistaken for New Chat: ${JSON.stringify(identity)}`,`(async()=>{try{await make({identity:${JSON.stringify(identity)}});return false;}catch(e){return String(e).includes('stage=composer-identity')&&snapshots.every((s,i)=>s.getSnapshot===originals[i]);}})()`);
 await check('Two distinct matching composer contexts remain ambiguous',`(async()=>{try{await make({otherIdentity:{kind:'new',entrypoint:'home'}});return false;}catch(e){return String(e).includes('stage=composer-identity');}})()`);
 for(const subscriptions of ['holder','store','mixed'])await check(`Native ${subscriptions} subscription dependencies bind on real home identity`, `(async()=>{await make({subscriptions:${JSON.stringify(subscriptions)}});return quota.diagnostics().ready&&!send.disabled&&snapshots.every(s=>s.getSnapshot()===false);})()`);
 await check('Explicit undefined optional response prop binds the real home identity',`(async()=>{await make({response:undefined});return quota.diagnostics().ready&&!send.disabled;})()`);
 await check('An exhausted selected child stays rejected at existing ready admission',`(async()=>{try{await make({exhausted:true});return false;}catch(e){return String(e).includes('ACCOUNT_SELECTED_QUOTA_EXHAUSTED');}})()`);
 for(const prop of ['permission','auth','busy'])await check(`Native ${prop} block remains in force`,`(async()=>{await make();native.${prop}=true;recompute();return send.disabled&&quota.diagnostics().ready;})()`);
 await check('Returning to host restores original snapshots and native quota disable',`(async()=>{await make();state.selected='host';quota.update(anchor);await Promise.resolve();return snapshots.every((s,i)=>s.getSnapshot===originals[i])&&send.disabled;})()`);
 await check('Dispose releases exactly its subscriptions',`(async()=>{await make();quota.dispose();return snapshots.every((s,i)=>s.getSnapshot===originals[i])&&send.disabled;})()`);
 await check('Inactive page and changed conversation immediately stop projecting',`(async()=>{await make();anchor.closest('main').dataset.appShellActivePage='false';if(snapshots.some(s=>!s.getSnapshot()))return false;anchor.closest('main').dataset.appShellActivePage='true';state.conversationId='other';return snapshots.every(s=>s.getSnapshot());})()`);
 for(const options of [{response:'false'},{response:null},{ambiguous:true},{missing:true}])await check(`Invalid or non-unique owner is rejected: ${JSON.stringify(options)}`,`(async()=>{try{await make(${JSON.stringify(options)});return false;}catch(e){return String(e).includes('stage=composer-owner')&&snapshots.every((s,i)=>s.getSnapshot===originals[i]);}})()`);
 await check('Wrong conversation context remains rejected',`(async()=>{try{await make({wrongIdentity:true});return false;}catch(e){return String(e).includes('stage=composer-identity');}})()`);
 await check('Foreign snapshot replacement survives disposal',`(async()=>{await make();const foreign=()=>true;snapshots[0].getSnapshot=foreign;quota.dispose();return snapshots[0].getSnapshot===foreign&&snapshots.slice(1).every((s,i)=>s.getSnapshot===originals[i+1]);})()`);
 for(const options of [{},{existing:true},{subscriptions:'mixed',alias:true}])await check(`Original Send callback executes once with preserved draft: ${JSON.stringify(options)}`,`(async()=>{await make({...${JSON.stringify(options)},selector:true});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const editor=document.querySelector('textarea');editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));return native.sent===1&&native.prepared===1&&editor.value==='preserved draft'&&native.notices.length===0;})()`);
 await check('Native permission denial still prevents forwarded Send',`(async()=>{await make({selector:true});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));native.permission=true;recompute();document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));return native.sent===0&&send.disabled&&native.notices.some(s=>s.includes('ACCOUNT_NATIVE_SEND_DISABLED'));})()`);
 await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,scope:'Production quota adapter and selector in Chromium with controlled mounted host/runtime; no real account, billing or inference',checks},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
