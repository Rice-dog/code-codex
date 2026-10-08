import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function launchFixture(url){
  const profile=mkdtempSync(join(tmpdir(),'code-codex-package-test-'));
  const process=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--window-size=1500,1000','--remote-debugging-port=0',`--user-data-dir=${profile}`,url],{stdio:'ignore',windowsHide:true});
  let socket;let sequence=0;const pending=new Map();
  for(let i=0;i<200&&!existsSync(join(profile,'DevToolsActivePort'));i++)await delay(50);
  const port=readFileSync(join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=targets.find(t=>t.type==='page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
  socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id&&pending.has(v.id)){const p=pending.get(v.id);pending.delete(v.id);clearTimeout(p.timer);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout ${method}`));},25_000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  return {pid:process.pid,command,async evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;},async close(){
    await command('Browser.close').catch(()=>{});socket.close();
    if(process.exitCode===null)process.kill();
    for(let i=0;i<40&&process.exitCode===null;i++)await delay(50);
    const parent=resolve(tmpdir())+sep;
    if(!resolve(profile).startsWith(parent))throw Error('Unsafe fixture cleanup');
    // Chromium children can release their own profile files shortly after the browser exits.
    for(let attempt=0;attempt<8;attempt++){
      await delay(250);
      try{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150});return;}
      catch(error){if(!['EPERM','EBUSY','ENOTEMPTY'].includes(error.code))throw error;}
    }
    console.warn(`Fixture browser closed; temporarily locked test profile retained: ${profile}`);
  }};
}
