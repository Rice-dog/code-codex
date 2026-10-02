// Check only Code-Codex's own menu/dialog in an already running authorized local session.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const port=Number(process.argv[2]);assert.ok(port>0&&port<65536);
const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target=targets.find(t=>t.type==='page'&&t.url==='app://-/index.html');assert.ok(target);
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let sequence=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const cmd=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Native runtime information evaluation failed');return r.result.value;};
try {
 await evaluate(`document.querySelector('[data-code-codex-runtime-information]')?.firstElementChild.shadowRoot.querySelector('.close').click();document.querySelector('#code-codex-application-menu-trigger').click();[...document.querySelectorAll('[data-code-codex-application-menu-popup] [role=menuitem]')].find(x=>x.textContent==='Runtime Information').click()`);
 await new Promise(r=>setTimeout(r,500));
 const result=await evaluate(`(()=>{const d=document.querySelector('[data-code-codex-runtime-information]'),s=d?.firstElementChild.shadowRoot;return {open:d?.open,title:s?.querySelector('h2').textContent,summary:s?.querySelector('.summary').textContent,runs:s?.querySelector('select').options.length,events:s?.querySelectorAll('.event').length};})()`);
 assert.equal(result.open,true);assert.equal(result.title,'Runtime Information');assert.ok(result.summary.includes('Version 0.3.78'));assert.ok(result.runs>=2);assert.ok(result.events>0);console.log(result);writeFileSync('artifacts/runtime-078-native-check.json',JSON.stringify(result,null,2));
 const rect=await evaluate(`(()=>{const r=document.querySelector('[data-code-codex-runtime-information]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
 const shot=await cmd('Page.captureScreenshot',{format:'png',clip:rect});writeFileSync('artifacts/runtime-078-native.png',Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('[data-code-codex-runtime-information]').firstElementChild.shadowRoot.querySelector('.close').click()`);
} finally {await evaluate(`document.querySelector('[data-code-codex-runtime-information]')?.firstElementChild.shadowRoot.querySelector('.close').click()`).catch(()=>{});ws.close();}
