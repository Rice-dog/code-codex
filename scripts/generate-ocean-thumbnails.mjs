import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';

// Generate once from the original dock's real 3D models. Shipping these PNGs
// avoids a hidden thumbnail GPU pass every time the background is enabled.
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/ocean-thumbnails');await mkdir(out,{recursive:true});
await build({stdin:{contents:`import {ShallowOceanRenderer} from '../plugins/appearance/shallow-ocean/renderer';import {DEFAULT_OPTIONS} from './effects/shallow-ocean/options';window.errors=[];window.current=new ShallowOceanRenderer(host,document.createElement('canvas'),{...DEFAULT_OPTIONS,introEnabled:0},e=>errors.push(e));current.ready.then(()=>window.ready=true,e=>errors.push(String(e)));`,resolveDir:resolve(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,format:'iife',outfile:resolve(out,'fixture.js'),plugins:[{name:'original-dock-thumbnail-pass',setup(b){b.onLoad({filter:/shallow-ocean[\\/]source[\\/]main\.js$/},async args=>{const source=await readFile(args.path,'utf8'),marker='// Host uses its shared parameter panel; no hidden thumbnail GPU pass.';if(!source.includes(marker))throw Error('Original dock generation marker missing');return {contents:source.replace(marker,'reefEcosystem.renderAllDockThumbnails(renderer, raysAndJellies);'),loader:'js'};});}}]});
const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?await readFile(resolve(out,'fixture.js')):'<!doctype html><style>#host{position:relative;width:900px;height:600px}</style><div id="host"></div><script src="/fixture.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`);
try{
 for(let i=0;i<200&&!await browser.evaluate('!!window.ready');i++){const errors=await browser.evaluate('window.errors??[]');if(errors.length)throw Error(JSON.stringify(errors));await delay(100);}
 const images=await browser.evaluate(`Object.fromEntries([...current.scene.body.querySelectorAll('#dock .card[data-kind]')].map(c=>[c.dataset.kind,c.querySelector('img').src]))`);
 if(Object.keys(images).length!==10||Object.values(images).some(src=>!src.startsWith('data:image/png;base64,')))throw Error('Expected ten real dock model PNGs');
 for(const[kind,src]of Object.entries(images))await writeFile(resolve(out,kind+'.png'),Buffer.from(src.split(',')[1],'base64'));
 await writeFile(resolve(root,'packages/explorer-ui/src/effects/shallow-ocean/thumbnails.json'),JSON.stringify(images,null,2)+'\n');
 await browser.evaluate('current.dispose()');console.log(JSON.stringify({generated:Object.keys(images),source:'Original reefEcosystem.renderAllDockThumbnails192x136',runtimeGpuPass:false}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
