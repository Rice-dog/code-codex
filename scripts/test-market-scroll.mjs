import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';
const out=resolve('artifacts/market-scroll');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve('packages/explorer-ui/package.json'))('esbuild');
await build({stdin:{contents:"export {style4} from './components/styles/status-and-market';export {inspectMarketScroll} from './host-update-probes';",loader:'ts',resolveDir:resolve('packages/explorer-ui/src')},bundle:true,format:'iife',globalName:'fixture',outfile:resolve(out,'fixture.js')});
const server=createServer((q,r)=>{r.setHeader('Content-Type',q.url.endsWith('.js')?'text/javascript':'text/html');r.end(q.url==='/fixture.js'?readFileSync(resolve(out,'fixture.js')):'<html><script src="/fixture.js"></script><body><div data-code-codex-owned="true"></div><script>const root=document.querySelector("[data-code-codex-owned]").attachShadow({mode:"open"});root.innerHTML=`<style>${fixture.style4}</style><div class="preview-market-list" style="width:300px" data-preview-market-category="developer-tools">${[1,2,3].map(i=>`<article style="height:140px;min-height:140px;border:1px solid"><button>Tool ${i}</button></article>`).join("")}</div>`;window.list=root.querySelector(".preview-market-list");</script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
try{
 for(const category of ['appearance','file-preview','developer-tools']){
  await b.evaluate(`list.dataset.previewMarketCategory=${JSON.stringify(category)};list.scrollTop=0`);
  await b.command('Input.dispatchMouseEvent',{type:'mouseWheel',x:150,y:150,deltaX:0,deltaY:180});await delay(150);
  assert(await b.evaluate('list.scrollTop>0'),category+' wheel');assert.equal(await b.evaluate('fixture.inspectMarketScroll(document).status'),'passed');checks.push(category+' native wheel and read-only scroll check');
 }
 await b.evaluate('list.scrollTop=0;list.querySelector("button").focus()');await b.command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'PageDown',code:'PageDown',windowsVirtualKeyCode:34});await delay(160);assert(await b.evaluate('list.scrollTop>0'));checks.push('Keyboard PageDown scrolls the list from its existing button');
 const thumb=await b.evaluate('(()=>{list.scrollTop=0;const r=list.getBoundingClientRect();return {x:r.right-7,y:r.top+30,to:r.bottom-12,width:list.offsetWidth-list.clientWidth}})()');
 assert(thumb.width>0);await b.command('Input.dispatchMouseEvent',{type:'mousePressed',x:thumb.x,y:thumb.y,button:'left',clickCount:1});await b.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:thumb.x,y:thumb.to,button:'left',buttons:1});await b.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:thumb.x,y:thumb.to,button:'left',clickCount:1});await delay(100);assert(await b.evaluate('list.scrollTop>0'));checks.push('Actual native scrollbar drag works');
 const before=await b.evaluate('list.outerHTML');await b.evaluate('fixture.inspectMarketScroll(document)');assert.equal(await b.evaluate('list.outerHTML'),before);checks.push('On-demand inspection changes no DOM or scrolling');
 await b.evaluate('list.style.overflowY="hidden"');assert.equal(await b.evaluate('fixture.inspectMarketScroll(document).status'),'issue');await b.evaluate('list.style.overflowY="clip"');assert.equal(await b.evaluate('fixture.inspectMarketScroll(document).status'),'issue');checks.push('Former hidden overflow and clip are detected as issues');
 await b.evaluate('list.hidden=true');assert.equal(await b.evaluate('fixture.inspectMarketScroll(document).status'),'manual');checks.push('Closed market remains explicitly manual');
 const result={passed:true,scope:'Production CSS and read-only inspector, real isolated Chromium input with synthetic tool cards',checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await b.close();await new Promise(r=>server.close(r));}
