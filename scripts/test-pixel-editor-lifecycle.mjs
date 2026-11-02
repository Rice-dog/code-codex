import {launchFixture,delay} from './browser-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../packages/explorer-ui/dist/plugins');
const p=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8')).find(p=>p.id==='pixel-sculpt');
const source=await readFile(resolve(root,p.category,p.id,p.asset),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><script>window.errors=[];</script><script>'+source+'</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await launchFixture(`http://127.0.0.1:${server.address().port}`);
try{
 await b.evaluate(`(async()=>{const Renderer=window[Symbol.for('code-codex:background-modules:v1')].get('pixel-sculpt').exports.PixelSculptRenderer;window.target=document.createElement('div');target.style.cssText='width:640px;height:400px';const canvas=document.createElement('canvas');target.append(canvas);window.renderer=new Renderer(target,canvas,{paused:false},error=>{if(error)errors.push(error)},false);await renderer.ready;await renderer.firstFrame;return true;})()`);
 const before=await b.evaluate("[...window[Symbol.for('code-codex:background-isolation:v1')].values()][0].frames");assert(before>0);
 await delay(16000);
 const paused=await b.evaluate("({errors,frames:[...window[Symbol.for('code-codex:background-isolation:v1')].values()][0].frames})");assert.deepEqual(paused.errors,[]);assert.equal(paused.frames,before);
 await b.evaluate('document.body.append(target);renderer.setActive(true,{paused:false})');await delay(1400);
 const resumed=await b.evaluate("[...window[Symbol.for('code-codex:background-isolation:v1')].values()][0].frames");assert(resumed>before);
 await b.evaluate('renderer.dispose();target.remove()');await delay(200);assert.equal(await b.evaluate("window[Symbol.for('code-codex:background-isolation:v1')].size"),0);
 console.log(JSON.stringify({passed:true,detachedEditorPreparedFrame:before,idleMs:16000,noFirstFrameTimeout:true,pausedFrames:paused.frames,resumedFrames:resumed,remainingSessions:0}));
}finally{await b.evaluate('renderer?.dispose()').catch(()=>{});await b.close();server.close();}
