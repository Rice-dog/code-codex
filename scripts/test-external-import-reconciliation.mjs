import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {out,homeFixture,openBrowser,sleep,record} from './fixtures/browser-fixture.mjs';

// Compile scripts/fixtures/import-reconciliation first. This uses the actual
// Workspace ImportSession on a TempDir, never a user's filesystem or account.
async function scenario(mode) {
 const child=spawn(path.join(out,'native/debug/import-reconciliation-fixture.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let buffer='',pending=[];child.stdout.on('data',bytes=>{buffer+=bytes;while(buffer.includes('\n')){const n=buffer.indexOf('\n'),line=buffer.slice(0,n);buffer=buffer.slice(n+1);const p=pending.shift();if(p){clearTimeout(p.timer);p.resolve(JSON.parse(line));}}});
 const native=req=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture timeout')),12000);pending.push({resolve,reject,timer});child.stdin.write(JSON.stringify(req)+'\n');});
 let commitSeen=false,queryHeldResolve;const actions=[];
 const held=new Promise(r=>queryHeldResolve=r);let releaseQuery;
 const release=new Promise(r=>releaseQuery=r);
 const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.end();return;}
  try{
   let body='';for await(const chunk of req)body+=chunk;const q=JSON.parse(body),params={...q.params};
   actions.push({method:q.method,context:q.fixtureContext});
   if(q.method==='explorer.list'&&q.fixtureContext!=='thread_home_001'){res.end(JSON.stringify({entries:[]}));return;}
   const fail=code=>res.end(JSON.stringify({id:q.id,ok:false,error:{code,message:'Synthetic fault'}}));
   if(mode==='upload-failed'&&q.method==='explorer.entry.import.chunk'){fail('TIMEOUT');return;}
   if(mode==='commit-rejected'&&q.method==='explorer.entry.import.commit'){commitSeen=true;fail('CONFLICT');return;}
   if(q.method==='explorer.entry.import.chunk')params.fixtureBytes=[...Buffer.from(params.dataBase64,'base64')];
   const result=await native({method:q.method,params});
   if(q.method==='explorer.entry.import.commit'&&result.ok){commitSeen=true;fail('TIMEOUT');return;}
   if(q.method==='explorer.list'&&commitSeen&&mode==='refresh-failed'){fail('NO_BRIDGE');return;}
   if(q.method==='explorer.list'&&commitSeen&&mode==='context-changed'){queryHeldResolve();await release;}
   res.end(JSON.stringify(result.ok?result.result:{id:q.id,ok:false,error:{code:'CONFLICT',message:'Synthetic state conflict'}}));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({message:String(error)}));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${server.address().port}/`;
 const html=homeFixture().replace('const errors=[];',`window.fixtureContext='thread_home_001';const originalRequest=window.__codeCodex.request;window.__codeCodex.request=async req=>{if(req.method==='explorer.context')window.fixtureContext=req.params.threadId;if(req.method.startsWith('explorer.entry.import.')||req.method==='explorer.list'){calls.push(req);return fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...req,fixtureContext:window.fixtureContext})}).then(r=>r.json())}return originalRequest(req)};const errors=[];`);
 const browser=await openBrowser(html);
 try{
  await browser.wait(`[...document.querySelectorAll('*')].some(e=>/^code-codex-v/.test(e.localName)&&e.dataset.state==='empty')`,'empty workspace');
  await browser.ev(String.raw`window.tree=[...document.querySelectorAll('*')].find(e=>/^code-codex-v/.test(e.localName));tree.collapse(false);window.beforeCalls=calls.length;const transfer=new DataTransfer();transfer.items.add(new File(['committed payload\n'],'dropped.txt',{type:'text/plain'}));tree.shadowRoot.querySelector('.tree-shell').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,composed:true,dataTransfer:transfer}));`);
  if(mode==='context-changed'){
   await Promise.race([held,sleep(12000).then(()=>{throw Error('reconciliation not requested')})]);
   await browser.ev(`document.querySelector('[data-app-action-sidebar-thread-id]').dataset.appActionSidebarThreadId='local:thread_home_002';document.querySelector('[data-above-composer-conversation-id]').dataset.aboveComposerConversationId='thread_home_002';document.querySelector('[data-response-annotation-conversation]').dataset.responseAnnotationConversation='thread_home_002'`);
   await browser.wait(`calls.some(c=>c.method==='explorer.context'&&c.params.threadId==='thread_home_002')`,'new context');
   releaseQuery();
  }
  await browser.wait(`tree.dataset.busy==='false'&&calls.some(c=>c.method==='explorer.entry.import.abort')`,'import ends');await sleep(450);
  const observed=await browser.ev(`({calls:calls.slice(beforeCalls).map(c=>c.method),treeHasFile:!!tree.shadowRoot.querySelector('[role=treeitem][data-path="dropped.txt"]'),notice:[...tree.shadowRoot.querySelectorAll('[role=status]')].map(e=>e.textContent).join(' '),state:tree.dataset.state,errors})`);
  const disk=(await native({method:'fixture.state',params:{}})).result;
  assert.deepEqual(observed.errors,[]);assert.equal(disk.sessions,0);
  const listAfterCommit=actions.slice(actions.findIndex(x=>x.method==='explorer.entry.import.commit')+1).filter(x=>x.method==='explorer.list');
  if(mode==='committed-response-lost'){assert.equal(disk.commitCount,1);assert.ok(observed.treeHasFile);assert.ok(listAfterCommit.length>=1);assert.match(observed.notice,/could not be confirmed/);}
  if(mode==='refresh-failed'){assert.equal(disk.commitCount,1);assert.ok(!observed.treeHasFile);assert.ok(listAfterCommit.length>=1);assert.match(observed.notice,/could not be refreshed/);}
  if(mode==='context-changed'){assert.equal(disk.commitCount,1);assert.ok(!observed.treeHasFile);assert.ok(!observed.notice.includes('could not be confirmed'));}
  if(mode==='commit-rejected'){assert.equal(disk.commitCount,0);assert.ok(!observed.treeHasFile);assert.ok(listAfterCommit.length>=1);assert.match(observed.notice,/already exists/);}
  if(mode==='upload-failed'){assert.equal(disk.commitCount,0);assert.ok(!observed.calls.includes('explorer.entry.import.commit'));assert.ok(!observed.calls.includes('explorer.list'));assert.match(observed.notice,/timed out/);}
  return {mode,status:'passed',disk,observed,actions};
 }finally{
  releaseQuery();await browser.close();await new Promise(r=>server.close(r));child.stdin.end();await Promise.race([new Promise(r=>child.once('exit',r)),sleep(2000)]);if(child.exitCode===null)child.kill();
 }
}
const results=[];
for(const mode of ['committed-response-lost','refresh-failed','context-changed','commit-rejected','upload-failed']){results.push(await scenario(mode));console.log(mode+' passed');}
record('reconciliation-results.json',{classification:'Production UI and Workspace service, isolated shell/TempDir; injected faults, not native launch transport',results,passed:true});
