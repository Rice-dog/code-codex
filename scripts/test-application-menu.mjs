import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),ui=resolve(root,'packages/explorer-ui'),out=resolve(root,'artifacts/application-menu');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import './core/localization/runtime';import {reconcileApplicationMenu} from './application-menu';import {applyLanguage} from './i18n';
window.fixture={enabled:false,supported:true,writes:[],alerts:[],readError:false,writeError:false,defer:false,uninstalls:0};
window.localeRevision=0;window.setLocale=locale=>applyLanguage({schema:1,locale,revision:++window.localeRevision,source:'menu'});setLocale('en');window.alert=text=>fixture.alerts.push(text);window.confirm=()=>{throw Error('Browser confirmation must not be used');};
window.reconcile=()=>reconcileApplicationMenu({isExplorerVisible:()=>true,toggleExplorer(){},openPreviewMarket(){},checkForUpdates(){},openRuntimeInformation(){},openInstallationFolder(){},openUninstaller:async()=>{fixture.uninstalls++;return{opened:true};},
getLoginStartup:async()=>{if(fixture.readError)throw Error('fixture read denied');return {supported:fixture.supported,enabled:fixture.enabled};},setLoginStartup:async enabled=>{fixture.writes.push(enabled);if(fixture.writeError)throw Error('fixture write denied');if(fixture.defer)await new Promise(resolve=>fixture.finish=resolve);fixture.enabled=enabled;return {supported:true,enabled};}});reconcile();`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',outfile:resolve(out,'fixture.js')});
const html=`<!doctype html><html><meta charset="utf-8"><style>:root{--color-codex-application-menu-selection:rgb(225,230,235);--color-text:#1a1c1f}body{margin:0;font-family:Segoe UI}header{display:flex;align-items:center;background:#f4f4f4;height:38px}[role=menubar]{display:flex;gap:2px}.native{border:0;border-radius:8px;padding:5px 15px;color:#888;background:transparent;font:14px Segoe UI}.native[data-state=open]{background:var(--color-codex-application-menu-selection);color:var(--color-text)}#application-menu-content{position:fixed;top:38px;left:0;background:#eee;width:220px;height:100px}</style><body><header><div role="menubar"><button class="native" id="application-menu-trigger-file-menu" aria-expanded="false" data-state="closed">File</button><button class="native" id="application-menu-trigger-help-menu" aria-expanded="false" data-state="closed">Help</button></div></header><main>Workspace</main><script>
window.nativeButtons=[...document.querySelectorAll('[role=menubar] button')];
window.closeNative=()=>{document.querySelector('#application-menu-content')?.remove();for(const b of nativeButtons){b.dataset.state='closed';b.setAttribute('aria-expanded','false');}};
window.openNative=b=>{closeNative();b.dataset.state='open';b.setAttribute('aria-expanded','true');const menu=document.createElement('div');menu.id='application-menu-content';menu.role='menu';menu.tabIndex=-1;menu.dataset.radixMenubarContent='';menu.setAttribute('aria-labelledby',b.id);menu.textContent=b.textContent+' native content';menu.addEventListener('keydown',e=>{if(e.key==='Escape')closeNative();});document.body.append(menu);menu.focus();};
for(const b of nativeButtons){b.addEventListener('pointerdown',()=>openNative(b));b.addEventListener('keydown',e=>{if(e.key==='ArrowDown')openNative(b);});b.addEventListener('pointerover',()=>{if(nativeButtons.some(x=>x.getAttribute('aria-expanded')==='true'))openNative(b);});}
</script><script src="/fixture.js"></script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html;charset=utf-8');res.end(req.url==='/fixture.js'?readFileSync(resolve(out,'fixture.js')):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`),checks=[];
const ev=x=>browser.evaluate(x),settle=`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`;
async function check(name,code){const value=await ev(code);if(value!==true){console.log(JSON.stringify({failed:name,detail:await ev(`({item:item.outerHTML,left:item.firstElementChild.getBoundingClientRect().left,button:popup.firstElementChild.getBoundingClientRect().toJSON(),label:item.firstElementChild.textContent,visibility:popup.hidden})`)}));}assert.equal(value,true,name);checks.push(name);}
async function wait(code){for(let n=0;n<100;n++){if(await ev(code))return;await delay(30);}throw Error('Timed out: '+code);}
const answer=accepted=>ev(`document.querySelector('[data-code-codex-application-dialog] [data-code-codex-dialog-content]').shadowRoot.querySelector('[data-${accepted?'accept':'cancel'}]').click();${settle}`);
async function shot(name){const x=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,name+'.png'),Buffer.from(x.data,'base64'));}
try{
 await ev(`window.item=document.querySelector('[data-code-codex-login-startup]');window.trigger=document.querySelector('#code-codex-application-menu-trigger');window.popup=document.querySelector('#code-codex-application-menu-popup');window.file=nativeButtons[0];window.help=nativeButtons[1];trigger.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));`);
 await check('Hover alone does not start a closed menu session',`popup.hidden&&trigger.getAttribute('aria-expanded')==='false'`);
 await ev(`help.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));trigger.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));${settle}`);
 await check('Native menu transfers to Code-Codex on hover without click',`!popup.hidden&&!document.querySelector('#application-menu-content')&&trigger.dataset.state==='open'`);
 await check('Open trigger uses the native selected background and text color',`getComputedStyle(trigger).backgroundColor==='rgb(225, 230, 235)'&&getComputedStyle(trigger).color==='rgb(26, 28, 31)'`);
 await check('Hover transfer moves keyboard focus to the owned menu surface',`document.activeElement===popup&&popup.tabIndex===-1`);
 await ev(`help.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));${settle}`);
 await check('Hover returns to native menu and clears owned highlight',`popup.hidden&&help.getAttribute('aria-expanded')==='true'&&trigger.dataset.state==='closed'`);
 await ev(`document.querySelector('#application-menu-content').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));${settle}`);
 await check('Right arrow crosses from last native menu to owned menu',`!popup.hidden&&document.activeElement===popup.firstElementChild`);
 await ev(`popup.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));${settle}`);
 await check('Left arrow returns to last native menu',`popup.hidden&&help.getAttribute('aria-expanded')==='true'`);
 await ev(`closeNative();trigger.click();${settle}`);
 await check('Default off; refresh never registers startup',`item.getAttribute('aria-checked')==='false'&&!item.disabled&&fixture.writes.length===0`);
 await check('Checkbox has a normal right-side check and no leading spacer',`item.getAttribute('role')==='menuitemcheckbox'&&item.lastElementChild.dataset.codeCodexMenuCheck==='true'&&item.lastElementChild.textContent==='✓'&&item.lastElementChild.hidden&&item.firstElementChild.textContent==='Start Code-Codex when I sign in'&&item.firstElementChild.getBoundingClientRect().left===popup.firstElementChild.getBoundingClientRect().left+16`);
 await ev(`item.click();${settle}`);await wait(`!!document.querySelector('[data-code-codex-application-dialog]')`);
 await check('English title/body/buttons replace browser origin UI',`(()=>{const d=document.querySelector('[data-code-codex-application-dialog]'),s=d.querySelector('[data-code-codex-dialog-content]').shadowRoot;return d.open&&d.getAttribute('aria-label')==='Enable Code-Codex login startup?'&&s.querySelector('p').textContent==='When enabled, signing in to Windows will automatically start Codex through Code-Codex. This will not close the Codex session currently running.'&&s.querySelector('[data-accept]').textContent==='OK'&&s.activeElement===s.querySelector('[data-cancel]')&&!s.textContent.includes('app://')})()`);
 await ev(`window.hostReset=document.createElement('style');hostReset.textContent='dialog{position:fixed;inset:0;margin:0}';document.head.append(hostReset)`);
 await check('Dialog remains centered under the actual host margin/inset reset',`(()=>{const r=document.querySelector('[data-code-codex-application-dialog]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1&&Math.abs(r.top+r.height/2-innerHeight/2)<1})()`);
 await browser.command('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false});
 await check('Open dialog stays centered when viewport is resized',`(()=>{const r=document.querySelector('[data-code-codex-application-dialog]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1&&Math.abs(r.top+r.height/2-innerHeight/2)<1&&r.left>=16&&r.top>=16})()`);
 await browser.command('Emulation.clearDeviceMetricsOverride');
 await shot('confirm-en');await answer(false);
 await check('Cancel leaves OS state untouched',`fixture.writes.length===0&&!fixture.enabled&&!item.disabled`);
 await ev(`setLocale('zh-CN');item.click();${settle}`);
 await check('Simplified Chinese title/message/buttons follow global locale',`(()=>{const d=document.querySelector('[data-code-codex-application-dialog]'),s=d.querySelector('[data-code-codex-dialog-content]').shadowRoot;return d.getAttribute('aria-label')==='是否开启 Code-Codex 开机自启？'&&s.querySelector('p').textContent==='开启后，登录 Windows 时将自动通过 Code-Codex 启动 Codex。此操作不会关闭当前正在运行的 Codex。'&&s.querySelector('[data-accept]').textContent==='确定'&&s.querySelector('[data-cancel]').textContent==='取消'})()`);
 await check('Chinese dialog center follows content height',`(()=>{const r=document.querySelector('[data-code-codex-application-dialog]').getBoundingClientRect();return Math.abs(r.left+r.width/2-innerWidth/2)<1&&Math.abs(r.top+r.height/2-innerHeight/2)<1})()`);
 await shot('confirm-zh');await ev(`setLocale('en');${settle}`);
 await check('Already-open confirmation updates language without recreation',`document.querySelector('[data-code-codex-application-dialog] [data-code-codex-dialog-content]').shadowRoot.querySelector('[data-accept]').textContent==='OK'`);
 await ev(`fixture.defer=true;item.click();`);await answer(true);
 await check('Pending enable is disabled and not optimistic',`item.disabled&&item.getAttribute('aria-busy')==='true'&&item.getAttribute('aria-checked')==='false'&&fixture.writes.length===1`);
 await ev(`item.click();fixture.finish();${settle}`);
 await check('One explicit confirmation produces one write and right check',`fixture.enabled&&fixture.writes.length===1&&!item.lastElementChild.hidden&&item.getAttribute('aria-checked')==='true'&&!item.disabled`);
 await ev(`fixture.defer=false;item.click();${settle}`);
 await check('Disable remains direct and reversible',`!fixture.enabled&&fixture.writes.at(-1)===false&&!document.querySelector('[data-code-codex-application-dialog]')`);
 await ev(`setLocale('zh-CN');fixture.writeError=true;item.click();${settle}`);await answer(true);
 await check('Failed write has English technical error and no false check',`fixture.alerts.length===1&&!/[\u4e00-\u9fff]/.test(fixture.alerts[0])&&item.getAttribute('aria-checked')==='false'`);
 await ev(`fixture.writeError=false;item.click();${settle}`);
 await check('Uncertain write only allows explicit revoke',`fixture.writes.at(-1)===false&&!fixture.enabled&&!document.querySelector('[data-code-codex-application-dialog]')`);
 await ev(`fixture.readError=true;trigger.click();trigger.click();${settle}`);
 await check('Read failure offers explicit revoke',`!item.disabled&&item.firstElementChild.textContent==='关闭 Code-Codex 登录自启'`);
 await ev(`item.click();${settle}`);
 await check('Revoke does not require reading prior state',`fixture.writes.at(-1)===false`);
 await ev(`fixture.readError=false;fixture.supported=false;trigger.click();trigger.click();${settle}`);
 await check('Unsupported installations cannot enable',`item.disabled&&item.getAttribute('aria-checked')==='false'`);
 await ev(`if(popup.hidden)trigger.click();item.previousElementSibling.focus();popup.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));`);
 await check('Keyboard skips unavailable startup item',`document.activeElement===item.nextElementSibling`);
 await ev(`window.u=document.querySelector('[data-code-codex-uninstall]');u.click();${settle}`);
 await check('Uninstall menu opens wizard through one no-argument capability and closes menu',`fixture.uninstalls===1&&popup.hidden&&u.textContent==='卸载 Code-Codex…'`);
 await ev(`fixture.supported=true;trigger.click();${settle}`);await shot('menu-zh');
 await ev(`trigger.click();trigger.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));`);
 await check('Closed menu session stays closed on later hover',`popup.hidden`);
 await ev(`fixture.supported=true;trigger.click();${settle}`);await ev(`item.click();${settle}`);
 await ev(`document.querySelector('[data-code-codex-application-dialog]').dispatchEvent(new Event('cancel',{cancelable:true}));${settle}`);
 await check('Escape/cancel resolves without write',`!document.querySelector('[data-code-codex-application-dialog]')&&!fixture.enabled`);
 await check('Opening confirmation closes the menu before modal focus changes',`popup.hidden&&trigger.getAttribute('aria-expanded')==='false'`);
 await ev(`window.readsBefore=fixture.writes.length;reconcile();`);
 await check('Reconcile keeps one menu instance',`document.querySelectorAll('#code-codex-application-menu-trigger').length===1&&fixture.writes.length===readsBefore`);
 writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,checks},null,2));console.log(`Application menu: ${checks.length} browser checks passed; no OS state changed`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
