import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSync } from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';

// The fixture uses the real production source graph and explorer bundle in its
// own loopback origin/profile. It never reads user image files, modifies the
// user's settings, or connects to the currently running Codex application.
const root = resolve(import.meta.dirname, '..');
const label = process.argv[2] ?? `current-${Date.now()}`;
assert.match(label, /^[a-zA-Z0-9_-]+$/);
const directory = join(root, 'artifacts', `startup-image-backgrounds-${label}`);
assert.ok(!existsSync(join(directory, 'results.json')), 'use a new evidence label; historical reports are immutable');
mkdirSync(directory, { recursive: true });
const bundle = readFileSync(join(root, 'packages/explorer-ui/dist/explorer.js'));
const earlyBundle = readFileSync(join(root, 'packages/explorer-ui/dist/startup-early.js'));
const originalPixelImage = readFileSync(join(root, 'packages/explorer-ui/src/pixel-sculpt-default.png'));
const startupPixelImage = readFileSync(join(root, 'packages/explorer-ui/src/pixel-sculpt-startup-default.webp'));
const startupPixelURL = `data:image/webp;base64,${startupPixelImage.toString('base64')}`;
const originalPixelURL = `data:image/png;base64,${originalPixelImage.toString('base64')}`;
const earlyGate = 'window===window.top&&location.protocol==="app:"&&location.host==="-"&&location.pathname==="/index.html"&&!location.search';
assert.equal(earlyBundle.toString('utf8').split(earlyGate).length, 2, 'actual early bundle has the one expected app-origin qualification gate');
// The only adaptation to this ACTUAL production early bundle is its app:// gate,
// required by the separate loopback test browser. No player/renderer code changes.
const earlyFixture = earlyBundle.toString('utf8').replace(earlyGate, 'window===window.top');
const version = bundle.toString('utf8').match(/current version v(\d+\.\d+\.\d+)/)?.[1];
assert.ok(version, 'production bundle version found');
const tag = `code-codex-v${version.replaceAll('.', '-')}`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const seamEntry = `import { STARTUP_BACKGROUNDS, mountStartupBackground } from './startup-background';
import { mountStartupTransition } from './startup-transition';
import { startEarlyStartupTransition, readStartupTransitionSettings } from './startup-transition-plugin';
import { registerBackgroundOpening, setStartupBackgroundHold } from './background-startup-hold';
import { PixelSculptRenderer } from './pixel-sculpt-renderer';
window.imageStartupFixture = { STARTUP_BACKGROUNDS, mountStartupBackground, mountStartupTransition, startEarlyStartupTransition, readStartupTransitionSettings, registerBackgroundOpening, setStartupBackgroundHold, PixelSculptRenderer };`;
const seam = buildSync({
  stdin: { contents: seamEntry, resolveDir: join(root, 'packages/explorer-ui/src'), loader: 'ts' },
  bundle: true, write: false, format: 'iife', target: 'chrome120',
  define: {
    __CODE_CODEX_PIXEL_SCULPT_IMAGE__: JSON.stringify(startupPixelURL),
    __CODE_CODEX_STARTUP_TRANSITION_CSS__: JSON.stringify(readFileSync(join(root, 'packages/explorer-ui/src/startup-transition.css'), 'utf8')),
  },
}).outputFiles[0].text;
writeFileSync(join(directory, 'source-entry.txt'), seamEntry);
const home = `<nav data-app-navigation-rail="true"><button data-sidebar-destination="builtin:home" aria-current="page">Home</button></nav><button hidden data-app-shell-sidebar-trigger></button><div data-app-shell-workspace-row="true"><aside class="app-shell-left-panel"><div class="sidebar-navigation"><button data-app-action-sidebar-thread-active="true" data-app-action-sidebar-thread-host-id="local" data-app-action-sidebar-thread-kind="local" data-app-action-sidebar-thread-id="local:thread_image_background_fixture">Fixture project</button></div></aside><div data-app-shell-active-page="true" style="display:contents"><div class="_Workspace_fixture" data-app-shell-page-surface="true"><header data-app-shell-titlebar="true"><span data-app-shell-titlebar-content>Fixture conversation</span></header><div class="_MainContentClip_fixture"><main data-app-shell-main-surface="default"><div class="_WorkspaceContent_fixture"><article data-response-annotation-conversation="thread_image_background_fixture">Fixture contents</article><div data-thread-scroll-footer="true"><div data-above-composer-conversation-id="thread_image_background_fixture"></div><form data-codex-composer><textarea aria-label="Message"></textarea><button>Send</button></form></div></div></main></div></div></div></div>`;
const instrumentation = `
window.fixtureErrors=[];window.fixtureDraws={};window.fixtureUniforms={};window.fixtureURLs=new Set();window.fixtureErrorsBySource={};window.fixturePixelSamples={};
addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=b=>{const u=createURL(b);fixtureURLs.add(u);return u};URL.revokeObjectURL=u=>{fixtureURLs.delete(u);return revokeURL(u)};
const fixtureCase=canvas=>canvas.closest('[data-fixture-case]')?.dataset.fixtureCase ?? (canvas.getRootNode().host?.classList.contains('code-codex-startup-host')?(window.fixtureCaseLabel??'early-unassigned'):'unassigned');
for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
  const names=new WeakMap(),get=proto.getUniformLocation;
  proto.getUniformLocation=function(program,name){const location=get.call(this,program,name);if(location)names.set(location,name);return location};
  for(const method of ['uniform1f','uniform1i','uniform2f','uniform3f','uniform4f']){const old=proto[method];proto[method]=function(location,...values){const name=names.get(location),id=fixtureCase(this.canvas);if(name)(fixtureUniforms[id]??={})[name]=values;return old.call(this,location,...values)}}
  for(const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const old=proto[method];if(!old)continue;proto[method]=function(...values){const id=fixtureCase(this.canvas);fixtureDraws[id]=(fixtureDraws[id]??0)+1;const result=old.apply(this,values);if(id==='pixel-default-no-gallery'){const rgba=new Uint8Array(4),samples=[];for(let y=1;y<=5;y++)for(let x=1;x<=5;x++){this.readPixels(Math.floor(this.drawingBufferWidth*x/6),Math.floor(this.drawingBufferHeight*y/6),1,1,this.RGBA,this.UNSIGNED_BYTE,rgba);samples.push([...rgba])}fixturePixelSamples[id]=samples}return result}}
}
window.fixtureStorageSnapshot=async()=>{
  const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const library=async name=>new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('images',{keyPath:'id'});q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,r=db.transaction('images').objectStore('images').getAll();r.onerror=()=>{db.close();reject(r.error)};r.onsuccess=async()=>{db.close();resolve(await Promise.all(r.result.map(async record=>{const result={};for(const [key,value] of Object.entries(record))result[key]=value instanceof Blob?{size:value.size,type:value.type,hash:await digest(value),...(value instanceof File?{name:value.name}:{})}:value;return result})))}}});
  return {settings:Object.fromEntries(Object.entries(localStorage).sort()),particle:await library('code-codex-particle-image-background'),pixel:await library('code-codex-pixel-sculpt')};
};
window.fixtureSeed=async()=>{
  const image=async color=>{const c=document.createElement('canvas');c.width=96;c.height=64;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,96,64);x.fillStyle='#fff';x.fillRect(16,16,48,32);return new Promise(r=>c.toBlob(r,'image/png'))};
  const first=await image('#ff0066'),second=await image('#0066ff');
  const save=async(name,records)=>new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('images',{keyPath:'id'});q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('images','readwrite'),store=tx.objectStore('images');store.clear();records.forEach(r=>store.put(r));tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}}});
  await save('code-codex-particle-image-background',[{id:'fixture-first',name:'fixture-first.png',type:'image/png',size:first.size,createdAt:1,blob:first,thumbnail:first,positionX:50,positionY:50,zoom:1},{id:'fixture-chosen',name:'fixture-chosen.png',type:'image/png',size:second.size,createdAt:2,blob:second,thumbnail:second,positionX:23,positionY:67,zoom:1.4}]);
  await save('code-codex-pixel-sculpt',[{id:1,file:new File([first],'fixture-first.png',{type:'image/png'}),order:0},{id:2,file:new File([second],'fixture-chosen.png',{type:'image/png'}),order:1}]);
  localStorage.setItem('code-codex:particle-image-background:v1',JSON.stringify({particleCount:10000,particleSize:2.1,particleOpacity:.73,speed:.4,selectedImageIds:['fixture-first','fixture-chosen'],activeImageId:'fixture-chosen',autoSwitch:false,imageOpacity:.8,showSourceImage:true,backgroundColor:'#102030',cursorInteraction:true}));
  localStorage.setItem('code-codex:pixel-sculpt-settings:v1',JSON.stringify({resolution:48,depth:12,gap:.12,shape:'square',tilt:23,scale:1.05,dpr:1,galleryAuto:false,auto:false,displayTime:4,transitionDuration:.8,backgroundColor:'#102030'}));
  localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:false,source:'background',backgroundId:'particle-image',backgroundFadeSeconds:.6}));
  localStorage.setItem('fixture:normal-background-preference','unchanged');
};`;
const baseStyles = `*{box-sizing:border-box}html,body{height:100%;width:100%;margin:0}body{font:13px 'Segoe UI';color:#ddd;background:#181818}.test-source{width:640px;height:360px;position:relative;overflow:hidden}#native-root{height:100%;display:flex}nav{width:50px;flex:none}aside{width:220px;flex:none}[data-app-shell-workspace-row]{display:flex;flex:1;min-width:0;height:100%}._Workspace_fixture{display:contents}._MainContentClip_fixture{display:flex;flex:1;min-width:0}main{position:relative;flex:1;min-width:0;display:flex;flex-direction:column;margin-top:8px;background:#181818}header[data-app-shell-titlebar]{position:fixed;left:270px;top:8px;height:52px;right:0;pointer-events:none}._WorkspaceContent_fixture{flex:1;display:flex;flex-direction:column;min-height:0;padding-top:52px}article{flex:1;padding:25px}textarea{height:80px;width:100%}form{padding:12px;margin:10px;border:1px solid #444;border-radius:12px}`;
const bridge = `window.__CODE_CODEX_BOOTSTRAP__={token:'fixture',codexVersion:'26.928.2636.0',supported:true};window.__codeCodex={request:async({method,params})=>{if(method==='explorer.settings.get'||method==='explorer.settings.set')return {collapsed:false,panelWidth:260};if(method==='explorer.context')return {threadId:params.threadId,projectName:'Fixture',rootName:'Fixture',compatible:true};if(method==='explorer.list')return {entries:[{name:'README.md',relativePath:'README.md',kind:'file'}]};if(method==='explorer.watch.start')return {watching:true};return {};}};`;
const page = ui => `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="modulepreload" href="/app-initial-image-backgrounds.js"><style>${baseStyles}</style></head><body>${ui?`<div id="native-root">${home}</div>`:'<main class="main-surface"></main><div id="loading">Loading</div>'}<script>${instrumentation}${ui?bridge:''}</script>${ui?'<script src="/explorer.js"></script>':'<script src="/seams.js"></script>'}</body></html>`;
writeFileSync(join(directory, 'fixture-bare.html'), page(false));
writeFileSync(join(directory, 'fixture-ui.html'), page(true));
const server = createServer((request, response) => {
  if(request.url==='/explorer.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle)}
  else if(request.url==='/seams.js'){response.setHeader('Content-Type','text/javascript');response.end(seam)}
  else if(request.url==='/default-source.png'){response.setHeader('Content-Type','image/png');response.end(originalPixelImage)}
  else if(request.url==='/default-startup.webp'){response.setHeader('Content-Type','image/webp');response.end(startupPixelImage)}
  else if(request.url==='/app-initial-image-backgrounds.js'){response.setHeader('Content-Type','text/javascript');response.end(`export const adapter={appActions:{runInPrimaryWindow:async({action})=>({mode:action.mode??'dark'})},clientCoordination:{invalidateQueryCache:async()=>({})}};`)}
  else{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(page(request.url==='/ui'))}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = mkdtempSync(join(tmpdir(),'code-codex-startup-image-test-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--window-size=1500,1000','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
const report={version,mode:'isolated production UI bundle and production source graph with the production early WebP define',date:new Date().toISOString(),bundleSha256:sha(bundle),earlyBundleSha256:sha(earlyBundle),earlyBundleBytes:earlyBundle.length,earlyOriginAdapter:{original:earlyGate,replacement:'window===window.top',replacements:1,adaptedSha256:sha(earlyFixture)},startupAsset:{path:'packages/explorer-ui/src/pixel-sculpt-startup-default.webp',bytes:startupPixelImage.length,sha256:sha(startupPixelImage),originalPath:'packages/explorer-ui/src/pixel-sculpt-default.png',originalBytes:originalPixelImage.length,originalSha256:sha(originalPixelImage)},seamSha256:sha(seam),sourceFiles:{},checks:[],sources:[],browserErrors:[],failures:[],cleanup:{},limitations:['Synthetic native shell and generated PNG media; no official Codex cold launch or user media','Only the actual early bundle app-origin gate is adapted for its loopback fallback test','Software WebGL fixture; no long-running physical GPU/performance certification','Saved-library snapshots prove records/settings preservation; empty Pixel library schema creation is permitted']};
for(const file of ['startup-background.ts','startup-transition.ts','startup-transition-plugin.ts','particle-image-startup.ts','pixel-sculpt-renderer.ts','pixel-sculpt-runtime.ts'])report.sourceFiles[file]=sha(readFileSync(join(root,'packages/explorer-ui/src',file)));
let socket,session,sequence=0;
const pending=new Map();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const command=(method,params={},targetSession=session)=>new Promise((resolveCommand,rejectCommand)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);rejectCommand(new Error(`CDP timeout: ${method}`))},20000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolveCommand(r)},reject:e=>{clearTimeout(timeout);rejectCommand(e)}});socket.send(JSON.stringify({id,method,params,...(targetSession?{sessionId:targetSession}:{})}))});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const check=(name,actual,passed)=>{report.checks.push({name,actual,passed});if(!passed)report.failures.push(name)};
const navigate=async route=>{await command('Page.navigate',{url:origin+route});for(let i=0;i<120;i++){if(await evaluate(route==='/ui'?`document.querySelector('${tag}')?.dataset.state==='ready'`:'!!window.imageStartupFixture'))return;await delay(50)}throw Error('fixture did not become ready: '+route)};
const screenshot=async name=>{const result=await command('Page.captureScreenshot',{format:'png'});writeFileSync(join(directory,`${name}.png`),Buffer.from(result.data,'base64'))};
const errors=async name=>{const observed=await evaluate('window.fixtureErrors');report.browserErrors.push({name,errors:observed});check(name+': no unhandled browser errors',observed,observed.length===0)};
try{
  const wsURL=await new Promise((r,j)=>{let log='';const timer=setTimeout(()=>j(Error('Chrome endpoint timeout')),15000);browser.stderr.on('data',b=>{log+=b;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);r(match[1])}});browser.once('error',e=>{clearTimeout(timer);j(e)})});
  socket=new WebSocket(wsURL);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});socket.onmessage=event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};
  const {targetInfos}=await command('Target.getTargets');({sessionId:session}=await command('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true}));await command('Page.enable');await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/bare');await evaluate('fixtureSeed()');
  check('actual production early bundle stays below the launcher 512 KiB limit',earlyBundle.length,earlyBundle.length<512*1024);
  check('production early embeds only the optimized default; main keeps original default',{earlyWebP:earlyBundle.includes(startupPixelURL),earlyPNG:earlyBundle.includes(originalPixelURL),mainPNG:bundle.includes(originalPixelURL),mainWebP:bundle.includes(startupPixelURL)},earlyBundle.includes(startupPixelURL)&&!earlyBundle.includes(originalPixelURL)&&bundle.includes(originalPixelURL)&&!bundle.includes(startupPixelURL));
  const provenance=await evaluate(`(async()=>{const source=await createImageBitmap(await(await fetch('/default-source.png')).blob()),startup=await createImageBitmap(await(await fetch('/default-startup.webp')).blob());const sample=bitmap=>{const c=document.createElement('canvas');c.width=64;c.height=64;const context=c.getContext('2d');context.drawImage(bitmap,0,0,64,64);return context.getImageData(0,0,64,64).data};const a=sample(source),b=sample(startup);let error=0;for(let i=0;i<a.length;i++)if(i%4!==3)error+=Math.abs(a[i]-b[i]);const result={source:{width:source.width,height:source.height},startup:{width:startup.width,height:startup.height},meanRGBError:error/(64*64*3)};source.close();startup.close();return result})()`);
  report.startupAsset.visualProvenance=provenance;
  check('optimized default preserves the original flower image composition',provenance,provenance.startup.width===512&&provenance.startup.height===512&&provenance.meanRGBError<15);
  const seeded=await evaluate('fixtureStorageSnapshot()');
  const catalog=await evaluate('imageStartupFixture.STARTUP_BACKGROUNDS');
  check('startup catalog contains ten unique sources including both image backgrounds',catalog,catalog.length===10&&new Set(catalog.map(([id])=>id)).size===10&&['particle-image','pixel-sculpt'].every(id=>catalog.some(([value])=>id===value)));
  for(const id of ['particle-image','pixel-sculpt']){
    await evaluate(`(()=>{const target=document.createElement('div');target.className='test-source';target.dataset.fixtureCase=${JSON.stringify(id)};document.body.append(target);window.fixtureTarget=target;window.sourceErrors=[];window.renderer=imageStartupFixture.mountStartupBackground(target,${JSON.stringify(id)},message=>{if(message)sourceErrors.push(message)});window.sourceReady=false;window.sourceError=null;window.sourceDrawsAtReady=0;Promise.resolve(renderer.ready).then(()=>{sourceDrawsAtReady=fixtureDraws[${JSON.stringify(id)}]??0;sourceReady=true},error=>sourceError=String(error));window.immediateSourceState={ready:sourceReady,draws:fixtureDraws[${JSON.stringify(id)}]??0,error:sourceError}})()`);
    const immediate=await evaluate('immediateSourceState');
    check(`${id}: async media readiness does not resolve at construction`,immediate,!immediate.ready);
    for(let i=0;i<200&&!(await evaluate('sourceReady||sourceError'));i++)await delay(50);
    const rendered=await evaluate(`({ready:sourceReady,error:sourceError,errors:sourceErrors,draws:fixtureDraws[${JSON.stringify(id)}]??0,drawsAtReady:sourceDrawsAtReady,uniforms:fixtureUniforms[${JSON.stringify(id)}]??{},images:[...fixtureTarget.querySelectorAll('img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight,src:i.src,transform:i.style.transform,position:i.style.objectPosition})),canvases:[...fixtureTarget.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height}))})`);
    report.sources.push({id,immediate,rendered});
    check(`${id}: ready after actual renderer first draw`,rendered,rendered.ready&&!rendered.error&&rendered.drawsAtReady>0&&rendered.canvases.length>0);
    check(`${id}: valid saved local media produces no renderer errors`,rendered.errors,rendered.errors.length===0);
    if(id==='particle-image'){
      check('Particle startup restores active photo framing',rendered.images,rendered.images.some(image=>image.width>0&&image.height>0&&image.transform==='scale(1.4)'&&image.position==='23% 67%'));
      check('Particle startup uses saved particle settings in real GL draw',rendered.uniforms,Math.abs((rendered.uniforms.u_particleSize?.[0]??0)-2.1)<.001&&Math.abs((rendered.uniforms.u_particleOpacity?.[0]??0)-.73)<.001);
    }else{
      check('Pixel startup uses saved relief settings in real GL draw',rendered.uniforms,Math.abs((rendered.uniforms.uDepth?.[0]??0)-12)<.001&&Math.abs((rendered.uniforms.uGap?.[0]??0)-.12)<.001);
      check('Pixel startup canvas follows its target preview size',rendered.canvases,rendered.canvases.some(canvas=>canvas.width===640&&canvas.height===360));
    }
    await screenshot(`${id}-saved-media`);
    await evaluate('renderer.dispose();fixtureTarget.remove()');await delay(350);
    const stopped=await evaluate(`({draws:fixtureDraws[${JSON.stringify(id)}]??0,urls:fixtureURLs.size})`);await delay(350);
    const stable=await evaluate(`({draws:fixtureDraws[${JSON.stringify(id)}]??0,urls:fixtureURLs.size})`);
    check(`${id}: disposal stops future rendering and releases object URLs`,{stopped,stable},stable.draws===stopped.draws&&stable.urls===0);
    check(`${id}: startup copy leaves normal settings and library unchanged`,await evaluate('fixtureStorageSnapshot()'),JSON.stringify(await evaluate('fixtureStorageSnapshot()'))===JSON.stringify(seeded));
  }
  await errors('direct startup renderers');
  // Shared Pixel renderer also backs the normal main layer: its first frame
  // may prepare while startup covers it; later frames must remain parked.
  await evaluate(`(()=>{const target=document.createElement('div');target.className='test-source';target.dataset.fixtureCase='pixel-main-held';target.dataset.codeCodexParticleLayer='v1';const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%';target.append(canvas);document.body.append(target);const controls=document.createElement('div');controls.style.display='none';document.body.append(controls);window.pixelMainTarget=target;window.pixelMainControls=controls;imageStartupFixture.setStartupBackgroundHold(true);window.pixelMain=new imageStartupFixture.PixelSculptRenderer(target,canvas,{paused:false},()=>{},false);pixelMain.mountControls(controls,'en');imageStartupFixture.registerBackgroundOpening(target,pixelMain);pixelMain.setActive(true,{paused:false});window.pixelMainReady=false;Promise.all([pixelMain.ready,pixelMain.firstFrame]).then(()=>pixelMainReady=true)})()`);
  for(let i=0;i<200&&!(await evaluate('pixelMainReady'));i++)await delay(50);
  const held=await evaluate(`({draws:fixtureDraws['pixel-main-held']??0,galleryCount:pixelMainControls.querySelector('#galleryCount')?.value,liveName:pixelMainControls.querySelector('.gallery-item.is-active .gallery-name')?.textContent,resolution:pixelMainControls.querySelector('#res')?.value,depth:pixelMainControls.querySelector('#depth')?.value})`);
  await delay(450);const heldLater=await evaluate(`fixtureDraws['pixel-main-held']??0`);
  check('shared Pixel renderer restores saved local gallery selection and parameters',held,held.galleryCount==='1 / 2'&&held.liveName==='fixture-chosen.png'&&held.resolution==='48'&&held.depth==='12');
  check('normal Pixel main layer prepares first frame but does not advance while covered',{held:held.draws,later:heldLater},held.draws>0&&held.draws===heldLater);
  await evaluate('imageStartupFixture.setStartupBackgroundHold(false)');await delay(250);
  const resumed=await evaluate(`fixtureDraws['pixel-main-held']??0`);
  check('normal Pixel main layer resumes when startup releases hold',{held:heldLater,resumed},resumed>heldLater);
  await evaluate('pixelMain.dispose();pixelMainTarget.remove();pixelMainControls.remove()');await delay(150);
  check('normal Pixel renderer read-only test preserves persisted state',await evaluate('fixtureStorageSnapshot()'),JSON.stringify(await evaluate('fixtureStorageSnapshot()'))===JSON.stringify(seeded));
  // Dispose in the same event turn, before IndexedDB/decode can complete.
  for(const id of ['particle-image','pixel-sculpt']){
    await evaluate(`(()=>{const target=document.createElement('div');target.className='test-source';target.dataset.fixtureCase='cancel-'+${JSON.stringify(id)};document.body.append(target);window.cancelTarget=target;window.cancelErrors=[];window.canceled=imageStartupFixture.mountStartupBackground(target,${JSON.stringify(id)},message=>{if(message)cancelErrors.push(message)});window.cancelSettled=false;Promise.resolve(canceled.ready).then(()=>cancelSettled=true,()=>cancelSettled=true);canceled.dispose();target.remove()})()`);
    await delay(1200);
    const canceled=await evaluate(`({settled:cancelSettled,connected:cancelTarget.isConnected,draws:fixtureDraws['cancel-'+${JSON.stringify(id)}]??0,urls:fixtureURLs.size,children:cancelTarget.childElementCount})`);
    await delay(300);const lateDraws=await evaluate(`fixtureDraws['cancel-'+${JSON.stringify(id)}]??0`);
    check(`${id}: disposal during media initialization cannot resurrect renderer`,{...canceled,lateDraws},canceled.settled&&!canceled.connected&&canceled.draws===lateDraws&&canceled.urls===0);
  }
  await errors('loading cancellation');
  // Test the real Preview Market and its open startup settings panel.
  await navigate('/ui');
  const shadow=`document.querySelector('${tag}').shadowRoot`;
  await evaluate(`(()=>{const e=document.querySelector('${tag}');e.openPreviewMarket();${shadow}.querySelector('[data-appearance-plugin="code-codex.startup-transition"]').scrollIntoView({block:'center'});${shadow}.querySelector('.startupTransition-settings-trigger').click()})()`);await delay(250);
  const market=await evaluate(`(()=>{const s=${shadow};return {market:[...s.querySelectorAll('[data-appearance-plugin] h4')].map(e=>e.textContent).filter(name=>name.endsWith(' Background')&&name!=='Transparent Background'),options:[...s.querySelector('#cle-startupTransition-background').options].map(o=>({id:o.value,name:o.textContent}))}})()`);
  check('real startup selector matches every dynamic Preview Market background',market,market.market.length===10&&market.options.length===10&&market.market.every(name=>market.options.some(option=>option.name===name)));
  const uiSettingsBefore=await evaluate('fixtureStorageSnapshot()');
  for(const id of ['particle-image','pixel-sculpt']){
    await evaluate(`(()=>{const s=${shadow},source=s.querySelector('#cle-startupTransition-source'),select=s.querySelector('#cle-startupTransition-background');source.value='background';source.dispatchEvent(new Event('change',{bubbles:true}));select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(1500);
    const preview=await evaluate(`(()=>{const s=${shadow},live=s.querySelector('.startupTransition-background-live');return {saved:JSON.parse(localStorage.getItem('code-codex:startup-transition:v1')),open:s.querySelector('#cle-startupTransition-settings').matches(':popover-open'),canvases:live?.querySelectorAll('canvas').length??0,live:!!live,errors:fixtureErrors}})()`);
    check(`${id}: selecting source immediately displays settings preview and preserves selection`,preview,preview.open&&preview.live&&preview.canvases>0&&preview.saved.backgroundId===id&&preview.saved.source==='background');
    await screenshot(`${id}-settings-preview`);
  }
  await evaluate(`${shadow}.querySelector('.startupTransition-close').click()`);await delay(350);
  const uiSettingsAfter=await evaluate('fixtureStorageSnapshot()');
  delete uiSettingsBefore.settings['code-codex:startup-transition:v1'];delete uiSettingsAfter.settings['code-codex:startup-transition:v1'];
  check('settings previews preserve all normal background preferences and saved libraries',{before:uiSettingsBefore,after:uiSettingsAfter},JSON.stringify(uiSettingsBefore)===JSON.stringify(uiSettingsAfter));
  await errors('real market previews');
  // Real early launch path: four visible seconds, native readiness, live fade.
  for(const id of ['particle-image','pixel-sculpt']){
    await navigate('/bare');await evaluate(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:${JSON.stringify(id)},backgroundFadeSeconds:.6}))`);
    const before=await evaluate('fixtureStorageSnapshot()');
    await evaluate(`window.earlyStartedAt=performance.now();window.earlyResolved=false;window.earlyController=null;window.earlyError=null;imageStartupFixture.startEarlyStartupTransition().then(c=>{earlyController=c;earlyResolved=true;window.earlyRevealedAt=performance.now()},e=>{earlyError=String(e);earlyResolved=true})`);
    for(let i=0;i<200&&!(await evaluate('earlyResolved'));i++)await delay(50);
    const start=await evaluate(`({controller:!!earlyController,error:earlyError,phase:earlyController?.phase,minimum:earlyController?.minimumRemainingMs,host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active})`);
    check(`${id}: early startup waits for saved media and reveals loading animation`,start,start.controller&&!start.error&&start.phase==='loading'&&start.host&&start.held&&start.minimum>3000);
    await evaluate(`document.querySelector('main').innerHTML='<form><button>Send</button></form>';document.body.insertAdjacentHTML('beforeend','<nav data-app-navigation-rail></nav>')`);await delay(700);
    const minimum=await evaluate(`({phase:earlyController?.phase,elapsed:performance.now()-earlyRevealedAt,minimum:earlyController?.minimumRemainingMs})`);
    check(`${id}: native ready cannot bypass four-second visible minimum`,minimum,minimum.phase==='loading'&&minimum.elapsed<4000&&minimum.minimum>0);
    for(let i=0;i<140&&await evaluate(`earlyController?.phase`)==='loading';i++)await delay(40);
    const fade=await evaluate(`(()=>{const host=document.querySelector('body>.code-codex-startup-host'),overlay=host?.shadowRoot.querySelector('.codex-startup'),events=window[Symbol.for('code-codex:runtime-events:v1')]?.events??[];return {phase:earlyController?.phase,elapsed:performance.now()-earlyRevealedAt,opacity:overlay?Number(getComputedStyle(overlay).opacity):null,held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,fadeEvents:events.filter(e=>e.action==='fade')}})()`);
    check(`${id}: fade follows minimum and keeps normal background held`,fade,fade.phase==='exiting'&&fade.elapsed>=3900&&fade.held&&fade.fadeEvents.some(e=>e.details.durationMs===600&&e.details.minimumVisibleMs===4000));
    await delay(200);const opacity=await evaluate(`Number(getComputedStyle(document.querySelector('body>.code-codex-startup-host')?.shadowRoot.querySelector('.codex-startup')).opacity)`);
    check(`${id}: fade visibly interpolates opacity`,opacity,opacity>0&&opacity<1);
    await delay(650);
    const complete=await evaluate(`({phase:earlyController?.phase,host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,urls:fixtureURLs.size})`);
    check(`${id}: fade completes and releases host, normal-background hold and media URLs`,complete,complete.phase==='complete'&&!complete.host&&!complete.held&&complete.urls===0);
    check(`${id}: early startup leaves normal source preferences/library unchanged`,await evaluate('fixtureStorageSnapshot()'),JSON.stringify(await evaluate('fixtureStorageSnapshot()'))===JSON.stringify(before));
    await errors(`${id}: early startup`);
  }
  // No saved Pixel gallery: exercise the ACTUAL production early bundle, whose
  // default is the optimized flower WebP. Only its origin gate is adapted above.
  await navigate('/bare');await evaluate('fixtureSeed()');
  await evaluate(`(async()=>{await new Promise((r,j)=>{const q=indexedDB.open('code-codex-pixel-sculpt',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('images','readwrite');tx.objectStore('images').clear();tx.oncomplete=()=>{db.close();r()};tx.onerror=()=>j(tx.error)}});localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:'pixel-sculpt',backgroundFadeSeconds:.6}));window.fixtureCaseLabel='pixel-default-no-gallery'})()`);
  const fallbackBefore=await evaluate('fixtureStorageSnapshot()');
  await evaluate(earlyFixture);
  for(let i=0;i<200&&await evaluate('window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage')!=='playing';i++)await delay(50);
  const fallback=await evaluate(`({stage:window.__CODE_CODEX_EARLY_STARTUP_STATUS__?.stage,draws:fixtureDraws['pixel-default-no-gallery']??0,samples:fixturePixelSamples['pixel-default-no-gallery']??[],phase:window[Symbol.for('code-codex:startup-transition:controller:v1')]?.phase,minimum:window[Symbol.for('code-codex:startup-transition:controller:v1')]?.minimumRemainingMs,host:!!document.querySelector('body>.code-codex-startup-host')})`);
  report.defaultPixelFallback=fallback;
  check('actual early bundle renders default flower with no saved Pixel gallery',fallback,fallback.stage==='playing'&&fallback.draws>0&&fallback.host&&fallback.phase==='loading'&&fallback.minimum>3000);
  check('default fallback draws real multicolor relief pixels',fallback.samples,new Set(fallback.samples.map(rgba=>rgba.join(','))).size>3);
  await screenshot('pixel-sculpt-default-actual-early-bundle');
  await evaluate(`window[Symbol.for('code-codex:startup-transition:controller:v1')].dispose()`);await delay(150);
  const fallbackDisposed=await evaluate(`({host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,urls:fixtureURLs.size})`);
  check('default fallback disposal releases startup and preserves existing empty library/settings',{disposed:fallbackDisposed,before:fallbackBefore,after:await evaluate('fixtureStorageSnapshot()')},!fallbackDisposed.host&&!fallbackDisposed.held&&fallbackDisposed.urls===0&&JSON.stringify(await evaluate('fixtureStorageSnapshot()'))===JSON.stringify(fallbackBefore));
  await errors('production early default fallback');
  // Missing Particle media must fail with details, settle and release the hold.
  await navigate('/bare');
  await evaluate(`(async()=>{localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:'particle-image'}));await new Promise((r,j)=>{const q=indexedDB.open('code-codex-particle-image-background',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('images','readwrite');tx.objectStore('images').clear();tx.oncomplete=()=>{db.close();r()};tx.onerror=()=>j(tx.error)}});window.failedStart=performance.now();window.failedDone=false;window.failedController=null;imageStartupFixture.startEarlyStartupTransition().then(c=>{failedController=c;failedDone=true},()=>failedDone=true)})()`);
  for(let i=0;i<240&&!(await evaluate('failedDone'));i++)await delay(50);
  const missing=await evaluate(`({settled:failedDone,controller:!!failedController,elapsed:performance.now()-failedStart,host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,urls:fixtureURLs.size,failures:(window[Symbol.for('code-codex:runtime-events:v1')]?.events??[]).filter(e=>e.outcome==='failed')})`);
  check('missing Particle media settles with diagnostic and cannot trap startup',missing,missing.settled&&!missing.controller&&!missing.host&&!missing.held&&missing.urls===0&&missing.failures.some(e=>e.action==='background renderer'&&e.details.reason));
  await errors('missing media');
  await navigate('/bare');await evaluate('fixtureSeed()');
  await evaluate(`(async()=>{await new Promise((r,j)=>{const q=indexedDB.open('code-codex-particle-image-background',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('images','readwrite'),store=tx.objectStore('images'),read=store.get('fixture-chosen');read.onsuccess=()=>store.put({...read.result,blob:new Blob(['invalid-image-bytes'],{type:'image/png'})});tx.oncomplete=()=>{db.close();r()};tx.onerror=()=>j(tx.error)}});localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:'particle-image'}));window.corruptDone=false;window.corruptController=null;imageStartupFixture.startEarlyStartupTransition().then(c=>{corruptController=c;corruptDone=true},()=>corruptDone=true)})()`);
  for(let i=0;i<240&&!(await evaluate('corruptDone'));i++)await delay(50);
  const corrupt=await evaluate(`({settled:corruptDone,controller:!!corruptController,host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,urls:fixtureURLs.size,failures:(window[Symbol.for('code-codex:runtime-events:v1')]?.events??[]).filter(e=>e.outcome==='failed')})`);
  check('corrupt Particle image reports decoding failure and releases startup',corrupt,corrupt.settled&&!corrupt.controller&&!corrupt.host&&!corrupt.held&&corrupt.urls===0&&corrupt.failures.some(e=>e.action==='background renderer'&&e.details.reason));
  await errors('corrupt media');
  await navigate('/bare');
  await evaluate(`(()=>{const context=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:context.call(this,type,...args)};localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({enabled:true,source:'background',backgroundId:'pixel-sculpt'}));window.gpuDone=false;window.gpuController=null;imageStartupFixture.startEarlyStartupTransition().then(c=>{gpuController=c;gpuDone=true},()=>gpuDone=true)})()`);
  for(let i=0;i<100&&!(await evaluate('gpuDone'));i++)await delay(50);
  const gpu=await evaluate(`({settled:gpuDone,controller:!!gpuController,host:!!document.querySelector('body>.code-codex-startup-host'),held:window[Symbol.for('code-codex:background-startup-hold:v1')]?.active,failures:(window[Symbol.for('code-codex:runtime-events:v1')]?.events??[]).filter(e=>e.outcome==='failed')})`);
  check('Pixel unsupported WebGL2 reports failure and cannot trap startup',gpu,gpu.settled&&!gpu.controller&&!gpu.host&&!gpu.held&&gpu.failures.some(e=>e.action==='background renderer'&&e.details.reason));
  await errors('unsupported graphics context');
}catch(error){report.error=String(error.stack??error);report.failures.push('fixture execution')}finally{
  if(socket?.readyState===WebSocket.OPEN)await Promise.race([command('Browser.close').catch(()=>{}),delay(1500)]);
  socket?.close();for(const p of pending.values())p.reject(Error('fixture closed'));pending.clear();
  if(browser.exitCode===null)await Promise.race([new Promise(r=>browser.once('exit',r)),delay(1000)]);
  if(browser.exitCode===null)browser.kill();report.cleanup.browserStopped=true;
  await new Promise(r=>server.close(r));report.cleanup.serverClosed=true;
  const checkedProfile=resolve(profile);assert.ok(checkedProfile.startsWith(resolve(tmpdir())+sep+'code-codex-startup-image-test-'));
  try{rmSync(checkedProfile,{recursive:true,force:true,maxRetries:10,retryDelay:100});report.cleanup.profileRemoved=true}catch(error){report.cleanup.profileRemoved=false;report.cleanup.error=String(error);report.failures.push('temporary profile cleanup')}
  report.passed=report.failures.length===0;
  writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:report.passed,version,checks:report.checks.length,failures:report.failures,cleanup:report.cleanup,...(report.error?{error:report.error}:{})},null,2));
if(!report.passed)process.exitCode=1;
