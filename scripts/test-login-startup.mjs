import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture} from './browser-fixture.mjs';

const root=resolve(import.meta.dirname,'..'), ui=resolve(root,'packages/explorer-ui');
for (const file of ['resources/localization/core/zh-CN.json','resources/i18n/zh-CN.json']) {
  assert.equal(JSON.parse(readFileSync(resolve(root,file),'utf8'))['loginStartup.label'],'Code-Codex 开机自启',`${file}: concise Chinese startup label`);
}
const out=resolve(root,'artifacts/login-startup-menu');mkdirSync(out,{recursive:true});
const {build}=createRequire(resolve(ui,'package.json'))('esbuild');
await build({stdin:{contents:`import {reconcileApplicationMenu} from './application-menu';
window.fixture={enabled:false,supported:true,confirm:true,confirmCalls:0,writes:[],alerts:[],readError:false,writeError:false,defer:false};
window.confirm=()=>{fixture.confirmCalls++;return fixture.confirm;};window.alert=text=>fixture.alerts.push(text);
reconcileApplicationMenu({isExplorerVisible:()=>true,toggleExplorer(){},openPreviewMarket(){},checkForUpdates(){},openRuntimeInformation(){},openInstallationFolder(){},
getLoginStartup:async()=>{if(fixture.readError)throw Error('fixture read denied');return {supported:fixture.supported,enabled:fixture.enabled};},
setLoginStartup:async enabled=>{fixture.writes.push(enabled);if(fixture.writeError)throw Error('fixture write denied');if(fixture.defer)await new Promise(resolve=>fixture.finish=resolve);fixture.enabled=enabled;return {supported:true,enabled};}});`,resolveDir:resolve(ui,'src'),loader:'ts'},bundle:true,format:'iife',outfile:resolve(out,'fixture.js')});
const html=`<!doctype html><html><body><header><div role="menubar"><button id="application-menu-trigger-file-menu">File</button><button id="application-menu-trigger-help-menu">Help</button></div></header><script src="/fixture.js"></script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(resolve(out,'fixture.js')):html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await launchFixture(`http://127.0.0.1:${server.address().port}`);
const checks=[];
async function check(name,expression){assert.equal(await browser.evaluate(expression),true,name);checks.push(name);}
const settle=`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`;
try {
  await browser.evaluate(`window.item=document.querySelector('[data-code-codex-login-startup]');window.trigger=document.querySelector('#code-codex-application-menu-trigger');trigger.click();${settle}`);
  await check('Default off; opening the menu does not register startup',`item.getAttribute('aria-checked')==='false'&&!item.disabled&&fixture.writes.length===0`);
  await check('Accessible checkbox is part of the actual application menu',`item.getAttribute('role')==='menuitemcheckbox'&&item.closest('[role=menu]')!==null`);
  await browser.evaluate(`fixture.confirm=false;item.click();${settle}`);
  await check('Cancelling explicit enable has no write',`fixture.writes.length===0&&!fixture.enabled`);
  await browser.evaluate(`fixture.confirm=true;fixture.defer=true;item.click()`);
  await check('Pending enable is disabled and not optimistically checked',`item.disabled&&item.getAttribute('aria-busy')==='true'&&item.getAttribute('aria-checked')==='false'`);
  await browser.evaluate(`item.click();fixture.finish();${settle}`);
  await check('Repeated click cannot duplicate the native mutation',`fixture.writes.length===1&&fixture.writes[0]===true`);
  await check('Successful native result checks the control',`fixture.enabled&&item.getAttribute('aria-checked')==='true'&&!item.disabled`);
  await browser.evaluate(`fixture.defer=false;window.confirmCount=fixture.confirmCalls;item.click();${settle}`);
  await check('Disable requires no confirmation and is reversible',`!fixture.enabled&&item.getAttribute('aria-checked')==='false'&&fixture.confirmCalls===confirmCount&&fixture.writes.at(-1)===false`);
  await browser.evaluate(`fixture.writeError=true;item.click();${settle}`);
  await check('Write failure is visible and never claims success',`!fixture.enabled&&fixture.alerts.length===1&&item.textContent.includes('loginStartup.revoke')`);
  await browser.evaluate(`fixture.writeError=false;window.confirmCount=fixture.confirmCalls;item.click();${settle}`);
  await check('Uncertain write exposes only explicit revoke, not an enable retry',`fixture.writes.at(-1)===false&&fixture.confirmCalls===confirmCount&&!fixture.enabled`);
  await browser.evaluate(`fixture.enabled=true;fixture.readError=true;trigger.click();trigger.click();${settle}`);
  await check('Read failure still offers explicit revocation',`!item.disabled&&item.textContent.includes('loginStartup.revoke')`);
  await browser.evaluate(`item.click();${settle}`);
  await check('Revocation works even when the prior state could not be read',`fixture.writes.at(-1)===false&&!fixture.enabled`);
  await browser.evaluate(`fixture.readError=false;fixture.supported=false;trigger.click();trigger.click();${settle}`);
  await check('Unsupported installations cannot enable startup',`item.disabled&&item.getAttribute('aria-checked')==='false'`);
  await browser.evaluate(`window.installationItem=item.previousElementSibling;installationItem.focus();installationItem.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));`);
  await check('Keyboard navigation skips unavailable startup controls',`document.activeElement===item.nextElementSibling`);
  const shot=await browser.command('Page.captureScreenshot',{format:'png'});
  writeFileSync(resolve(out,'menu.png'),Buffer.from(shot.data,'base64'));
  writeFileSync(resolve(out,'result.json'),JSON.stringify({passed:true,checks},null,2));
  console.log(`Login startup menu: ${checks.length} browser checks passed; no OS startup entry changed`);
} finally { await browser.close();await new Promise(r=>server.close(r)); }
