import assert from 'node:assert/strict';
import {build} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture} from './browser-fixture.mjs';
const out=resolve('artifacts/account-error-presentation');await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:resolve('packages/explorer-ui/src'),loader:'ts',contents:`
import {accountFailureMessage} from './features/accounts/error-presentation';
import {updateQuota,quotaElement} from './features/accounts/quota-view';
window.message=accountFailureMessage;
window.show=(error,locale,cached)=>{
 window[Symbol.for('code-codex:language-service:v1')]={getLocale:()=>locale,t:(k,p)=>k==='accounts.quotaCached'?'cached '+p.time:k};
 const e=quotaElement('child',true);document.body.replaceChildren(e);
 updateQuota(e,{remaining:()=>({fiveHour:100,weekly:84}),resetTimes:()=>({fiveHour:null,weekly:null}),diagnostics:()=>({phase:'unavailable',error,lastSuccessAt:cached?Date.now():undefined})});
 return {text:e.textContent,title:e.querySelector('[role=status]').title,aria:e.getAttribute('aria-label')};
};`},bundle:true,format:'iife',outfile:resolve(out,'fixture.js')});
const js=await readFile(resolve(out,'fixture.js'));
const server=createServer((q,s)=>{s.setHeader('Content-Type',q.url==='/fixture.js'?'text/javascript':'text/html');s.end(q.url==='/fixture.js'?js:'<html><body><script src="/fixture.js"></script></body></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`),checks=[];
try{
 for(const [input,expected] of [['ACCOUNT_BACKEND: error sending request','服务连接失败'],['ACCOUNT_STREAM_UNCLASSIFIED: unknown','暂时无法查询'],['ACCOUNT_BACKEND: failed to fetch codex rate limits: HTTP 503','暂时无法查询'],['ACCOUNT_USAGE_TIMEOUT','暂时未响应'],['ACCOUNT_USAGE_INCOMPLETE','暂不完整'],['ACCOUNT_AUTH_REQUIRED','重新登录']]){
  const v=await browser.evaluate(`show(${JSON.stringify(input)},'zh-CN',true)`);assert(v.text.includes(expected));assert(v.text.includes('cached'));assert(v.text.includes('84%'));assert(!v.text.includes('ACCOUNT_'));assert(v.title.includes('ACCOUNT_'));checks.push(input);
 }
 const fresh=await browser.evaluate(`show('ACCOUNT_BACKEND: error sending request','en',false)`);assert(fresh.text.includes('Service connection failed'));assert(!fresh.text.includes('cached'));checks.push('English without fake cache timestamp');
 const net=await browser.evaluate(`message('stream disconnected before completion: error sending request','send','zh-CN')`);assert(net.includes('服务连接中断'));checks.push('Terminal send network notice');
 const unknown='ACCOUNT_PROTOCOL: unknown contract';assert.equal(await browser.evaluate(`message(${JSON.stringify(unknown)},'send','en')`),unknown);checks.push('Unrelated send failure is unchanged');
 await writeFile(resolve(out,'result.json'),JSON.stringify({passed:true,checks,scope:'Production formatter and quota DOM in Chromium; no network reads, authentication or inference'},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();server.close();}
