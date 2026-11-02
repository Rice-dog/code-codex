import {builtExplorerTag} from './ui-build-identity.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version;
const output=resolve(root,`artifacts/automatic-diagnostics-v${version}`);mkdirSync(output,{recursive:true});
const base=readFileSync(resolve(root,'scripts/fixtures/import-home.html'),'utf8');
const server=createServer((req,res)=>{
 if(req.url==='/explorer.js'){res.end(readFileSync(resolve(root,'packages/explorer-ui/dist/explorer.js')));return;}
 const mode=new URL(req.url,'http://localhost').searchParams.get('case')||'ready';
 const stub=`
 if(method==='explorer.window.transparency.set')return {enabled:params.enabled,background:'transparent'};
 if(method==='explorer.update.startup'||method==='explorer.update.check')return {status:'updateAvailable',currentVersion:${JSON.stringify(version)},latestVersion:'999.0.0',tagName:'v999.0.0',releaseUrl:'https://github.com/Rice-dog/code-codex/releases/tag/v999.0.0'};
 if(method==='explorer.update.install'){
   window.installStarted=performance.now();
   const phase=(name,details={})=>{for(const fn of listeners)fn({method:'explorer.update.progress',params:{latestVersion:'999.0.0',phase:name,details}})};
   phase('checking release'); await new Promise(r=>setTimeout(r,100));phase('downloading',{percent:42});await new Promise(r=>setTimeout(r,150));phase('verifying');await new Promise(r=>setTimeout(r,150));phase('waiting for installer window');
   await new Promise(r=>setTimeout(r,${mode==='ready'?12500:500}));
   if(${JSON.stringify(mode)}==='exit')return {id,ok:false,error:{code:'UPDATE_INSTALLER_EARLY_EXIT',message:'fixture early exit'}};
   window.installFinished=performance.now();
   return {latestVersion:'999.0.0',launched:true,...(${JSON.stringify(mode)}==='legacy'?{}:{windowReady:${mode==='ready'}})};
 }`;
 let html=base.replace('request:async({method,params})','request:async({id,method,params})').replace('__BUNDLE_URL__','/explorer.js').replace(' calls.push({method,params});',' calls.push({method,params});'+stub).replace('const calls=[];','const calls=window.calls=[];').replace('</style>','[data-app-shell-workspace-row]{height:calc(100% - 24px)}</style>');
 res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const checks=[];
const shell=`document.querySelector('${builtExplorerTag(root)}').shadowRoot`;
const e=s=>browser.evaluate(s),wait=async(s,label)=>{for(let i=0;i<500;i++){try{if(await e(s))return}catch{}await delay(35)}throw Error(label)};
const notice=`${shell}.querySelector('.action-notice')`;
async function open(mode){await browser.command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?case=${mode}`});await wait(`${shell}.querySelector('.status-code').dataset.updateState==='updateAvailable'`,'update available');await e(`${shell}.querySelector('.status-code').click();${shell}.querySelector('.update-install').click()`);}
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/?case=ready`);
 await wait(`${shell}.querySelector('.status-code').dataset.updateState==='updateAvailable'`,'ready');
 await e(`${shell}.querySelector('.status-code').click();${shell}.querySelector('.update-install').click()`);
 await wait(`${shell}.querySelector('.update-message').textContent.includes('waiting for its window')`,'handoff progress');
 assert.ok(await e(`${shell}.querySelector('.update-install').disabled`));checks.push('Update remains busy during installer window handoff');
 await delay(3100);assert.ok(await e(`!${notice}.hidden && ${notice}.dataset.tone==='progress'`));checks.push('Handoff feedback remains visible beyond ordinary 2.8 second notice');
 await e(`for(const fn of listeners)fn({method:'explorer.update.progress',params:{latestVersion:'998.0.0',phase:'downloading',details:{percent:99}}})`);
 assert.ok(await e(`${notice}.textContent.includes('waiting for its window')`));checks.push('Stale version progress is ignored');
 const shot=await browser.command('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,'update-waiting.png'),Buffer.from(shot.data,'base64'));
 await wait(`window.installFinished && ${notice}.textContent.includes('setup window is visible')`,'window confirmed');
 assert.ok(await e(`window.installFinished-window.installStarted>12000`));checks.push('Update survives a handoff lasting longer than the old 12 second request timeout');
 await open('timeout');await wait(`window.installFinished && ${notice}.textContent.includes('has not been confirmed')`,'unconfirmed');await delay(3100);
 assert.ok(await e(`!${notice}.hidden && !${notice}.textContent.includes('is visible')`));checks.push('Unconfirmed window retains persistent truthful feedback');
 await open('legacy');await wait(`window.installFinished && ${notice}.textContent.includes('has not been confirmed')`,'legacy result');checks.push('Legacy two-field response never falsely claims window readiness');
 await open('exit');await wait(`${notice}.dataset.tone==='error'`,'early exit');assert.ok(await e(`${shell}.querySelector('.update-message').textContent.includes('exited before')`));checks.push('Early installer exit appears in both update panel and error notice');
 writeFileSync(resolve(output,'update-ui.json'),JSON.stringify({version,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
