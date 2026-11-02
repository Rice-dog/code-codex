import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {buildBackgroundWorker} from '../packages/explorer-ui/scripts/build-background-worker.mjs';
import {launchFixture,delay} from './browser-fixture.mjs';
import {createWaterPointerProjection} from '../packages/explorer-ui/plugins/appearance/shallow-ocean/source/water-pointer.js';
import {install} from '../packages/explorer-ui/plugins/appearance/shallow-ocean/source/opening-animation.js';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),diagnose=process.argv.includes('--diagnose'),out=resolve(root,'artifacts/ocean-intro-pointer',diagnose?'before':'after');await mkdir(out,{recursive:true});
const T=createRequire(resolve(ui,'package.json'))('three-ocean-r128'),checks=[];
for(const [w,h] of [[900,600],[390,844],[1600,900]])for(const intensity of [1,2]){
 const camera=new T.OrthographicCamera(-10*w/h,10*w/h,10,-10,.1,80);camera.position.set(0,-.01,35);camera.lookAt(0,0,0);
 const body={style:{setProperty(){}},classList:{toggle(){},remove(){}}},motion=Object.assign(new EventTarget(),{matches:false}),scope={};install(scope,{body},{},()=>motion);
 const intro=scope.OceanOpening.create({camera,body});intro.replay({duration:5.2,intensity});const project=createWaterPointerProjection(T,camera,(x,y)=>({u:x/(20*w/h)+.5,v:y/20+.5}));
 let previous=0;for(const time of [0,.7,1.3,2.6,4.9]){intro.advance(time-previous);previous=time;for(const [u,v] of [[.25,.35],[.5,.5],[.7,.65]]){const p=project(u,v),q=new T.Vector3((p.u-.5)*20*w/h,(p.v-.5)*20,0).project(camera);assert(Math.abs((q.x+1)/2-u)<1e-7);assert(Math.abs((q.y+1)/2-v)<1e-7);}}
 intro.finish();assert.equal(camera.zoom,1);assert.equal(camera.position.y,-.01);intro.dispose();
}
checks.push('Real Three camera ray/sea projection roundtrips at5 opening phases,2 intensities and3 aspect ratios; final framing restored');
const probe=String.raw`
 let probeIntro,probeCamera,probeEvent;
 const createOpening=window.OceanOpening.create;
 window.OceanOpening.create=(args)=>{probeCamera=args.camera;return probeIntro=createOpening(args);};
 const dispatch=scope.canvas.dispatchEvent.bind(scope.canvas);
 scope.canvas.dispatchEvent=event=>{probeEvent=event.type.startsWith('pointer')?event:null;try{return dispatch(event);}finally{probeEvent=null;}};
 const createWater=window.OceanWaterSeabed.createWaterAndSeabedSystem;
 window.OceanWaterSeabed.createWaterAndSeabedSystem=(args)=>{const water=createWater(args),add=water.addWaterImpulseUv;
  water.addWaterImpulseUv=(...values)=>{if(probeEvent){const point=water.toWorld(values[0],values[1]),screen=new window.THREE.Vector3(point.x,point.y,0).project(probeCamera),rect=scope.canvas.getBoundingClientRect();postMessage({__oceanPointerProbe:true,eventType:probeEvent.type,inputX:probeEvent.clientX,inputY:probeEvent.clientY,u:values[0],v:values[1],screenX:rect.left+(screen.x+1)*scope.width/2,screenY:rect.top+(1-screen.y)*scope.height/2,intro:probeIntro.snapshot(),rippleStrength:values[4]});}return add(...values);};return water;};
`;
const instrumentation={name:'test-only-water-observation',setup(b){
 b.onLoad({filter:/shallow-ocean[\\/]install-scene\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('install9(window,document,window,matchMedia);','install9(window,document,window,matchMedia);'+probe),loader:'js',resolveDir:resolve(args.path,'..')}));
 if(diagnose)b.onLoad({filter:/background-runtime[\\/]ocean-kernel\.ts$/},async args=>({contents:await readFile(resolve(root,'local-design-docs/evidence/2026-11-02/ocean-intro-pointer/before/packages/explorer-ui/src/core/background-runtime/ocean-kernel.ts'),'utf8'),loader:'ts',resolveDir:resolve(args.path,'..')}));
}};
const worker=(await buildBackgroundWorker(ui,{absWorkingDir:ui,bundle:true,target:'chrome120',loader:{'.frag':'text'},plugins:[instrumentation]},'','',`export {oceanMethods as kernelMethods,createOceanKernel as createKernel} from './src/core/background-runtime/ocean-kernel';`)).source;
const bundle=(await build({stdin:{contents:`import {OceanWorkerRenderer} from './core/background-runtime/ocean-worker-renderer';import {DEFAULT_OPTIONS} from './effects/shallow-ocean/options';window.probes=[];window.errors=[];const NativeWorker=Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.__oceanPointerProbe)probes.push(e.data);});}};window.options={...DEFAULT_OPTIONS,introDuration:12,performanceMode:1,eventsEnabled:0};window.make=async(interactive=true)=>{window.renderer?.dispose();document.querySelector('#layer').replaceChildren();const canvas=document.createElement('canvas');document.querySelector('#layer').append(canvas);window.renderer=new OceanWorkerRenderer(${JSON.stringify(worker)},document.querySelector('#layer'),canvas,options,e=>errors.push(e),interactive);await renderer.ready;};`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle:'<!doctype html><style>body{margin:0;background:#123}#layer{position:absolute;left:37px;top:23px;width:900px;height:600px}canvas{width:100%;height:100%}</style><div id="layer"></div><button id="control">Control</button><script src="/fixture.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`);let passed=false;
const ev=source=>browser.evaluate(source),wait=async source=>{for(let i=0;i<180;i++){if(await ev(source))return;await delay(100);}throw Error('Did not settle: '+source);};
const move=async(x,y,target='window')=>{await ev(`${target}.dispatchEvent(new PointerEvent('pointermove',{clientX:${x},clientY:${y},pointerId:1,bubbles:true}));void 0`);await delay(160);};
try{
 await ev('make()');await wait('renderer.diagnostics?.intro?.active===true');await move(450,270);
 if(diagnose){assert.equal(await ev('probes.length'),0);checks.push('Baseline real worker suppresses mouse waves while opening is active');passed=true;}
 else{
  await wait('probes.length>0');let first=await ev('probes.at(-1)');assert(first.intro.active);assert(Math.abs(first.screenX-first.inputX)<2&&Math.abs(first.screenY-first.inputY)<2);checks.push('Initial opening accepts real water impulses at the cursor through the production worker input path');
  for(const type of ['pointerdown','pointerup'])await ev(`window.dispatchEvent(new PointerEvent('${type}',{clientX:450,clientY:270,pointerId:1,button:0}));void 0`);await delay(180);assert(await ev("probes.every(p=>p.eventType==='pointermove')"));checks.push('Opening click/action guard remains active');
  await ev('window.beforeControl=probes.length');await move(500,330,"document.querySelector('#control')");assert(await ev('probes.length===beforeControl'));checks.push('Native-style controls remain filtered from background input');
  await browser.command('Page.captureScreenshot',{format:'png'}).then(s=>writeFile(resolve(out,'opening-ripple.png'),Buffer.from(s.data,'base64')));
  await ev('renderer.replay();probes.length=0');await delay(180);await move(570,410);await wait('probes.length>0');assert(await ev('probes.at(-1).intro.active'));checks.push('Replayed opening remains water-interactive');
  await ev("document.querySelector('#layer').style.width='390px';document.querySelector('#layer').style.height='844px';renderer.replay();probes.length=0");await delay(220);await move(210,420);await wait('probes.length>0');const narrow=await ev('probes.at(-1)');assert(narrow.intro.active);assert(Math.abs(narrow.screenX-narrow.inputX)<2&&Math.abs(narrow.screenY-narrow.inputY)<2);checks.push('Narrow, offset viewport keeps ripple under the cursor while the camera moves');
  await ev('renderer.setSettings({...options,introEnabled:0});probes.length=0');await delay(200);await move(260,520);await wait('probes.length>0');const normal=await ev('probes.at(-1)');assert(!normal.intro.active);assert(Math.abs(normal.u-(260-37)/390)<.002);checks.push('Disabled/finished opening retains ordinary screen mapping');
  await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(180);await ev('renderer.setSettings(options);renderer.replay()');await wait('renderer.diagnostics?.intro?.active===false');assert(await ev('renderer.diagnostics.paused&&errors.length===0'));checks.push('Reduced motion still completes the intro and holds a static scene');
  await browser.command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await ev('(async()=>{await make(false);probes.length=0;})()');await move(250,380);assert.equal(await ev('probes.length'),0);checks.push('Noninteractive startup/preview copy forwards no pointer input');
  await wait('typeof renderer.diagnostics.glError==="number"');assert(await ev('renderer.diagnostics.glError===0&&errors.length===0'));await ev('renderer.dispose()');await delay(350);assert.equal(await ev("window[Symbol.for('code-codex:background-isolation:v1')].size"),0);checks.push('Real worker/WebGL has no error and disposal releases its session');passed=true;
 }
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({error:String(error),diagnostics:await ev('renderer?.diagnostics'),errors:await ev('errors'),probes:await ev('probes.slice(-4)')},null,2));throw error;}
finally{await ev('renderer?.dispose()').catch(()=>{});await browser.close();await new Promise(r=>server.close(r));await writeFile(resolve(out,'result.json'),JSON.stringify({passed,diagnose,checks,scope:'Production worker and real WebGL with test-only water API observation; synthetic pointer delivery, no account/API mutations'},null,2));}
console.log(JSON.stringify({passed,checks}));
