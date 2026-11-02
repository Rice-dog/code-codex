import {launchFixture,delay} from './browser-fixture.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../packages/explorer-ui/dist/plugins');
const p=JSON.parse(await readFile(resolve(root,'catalog.json'),'utf8')).find(p=>p.id==='black-hole');
const source=await readFile(resolve(root,p.category,p.id,p.asset),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><script>window.errors=[];</script><script>'+source+'</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await launchFixture(`http://127.0.0.1:${server.address().port}`);
try{
 await b.evaluate(`(async()=>{window.errors=[];window.target=document.createElement('div');target.style.cssText='width:640px;height:400px';document.body.append(target);window.renderer=window[Symbol.for('code-codex:background-modules:v1')].get('black-hole').startup(target,error=>{if(error)errors.push(error)});await renderer.ready;})()`);
 await delay(1600);const sample=await b.evaluate(`({errors,worker:[...window[Symbol.for('code-codex:background-isolation:v1')].values()][0],version:window[Symbol.for('code-codex:background-modules:v1')].get('black-hole').version})`);assert.deepEqual(sample.errors,[]);assert(sample.worker.frames>1);assert.equal(sample.version,p.version);await b.evaluate('renderer.replay()');await delay(150);await b.evaluate('renderer.dispose();target.remove()');await delay(200);assert.equal(await b.evaluate("window[Symbol.for('code-codex:background-isolation:v1')].size"),0);console.log(JSON.stringify({passed:true,mode:'Exact black-hole package actual Worker',...sample}));
}finally{await b.evaluate('window.renderer?.dispose()').catch(()=>{});await b.close();server.close();}
