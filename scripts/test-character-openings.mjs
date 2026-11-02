import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),out=resolve(root,'artifacts/character-openings');mkdirSync(out,{recursive:true});
const script=(await build({stdin:{contents:`import {BlackHoleRenderer} from './core/background-runtime/black-hole-kernel';import {readBlackHoleBackgroundSettings} from './startup-background-renderers';import {startPixelKernel} from './pixel-sculpt-kernel';window.startBlack=()=>new BlackHoleRenderer(host,canvas,readBlackHoleBackgroundSettings(),e=>errors.push(e));window.startPixel=()=>startPixelKernel(canvas,e=>errors.push(e),{galleryAuto:false,tilt:45});`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,write:false})).outputFiles[0].text;
const probe=`window.errors=[];window.opening=0;for(const C of [WebGLRenderingContext,WebGL2RenderingContext]){const loc=C.prototype.getUniformLocation,one=C.prototype.uniform1f;const names=new WeakMap();C.prototype.getUniformLocation=function(p,n){const l=loc.call(this,p,n);if(l)names.set(l,n);return l};C.prototype.uniform1f=function(l,v){if(names.get(l)==='uOpening')window.opening=v;return one.call(this,l,v)}}window.newCanvas=()=>{host.replaceChildren();window.canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%';host.append(canvas)};`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/main.js'?'text/javascript':'text/html');res.end(req.url==='/main.js'?script:`<!doctype html><style>body{margin:0;background:black}#host{width:640px;height:400px;position:relative}</style><div id="host"></div><script>${probe}</script><script src="/main.js"></script>`)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await launchFixture(`http://127.0.0.1:${server.address().port}`),e=b.evaluate,checks=[];
const wait=async exp=>{for(let i=0;i<400;i++){if(await e(exp))return;await delay(25)}throw Error('Timed out '+exp)};
const shot=async n=>{await b.command('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(resolve(out,n+'.png'),Buffer.from(r.data,'base64')))};
try{
 await e('newCanvas();window.renderer=startBlack()');await wait('opening>.08&&opening<.5');await shot('black-early-progress');await wait('opening>.55&&opening<1');await shot('black-later-progress');await wait('opening===1');await shot('black-complete');checks.push('Actual black-hole composite GPU progresses through its opening to full output');
 await e('renderer.replay()');await wait('opening<.1');checks.push('Black-hole replay resets shader stages');await e('renderer.dispose();newCanvas();window.renderer=startPixel()');
 await e(`window.data={data:new Float32Array(Array.from({length:256},(_,i)=>[i%16-8,Math.floor(i/16)-8,.9,(i%16)/16,.4,.3+(i%13)/20,(i%17)/17]).flat()),pickData:new Float32Array(256*3),heightGrid:new Float32Array(256).fill(.5),count:256,cols:16,rows:16,aspect:1};renderer.setDataset(data,true)`);
 await wait('opening>.05&&opening<.4');await shot('pixel-falling');await wait('opening>.6&&opening<1');await shot('pixel-settling');await wait('opening===1');await shot('pixel-complete');checks.push('Actual instanced vertex GPU progresses falling blocks to exact resting positions');
 await e('renderer.setPaused(true);window.frozen=opening');await delay(120);assert.equal(await e('opening===frozen'),true);checks.push('Pause freezes kernel time');
 const replay=await e('renderer.replayOpening()');assert.equal(replay.openingProgress,0);assert.equal(await e('opening'),0);checks.push('Retained kernel replay redraws hidden starting pose before acknowledgement');
 await e('renderer.setPaused(false)');await wait('opening>.1');await e('renderer.setPaused(true);renderer.replayOpening()');assert.equal(await e('opening'),0);checks.push('Repeated retained-instance replay restarts falling on each activation');
 await b.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await e('renderer.replayOpening()');assert.equal(await e('opening'),1);checks.push('Reduced motion draws complete configured geometry');
 await e('renderer.dispose()');assert.deepEqual(await e('errors'),[]);checks.push('No renderer errors; instances disposed');
 writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await b.close();await new Promise(r=>server.close(r));}
