import { listStartupVideos, saveStartupVideo, type StartupVideo } from './startup-transition-facade';
import { runtimeEvent } from './runtime-events';
export interface StartupExample {id:string;name:string;asset:string;releaseTag:string;size:number;sha256:string;type:string;source:string}
declare const __CODE_CODEX_STARTUP_EXAMPLES__: readonly StartupExample[];
export const STARTUP_EXAMPLES=__CODE_CODEX_STARTUP_EXAMPLES__;
type Request=<T>(method:string,params?:Record<string,unknown>,timeout?:number)=>Promise<T>;
type Status={id:string;phase:string;receivedBytes:number;totalBytes:number;error?:string};
export interface ExampleProgress {phase:'checking'|'connecting'|'downloading'|'verifying'|'importing'|'complete';percent:number;index:number;total:number}
async function sha(blob:Blob):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function missingStartupExamples(videos:readonly StartupVideo[]):Promise<StartupExample[]> {
  const present=new Set<string>();
  for(const video of videos) {
    const candidates=STARTUP_EXAMPLES.filter(s=>s.size===video.blob.size);
    if(candidates.length){const digest=await sha(video.blob);for(const s of candidates)if(s.sha256===digest)present.add(s.id);}
  }
  return STARTUP_EXAMPLES.filter(s=>!present.has(s.id));
}
function active(signal:AbortSignal):void {if(signal.aborted)throw new DOMException('Example import was cancelled for the closed panel','AbortError');}
async function cancellable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  active(signal);
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(new DOMException('Example import was cancelled','AbortError'));
    signal.addEventListener('abort',stop,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}
export async function downloadStartupExamples(request:Request,signal:AbortSignal,onProgress:(p:ExampleProgress)=>void,onImported:(video:StartupVideo)=>Promise<void>):Promise<{added:number;alreadyDownloaded:boolean}> {
  active(signal);onProgress({phase:'checking',percent:0,index:0,total:2});
  const videos=await listStartupVideos();const missing=await missingStartupExamples(videos);active(signal);
  if(!missing.length){runtimeEvent('startup-examples','library check','already downloaded',{count:2,networkRequested:false});return {added:0,alreadyDownloaded:true};}
  const libraryBytes=videos.reduce((n,v)=>n+v.blob.size+(v.thumbnail?.size??0),0);
  if(videos.length+missing.length>32||libraryBytes+missing.reduce((n,s)=>n+s.size,0)>512*1024*1024)throw new Error('Video library limit: 32 videos / 512 MB. Remove a video and retry. No example download started.');
  const totalBytes=missing.reduce((n,s)=>n+s.size,0);let completedBytes=0,added=0;
  for(const [index,s] of missing.entries()) {
    active(signal);let polling=false;
    const report=(received:number,phase:ExampleProgress['phase'])=>onProgress({phase,percent:Math.min(99,Math.floor((completedBytes+received)/totalBytes*100)),index:index+1,total:missing.length});
    const poll=async()=>{if(polling||signal.aborted)return;polling=true;try{const statuses=await request<Status[]>('explorer.startup.examples.status');if(!signal.aborted){const status=statuses.find(j=>j.id===s.id);if(status)report(Math.min(s.size,status.receivedBytes),status.phase==='verifying'||status.phase==='ready'?'verifying':status.receivedBytes>0?'downloading':'connecting');}}catch(error){if(!signal.aborted)runtimeEvent('startup-examples','progress query','failed',{id:s.id,reason:String(error)});}finally{polling=false;}};
    const timer=setInterval(()=>{void poll();},400);
    try {
      report(0,'connecting');
      await cancellable(request('explorer.startup.examples.download',{id:s.id},260000),signal);
      const chunks:Uint8Array<ArrayBuffer>[]=[];let offset=0,lastChunk=-Infinity;
      while(offset<s.size){
        active(signal);
        const delay=20-(performance.now()-lastChunk);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));active(signal);lastChunk=performance.now();
        const part=await cancellable(request<{data:string;nextOffset:number;size:number}>('explorer.startup.examples.chunk',{id:s.id,offset}),signal);
        const bytes=Uint8Array.from(atob(part.data),c=>c.charCodeAt(0));
        if(part.size!==s.size||bytes.length===0||bytes.length>65536||part.nextOffset!==offset+bytes.length||part.nextOffset>s.size)throw new Error('Example transfer returned an invalid chunk');
        chunks.push(bytes);offset=part.nextOffset;
      }
      active(signal);report(s.size,'verifying');
      const file=new File(chunks,s.name,{type:s.type,lastModified:0});
      if(file.size!==s.size||await sha(file)!==s.sha256)throw new Error(`Example ${s.name} failed its size/SHA-256 check`);
      active(signal);clearInterval(timer);report(s.size,'importing');
      // Recheck after download so another local import cannot create a duplicate.
      if((await missingStartupExamples(await listStartupVideos())).some(m=>m.id===s.id)){
        active(signal);const video=await saveStartupVideo(file,s.sha256.slice(0,32));active(signal);await onImported(video);added++;
      }
      completedBytes+=s.size;
      runtimeEvent('startup-examples','library import','passed',{id:s.id,bytes:s.size,originalName:s.name});
    }finally{clearInterval(timer);}
  }
  active(signal);onProgress({phase:'complete',percent:100,index:missing.length,total:missing.length});
  return {added,alreadyDownloaded:false};
}
