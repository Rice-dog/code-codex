import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
export const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'artifacts/import-reconciliation');fs.mkdirSync(out,{recursive:true});
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function openBrowser(html){
 const file=path.join(out,'fixture-'+Date.now()+'.html');fs.writeFileSync(file,html);
 const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--allow-file-access-from-files','--window-size=1280,900','--remote-debugging-port=0','--user-data-dir='+path.join(out,'profile-'+Date.now()),'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 let endpoint;try{endpoint=await new Promise((r,j)=>{let log='',timer=setTimeout(()=>j(Error('browser startup timeout')),15000);child.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);r(m[1]);}});child.once('error',j);});}catch(e){child.kill();throw e;}
 const ws=new WebSocket(endpoint);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0,session;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const cmd=(method,params={},sid=session)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error(method+' timeout'));},35000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params,...sid?{sessionId:sid}:{}}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const targets=await cmd('Target.getTargets',{},null);({sessionId:session}=await cmd('Target.attachToTarget',{targetId:targets.targetInfos.find(t=>t.type==='page').targetId,flatten:true},null));await cmd('Page.enable');await cmd('Page.navigate',{url:pathToFileURL(file).href});await sleep(400);
 const wait=async(expression,label,ms=12000)=>{let stop=Date.now()+ms;while(Date.now()<stop){if(await ev(expression))return;await sleep(60);}throw Error(label+' timeout');};
 const shot=async name=>{const r=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));};
 return {cmd,ev,wait,shot,async close(){await Promise.race([cmd('Browser.close',{},null).catch(()=>{}),sleep(1500)]);ws.close();child.kill();for(const p of pending.values())clearTimeout(p.timer);}};
}
export function homeFixture(){return fs.readFileSync(path.join(root,'scripts/fixtures/import-home.html'),'utf8').replace('__BUNDLE_URL__',pathToFileURL(path.join(root,'packages/explorer-ui/dist/explorer.js')).href);}
export function record(name,value){fs.writeFileSync(path.join(out,name),JSON.stringify({at:new Date().toISOString(),...value},null,2)+'\n');}
