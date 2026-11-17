import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';
const out=resolve('artifacts/lan-remote-ui');mkdirSync(out,{recursive:true});
const compiled=await build({stdin:{contents:`export {LanRemotePlugin} from './lan-remote-runtime';export {lanRemoteCardMarkup,lanRemotePanelMarkup} from './lan-remote';export {styles} from './styles';export {applyLanguage} from './core/localization/runtime';export {localizeOwnedUi} from './core/localization/owned-ui';`,resolveDir:resolve('packages/explorer-ui/src')},bundle:true,format:'iife',globalName:'production',write:false});
writeFileSync(resolve(out,'production.js'),compiled.outputFiles[0].text);
writeFileSync(resolve(out,'fixture.html'),`<!doctype html><body><script src="production.js"></script><script>
const host=document.createElement('section');document.body.append(host);window.root=host.attachShadow({mode:'open'});root.innerHTML='<style>'+production.styles+'</style>'+production.lanRemoteCardMarkup()+production.lanRemotePanelMarkup();
window.releaseLanguage=production.localizeOwnedUi(root);
window.calls=[];window.errors=[];window.lan=new production.LanRemotePlugin(root,{request:async params=>{calls.push(params);return {role:'idle',phase:'idle',room:'',pending:[],connected:false};}},message=>errors.push(message));
window.act=selector=>lan.action(root.querySelector(selector));
root.addEventListener('click',e=>{if(e.target.matches('[data-lan-action]'))void lan.action(e.target);});
</script>`);
const browser=await launchFixture(new URL('file:///'+resolve(out,'fixture.html').replaceAll('\\','/')).href),checks=[];
try{
 await browser.evaluate(`act('.lan-enable')`);assert.equal(await browser.evaluate('calls.length'),0);assert.equal(await browser.evaluate(`root.querySelector('.lan-panel').matches(':popover-open')`),false);checks.push('Enable creates no network request and does not open settings');
 await browser.evaluate(`act('.lan-settings')`);assert.equal(await browser.evaluate(`root.querySelector('.lan-panel').matches(':popover-open')`),true);
 for(const locale of ['zh-CN','en']) {
  await browser.evaluate(`production.applyLanguage({schema:1,locale:'${locale}',revision:1,source:'menu'});`);
  const copy=await browser.evaluate(`({
   labels:[...root.querySelectorAll('.lan-panel legend')].map(n=>n.textContent),
   placeholders:['.lan-code','.lan-address'].map(s=>root.querySelector(s).placeholder),
   help:[...root.querySelectorAll('.lan-field-help')].map(n=>n.textContent),
   beta:[...root.querySelectorAll('.plugin-beta')].map(n=>n.textContent),
   header:root.querySelector('.lan-help').textContent,
   descriptionLinks:['.lan-code','.lan-address'].every(s=>!!root.getElementById(root.querySelector(s).getAttribute('aria-describedby')))
  })`);
  assert.deepEqual(copy.labels,locale==='en'?['Room code','Host address']:['房间码','房主地址']);
  assert.deepEqual(copy.placeholders,locale==='en'?['Enter six digits','Enter the host IPv4 address']:['输入六位数字','输入房主的 IPv4 地址']);
  assert.deepEqual(copy.help,locale==='en'?['Use the same room code on both PCs to find or create a room.','Enter the host address and use the room code above to request access.']:['两台电脑使用相同房间码，自动查找或创建房间。','填写房主电脑的地址，使用上方房间码申请加入。']);
  assert.deepEqual(copy.beta,locale==='en'?['Beta','Beta']:['测试','测试']);
  assert.ok(copy.descriptionLinks&&!/Tailscale/i.test(copy.header+copy.help.join('')));
  for(const theme of ['light','dark']) for(const width of [300,900]) {
   await browser.command('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:false});
   await browser.evaluate(`root.host.dataset.theme='${theme}';lan.render()`);
   const layout=await browser.evaluate(`(()=>{
    const find=s=>root.querySelector(s), box=s=>find(s).getBoundingClientRect();
    const aligned=(row,input,button)=>input.top===button.top && input.height===button.height && input.right<button.left && button.right<=row.right+1;
    const addressRow=box('.lan-address-row'),lastHelp=box('#cle-lan-address-help'), status=find('.lan-message'), body=box('.lan-panel .particle-settings-scroll');
    const helpStyle=s=>{const c=getComputedStyle(find(s));return [c.font,c.color,c.lineHeight].join('|')};
    return {aligned:aligned(box('.lan-room-row'),box('.lan-code'),box('[data-lan-action="open"]'))&&aligned(addressRow,box('.lan-address'),box('[data-lan-action="join-address"]')),
     bottom:body.bottom-lastHelp.bottom, footer:!!find('.lan-source'),
     idleHidden:status.hidden&&getComputedStyle(status).display==='none'&&status.textContent==='',
     matchingHelp:helpStyle('#cle-lan-room-help')===helpStyle('#cle-lan-address-help'),
     descriptionsVisible:['#cle-lan-room-help','#cle-lan-address-help','.lan-room-label','.lan-address-label'].every(s=>box(s).height>0),
     approval:find('.lan-help').textContent.length>0, empty:['.lan-pending','.lan-actions'].every(s=>getComputedStyle(find(s)).display==='none')};
   })()`);
   assert.ok(layout.aligned&&layout.bottom<=14&&!layout.footer&&layout.approval&&layout.empty&&layout.idleHidden&&layout.matchingHelp&&layout.descriptionsVisible,JSON.stringify(layout));
   if(width===900&&locale==='zh-CN'){
    const capture=await browser.command('Page.captureScreenshot',{format:'png'});
    writeFileSync(resolve(out,`panel-${theme}.png`),Buffer.from(capture.data,'base64'));
   }
  }
 }checks.push('Chinese and English labels, placeholders, help, accessible descriptions and card/panel Beta chips are consistent');
 checks.push('Light/dark narrow/wide controls align; help typography matches and idle status leaves no footer or blank row');
 await browser.evaluate(`root.querySelector('.lan-code').value='bad';act('[data-lan-action="open"]')`);assert.equal(await browser.evaluate('calls.length'),0);assert.match((await browser.evaluate('errors')).at(-1),/Enter six digits/);checks.push('Invalid room input uses one local field check without a native/network request');
 await browser.evaluate(`root.querySelector('.lan-code').value='012345';act('[data-lan-action="join-address"]')`);
 assert.equal(await browser.evaluate('calls.length'),0);assert.match((await browser.evaluate('errors')).at(-1),/Enter the host IPv4 address/);
 await browser.evaluate(`root.querySelector('.lan-address').value='100.91.42.8';root.querySelector('.lan-address').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
 assert.deepEqual(await browser.evaluate('calls'),[{action:'open',code:'012345',locale:'en',address:'100.91.42.8'}]);
 await browser.evaluate(`act('[data-lan-action="open"]')`);assert.deepEqual((await browser.evaluate('calls')).at(-1),{action:'open',code:'012345',locale:'en'});
 checks.push('Enter on the address sends exactly one IPv4 join; the regular room button ignores that address and keeps the full six-digit code');
 await browser.evaluate(`lan.accept({role:'host',phase:'hosting',room:'012345',pending:[{id:'peer-1',device:'<img src=x onerror=alert(1)>'}],connected:false})`);
 assert.equal(await browser.evaluate(`root.querySelector('.lan-pending img')===null && root.querySelector('.lan-peer').getBoundingClientRect().height>0 && root.querySelector('.lan-address').disabled`),true);assert.equal(await browser.evaluate(`calls.length`),2);checks.push('Pending request remains visible, cannot execute markup and never automatically approves');
 await browser.evaluate(`act('[data-lan-action="approve"]')`);assert.deepEqual((await browser.evaluate('calls')).at(-1),{action:'approve',peer:'peer-1'});checks.push('Approval is a named action bound to the selected request');
 await browser.evaluate(`lan.accept({role:'guest',phase:'pending',pending:[],connected:false});window.before=calls.length`);assert.equal(await browser.evaluate(`root.querySelector('[data-lan-action="files"]').hidden`),true);assert.equal(await browser.evaluate('calls.length===before'),true);
 assert.equal(await browser.evaluate(`!root.querySelector('.lan-message').hidden&&root.querySelector('.lan-message').textContent==='Waiting for host approval…'`),true);checks.push('Active connection state remains visible without a status request');
 await browser.evaluate(`lan.accept({role:'guest',phase:'connected',pending:[],connected:true});act('[data-lan-action="files"]')`);assert.deepEqual((await browser.evaluate('calls')).at(-1),{action:'files'});checks.push('Files only offered for an approved connected guest; no state polling');
 for(const locale of ['zh-CN','en']) {
  await browser.evaluate(`production.applyLanguage({schema:1,locale:'${locale}',revision:1,source:'menu'});`);
  assert.equal(await browser.evaluate(`root.querySelector('#cle-lan-title').textContent`),locale==='en'?'LAN Remote':'局域网远控');
  assert.equal(await browser.evaluate(`root.querySelector('.lan-code').value`),'012345');
  assert.equal(await browser.evaluate(`root.querySelector('[data-lan-action="join-address"]').textContent`),locale==='en'?'Join by address':'按地址加入');
 }checks.push('Production bilingual language service updates labels without changing room input');
 for(const width of [420,900]){
  await browser.command('Emulation.setDeviceMetricsOverride',{width,height:600,deviceScaleFactor:1,mobile:false});
  await browser.evaluate('lan.render()');
  const rect=await browser.evaluate(`(()=>{const b=root.querySelector('.lan-panel').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:innerWidth,height:innerHeight}})()`);
  assert.ok(rect.left>=11&&rect.right<=rect.width-11&&rect.top>=11&&rect.bottom<=rect.height-11,JSON.stringify(rect));
 }checks.push('Shared card-anchored geometry fits narrow and wide viewports after resize');
 await browser.evaluate(`lan.accept({role:'idle',phase:'error',pending:[],connected:false,error:'REMOTE_CONNECTION: Network disconnected.'})`);assert.equal(await browser.evaluate(`root.querySelector('.lan-message').textContent`),'REMOTE_CONNECTION: Network disconnected.');checks.push('Technical errors remain English');
 await browser.evaluate(`root.querySelector('.lan-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);assert.equal(await browser.evaluate(`root.querySelector('.lan-settings').getAttribute('aria-expanded')`),'false');checks.push('Escape closes the shared popover and restores the trigger');
 await browser.evaluate(`act('.lan-enable')`);assert.deepEqual((await browser.evaluate('calls')).at(-1),{action:'stop'});assert.equal(await browser.evaluate(`root.querySelector('.lan-enable').getAttribute('aria-pressed')`),'false');checks.push('Disable releases the native room');
 await browser.evaluate('lan.dispose();releaseLanguage()');assert.deepEqual((await browser.evaluate('calls')).at(-1),{action:'stop'});checks.push('Dispose removes listeners and releases native room');
 const result={scope:'Chromium production LAN UI with simulated native port; not physical LAN/media acceptance',passed:checks.length,checks};writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
