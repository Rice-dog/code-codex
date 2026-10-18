import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui');
const out=resolve(root,process.env.CODE_CODEX_TEST_OUTPUT??'artifacts/background-surfaces');mkdirSync(out,{recursive:true});
const catalog=JSON.parse(readFileSync(resolve(root,'releases/plugins/catalog.json'),'utf8'));
const lock=JSON.parse(readFileSync(resolve(root,'resources/plugin-distribution.lock.json'),'utf8'));
assert.ok(lock.packages.every(p=>Object.keys(p.inputs).every(name=>!name.replaceAll('\\','/').includes('components/styles/background-surfaces.ts'))),'Host surface CSS must not become a shared optional-plugin build input');
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import {mainPreviewStyles} from './components/styles/main-preview';import {styles} from './styles';import {BACKGROUND_SURFACE_ATTRIBUTES} from './components/styles/background-surfaces';import {SURFACE_OPACITY_NATIVE_CSS,SURFACE_OPACITY_TREE_CSS,SURFACE_OPACITY_PREVIEW_CSS} from './surface-opacity-runtime';window.fixtureStyles={mainPreviewStyles,tree:styles,attributes:BACKGROUND_SURFACE_ATTRIBUTES,nativeMask:SURFACE_OPACITY_NATIVE_CSS,treeMask:SURFACE_OPACITY_TREE_CSS,previewMask:SURFACE_OPACITY_PREVIEW_CSS};`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',outfile:resolve(out,'fixture.js')});
const html=`<!doctype html><html><head><style>body{margin:0;background:rgb(80,130,180);font:14px sans-serif}main{position:relative;width:1000px;height:650px;background:rgba(11,12,15,.58)}cc-preview{display:block}#unrelated{background:rgb(60,61,62);height:20px}</style></head><body><main class="main-surface" data-app-shell-main-surface="default"></main><cc-tree></cc-tree><div id="unrelated">Unrelated native content</div><script src="/fixture.js"></script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(resolve(out,'fixture.js')):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),ev=e=>browser.evaluate(e),report={checks:[],scope:'Actual shared CSS in browser fixtures; source-marker compatibility, not GPU rendering of every plugin.'};
async function check(name,expression){assert.equal(await ev(expression),true,name);report.checks.push(name);}
try{
 await ev(`(()=>{const f=fixtureStyles;window.preview=document.createElement('cc-preview');preview.dataset.codeCodexOwned='true';preview.setAttribute('data-file-active','');document.querySelector('main').append(preview);window.p=preview.attachShadow({mode:'open'});window.paint=()=>{p.innerHTML='<style>'+f.mainPreviewStyles+f.previewMask+'</style><div class="surface"><div class="tab-strip"><div class="tab-slot active"><button class="preview-tab" aria-selected="true">Cargo.lock</button></div></div><section class="preview-panel"><div class="preview-meta-bar">Cargo.lock · Read only</div><div class="preview-content"><div class="code-surface"><div class="code-line-numbers">1</div><pre class="code-editor-highlight"><span class="syntax-keyword">version</span> = 4</pre><div class="code-minimap"></div></div><div class="markdown-reader">Markdown</div><div class="csv-preview">CSV</div><div class="diagram-preview"><div class="diagram-canvas">Diagram</div></div><div class="notebook-preview">Notebook</div><div class="model-preview"><div class="model-preview-stage">3D</div></div><div class="media-preview" data-kind="pdf"><div class="pdf-page-stage"><div class="pdf-page-canvas">PDF document paper</div></div></div><div class="office-preview"><div class="office-slide-viewport"><div class="fixture-slide" style="background:white">Slide paper</div></div></div><button class="fixture-control" style="background:rgb(50,51,52)" onclick="window.clicks++">Native control</button></div></section></div>';};window.clicks=0;paint();window.t=document.querySelector('cc-tree').attachShadow({mode:'open'});t.innerHTML='<style>'+f.tree+f.treeMask+'</style><div class="frame"><header class="masthead">Tree</header><div class="tree-shell"><button class="file-filter">Filter</button></div><footer class="statusbar">Ready</footer></div>';const mask=document.createElement('style');mask.textContent=f.nativeMask;document.head.append(mask);window.alpha=e=>{const c=getComputedStyle(e).backgroundColor;return c==='transparent'?0:c.startsWith('rgba')?Number(c.split(',').at(-1).replace(')','')):1};window.backings=['.preview-panel','.preview-meta-bar','.preview-content','.code-line-numbers','.code-editor-highlight','.code-minimap','.markdown-reader','.csv-preview','.diagram-preview','.diagram-canvas','.notebook-preview','.model-preview','.model-preview-stage','.pdf-page-stage','.office-preview','.office-slide-viewport'];})()`);
 const owners=catalog.filter(p=>p.capabilities.includes('background')).map(p=>[p.id,p.id==='glow-horizon'?1:p.id==='custom-background'?2:0]);assert.ok(owners.length);
 for(const theme of ['dark','light']){
  await ev(`document.documentElement.className='${theme}';preview.dataset.theme='${theme}';`);
  for(const [id,index] of owners){
   await ev(`fixtureStyles.attributes.forEach(a=>document.documentElement.removeAttribute(a));document.documentElement.setAttribute(fixtureStyles.attributes[${index}],'true');document.documentElement.removeAttribute('data-code-codex-ui-mask-active');`);
   await check(`${theme}: ${id} clears every supported preview backing`, `backings.every(s=>alpha(p.querySelector(s))===0)&&getComputedStyle(p.querySelector('.model-preview-stage')).backgroundImage==='none'`);
   await check(`${theme}: ${id} uses the shared tree backing`, `Math.abs(alpha(t.querySelector('.frame'))-.68)<.001&&alpha(t.querySelector('.tree-shell'))===0`);
   for(const value of [0,.35,1]){
    await ev(`document.documentElement.setAttribute('data-code-codex-ui-mask-active','');for(const key of ['preview','tree','tabs'])document.documentElement.style.setProperty('--code-codex-mask-'+key,'${value}');`);
    await check(`${theme}: ${id} Surface ${value} paints alpha once`, `backings.every(s=>alpha(p.querySelector(s))===0)&&getComputedStyle(document.querySelector('main')).getPropertyValue('--code-codex-mask-content').trim()==='${value}'&&Math.abs(alpha(t.querySelector('.frame'))-${value})<.001&&Math.abs(alpha(p.querySelector('.tab-strip'))-${value})<.001`);
   }
   await check(`${theme}: ${id} preserves paper, controls, text and unrelated content`, `alpha(p.querySelector('.pdf-page-canvas'))===1&&alpha(p.querySelector('.fixture-slide'))===1&&alpha(p.querySelector('.fixture-control'))===1&&alpha(document.querySelector('#unrelated'))===1&&getComputedStyle(p.querySelector('.syntax-keyword')).opacity==='1'&&getComputedStyle(preview).opacity==='1'`);
  }
  const shot=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,theme+'-surfaces.png'),Buffer.from(shot.data,'base64'));
 }
 await ev(`paint()`);await check('Newly rendered file panels inherit Custom transparency without reactivation',`backings.every(s=>alpha(p.querySelector(s))===0)`);
 const rect=await ev(`(()=>{const e=p.querySelector('.preview-tab'),r=e.getBoundingClientRect();e.onclick=()=>window.clicks++;return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});
 await check('Preview tabs retain actual pointer interaction',`clicks===1`);
 await ev(`document.documentElement.removeAttribute('data-code-codex-ui-mask-active');fixtureStyles.attributes.forEach(a=>document.documentElement.removeAttribute(a));`);
 await check('Stopping the background restores native preview and tree surfaces',`alpha(p.querySelector('.preview-panel'))===1&&alpha(t.querySelector('.frame'))===1`);
 await ev(`document.documentElement.setAttribute('data-code-codex-transparent-background','true');`);
 await check('Native window transparency retains its separate clear-surface behavior',`alpha(p.querySelector('.preview-panel'))===0&&alpha(t.querySelector('.frame'))===0&&alpha(p.querySelector('.pdf-page-canvas'))===1`);
 report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error;}finally{writeFileSync(resolve(out,'result.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,scope:report.scope}));
