import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),out=process.env.CODE_CODEX_TEST_OUTPUT_ROOT??join(root,'artifacts/storage-upgrade-v0.4.10');mkdirSync(out,{recursive:true});
const code=buildSync({entryPoints:[join(root,'packages/explorer-ui/src/renderer-storage.ts')],bundle:true,write:false,format:'iife',globalName:'StorageFixture'}).outputFiles[0].text;
let preferences={},media=new Map(),uploads=new Map(),largest=0,writes=0;const checks=[],requestTimes=[];
const verify=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
const html=`<!doctype html><meta charset="utf-8"><script>${code}</script><script>
window.openFixtureDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('code-codex-startup-transition',1);r.onupgradeneeded=()=>r.result.createObjectStore('video',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
let loseFirstRead=true;StorageFixture.reconnectRendererStorage(async(method,params,timeout)=>{if(method!=='explorer.storage.request')throw Error(method);if(loseFirstRead&&params.action==='settings.read'){loseFirstRead=false;await new Promise(r=>setTimeout(r,timeout));throw Error('Simulated initial binding timeout')}const r=await fetch('/rpc',{method:'POST',body:JSON.stringify(params)});if(!r.ok)throw Error(await r.text());return r.json();});
window.initialized=StorageFixture.initializeRendererStorage();
</script>`;
const server=createServer(async(req,res)=>{
 try{
  if(req.url!=='/rpc'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url==='/reset'?'<!doctype html><title>cache reset fixture</title>':html);return;}
  let raw='';for await(const part of req)raw+=part;largest=Math.max(largest,Buffer.byteLength(raw));assert.ok(Buffer.byteLength(raw)<96*1024,'existing bridge request bound');
  requestTimes.push(performance.now());const p=JSON.parse(raw),key=p.scope+':'+p.id,job=p.job+':'+p.field;let result={};
  if(p.action==='settings.read')result=preferences;
  else if(p.action==='settings.write'){assert.ok(Object.keys(p.values).every(k=>k.startsWith('code-codex:')&&!k.includes('lease')));preferences=p.values;}
  else if(p.action==='media.list')result=[...media.values()].filter(d=>d.scope===p.scope).map(({scope,...d})=>d);
  else if(p.action==='media.write'){writes++;const old=uploads.get(job)??Buffer.alloc(0);assert.equal(old.length,p.offset);uploads.set(job,Buffer.concat([old,Buffer.from(p.data,'base64')]));}
  else if(p.action==='media.commit'){for(const [f,d] of Object.entries(p.blobs)){const b=uploads.get(p.job+':'+f);assert.equal(b.length,d.size);assert.equal(createHash('sha256').update(b).digest('hex'),d.sha256);}media.set(key,{scope:p.scope,id:p.id,job:p.job,record:p.record,blobs:p.blobs});}
  else if(p.action==='media.read'){const d=media.get(key),b=uploads.get(d.job+':'+p.field);result={size:b.length,offset:p.offset,data:b.subarray(p.offset,p.offset+65536).toString('base64')};}
  else if(p.action==='media.delete')media.delete(key);
  else throw Error(p.action);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(e){res.statusCode=400;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await launchFixture(url);
async function ready(){for(let n=0;n<100;n++){if(await browser.evaluate('!!window.initialized')){await browser.evaluate('window.initialized');return;}await delay(50);}throw Error('Fixture did not initialize');}
try{
 await ready();
 await browser.evaluate(`Promise.all(Array.from({length:40},()=>window[Symbol.for('code-codex:native-storage:v1')].request('explorer.storage.request',{action:'settings.read'})))`);
 const maxStorageRequestsPerSecond=Math.max(...requestTimes.map(t=>requestTimes.filter(x=>x>=t&&x<t+1000).length));
 verify(maxStorageRequestsPerSecond<=24,'Concurrent storage operations stay below bridge request rate gate');
 verify(await browser.evaluate("(window[Symbol.for('code-codex:runtime-events:v1')]?.events||[]).some(e=>e.source==='storage'&&e.outcome==='retrying')"),'Lost first binding read recovers with bounded read-only retry');
 await browser.evaluate(`localStorage.setItem('official-account','unchanged');localStorage.setItem('code-codex:fixture','first');localStorage.setItem('code-codex:lease','private lease');`);await delay(900);
 verify(preferences['code-codex:fixture']==='first','Code-Codex preferences persisted');
 verify(!('official-account' in preferences)&&!('code-codex:lease' in preferences),'Official keys and lease excluded');
 await browser.evaluate(`(async()=>{const db=await openFixtureDB();await new Promise((resolve,reject)=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'selected',name:'fixture.mp4',blob:new Blob([new Uint8Array(150000).fill(7)],{type:'video/mp4'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()})()`);await delay(1800);
 verify(media.get('startup:selected')?.blobs.blob.size===150000,'Multi-chunk video persisted with verified integrity');
 verify(largest<96*1024,'All upload requests fit existing binding limit');
 await browser.evaluate(`(async()=>{const db=await openFixtureDB();await new Promise((resolve,reject)=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').put({id:'selected',name:'fixture.mp4',blob:new Blob([new Uint8Array(150000).fill(8)],{type:'video/mp4'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()})()`);await delay(1500);
 verify(media.get('startup:selected')?.blobs.blob.sha256===createHash('sha256').update(Buffer.alloc(150000,8)).digest('hex'),'Same-size video replacement saves changed bytes');
 // Simulate the earlier hot-upgrade state where initial backup stopped mid-run.
 media.delete('startup:selected');
 await browser.evaluate(`(()=>{const s=window[Symbol.for('code-codex:native-storage:v1')];s.persistenceSchema=1;s.initialized=true;s.ready=Promise.resolve();s.fingerprints.clear();return StorageFixture.initializeRendererStorage()})()`);await delay(1800);
 verify(media.get('startup:selected')?.blobs.blob.size===150000,'Hot upgrade reconciles incomplete legacy-schema backup');
 await browser.evaluate(`(async()=>{const db=await new Promise((ok,bad)=>{const r=indexedDB.open('code-codex-custom-background',1);r.onupgradeneeded=()=>r.result.createObjectStore('media',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});await new Promise((ok,bad)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put({id:'custom-image',name:'local.png',kind:'image',parameters:{x:23,opacity:70},blob:new Blob([new Uint8Array(1234).fill(9)],{type:'image/png'})});tx.oncomplete=ok;tx.onerror=()=>bad(tx.error)});db.close()})()`);await delay(1400);
 verify(media.get('custom-background:custom-image')?.record.parameters.x===23&&media.get('custom-background:custom-image')?.blobs.blob.size===1234,'Custom Background media and independent parameters persist through the native scope');
 const previousWrites=writes;
 // An active browser edit wins over an older native snapshot during reinitialization.
 preferences['code-codex:fixture']='older-native';
 await browser.evaluate(`(()=>{const s=window[Symbol.for('code-codex:native-storage:v1')];s.persistenceSchema=1;s.initialized=true;s.ready=Promise.resolve();return StorageFixture.initializeRendererStorage()})()`);
 verify(await browser.evaluate(`localStorage.getItem('code-codex:fixture')`)==='first'&&preferences['code-codex:fixture']==='first','Existing browser preferences win over older native snapshot');
 // A new browser document has no hooks while its browser cache is cleared.
 await browser.command('Page.navigate',{url:url+'reset'});for(let n=0;n<100;n++){if(await browser.evaluate("document.title==='cache reset fixture'"))break;await delay(50);}
 await browser.command('Storage.clearDataForOrigin',{origin:url.slice(0,-1),storageTypes:'local_storage,indexeddb'});
 await browser.command('Page.navigate',{url});await delay(150);await ready();
 verify(await browser.evaluate(`localStorage.getItem('code-codex:fixture')`)==='first','Native preferences restored after cache clear');
 const restored=await browser.evaluate(`(async()=>{const db=await openFixtureDB();const r=await new Promise((resolve,reject)=>{const r=db.transaction('video').objectStore('video').get('selected');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});db.close();return {size:r.blob.size,first:new Uint8Array(await r.blob.arrayBuffer())[0]}})()`);
 verify(restored.size===150000&&restored.first===8,'User video restored before plugin mount');
 verify(await browser.evaluate(`(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('code-codex-custom-background',1);r.onsuccess=()=>ok(r.result)});const value=await new Promise(ok=>{const r=db.transaction('media').objectStore('media').get('custom-image');r.onsuccess=()=>ok(r.result)});db.close();return value.parameters.x===23&&value.blob.size===1234})()`),'Custom Background source and parameters restore after clearing browser caches');
 await delay(900);verify(writes===previousWrites,'Unchanged restored video is not uploaded again');
 await browser.evaluate(`(async()=>{const db=await openFixtureDB();await new Promise((resolve,reject)=>{const tx=db.transaction('video','readwrite');tx.objectStore('video').delete('selected');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()})()`);await delay(1400);
 verify(!media.has('startup:selected'),'Deleting user media removes native index');
 const result={passed:checks.length,checks,largestBindingRequestBytes:largest,maxStorageRequestsPerSecond,source:'production renderer storage; real Chrome IndexedDB; simulated native RPC; no official profile touched'};
 writeFileSync(join(out,'browser-storage.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
