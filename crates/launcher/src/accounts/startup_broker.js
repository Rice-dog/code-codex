// Runs once in the launch-owned official main process, before its main module.
// No credentials/history are persisted or returned by the control interface.
(() => {
 const p=__PARAMS__;
 const get=typeof require==='function'?require:typeof process.mainModule?.require==='function'?process.mainModule.require.bind(process.mainModule):process.getBuiltinModule('node:module').createRequire(process.execPath);
 const http=get('node:http'),crypto=get('node:crypto'),path=get('node:path'),fs=get('node:fs'),cp=get('node:child_process'),mod=get('node:module');
 const marker=Symbol.for('code-codex:startup-account-transport:v1');
 if(globalThis[marker])throw Error('ACCOUNT_STARTUP_ALREADY_INSTALLED');
 const state={schema:1,pid:process.pid,rendererPort:p.rendererPort,ready:false,spawns:0,enabled:true,failed:false};
 const routes=new Map(),blocked=new Set(p.blocked),active=new Map(),direct=new Set(),threads=new Map();
 const prefix='/'+p.key,authority='localhost:'+p.port;
 const token=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
 const error=(res,code,message)=>{if(res.headersSent){res.destroy();return;}res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:{type:'account_route_unavailable',message}}));};
 const safeHeaders=headers=>{const h={...headers};for(const k of ['host','connection','proxy-authorization','proxy-connection','keep-alive','te','trailer','transfer-encoding','upgrade','origin','cookie'])delete h[k];return h;};
 const remember=thread=>{
  if(!thread||!token(thread.id)||threads.size>=8192&&!threads.has(thread.id))return;
  const parent=thread.parentThreadId??thread.source?.subAgent?.thread_spawn?.parent_thread_id;
  // Partial/unrecognized thread objects do not establish root ownership.
  if(!Object.hasOwn(thread,'parentThreadId')&&thread.source===undefined)return;
  const invalidParent=parent!=null&&!token(parent),subagent=thread.source&&typeof thread.source==='object'&&'subAgent'in thread.source;
  const record=invalidParent?{unknown:true}:token(parent)?{parent}:subagent?{unknown:true}:{parent:null};
  const prior=threads.get(thread.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(record)){threads.set(thread.id,{unknown:true});return;}
  threads.set(thread.id,record);
 };
 const lineage=id=>{const seen=new Set();for(let depth=0;depth<32;depth++){if(seen.has(id))return null;seen.add(id);const t=threads.get(id);if(!t||t.unknown)return null;if(t.parent===null)return id;id=t.parent;}return null;};
 const observe=child=>{
  let buffer='',dropping=false;
  child.stdout?.on('data',chunk=>{let text=chunk.toString('utf8');
   for(;;){const end=text.indexOf('\n');const part=end<0?text:text.slice(0,end);if(!dropping){if(buffer.length+part.length>1024*1024){buffer='';dropping=true;}else buffer+=part;}
    if(end<0)break;
    if(!dropping){try{const v=JSON.parse(buffer);if(v.method==='thread/started')remember(v.params?.thread);else if(v.result?.thread)remember(v.result.thread);}catch{}}
    buffer='';dropping=false;text=text.slice(end+1);if(!text)break;
   }
  });
 };
 const server=http.createServer({maxHeaderSize:128*1024},async(req,res)=>{
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.host!==authority||req.headers.origin||!req.url?.startsWith(prefix+'/'))return error(res,403,'ACCOUNT_STARTUP_CAPABILITY: Local request rejected.');
  if(req.url===prefix+'/control'){
   if(req.method!=='POST'||req.headers['x-code-codex-control']!==p.control)return error(res,403,'ACCOUNT_STARTUP_CONTROL: Control authentication failed.');
   let bytes=0,chunks=[];req.on('data',chunk=>{bytes+=chunk.length;if(bytes>16384){req.destroy();return;}chunks.push(chunk);});
   req.on('end',()=>{try{
    const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(v.action==='status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...state,routeCount:routes.size,blockedCount:blocked.size}));}
    if(v.action==='retire'&&state.spawns===0){cp.spawn=original;mod.syncBuiltinESMExports();server.close();return res.end('{"accepted":true}');}
    if(v.action==='route'&&token(v.thread)){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({direct:direct.has(v.thread),blocked:blocked.has(v.thread),target:routes.get(v.thread)?.target??null}));}
    if(v.action==='native'&&token(v.thread)&&typeof v.direct==='boolean'){
     if(v.direct){if(direct.size>=4096&&!direct.has(v.thread))throw Error('bound');direct.add(v.thread);}
     else{direct.delete(v.thread);routes.delete(v.thread);blocked.delete(v.thread);}
     return res.end('{"accepted":true}');
    }
    if(!/^[a-f0-9]{64}$/.test(v.owner))throw Error('owner');
    if(v.action==='restore'){
     for(const [id,r] of routes)if(r.owner===v.owner&&(active.get(id)??0)>0)throw Error('active');
     for(const [id,r] of routes)if(r.owner===v.owner)routes.delete(id);
     blocked.clear();state.enabled=false;
    }else if(v.action==='bind'&&token(v.thread)){
     if((active.get(v.thread)??0)>0)throw Error('active');
     if(v.target!==null){const u=new URL(v.target);if(u.protocol!=='http:'||u.hostname!=='localhost'||!u.port||u.username||u.password||u.search||u.hash||!/^\/[a-f0-9]{32}$/.test(u.pathname)||!/^[a-f0-9]{64}$/.test(v.proof))throw Error('target');}
     if(routes.size>=4096&&!routes.has(v.thread))throw Error('bound');
     const prior=routes.get(v.thread);if(prior&&prior.owner!==v.owner)throw Error('owner-change');
     routes.set(v.thread,{owner:v.owner,target:v.target,proof:v.proof});blocked.delete(v.thread);state.enabled=true;
    }else throw Error('action');
    res.setHeader('Content-Type','application/json');res.end('{"accepted":true}');
   }catch{error(res,409,'ACCOUNT_STARTUP_BINDING: Binding was not accepted; no request was replayed.');}});return;
  }
  const suffix=req.url.slice(prefix.length);
  if(req.method!=='POST'||!['/responses','/responses/compact'].includes(suffix))return error(res,404,'ACCOUNT_STARTUP_ENDPOINT: Unsupported endpoint.');
  const ids=req.rawHeaders.filter((_,i)=>i%2===0).map(v=>v.toLowerCase());
  const id=req.headers['thread-id'],session=req.headers['session-id'];
  if(!token(id)||session!==undefined&&!token(session)||ids.filter(v=>v==='thread-id').length!==1||ids.filter(v=>v==='session-id').length>1)return error(res,409,'ACCOUNT_STARTUP_THREAD: A unique native thread identity is required.');
  let root=lineage(id);
  // Native thread/started and resume replies can race the first HTTP header.
  // Wait only for local metadata, never a quota/auth/network refresh.
  if(!root){await new Promise(resolve=>setTimeout(resolve,50));root=lineage(id);}
  if(!root||session!==undefined&&session!==id&&session!==root)return error(res,409,'ACCOUNT_STARTUP_LINEAGE: Native conversation ownership is not confirmed; no alternate account was used.');
  if(blocked.has(root)||blocked.has(id))return error(res,409,'ACCOUNT_STARTUP_PENDING: Restore this conversation account before sending.');
  const route=routes.get(root);
  if(route?.target){
   const proof=crypto.createHash('sha256').update(String(req.headers.authorization??'')).digest('hex');
   if(proof!==route.proof)return error(res,409,'ACCOUNT_STARTUP_OWNER: Native identity changed; verify this conversation account before sending.');
  }
  const length=Number(req.headers['content-length']);
  if(!Number.isSafeInteger(length)||length<0||length>32*1024*1024||req.headers['transfer-encoding'])return error(res,413,'ACCOUNT_STARTUP_BODY: A bounded native request body is required.');
  // Official requests use Electron's system-proxy/TLS transport. Child/API
  // requests reuse the existing authenticated native per-thread relay.
  const target=route?.target?route.target+suffix:'https://chatgpt.com/backend-api/codex'+suffix;
  const headers=safeHeaders(req.headers);
  let upstream;
  try{
   if(route?.target){upstream=http.request(target,{method:'POST',headers});}
   else {const net=get('electron').net;upstream=net.request({url:target,method:'POST',redirect:'error',useSessionCookies:false});for(const [name,value]of Object.entries(headers))if(value!==undefined)upstream.setHeader(name,value);}
  }catch{return error(res,502,'ACCOUNT_STARTUP_TRANSPORT: Native transport unavailable; no request was replayed.');}
  active.set(root,(active.get(root)??0)+1);let finished=false;
  const finish=()=>{if(finished)return;finished=true;const n=(active.get(root)??1)-1;if(n)active.set(root,n);else active.delete(root);};
  upstream.on('response',response=>{const h=safeHeaders(response.headers);delete h['content-length'];if(!route?.target)delete h['content-encoding'];res.writeHead(response.statusCode,h);response.on('data',chunk=>{if(!res.write(chunk))response.pause();});res.on('drain',()=>response.resume());response.on('end',()=>{res.end();finish();});response.on('error',()=>{error(res,502,'ACCOUNT_STARTUP_STREAM: Upstream stream ended unexpectedly; no request was replayed.');finish();});});
  const abort=()=>{if(typeof upstream.abort==='function')upstream.abort();else upstream.destroy();finish();};
  upstream.on('error',()=>{error(res,502,'ACCOUNT_STARTUP_UPSTREAM: Upstream request failed; no request was replayed.');finish();});
  req.on('aborted',abort);req.on('error',abort);res.on('close',()=>{if(!res.writableEnded)abort();else finish();});
  let received=0;req.on('data',chunk=>{received+=chunk.length;if(received>length){abort();req.destroy();return;}if(upstream.write(chunk)===false)req.pause();});upstream.on('drain',()=>req.resume());req.on('end',()=>{if(received!==length){abort();error(res,400,'ACCOUNT_STARTUP_BODY: Native body was incomplete.');}else upstream.end();});
 });
 server.requestTimeout=30000;server.headersTimeout=10000;server.keepAliveTimeout=1000;server.maxRequestsPerSocket=100;
 server.maxConnections=128;
 server.on('clientError',(_,socket)=>socket.destroy());
 // Warm-up sockets are not account-bound. Request native HTTP fallback rather
 // than retain a socket across a subsequent account selection.
 server.on('upgrade',(_req,socket)=>socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
 server.on('error',()=>{state.failed=true;state.ready=false;});
 server.listen(p.port,'127.0.0.1',()=>{state.ready=true;server.unref();});
 const original=cp.spawn,verified=new Map();
 const normalize=value=>path.resolve(value).replace(/^\\\\\?\\/,'').toLowerCase();
 const nativeBackend=command=>{
  const resolved=normalize(command);if(resolved===normalize(p.backend))return true;
  if(path.basename(resolved)!==path.basename(normalize(p.backend)))return false;
  // The official Windows runtime stages an identical backend outside its
  // package. Qualify its actual bytes, never a guessed cache-directory name.
  const fd=fs.openSync(command,'r');try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size!==p.backendSize)return false;
   const prior=verified.get(resolved);if(prior&&prior.size===stat.size&&prior.mtime===stat.mtimeMs)return prior.valid;
   const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024);let n;
   while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));
   const valid=hash.digest('hex')===p.backendSha256;verified.set(resolved,{size:stat.size,mtime:stat.mtimeMs,valid});return valid;
  }finally{fs.closeSync(fd);}
 };
 function spawn(command,args,options){
  let routed=false;
  if(typeof command==='string'&&Array.isArray(args)&&args.includes('app-server')&&nativeBackend(command)){
   if(!state.ready||state.failed){state.failed=true;return Reflect.apply(original,this,[command,args,options]);}
   // Native CLI configuration, confined to this launch-owned official backend.
   args=['-c','openai_base_url='+JSON.stringify('http://'+authority+prefix),'-c','features.enable_request_compression=false','-c','thread_unload_delay_secs=0',...args];
   routed=true;
  }
  const child=Reflect.apply(original,this,[command,args,options]);if(routed){observe(child);state.spawns++;}return child;
 }
 cp.spawn=spawn;mod.syncBuiltinESMExports();
 globalThis[marker]=Object.freeze({schema:1});
 for(const list of [process.argv,process.execArgv])for(let i=list.length-1;i>=0;i--)if(list[i].toLowerCase().startsWith('--inspect-brk'))list.splice(i,1);
 try{get('electron').app.commandLine.removeSwitch('inspect-brk');}catch{}
 setTimeout(()=>{try{get('node:inspector').close();}catch{}},500);
 return {installed:true,schema:1};
})()
