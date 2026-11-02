import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const out=resolve(root,process.env.OCEAN_PRESENTATION_OUTPUT||'artifacts/ocean-presentation');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import {ShallowOceanRenderer} from '../plugins/appearance/shallow-ocean/renderer';import {DEFAULT_OPTIONS} from './effects/shallow-ocean/options';import * as hold from './background-startup-hold';window.hold=hold;window.errors=[];window.current=new ShallowOceanRenderer(document.querySelector('#host'),document.querySelector('#sea'),{...DEFAULT_OPTIONS,introEnabled:0,performanceMode:3},e=>errors.push(e));`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',outfile:resolve(out,'fixture.js'),logLevel:'silent'});
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ff00ff}#host{position:relative;width:900px;height:600px}</style><div id="host"><canvas id="sea"></canvas></div><script src="/fixture.js"></script>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(resolve(out,'fixture.js')):html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;const report={mode:process.argv.includes('--diagnose')?'before-fix-diagnosis':'regression',checks:[],samples:{}};
try{
 b=await launchFixture(`http://127.0.0.1:${server.address().port}`);const e=b.evaluate;
 for(let i=0;i<300;i++){if(await e('window.current?.diagnostics?.frames>3'))break;await delay(100)}
 assert(await e('current.diagnostics.frames>3'));
 async function sample(name){
  const shot=await b.command('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:850,height:550,scale:1}});writeFileSync(resolve(out,name+'.png'),Buffer.from(shot.data,'base64'));
  const v=await e(`(async()=>{const i=new Image();i.src=${JSON.stringify('data:image/png;base64,'+shot.data)};await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const a=x.getImageData(0,0,c.width,c.height).data;let black=0;for(let k=0;k<a.length;k+=4)if(a[k]<4&&a[k+1]<4&&a[k+2]<4)black++;return {blackFraction:black/(a.length/4),frames:current.diagnostics.frames,parameters:current.diagnostics.parameters,performance:current.diagnostics.performance,glError:current.diagnostics.glError,paused:current.diagnostics.paused};})()`);report.samples[name]=v;return v;
 }
 await e('current.scene.setPaused(true)');const baseline=await sample('baseline');
 await e("current.scene.emit('resize')");const same=await sample('same-size-resize');
 await e('current.setSettings({...current.diagnostics.parameters,performanceMode:1})');const quality=await sample('paused-quality-change');
 await e("document.querySelector('#host').style.width='860px'");await delay(150);const resized=await sample('paused-real-resize');
 if(!process.argv.includes('--diagnose')){
  for(const [name,v] of Object.entries(report.samples)){assert(v.blackFraction<.05,name+' presented a black framebuffer');report.checks.push(name+' preserves a painted frame');}
  await e('current.scene.setPaused(false)');await delay(350);const resumed=await sample('resumed');assert(resumed.blackFraction<.05&&resumed.performance.targetFps===60&&resumed.performance.drawingWidth*resumed.performance.drawingHeight<=1280*720);report.checks.push('Resume commits low quality at60FPS with no blank presentation');
  assert(await e('errors.length===0'));report.checks.push('No renderer errors');
  await e(`current.setSettings({...current.diagnostics.parameters,performanceMode:0});let clock=performance.now();for(let i=0;i<180;i++){const fn=[...current.scene.frames.values()][0].fn;for(const item of current.scene.frames.values())hold.cancelBackgroundFrame(item.handle);current.scene.frames.clear();fn(clock+=60);if(current.diagnostics.performance.profile==='low')break;}for(const item of current.scene.frames.values())hold.cancelBackgroundFrame(item.handle);current.scene.frames.clear();`);
  const automatic=await sample('automatic-level-change');assert(automatic.blackFraction<.05&&automatic.performance.profile==='low'&&automatic.performance.targetFps===60);report.checks.push('Automatic downshift never clears the frame it has just rendered');

 }
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error}
finally{writeFileSync(resolve(out,'result.json'),JSON.stringify(report,null,2));await b?.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify(report));
