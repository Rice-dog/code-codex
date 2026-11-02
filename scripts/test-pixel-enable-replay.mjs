import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {launchFixture} from './browser-fixture.mjs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const ui=resolve(import.meta.dirname,'../packages/explorer-ui');
const script=(await build({stdin:{contents:`import {PixelSculptBackgroundController} from './plugin-host/backgrounds/pixel-sculpt';window.Controller=PixelSculptBackgroundController;`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,write:false,define:{__CODE_CODEX_VERSION__:'"fixture"'},plugins:[{name:'controller-ports',setup(b){
 b.onLoad({filter:/background-plugin-runtime\.ts$/},()=>({contents:`export function backgroundModule(){return {}};export function backgroundConstructor(){return class{ready=Promise.resolve();firstFrame=Promise.resolve();constructor(){window.created=(window.created||0)+1}setActive(){}resumeOpening(){window.replayed=(window.replayed||0)+1}setSettings(){}dispose(){}}}`,loader:'ts'}));
 b.onLoad({filter:/plugin-load-diagnostics\.ts$/},()=>({contents:'export async function ensureBackgroundPackage(){}',loader:'ts'}));
 b.onLoad({filter:/theme-probe\.ts$/},()=>({contents:'export const codexDarkThemeApplied=()=>true;export async function waitForCodexDarkTheme(){}',loader:'ts'}));
 b.onLoad({filter:/theme-lease\.ts$/},()=>({contents:'export const readCodexAppearanceTheme=async()=>"dark",readParticleThemeLease=()=>null,writeParticleThemeLease=()=>{},clearParticleThemeLease=()=>{},writeCodexAppearanceTheme=async()=>{};',loader:'ts'}));
}}]})).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body><script>window.errors=[];addEventListener("error",e=>errors.push(e.message));</script><script>'+script+'</script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await launchFixture(`http://127.0.0.1:${server.address().port}`);
try{const result=await b.evaluate(`(async()=>{window.controller=new Controller();await controller.enable();await controller.disable();await controller.enable();return{created,replayed,enabled:controller.enabled}})()`);assert.equal(result.created,1);assert.equal(result.replayed,2);assert.equal(result.enabled,true);console.log(JSON.stringify({passed:true,scope:'Actual normal controller, stubbed GPU/appearance ports',...result}));}catch(error){throw Error(String(error)+' '+JSON.stringify(await b.evaluate('errors')));}finally{await b.evaluate('window.controller?.dispose()');await b.close();await new Promise(r=>server.close(r));}
