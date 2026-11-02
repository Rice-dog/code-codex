import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture,delay} from './browser-fixture.mjs';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const catalog=JSON.parse(readFileSync(resolve(ui,'dist/plugins/catalog.json'),'utf8'));
const scripts=['black-hole','pixel-sculpt'].map(id=>{const d=catalog.find(p=>p.id===id);return readFileSync(resolve(ui,'dist/plugins',d.category,id,d.asset),'utf8')}).join('\n');
const helper=(await build({stdin:{contents:`import {CanvasOpening} from './core/background-runtime/canvas-opening';import {OceanWorkerRenderer} from './core/background-runtime/ocean-worker-renderer';import {normalize} from './effects/shallow-ocean/options';window.CanvasOpening=CanvasOpening;window.OceanWorkerRenderer=OceanWorkerRenderer;window.oceanSettings=normalize({});`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,write:false})).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/script.js'?'text/javascript':'text/html');res.end(req.url==='/script.js'?helper+'\n'+scripts:`<!doctype html><style>body{margin:0;background:#000}#host{position:relative;width:640px;height:400px;overflow:hidden}canvas{width:100%;height:100%}</style><div id="host"></div><script>window.errors=[];addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));</script><script src="/script.js"></script>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),e=browser.evaluate,checks=[];
const wait=async(expr)=>{for(let i=0;i<300;i++){if(await e(expr))return;await delay(30)}throw Error('Opening wait exceeded: '+expr)};
const out=resolve(root,'artifacts/canvas-openings');mkdirSync(out,{recursive:true});
try{
 await e(`window.host=document.getElementById('host');window.canvas=document.createElement('canvas');host.append(canvas);window.testOpening=new CanvasOpening(canvas,'gravity');testOpening.visible(true)`);
 await delay(100);assert.equal(await e(`canvas.getAnimations()[0].currentTime`),0);checks.push('Preparation gate stays at zero through visible activity');
 await e(`testOpening.start();testOpening.visible(false);window.pausedTime=canvas.getAnimations()[0].currentTime`);await delay(100);assert.equal(await e(`canvas.getAnimations()[0].currentTime===pausedTime`),true);checks.push('Hidden presentation pauses');
 await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait(`getComputedStyle(canvas).opacity==='1'`);checks.push('Reduced motion completes presentation');
 await e(`testOpening.visible(false);testOpening.visible(true)`);assert.equal(await e(`canvas.getAnimations()[0].playState`),'finished');checks.push('Completed opening does not restart across visibility changes');
 await e(`testOpening.dispose();host.replaceChildren()`);await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 await e(`window.NativeWorker=Worker;window.Worker=class extends EventTarget{postMessage(m){const send=(type,extra={})=>this.dispatchEvent(new MessageEvent('message',{data:{v:m.v,session:m.session,type,...extra}}));if(m.type==='init')setTimeout(()=>send('first-frame',{frames:1}),10);else{setTimeout(()=>send('ack',{seq:m.seq}),0);if(m.type==='replay')setTimeout(()=>send('event',{event:'ocean-opening',value:{active:true,duration:5.2,elapsed:0}}),600);if(m.type==='dispose')setTimeout(()=>send('disposed'),0);}}terminate(){}};window.oc=document.createElement('canvas');host.append(oc);window.ocean=new OceanWorkerRenderer(' ',host,oc,oceanSettings,()=>{});`);
 await e('ocean.ready');await delay(200);
 assert.equal(await e(`host.getAnimations()[0].currentTime`),0);assert.equal(await e(`getComputedStyle(host).opacity`),'0');checks.push('Ocean synthetic delayed-opening event cannot expose first-ready sea');
 await wait(`host.querySelector('[data-ocean-opening-title]').getAnimations().length>0`);
 await e(`ocean.dispose();window.Worker=NativeWorker;host.replaceChildren()`);
 // Character-specific package GPU behavior is covered by test-character-openings.mjs.
 assert.deepEqual(await e('errors'),[]);checks.push('No unhandled errors; instances disposed');
 writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
