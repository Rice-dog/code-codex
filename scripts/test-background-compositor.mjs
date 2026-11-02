import {launchFixture,delay} from './browser-fixture.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'artifacts/background-compositor');await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile(resolve(root,'packages/explorer-ui/dist/plugins/catalog.json'),'utf8'));
const p=catalog.find(p=>p.id==='glow-horizon');const source=await readFile(resolve(root,'packages/explorer-ui/dist/plugins',p.category,p.id,p.asset),'utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>body{margin:0;background:#071022}#layer{position:fixed;inset:0;width:640px;height:400px;overflow:hidden}</style><div id="layer"></div><script>'+source+'</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
try{
 await b.evaluate(`localStorage.setItem('code-codex:glow-horizon-background:v1',JSON.stringify({openingDuration:4}));window.renderer=window[Symbol.for('code-codex:background-modules:v1')].get('glow-horizon').startup(document.getElementById('layer'),e=>{throw Error(e)});`);
 await b.command('Page.captureScreenshot',{format:'png'});await delay(250);
 const tracks=await b.evaluate('document.getAnimations().length');assert(tracks>=5);checks.push({name:'actual package uses browser animation tracks',tracks});
 const frames=[];const off=b.onEvent(m=>{if(m.method==='Page.screencastFrame'){frames.push({at:Date.now(),data:m.params.data});void b.command('Page.screencastFrameAck',{sessionId:m.params.sessionId});}});
 await b.command('Page.startScreencast',{format:'png',maxWidth:640,maxHeight:400,everyNthFrame:1});const start=Date.now();
 await b.evaluate('(()=>{const end=performance.now()+1400;while(performance.now()<end){}return true;})()');const end=Date.now();
 await b.command('Page.stopScreencast');off();const during=frames.filter(f=>f.at>start+150&&f.at<end-100),distinct=new Set(during.map(f=>f.data)).size;
 console.log(JSON.stringify({frameTimes:frames.map(f=>f.at-start),distinct,styles:await b.evaluate('document.getAnimations().map(a=>({time:a.currentTime,state:a.playState,frames:a.effect.getKeyframes().slice(0,2),target:a.effect.target.className}))')}));
 assert(distinct>=2,'The actual DOM background must visibly progress while UI JavaScript is blocked');checks.push({name:'actual compositor background survives UI stall',blockedMs:end-start,frames:during.length,distinct});
 for(let i=0;i<Math.min(3,during.length);i++)await writeFile(resolve(out,`blocked-${i}.png`),Buffer.from(during[i].data,'base64'));
 await b.evaluate('renderer.replay();renderer.dispose()');assert.equal(await b.evaluate('document.getAnimations().length'),0);assert.equal(await b.evaluate("window[Symbol.for('code-codex:background-isolation:v1')].size"),0);checks.push({name:'all tracks and session released'});
}finally{await b.evaluate('renderer?.dispose()').catch(()=>{});await b.close();server.close();await writeFile(resolve(out,'result.json'),JSON.stringify({checks,passed:checks.length===3},null,2));}
console.log(JSON.stringify(checks));
