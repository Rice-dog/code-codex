import {verifiedPluginSources} from './plugin-package-files.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const catalog=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8'));
const manifest=JSON.parse(readFileSync(resolve(ui,'default-media/manifest.json'),'utf8'));
const report={version:JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version,checks:[],packages:{}};
const server=createServer((_,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><html><body>Isolated default-gallery validation</body></html>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
const evaluate=browser.evaluate;
try{
 await evaluate(`window.errors=[];addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.modules=()=>window[Symbol.for('code-codex:background-modules:v1')];window.galleries=()=>window[Symbol.for('code-codex:default-galleries:v1')];window.hashBlob=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');window.readGallery=async(name)=>{const db=await new Promise((r,j)=>{const q=indexedDB.open(name);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{return await new Promise((r,j)=>{const q=db.transaction('images').objectStore('images').getAll();q.onsuccess=()=>r(q.result.filter(row=>row.blob instanceof Blob||row.file instanceof Blob));q.onerror=()=>j(q.error)})}finally{db.close()}};window.clearImages=async name=>{const db=await new Promise((r,j)=>{const q=indexedDB.open(name);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{await new Promise((r,j)=>{const tx=db.transaction('images','readwrite');const store=tx.objectStore('images');const marker=store.get('__codeCodex_default_media_v1__');marker.onsuccess=()=>{store.clear();if(marker.result)store.put(marker.result);};tx.oncomplete=r;tx.onerror=()=>j(tx.error)})}finally{db.close()}};window.deleteGallery=name=>new Promise((r,j)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=r;q.onerror=()=>j(q.error);q.onblocked=()=>j(Error('Blocked fixture deletion'))});`);
 for(const id of ['particle-image','pixel-sculpt']){
  const info=catalog.find(p=>p.id===id),items=manifest.plugins[id];
  assert.equal(info.resources.filter(r=>r.kind==='image').length,items.length);
  for(const source of verifiedPluginSources(resolve(ui,'dist/plugins'),info)){assert.ok(Buffer.byteLength(source)<=4*1024*1024);await evaluate(source);}
  const dbName=id==='particle-image'?'code-codex-particle-image-background':'code-codex-pixel-sculpt';
  await evaluate(`Promise.all([0,1,2,3].map(()=>modules().get(${JSON.stringify(id)}).prepareDefaults()))`);
  const actual=await evaluate(`(async()=>{const rows=await readGallery(${JSON.stringify(dbName)});return Promise.all(rows.map(async row=>({id:row.id,name:row.name||row.file.name,size:(row.blob||row.file).size,hash:await hashBlob(row.blob||row.file),order:row.order,positionX:row.positionX,positionY:row.positionY,zoom:row.zoom})))})()`);
  assert.equal(actual.length,items.length);
  assert.deepEqual(actual.map(r=>r.hash).sort(),items.map(r=>r.sha256).sort());
  report.packages[id]={count:actual.length,originalBytes:actual.reduce((n,r)=>n+r.size,0),hashes:actual.map(r=>r.hash)};
  report.checks.push(`${id}: fresh profile imports every original image without resizing`);
  await evaluate(`modules().get(${JSON.stringify(id)}).prepareDefaults()`);
  assert.equal(await evaluate(`readGallery(${JSON.stringify(dbName)}).then(rows=>rows.length)`),items.length);
  report.checks.push(`${id}: concurrent and repeated preparation does not duplicate media`);
  await evaluate(`clearImages(${JSON.stringify(dbName)})`);
  await evaluate(`modules().get(${JSON.stringify(id)}).prepareDefaults()`);
  assert.equal(await evaluate(`readGallery(${JSON.stringify(dbName)}).then(rows=>rows.length)`),0);
  report.checks.push(`${id}: explicit user deletion remains deleted after preparation`);
  await evaluate(`deleteGallery(${JSON.stringify(dbName)})`);
  // A v1 library containing every old default plus a user file migrates in place.
  await evaluate(`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open(${JSON.stringify(dbName)},1);q.onupgradeneeded=()=>q.result.createObjectStore('images',{keyPath:'id'});q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{const records=[...galleries().get(${JSON.stringify(id)}).images.values()].map((item,i)=>{const s=atob(item.data),bytes=Uint8Array.from(s,c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:item.type});return ${JSON.stringify(id)}==='particle-image'?{...item,blob,thumbnail:blob,createdAt:i+1}:{id:i+1,file:new File([blob],item.name,{type:item.type}),order:7}});records.push(${JSON.stringify(id)}==='particle-image'?{id:'user-only',name:'user-only.png',type:'image/png',size:3,createdAt:50,blob:new Blob(['own']),thumbnail:new Blob(['own'])}:{id:999,file:new File(['own'],'user-only.png',{type:'image/png'}),order:11});await new Promise((r,j)=>{const tx=db.transaction('images','readwrite');for(const record of records)tx.objectStore('images').put(record);tx.oncomplete=r;tx.onerror=()=>j(tx.error)})}finally{db.close()}})()`);
  await evaluate(`modules().get(${JSON.stringify(id)}).prepareDefaults()`);
  const legacy=await evaluate(`readGallery(${JSON.stringify(dbName)}).then(rows=>({count:rows.length,user:rows.some(r=>r.name==='user-only.png'||r.file?.name==='user-only.png'),orders:rows.map(r=>r.order).filter(n=>n!==undefined)}))`);
  assert.equal(legacy.count,items.length+1);assert.equal(legacy.user,true);
  if(id==='pixel-sculpt')assert.deepEqual(legacy.orders,[7,7,7,11]);
  report.checks.push(`${id}: v1 upgrade preserves existing defaults, user file and playback orders`);
  const galleryCount=await evaluate(`galleries().get(${JSON.stringify(id)}).count`);
  await evaluate(`galleries().get(${JSON.stringify(id)}).count+=1`);
  assert.equal(await evaluate(`modules().get(${JSON.stringify(id)}).prepareDefaults().then(()=>false,error=>/incomplete/.test(String(error)))`),true);
  await evaluate(`galleries().get(${JSON.stringify(id)}).count=${galleryCount}`);
  report.checks.push(`${id}: missing companion resource is rejected before use`);
 }
 assert.deepEqual(await evaluate('errors'),[]);
 report.checks.push('no browser errors or unhandled rejections');
 mkdirSync(resolve(root,'artifacts/default-galleries-test'),{recursive:true});
 writeFileSync(resolve(root,'artifacts/default-galleries-test/result.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.checks.length,...report.packages}));
}finally{await browser.close();await new Promise(r=>server.close(r))}
