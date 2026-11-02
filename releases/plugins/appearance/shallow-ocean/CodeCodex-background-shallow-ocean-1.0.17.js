(()=>{var C=class{constructor(i){this.report=i;this.signal=this.#e.signal}#o=!1;#l=new Set;signal;#e=new AbortController;get disposed(){return this.#o}own(i){let n=!0,e=()=>{n&&(n=!1,this.#l.delete(e),i())};return this.#o?e():this.#l.add(e),e}listen(i,n,e,t){return this.#o?()=>{}:(i.addEventListener(n,e,t),this.own(()=>i.removeEventListener(n,e,t)))}dispose(){if(!this.#o){this.#o=!0,this.#e.abort();for(let i of[...this.#l].reverse())try{i()}catch(n){try{this.report(n)}catch{}}}}};function U(r){let i=0,n=0,e=0,t=(a,c)=>{if(++n>8192||c>10)throw Error("BG_ASSET_SHAPE: Visual asset structure exceeds its budget.");if(ArrayBuffer.isView(a)){if((a instanceof Float32Array||a instanceof Float64Array)&&!a.every(Number.isFinite))throw Error("BG_ASSET_NUMBER: Prepared visual numbers must be finite.");if(i+=a.byteLength,i>32*1024*1024)throw Error("BG_ASSET_SIZE: Prepared visual assets exceed 32 MiB.");return a}if(Array.isArray(a))return a.map(h=>t(h,c+1));if(a&&typeof a=="object"&&[Object.prototype,null].includes(Object.getPrototypeOf(a))){let h={};for(let[d,m]of Object.entries(a)){if(T({[d]:null}),e+=new TextEncoder().encode(d).length+4,e>65536)throw Error("BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.");h[d]=t(m,c+1)}return h}let l=T(a);if(e+=new TextEncoder().encode(JSON.stringify(l)).length,e>65536)throw Error("BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.");return l};return t(r,0)}function T(r){let i=0,n=(t,a)=>{if(++i>4096||a>8)throw Error("BG_STATE_LIMIT: Visual state exceeds the bounded schema.");if(t===null||typeof t=="boolean")return t;if(typeof t=="number"){if(!Number.isFinite(t))throw Error("BG_STATE_NUMBER: Visual numbers must be finite.");return t}if(typeof t=="string"){if(t.length>1024)throw Error("BG_STATE_STRING: Visual strings must be bounded.");return t}if(Array.isArray(t))return t.map(c=>n(c,a+1));if(t&&typeof t=="object"&&[Object.prototype,null].includes(Object.getPrototypeOf(t))){let c={};for(let[l,h]of Object.entries(t)){if(/^(?:__proto__|constructor|prototype|token|accessToken|refreshToken|authorization|cookie|bridge|conversation|history|source|url|path)$/i.test(l))throw Error("BG_STATE_FIELD: Visual state contains an unsupported field.");h!==void 0&&(c[l]=n(h,a+1))}return c}throw Error("BG_STATE_TYPE: Visual state must contain serializable visual values.")},e=n(r,0);if(new TextEncoder().encode(JSON.stringify(e)).length>65536)throw Error("BG_STATE_SIZE: Visual state exceeds the message budget.");return e}function I(r,i){if(![r.width,r.height,r.left,r.top,i].every(Number.isFinite)||r.width<0||r.height<0)throw Error("BG_VIEWPORT_INVALID: Invalid visual dimensions.");let n=Math.max(1,Math.min(8192,r.width)),e=Math.max(1,Math.min(8192,r.height)),t=Math.min(3,Math.max(.5,i),Math.sqrt(16777216/(n*e)));return{width:n,height:e,left:r.left,top:r.top,dpr:t}}var $=/(token|cookie|password|secret|credential|authorization|apikey)/i,K=/^(content|text|body|prompt|messages|title|filename|name|raw|data|database64|commandline|sessionid|accountid|threadid|projectid)$|(?:path|url|uri)$/i;function v(r){return r.slice(0,8e3).replace(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'<>]+/g,n=>{try{let e=new URL(n);if(["127.0.0.1","localhost","[::1]"].includes(e.hostname)&&!e.username&&!e.password&&["/json/version","/json/list","/"].includes(e.pathname))return`${e.origin}${e.pathname}`}catch{}return"[url]"}).replace(/(?:\b[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc|opt|mnt)\/|~\/)[^\r\n"'<>]*/g,"[path]").replace(/\b(?:Bearer\s+\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\s*[:=]\s*[^,;\r\n]+)/gi,"[credential]").replace(/\bsk-[A-Za-z0-9_-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,"[credential]").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,"[email]").slice(0,4e3)+(r.length>8e3?" [truncated]":"")}function O(r){let i=256,n=new WeakSet,e=(t,a)=>{if(--i<0||a>6)return"[truncated]";if(typeof t=="string")return v(t);if(t===null||typeof t=="boolean"||typeof t=="number")return t;if(typeof t!="object")return"[unsupported]";if(n.has(t))return"[circular]";if(n.add(t),t instanceof Error)return{name:v(t.name),message:v(t.message)};if(Array.isArray(t))return t.slice(0,128).map(l=>e(l,a+1));let c=Object.create(null);for(let[l,h]of Object.entries(t).slice(0,128)){let d=l.replace(/[^a-z0-9]/gi,"");c[v(l).slice(0,160)]=$.test(d)||K.test(d)?"[redacted]":e(h,a+1)}return c};try{return e(r,0)}catch{return{redactionFailed:!0}}}var Q=Symbol.for("code-codex:runtime-events:v1"),ee=window,R=ee[Q]??={events:[],dropped:0};function p(r,i,n,e={}){let t={source:v(r).slice(0,160),action:v(i).slice(0,160),outcome:v(n).slice(0,160),details:{...O(e),observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}},a=new TextEncoder().encode(JSON.stringify(t)).length;a>7e3&&(t.details={truncated:!0,originalBytes:a,observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}),R.events.push(t),R.events.length>1e3&&(R.events.splice(0,200),R.dropped+=200)}var te=Symbol.for("code-codex:background-startup-hold:v1");function ne(){let r=window;return r[te]??={active:!1,layers:new Set,next:-1,pending:new Map,painted:new WeakSet,openings:new WeakMap}}function ie(r){return r.closest("[data-code-codex-particle-layer]")}function k(r){return!!ie(r)&&ne().active}var B=()=>{let r=window;return r[Symbol.for("code-codex:background-isolation:v1")]??=new Map},P=class{constructor(i,n,e,t,a,c=()=>{},l={}){this.host=e;this.onError=c;if(typeof Worker!="function"||typeof t.transferControlToOffscreen!="function")throw Error("BG_BACKEND_UNAVAILABLE: Independent background rendering is unavailable.");let h=T(a),d=I(e.getBoundingClientRect(),devicePixelRatio||1);this.#s={id:i,mode:"worker",phase:"preparing",frames:0,pending:0},B().set(this,this.#s),this.#e=new C(s=>p("background","resource release","failed",{id:i,error:String(s)})),this.ready=this.firstFrame=new Promise((s,o)=>{this.#o=s,this.#l=o}),this.ready.catch(()=>{}),this.#f=d;let m=URL.createObjectURL(new Blob([n],{type:"text/javascript"}));this.#e.own(()=>URL.revokeObjectURL(m));try{this.#i=new Worker(m,{name:"code-codex-background-"+i})}catch(s){throw this.#e.dispose(),B().delete(this),s}let y=this.#i,M=setTimeout(()=>this.#u("BG_FIRST_FRAME_TIMEOUT: The background did not produce a first frame within 15 seconds."),15e3);this.#e.own(()=>clearTimeout(M)),this.#e.listen(t,"webglcontextlost",s=>{s.preventDefault(),this.#u("BG_WORKER_CONTEXT_LOST: The transferred background graphics context was lost. Enable the background again to retry.")}),this.#e.listen(y,"error",s=>this.#u("BG_WORKER_ERROR: "+s.message)),this.#e.listen(y,"messageerror",()=>this.#u("BG_WORKER_PROTOCOL: The background response could not be decoded.")),this.#e.listen(y,"message",s=>{let o=s.data;if(!(this.#h||o?.v!==1||o.session!==this.#n)){if(o.type==="failed"){this.#u("BG_WORKER_RENDER_FAILED: "+String(o.message).slice(0,1500));return}if(o.type==="first-frame"&&!this.#p&&(this.#p=!0,this.#s.frames=o.frames??1,clearTimeout(M),this.#s.phase="running",this.#o(),this.#y(),p("background","isolated first frame","ready",{id:i,backend:"worker"})),o.type==="sample"&&Number.isSafeInteger(o.frames)&&(this.#s.frames=o.frames),o.type==="event"&&typeof o.event=="string"&&this.kernelEvent(o.event,o.value),o.type==="result"&&Number.isSafeInteger(o.callId)){let u=this.#d.get(o.callId);u&&(clearTimeout(u.timer),this.#d.delete(o.callId),o.error?u.reject(Error("BG_KERNEL_FAILED: "+String(o.error))):u.resolve(o.value))}o.type==="ack"&&o.seq===this.#c&&(clearTimeout(this.#v),this.#v=void 0,this.#c=0,this.#s.pending=0,this.#g())}});let x=new ResizeObserver(()=>{let s=I(this.host.getBoundingClientRect(),devicePixelRatio||1);JSON.stringify(s)!==JSON.stringify(this.#f)&&(this.#f=s,this.#m({viewport:s}))});x.observe(e),this.#e.own(()=>x.disconnect());let _=new IntersectionObserver(s=>{this.#x=s[0]?.isIntersecting??!0,this.#y()});_.observe(e),this.#e.own(()=>_.disconnect());let g=matchMedia("(prefers-reduced-motion: reduce)");this.#e.listen(g,"change",()=>this.#m({reduced:g.matches})),this.#e.listen(document,"visibilitychange",()=>this.#y()),this.#e.listen(window,"code-codex:background-hold-changed",()=>this.#y()),this.#e.listen(window,"pagehide",()=>this.dispose());let J=s=>{if(!this.#p||this.#h||l.interactive===!1||!["pointerup","pointercancel"].includes(s.type)&&s.composedPath().some(S=>S instanceof Element&&S.matches('button,a,input,textarea,select,[contenteditable],dialog,[role="menu"],[role="menubar"],[popover]')))return;let o=s,u=this.#f;if(s instanceof PointerEvent&&!["pointermove","pointerleave","pointerup","pointercancel"].includes(s.type)&&(o.clientX<u.left||o.clientX>u.left+u.width||o.clientY<u.top||o.clientY>u.top+u.height))return;let w={type:s.type};if(s instanceof PointerEvent)Object.assign(w,{clientX:o.clientX,clientY:o.clientY,pointerId:o.pointerId,button:o.button,buttons:o.buttons,isPrimary:o.isPrimary,pointerType:o.pointerType});else if(s instanceof WheelEvent){let S=this.#a.find(b=>b.type==="state"&&b.input?.type==="wheel");if(S){let b=S.input;b.deltaX=Math.max(-1e4,Math.min(1e4,b.deltaX+s.deltaX)),b.deltaY=Math.max(-1e4,Math.min(1e4,b.deltaY+s.deltaY));return}Object.assign(w,{deltaX:s.deltaX,deltaY:s.deltaY,deltaMode:s.deltaMode,clientX:s.clientX,clientY:s.clientY})}else s instanceof KeyboardEvent&&Object.assign(w,{repeat:s.repeat,isComposing:s.isComposing,altKey:s.altKey,ctrlKey:s.ctrlKey,metaKey:s.metaKey,shiftKey:s.shiftKey,key:"",code:""});s.type==="pointermove"?((o.clientX<u.left||o.clientX>u.left+u.width||o.clientY<u.top||o.clientY>u.top+u.height)&&(w.type="pointerleave"),this.#m({input:w})):this.#a.length<8?(this.#a.push({type:"state",input:w}),this.#g()):this.#u("BG_INPUT_QUEUE_FULL: Background input exceeded the bounded discrete-event queue.")};for(let s of["pointermove","pointerleave","pointerdown","pointerup","pointercancel","wheel","keydown"])this.#e.listen(window,s,J,{passive:!0});try{let s=t.transferControlToOffscreen();y.postMessage({v:1,session:this.#n,type:"init",canvas:s,settings:h,viewport:this.#f,reduced:g.matches,held:k(e)},[s])}catch(s){this.#u("BG_CANVAS_TRANSFER: "+String(s))}}ready;firstFrame;#o;#l;#e;#i;#n=crypto.randomUUID();#t=0;#c=0;#r;#a=[];#d=new Map;#b=0;#p=!1;#h=!1;#x=!0;#f;#v;#s;get diagnostics(){return{...this.#s}}setSettings(i){this.#m({settings:T(i)})}updateSettings(i){this.setSettings(i)}replay(){if(!this.#h){if(this.#a.length>=8)throw Error("BG_COMMAND_QUEUE_FULL: Wait for the pending visual command.");this.#a.push({type:"replay"}),this.#g()}}kernelEvent(i,n){}activityChanged(i){}call(i,n=[],e=3e4){if(this.#h)return Promise.reject(Error("BG_KERNEL_DISPOSED: The visual worker has been retired."));if(this.#d.size>=8||this.#a.length>=8)return Promise.reject(Error("BG_COMMAND_QUEUE_FULL: Wait for the pending visual command."));let t=U(n),a=++this.#b,c=new Promise((l,h)=>{let d=setTimeout(()=>{this.#d.delete(a),h(Error("BG_KERNEL_TIMEOUT: The visual command did not confirm completion. It was not replayed."))},e);this.#d.set(a,{resolve:l,reject:h,timer:d})});return this.#a.push({type:"call",method:i,args:t,callId:a}),this.#g(),c}resumeOpening(){this.replay()}#y=()=>{let i=!document.hidden&&this.#x&&(!this.#p||!k(this.host));this.#m({visible:i}),this.activityChanged(i)};#m(i){this.#h||(this.#r={...this.#r,...i},this.#g())}#g(){if(this.#h||this.#c)return;let i;if(this.#r&&["settings","viewport","visible","reduced"].some(n=>n in this.#r)){let{input:n,...e}=this.#r;i={type:"state",...e},this.#r=n?{input:n}:void 0}else if(this.#a.length)i=this.#a.shift();else if(this.#r)i={type:"state",...this.#r},this.#r=void 0;else return;this.#c=++this.#t,this.#s.pending=1;try{this.#i.postMessage({v:1,session:this.#n,seq:this.#c,...i})}catch(n){this.#u("BG_WORKER_SEND_FAILED: "+String(n));return}this.#v=setTimeout(()=>this.#u("BG_WORKER_ACK_TIMEOUT: The visual worker stopped acknowledging bounded updates."),5e3)}#u(i){if(!this.#h){this.#s.phase="failed",this.#s.error=i,this.#l(Error(i)),p("background","visual worker","failed",{id:this.#s.id,session:this.#n,sequence:this.#t,pending:this.#c,message:i});try{this.onError(i)}finally{this.dispose()}}}dispose(){if(this.#h)return;this.#h=!0,this.#e.dispose(),clearTimeout(this.#v),this.#r=void 0,this.#a=[],this.#p||this.#l(new DOMException("Background preparation was cancelled.","AbortError"));for(let l of this.#d.values())clearTimeout(l.timer),l.reject(new DOMException("Background command was cancelled.","AbortError"));this.#d.clear();let i=this.#i,n=this.#n,e=++this.#t;this.#s.phase="disposing";let t=!1,a=()=>{t||(t=!0,clearTimeout(c),i.terminate(),B().delete(this))},c=setTimeout(()=>{p("background","worker disposal","unconfirmed",{id:this.#s.id,timeoutMs:1500}),a()},1500);i.addEventListener("message",l=>{l.data?.session===n&&l.data?.type==="disposed"&&a()});try{i.postMessage({v:1,session:n,seq:e,type:"dispose"})}catch{a()}}};var F={defaultCreaturesEnabled:1,performanceMode:0,silverCount:72,reefCount:12,clownCount:6,sharkCount:2,turtleCount:2,beachSize:1,fishSpeed:1,fishSize:1.15,schoolCohesion:1,fleeRadius:.105,clarity:1.15,caustics:1.15,surfaceReflection:.3,sunGlint:1,foamIntensity:1,refractionScale:1,shadowIntensity:.65,swell:1,rippleStrength:1,waterSpeed:1,coralDensity:1.2,grassDensity:1.2,eventsEnabled:1,introEnabled:1,introDuration:5.2,introIntensity:1},re={defaultCreaturesEnabled:[0,1,1],performanceMode:[0,3,1],silverCount:[0,160,1],reefCount:[0,36,1],clownCount:[0,18,1],sharkCount:[0,8,1],turtleCount:[0,6,1],beachSize:[0,2,.05],fishSpeed:[0,3,.05],fishSize:[.5,2,.05],schoolCohesion:[.2,2.5,.05],fleeRadius:[.03,.25,.005],clarity:[.4,1.8,.05],caustics:[0,2.5,.05],surfaceReflection:[0,1.2,.05],sunGlint:[0,3,.1],foamIntensity:[0,2.5,.05],refractionScale:[0,2.5,.05],shadowIntensity:[0,1,.05],swell:[0,2,.05],rippleStrength:[0,2.5,.05],waterSpeed:[0,2,.05],coralDensity:[.3,2,.1],grassDensity:[0,2,.1],eventsEnabled:[0,1,1],introEnabled:[0,1,1],introDuration:[1.5,12,.1],introIntensity:[0,2,.05]};var G="code-codex:shallow-ocean-background:v1";function E(r){let i=r&&typeof r=="object"?r:{};return Object.fromEntries(Object.entries(F).map(([n,e])=>{let[t,a,c]=re[n],l=typeof i[n]=="number"&&Number.isFinite(i[n])?i[n]:e;return[n,Math.max(t,Math.min(a,c===1?Math.round(l):l))]}))}var ae=Symbol.for("code-codex:language:v1"),se=window,f=se[ae]??={preference:{schema:1,locale:"en",revision:0,source:"system-default"},listeners:new Set,tail:Promise.resolve()};function oe(r){return!!r&&r.schema===1&&["zh-CN","en"].includes(r.locale)&&Number.isSafeInteger(r.revision)&&r.revision>=0&&r.revision<=4294967295&&["installer","menu","system-default"].includes(r.source)}function H(r){if(!r||typeof r!="object")return;let i=r;if(!oe(i)||i.revision<f.preference.revision)return;let n=i.locale!==f.preference.locale||i.revision!==f.preference.revision;if(f.preference={...i},n)for(let e of[...f.listeners])try{e()}catch(t){p("localization","apply","failed",{code:"CC-LANG-APPLY-001",reason:String(t)})}}var N=window;N.__CODE_CODEX_INITIAL_LANGUAGE__&&(H(N.__CODE_CODEX_INITIAL_LANGUAGE__),delete N.__CODE_CODEX_INITIAL_LANGUAGE__);var W=()=>window[Symbol.for("code-codex:language-service:v1")];var V=()=>W()?.getLocale()??f.preference.locale;var j=r=>W()?.subscribeLanguage(r)??(f.listeners.add(r),()=>{f.listeners.delete(r)});function A(r=5.2){let i=Math.min(1.6,r*.5);return{reveal:Math.min(.7,i*.5),prelude:i}}function q(r,i=5.2){let{reveal:n,prelude:e}=A(i),t=(a,c,l)=>{let h=Math.max(0,Math.min(1,(l-a)/(c-a)));return h*h*(3-2*h)};return{opacity:t(0,n,r),titleOpacity:t(n,n+(e-n)*.4,r)*(1-t(e,e+Math.min(.6,i*.15),r)),titleY:(1-t(n,e,r))*10,cameraProgress:Math.max(0,Math.min(1,(r-e)/(i-e)))}}var z=class extends P{constructor(n,e,t,a,c,l=!0,h){super("shallow-ocean",n,e,t,E(a),g=>{g&&c(g.includes("SHALLOW_OCEAN_RENDER_FAILED")?g:"SHALLOW_OCEAN_RENDER_FAILED: "+g)},{interactive:l});this.target=e;this.hooks=h;this.#i=document.createElement("div"),this.#i.dataset.oceanOpeningTitle="",this.#i.setAttribute("aria-hidden","true"),this.#i.style.cssText="position:absolute;inset:0;display:grid;align-content:center;justify-items:center;gap:17px;pointer-events:none;z-index:7;color:#e5f8ee;text-align:center;text-shadow:0 2px 24px #063d4a66;opacity:0;will-change:opacity,transform";let d=document.createElement("span");d.textContent="O C E A N  S H A L L O W S",d.style.cssText="font-size:9px;letter-spacing:5px;text-indent:5px;opacity:.65";let m=document.createElement("b");m.style.cssText="font:400 clamp(28px,5vw,46px)/1.4 'Fraunces','Songti SC','SimSun',serif;letter-spacing:.22em;text-indent:.22em";let y=document.createElement("i");y.style.cssText="width:38px;height:1px;background:linear-gradient(90deg,transparent,#c9e9da99,transparent)",this.#i.append(d,m,y),e.append(this.#i);let M=()=>{m.textContent=V()==="zh-CN"?"浅海来信":"Shallow Ocean Letters"};M(),this.#r=j(M);let x=matchMedia("(prefers-reduced-motion: reduce)"),_=()=>{x.matches&&(this.#n?.cancel(),this.#t?.cancel())};x.addEventListener("change",_),this.#a=()=>x.removeEventListener("change",_),a.introEnabled&&!x.matches&&(this.#t=e.animate([{opacity:0},{opacity:1}],{duration:A(a.introDuration).reveal*1e3,fill:"both"}),this.#t.pause(),this.#t.currentTime=0),this.ready.then(()=>this.resumeOpening()).catch(()=>{}),this.syncIncluded()}#o=!0;#l=null;#e="";#i;#n;#t;#c=!1;#r;#a;command(n,e=[]){this.call(n,e).catch(t=>{t?.name!=="AbortError"&&console.error("BG_OCEAN_COMMAND_FAILED",n,t)})}syncIncluded(){if(!this.hooks)return;let n=this.hooks.included(),e=JSON.stringify(n);e!==this.#e&&(this.#e=e,this.command("includeEvents",[n]))}setSettings(n){super.setSettings(E(n)),n.introEnabled||(this.#n?.cancel(),this.#t?.cancel()),this.syncIncluded()}async addCreature(n,e=.5,t=.5){this.#l=await this.call("addCreature",[n,e,t])}previewEvent(n){this.command("previewEvent",[n])}cancelEvent(){this.command("cancelEvent")}action(n){this.command("action",[n])}get diagnostics(){return this.#l?{...super.diagnostics,...this.#l}:super.diagnostics}activityChanged(n){this.#o=n,n?(this.#n?.playState==="paused"&&this.#n.play(),this.#c&&this.#t?.playState==="paused"&&this.#t.play()):(this.#n?.playState==="running"&&this.#n.pause(),this.#t?.playState==="running"&&this.#t.pause())}resumeOpening(){this.#c=!1,super.resumeOpening()}kernelEvent(n,e){if(n==="ocean-snapshot"&&(this.#l=e,this.syncIncluded()),n==="ocean-event"&&(this.hooks?.started(e),this.syncIncluded()),n==="ocean-opening"){if(this.#n?.cancel(),!e.active){this.#t?.cancel();return}let t=Array.from({length:241},(a,c)=>{let l=c/240,h=q(l*e.duration,e.duration);return{offset:l,opacity:h.titleOpacity,transform:`translateY(${h.titleY}px)`}});if(this.#n=this.#i.animate(t,{duration:e.duration*1e3,fill:"both"}),this.#n.currentTime=e.elapsed*1e3,this.#o||this.#n.pause(),!this.#c){this.#c=!0;let a=this.#t;this.#t=this.target.animate([{opacity:0},{opacity:1}],{duration:A(e.duration).reveal*1e3,easing:"cubic-bezier(.4,0,.2,1)",fill:"both"}),a?.cancel(),this.#t.currentTime=Math.min(e.elapsed,A(e.duration).reveal)*1e3,this.#o||this.#t.pause()}}}dispose(){this.#n?.cancel(),this.#t?.cancel(),this.#i?.remove(),this.#r?.(),this.#a?.(),super.dispose()}};function le(r){try{let i=[],n=new Set,e=r;for(;e!=null&&i.length<8&&!n.has(e);)if(n.add(e),e instanceof Error)i.push(`${e.name}: ${e.message}`),e=e.cause;else{i.push(typeof e=="string"?e:"Non-Error rejection");break}let t=r&&typeof r=="object"&&"code"in r?r.code:void 0,a={errorChain:i,...typeof t=="string"||typeof t=="number"?{errorCode:typeof t=="string"?t.slice(0,160):t}:{},...r instanceof Error&&r.stack?{exceptionStack:r.stack.slice(0,3e3)}:{},chainTruncated:e!=null&&i.length>=8},c=new TextEncoder().encode(JSON.stringify(a)).length;return c>5800&&(a.errorChain=i.map(l=>l.slice(0,80)),typeof a.exceptionStack=="string"&&(a.exceptionStack=a.exceptionStack.slice(0,200)),a.detailsTruncated=!0,a.originalDetailBytes=c),a}catch{return{errorChain:["Exception details could not be inspected safely."]}}}var D=new Map;function X(r,i){try{let n=performance.now(),e=D.has(r)||D.size<256?r:"other handlers",t=D.get(e);if(t||(t={start:n,count:0,suppressed:0},D.set(e,t)),n-t.start>1e4&&(t.suppressed&&p("handled-exception",e,"throttled",{suppressedCount:t.suppressed}),t.start=n,t.count=0,t.suppressed=0),++t.count>3){t.suppressed++;return}let a=le(i),c=(i instanceof Error||i instanceof DOMException)&&i.name==="AbortError";p("handled-exception",e,c?"cancelled":"failed",{...a,recovery:"Existing handler continues; recording does not retry, reset settings or prove recovery succeeded."})}catch{}}function Y(){try{return E(JSON.parse(localStorage.getItem(G)??"{}"))}catch(r){return X("Shallow Ocean settings read",r),{...F}}}var Z=class extends z{constructor(...r){super(`"use strict";(()=>{var kp=Object.defineProperty;var Np=(s,e)=>{for(var t in e)kp(s,t,{get:e[t],enumerable:!0})};globalThis.window=globalThis;function Wu(s,e,t){let n=globalThis,i=e,r=!0,a=!1,o=new Set,c=new Set,l=new EventTarget,h=Object.assign(new EventTarget,{matches:!1,media:"(prefers-reduced-motion: reduce)"}),u=()=>({...i,x:i.left,y:i.top,right:i.left+i.width,bottom:i.top+i.height,toJSON(){return this}}),d=Object.assign(new EventTarget,{getBoundingClientRect:u,closest:()=>null,style:{setProperty(){},removeProperty(){}},dataset:{},contains:()=>!1}),f=new Map,p={},y=new Proxy(s,{get(g,m){if(m==="getBoundingClientRect")return u;if(m==="clientWidth"||m==="offsetWidth")return i.width;if(m==="clientHeight"||m==="offsetHeight")return i.height;if(m==="closest")return()=>null;if(m==="parentElement")return d;if(m==="setPointerCapture"||m==="releasePointerCapture"||m==="replaceWith")return()=>{};if(m==="style")return d.style;if(m==="dataset")return p;if(m==="getContext")return(w,b)=>{if(f.has(w))return f.get(w);let F=g.getContext(w,b);if(!F)return null;let L=null,O=new Map,ae=new Proxy(F,{get(_,E){let z=Reflect.get(_,E,_);return typeof z!="function"?z:(O.has(E)||O.set(E,(...D)=>{let C=Reflect.apply(z,_,D);return E==="bindFramebuffer"&&(D[0]===_.FRAMEBUFFER||D[0]===_.DRAW_FRAMEBUFFER)&&(L=D[1]),(E==="drawArrays"||E==="drawElements"||E==="drawArraysInstanced"||E==="drawElementsInstanced")&&L===null&&t(),C}),O.get(E))}});return f.set(w,ae),ae};let S=Reflect.get(g,m,g);return typeof S=="function"?S.bind(g):S},set(g,m,S){return Reflect.set(g,m,S,g)}});Object.defineProperties(d,{clientWidth:{get:()=>i.width},clientHeight:{get:()=>i.height}});let x=Object.assign(l,{get hidden(){return!r},get visibilityState(){return r?"visible":"hidden"}});Object.defineProperties(x,{hidden:{get:()=>!r},visibilityState:{get:()=>r?"visible":"hidden"}}),n.window=n,n.document=x,n.matchMedia=()=>h,n.Element=class extends EventTarget{},Object.defineProperties(n,{innerWidth:{configurable:!0,get:()=>i.width},innerHeight:{configurable:!0,get:()=>i.height},devicePixelRatio:{configurable:!0,get:()=>i.dpr}}),n.ResizeObserver=class{constructor(g){this.callback=g;o.add(this)}observe(){this.callback([{target:d,contentRect:u()}])}disconnect(){o.delete(this)}},n.IntersectionObserver=class{constructor(g){this.callback=g;c.add(this)}observe(){this.callback([{target:d,isIntersecting:r,intersectionRatio:r?1:0}])}disconnect(){c.delete(this)}};let v=(g,m)=>{let S=new Event(g);for(let[w,b]of Object.entries(m))Object.defineProperty(S,w,{value:b});return S};return{host:d,canvas:y,viewport(g){i=g;for(let m of o)m.callback([{target:d,contentRect:u()}]);n.dispatchEvent(new Event("resize"))},visibility(g){if(r!==g){r=g,l.dispatchEvent(new Event("visibilitychange"));for(let m of c)m.callback([{target:d,isIntersecting:g,intersectionRatio:g?1:0}])}},motion(g){a!==g&&(a=g,h.matches=g,h.dispatchEvent(new Event("change")))},input(g,m){n.dispatchEvent(v(g,m)),d.dispatchEvent(v(g,m)),s.dispatchEvent(v(g,m))},dispose(){o.clear(),c.clear();for(let g of f.values())try{g.getExtension("WEBGL_lose_context")?.loseContext()}catch{}f.clear()}}}function Ga(s){let e=0,t=0,n=0,i=(r,a)=>{if(++t>8192||a>10)throw Error("BG_ASSET_SHAPE: Visual asset structure exceeds its budget.");if(ArrayBuffer.isView(r)){if((r instanceof Float32Array||r instanceof Float64Array)&&!r.every(Number.isFinite))throw Error("BG_ASSET_NUMBER: Prepared visual numbers must be finite.");if(e+=r.byteLength,e>32*1024*1024)throw Error("BG_ASSET_SIZE: Prepared visual assets exceed 32 MiB.");return r}if(Array.isArray(r))return r.map(c=>i(c,a+1));if(r&&typeof r=="object"&&[Object.prototype,null].includes(Object.getPrototypeOf(r))){let c={};for(let[l,h]of Object.entries(r)){if(ir({[l]:null}),n+=new TextEncoder().encode(l).length+4,n>65536)throw Error("BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.");c[l]=i(h,a+1)}return c}let o=ir(r);if(n+=new TextEncoder().encode(JSON.stringify(o)).length,n>65536)throw Error("BG_ASSET_METADATA: Visual asset metadata exceeds 64 KiB.");return o};return i(s,0)}function ir(s){let e=0,t=(i,r)=>{if(++e>4096||r>8)throw Error("BG_STATE_LIMIT: Visual state exceeds the bounded schema.");if(i===null||typeof i=="boolean")return i;if(typeof i=="number"){if(!Number.isFinite(i))throw Error("BG_STATE_NUMBER: Visual numbers must be finite.");return i}if(typeof i=="string"){if(i.length>1024)throw Error("BG_STATE_STRING: Visual strings must be bounded.");return i}if(Array.isArray(i))return i.map(a=>t(a,r+1));if(i&&typeof i=="object"&&[Object.prototype,null].includes(Object.getPrototypeOf(i))){let a={};for(let[o,c]of Object.entries(i)){if(/^(?:__proto__|constructor|prototype|token|accessToken|refreshToken|authorization|cookie|bridge|conversation|history|source|url|path)$/i.test(o))throw Error("BG_STATE_FIELD: Visual state contains an unsupported field.");c!==void 0&&(a[o]=t(c,r+1))}return a}throw Error("BG_STATE_TYPE: Visual state must contain serializable visual values.")},n=t(s,0);if(new TextEncoder().encode(JSON.stringify(n)).length>65536)throw Error("BG_STATE_SIZE: Visual state exceeds the message budget.");return n}function Gl(s,e){if(![s.width,s.height,s.left,s.top,e].every(Number.isFinite)||s.width<0||s.height<0)throw Error("BG_VIEWPORT_INVALID: Invalid visual dimensions.");let t=Math.max(1,Math.min(8192,s.width)),n=Math.max(1,Math.min(8192,s.height)),i=Math.min(3,Math.max(.5,e),Math.sqrt(16777216/(t*n)));return{width:t,height:n,left:s.left,top:s.top,dpr:i}}var Vu=()=>{};function Hu(s){Vu=s}function si(s,e){Vu(s,e)}var Du={};Np(Du,{ACESFilmicToneMapping:()=>kd,AddEquation:()=>Ii,AddOperation:()=>Dd,AdditiveAnimationBlendMode:()=>Mu,AdditiveBlending:()=>Sc,AlphaFormat:()=>qd,AlwaysDepth:()=>Td,AlwaysStencilFunc:()=>Of,AmbientLight:()=>_a,AmbientLightProbe:()=>pl,AnimationClip:()=>Yi,AnimationLoader:()=>Xc,AnimationMixer:()=>yl,AnimationObjectGroup:()=>xl,AnimationUtils:()=>Bt,ArcCurve:()=>pa,ArrayCamera:()=>Is,ArrowHelper:()=>pu,Audio:()=>La,AudioAnalyser:()=>gl,AudioContext:()=>Cu,AudioListener:()=>Kc,AudioLoader:()=>dl,AxesHelper:()=>Cl,AxisHelper:()=>w1,BackSide:()=>Ht,BasicDepthPacking:()=>kf,BasicShadowMap:()=>Vp,BinaryTextureLoader:()=>T1,Bone:()=>Vr,BooleanKeyframeTrack:()=>ii,BoundingBoxHelper:()=>M1,Box2:()=>Si,Box3:()=>sn,Box3Helper:()=>du,BoxBufferGeometry:()=>vi,BoxGeometry:()=>vi,BoxHelper:()=>El,BufferAttribute:()=>St,BufferGeometry:()=>_t,BufferGeometryLoader:()=>cl,ByteType:()=>Ud,Cache:()=>Zi,Camera:()=>Gi,CameraHelper:()=>hu,CanvasRenderer:()=>C1,CanvasTexture:()=>jo,CatmullRomCurve3:()=>ma,CineonToneMapping:()=>Bd,CircleBufferGeometry:()=>Os,CircleGeometry:()=>Os,ClampToEdgeWrapping:()=>un,Clock:()=>ml,Color:()=>ut,ColorKeyframeTrack:()=>da,CompressedTexture:()=>Us,CompressedTextureLoader:()=>Yc,ConeBufferGeometry:()=>Gs,ConeGeometry:()=>Gs,CubeCamera:()=>Ir,CubeReflectionMapping:()=>Da,CubeRefractionMapping:()=>Ia,CubeTexture:()=>xi,CubeTextureLoader:()=>el,CubeUVReflectionMapping:()=>Qr,CubeUVRefractionMapping:()=>Fa,CubicBezierCurve:()=>jr,CubicBezierCurve3:()=>ga,CubicInterpolant:()=>$o,CullFaceBack:()=>_c,CullFaceFront:()=>hd,CullFaceFrontBack:()=>Wp,CullFaceNone:()=>ud,Curve:()=>fn,CurvePath:()=>rl,CustomBlending:()=>fd,CustomToneMapping:()=>Nd,CylinderBufferGeometry:()=>Hi,CylinderGeometry:()=>Hi,Cylindrical:()=>su,DataTexture:()=>yi,DataTexture2DArray:()=>zs,DataTexture3D:()=>Ds,DataTextureLoader:()=>tl,DataUtils:()=>mu,DecrementStencilOp:()=>e0,DecrementWrapStencilOp:()=>n0,DefaultLoadingManager:()=>ap,DepthFormat:()=>Ni,DepthStencilFormat:()=>Cr,DepthTexture:()=>Jo,DirectionalLight:()=>Ma,DirectionalLightHelper:()=>uu,DiscreteInterpolant:()=>Ko,DodecahedronBufferGeometry:()=>Ws,DodecahedronGeometry:()=>Ws,DoubleSide:()=>Ra,DstAlphaFactor:()=>bd,DstColorFactor:()=>Md,DynamicBufferAttribute:()=>h1,DynamicCopyUsage:()=>g0,DynamicDrawUsage:()=>Lr,DynamicReadUsage:()=>f0,EdgesGeometry:()=>Vs,EdgesHelper:()=>_1,EllipseCurve:()=>ji,EqualDepth:()=>Cd,EqualStencilFunc:()=>a0,EquirectangularReflectionMapping:()=>Do,EquirectangularRefractionMapping:()=>Io,Euler:()=>Oi,EventDispatcher:()=>Un,ExtrudeBufferGeometry:()=>Wn,ExtrudeGeometry:()=>Wn,FaceColors:()=>e1,FileLoader:()=>_n,FlatShading:()=>xu,Float16BufferAttribute:()=>Vo,Float32Attribute:()=>y1,Float32BufferAttribute:()=>dt,Float64Attribute:()=>b1,Float64BufferAttribute:()=>Ho,FloatType:()=>Jn,Fog:()=>Bs,FogExp2:()=>Fs,Font:()=>Pa,FontLoader:()=>Jc,FrontSide:()=>Kr,Frustum:()=>Wi,GLBufferAttribute:()=>Ml,GLSL1:()=>x0,GLSL3:()=>Uc,GammaEncoding:()=>Rl,GreaterDepth:()=>Ld,GreaterEqualDepth:()=>Pd,GreaterEqualStencilFunc:()=>u0,GreaterStencilFunc:()=>l0,GridHelper:()=>Tl,Group:()=>$n,HalfFloatType:()=>Ts,HemisphereLight:()=>xa,HemisphereLightHelper:()=>lu,HemisphereLightProbe:()=>fl,IcosahedronBufferGeometry:()=>Ys,IcosahedronGeometry:()=>Ys,ImageBitmapLoader:()=>ul,ImageLoader:()=>Zr,ImageUtils:()=>Qn,ImmediateRenderObject:()=>Sl,IncrementStencilOp:()=>Qp,IncrementWrapStencilOp:()=>t0,InstancedBufferAttribute:()=>Ca,InstancedBufferGeometry:()=>Ea,InstancedInterleavedBuffer:()=>wl,InstancedMesh:()=>ks,Int16Attribute:()=>m1,Int16BufferAttribute:()=>Go,Int32Attribute:()=>v1,Int32BufferAttribute:()=>Wo,Int8Attribute:()=>d1,Int8BufferAttribute:()=>No,IntType:()=>Gd,InterleavedBuffer:()=>ei,InterleavedBufferAttribute:()=>bi,Interpolant:()=>Dn,InterpolateDiscrete:()=>Es,InterpolateLinear:()=>Cs,InterpolateSmooth:()=>Lo,InvertStencilOp:()=>i0,JSONLoader:()=>P1,KeepStencilOp:()=>Ro,KeyframeTrack:()=>bn,LOD:()=>Xo,LatheBufferGeometry:()=>Zs,LatheGeometry:()=>Zs,Layers:()=>Rs,LensFlare:()=>R1,LessDepth:()=>Ed,LessEqualDepth:()=>zo,LessEqualStencilFunc:()=>o0,LessStencilFunc:()=>s0,Light:()=>wn,LightProbe:()=>Qi,Line:()=>zn,Line3:()=>_l,LineBasicMaterial:()=>Zt,LineCurve:()=>Ji,LineCurve3:()=>il,LineDashedMaterial:()=>ua,LineLoop:()=>Ns,LinePieces:()=>Ky,LineSegments:()=>on,LineStrip:()=>$y,LinearEncoding:()=>hn,LinearFilter:()=>Jt,LinearInterpolant:()=>ha,LinearMipMapLinearFilter:()=>Zp,LinearMipMapNearestFilter:()=>Yp,LinearMipmapLinearFilter:()=>es,LinearMipmapNearestFilter:()=>wu,LinearToneMapping:()=>Id,Loader:()=>Qt,LoaderUtils:()=>Ta,LoadingManager:()=>fa,LogLuvEncoding:()=>Bf,LoopOnce:()=>zf,LoopPingPong:()=>If,LoopRepeat:()=>Df,LuminanceAlphaFormat:()=>Yd,LuminanceFormat:()=>Xd,MOUSE:()=>Op,Material:()=>Yt,MaterialLoader:()=>ll,Math:()=>z0,MathUtils:()=>z0,Matrix3:()=>Vt,Matrix4:()=>bt,MaxEquation:()=>Cc,Mesh:()=>Ot,MeshBasicMaterial:()=>Ln,MeshDepthMaterial:()=>kr,MeshDistanceMaterial:()=>Nr,MeshFaceMaterial:()=>n1,MeshLambertMaterial:()=>la,MeshMatcapMaterial:()=>ca,MeshNormalMaterial:()=>oa,MeshPhongMaterial:()=>sa,MeshPhysicalMaterial:()=>ra,MeshStandardMaterial:()=>Yr,MeshToonMaterial:()=>aa,MinEquation:()=>Ec,MirroredRepeatWrapping:()=>Ss,MixOperation:()=>zd,MultiMaterial:()=>i1,MultiplyBlending:()=>Tc,MultiplyOperation:()=>za,NearestFilter:()=>jt,NearestMipMapLinearFilter:()=>Xp,NearestMipMapNearestFilter:()=>qp,NearestMipmapLinearFilter:()=>Bo,NearestMipmapNearestFilter:()=>Fo,NeverDepth:()=>Ad,NeverStencilFunc:()=>r0,NoBlending:()=>Kn,NoColors:()=>Qy,NoToneMapping:()=>ki,NormalAnimationBlendMode:()=>Ll,NormalBlending:()=>Ar,NotEqualDepth:()=>Rd,NotEqualStencilFunc:()=>c0,NumberKeyframeTrack:()=>qi,Object3D:()=>Ct,ObjectLoader:()=>jc,ObjectSpaceNormalMap:()=>Uf,OctahedronBufferGeometry:()=>Hr,OctahedronGeometry:()=>Hr,OneFactor:()=>vd,OneMinusDstAlphaFactor:()=>wd,OneMinusDstColorFactor:()=>_d,OneMinusSrcAlphaFactor:()=>bu,OneMinusSrcColorFactor:()=>yd,OrthographicCamera:()=>Ki,PCFShadowMap:()=>vu,PCFSoftShadowMap:()=>dd,PMREMGenerator:()=>gu,ParametricBufferGeometry:()=>js,ParametricGeometry:()=>js,Particle:()=>s1,ParticleBasicMaterial:()=>l1,ParticleSystem:()=>a1,ParticleSystemMaterial:()=>c1,Path:()=>$i,PerspectiveCamera:()=>qt,Plane:()=>vn,PlaneBufferGeometry:()=>Br,PlaneGeometry:()=>Br,PlaneHelper:()=>fu,PointCloud:()=>r1,PointCloudMaterial:()=>o1,PointLight:()=>wa,PointLightHelper:()=>ou,Points:()=>Vi,PointsMaterial:()=>ti,PolarGridHelper:()=>cu,PolyhedronBufferGeometry:()=>ni,PolyhedronGeometry:()=>ni,PositionalAudio:()=>Qc,PropertyBinding:()=>zt,PropertyMixer:()=>vl,QuadraticBezierCurve:()=>Jr,QuadraticBezierCurve3:()=>va,Quaternion:()=>Xt,QuaternionKeyframeTrack:()=>_i,QuaternionLinearInterpolant:()=>Qo,REVISION:()=>Up,RGBADepthPacking:()=>Nf,RGBAFormat:()=>xn,RGBAIntegerFormat:()=>ef,RGBA_ASTC_10x10_Format:()=>pf,RGBA_ASTC_10x5_Format:()=>hf,RGBA_ASTC_10x6_Format:()=>df,RGBA_ASTC_10x8_Format:()=>ff,RGBA_ASTC_12x10_Format:()=>mf,RGBA_ASTC_12x12_Format:()=>gf,RGBA_ASTC_4x4_Format:()=>nf,RGBA_ASTC_5x4_Format:()=>rf,RGBA_ASTC_5x5_Format:()=>sf,RGBA_ASTC_6x5_Format:()=>af,RGBA_ASTC_6x6_Format:()=>of,RGBA_ASTC_8x5_Format:()=>lf,RGBA_ASTC_8x6_Format:()=>cf,RGBA_ASTC_8x8_Format:()=>uf,RGBA_BPTC_Format:()=>vf,RGBA_ETC2_EAC_Format:()=>Nc,RGBA_PVRTC_2BPPV1_Format:()=>Bc,RGBA_PVRTC_4BPPV1_Format:()=>Fc,RGBA_S3TC_DXT1_Format:()=>Lc,RGBA_S3TC_DXT3_Format:()=>Rc,RGBA_S3TC_DXT5_Format:()=>zc,RGBDEncoding:()=>Au,RGBEEncoding:()=>zl,RGBEFormat:()=>Zd,RGBFormat:()=>pi,RGBIntegerFormat:()=>Qd,RGBM16Encoding:()=>Su,RGBM7Encoding:()=>_u,RGB_ETC1_Format:()=>tf,RGB_ETC2_Format:()=>kc,RGB_PVRTC_2BPPV1_Format:()=>Ic,RGB_PVRTC_4BPPV1_Format:()=>Dc,RGB_S3TC_DXT1_Format:()=>Pc,RGFormat:()=>$d,RGIntegerFormat:()=>Kd,RawShaderMaterial:()=>Mi,Ray:()=>Gn,Raycaster:()=>nu,RectAreaLight:()=>Sa,RedFormat:()=>jd,RedIntegerFormat:()=>Jd,ReinhardToneMapping:()=>Fd,RepeatWrapping:()=>_s,ReplaceStencilOp:()=>Kp,ReverseSubtractEquation:()=>md,RingBufferGeometry:()=>Js,RingGeometry:()=>Js,SRGB8_ALPHA8_ASTC_10x10_Format:()=>Pf,SRGB8_ALPHA8_ASTC_10x5_Format:()=>Tf,SRGB8_ALPHA8_ASTC_10x6_Format:()=>Ef,SRGB8_ALPHA8_ASTC_10x8_Format:()=>Cf,SRGB8_ALPHA8_ASTC_12x10_Format:()=>Lf,SRGB8_ALPHA8_ASTC_12x12_Format:()=>Rf,SRGB8_ALPHA8_ASTC_4x4_Format:()=>xf,SRGB8_ALPHA8_ASTC_5x4_Format:()=>yf,SRGB8_ALPHA8_ASTC_5x5_Format:()=>bf,SRGB8_ALPHA8_ASTC_6x5_Format:()=>wf,SRGB8_ALPHA8_ASTC_6x6_Format:()=>Mf,SRGB8_ALPHA8_ASTC_8x5_Format:()=>_f,SRGB8_ALPHA8_ASTC_8x6_Format:()=>Sf,SRGB8_ALPHA8_ASTC_8x8_Format:()=>Af,Scene:()=>Ur,SceneUtils:()=>L1,ShaderChunk:()=>Et,ShaderLib:()=>Cn,ShaderMaterial:()=>Rn,ShadowMaterial:()=>ia,Shape:()=>Nn,ShapeBufferGeometry:()=>qr,ShapeGeometry:()=>qr,ShapePath:()=>hl,ShapeUtils:()=>kn,ShortType:()=>Od,Skeleton:()=>Yo,SkeletonHelper:()=>Al,SkinnedMesh:()=>Wr,SmoothShading:()=>Hp,Sphere:()=>On,SphereBufferGeometry:()=>Xr,SphereGeometry:()=>Xr,Spherical:()=>ru,SphericalHarmonics3:()=>Aa,SplineCurve:()=>$r,SpotLight:()=>ba,SpotLightHelper:()=>au,Sprite:()=>Gr,SpriteMaterial:()=>Or,SrcAlphaFactor:()=>yu,SrcAlphaSaturateFactor:()=>Sd,SrcColorFactor:()=>xd,StaticCopyUsage:()=>m0,StaticDrawUsage:()=>Pr,StaticReadUsage:()=>d0,StereoCamera:()=>$c,StreamCopyUsage:()=>v0,StreamDrawUsage:()=>h0,StreamReadUsage:()=>p0,StringKeyframeTrack:()=>ri,SubtractEquation:()=>pd,SubtractiveBlending:()=>Ac,TOUCH:()=>Gp,TangentSpaceNormalMap:()=>er,TetrahedronBufferGeometry:()=>$s,TetrahedronGeometry:()=>$s,TextBufferGeometry:()=>Ks,TextGeometry:()=>Ks,Texture:()=>Kt,TextureLoader:()=>nl,TorusBufferGeometry:()=>Qs,TorusGeometry:()=>Qs,TorusKnotBufferGeometry:()=>ea,TorusKnotGeometry:()=>ea,Triangle:()=>nn,TriangleFanDrawMode:()=>Jp,TriangleStripDrawMode:()=>jp,TrianglesDrawMode:()=>Ff,TubeBufferGeometry:()=>ta,TubeGeometry:()=>ta,UVMapping:()=>Pl,Uint16Attribute:()=>g1,Uint16BufferAttribute:()=>Rr,Uint32Attribute:()=>x1,Uint32BufferAttribute:()=>zr,Uint8Attribute:()=>f1,Uint8BufferAttribute:()=>Uo,Uint8ClampedAttribute:()=>p1,Uint8ClampedBufferAttribute:()=>Oo,Uniform:()=>bl,UniformsLib:()=>lt,UniformsUtils:()=>qf,UnsignedByteType:()=>ts,UnsignedInt248Type:()=>Tr,UnsignedIntType:()=>xs,UnsignedShort4444Type:()=>Wd,UnsignedShort5551Type:()=>Vd,UnsignedShort565Type:()=>Hd,UnsignedShortType:()=>As,VSMShadowMap:()=>_r,Vector2:()=>Je,Vector3:()=>Y,Vector4:()=>Lt,VectorKeyframeTrack:()=>Xi,Vertex:()=>u1,VertexColors:()=>t1,VideoTexture:()=>Zo,WebGL1Renderer:()=>qo,WebGLCubeRenderTarget:()=>Fr,WebGLMultisampleRenderTarget:()=>ko,WebGLRenderTarget:()=>Pn,WebGLRenderTargetCube:()=>E1,WebGLRenderer:()=>Dt,WebGLUtils:()=>tp,WireframeGeometry:()=>na,WireframeHelper:()=>S1,WrapAroundEnding:()=>Ps,XHRLoader:()=>A1,ZeroCurvatureEnding:()=>Fi,ZeroFactor:()=>gd,ZeroSlopeEnding:()=>Bi,ZeroStencilOp:()=>$p,sRGBEncoding:()=>Ba});var Up="128",Op={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},Gp={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},ud=0,_c=1,hd=2,Wp=3,Vp=0,vu=1,dd=2,_r=3,Kr=0,Ht=1,Ra=2,xu=1,Hp=2,Kn=0,Ar=1,Sc=2,Ac=3,Tc=4,fd=5,Ii=100,pd=101,md=102,Ec=103,Cc=104,gd=200,vd=201,xd=202,yd=203,yu=204,bu=205,bd=206,wd=207,Md=208,_d=209,Sd=210,Ad=0,Td=1,Ed=2,zo=3,Cd=4,Pd=5,Ld=6,Rd=7,za=0,zd=1,Dd=2,ki=0,Id=1,Fd=2,Bd=3,kd=4,Nd=5,Pl=300,Da=301,Ia=302,Do=303,Io=304,Qr=306,Fa=307,_s=1e3,un=1001,Ss=1002,jt=1003,Fo=1004,qp=1004,Bo=1005,Xp=1005,Jt=1006,wu=1007,Yp=1007,es=1008,Zp=1008,ts=1009,Ud=1010,Od=1011,As=1012,Gd=1013,xs=1014,Jn=1015,Ts=1016,Wd=1017,Vd=1018,Hd=1019,Tr=1020,qd=1021,pi=1022,xn=1023,Xd=1024,Yd=1025,Zd=xn,Ni=1026,Cr=1027,jd=1028,Jd=1029,$d=1030,Kd=1031,Qd=1032,ef=1033,Pc=33776,Lc=33777,Rc=33778,zc=33779,Dc=35840,Ic=35841,Fc=35842,Bc=35843,tf=36196,kc=37492,Nc=37496,nf=37808,rf=37809,sf=37810,af=37811,of=37812,lf=37813,cf=37814,uf=37815,hf=37816,df=37817,ff=37818,pf=37819,mf=37820,gf=37821,vf=36492,xf=37840,yf=37841,bf=37842,wf=37843,Mf=37844,_f=37845,Sf=37846,Af=37847,Tf=37848,Ef=37849,Cf=37850,Pf=37851,Lf=37852,Rf=37853,zf=2200,Df=2201,If=2202,Es=2300,Cs=2301,Lo=2302,Fi=2400,Bi=2401,Ps=2402,Ll=2500,Mu=2501,Ff=0,jp=1,Jp=2,hn=3e3,Ba=3001,Rl=3007,zl=3002,Bf=3003,_u=3004,Su=3005,Au=3006,kf=3200,Nf=3201,er=0,Uf=1,$p=0,Ro=7680,Kp=7681,Qp=7682,e0=7683,t0=34055,n0=34056,i0=5386,r0=512,s0=513,a0=514,o0=515,l0=516,c0=517,u0=518,Of=519,Pr=35044,Lr=35048,h0=35040,d0=35045,f0=35049,p0=35041,m0=35046,g0=35050,v0=35042,x0="100",Uc="300 es",Un=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;let n=this._listeners;return n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;let i=this._listeners[e];if(i!==void 0){let r=i.indexOf(t);r!==-1&&i.splice(r,1)}}dispatchEvent(e){if(this._listeners===void 0)return;let n=this._listeners[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,a=i.length;r<a;r++)i[r].call(this,e);e.target=null}}},en=[];for(let s=0;s<256;s++)en[s]=(s<16?"0":"")+s.toString(16);var Wa=1234567,Ui=Math.PI/180,Ls=180/Math.PI;function yn(){let s=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(en[s&255]+en[s>>8&255]+en[s>>16&255]+en[s>>24&255]+"-"+en[e&255]+en[e>>8&255]+"-"+en[e>>16&15|64]+en[e>>24&255]+"-"+en[t&63|128]+en[t>>8&255]+"-"+en[t>>16&255]+en[t>>24&255]+en[n&255]+en[n>>8&255]+en[n>>16&255]+en[n>>24&255]).toUpperCase()}function tn(s,e,t){return Math.max(e,Math.min(t,s))}function Tu(s,e){return(s%e+e)%e}function y0(s,e,t,n,i){return n+(s-e)*(i-n)/(t-e)}function b0(s,e,t){return s!==e?(t-s)/(e-s):0}function ys(s,e,t){return(1-t)*s+t*e}function w0(s,e,t,n){return ys(s,e,1-Math.exp(-t*n))}function M0(s,e=1){return e-Math.abs(Tu(s,e*2)-e)}function _0(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*(3-2*s))}function S0(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*s*(s*(s*6-15)+10))}function A0(s,e){return s+Math.floor(Math.random()*(e-s+1))}function T0(s,e){return s+Math.random()*(e-s)}function E0(s){return s*(.5-Math.random())}function C0(s){return s!==void 0&&(Wa=s%2147483647),Wa=Wa*16807%2147483647,(Wa-1)/2147483646}function P0(s){return s*Ui}function L0(s){return s*Ls}function Oc(s){return(s&s-1)===0&&s!==0}function Gf(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function Wf(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function R0(s,e,t,n,i){let r=Math.cos,a=Math.sin,o=r(t/2),c=a(t/2),l=r((e+n)/2),h=a((e+n)/2),u=r((e-n)/2),d=a((e-n)/2),f=r((n-e)/2),p=a((n-e)/2);switch(i){case"XYX":s.set(o*h,c*u,c*d,o*l);break;case"YZY":s.set(c*d,o*h,c*u,o*l);break;case"ZXZ":s.set(c*u,c*d,o*h,o*l);break;case"XZX":s.set(o*h,c*p,c*f,o*l);break;case"YXY":s.set(c*f,o*h,c*p,o*l);break;case"ZYZ":s.set(c*p,c*f,o*h,o*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}var z0=Object.freeze({__proto__:null,DEG2RAD:Ui,RAD2DEG:Ls,generateUUID:yn,clamp:tn,euclideanModulo:Tu,mapLinear:y0,inverseLerp:b0,lerp:ys,damp:w0,pingpong:M0,smoothstep:_0,smootherstep:S0,randInt:A0,randFloat:T0,randFloatSpread:E0,seededRandom:C0,degToRad:P0,radToDeg:L0,isPowerOfTwo:Oc,ceilPowerOfTwo:Gf,floorPowerOfTwo:Wf,setQuaternionFromProperEuler:R0}),Je=class{constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e,t){return t!==void 0?(console.warn("THREE.Vector2: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this)}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e,t){return t!==void 0?(console.warn("THREE.Vector2: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this)}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t,n){return n!==void 0&&console.warn("THREE.Vector2: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*i+e.x,this.y=r*i+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}};Je.prototype.isVector2=!0;var Vt=class{constructor(){this.elements=[1,0,0,0,1,0,0,0,1],arguments.length>0&&console.error("THREE.Matrix3: the constructor no longer reads arguments. use .set() instead.")}set(e,t,n,i,r,a,o,c,l){let h=this.elements;return h[0]=e,h[1]=i,h[2]=o,h[3]=t,h[4]=r,h[5]=c,h[6]=n,h[7]=a,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[3],c=n[6],l=n[1],h=n[4],u=n[7],d=n[2],f=n[5],p=n[8],y=i[0],x=i[3],v=i[6],g=i[1],m=i[4],S=i[7],w=i[2],b=i[5],F=i[8];return r[0]=a*y+o*g+c*w,r[3]=a*x+o*m+c*b,r[6]=a*v+o*S+c*F,r[1]=l*y+h*g+u*w,r[4]=l*x+h*m+u*b,r[7]=l*v+h*S+u*F,r[2]=d*y+f*g+p*w,r[5]=d*x+f*m+p*b,r[8]=d*v+f*S+p*F,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8];return t*a*h-t*o*l-n*r*h+n*o*c+i*r*l-i*a*c}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8],u=h*a-o*l,d=o*c-h*r,f=l*r-a*c,p=t*u+n*d+i*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/p;return e[0]=u*y,e[1]=(i*l-h*n)*y,e[2]=(o*n-i*a)*y,e[3]=d*y,e[4]=(h*t-i*c)*y,e[5]=(i*r-o*t)*y,e[6]=f*y,e[7]=(n*c-l*t)*y,e[8]=(a*t-n*r)*y,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,a,o){let c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*a+l*o)+a+e,-i*l,i*c,-i*(-l*a+c*o)+o+t,0,0,1),this}scale(e,t){let n=this.elements;return n[0]*=e,n[3]*=e,n[6]*=e,n[1]*=t,n[4]*=t,n[7]*=t,this}rotate(e){let t=Math.cos(e),n=Math.sin(e),i=this.elements,r=i[0],a=i[3],o=i[6],c=i[1],l=i[4],h=i[7];return i[0]=t*r+n*c,i[3]=t*a+n*l,i[6]=t*o+n*h,i[1]=-n*r+t*c,i[4]=-n*a+t*l,i[7]=-n*o+t*h,this}translate(e,t){let n=this.elements;return n[0]+=e*n[2],n[3]+=e*n[5],n[6]+=e*n[8],n[1]+=t*n[2],n[4]+=t*n[5],n[7]+=t*n[8],this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}};Vt.prototype.isMatrix3=!0;var rr,Qn=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{rr===void 0&&(rr=document.createElementNS("http://www.w3.org/1999/xhtml","canvas")),rr.width=e.width,rr.height=e.height;let n=rr.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=rr}return t.width>2048||t.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",e),t.toDataURL("image/jpeg",.6)):t.toDataURL("image/png")}},D0=0,Kt=class s extends Un{constructor(e=s.DEFAULT_IMAGE,t=s.DEFAULT_MAPPING,n=un,i=un,r=Jt,a=es,o=xn,c=ts,l=1,h=hn){super(),Object.defineProperty(this,"id",{value:D0++}),this.uuid=yn(),this.name="",this.image=e,this.mipmaps=[],this.mapping=t,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=a,this.anisotropy=l,this.format=o,this.internalFormat=null,this.type=c,this.offset=new Je(0,0),this.repeat=new Je(1,1),this.center=new Je(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Vt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.encoding=h,this.version=0,this.onUpdate=null}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.image=e.image,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.encoding=e.encoding,this}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.5,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,mapping:this.mapping,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,type:this.type,encoding:this.encoding,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};if(this.image!==void 0){let i=this.image;if(i.uuid===void 0&&(i.uuid=yn()),!t&&e.images[i.uuid]===void 0){let r;if(Array.isArray(i)){r=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?r.push(Wl(i[a].image)):r.push(Wl(i[a]))}else r=Wl(i);e.images[i.uuid]={uuid:i.uuid,url:r}}n.image=i.uuid}return t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Pl)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case _s:e.x=e.x-Math.floor(e.x);break;case un:e.x=e.x<0?0:1;break;case Ss:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case _s:e.y=e.y-Math.floor(e.y);break;case un:e.y=e.y<0?0:1;break;case Ss:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&this.version++}};Kt.DEFAULT_IMAGE=void 0;Kt.DEFAULT_MAPPING=Pl;Kt.prototype.isTexture=!0;function Wl(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Qn.getDataURL(s):s.data?{data:Array.prototype.slice.call(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var Lt=class{constructor(e=0,t=0,n=0,i=1){this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e,t){return t!==void 0?(console.warn("THREE.Vector4: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this)}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e,t){return t!==void 0?(console.warn("THREE.Vector4: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this)}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*i+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*i+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*i+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*i+a[15]*r,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,c=e.elements,l=c[0],h=c[4],u=c[8],d=c[1],f=c[5],p=c[9],y=c[2],x=c[6],v=c[10];if(Math.abs(h-d)<.01&&Math.abs(u-y)<.01&&Math.abs(p-x)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+y)<.1&&Math.abs(p+x)<.1&&Math.abs(l+f+v-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let m=(l+1)/2,S=(f+1)/2,w=(v+1)/2,b=(h+d)/4,F=(u+y)/4,L=(p+x)/4;return m>S&&m>w?m<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(m),i=b/n,r=F/n):S>w?S<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(S),n=b/i,r=L/i):w<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(w),n=F/r,i=L/r),this.set(n,i,r,t),this}let g=Math.sqrt((x-p)*(x-p)+(u-y)*(u-y)+(d-h)*(d-h));return Math.abs(g)<.001&&(g=1),this.x=(x-p)/g,this.y=(u-y)/g,this.z=(d-h)/g,this.w=Math.acos((l+f+v-1)/2),this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this.z=this.z<0?Math.ceil(this.z):Math.floor(this.z),this.w=this.w<0?Math.ceil(this.w):Math.floor(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t,n){return n!==void 0&&console.warn("THREE.Vector4: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}};Lt.prototype.isVector4=!0;var Pn=class extends Un{constructor(e,t,n){super(),this.width=e,this.height=t,this.depth=1,this.scissor=new Lt(0,0,e,t),this.scissorTest=!1,this.viewport=new Lt(0,0,e,t),n=n||{},this.texture=new Kt(void 0,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.encoding),this.texture.image={},this.texture.image.width=e,this.texture.image.height=t,this.texture.image.depth=1,this.texture.generateMipmaps=n.generateMipmaps!==void 0?n.generateMipmaps:!1,this.texture.minFilter=n.minFilter!==void 0?n.minFilter:Jt,this.depthBuffer=n.depthBuffer!==void 0?n.depthBuffer:!0,this.stencilBuffer=n.stencilBuffer!==void 0?n.stencilBuffer:!1,this.depthTexture=n.depthTexture!==void 0?n.depthTexture:null}setTexture(e){e.image={width:this.width,height:this.height,depth:this.depth},this.texture=e}setSize(e,t,n=1){(this.width!==e||this.height!==t||this.depth!==n)&&(this.width=e,this.height=t,this.depth=n,this.texture.image.width=e,this.texture.image.height=t,this.texture.image.depth=n,this.dispose()),this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.width=e.width,this.height=e.height,this.depth=e.depth,this.viewport.copy(e.viewport),this.texture=e.texture.clone(),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.depthTexture=e.depthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}};Pn.prototype.isWebGLRenderTarget=!0;var ko=class extends Pn{constructor(e,t,n){super(e,t,n),this.samples=4}copy(e){return super.copy.call(this,e),this.samples=e.samples,this}};ko.prototype.isWebGLMultisampleRenderTarget=!0;var Xt=class{constructor(e=0,t=0,n=0,i=1){this._x=e,this._y=t,this._z=n,this._w=i}static slerp(e,t,n,i){return console.warn("THREE.Quaternion: Static .slerp() has been deprecated. Use qm.slerpQuaternions( qa, qb, t ) instead."),n.slerpQuaternions(e,t,i)}static slerpFlat(e,t,n,i,r,a,o){let c=n[i+0],l=n[i+1],h=n[i+2],u=n[i+3],d=r[a+0],f=r[a+1],p=r[a+2],y=r[a+3];if(o===0){e[t+0]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u;return}if(o===1){e[t+0]=d,e[t+1]=f,e[t+2]=p,e[t+3]=y;return}if(u!==y||c!==d||l!==f||h!==p){let x=1-o,v=c*d+l*f+h*p+u*y,g=v>=0?1:-1,m=1-v*v;if(m>Number.EPSILON){let w=Math.sqrt(m),b=Math.atan2(w,v*g);x=Math.sin(x*b)/w,o=Math.sin(o*b)/w}let S=o*g;if(c=c*x+d*S,l=l*x+f*S,h=h*x+p*S,u=u*x+y*S,x===1-o){let w=1/Math.sqrt(c*c+l*l+h*h+u*u);c*=w,l*=w,h*=w,u*=w}}e[t]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,a){let o=n[i],c=n[i+1],l=n[i+2],h=n[i+3],u=r[a],d=r[a+1],f=r[a+2],p=r[a+3];return e[t]=o*p+h*u+c*f-l*d,e[t+1]=c*p+h*d+l*u-o*f,e[t+2]=l*p+h*f+o*d-c*u,e[t+3]=h*p-o*u-c*d-l*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t){if(!(e&&e.isEuler))throw new Error("THREE.Quaternion: .setFromEuler() now expects an Euler rotation rather than a Vector3 and order.");let n=e._x,i=e._y,r=e._z,a=e._order,o=Math.cos,c=Math.sin,l=o(n/2),h=o(i/2),u=o(r/2),d=c(n/2),f=c(i/2),p=c(r/2);switch(a){case"XYZ":this._x=d*h*u+l*f*p,this._y=l*f*u-d*h*p,this._z=l*h*p+d*f*u,this._w=l*h*u-d*f*p;break;case"YXZ":this._x=d*h*u+l*f*p,this._y=l*f*u-d*h*p,this._z=l*h*p-d*f*u,this._w=l*h*u+d*f*p;break;case"ZXY":this._x=d*h*u-l*f*p,this._y=l*f*u+d*h*p,this._z=l*h*p+d*f*u,this._w=l*h*u-d*f*p;break;case"ZYX":this._x=d*h*u-l*f*p,this._y=l*f*u+d*h*p,this._z=l*h*p-d*f*u,this._w=l*h*u+d*f*p;break;case"YZX":this._x=d*h*u+l*f*p,this._y=l*f*u+d*h*p,this._z=l*h*p-d*f*u,this._w=l*h*u-d*f*p;break;case"XZY":this._x=d*h*u-l*f*p,this._y=l*f*u-d*h*p,this._z=l*h*p+d*f*u,this._w=l*h*u+d*f*p;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t!==!1&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],a=t[1],o=t[5],c=t[9],l=t[2],h=t[6],u=t[10],d=n+o+u;if(d>0){let f=.5/Math.sqrt(d+1);this._w=.25/f,this._x=(h-c)*f,this._y=(r-l)*f,this._z=(a-i)*f}else if(n>o&&n>u){let f=2*Math.sqrt(1+n-o-u);this._w=(h-c)/f,this._x=.25*f,this._y=(i+a)/f,this._z=(r+l)/f}else if(o>u){let f=2*Math.sqrt(1+o-n-u);this._w=(r-l)/f,this._x=(i+a)/f,this._y=.25*f,this._z=(c+h)/f}else{let f=2*Math.sqrt(1+u-n-o);this._w=(a-i)/f,this._x=(r+l)/f,this._y=(c+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(tn(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e,t){return t!==void 0?(console.warn("THREE.Quaternion: .multiply() now only accepts one argument. Use .multiplyQuaternions( a, b ) instead."),this.multiplyQuaternions(e,t)):this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,i=e._y,r=e._z,a=e._w,o=t._x,c=t._y,l=t._z,h=t._w;return this._x=n*h+a*o+i*l-r*c,this._y=i*h+a*c+r*o-n*l,this._z=r*h+a*l+n*c-i*o,this._w=a*h-n*o-i*c-r*l,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,i=this._y,r=this._z,a=this._w,o=a*e._w+n*e._x+i*e._y+r*e._z;if(o<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,o=-o):this.copy(e),o>=1)return this._w=a,this._x=n,this._y=i,this._z=r,this;let c=1-o*o;if(c<=Number.EPSILON){let f=1-t;return this._w=f*a+t*this._w,this._x=f*n+t*this._x,this._y=f*i+t*this._y,this._z=f*r+t*this._z,this.normalize(),this._onChangeCallback(),this}let l=Math.sqrt(c),h=Math.atan2(l,o),u=Math.sin((1-t)*h)/l,d=Math.sin(t*h)/l;return this._w=a*u+this._w*d,this._x=n*u+this._x*d,this._y=i*u+this._y*d,this._z=r*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){this.copy(e).slerp(t,n)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}};Xt.prototype.isQuaternion=!0;var Y=class{constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e,t){return t!==void 0?(console.warn("THREE.Vector3: .add() now only accepts one argument. Use .addVectors( a, b ) instead."),this.addVectors(e,t)):(this.x+=e.x,this.y+=e.y,this.z+=e.z,this)}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e,t){return t!==void 0?(console.warn("THREE.Vector3: .sub() now only accepts one argument. Use .subVectors( a, b ) instead."),this.subVectors(e,t)):(this.x-=e.x,this.y-=e.y,this.z-=e.z,this)}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e,t){return t!==void 0?(console.warn("THREE.Vector3: .multiply() now only accepts one argument. Use .multiplyVectors( a, b ) instead."),this.multiplyVectors(e,t)):(this.x*=e.x,this.y*=e.y,this.z*=e.z,this)}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return e&&e.isEuler||console.error("THREE.Vector3: .applyEuler() now expects an Euler rotation rather than a Vector3 and order."),this.applyQuaternion(qu.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(qu.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,r=e.x,a=e.y,o=e.z,c=e.w,l=c*t+a*i-o*n,h=c*n+o*t-r*i,u=c*i+r*n-a*t,d=-r*t-a*n-o*i;return this.x=l*c+d*-r+h*-o-u*-a,this.y=h*c+d*-a+u*-r-l*-o,this.z=u*c+d*-o+l*-a-h*-r,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(e,Math.min(t,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=this.x<0?Math.ceil(this.x):Math.floor(this.x),this.y=this.y<0?Math.ceil(this.y):Math.floor(this.y),this.z=this.z<0?Math.ceil(this.z):Math.floor(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e,t){return t!==void 0?(console.warn("THREE.Vector3: .cross() now only accepts one argument. Use .crossVectors( a, b ) instead."),this.crossVectors(e,t)):this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,i=e.y,r=e.z,a=t.x,o=t.y,c=t.z;return this.x=i*c-r*o,this.y=r*a-n*c,this.z=n*o-i*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Vl.copy(this).projectOnVector(e),this.sub(Vl)}reflect(e){return this.sub(Vl.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(tn(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t,n){return n!==void 0&&console.warn("THREE.Vector3: offset has been removed from .fromBufferAttribute()."),this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}};Y.prototype.isVector3=!0;var Vl=new Y,qu=new Xt,sn=class{constructor(e=new Y(1/0,1/0,1/0),t=new Y(-1/0,-1/0,-1/0)){this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){let t=1/0,n=1/0,i=1/0,r=-1/0,a=-1/0,o=-1/0;for(let c=0,l=e.length;c<l;c+=3){let h=e[c],u=e[c+1],d=e[c+2];h<t&&(t=h),u<n&&(n=u),d<i&&(i=d),h>r&&(r=h),u>a&&(a=u),d>o&&(o=d)}return this.min.set(t,n,i),this.max.set(r,a,o),this}setFromBufferAttribute(e){let t=1/0,n=1/0,i=1/0,r=-1/0,a=-1/0,o=-1/0;for(let c=0,l=e.count;c<l;c++){let h=e.getX(c),u=e.getY(c),d=e.getZ(c);h<t&&(t=h),u<n&&(n=u),d<i&&(i=d),h>r&&(r=h),u>a&&(a=u),d>o&&(o=d)}return this.min.set(t,n,i),this.max.set(r,a,o),this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=ss.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e){return this.makeEmpty(),this.expandByObject(e)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return e===void 0&&(console.warn("THREE.Box3: .getCenter() target is now required"),e=new Y),this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return e===void 0&&(console.warn("THREE.Box3: .getSize() target is now required"),e=new Y),this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e){e.updateWorldMatrix(!1,!1);let t=e.geometry;t!==void 0&&(t.boundingBox===null&&t.computeBoundingBox(),Hl.copy(t.boundingBox),Hl.applyMatrix4(e.matrixWorld),this.union(Hl));let n=e.children;for(let i=0,r=n.length;i<r;i++)this.expandByObject(n[i]);return this}containsPoint(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y||e.z<this.min.z||e.z>this.max.z)}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t===void 0&&(console.warn("THREE.Box3: .getParameter() target is now required"),t=new Y),t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y||e.max.z<this.min.z||e.min.z>this.max.z)}intersectsSphere(e){return this.clampPoint(e.center,ss),ss.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(as),Va.subVectors(this.max,as),sr.subVectors(e.a,as),ar.subVectors(e.b,as),or.subVectors(e.c,as),ai.subVectors(ar,sr),oi.subVectors(or,ar),Ti.subVectors(sr,or);let t=[0,-ai.z,ai.y,0,-oi.z,oi.y,0,-Ti.z,Ti.y,ai.z,0,-ai.x,oi.z,0,-oi.x,Ti.z,0,-Ti.x,-ai.y,ai.x,0,-oi.y,oi.x,0,-Ti.y,Ti.x,0];return!ql(t,sr,ar,or,Va)||(t=[1,0,0,0,1,0,0,0,1],!ql(t,sr,ar,or,Va))?!1:(Ha.crossVectors(ai,oi),t=[Ha.x,Ha.y,Ha.z],ql(t,sr,ar,or,Va))}clampPoint(e,t){return t===void 0&&(console.warn("THREE.Box3: .clampPoint() target is now required"),t=new Y),t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return ss.copy(e).clamp(this.min,this.max).sub(e).length()}getBoundingSphere(e){return e===void 0&&console.error("THREE.Box3: .getBoundingSphere() target is now required"),this.getCenter(e.center),e.radius=this.getSize(ss).length()*.5,e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(qn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),qn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),qn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),qn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),qn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),qn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),qn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),qn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(qn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}};sn.prototype.isBox3=!0;var qn=[new Y,new Y,new Y,new Y,new Y,new Y,new Y,new Y],ss=new Y,Hl=new sn,sr=new Y,ar=new Y,or=new Y,ai=new Y,oi=new Y,Ti=new Y,as=new Y,Va=new Y,Ha=new Y,Ei=new Y;function ql(s,e,t,n,i){for(let r=0,a=s.length-3;r<=a;r+=3){Ei.fromArray(s,r);let o=i.x*Math.abs(Ei.x)+i.y*Math.abs(Ei.y)+i.z*Math.abs(Ei.z),c=e.dot(Ei),l=t.dot(Ei),h=n.dot(Ei);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>o)return!1}return!0}var I0=new sn,Xu=new Y,Xl=new Y,Yl=new Y,On=class{constructor(e=new Y,t=-1){this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):I0.setFromPoints(e).getCenter(n);let i=0;for(let r=0,a=e.length;r<a;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t===void 0&&(console.warn("THREE.Sphere: .clampPoint() target is now required"),t=new Y),t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return e===void 0&&(console.warn("THREE.Sphere: .getBoundingBox() target is now required"),e=new sn),this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){Yl.subVectors(e,this.center);let t=Yl.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*.5;this.center.add(Yl.multiplyScalar(i/n)),this.radius+=i}return this}union(e){return Xl.subVectors(e.center,this.center).normalize().multiplyScalar(e.radius),this.expandByPoint(Xu.copy(e.center).add(Xl)),this.expandByPoint(Xu.copy(e.center).sub(Xl)),this}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}},Xn=new Y,Zl=new Y,qa=new Y,li=new Y,jl=new Y,Xa=new Y,Jl=new Y,Gn=class{constructor(e=new Y,t=new Y(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t===void 0&&(console.warn("THREE.Ray: .at() target is now required"),t=new Y),t.copy(this.direction).multiplyScalar(e).add(this.origin)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Xn)),this}closestPointToPoint(e,t){t===void 0&&(console.warn("THREE.Ray: .closestPointToPoint() target is now required"),t=new Y),t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.direction).multiplyScalar(n).add(this.origin)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=Xn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Xn.copy(this.direction).multiplyScalar(t).add(this.origin),Xn.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){Zl.copy(e).add(t).multiplyScalar(.5),qa.copy(t).sub(e).normalize(),li.copy(this.origin).sub(Zl);let r=e.distanceTo(t)*.5,a=-this.direction.dot(qa),o=li.dot(this.direction),c=-li.dot(qa),l=li.lengthSq(),h=Math.abs(1-a*a),u,d,f,p;if(h>0)if(u=a*c-o,d=a*o-c,p=r*h,u>=0)if(d>=-p)if(d<=p){let y=1/h;u*=y,d*=y,f=u*(u+a*d+2*o)+d*(a*u+d+2*c)+l}else d=r,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*c)+l;else d=-r,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*c)+l;else d<=-p?(u=Math.max(0,-(-a*r+o)),d=u>0?-r:Math.min(Math.max(-r,-c),r),f=-u*u+d*(d+2*c)+l):d<=p?(u=0,d=Math.min(Math.max(-r,-c),r),f=d*(d+2*c)+l):(u=Math.max(0,-(a*r+o)),d=u>0?r:Math.min(Math.max(-r,-c),r),f=-u*u+d*(d+2*c)+l);else d=a>0?-r:r,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*c)+l;return n&&n.copy(this.direction).multiplyScalar(u).add(this.origin),i&&i.copy(qa).multiplyScalar(d).add(Zl),f}intersectSphere(e,t){Xn.subVectors(e.center,this.origin);let n=Xn.dot(this.direction),i=Xn.dot(Xn)-n*n,r=e.radius*e.radius;if(i>r)return null;let a=Math.sqrt(r-i),o=n-a,c=n+a;return o<0&&c<0?null:o<0?this.at(c,t):this.at(o,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,r,a,o,c,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return l>=0?(n=(e.min.x-d.x)*l,i=(e.max.x-d.x)*l):(n=(e.max.x-d.x)*l,i=(e.min.x-d.x)*l),h>=0?(r=(e.min.y-d.y)*h,a=(e.max.y-d.y)*h):(r=(e.max.y-d.y)*h,a=(e.min.y-d.y)*h),n>a||r>i||((r>n||n!==n)&&(n=r),(a<i||i!==i)&&(i=a),u>=0?(o=(e.min.z-d.z)*u,c=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,c=(e.min.z-d.z)*u),n>c||o>i)||((o>n||n!==n)&&(n=o),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,Xn)!==null}intersectTriangle(e,t,n,i,r){jl.subVectors(t,e),Xa.subVectors(n,e),Jl.crossVectors(jl,Xa);let a=this.direction.dot(Jl),o;if(a>0){if(i)return null;o=1}else if(a<0)o=-1,a=-a;else return null;li.subVectors(this.origin,e);let c=o*this.direction.dot(Xa.crossVectors(li,Xa));if(c<0)return null;let l=o*this.direction.dot(jl.cross(li));if(l<0||c+l>a)return null;let h=-o*li.dot(Jl);return h<0?null:this.at(h/a,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},bt=class s{constructor(){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],arguments.length>0&&console.error("THREE.Matrix4: the constructor no longer reads arguments. use .set() instead.")}set(e,t,n,i,r,a,o,c,l,h,u,d,f,p,y,x){let v=this.elements;return v[0]=e,v[4]=t,v[8]=n,v[12]=i,v[1]=r,v[5]=a,v[9]=o,v[13]=c,v[2]=l,v[6]=h,v[10]=u,v[14]=d,v[3]=f,v[7]=p,v[11]=y,v[15]=x,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,i=1/lr.setFromMatrixColumn(e,0).length(),r=1/lr.setFromMatrixColumn(e,1).length(),a=1/lr.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){e&&e.isEuler||console.error("THREE.Matrix4: .makeRotationFromEuler() now expects a Euler rotation rather than a Vector3 and order.");let t=this.elements,n=e.x,i=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),c=Math.cos(i),l=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=a*h,f=a*u,p=o*h,y=o*u;t[0]=c*h,t[4]=-c*u,t[8]=l,t[1]=f+p*l,t[5]=d-y*l,t[9]=-o*c,t[2]=y-d*l,t[6]=p+f*l,t[10]=a*c}else if(e.order==="YXZ"){let d=c*h,f=c*u,p=l*h,y=l*u;t[0]=d+y*o,t[4]=p*o-f,t[8]=a*l,t[1]=a*u,t[5]=a*h,t[9]=-o,t[2]=f*o-p,t[6]=y+d*o,t[10]=a*c}else if(e.order==="ZXY"){let d=c*h,f=c*u,p=l*h,y=l*u;t[0]=d-y*o,t[4]=-a*u,t[8]=p+f*o,t[1]=f+p*o,t[5]=a*h,t[9]=y-d*o,t[2]=-a*l,t[6]=o,t[10]=a*c}else if(e.order==="ZYX"){let d=a*h,f=a*u,p=o*h,y=o*u;t[0]=c*h,t[4]=p*l-f,t[8]=d*l+y,t[1]=c*u,t[5]=y*l+d,t[9]=f*l-p,t[2]=-l,t[6]=o*c,t[10]=a*c}else if(e.order==="YZX"){let d=a*c,f=a*l,p=o*c,y=o*l;t[0]=c*h,t[4]=y-d*u,t[8]=p*u+f,t[1]=u,t[5]=a*h,t[9]=-o*h,t[2]=-l*h,t[6]=f*u+p,t[10]=d-y*u}else if(e.order==="XZY"){let d=a*c,f=a*l,p=o*c,y=o*l;t[0]=c*h,t[4]=-u,t[8]=l*h,t[1]=d*u+y,t[5]=a*h,t[9]=f*u-p,t[2]=p*u-f,t[6]=o*h,t[10]=y*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(F0,e,B0)}lookAt(e,t,n){let i=this.elements;return mn.subVectors(e,t),mn.lengthSq()===0&&(mn.z=1),mn.normalize(),ci.crossVectors(n,mn),ci.lengthSq()===0&&(Math.abs(n.z)===1?mn.x+=1e-4:mn.z+=1e-4,mn.normalize(),ci.crossVectors(n,mn)),ci.normalize(),Ya.crossVectors(mn,ci),i[0]=ci.x,i[4]=Ya.x,i[8]=mn.x,i[1]=ci.y,i[5]=Ya.y,i[9]=mn.y,i[2]=ci.z,i[6]=Ya.z,i[10]=mn.z,this}multiply(e,t){return t!==void 0?(console.warn("THREE.Matrix4: .multiply() now only accepts one argument. Use .multiplyMatrices( a, b ) instead."),this.multiplyMatrices(e,t)):this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,a=n[0],o=n[4],c=n[8],l=n[12],h=n[1],u=n[5],d=n[9],f=n[13],p=n[2],y=n[6],x=n[10],v=n[14],g=n[3],m=n[7],S=n[11],w=n[15],b=i[0],F=i[4],L=i[8],O=i[12],ae=i[1],_=i[5],E=i[9],z=i[13],D=i[2],C=i[6],I=i[10],K=i[14],G=i[3],oe=i[7],le=i[11],M=i[15];return r[0]=a*b+o*ae+c*D+l*G,r[4]=a*F+o*_+c*C+l*oe,r[8]=a*L+o*E+c*I+l*le,r[12]=a*O+o*z+c*K+l*M,r[1]=h*b+u*ae+d*D+f*G,r[5]=h*F+u*_+d*C+f*oe,r[9]=h*L+u*E+d*I+f*le,r[13]=h*O+u*z+d*K+f*M,r[2]=p*b+y*ae+x*D+v*G,r[6]=p*F+y*_+x*C+v*oe,r[10]=p*L+y*E+x*I+v*le,r[14]=p*O+y*z+x*K+v*M,r[3]=g*b+m*ae+S*D+w*G,r[7]=g*F+m*_+S*C+w*oe,r[11]=g*L+m*E+S*I+w*le,r[15]=g*O+m*z+S*K+w*M,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],a=e[1],o=e[5],c=e[9],l=e[13],h=e[2],u=e[6],d=e[10],f=e[14],p=e[3],y=e[7],x=e[11],v=e[15];return p*(+r*c*u-i*l*u-r*o*d+n*l*d+i*o*f-n*c*f)+y*(+t*c*f-t*l*d+r*a*d-i*a*f+i*l*h-r*c*h)+x*(+t*l*u-t*o*f-r*a*u+n*a*f+r*o*h-n*l*h)+v*(-i*o*h-t*c*u+t*o*d+i*a*u-n*a*d+n*c*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],a=e[4],o=e[5],c=e[6],l=e[7],h=e[8],u=e[9],d=e[10],f=e[11],p=e[12],y=e[13],x=e[14],v=e[15],g=u*x*l-y*d*l+y*c*f-o*x*f-u*c*v+o*d*v,m=p*d*l-h*x*l-p*c*f+a*x*f+h*c*v-a*d*v,S=h*y*l-p*u*l+p*o*f-a*y*f-h*o*v+a*u*v,w=p*u*c-h*y*c-p*o*d+a*y*d+h*o*x-a*u*x,b=t*g+n*m+i*S+r*w;if(b===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let F=1/b;return e[0]=g*F,e[1]=(y*d*r-u*x*r-y*i*f+n*x*f+u*i*v-n*d*v)*F,e[2]=(o*x*r-y*c*r+y*i*l-n*x*l-o*i*v+n*c*v)*F,e[3]=(u*c*r-o*d*r-u*i*l+n*d*l+o*i*f-n*c*f)*F,e[4]=m*F,e[5]=(h*x*r-p*d*r+p*i*f-t*x*f-h*i*v+t*d*v)*F,e[6]=(p*c*r-a*x*r-p*i*l+t*x*l+a*i*v-t*c*v)*F,e[7]=(a*d*r-h*c*r+h*i*l-t*d*l-a*i*f+t*c*f)*F,e[8]=S*F,e[9]=(p*u*r-h*y*r-p*n*f+t*y*f+h*n*v-t*u*v)*F,e[10]=(a*y*r-p*o*r+p*n*l-t*y*l-a*n*v+t*o*v)*F,e[11]=(h*o*r-a*u*r-h*n*l+t*u*l+a*n*f-t*o*f)*F,e[12]=w*F,e[13]=(h*y*i-p*u*i+p*n*d-t*y*d-h*n*x+t*u*x)*F,e[14]=(p*o*i-a*y*i-p*n*c+t*y*c+a*n*x-t*o*x)*F,e[15]=(a*u*i-h*o*i+h*n*c-t*u*c-a*n*d+t*o*d)*F,this}scale(e){let t=this.elements,n=e.x,i=e.y,r=e.z;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,a=e.x,o=e.y,c=e.z,l=r*a,h=r*o;return this.set(l*a+n,l*o-i*c,l*c+i*o,0,l*o+i*c,h*o+n,h*c-i*a,0,l*c-i*o,h*c+i*a,r*c*c+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n){return this.set(1,t,n,0,e,1,n,0,e,t,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,r=t._x,a=t._y,o=t._z,c=t._w,l=r+r,h=a+a,u=o+o,d=r*l,f=r*h,p=r*u,y=a*h,x=a*u,v=o*u,g=c*l,m=c*h,S=c*u,w=n.x,b=n.y,F=n.z;return i[0]=(1-(y+v))*w,i[1]=(f+S)*w,i[2]=(p-m)*w,i[3]=0,i[4]=(f-S)*b,i[5]=(1-(d+v))*b,i[6]=(x+g)*b,i[7]=0,i[8]=(p+m)*F,i[9]=(x-g)*F,i[10]=(1-(d+y))*F,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements,r=lr.set(i[0],i[1],i[2]).length(),a=lr.set(i[4],i[5],i[6]).length(),o=lr.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),e.x=i[12],e.y=i[13],e.z=i[14],Sn.copy(this);let l=1/r,h=1/a,u=1/o;return Sn.elements[0]*=l,Sn.elements[1]*=l,Sn.elements[2]*=l,Sn.elements[4]*=h,Sn.elements[5]*=h,Sn.elements[6]*=h,Sn.elements[8]*=u,Sn.elements[9]*=u,Sn.elements[10]*=u,t.setFromRotationMatrix(Sn),n.x=r,n.y=a,n.z=o,this}makePerspective(e,t,n,i,r,a){a===void 0&&console.warn("THREE.Matrix4: .makePerspective() has been redefined and has a new signature. Please check the docs.");let o=this.elements,c=2*r/(t-e),l=2*r/(n-i),h=(t+e)/(t-e),u=(n+i)/(n-i),d=-(a+r)/(a-r),f=-2*a*r/(a-r);return o[0]=c,o[4]=0,o[8]=h,o[12]=0,o[1]=0,o[5]=l,o[9]=u,o[13]=0,o[2]=0,o[6]=0,o[10]=d,o[14]=f,o[3]=0,o[7]=0,o[11]=-1,o[15]=0,this}makeOrthographic(e,t,n,i,r,a){let o=this.elements,c=1/(t-e),l=1/(n-i),h=1/(a-r),u=(t+e)*c,d=(n+i)*l,f=(a+r)*h;return o[0]=2*c,o[4]=0,o[8]=0,o[12]=-u,o[1]=0,o[5]=2*l,o[9]=0,o[13]=-d,o[2]=0,o[6]=0,o[10]=-2*h,o[14]=-f,o[3]=0,o[7]=0,o[11]=0,o[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}};bt.prototype.isMatrix4=!0;var lr=new Y,Sn=new bt,F0=new Y(0,0,0),B0=new Y(1,1,1),ci=new Y,Ya=new Y,mn=new Y,Yu=new bt,Zu=new Xt,Oi=class s{constructor(e=0,t=0,n=0,i=s.DefaultOrder){this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._order=i||this._order,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t,n){let i=e.elements,r=i[0],a=i[4],o=i[8],c=i[1],l=i[5],h=i[9],u=i[2],d=i[6],f=i[10];switch(t=t||this._order,t){case"XYZ":this._y=Math.asin(tn(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-tn(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(tn(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-tn(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-a,l));break;case"YZX":this._z=Math.asin(tn(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-tn(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,f),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n!==!1&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Yu.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Yu,t,n)}setFromVector3(e,t){return this.set(e.x,e.y,e.z,t||this._order)}reorder(e){return Zu.setFromEuler(this),this.setFromQuaternion(Zu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}toVector3(e){return e?e.set(this._x,this._y,this._z):new Y(this._x,this._y,this._z)}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}};Oi.prototype.isEuler=!0;Oi.DefaultOrder="XYZ";Oi.RotationOrders=["XYZ","YZX","ZXY","XZY","YXZ","ZYX"];var Rs=class{constructor(){this.mask=1}set(e){this.mask=1<<e|0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}},k0=0,ju=new Y,cr=new Xt,Yn=new bt,Za=new Y,os=new Y,N0=new Y,U0=new Xt,Ju=new Y(1,0,0),$u=new Y(0,1,0),Ku=new Y(0,0,1),O0={type:"added"},Qu={type:"removed"},Ct=class s extends Un{constructor(){super(),Object.defineProperty(this,"id",{value:k0++}),this.uuid=yn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DefaultUp.clone();let e=new Y,t=new Oi,n=new Xt,i=new Y(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new bt},normalMatrix:{value:new Vt}}),this.matrix=new bt,this.matrixWorld=new bt,this.matrixAutoUpdate=s.DefaultMatrixAutoUpdate,this.matrixWorldNeedsUpdate=!1,this.layers=new Rs,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return cr.setFromAxisAngle(e,t),this.quaternion.multiply(cr),this}rotateOnWorldAxis(e,t){return cr.setFromAxisAngle(e,t),this.quaternion.premultiply(cr),this}rotateX(e){return this.rotateOnAxis(Ju,e)}rotateY(e){return this.rotateOnAxis($u,e)}rotateZ(e){return this.rotateOnAxis(Ku,e)}translateOnAxis(e,t){return ju.copy(e).applyQuaternion(this.quaternion),this.position.add(ju.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Ju,e)}translateY(e){return this.translateOnAxis($u,e)}translateZ(e){return this.translateOnAxis(Ku,e)}localToWorld(e){return e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return e.applyMatrix4(Yn.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Za.copy(e):Za.set(e,t,n);let i=this.parent;this.updateWorldMatrix(!0,!1),os.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Yn.lookAt(os,Za,this.up):Yn.lookAt(Za,os,this.up),this.quaternion.setFromRotationMatrix(Yn),i&&(Yn.extractRotation(i.matrixWorld),cr.setFromRotationMatrix(Yn),this.quaternion.premultiply(cr.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.parent!==null&&e.parent.remove(e),e.parent=this,this.children.push(e),e.dispatchEvent(O0)):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Qu)),this}clear(){for(let e=0;e<this.children.length;e++){let t=this.children[e];t.parent=null,t.dispatchEvent(Qu)}return this.children.length=0,this}attach(e){return this.updateWorldMatrix(!0,!1),Yn.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Yn.multiply(e.parent.matrixWorld)),e.applyMatrix4(Yn),this.add(e),e.updateWorldMatrix(!1,!0),this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getWorldPosition(e){return e===void 0&&(console.warn("THREE.Object3D: .getWorldPosition() target is now required"),e=new Y),this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return e===void 0&&(console.warn("THREE.Object3D: .getWorldQuaternion() target is now required"),e=new Xt),this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(os,e,N0),e}getWorldScale(e){return e===void 0&&(console.warn("THREE.Object3D: .getWorldScale() target is now required"),e=new Y),this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(os,U0,e),e}getWorldDirection(e){e===void 0&&(console.warn("THREE.Object3D: .getWorldDirection() target is now required"),e=new Y),this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix),t===!0){let i=this.children;for(let r=0,a=i.length;r<a;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{}},n.metadata={version:4.5,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),JSON.stringify(this.userData)!=="{}"&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON()));function r(o,c){return o[c.uuid]===void 0&&(o[c.uuid]=c.toJSON(e)),c.uuid}if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let c=o.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){let u=c[l];r(e.shapes,u)}else r(e.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let c=0,l=this.material.length;c<l;c++)o.push(r(e.materials,this.material[c]));i.material=o}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let c=this.animations[o];i.animations.push(r(e.animations,c))}}if(t){let o=a(e.geometries),c=a(e.materials),l=a(e.textures),h=a(e.images),u=a(e.shapes),d=a(e.skeletons),f=a(e.animations);o.length>0&&(n.geometries=o),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),f.length>0&&(n.animations=f)}return n.object=i,n;function a(o){let c=[];for(let l in o){let h=o[l];delete h.metadata,c.push(h)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}};Ct.DefaultUp=new Y(0,1,0);Ct.DefaultMatrixAutoUpdate=!0;Ct.prototype.isObject3D=!0;var $l=new Y,G0=new Y,W0=new Vt,vn=class{constructor(e=new Y(1,0,0),t=0){this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=$l.subVectors(n,t).cross(G0.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t===void 0&&(console.warn("THREE.Plane: .projectPoint() target is now required"),t=new Y),t.copy(this.normal).multiplyScalar(-this.distanceToPoint(e)).add(e)}intersectLine(e,t){t===void 0&&(console.warn("THREE.Plane: .intersectLine() target is now required"),t=new Y);let n=e.delta($l),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let r=-(e.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:t.copy(n).multiplyScalar(r).add(e.start)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e===void 0&&(console.warn("THREE.Plane: .coplanarPoint() target is now required"),e=new Y),e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||W0.getNormalMatrix(e),i=this.coplanarPoint($l).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}};vn.prototype.isPlane=!0;var An=new Y,Zn=new Y,Kl=new Y,jn=new Y,ur=new Y,hr=new Y,eh=new Y,Ql=new Y,ec=new Y,tc=new Y,nn=class s{constructor(e=new Y,t=new Y,n=new Y){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i===void 0&&(console.warn("THREE.Triangle: .getNormal() target is now required"),i=new Y),i.subVectors(n,t),An.subVectors(e,t),i.cross(An);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(e,t,n,i,r){An.subVectors(i,t),Zn.subVectors(n,t),Kl.subVectors(e,t);let a=An.dot(An),o=An.dot(Zn),c=An.dot(Kl),l=Zn.dot(Zn),h=Zn.dot(Kl),u=a*l-o*o;if(r===void 0&&(console.warn("THREE.Triangle: .getBarycoord() target is now required"),r=new Y),u===0)return r.set(-2,-1,-1);let d=1/u,f=(l*c-o*h)*d,p=(a*h-o*c)*d;return r.set(1-f-p,p,f)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,jn),jn.x>=0&&jn.y>=0&&jn.x+jn.y<=1}static getUV(e,t,n,i,r,a,o,c){return this.getBarycoord(e,t,n,i,jn),c.set(0,0),c.addScaledVector(r,jn.x),c.addScaledVector(a,jn.y),c.addScaledVector(o,jn.z),c}static isFrontFacing(e,t,n,i){return An.subVectors(n,t),Zn.subVectors(e,t),An.cross(Zn).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return An.subVectors(this.c,this.b),Zn.subVectors(this.a,this.b),An.cross(Zn).length()*.5}getMidpoint(e){return e===void 0&&(console.warn("THREE.Triangle: .getMidpoint() target is now required"),e=new Y),e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return s.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e===void 0&&(console.warn("THREE.Triangle: .getPlane() target is now required"),e=new vn),e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return s.getBarycoord(e,this.a,this.b,this.c,t)}getUV(e,t,n,i,r){return s.getUV(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return s.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return s.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){t===void 0&&(console.warn("THREE.Triangle: .closestPointToPoint() target is now required"),t=new Y);let n=this.a,i=this.b,r=this.c,a,o;ur.subVectors(i,n),hr.subVectors(r,n),Ql.subVectors(e,n);let c=ur.dot(Ql),l=hr.dot(Ql);if(c<=0&&l<=0)return t.copy(n);ec.subVectors(e,i);let h=ur.dot(ec),u=hr.dot(ec);if(h>=0&&u<=h)return t.copy(i);let d=c*u-h*l;if(d<=0&&c>=0&&h<=0)return a=c/(c-h),t.copy(n).addScaledVector(ur,a);tc.subVectors(e,r);let f=ur.dot(tc),p=hr.dot(tc);if(p>=0&&f<=p)return t.copy(r);let y=f*l-c*p;if(y<=0&&l>=0&&p<=0)return o=l/(l-p),t.copy(n).addScaledVector(hr,o);let x=h*p-f*u;if(x<=0&&u-h>=0&&f-p>=0)return eh.subVectors(r,i),o=(u-h)/(u-h+(f-p)),t.copy(i).addScaledVector(eh,o);let v=1/(x+y+d);return a=y*v,o=d*v,t.copy(n).addScaledVector(ur,a).addScaledVector(hr,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},V0=0;function Yt(){Object.defineProperty(this,"id",{value:V0++}),this.uuid=yn(),this.name="",this.type="Material",this.fog=!0,this.blending=Ar,this.side=Kr,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.blendSrc=yu,this.blendDst=bu,this.blendEquation=Ii,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.depthFunc=zo,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Of,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Ro,this.stencilZFail=Ro,this.stencilZPass=Ro,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaTest=0,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0}Yt.prototype=Object.assign(Object.create(Un.prototype),{constructor:Yt,isMaterial:!0,onBuild:function(){},onBeforeCompile:function(){},customProgramCacheKey:function(){return this.onBeforeCompile.toString()},setValues:function(s){if(s!==void 0)for(let e in s){let t=s[e];if(t===void 0){console.warn("THREE.Material: '"+e+"' parameter is undefined.");continue}if(e==="shading"){console.warn("THREE."+this.type+": .shading has been removed. Use the boolean .flatShading instead."),this.flatShading=t===xu;continue}let n=this[e];if(n===void 0){console.warn("THREE."+this.type+": '"+e+"' is not a property of this material.");continue}n&&n.isColor?n.set(t):n&&n.isVector3&&t&&t.isVector3?n.copy(t):this[e]=t}},toJSON:function(s){let e=s===void 0||typeof s=="string";e&&(s={textures:{},images:{}});let t={metadata:{version:4.5,type:"Material",generator:"Material.toJSON"}};t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),this.color&&this.color.isColor&&(t.color=this.color.getHex()),this.roughness!==void 0&&(t.roughness=this.roughness),this.metalness!==void 0&&(t.metalness=this.metalness),this.sheen&&this.sheen.isColor&&(t.sheen=this.sheen.getHex()),this.emissive&&this.emissive.isColor&&(t.emissive=this.emissive.getHex()),this.emissiveIntensity&&this.emissiveIntensity!==1&&(t.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(t.specular=this.specular.getHex()),this.shininess!==void 0&&(t.shininess=this.shininess),this.clearcoat!==void 0&&(t.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(t.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(t.clearcoatMap=this.clearcoatMap.toJSON(s).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(t.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(s).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(t.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(s).uuid,t.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.map&&this.map.isTexture&&(t.map=this.map.toJSON(s).uuid),this.matcap&&this.matcap.isTexture&&(t.matcap=this.matcap.toJSON(s).uuid),this.alphaMap&&this.alphaMap.isTexture&&(t.alphaMap=this.alphaMap.toJSON(s).uuid),this.lightMap&&this.lightMap.isTexture&&(t.lightMap=this.lightMap.toJSON(s).uuid,t.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(t.aoMap=this.aoMap.toJSON(s).uuid,t.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(t.bumpMap=this.bumpMap.toJSON(s).uuid,t.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(t.normalMap=this.normalMap.toJSON(s).uuid,t.normalMapType=this.normalMapType,t.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(t.displacementMap=this.displacementMap.toJSON(s).uuid,t.displacementScale=this.displacementScale,t.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(t.roughnessMap=this.roughnessMap.toJSON(s).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(t.metalnessMap=this.metalnessMap.toJSON(s).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(t.emissiveMap=this.emissiveMap.toJSON(s).uuid),this.specularMap&&this.specularMap.isTexture&&(t.specularMap=this.specularMap.toJSON(s).uuid),this.envMap&&this.envMap.isTexture&&(t.envMap=this.envMap.toJSON(s).uuid,this.combine!==void 0&&(t.combine=this.combine)),this.envMapIntensity!==void 0&&(t.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(t.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(t.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(t.gradientMap=this.gradientMap.toJSON(s).uuid),this.size!==void 0&&(t.size=this.size),this.shadowSide!==null&&(t.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(t.sizeAttenuation=this.sizeAttenuation),this.blending!==Ar&&(t.blending=this.blending),this.side!==Kr&&(t.side=this.side),this.vertexColors&&(t.vertexColors=!0),this.opacity<1&&(t.opacity=this.opacity),this.transparent===!0&&(t.transparent=this.transparent),t.depthFunc=this.depthFunc,t.depthTest=this.depthTest,t.depthWrite=this.depthWrite,t.colorWrite=this.colorWrite,t.stencilWrite=this.stencilWrite,t.stencilWriteMask=this.stencilWriteMask,t.stencilFunc=this.stencilFunc,t.stencilRef=this.stencilRef,t.stencilFuncMask=this.stencilFuncMask,t.stencilFail=this.stencilFail,t.stencilZFail=this.stencilZFail,t.stencilZPass=this.stencilZPass,this.rotation&&this.rotation!==0&&(t.rotation=this.rotation),this.polygonOffset===!0&&(t.polygonOffset=!0),this.polygonOffsetFactor!==0&&(t.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(t.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth&&this.linewidth!==1&&(t.linewidth=this.linewidth),this.dashSize!==void 0&&(t.dashSize=this.dashSize),this.gapSize!==void 0&&(t.gapSize=this.gapSize),this.scale!==void 0&&(t.scale=this.scale),this.dithering===!0&&(t.dithering=!0),this.alphaTest>0&&(t.alphaTest=this.alphaTest),this.alphaToCoverage===!0&&(t.alphaToCoverage=this.alphaToCoverage),this.premultipliedAlpha===!0&&(t.premultipliedAlpha=this.premultipliedAlpha),this.wireframe===!0&&(t.wireframe=this.wireframe),this.wireframeLinewidth>1&&(t.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(t.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(t.wireframeLinejoin=this.wireframeLinejoin),this.morphTargets===!0&&(t.morphTargets=!0),this.morphNormals===!0&&(t.morphNormals=!0),this.skinning===!0&&(t.skinning=!0),this.flatShading===!0&&(t.flatShading=this.flatShading),this.visible===!1&&(t.visible=!1),this.toneMapped===!1&&(t.toneMapped=!1),JSON.stringify(this.userData)!=="{}"&&(t.userData=this.userData);function n(i){let r=[];for(let a in i){let o=i[a];delete o.metadata,r.push(o)}return r}if(e){let i=n(s.textures),r=n(s.images);i.length>0&&(t.textures=i),r.length>0&&(t.images=r)}return t},clone:function(){return new this.constructor().copy(this)},copy:function(s){this.name=s.name,this.fog=s.fog,this.blending=s.blending,this.side=s.side,this.vertexColors=s.vertexColors,this.opacity=s.opacity,this.transparent=s.transparent,this.blendSrc=s.blendSrc,this.blendDst=s.blendDst,this.blendEquation=s.blendEquation,this.blendSrcAlpha=s.blendSrcAlpha,this.blendDstAlpha=s.blendDstAlpha,this.blendEquationAlpha=s.blendEquationAlpha,this.depthFunc=s.depthFunc,this.depthTest=s.depthTest,this.depthWrite=s.depthWrite,this.stencilWriteMask=s.stencilWriteMask,this.stencilFunc=s.stencilFunc,this.stencilRef=s.stencilRef,this.stencilFuncMask=s.stencilFuncMask,this.stencilFail=s.stencilFail,this.stencilZFail=s.stencilZFail,this.stencilZPass=s.stencilZPass,this.stencilWrite=s.stencilWrite;let e=s.clippingPlanes,t=null;if(e!==null){let n=e.length;t=new Array(n);for(let i=0;i!==n;++i)t[i]=e[i].clone()}return this.clippingPlanes=t,this.clipIntersection=s.clipIntersection,this.clipShadows=s.clipShadows,this.shadowSide=s.shadowSide,this.colorWrite=s.colorWrite,this.precision=s.precision,this.polygonOffset=s.polygonOffset,this.polygonOffsetFactor=s.polygonOffsetFactor,this.polygonOffsetUnits=s.polygonOffsetUnits,this.dithering=s.dithering,this.alphaTest=s.alphaTest,this.alphaToCoverage=s.alphaToCoverage,this.premultipliedAlpha=s.premultipliedAlpha,this.visible=s.visible,this.toneMapped=s.toneMapped,this.userData=JSON.parse(JSON.stringify(s.userData)),this},dispose:function(){this.dispatchEvent({type:"dispose"})}});Object.defineProperty(Yt.prototype,"needsUpdate",{set:function(s){s===!0&&this.version++}});var Vf={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Tn={h:0,s:0,l:0},ja={h:0,s:0,l:0};function nc(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+(e-s)*6*t:t<1/2?e:t<2/3?s+(e-s)*6*(2/3-t):s}function ic(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function rc(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var ut=class{constructor(e,t,n){return t===void 0&&n===void 0?this.set(e):this.setRGB(e,t,n)}set(e){return e&&e.isColor?this.copy(e):typeof e=="number"?this.setHex(e):typeof e=="string"&&this.setStyle(e),this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,this}setRGB(e,t,n){return this.r=e,this.g=t,this.b=n,this}setHSL(e,t,n){if(e=Tu(e,1),t=tn(t,0,1),n=tn(n,0,1),t===0)this.r=this.g=this.b=n;else{let i=n<=.5?n*(1+t):n+t-n*t,r=2*n-i;this.r=nc(r,i,e+1/3),this.g=nc(r,i,e),this.b=nc(r,i,e-1/3)}return this}setStyle(e){function t(i){i!==void 0&&parseFloat(i)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let n;if(n=/^((?:rgb|hsl)a?)\\(([^\\)]*)\\)/.exec(e)){let i,r=n[1],a=n[2];switch(r){case"rgb":case"rgba":if(i=/^\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*(?:,\\s*(\\d*\\.?\\d+)\\s*)?$/.exec(a))return this.r=Math.min(255,parseInt(i[1],10))/255,this.g=Math.min(255,parseInt(i[2],10))/255,this.b=Math.min(255,parseInt(i[3],10))/255,t(i[4]),this;if(i=/^\\s*(\\d+)\\%\\s*,\\s*(\\d+)\\%\\s*,\\s*(\\d+)\\%\\s*(?:,\\s*(\\d*\\.?\\d+)\\s*)?$/.exec(a))return this.r=Math.min(100,parseInt(i[1],10))/100,this.g=Math.min(100,parseInt(i[2],10))/100,this.b=Math.min(100,parseInt(i[3],10))/100,t(i[4]),this;break;case"hsl":case"hsla":if(i=/^\\s*(\\d*\\.?\\d+)\\s*,\\s*(\\d+)\\%\\s*,\\s*(\\d+)\\%\\s*(?:,\\s*(\\d*\\.?\\d+)\\s*)?$/.exec(a)){let o=parseFloat(i[1])/360,c=parseInt(i[2],10)/100,l=parseInt(i[3],10)/100;return t(i[4]),this.setHSL(o,c,l)}break}}else if(n=/^\\#([A-Fa-f\\d]+)$/.exec(e)){let i=n[1],r=i.length;if(r===3)return this.r=parseInt(i.charAt(0)+i.charAt(0),16)/255,this.g=parseInt(i.charAt(1)+i.charAt(1),16)/255,this.b=parseInt(i.charAt(2)+i.charAt(2),16)/255,this;if(r===6)return this.r=parseInt(i.charAt(0)+i.charAt(1),16)/255,this.g=parseInt(i.charAt(2)+i.charAt(3),16)/255,this.b=parseInt(i.charAt(4)+i.charAt(5),16)/255,this}return e&&e.length>0?this.setColorName(e):this}setColorName(e){let t=Vf[e.toLowerCase()];return t!==void 0?this.setHex(t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copyGammaToLinear(e,t=2){return this.r=Math.pow(e.r,t),this.g=Math.pow(e.g,t),this.b=Math.pow(e.b,t),this}copyLinearToGamma(e,t=2){let n=t>0?1/t:1;return this.r=Math.pow(e.r,n),this.g=Math.pow(e.g,n),this.b=Math.pow(e.b,n),this}convertGammaToLinear(e){return this.copyGammaToLinear(this,e),this}convertLinearToGamma(e){return this.copyLinearToGamma(this,e),this}copySRGBToLinear(e){return this.r=ic(e.r),this.g=ic(e.g),this.b=ic(e.b),this}copyLinearToSRGB(e){return this.r=rc(e.r),this.g=rc(e.g),this.b=rc(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(){return this.r*255<<16^this.g*255<<8^this.b*255<<0}getHexString(){return("000000"+this.getHex().toString(16)).slice(-6)}getHSL(e){e===void 0&&(console.warn("THREE.Color: .getHSL() target is now required"),e={h:0,s:0,l:0});let t=this.r,n=this.g,i=this.b,r=Math.max(t,n,i),a=Math.min(t,n,i),o,c,l=(a+r)/2;if(a===r)o=0,c=0;else{let h=r-a;switch(c=l<=.5?h/(r+a):h/(2-r-a),r){case t:o=(n-i)/h+(n<i?6:0);break;case n:o=(i-t)/h+2;break;case i:o=(t-n)/h+4;break}o/=6}return e.h=o,e.s=c,e.l=l,e}getStyle(){return"rgb("+(this.r*255|0)+","+(this.g*255|0)+","+(this.b*255|0)+")"}offsetHSL(e,t,n){return this.getHSL(Tn),Tn.h+=e,Tn.s+=t,Tn.l+=n,this.setHSL(Tn.h,Tn.s,Tn.l),this}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Tn),e.getHSL(ja);let n=ys(Tn.h,ja.h,t),i=ys(Tn.s,ja.s,t),r=ys(Tn.l,ja.l,t);return this.setHSL(n,i,r),this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),e.normalized===!0&&(this.r/=255,this.g/=255,this.b/=255),this}toJSON(){return this.getHex()}};ut.NAMES=Vf;ut.prototype.isColor=!0;ut.prototype.r=1;ut.prototype.g=1;ut.prototype.b=1;var Ln=class extends Yt{constructor(e){super(),this.type="MeshBasicMaterial",this.color=new ut(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=za,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this}};Ln.prototype.isMeshBasicMaterial=!0;var Ft=new Y,Ja=new Je,St=class{constructor(e,t,n){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n===!0,this.usage=Pr,this.updateRange={offset:0,count:-1},this.version=0,this.onUploadCallback=function(){}}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}copyColorsArray(e){let t=this.array,n=0;for(let i=0,r=e.length;i<r;i++){let a=e[i];a===void 0&&(console.warn("THREE.BufferAttribute.copyColorsArray(): color is undefined",i),a=new ut),t[n++]=a.r,t[n++]=a.g,t[n++]=a.b}return this}copyVector2sArray(e){let t=this.array,n=0;for(let i=0,r=e.length;i<r;i++){let a=e[i];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector2sArray(): vector is undefined",i),a=new Je),t[n++]=a.x,t[n++]=a.y}return this}copyVector3sArray(e){let t=this.array,n=0;for(let i=0,r=e.length;i<r;i++){let a=e[i];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector3sArray(): vector is undefined",i),a=new Y),t[n++]=a.x,t[n++]=a.y,t[n++]=a.z}return this}copyVector4sArray(e){let t=this.array,n=0;for(let i=0,r=e.length;i<r;i++){let a=e[i];a===void 0&&(console.warn("THREE.BufferAttribute.copyVector4sArray(): vector is undefined",i),a=new Lt),t[n++]=a.x,t[n++]=a.y,t[n++]=a.z,t[n++]=a.w}return this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Ja.fromBufferAttribute(this,t),Ja.applyMatrix3(e),this.setXY(t,Ja.x,Ja.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Ft.fromBufferAttribute(this,t),Ft.applyMatrix3(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Ft.x=this.getX(t),Ft.y=this.getY(t),Ft.z=this.getZ(t),Ft.applyMatrix4(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ft.x=this.getX(t),Ft.y=this.getY(t),Ft.z=this.getZ(t),Ft.applyNormalMatrix(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ft.x=this.getX(t),Ft.y=this.getY(t),Ft.z=this.getZ(t),Ft.transformDirection(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}set(e,t=0){return this.array.set(e,t),this}getX(e){return this.array[e*this.itemSize]}setX(e,t){return this.array[e*this.itemSize]=t,this}getY(e){return this.array[e*this.itemSize+1]}setY(e,t){return this.array[e*this.itemSize+1]=t,this}getZ(e){return this.array[e*this.itemSize+2]}setZ(e,t){return this.array[e*this.itemSize+2]=t,this}getW(e){return this.array[e*this.itemSize+3]}setW(e,t){return this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e*=this.itemSize,this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.prototype.slice.call(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Pr&&(e.usage=this.usage),(this.updateRange.offset!==0||this.updateRange.count!==-1)&&(e.updateRange=this.updateRange),e}};St.prototype.isBufferAttribute=!0;var No=class extends St{constructor(e,t,n){super(new Int8Array(e),t,n)}},Uo=class extends St{constructor(e,t,n){super(new Uint8Array(e),t,n)}},Oo=class extends St{constructor(e,t,n){super(new Uint8ClampedArray(e),t,n)}},Go=class extends St{constructor(e,t,n){super(new Int16Array(e),t,n)}},Rr=class extends St{constructor(e,t,n){super(new Uint16Array(e),t,n)}},Wo=class extends St{constructor(e,t,n){super(new Int32Array(e),t,n)}},zr=class extends St{constructor(e,t,n){super(new Uint32Array(e),t,n)}},Vo=class extends St{constructor(e,t,n){super(new Uint16Array(e),t,n)}};Vo.prototype.isFloat16BufferAttribute=!0;var dt=class extends St{constructor(e,t,n){super(new Float32Array(e),t,n)}},Ho=class extends St{constructor(e,t,n){super(new Float64Array(e),t,n)}};function Hf(s){if(s.length===0)return-1/0;let e=s[0];for(let t=1,n=s.length;t<n;++t)s[t]>e&&(e=s[t]);return e}var H0={Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array};function gs(s,e){return new H0[s](e)}var q0=0,In=new bt,sc=new Ct,dr=new Y,gn=new sn,ls=new sn,$t=new Y,_t=class s extends Un{constructor(){super(),Object.defineProperty(this,"id",{value:q0++}),this.uuid=yn(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Hf(e)>65535?zr:Rr)(e,1):this.index=e,this}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Vt().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}rotateX(e){return In.makeRotationX(e),this.applyMatrix4(In),this}rotateY(e){return In.makeRotationY(e),this.applyMatrix4(In),this}rotateZ(e){return In.makeRotationZ(e),this.applyMatrix4(In),this}translate(e,t,n){return In.makeTranslation(e,t,n),this.applyMatrix4(In),this}scale(e,t,n){return In.makeScale(e,t,n),this.applyMatrix4(In),this}lookAt(e){return sc.lookAt(e),sc.updateMatrix(),this.applyMatrix4(sc.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(dr).negate(),this.translate(dr.x,dr.y,dr.z),this}setFromPoints(e){let t=[];for(let n=0,i=e.length;n<i;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}return this.setAttribute("position",new dt(t,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new sn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingBox.set(new Y(-1/0,-1/0,-1/0),new Y(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];gn.setFromBufferAttribute(r),this.morphTargetsRelative?($t.addVectors(this.boundingBox.min,gn.min),this.boundingBox.expandByPoint($t),$t.addVectors(this.boundingBox.max,gn.max),this.boundingBox.expandByPoint($t)):(this.boundingBox.expandByPoint(gn.min),this.boundingBox.expandByPoint(gn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new On);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error('THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".',this),this.boundingSphere.set(new Y,1/0);return}if(e){let n=this.boundingSphere.center;if(gn.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){let o=t[r];ls.setFromBufferAttribute(o),this.morphTargetsRelative?($t.addVectors(gn.min,ls.min),gn.expandByPoint($t),$t.addVectors(gn.max,ls.max),gn.expandByPoint($t)):(gn.expandByPoint(ls.min),gn.expandByPoint(ls.max))}gn.getCenter(n);let i=0;for(let r=0,a=e.count;r<a;r++)$t.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared($t));if(t)for(let r=0,a=t.length;r<a;r++){let o=t[r],c=this.morphTargetsRelative;for(let l=0,h=o.count;l<h;l++)$t.fromBufferAttribute(o,l),c&&(dr.fromBufferAttribute(e,l),$t.add(dr)),i=Math.max(i,n.distanceToSquared($t))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeFaceNormals(){}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.array,i=t.position.array,r=t.normal.array,a=t.uv.array,o=i.length/3;t.tangent===void 0&&this.setAttribute("tangent",new St(new Float32Array(4*o),4));let c=t.tangent.array,l=[],h=[];for(let ae=0;ae<o;ae++)l[ae]=new Y,h[ae]=new Y;let u=new Y,d=new Y,f=new Y,p=new Je,y=new Je,x=new Je,v=new Y,g=new Y;function m(ae,_,E){u.fromArray(i,ae*3),d.fromArray(i,_*3),f.fromArray(i,E*3),p.fromArray(a,ae*2),y.fromArray(a,_*2),x.fromArray(a,E*2),d.sub(u),f.sub(u),y.sub(p),x.sub(p);let z=1/(y.x*x.y-x.x*y.y);isFinite(z)&&(v.copy(d).multiplyScalar(x.y).addScaledVector(f,-y.y).multiplyScalar(z),g.copy(f).multiplyScalar(y.x).addScaledVector(d,-x.x).multiplyScalar(z),l[ae].add(v),l[_].add(v),l[E].add(v),h[ae].add(g),h[_].add(g),h[E].add(g))}let S=this.groups;S.length===0&&(S=[{start:0,count:n.length}]);for(let ae=0,_=S.length;ae<_;++ae){let E=S[ae],z=E.start,D=E.count;for(let C=z,I=z+D;C<I;C+=3)m(n[C+0],n[C+1],n[C+2])}let w=new Y,b=new Y,F=new Y,L=new Y;function O(ae){F.fromArray(r,ae*3),L.copy(F);let _=l[ae];w.copy(_),w.sub(F.multiplyScalar(F.dot(_))).normalize(),b.crossVectors(L,_);let z=b.dot(h[ae])<0?-1:1;c[ae*4]=w.x,c[ae*4+1]=w.y,c[ae*4+2]=w.z,c[ae*4+3]=z}for(let ae=0,_=S.length;ae<_;++ae){let E=S[ae],z=E.start,D=E.count;for(let C=z,I=z+D;C<I;C+=3)O(n[C+0]),O(n[C+1]),O(n[C+2])}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new St(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,f=n.count;d<f;d++)n.setXYZ(d,0,0,0);let i=new Y,r=new Y,a=new Y,o=new Y,c=new Y,l=new Y,h=new Y,u=new Y;if(e)for(let d=0,f=e.count;d<f;d+=3){let p=e.getX(d+0),y=e.getX(d+1),x=e.getX(d+2);i.fromBufferAttribute(t,p),r.fromBufferAttribute(t,y),a.fromBufferAttribute(t,x),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),o.fromBufferAttribute(n,p),c.fromBufferAttribute(n,y),l.fromBufferAttribute(n,x),o.add(h),c.add(h),l.add(h),n.setXYZ(p,o.x,o.y,o.z),n.setXYZ(y,c.x,c.y,c.z),n.setXYZ(x,l.x,l.y,l.z)}else for(let d=0,f=t.count;d<f;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),a.fromBufferAttribute(t,d+2),h.subVectors(a,r),u.subVectors(i,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}merge(e,t){if(!(e&&e.isBufferGeometry)){console.error("THREE.BufferGeometry.merge(): geometry not an instance of THREE.BufferGeometry.",e);return}t===void 0&&(t=0,console.warn("THREE.BufferGeometry.merge(): Overwriting original geometry, starting at offset=0. Use BufferGeometryUtils.mergeBufferGeometries() for lossless merge."));let n=this.attributes;for(let i in n){if(e.attributes[i]===void 0)continue;let a=n[i].array,o=e.attributes[i],c=o.array,l=o.itemSize*t,h=Math.min(c.length,a.length-l);for(let u=0,d=l;u<h;u++,d++)a[d]=c[u]}return this}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)$t.fromBufferAttribute(e,t),$t.normalize(),e.setXYZ(t,$t.x,$t.y,$t.z)}toNonIndexed(){function e(o,c){let l=o.array,h=o.itemSize,u=o.normalized,d=new l.constructor(c.length*h),f=0,p=0;for(let y=0,x=c.length;y<x;y++){f=c[y]*h;for(let v=0;v<h;v++)d[p++]=l[f++]}return new St(d,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new s,n=this.index.array,i=this.attributes;for(let o in i){let c=i[o],l=e(c,n);t.setAttribute(o,l)}let r=this.morphAttributes;for(let o in r){let c=[],l=r[o];for(let h=0,u=l.length;h<u;h++){let d=l[h],f=e(d,n);c.push(f)}t.morphAttributes[o]=c}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,c=a.length;o<c;o++){let l=a[o];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){let e={metadata:{version:4.5,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let c in n){let l=n[c];e.data.attributes[c]=l.toJSON(e.data)}let i={},r=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],h=[];for(let u=0,d=l.length;u<d;u++){let f=l[u];h.push(f.toJSON(e.data))}h.length>0&&(i[c]=h,r=!0)}r&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere={center:o.center.toArray(),radius:o.radius}),e}clone(){return new s().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let i=e.attributes;for(let l in i){let h=i[l];this.setAttribute(l,h.clone(t))}let r=e.morphAttributes;for(let l in r){let h=[],u=r[l];for(let d=0,f=u.length;d<f;d++)h.push(u[d].clone(t));this.morphAttributes[l]=h}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let l=0,h=a.length;l<h;l++){let u=a[l];this.addGroup(u.start,u.count,u.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}};_t.prototype.isBufferGeometry=!0;var th=new bt,fr=new Gn,ac=new On,ui=new Y,hi=new Y,di=new Y,oc=new Y,lc=new Y,cc=new Y,$a=new Y,Ka=new Y,Qa=new Y,eo=new Je,to=new Je,no=new Je,uc=new Y,io=new Y,Ot=class extends Ct{constructor(e=new _t,t=new Ln){super(),this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e){return super.copy(e),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry;if(e.isBufferGeometry){let t=e.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}else{let t=e.morphTargets;t!==void 0&&t.length>0&&console.error("THREE.Mesh.updateMorphTargets() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.")}}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;if(i===void 0||(n.boundingSphere===null&&n.computeBoundingSphere(),ac.copy(n.boundingSphere),ac.applyMatrix4(r),e.ray.intersectsSphere(ac)===!1)||(th.copy(r).invert(),fr.copy(e.ray).applyMatrix4(th),n.boundingBox!==null&&fr.intersectsBox(n.boundingBox)===!1))return;let a;if(n.isBufferGeometry){let o=n.index,c=n.attributes.position,l=n.morphAttributes.position,h=n.morphTargetsRelative,u=n.attributes.uv,d=n.attributes.uv2,f=n.groups,p=n.drawRange;if(o!==null)if(Array.isArray(i))for(let y=0,x=f.length;y<x;y++){let v=f[y],g=i[v.materialIndex],m=Math.max(v.start,p.start),S=Math.min(v.start+v.count,p.start+p.count);for(let w=m,b=S;w<b;w+=3){let F=o.getX(w),L=o.getX(w+1),O=o.getX(w+2);a=ro(this,g,e,fr,c,l,h,u,d,F,L,O),a&&(a.faceIndex=Math.floor(w/3),a.face.materialIndex=v.materialIndex,t.push(a))}}else{let y=Math.max(0,p.start),x=Math.min(o.count,p.start+p.count);for(let v=y,g=x;v<g;v+=3){let m=o.getX(v),S=o.getX(v+1),w=o.getX(v+2);a=ro(this,i,e,fr,c,l,h,u,d,m,S,w),a&&(a.faceIndex=Math.floor(v/3),t.push(a))}}else if(c!==void 0)if(Array.isArray(i))for(let y=0,x=f.length;y<x;y++){let v=f[y],g=i[v.materialIndex],m=Math.max(v.start,p.start),S=Math.min(v.start+v.count,p.start+p.count);for(let w=m,b=S;w<b;w+=3){let F=w,L=w+1,O=w+2;a=ro(this,g,e,fr,c,l,h,u,d,F,L,O),a&&(a.faceIndex=Math.floor(w/3),a.face.materialIndex=v.materialIndex,t.push(a))}}else{let y=Math.max(0,p.start),x=Math.min(c.count,p.start+p.count);for(let v=y,g=x;v<g;v+=3){let m=v,S=v+1,w=v+2;a=ro(this,i,e,fr,c,l,h,u,d,m,S,w),a&&(a.faceIndex=Math.floor(v/3),t.push(a))}}}else n.isGeometry&&console.error("THREE.Mesh.raycast() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.")}};Ot.prototype.isMesh=!0;function X0(s,e,t,n,i,r,a,o){let c;if(e.side===Ht?c=n.intersectTriangle(a,r,i,!0,o):c=n.intersectTriangle(i,r,a,e.side!==Ra,o),c===null)return null;io.copy(o),io.applyMatrix4(s.matrixWorld);let l=t.ray.origin.distanceTo(io);return l<t.near||l>t.far?null:{distance:l,point:io.clone(),object:s}}function ro(s,e,t,n,i,r,a,o,c,l,h,u){ui.fromBufferAttribute(i,l),hi.fromBufferAttribute(i,h),di.fromBufferAttribute(i,u);let d=s.morphTargetInfluences;if(e.morphTargets&&r&&d){$a.set(0,0,0),Ka.set(0,0,0),Qa.set(0,0,0);for(let p=0,y=r.length;p<y;p++){let x=d[p],v=r[p];x!==0&&(oc.fromBufferAttribute(v,l),lc.fromBufferAttribute(v,h),cc.fromBufferAttribute(v,u),a?($a.addScaledVector(oc,x),Ka.addScaledVector(lc,x),Qa.addScaledVector(cc,x)):($a.addScaledVector(oc.sub(ui),x),Ka.addScaledVector(lc.sub(hi),x),Qa.addScaledVector(cc.sub(di),x)))}ui.add($a),hi.add(Ka),di.add(Qa)}s.isSkinnedMesh&&e.skinning&&(s.boneTransform(l,ui),s.boneTransform(h,hi),s.boneTransform(u,di));let f=X0(s,e,t,n,ui,hi,di,uc);if(f){o&&(eo.fromBufferAttribute(o,l),to.fromBufferAttribute(o,h),no.fromBufferAttribute(o,u),f.uv=nn.getUV(uc,ui,hi,di,eo,to,no,new Je)),c&&(eo.fromBufferAttribute(c,l),to.fromBufferAttribute(c,h),no.fromBufferAttribute(c,u),f.uv2=nn.getUV(uc,ui,hi,di,eo,to,no,new Je));let p={a:l,b:h,c:u,normal:new Y,materialIndex:0};nn.getNormal(ui,hi,di,p.normal),f.face=p}return f}var vi=class extends _t{constructor(e=1,t=1,n=1,i=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:a};let o=this;i=Math.floor(i),r=Math.floor(r),a=Math.floor(a);let c=[],l=[],h=[],u=[],d=0,f=0;p("z","y","x",-1,-1,n,t,e,a,r,0),p("z","y","x",1,-1,n,t,-e,a,r,1),p("x","z","y",1,1,e,n,t,i,a,2),p("x","z","y",1,-1,e,n,-t,i,a,3),p("x","y","z",1,-1,e,t,n,i,r,4),p("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(c),this.setAttribute("position",new dt(l,3)),this.setAttribute("normal",new dt(h,3)),this.setAttribute("uv",new dt(u,2));function p(y,x,v,g,m,S,w,b,F,L,O){let ae=S/F,_=w/L,E=S/2,z=w/2,D=b/2,C=F+1,I=L+1,K=0,G=0,oe=new Y;for(let le=0;le<I;le++){let M=le*_-z;for(let q=0;q<C;q++){let se=q*ae-E;oe[y]=se*g,oe[x]=M*m,oe[v]=D,l.push(oe.x,oe.y,oe.z),oe[y]=0,oe[x]=0,oe[v]=b>0?1:-1,h.push(oe.x,oe.y,oe.z),u.push(q/F),u.push(1-le/L),K+=1}}for(let le=0;le<L;le++)for(let M=0;M<F;M++){let q=d+M+C*le,se=d+M+C*(le+1),X=d+(M+1)+C*(le+1),pe=d+(M+1)+C*le;c.push(q,se,pe),c.push(se,X,pe),G+=6}o.addGroup(f,G,O),f+=G,d+=K}}};function Dr(s){let e={};for(let t in s){e[t]={};for(let n in s[t]){let i=s[t][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?e[t][n]=i.clone():Array.isArray(i)?e[t][n]=i.slice():e[t][n]=i}}return e}function rn(s){let e={};for(let t=0;t<s.length;t++){let n=Dr(s[t]);for(let i in n)e[i]=n[i]}return e}var qf={clone:Dr,merge:rn},Y0=\`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}\`,Z0=\`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}\`,Rn=class extends Yt{constructor(e){super(),this.type="ShaderMaterial",this.defines={},this.uniforms={},this.vertexShader=Y0,this.fragmentShader=Z0,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.extensions={derivatives:!1,fragDepth:!1,drawBuffers:!1,shaderTextureLOD:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv2:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&(e.attributes!==void 0&&console.error("THREE.ShaderMaterial: attributes should now be defined in THREE.BufferGeometry instead."),this.setValues(e))}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Dr(e.uniforms),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.lights=e.lights,this.clipping=e.clipping,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let a=this.uniforms[i].value;a&&a.isTexture?t.uniforms[i]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[i]={type:"m4",value:a.toArray()}:t.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}};Rn.prototype.isShaderMaterial=!0;var Gi=class extends Ct{constructor(){super(),this.type="Camera",this.matrixWorldInverse=new bt,this.projectionMatrix=new bt,this.projectionMatrixInverse=new bt}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this}getWorldDirection(e){e===void 0&&(console.warn("THREE.Camera: .getWorldDirection() target is now required"),e=new Y),this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(-t[8],-t[9],-t[10]).normalize()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}};Gi.prototype.isCamera=!0;var qt=class extends Gi{constructor(e=50,t=1,n=.1,i=2e3){super(),this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=Ls*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Ui*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Ls*2*Math.atan(Math.tan(Ui*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}setViewOffset(e,t,n,i,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Ui*.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-.5*i,a=this.view;if(this.view!==null&&this.view.enabled){let c=a.fullWidth,l=a.fullHeight;r+=a.offsetX*i/c,t-=a.offsetY*n/l,i*=a.width/c,n*=a.height/l}let o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}};qt.prototype.isPerspectiveCamera=!0;var pr=90,mr=1,Ir=class extends Ct{constructor(e,t,n){if(super(),this.type="CubeCamera",n.isWebGLCubeRenderTarget!==!0){console.error("THREE.CubeCamera: The constructor now expects an instance of WebGLCubeRenderTarget as third parameter.");return}this.renderTarget=n;let i=new qt(pr,mr,e,t);i.layers=this.layers,i.up.set(0,-1,0),i.lookAt(new Y(1,0,0)),this.add(i);let r=new qt(pr,mr,e,t);r.layers=this.layers,r.up.set(0,-1,0),r.lookAt(new Y(-1,0,0)),this.add(r);let a=new qt(pr,mr,e,t);a.layers=this.layers,a.up.set(0,0,1),a.lookAt(new Y(0,1,0)),this.add(a);let o=new qt(pr,mr,e,t);o.layers=this.layers,o.up.set(0,0,-1),o.lookAt(new Y(0,-1,0)),this.add(o);let c=new qt(pr,mr,e,t);c.layers=this.layers,c.up.set(0,-1,0),c.lookAt(new Y(0,0,1)),this.add(c);let l=new qt(pr,mr,e,t);l.layers=this.layers,l.up.set(0,-1,0),l.lookAt(new Y(0,0,-1)),this.add(l)}update(e,t){this.parent===null&&this.updateMatrixWorld();let n=this.renderTarget,[i,r,a,o,c,l]=this.children,h=e.xr.enabled,u=e.getRenderTarget();e.xr.enabled=!1;let d=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0),e.render(t,i),e.setRenderTarget(n,1),e.render(t,r),e.setRenderTarget(n,2),e.render(t,a),e.setRenderTarget(n,3),e.render(t,o),e.setRenderTarget(n,4),e.render(t,c),n.texture.generateMipmaps=d,e.setRenderTarget(n,5),e.render(t,l),e.setRenderTarget(u),e.xr.enabled=h}},xi=class extends Kt{constructor(e,t,n,i,r,a,o,c,l,h){e=e!==void 0?e:[],t=t!==void 0?t:Da,o=o!==void 0?o:pi,super(e,t,n,i,r,a,o,c,l,h),this._needsFlipEnvMap=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}};xi.prototype.isCubeTexture=!0;var Fr=class extends Pn{constructor(e,t,n){Number.isInteger(t)&&(console.warn("THREE.WebGLCubeRenderTarget: constructor signature is now WebGLCubeRenderTarget( size, options )"),t=n),super(e,e,t),t=t||{},this.texture=new xi(void 0,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.encoding),this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:Jt,this.texture._needsFlipEnvMap=!1}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.format=xn,this.texture.encoding=t.encoding,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:\`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			\`,fragmentShader:\`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			\`},i=new vi(5,5,5),r=new Rn({name:"CubemapFromEquirect",uniforms:Dr(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ht,blending:Kn});r.uniforms.tEquirect.value=t;let a=new Ot(i,r),o=t.minFilter;return t.minFilter===es&&(t.minFilter=Jt),new Ir(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t,n,i){let r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,i);e.setRenderTarget(r)}};Fr.prototype.isWebGLCubeRenderTarget=!0;var yi=class extends Kt{constructor(e,t,n,i,r,a,o,c,l,h,u,d){super(null,a,o,c,l,h,i,r,u,d),this.image={data:e||null,width:t||1,height:n||1},this.magFilter=l!==void 0?l:jt,this.minFilter=h!==void 0?h:jt,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.needsUpdate=!0}};yi.prototype.isDataTexture=!0;var gr=new On,so=new Y,Wi=class{constructor(e=new vn,t=new vn,n=new vn,i=new vn,r=new vn,a=new vn){this.planes=[e,t,n,i,r,a]}set(e,t,n,i,r,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(r),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e){let t=this.planes,n=e.elements,i=n[0],r=n[1],a=n[2],o=n[3],c=n[4],l=n[5],h=n[6],u=n[7],d=n[8],f=n[9],p=n[10],y=n[11],x=n[12],v=n[13],g=n[14],m=n[15];return t[0].setComponents(o-i,u-c,y-d,m-x).normalize(),t[1].setComponents(o+i,u+c,y+d,m+x).normalize(),t[2].setComponents(o+r,u+l,y+f,m+v).normalize(),t[3].setComponents(o-r,u-l,y-f,m-v).normalize(),t[4].setComponents(o-a,u-h,y-p,m-g).normalize(),t[5].setComponents(o+a,u+h,y+p,m+g).normalize(),this}intersectsObject(e){let t=e.geometry;return t.boundingSphere===null&&t.computeBoundingSphere(),gr.copy(t.boundingSphere).applyMatrix4(e.matrixWorld),this.intersectsSphere(gr)}intersectsSprite(e){return gr.center.set(0,0,0),gr.radius=.7071067811865476,gr.applyMatrix4(e.matrixWorld),this.intersectsSphere(gr)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(so.x=i.normal.x>0?e.max.x:e.min.x,so.y=i.normal.y>0?e.max.y:e.min.y,so.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(so)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};function Xf(){let s=null,e=!1,t=null,n=null;function i(r,a){t(r,a),n=s.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&(n=s.requestAnimationFrame(i),e=!0)},stop:function(){s.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){s=r}}}function j0(s,e){let t=e.isWebGL2,n=new WeakMap;function i(l,h){let u=l.array,d=l.usage,f=s.createBuffer();s.bindBuffer(h,f),s.bufferData(h,u,d),l.onUploadCallback();let p=5126;return u instanceof Float32Array?p=5126:u instanceof Float64Array?console.warn("THREE.WebGLAttributes: Unsupported data buffer format: Float64Array."):u instanceof Uint16Array?l.isFloat16BufferAttribute?t?p=5131:console.warn("THREE.WebGLAttributes: Usage of Float16BufferAttribute requires WebGL2."):p=5123:u instanceof Int16Array?p=5122:u instanceof Uint32Array?p=5125:u instanceof Int32Array?p=5124:u instanceof Int8Array?p=5120:u instanceof Uint8Array&&(p=5121),{buffer:f,type:p,bytesPerElement:u.BYTES_PER_ELEMENT,version:l.version}}function r(l,h,u){let d=h.array,f=h.updateRange;s.bindBuffer(u,l),f.count===-1?s.bufferSubData(u,0,d):(t?s.bufferSubData(u,f.offset*d.BYTES_PER_ELEMENT,d,f.offset,f.count):s.bufferSubData(u,f.offset*d.BYTES_PER_ELEMENT,d.subarray(f.offset,f.offset+f.count)),f.count=-1)}function a(l){return l.isInterleavedBufferAttribute&&(l=l.data),n.get(l)}function o(l){l.isInterleavedBufferAttribute&&(l=l.data);let h=n.get(l);h&&(s.deleteBuffer(h.buffer),n.delete(l))}function c(l,h){if(l.isGLBufferAttribute){let d=n.get(l);(!d||d.version<l.version)&&n.set(l,{buffer:l.buffer,type:l.type,bytesPerElement:l.elementSize,version:l.version});return}l.isInterleavedBufferAttribute&&(l=l.data);let u=n.get(l);u===void 0?n.set(l,i(l,h)):u.version<l.version&&(r(u.buffer,l,h),u.version=l.version)}return{get:a,remove:o,update:c}}var Br=class extends _t{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,a=t/2,o=Math.floor(n),c=Math.floor(i),l=o+1,h=c+1,u=e/o,d=t/c,f=[],p=[],y=[],x=[];for(let v=0;v<h;v++){let g=v*d-a;for(let m=0;m<l;m++){let S=m*u-r;p.push(S,-g,0),y.push(0,0,1),x.push(m/o),x.push(1-v/c)}}for(let v=0;v<c;v++)for(let g=0;g<o;g++){let m=g+l*v,S=g+l*(v+1),w=g+1+l*(v+1),b=g+1+l*v;f.push(m,S,b),f.push(S,w,b)}this.setIndex(f),this.setAttribute("position",new dt(p,3)),this.setAttribute("normal",new dt(y,3)),this.setAttribute("uv",new dt(x,2))}},J0=\`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vUv ).g;
#endif\`,$0=\`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif\`,K0=\`#ifdef ALPHATEST
	if ( diffuseColor.a < ALPHATEST ) discard;
#endif\`,Q0=\`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vUv2 ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.specularRoughness );
	#endif
#endif\`,em=\`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif\`,tm="vec3 transformed = vec3( position );",nm=\`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif\`,im=\`vec2 integrateSpecularBRDF( const in float dotNV, const in float roughness ) {
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	return vec2( -1.04, 1.04 ) * a004 + r.zw;
}
float punctualLightIntensityToIrradianceFactor( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
#if defined ( PHYSICALLY_CORRECT_LIGHTS )
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
#else
	if( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
		return pow( saturate( -lightDistance / cutoffDistance + 1.0 ), decayExponent );
	}
	return 1.0;
#endif
}
vec3 BRDF_Diffuse_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 specularColor, const in float dotLH ) {
	float fresnel = exp2( ( -5.55473 * dotLH - 6.98316 ) * dotLH );
	return ( 1.0 - specularColor ) * fresnel + specularColor;
}
vec3 F_Schlick_RoughnessDependent( const in vec3 F0, const in float dotNV, const in float roughness ) {
	float fresnel = exp2( ( -5.55473 * dotNV - 6.98316 ) * dotNV );
	vec3 Fr = max( vec3( 1.0 - roughness ), F0 ) - F0;
	return Fr * fresnel + F0;
}
float G_GGX_Smith( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gl = dotNL + sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	float gv = dotNV + sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	return 1.0 / ( gl * gv );
}
float G_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
vec3 BRDF_Specular_GGX( const in IncidentLight incidentLight, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float roughness ) {
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( incidentLight.direction + viewDir );
	float dotNL = saturate( dot( normal, incidentLight.direction ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotLH = saturate( dot( incidentLight.direction, halfDir ) );
	vec3 F = F_Schlick( specularColor, dotLH );
	float G = G_GGX_SmithCorrelated( alpha, dotNL, dotNV );
	float D = D_GGX( alpha, dotNH );
	return F * ( G * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
vec3 BRDF_Specular_GGX_Environment( const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 brdf = integrateSpecularBRDF( dotNV, roughness );
	return specularColor * brdf.x + brdf.y;
}
void BRDF_Specular_Multiscattering_Environment( const in GeometricContext geometry, const in vec3 specularColor, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
	float dotNV = saturate( dot( geometry.normal, geometry.viewDir ) );
	vec3 F = F_Schlick_RoughnessDependent( specularColor, dotNV, roughness );
	vec2 brdf = integrateSpecularBRDF( dotNV, roughness );
	vec3 FssEss = F * brdf.x + brdf.y;
	float Ess = brdf.x + brdf.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = specularColor + ( 1.0 - specularColor ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_Specular_BlinnPhong( const in IncidentLight incidentLight, const in GeometricContext geometry, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( incidentLight.direction + geometry.viewDir );
	float dotNH = saturate( dot( geometry.normal, halfDir ) );
	float dotLH = saturate( dot( incidentLight.direction, halfDir ) );
	vec3 F = F_Schlick( specularColor, dotLH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
}
float GGXRoughnessToBlinnExponent( const in float ggxRoughness ) {
	return ( 2.0 / pow2( ggxRoughness + 0.0001 ) - 2.0 );
}
float BlinnExponentToGGXRoughness( const in float blinnExponent ) {
	return sqrt( 2.0 / ( blinnExponent + 2.0 ) );
}
#if defined( USE_SHEEN )
float D_Charlie(float roughness, float NoH) {
	float invAlpha = 1.0 / roughness;
	float cos2h = NoH * NoH;
	float sin2h = max(1.0 - cos2h, 0.0078125);	return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
}
float V_Neubelt(float NoV, float NoL) {
	return saturate(1.0 / (4.0 * (NoL + NoV - NoL * NoV)));
}
vec3 BRDF_Specular_Sheen( const in float roughness, const in vec3 L, const in GeometricContext geometry, vec3 specularColor ) {
	vec3 N = geometry.normal;
	vec3 V = geometry.viewDir;
	vec3 H = normalize( V + L );
	float dotNH = saturate( dot( N, H ) );
	return specularColor * D_Charlie( roughness, dotNH ) * V_Neubelt( dot(N, V), dot(N, L) );
}
#endif\`,rm=\`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vUv );
		vec2 dSTdy = dFdy( vUv );
		float Hll = bumpScale * texture2D( bumpMap, vUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = vec3( dFdx( surf_pos.x ), dFdx( surf_pos.y ), dFdx( surf_pos.z ) );
		vec3 vSigmaY = vec3( dFdy( surf_pos.x ), dFdy( surf_pos.y ), dFdy( surf_pos.z ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif\`,sm=\`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#pragma unroll_loop_start
	for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
		plane = clippingPlanes[ i ];
		if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
	}
	#pragma unroll_loop_end
	#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
		bool clipped = true;
		#pragma unroll_loop_start
		for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
		}
		#pragma unroll_loop_end
		if ( clipped ) discard;
	#endif
#endif\`,am=\`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif\`,om=\`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif\`,lm=\`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif\`,cm=\`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif\`,um=\`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif\`,hm=\`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	varying vec3 vColor;
#endif\`,dm=\`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif\`,fm=\`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate(a) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement(a) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float average( const in vec3 color ) { return dot( color, vec3( 0.3333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract(sin(sn) * c);
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float max3( vec3 v ) { return max( max( v.x, v.y ), v.z ); }
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
struct GeometricContext {
	vec3 position;
	vec3 normal;
	vec3 viewDir;
#ifdef CLEARCOAT
	vec3 clearcoatNormal;
#endif
};
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
vec3 projectOnPlane(in vec3 point, in vec3 pointOnPlane, in vec3 planeNormal ) {
	float distance = dot( planeNormal, point - pointOnPlane );
	return - distance * planeNormal + point;
}
float sideOfPlane( in vec3 point, in vec3 pointOnPlane, in vec3 planeNormal ) {
	return sign( dot( point - pointOnPlane, planeNormal ) );
}
vec3 linePlaneIntersect( in vec3 pointOnLine, in vec3 lineDirection, in vec3 pointOnPlane, in vec3 planeNormal ) {
	return lineDirection * ( dot( planeNormal, pointOnPlane - pointOnLine ) / dot( planeNormal, lineDirection ) ) + pointOnLine;
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
float linearToRelativeLuminance( const in vec3 color ) {
	vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );
	return dot( weights, color.rgb );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}\`,pm=\`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_maxMipLevel 8.0
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_maxTileSize 256.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		float texelSize = 1.0 / ( 3.0 * cubeUV_maxTileSize );
		vec2 uv = getUV( direction, face ) * ( faceSize - 1.0 );
		vec2 f = fract( uv );
		uv += 0.5 - f;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		if ( mipInt < cubeUV_maxMipLevel ) {
			uv.y += 2.0 * cubeUV_maxTileSize;
		}
		uv.y += filterInt * 2.0 * cubeUV_minTileSize;
		uv.x += 3.0 * max( 0.0, cubeUV_maxTileSize - 2.0 * faceSize );
		uv *= texelSize;
		vec3 tl = envMapTexelToLinear( texture2D( envMap, uv ) ).rgb;
		uv.x += texelSize;
		vec3 tr = envMapTexelToLinear( texture2D( envMap, uv ) ).rgb;
		uv.y += texelSize;
		vec3 br = envMapTexelToLinear( texture2D( envMap, uv ) ).rgb;
		uv.x -= texelSize;
		vec3 bl = envMapTexelToLinear( texture2D( envMap, uv ) ).rgb;
		vec3 tm = mix( tl, tr, f.x );
		vec3 bm = mix( bl, br, f.x );
		return mix( tm, bm, f.y );
	}
	#define r0 1.0
	#define v0 0.339
	#define m0 - 2.0
	#define r1 0.8
	#define v1 0.276
	#define m1 - 1.0
	#define r4 0.4
	#define v4 0.046
	#define m4 2.0
	#define r5 0.305
	#define v5 0.016
	#define m5 3.0
	#define r6 0.21
	#define v6 0.0038
	#define m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= r1 ) {
			mip = ( r0 - roughness ) * ( m1 - m0 ) / ( r0 - r1 ) + m0;
		} else if ( roughness >= r4 ) {
			mip = ( r1 - roughness ) * ( m4 - m1 ) / ( r1 - r4 ) + m1;
		} else if ( roughness >= r5 ) {
			mip = ( r4 - roughness ) * ( m5 - m4 ) / ( r4 - r5 ) + m4;
		} else if ( roughness >= r6 ) {
			mip = ( r5 - roughness ) * ( m6 - m5 ) / ( r5 - r6 ) + m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), m0, cubeUV_maxMipLevel );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif\`,mm=\`vec3 transformedNormal = objectNormal;
#ifdef USE_INSTANCING
	mat3 m = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( m[ 0 ], m[ 0 ] ), dot( m[ 1 ], m[ 1 ] ), dot( m[ 2 ], m[ 2 ] ) );
	transformedNormal = m * transformedNormal;
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	vec3 transformedTangent = ( modelViewMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif\`,gm=\`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif\`,vm=\`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vUv ).x * displacementScale + displacementBias );
#endif\`,xm=\`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vUv );
	emissiveColor.rgb = emissiveMapTexelToLinear( emissiveColor ).rgb;
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif\`,ym=\`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif\`,bm="gl_FragColor = linearToOutputTexel( gl_FragColor );",wm=\`
vec4 LinearToLinear( in vec4 value ) {
	return value;
}
vec4 GammaToLinear( in vec4 value, in float gammaFactor ) {
	return vec4( pow( value.rgb, vec3( gammaFactor ) ), value.a );
}
vec4 LinearToGamma( in vec4 value, in float gammaFactor ) {
	return vec4( pow( value.rgb, vec3( 1.0 / gammaFactor ) ), value.a );
}
vec4 sRGBToLinear( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 LinearTosRGB( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 RGBEToLinear( in vec4 value ) {
	return vec4( value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
}
vec4 LinearToRGBE( in vec4 value ) {
	float maxComponent = max( max( value.r, value.g ), value.b );
	float fExp = clamp( ceil( log2( maxComponent ) ), -128.0, 127.0 );
	return vec4( value.rgb / exp2( fExp ), ( fExp + 128.0 ) / 255.0 );
}
vec4 RGBMToLinear( in vec4 value, in float maxRange ) {
	return vec4( value.rgb * value.a * maxRange, 1.0 );
}
vec4 LinearToRGBM( in vec4 value, in float maxRange ) {
	float maxRGB = max( value.r, max( value.g, value.b ) );
	float M = clamp( maxRGB / maxRange, 0.0, 1.0 );
	M = ceil( M * 255.0 ) / 255.0;
	return vec4( value.rgb / ( M * maxRange ), M );
}
vec4 RGBDToLinear( in vec4 value, in float maxRange ) {
	return vec4( value.rgb * ( ( maxRange / 255.0 ) / value.a ), 1.0 );
}
vec4 LinearToRGBD( in vec4 value, in float maxRange ) {
	float maxRGB = max( value.r, max( value.g, value.b ) );
	float D = max( maxRange / maxRGB, 1.0 );
	D = clamp( floor( D ) / 255.0, 0.0, 1.0 );
	return vec4( value.rgb * ( D * ( 255.0 / maxRange ) ), D );
}
const mat3 cLogLuvM = mat3( 0.2209, 0.3390, 0.4184, 0.1138, 0.6780, 0.7319, 0.0102, 0.1130, 0.2969 );
vec4 LinearToLogLuv( in vec4 value ) {
	vec3 Xp_Y_XYZp = cLogLuvM * value.rgb;
	Xp_Y_XYZp = max( Xp_Y_XYZp, vec3( 1e-6, 1e-6, 1e-6 ) );
	vec4 vResult;
	vResult.xy = Xp_Y_XYZp.xy / Xp_Y_XYZp.z;
	float Le = 2.0 * log2(Xp_Y_XYZp.y) + 127.0;
	vResult.w = fract( Le );
	vResult.z = ( Le - ( floor( vResult.w * 255.0 ) ) / 255.0 ) / 255.0;
	return vResult;
}
const mat3 cLogLuvInverseM = mat3( 6.0014, -2.7008, -1.7996, -1.3320, 3.1029, -5.7721, 0.3008, -1.0882, 5.6268 );
vec4 LogLuvToLinear( in vec4 value ) {
	float Le = value.z * 255.0 + value.w;
	vec3 Xp_Y_XYZp;
	Xp_Y_XYZp.y = exp2( ( Le - 127.0 ) / 2.0 );
	Xp_Y_XYZp.z = Xp_Y_XYZp.y / value.y;
	Xp_Y_XYZp.x = value.x * Xp_Y_XYZp.z;
	vec3 vRGB = cLogLuvInverseM * Xp_Y_XYZp.rgb;
	return vec4( max( vRGB, 0.0 ), 1.0 );
}\`,Mm=\`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 envColor = textureCubeUV( envMap, reflectVec, 0.0 );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifndef ENVMAP_TYPE_CUBE_UV
		envColor = envMapTexelToLinear( envColor );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif\`,_m=\`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform int maxMipLevel;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif\`,Sm=\`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif\`,Am=\`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) ||defined( PHONG )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif\`,Tm=\`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif\`,Em=\`#ifdef USE_FOG
	fogDepth = - mvPosition.z;
#endif\`,Cm=\`#ifdef USE_FOG
	varying float fogDepth;
#endif\`,Pm=\`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogDepth * fogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif\`,Lm=\`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float fogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif\`,Rm=\`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return texture2D( gradientMap, coord ).rgb;
	#else
		return ( coord.x < 0.7 ) ? vec3( 0.7 ) : vec3( 1.0 );
	#endif
}\`,zm=\`#ifdef USE_LIGHTMAP
	vec4 lightMapTexel= texture2D( lightMap, vUv2 );
	reflectedLight.indirectDiffuse += PI * lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
#endif\`,Dm=\`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif\`,Im=\`vec3 diffuse = vec3( 1.0 );
GeometricContext geometry;
geometry.position = mvPosition.xyz;
geometry.normal = normalize( transformedNormal );
geometry.viewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( -mvPosition.xyz );
GeometricContext backGeometry;
backGeometry.position = geometry.position;
backGeometry.normal = -geometry.normal;
backGeometry.viewDir = geometry.viewDir;
vLightFront = vec3( 0.0 );
vIndirectFront = vec3( 0.0 );
#ifdef DOUBLE_SIDED
	vLightBack = vec3( 0.0 );
	vIndirectBack = vec3( 0.0 );
#endif
IncidentLight directLight;
float dotNL;
vec3 directLightColor_Diffuse;
vIndirectFront += getAmbientLightIrradiance( ambientLightColor );
vIndirectFront += getLightProbeIrradiance( lightProbe, geometry );
#ifdef DOUBLE_SIDED
	vIndirectBack += getAmbientLightIrradiance( ambientLightColor );
	vIndirectBack += getLightProbeIrradiance( lightProbe, backGeometry );
#endif
#if NUM_POINT_LIGHTS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		getPointDirectLightIrradiance( pointLights[ i ], geometry, directLight );
		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;
		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;
		#ifdef DOUBLE_SIDED
			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;
		#endif
	}
	#pragma unroll_loop_end
#endif
#if NUM_SPOT_LIGHTS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		getSpotDirectLightIrradiance( spotLights[ i ], geometry, directLight );
		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;
		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;
		#ifdef DOUBLE_SIDED
			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;
		#endif
	}
	#pragma unroll_loop_end
#endif
#if NUM_DIR_LIGHTS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		getDirectionalDirectLightIrradiance( directionalLights[ i ], geometry, directLight );
		dotNL = dot( geometry.normal, directLight.direction );
		directLightColor_Diffuse = PI * directLight.color;
		vLightFront += saturate( dotNL ) * directLightColor_Diffuse;
		#ifdef DOUBLE_SIDED
			vLightBack += saturate( -dotNL ) * directLightColor_Diffuse;
		#endif
	}
	#pragma unroll_loop_end
#endif
#if NUM_HEMI_LIGHTS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
		vIndirectFront += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );
		#ifdef DOUBLE_SIDED
			vIndirectBack += getHemisphereLightIrradiance( hemisphereLights[ i ], backGeometry );
		#endif
	}
	#pragma unroll_loop_end
#endif\`,Fm=\`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
uniform vec3 lightProbe[ 9 ];
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in GeometricContext geometry ) {
	vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	#ifndef PHYSICALLY_CORRECT_LIGHTS
		irradiance *= PI;
	#endif
	return irradiance;
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalDirectLightIrradiance( const in DirectionalLight directionalLight, const in GeometricContext geometry, out IncidentLight directLight ) {
		directLight.color = directionalLight.color;
		directLight.direction = directionalLight.direction;
		directLight.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointDirectLightIrradiance( const in PointLight pointLight, const in GeometricContext geometry, out IncidentLight directLight ) {
		vec3 lVector = pointLight.position - geometry.position;
		directLight.direction = normalize( lVector );
		float lightDistance = length( lVector );
		directLight.color = pointLight.color;
		directLight.color *= punctualLightIntensityToIrradianceFactor( lightDistance, pointLight.distance, pointLight.decay );
		directLight.visible = ( directLight.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotDirectLightIrradiance( const in SpotLight spotLight, const in GeometricContext geometry, out IncidentLight directLight ) {
		vec3 lVector = spotLight.position - geometry.position;
		directLight.direction = normalize( lVector );
		float lightDistance = length( lVector );
		float angleCos = dot( directLight.direction, spotLight.direction );
		if ( angleCos > spotLight.coneCos ) {
			float spotEffect = smoothstep( spotLight.coneCos, spotLight.penumbraCos, angleCos );
			directLight.color = spotLight.color;
			directLight.color *= spotEffect * punctualLightIntensityToIrradianceFactor( lightDistance, spotLight.distance, spotLight.decay );
			directLight.visible = true;
		} else {
			directLight.color = vec3( 0.0 );
			directLight.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in GeometricContext geometry ) {
		float dotNL = dot( geometry.normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		#ifndef PHYSICALLY_CORRECT_LIGHTS
			irradiance *= PI;
		#endif
		return irradiance;
	}
#endif\`,Bm=\`#if defined( USE_ENVMAP )
	#ifdef ENVMAP_MODE_REFRACTION
		uniform float refractionRatio;
	#endif
	vec3 getLightProbeIndirectIrradiance( const in GeometricContext geometry, const in int maxMIPLevel ) {
		vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );
		#ifdef ENVMAP_TYPE_CUBE
			vec3 queryVec = vec3( flipEnvMap * worldNormal.x, worldNormal.yz );
			#ifdef TEXTURE_LOD_EXT
				vec4 envMapColor = textureCubeLodEXT( envMap, queryVec, float( maxMIPLevel ) );
			#else
				vec4 envMapColor = textureCube( envMap, queryVec, float( maxMIPLevel ) );
			#endif
			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;
		#elif defined( ENVMAP_TYPE_CUBE_UV )
			vec4 envMapColor = textureCubeUV( envMap, worldNormal, 1.0 );
		#else
			vec4 envMapColor = vec4( 0.0 );
		#endif
		return PI * envMapColor.rgb * envMapIntensity;
	}
	float getSpecularMIPLevel( const in float roughness, const in int maxMIPLevel ) {
		float maxMIPLevelScalar = float( maxMIPLevel );
		float sigma = PI * roughness * roughness / ( 1.0 + roughness );
		float desiredMIPLevel = maxMIPLevelScalar + log2( sigma );
		return clamp( desiredMIPLevel, 0.0, maxMIPLevelScalar );
	}
	vec3 getLightProbeIndirectRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in int maxMIPLevel ) {
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( -viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
		#else
			vec3 reflectVec = refract( -viewDir, normal, refractionRatio );
		#endif
		reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
		float specularMIPLevel = getSpecularMIPLevel( roughness, maxMIPLevel );
		#ifdef ENVMAP_TYPE_CUBE
			vec3 queryReflectVec = vec3( flipEnvMap * reflectVec.x, reflectVec.yz );
			#ifdef TEXTURE_LOD_EXT
				vec4 envMapColor = textureCubeLodEXT( envMap, queryReflectVec, specularMIPLevel );
			#else
				vec4 envMapColor = textureCube( envMap, queryReflectVec, specularMIPLevel );
			#endif
			envMapColor.rgb = envMapTexelToLinear( envMapColor ).rgb;
		#elif defined( ENVMAP_TYPE_CUBE_UV )
			vec4 envMapColor = textureCubeUV( envMap, reflectVec, roughness );
		#endif
		return envMapColor.rgb * envMapIntensity;
	}
#endif\`,km=\`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;\`,Nm=\`varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in GeometricContext geometry, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometry.normal, directLight.direction ) * directLight.color;
	#ifndef PHYSICALLY_CORRECT_LIGHTS
		irradiance *= PI;
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in GeometricContext geometry, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon
#define Material_LightProbeLOD( material )	(0)\`,Um=\`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;\`,Om=\`varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifndef PHYSICALLY_CORRECT_LIGHTS
		irradiance *= PI;
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_Specular_BlinnPhong( directLight, geometry, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in GeometricContext geometry, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong
#define Material_LightProbeLOD( material )	(0)\`,Gm=\`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( geometryNormal ) ), abs( dFdy( geometryNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.specularRoughness = max( roughnessFactor, 0.0525 );material.specularRoughness += geometryRoughness;
material.specularRoughness = min( material.specularRoughness, 1.0 );
#ifdef REFLECTIVITY
	material.specularColor = mix( vec3( MAXIMUM_SPECULAR_COEFFICIENT * pow2( reflectivity ) ), diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( DEFAULT_SPECULAR_COEFFICIENT ), diffuseColor.rgb, metalnessFactor );
#endif
#ifdef CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheen;
#endif\`,Wm=\`struct PhysicalMaterial {
	vec3 diffuseColor;
	float specularRoughness;
	vec3 specularColor;
#ifdef CLEARCOAT
	float clearcoat;
	float clearcoatRoughness;
#endif
#ifdef USE_SHEEN
	vec3 sheenColor;
#endif
};
#define MAXIMUM_SPECULAR_COEFFICIENT 0.16
#define DEFAULT_SPECULAR_COEFFICIENT 0.04
float clearcoatDHRApprox( const in float roughness, const in float dotNL ) {
	return DEFAULT_SPECULAR_COEFFICIENT + ( 1.0 - DEFAULT_SPECULAR_COEFFICIENT ) * ( pow( 1.0 - dotNL, 5.0 ) * pow( 1.0 - roughness, 2.0 ) );
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometry.normal;
		vec3 viewDir = geometry.viewDir;
		vec3 position = geometry.position;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.specularRoughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometry.normal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifndef PHYSICALLY_CORRECT_LIGHTS
		irradiance *= PI;
	#endif
	#ifdef CLEARCOAT
		float ccDotNL = saturate( dot( geometry.clearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = ccDotNL * directLight.color;
		#ifndef PHYSICALLY_CORRECT_LIGHTS
			ccIrradiance *= PI;
		#endif
		float clearcoatDHR = material.clearcoat * clearcoatDHRApprox( material.clearcoatRoughness, ccDotNL );
		reflectedLight.directSpecular += ccIrradiance * material.clearcoat * BRDF_Specular_GGX( directLight, geometry.viewDir, geometry.clearcoatNormal, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearcoatRoughness );
	#else
		float clearcoatDHR = 0.0;
	#endif
	#ifdef USE_SHEEN
		reflectedLight.directSpecular += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_Sheen(
			material.specularRoughness,
			directLight.direction,
			geometry,
			material.sheenColor
		);
	#else
		reflectedLight.directSpecular += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Specular_GGX( directLight, geometry.viewDir, geometry.normal, material.specularColor, material.specularRoughness);
	#endif
	reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef CLEARCOAT
		float ccDotNV = saturate( dot( geometry.clearcoatNormal, geometry.viewDir ) );
		reflectedLight.indirectSpecular += clearcoatRadiance * material.clearcoat * BRDF_Specular_GGX_Environment( geometry.viewDir, geometry.clearcoatNormal, vec3( DEFAULT_SPECULAR_COEFFICIENT ), material.clearcoatRoughness );
		float ccDotNL = ccDotNV;
		float clearcoatDHR = material.clearcoat * clearcoatDHRApprox( material.clearcoatRoughness, ccDotNL );
	#else
		float clearcoatDHR = 0.0;
	#endif
	float clearcoatInv = 1.0 - clearcoatDHR;
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	BRDF_Specular_Multiscattering_Environment( geometry, material.specularColor, material.specularRoughness, singleScattering, multiScattering );
	vec3 diffuse = material.diffuseColor * ( 1.0 - ( singleScattering + multiScattering ) );
	reflectedLight.indirectSpecular += clearcoatInv * radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}\`,Vm=\`
GeometricContext geometry;
geometry.position = - vViewPosition;
geometry.normal = normal;
geometry.viewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
#ifdef CLEARCOAT
	geometry.clearcoatNormal = clearcoatNormal;
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointDirectLightIrradiance( pointLight, geometry, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotDirectLightIrradiance( spotLight, geometry, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometry, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	irradiance += getLightProbeIrradiance( lightProbe, geometry );
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif\`,Hm=\`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel= texture2D( lightMap, vUv2 );
		vec3 lightMapIrradiance = lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
		#ifndef PHYSICALLY_CORRECT_LIGHTS
			lightMapIrradiance *= PI;
		#endif
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getLightProbeIndirectIrradiance( geometry, maxMipLevel );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	radiance += getLightProbeIndirectRadiance( geometry.viewDir, geometry.normal, material.specularRoughness, maxMipLevel );
	#ifdef CLEARCOAT
		clearcoatRadiance += getLightProbeIndirectRadiance( geometry.viewDir, geometry.clearcoatNormal, material.clearcoatRoughness, maxMipLevel );
	#endif
#endif\`,qm=\`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometry, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometry, material, reflectedLight );
#endif\`,Xm=\`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	gl_FragDepthEXT = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif\`,Ym=\`#if defined( USE_LOGDEPTHBUF ) && defined( USE_LOGDEPTHBUF_EXT )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif\`,Zm=\`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		varying float vFragDepth;
		varying float vIsPerspective;
	#else
		uniform float logDepthBufFC;
	#endif
#endif\`,jm=\`#ifdef USE_LOGDEPTHBUF
	#ifdef USE_LOGDEPTHBUF_EXT
		vFragDepth = 1.0 + gl_Position.w;
		vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
	#else
		if ( isPerspectiveMatrix( projectionMatrix ) ) {
			gl_Position.z = log2( max( EPSILON, gl_Position.w + 1.0 ) ) * logDepthBufFC - 1.0;
			gl_Position.z *= gl_Position.w;
		}
	#endif
#endif\`,Jm=\`#ifdef USE_MAP
	vec4 texelColor = texture2D( map, vUv );
	texelColor = mapTexelToLinear( texelColor );
	diffuseColor *= texelColor;
#endif\`,$m=\`#ifdef USE_MAP
	uniform sampler2D map;
#endif\`,Km=\`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
#endif
#ifdef USE_MAP
	vec4 mapTexel = texture2D( map, uv );
	diffuseColor *= mapTexelToLinear( mapTexel );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif\`,Qm=\`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	uniform mat3 uvTransform;
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif\`,eg=\`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vUv );
	metalnessFactor *= texelMetalness.b;
#endif\`,tg=\`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif\`,ng=\`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	objectNormal += morphNormal0 * morphTargetInfluences[ 0 ];
	objectNormal += morphNormal1 * morphTargetInfluences[ 1 ];
	objectNormal += morphNormal2 * morphTargetInfluences[ 2 ];
	objectNormal += morphNormal3 * morphTargetInfluences[ 3 ];
#endif\`,ig=\`#ifdef USE_MORPHTARGETS
	uniform float morphTargetBaseInfluence;
	#ifndef USE_MORPHNORMALS
		uniform float morphTargetInfluences[ 8 ];
	#else
		uniform float morphTargetInfluences[ 4 ];
	#endif
#endif\`,rg=\`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	transformed += morphTarget0 * morphTargetInfluences[ 0 ];
	transformed += morphTarget1 * morphTargetInfluences[ 1 ];
	transformed += morphTarget2 * morphTargetInfluences[ 2 ];
	transformed += morphTarget3 * morphTargetInfluences[ 3 ];
	#ifndef USE_MORPHNORMALS
		transformed += morphTarget4 * morphTargetInfluences[ 4 ];
		transformed += morphTarget5 * morphTargetInfluences[ 5 ];
		transformed += morphTarget6 * morphTargetInfluences[ 6 ];
		transformed += morphTarget7 * morphTargetInfluences[ 7 ];
	#endif
#endif\`,sg=\`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = vec3( dFdx( vViewPosition.x ), dFdx( vViewPosition.y ), dFdx( vViewPosition.z ) );
	vec3 fdy = vec3( dFdy( vViewPosition.x ), dFdy( vViewPosition.y ), dFdy( vViewPosition.z ) );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	#ifdef USE_TANGENT
		vec3 tangent = normalize( vTangent );
		vec3 bitangent = normalize( vBitangent );
		#ifdef DOUBLE_SIDED
			tangent = tangent * faceDirection;
			bitangent = bitangent * faceDirection;
		#endif
		#if defined( TANGENTSPACE_NORMALMAP ) || defined( USE_CLEARCOAT_NORMALMAP )
			mat3 vTBN = mat3( tangent, bitangent, normal );
		#endif
	#endif
#endif
vec3 geometryNormal = normal;\`,ag=\`#ifdef OBJECTSPACE_NORMALMAP
	normal = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( TANGENTSPACE_NORMALMAP )
	vec3 mapN = texture2D( normalMap, vUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	#ifdef USE_TANGENT
		normal = normalize( vTBN * mapN );
	#else
		normal = perturbNormal2Arb( -vViewPosition, normal, mapN, faceDirection );
	#endif
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( -vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif\`,og=\`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef OBJECTSPACE_NORMALMAP
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( TANGENTSPACE_NORMALMAP ) || defined ( USE_CLEARCOAT_NORMALMAP ) )
	vec3 perturbNormal2Arb( vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection ) {
		vec3 q0 = vec3( dFdx( eye_pos.x ), dFdx( eye_pos.y ), dFdx( eye_pos.z ) );
		vec3 q1 = vec3( dFdy( eye_pos.x ), dFdy( eye_pos.y ), dFdy( eye_pos.z ) );
		vec2 st0 = dFdx( vUv.st );
		vec2 st1 = dFdy( vUv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : faceDirection * inversesqrt( det );
		return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );
	}
#endif\`,lg=\`#ifdef CLEARCOAT
	vec3 clearcoatNormal = geometryNormal;
#endif\`,cg=\`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	#ifdef USE_TANGENT
		clearcoatNormal = normalize( vTBN * clearcoatMapN );
	#else
		clearcoatNormal = perturbNormal2Arb( - vViewPosition, clearcoatNormal, clearcoatMapN, faceDirection );
	#endif
#endif\`,ug=\`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif\`,hg=\`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256., 256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );
const float ShiftRight8 = 1. / 256.;
vec4 packDepthToRGBA( const in float v ) {
	vec4 r = vec4( fract( v * PackFactors ), v );
	r.yzw -= r.xyz * ShiftRight8;	return r * PackUpscale;
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors );
}
vec4 pack2HalfToRGBA( vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ));
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w);
}
vec2 unpackRGBATo2Half( vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float linearClipZ, const in float near, const in float far ) {
	return linearClipZ * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return (( near + viewZ ) * far ) / (( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float invClipZ, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * invClipZ - far );
}\`,dg=\`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif\`,fg=\`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;\`,pg=\`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif\`,mg=\`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif\`,gg=\`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vUv );
	roughnessFactor *= texelRoughness.g;
#endif\`,vg=\`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif\`,xg=\`#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		varying vec4 vSpotShadowCoord[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
		bool inFrustum = all( inFrustumVec );
		bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );
		bool frustumTest = all( frustumTestVec );
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ), 
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ), 
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ), 
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ), 
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ), 
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ), 
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return shadow;
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
		vec3 lightToPosition = shadowCoord.xyz;
		float dp = ( length( lightToPosition ) - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );		dp += shadowBias;
		vec3 bd3D = normalize( lightToPosition );
		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
			vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
			return (
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
				texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
			) * ( 1.0 / 9.0 );
		#else
			return texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
		#endif
	}
#endif\`,yg=\`#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform mat4 spotShadowMatrix[ NUM_SPOT_LIGHT_SHADOWS ];
		varying vec4 vSpotShadowCoord[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif\`,bg=\`#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SPOT_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0
		vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		vec4 shadowWorldPosition;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
		vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias, 0 );
		vSpotShadowCoord[ i ] = spotShadowMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
		vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
	#endif
#endif\`,wg=\`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowBias, spotLight.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}\`,Mg=\`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif\`,_g=\`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	#ifdef BONE_TEXTURE
		uniform highp sampler2D boneTexture;
		uniform int boneTextureSize;
		mat4 getBoneMatrix( const in float i ) {
			float j = i * 4.0;
			float x = mod( j, float( boneTextureSize ) );
			float y = floor( j / float( boneTextureSize ) );
			float dx = 1.0 / float( boneTextureSize );
			float dy = 1.0 / float( boneTextureSize );
			y = dy * ( y + 0.5 );
			vec4 v1 = texture2D( boneTexture, vec2( dx * ( x + 0.5 ), y ) );
			vec4 v2 = texture2D( boneTexture, vec2( dx * ( x + 1.5 ), y ) );
			vec4 v3 = texture2D( boneTexture, vec2( dx * ( x + 2.5 ), y ) );
			vec4 v4 = texture2D( boneTexture, vec2( dx * ( x + 3.5 ), y ) );
			mat4 bone = mat4( v1, v2, v3, v4 );
			return bone;
		}
	#else
		uniform mat4 boneMatrices[ MAX_BONES ];
		mat4 getBoneMatrix( const in float i ) {
			mat4 bone = boneMatrices[ int(i) ];
			return bone;
		}
	#endif
#endif\`,Sg=\`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif\`,Ag=\`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif\`,Tg=\`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif\`,Eg=\`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif\`,Cg=\`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif\`,Pg=\`#ifndef saturate
#define saturate(a) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return toneMappingExposure * color;
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 OptimizedCineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
vec3 CustomToneMapping( vec3 color ) { return color; }\`,Lg=\`#ifdef USE_TRANSMISSIONMAP
	totalTransmission *= texture2D( transmissionMap, vUv ).r;
#endif\`,Rg=\`#ifdef USE_TRANSMISSIONMAP
	uniform sampler2D transmissionMap;
#endif\`,zg=\`#if ( defined( USE_UV ) && ! defined( UVS_VERTEX_ONLY ) )
	varying vec2 vUv;
#endif\`,Dg=\`#ifdef USE_UV
	#ifdef UVS_VERTEX_ONLY
		vec2 vUv;
	#else
		varying vec2 vUv;
	#endif
	uniform mat3 uvTransform;
#endif\`,Ig=\`#ifdef USE_UV
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
#endif\`,Fg=\`#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
	varying vec2 vUv2;
#endif\`,Bg=\`#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
	attribute vec2 uv2;
	varying vec2 vUv2;
	uniform mat3 uv2Transform;
#endif\`,kg=\`#if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
	vUv2 = ( uv2Transform * vec3( uv2, 1 ) ).xy;
#endif\`,Ng=\`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif\`,Ug=\`uniform sampler2D t2D;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	gl_FragColor = mapTexelToLinear( texColor );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}\`,Og=\`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}\`,Gg=\`#include <envmap_common_pars_fragment>
uniform float opacity;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	vec3 vReflect = vWorldDirection;
	#include <envmap_fragment>
	gl_FragColor = envColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}\`,Wg=\`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}\`,Vg=\`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#endif
}\`,Hg=\`#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}\`,qg=\`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( 1.0 );
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}\`,Xg=\`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <skinbase_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}\`,Yg=\`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	vec4 texColor = texture2D( tEquirect, sampleUV );
	gl_FragColor = mapTexelToLinear( texColor );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
}\`,Zg=\`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}\`,jg=\`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}\`,Jg=\`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <color_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}\`,$g=\`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
	
		vec4 lightMapTexel= texture2D( lightMap, vUv2 );
		reflectedLight.indirectDiffuse += lightMapTexelToLinear( lightMapTexel ).rgb * lightMapIntensity;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,Kg=\`#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <skinbase_vertex>
	#ifdef USE_ENVMAP
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}\`,Qg=\`uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
varying vec3 vLightFront;
varying vec3 vIndirectFront;
#ifdef DOUBLE_SIDED
	varying vec3 vLightBack;
	varying vec3 vIndirectBack;
#endif
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <fog_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>
	#include <emissivemap_fragment>
	#ifdef DOUBLE_SIDED
		reflectedLight.indirectDiffuse += ( gl_FrontFacing ) ? vIndirectFront : vIndirectBack;
	#else
		reflectedLight.indirectDiffuse += vIndirectFront;
	#endif
	#include <lightmap_fragment>
	reflectedLight.indirectDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb );
	#ifdef DOUBLE_SIDED
		reflectedLight.directDiffuse = ( gl_FrontFacing ) ? vLightFront : vLightBack;
	#else
		reflectedLight.directDiffuse = vLightFront;
	#endif
	reflectedLight.directDiffuse *= BRDF_Diffuse_Lambert( diffuseColor.rgb ) * getShadowMask();
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,ev=\`#define LAMBERT
varying vec3 vLightFront;
varying vec3 vIndirectFront;
#ifdef DOUBLE_SIDED
	varying vec3 vLightBack;
	varying vec3 vIndirectBack;
#endif
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <bsdfs>
#include <lights_pars_begin>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <lights_lambert_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}\`,tv=\`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <fog_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
		matcapColor = matcapTexelToLinear( matcapColor );
	#else
		vec4 matcapColor = vec4( 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,nv=\`#define MATCAP
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#ifndef FLAT_SHADED
		vNormal = normalize( transformedNormal );
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}\`,iv=\`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,rv=\`#define TOON
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}\`,sv=\`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,av=\`#define PHONG
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}\`,ov=\`#define STANDARD
#ifdef PHYSICAL
	#define REFLECTIVITY
	#define CLEARCOAT
	#define TRANSMISSION
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef TRANSMISSION
	uniform float transmission;
#endif
#ifdef REFLECTIVITY
	uniform float reflectivity;
#endif
#ifdef CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheen;
#endif
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <uv2_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <transmissionmap_pars_fragment>
#include <bsdfs>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <lights_physical_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec4 diffuseColor = vec4( diffuse, opacity );
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#ifdef TRANSMISSION
		float totalTransmission = transmission;
	#endif
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <transmissionmap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#ifdef TRANSMISSION
		diffuseColor.a *= mix( saturate( 1. - totalTransmission + linearToRelativeLuminance( reflectedLight.directSpecular + reflectedLight.indirectSpecular ) ), 1.0, metalness );
	#endif
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}\`,lv=\`#define STANDARD
varying vec3 vViewPosition;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}\`,cv=\`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
	varying vec3 vViewPosition;
#endif
#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif
#include <packing>
#include <uv_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), opacity );
}\`,uv=\`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
	varying vec3 vViewPosition;
#endif
#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( TANGENTSPACE_NORMALMAP )
	vViewPosition = - mvPosition.xyz;
#endif
}\`,hv=\`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	outgoingLight = diffuseColor.rgb;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}\`,dv=\`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <color_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}\`,fv=\`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
}\`,pv=\`#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <begin_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}\`,mv=\`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	outgoingLight = diffuseColor.rgb;
	gl_FragColor = vec4( outgoingLight, diffuseColor.a );
	#include <tonemapping_fragment>
	#include <encodings_fragment>
	#include <fog_fragment>
}\`,gv=\`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	vec2 scale;
	scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
	scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}\`,Et={alphamap_fragment:J0,alphamap_pars_fragment:$0,alphatest_fragment:K0,aomap_fragment:Q0,aomap_pars_fragment:em,begin_vertex:tm,beginnormal_vertex:nm,bsdfs:im,bumpmap_pars_fragment:rm,clipping_planes_fragment:sm,clipping_planes_pars_fragment:am,clipping_planes_pars_vertex:om,clipping_planes_vertex:lm,color_fragment:cm,color_pars_fragment:um,color_pars_vertex:hm,color_vertex:dm,common:fm,cube_uv_reflection_fragment:pm,defaultnormal_vertex:mm,displacementmap_pars_vertex:gm,displacementmap_vertex:vm,emissivemap_fragment:xm,emissivemap_pars_fragment:ym,encodings_fragment:bm,encodings_pars_fragment:wm,envmap_fragment:Mm,envmap_common_pars_fragment:_m,envmap_pars_fragment:Sm,envmap_pars_vertex:Am,envmap_physical_pars_fragment:Bm,envmap_vertex:Tm,fog_vertex:Em,fog_pars_vertex:Cm,fog_fragment:Pm,fog_pars_fragment:Lm,gradientmap_pars_fragment:Rm,lightmap_fragment:zm,lightmap_pars_fragment:Dm,lights_lambert_vertex:Im,lights_pars_begin:Fm,lights_toon_fragment:km,lights_toon_pars_fragment:Nm,lights_phong_fragment:Um,lights_phong_pars_fragment:Om,lights_physical_fragment:Gm,lights_physical_pars_fragment:Wm,lights_fragment_begin:Vm,lights_fragment_maps:Hm,lights_fragment_end:qm,logdepthbuf_fragment:Xm,logdepthbuf_pars_fragment:Ym,logdepthbuf_pars_vertex:Zm,logdepthbuf_vertex:jm,map_fragment:Jm,map_pars_fragment:$m,map_particle_fragment:Km,map_particle_pars_fragment:Qm,metalnessmap_fragment:eg,metalnessmap_pars_fragment:tg,morphnormal_vertex:ng,morphtarget_pars_vertex:ig,morphtarget_vertex:rg,normal_fragment_begin:sg,normal_fragment_maps:ag,normalmap_pars_fragment:og,clearcoat_normal_fragment_begin:lg,clearcoat_normal_fragment_maps:cg,clearcoat_pars_fragment:ug,packing:hg,premultiplied_alpha_fragment:dg,project_vertex:fg,dithering_fragment:pg,dithering_pars_fragment:mg,roughnessmap_fragment:gg,roughnessmap_pars_fragment:vg,shadowmap_pars_fragment:xg,shadowmap_pars_vertex:yg,shadowmap_vertex:bg,shadowmask_pars_fragment:wg,skinbase_vertex:Mg,skinning_pars_vertex:_g,skinning_vertex:Sg,skinnormal_vertex:Ag,specularmap_fragment:Tg,specularmap_pars_fragment:Eg,tonemapping_fragment:Cg,tonemapping_pars_fragment:Pg,transmissionmap_fragment:Lg,transmissionmap_pars_fragment:Rg,uv_pars_fragment:zg,uv_pars_vertex:Dg,uv_vertex:Ig,uv2_pars_fragment:Fg,uv2_pars_vertex:Bg,uv2_vertex:kg,worldpos_vertex:Ng,background_frag:Ug,background_vert:Og,cube_frag:Gg,cube_vert:Wg,depth_frag:Vg,depth_vert:Hg,distanceRGBA_frag:qg,distanceRGBA_vert:Xg,equirect_frag:Yg,equirect_vert:Zg,linedashed_frag:jg,linedashed_vert:Jg,meshbasic_frag:$g,meshbasic_vert:Kg,meshlambert_frag:Qg,meshlambert_vert:ev,meshmatcap_frag:tv,meshmatcap_vert:nv,meshtoon_frag:iv,meshtoon_vert:rv,meshphong_frag:sv,meshphong_vert:av,meshphysical_frag:ov,meshphysical_vert:lv,normal_frag:cv,normal_vert:uv,points_frag:hv,points_vert:dv,shadow_frag:fv,shadow_vert:pv,sprite_frag:mv,sprite_vert:gv},lt={common:{diffuse:{value:new ut(15658734)},opacity:{value:1},map:{value:null},uvTransform:{value:new Vt},uv2Transform:{value:new Vt},alphaMap:{value:null}},specularmap:{specularMap:{value:null}},envmap:{envMap:{value:null},flipEnvMap:{value:-1},reflectivity:{value:1},refractionRatio:{value:.98},maxMipLevel:{value:0}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1}},emissivemap:{emissiveMap:{value:null}},bumpmap:{bumpMap:{value:null},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalScale:{value:new Je(1,1)}},displacementmap:{displacementMap:{value:null},displacementScale:{value:1},displacementBias:{value:0}},roughnessmap:{roughnessMap:{value:null}},metalnessmap:{metalnessMap:{value:null}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ut(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotShadowMap:{value:[]},spotShadowMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new ut(15658734)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},uvTransform:{value:new Vt}},sprite:{diffuse:{value:new ut(15658734)},opacity:{value:1},center:{value:new Je(.5,.5)},rotation:{value:0},map:{value:null},alphaMap:{value:null},uvTransform:{value:new Vt}}},Cn={basic:{uniforms:rn([lt.common,lt.specularmap,lt.envmap,lt.aomap,lt.lightmap,lt.fog]),vertexShader:Et.meshbasic_vert,fragmentShader:Et.meshbasic_frag},lambert:{uniforms:rn([lt.common,lt.specularmap,lt.envmap,lt.aomap,lt.lightmap,lt.emissivemap,lt.fog,lt.lights,{emissive:{value:new ut(0)}}]),vertexShader:Et.meshlambert_vert,fragmentShader:Et.meshlambert_frag},phong:{uniforms:rn([lt.common,lt.specularmap,lt.envmap,lt.aomap,lt.lightmap,lt.emissivemap,lt.bumpmap,lt.normalmap,lt.displacementmap,lt.fog,lt.lights,{emissive:{value:new ut(0)},specular:{value:new ut(1118481)},shininess:{value:30}}]),vertexShader:Et.meshphong_vert,fragmentShader:Et.meshphong_frag},standard:{uniforms:rn([lt.common,lt.envmap,lt.aomap,lt.lightmap,lt.emissivemap,lt.bumpmap,lt.normalmap,lt.displacementmap,lt.roughnessmap,lt.metalnessmap,lt.fog,lt.lights,{emissive:{value:new ut(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Et.meshphysical_vert,fragmentShader:Et.meshphysical_frag},toon:{uniforms:rn([lt.common,lt.aomap,lt.lightmap,lt.emissivemap,lt.bumpmap,lt.normalmap,lt.displacementmap,lt.gradientmap,lt.fog,lt.lights,{emissive:{value:new ut(0)}}]),vertexShader:Et.meshtoon_vert,fragmentShader:Et.meshtoon_frag},matcap:{uniforms:rn([lt.common,lt.bumpmap,lt.normalmap,lt.displacementmap,lt.fog,{matcap:{value:null}}]),vertexShader:Et.meshmatcap_vert,fragmentShader:Et.meshmatcap_frag},points:{uniforms:rn([lt.points,lt.fog]),vertexShader:Et.points_vert,fragmentShader:Et.points_frag},dashed:{uniforms:rn([lt.common,lt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Et.linedashed_vert,fragmentShader:Et.linedashed_frag},depth:{uniforms:rn([lt.common,lt.displacementmap]),vertexShader:Et.depth_vert,fragmentShader:Et.depth_frag},normal:{uniforms:rn([lt.common,lt.bumpmap,lt.normalmap,lt.displacementmap,{opacity:{value:1}}]),vertexShader:Et.normal_vert,fragmentShader:Et.normal_frag},sprite:{uniforms:rn([lt.sprite,lt.fog]),vertexShader:Et.sprite_vert,fragmentShader:Et.sprite_frag},background:{uniforms:{uvTransform:{value:new Vt},t2D:{value:null}},vertexShader:Et.background_vert,fragmentShader:Et.background_frag},cube:{uniforms:rn([lt.envmap,{opacity:{value:1}}]),vertexShader:Et.cube_vert,fragmentShader:Et.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Et.equirect_vert,fragmentShader:Et.equirect_frag},distanceRGBA:{uniforms:rn([lt.common,lt.displacementmap,{referencePosition:{value:new Y},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Et.distanceRGBA_vert,fragmentShader:Et.distanceRGBA_frag},shadow:{uniforms:rn([lt.lights,lt.fog,{color:{value:new ut(0)},opacity:{value:1}}]),vertexShader:Et.shadow_vert,fragmentShader:Et.shadow_frag}};Cn.physical={uniforms:rn([Cn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatNormalScale:{value:new Je(1,1)},clearcoatNormalMap:{value:null},sheen:{value:new ut(0)},transmission:{value:0},transmissionMap:{value:null}}]),vertexShader:Et.meshphysical_vert,fragmentShader:Et.meshphysical_frag};function vv(s,e,t,n,i){let r=new ut(0),a=0,o,c,l=null,h=0,u=null;function d(p,y,x,v){let g=y.isScene===!0?y.background:null;g&&g.isTexture&&(g=e.get(g));let m=s.xr,S=m.getSession&&m.getSession();S&&S.environmentBlendMode==="additive"&&(g=null),g===null?f(r,a):g&&g.isColor&&(f(g,1),v=!0),(s.autoClear||v)&&s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil),g&&(g.isCubeTexture||g.mapping===Qr)?(c===void 0&&(c=new Ot(new vi(1,1,1),new Rn({name:"BackgroundCubeMaterial",uniforms:Dr(Cn.cube.uniforms),vertexShader:Cn.cube.vertexShader,fragmentShader:Cn.cube.fragmentShader,side:Ht,depthTest:!1,depthWrite:!1,fog:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(w,b,F){this.matrixWorld.copyPosition(F.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=g,c.material.uniforms.flipEnvMap.value=g.isCubeTexture&&g._needsFlipEnvMap?-1:1,(l!==g||h!==g.version||u!==s.toneMapping)&&(c.material.needsUpdate=!0,l=g,h=g.version,u=s.toneMapping),p.unshift(c,c.geometry,c.material,0,0,null)):g&&g.isTexture&&(o===void 0&&(o=new Ot(new Br(2,2),new Rn({name:"BackgroundMaterial",uniforms:Dr(Cn.background.uniforms),vertexShader:Cn.background.vertexShader,fragmentShader:Cn.background.fragmentShader,side:Kr,depthTest:!1,depthWrite:!1,fog:!1})),o.geometry.deleteAttribute("normal"),Object.defineProperty(o.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(o)),o.material.uniforms.t2D.value=g,g.matrixAutoUpdate===!0&&g.updateMatrix(),o.material.uniforms.uvTransform.value.copy(g.matrix),(l!==g||h!==g.version||u!==s.toneMapping)&&(o.material.needsUpdate=!0,l=g,h=g.version,u=s.toneMapping),p.unshift(o,o.geometry,o.material,0,0,null))}function f(p,y){t.buffers.color.setClear(p.r,p.g,p.b,y,i)}return{getClearColor:function(){return r},setClearColor:function(p,y=1){r.set(p),a=y,f(r,a)},getClearAlpha:function(){return a},setClearAlpha:function(p){a=p,f(r,a)},render:d}}function xv(s,e,t,n){let i=s.getParameter(34921),r=n.isWebGL2?null:e.get("OES_vertex_array_object"),a=n.isWebGL2||r!==null,o={},c=y(null),l=c;function h(z,D,C,I,K){let G=!1;if(a){let oe=p(I,C,D);l!==oe&&(l=oe,d(l.object)),G=x(I,K),G&&v(I,K)}else{let oe=D.wireframe===!0;(l.geometry!==I.id||l.program!==C.id||l.wireframe!==oe)&&(l.geometry=I.id,l.program=C.id,l.wireframe=oe,G=!0)}z.isInstancedMesh===!0&&(G=!0),K!==null&&t.update(K,34963),G&&(F(z,D,C,I),K!==null&&s.bindBuffer(34963,t.get(K).buffer))}function u(){return n.isWebGL2?s.createVertexArray():r.createVertexArrayOES()}function d(z){return n.isWebGL2?s.bindVertexArray(z):r.bindVertexArrayOES(z)}function f(z){return n.isWebGL2?s.deleteVertexArray(z):r.deleteVertexArrayOES(z)}function p(z,D,C){let I=C.wireframe===!0,K=o[z.id];K===void 0&&(K={},o[z.id]=K);let G=K[D.id];G===void 0&&(G={},K[D.id]=G);let oe=G[I];return oe===void 0&&(oe=y(u()),G[I]=oe),oe}function y(z){let D=[],C=[],I=[];for(let K=0;K<i;K++)D[K]=0,C[K]=0,I[K]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:C,attributeDivisors:I,object:z,attributes:{},index:null}}function x(z,D){let C=l.attributes,I=z.attributes,K=0;for(let G in I){let oe=C[G],le=I[G];if(oe===void 0||oe.attribute!==le||oe.data!==le.data)return!0;K++}return l.attributesNum!==K||l.index!==D}function v(z,D){let C={},I=z.attributes,K=0;for(let G in I){let oe=I[G],le={};le.attribute=oe,oe.data&&(le.data=oe.data),C[G]=le,K++}l.attributes=C,l.attributesNum=K,l.index=D}function g(){let z=l.newAttributes;for(let D=0,C=z.length;D<C;D++)z[D]=0}function m(z){S(z,0)}function S(z,D){let C=l.newAttributes,I=l.enabledAttributes,K=l.attributeDivisors;C[z]=1,I[z]===0&&(s.enableVertexAttribArray(z),I[z]=1),K[z]!==D&&((n.isWebGL2?s:e.get("ANGLE_instanced_arrays"))[n.isWebGL2?"vertexAttribDivisor":"vertexAttribDivisorANGLE"](z,D),K[z]=D)}function w(){let z=l.newAttributes,D=l.enabledAttributes;for(let C=0,I=D.length;C<I;C++)D[C]!==z[C]&&(s.disableVertexAttribArray(C),D[C]=0)}function b(z,D,C,I,K,G){n.isWebGL2===!0&&(C===5124||C===5125)?s.vertexAttribIPointer(z,D,C,K,G):s.vertexAttribPointer(z,D,C,I,K,G)}function F(z,D,C,I){if(n.isWebGL2===!1&&(z.isInstancedMesh||I.isInstancedBufferGeometry)&&e.get("ANGLE_instanced_arrays")===null)return;g();let K=I.attributes,G=C.getAttributes(),oe=D.defaultAttributeValues;for(let le in G){let M=G[le];if(M>=0){let q=K[le];if(q!==void 0){let se=q.normalized,X=q.itemSize,pe=t.get(q);if(pe===void 0)continue;let ve=pe.buffer,fe=pe.type,J=pe.bytesPerElement;if(q.isInterleavedBufferAttribute){let k=q.data,ne=k.stride,ce=q.offset;k&&k.isInstancedInterleavedBuffer?(S(M,k.meshPerAttribute),I._maxInstanceCount===void 0&&(I._maxInstanceCount=k.meshPerAttribute*k.count)):m(M),s.bindBuffer(34962,ve),b(M,X,fe,se,ne*J,ce*J)}else q.isInstancedBufferAttribute?(S(M,q.meshPerAttribute),I._maxInstanceCount===void 0&&(I._maxInstanceCount=q.meshPerAttribute*q.count)):m(M),s.bindBuffer(34962,ve),b(M,X,fe,se,0,0)}else if(le==="instanceMatrix"){let se=t.get(z.instanceMatrix);if(se===void 0)continue;let X=se.buffer,pe=se.type;S(M+0,1),S(M+1,1),S(M+2,1),S(M+3,1),s.bindBuffer(34962,X),s.vertexAttribPointer(M+0,4,pe,!1,64,0),s.vertexAttribPointer(M+1,4,pe,!1,64,16),s.vertexAttribPointer(M+2,4,pe,!1,64,32),s.vertexAttribPointer(M+3,4,pe,!1,64,48)}else if(le==="instanceColor"){let se=t.get(z.instanceColor);if(se===void 0)continue;let X=se.buffer,pe=se.type;S(M,1),s.bindBuffer(34962,X),s.vertexAttribPointer(M,3,pe,!1,12,0)}else if(oe!==void 0){let se=oe[le];if(se!==void 0)switch(se.length){case 2:s.vertexAttrib2fv(M,se);break;case 3:s.vertexAttrib3fv(M,se);break;case 4:s.vertexAttrib4fv(M,se);break;default:s.vertexAttrib1fv(M,se)}}}}w()}function L(){_();for(let z in o){let D=o[z];for(let C in D){let I=D[C];for(let K in I)f(I[K].object),delete I[K];delete D[C]}delete o[z]}}function O(z){if(o[z.id]===void 0)return;let D=o[z.id];for(let C in D){let I=D[C];for(let K in I)f(I[K].object),delete I[K];delete D[C]}delete o[z.id]}function ae(z){for(let D in o){let C=o[D];if(C[z.id]===void 0)continue;let I=C[z.id];for(let K in I)f(I[K].object),delete I[K];delete C[z.id]}}function _(){E(),l!==c&&(l=c,d(l.object))}function E(){c.geometry=null,c.program=null,c.wireframe=!1}return{setup:h,reset:_,resetDefaultState:E,dispose:L,releaseStatesOfGeometry:O,releaseStatesOfProgram:ae,initAttributes:g,enableAttribute:m,disableUnusedAttributes:w}}function yv(s,e,t,n){let i=n.isWebGL2,r;function a(l){r=l}function o(l,h){s.drawArrays(r,l,h),t.update(h,r,1)}function c(l,h,u){if(u===0)return;let d,f;if(i)d=s,f="drawArraysInstanced";else if(d=e.get("ANGLE_instanced_arrays"),f="drawArraysInstancedANGLE",d===null){console.error("THREE.WebGLBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}d[f](r,l,h,u),t.update(h,r,u)}this.setMode=a,this.render=o,this.renderInstances=c}function bv(s,e,t){let n;function i(){if(n!==void 0)return n;if(e.has("EXT_texture_filter_anisotropic")===!0){let b=e.get("EXT_texture_filter_anisotropic");n=s.getParameter(b.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else n=0;return n}function r(b){if(b==="highp"){if(s.getShaderPrecisionFormat(35633,36338).precision>0&&s.getShaderPrecisionFormat(35632,36338).precision>0)return"highp";b="mediump"}return b==="mediump"&&s.getShaderPrecisionFormat(35633,36337).precision>0&&s.getShaderPrecisionFormat(35632,36337).precision>0?"mediump":"lowp"}let a=typeof WebGL2RenderingContext<"u"&&s instanceof WebGL2RenderingContext||typeof WebGL2ComputeRenderingContext<"u"&&s instanceof WebGL2ComputeRenderingContext,o=t.precision!==void 0?t.precision:"highp",c=r(o);c!==o&&(console.warn("THREE.WebGLRenderer:",o,"not supported, using",c,"instead."),o=c);let l=t.logarithmicDepthBuffer===!0,h=s.getParameter(34930),u=s.getParameter(35660),d=s.getParameter(3379),f=s.getParameter(34076),p=s.getParameter(34921),y=s.getParameter(36347),x=s.getParameter(36348),v=s.getParameter(36349),g=u>0,m=a||e.has("OES_texture_float"),S=g&&m,w=a?s.getParameter(36183):0;return{isWebGL2:a,getMaxAnisotropy:i,getMaxPrecision:r,precision:o,logarithmicDepthBuffer:l,maxTextures:h,maxVertexTextures:u,maxTextureSize:d,maxCubemapSize:f,maxAttributes:p,maxVertexUniforms:y,maxVaryings:x,maxFragmentUniforms:v,vertexTextures:g,floatFragmentTextures:m,floatVertexTextures:S,maxSamples:w}}function wv(s){let e=this,t=null,n=0,i=!1,r=!1,a=new vn,o=new Vt,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d,f){let p=u.length!==0||d||n!==0||i;return i=d,t=h(u,f,0),n=u.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1,l()},this.setState=function(u,d,f){let p=u.clippingPlanes,y=u.clipIntersection,x=u.clipShadows,v=s.get(u);if(!i||p===null||p.length===0||r&&!x)r?h(null):l();else{let g=r?0:n,m=g*4,S=v.clippingState||null;c.value=S,S=h(p,d,m,f);for(let w=0;w!==m;++w)S[w]=t[w];v.clippingState=S,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=g}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(u,d,f,p){let y=u!==null?u.length:0,x=null;if(y!==0){if(x=c.value,p!==!0||x===null){let v=f+y*4,g=d.matrixWorldInverse;o.getNormalMatrix(g),(x===null||x.length<v)&&(x=new Float32Array(v));for(let m=0,S=f;m!==y;++m,S+=4)a.copy(u[m]).applyMatrix4(g,o),a.normal.toArray(x,S),x[S+3]=a.constant}c.value=x,c.needsUpdate=!0}return e.numPlanes=y,e.numIntersection=0,x}}function Mv(s){let e=new WeakMap;function t(a,o){return o===Do?a.mapping=Da:o===Io&&(a.mapping=Ia),a}function n(a){if(a&&a.isTexture){let o=a.mapping;if(o===Do||o===Io)if(e.has(a)){let c=e.get(a).texture;return t(c,a.mapping)}else{let c=a.image;if(c&&c.height>0){let l=s.getRenderTarget(),h=new Fr(c.height/2);return h.fromEquirectangularTexture(s,a),e.set(a,h),s.setRenderTarget(l),a.addEventListener("dispose",i),t(h.texture,a.mapping)}else return null}}return a}function i(a){let o=a.target;o.removeEventListener("dispose",i);let c=e.get(o);c!==void 0&&(e.delete(o),c.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}function _v(s){let e={};function t(n){if(e[n]!==void 0)return e[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(n){n.isWebGL2?t("EXT_color_buffer_float"):(t("WEBGL_depth_texture"),t("OES_texture_float"),t("OES_texture_half_float"),t("OES_texture_half_float_linear"),t("OES_standard_derivatives"),t("OES_element_index_uint"),t("OES_vertex_array_object"),t("ANGLE_instanced_arrays")),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float")},get:function(n){let i=t(n);return i===null&&console.warn("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function Sv(s,e,t,n){let i={},r=new WeakMap;function a(u){let d=u.target;d.index!==null&&e.remove(d.index);for(let p in d.attributes)e.remove(d.attributes[p]);d.removeEventListener("dispose",a),delete i[d.id];let f=r.get(d);f&&(e.remove(f),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function o(u,d){return i[d.id]===!0||(d.addEventListener("dispose",a),i[d.id]=!0,t.memory.geometries++),d}function c(u){let d=u.attributes;for(let p in d)e.update(d[p],34962);let f=u.morphAttributes;for(let p in f){let y=f[p];for(let x=0,v=y.length;x<v;x++)e.update(y[x],34962)}}function l(u){let d=[],f=u.index,p=u.attributes.position,y=0;if(f!==null){let g=f.array;y=f.version;for(let m=0,S=g.length;m<S;m+=3){let w=g[m+0],b=g[m+1],F=g[m+2];d.push(w,b,b,F,F,w)}}else{let g=p.array;y=p.version;for(let m=0,S=g.length/3-1;m<S;m+=3){let w=m+0,b=m+1,F=m+2;d.push(w,b,b,F,F,w)}}let x=new(Hf(d)>65535?zr:Rr)(d,1);x.version=y;let v=r.get(u);v&&e.remove(v),r.set(u,x)}function h(u){let d=r.get(u);if(d){let f=u.index;f!==null&&d.version<f.version&&l(u)}else l(u);return r.get(u)}return{get:o,update:c,getWireframeAttribute:h}}function Av(s,e,t,n){let i=n.isWebGL2,r;function a(d){r=d}let o,c;function l(d){o=d.type,c=d.bytesPerElement}function h(d,f){s.drawElements(r,f,o,d*c),t.update(f,r,1)}function u(d,f,p){if(p===0)return;let y,x;if(i)y=s,x="drawElementsInstanced";else if(y=e.get("ANGLE_instanced_arrays"),x="drawElementsInstancedANGLE",y===null){console.error("THREE.WebGLIndexedBufferRenderer: using THREE.InstancedBufferGeometry but hardware does not support extension ANGLE_instanced_arrays.");return}y[x](r,f,o,d*c,p),t.update(f,r,p)}this.setMode=a,this.setIndex=l,this.render=h,this.renderInstances=u}function Tv(s){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case 4:t.triangles+=o*(r/3);break;case 1:t.lines+=o*(r/2);break;case 3:t.lines+=o*(r-1);break;case 2:t.lines+=o*r;break;case 0:t.points+=o*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",a);break}}function i(){t.frame++,t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:i,update:n}}function Ev(s,e){return s[0]-e[0]}function Cv(s,e){return Math.abs(e[1])-Math.abs(s[1])}function Pv(s){let e={},t=new Float32Array(8),n=[];for(let r=0;r<8;r++)n[r]=[r,0];function i(r,a,o,c){let l=r.morphTargetInfluences,h=l===void 0?0:l.length,u=e[a.id];if(u===void 0){u=[];for(let x=0;x<h;x++)u[x]=[x,0];e[a.id]=u}for(let x=0;x<h;x++){let v=u[x];v[0]=x,v[1]=l[x]}u.sort(Cv);for(let x=0;x<8;x++)x<h&&u[x][1]?(n[x][0]=u[x][0],n[x][1]=u[x][1]):(n[x][0]=Number.MAX_SAFE_INTEGER,n[x][1]=0);n.sort(Ev);let d=o.morphTargets&&a.morphAttributes.position,f=o.morphNormals&&a.morphAttributes.normal,p=0;for(let x=0;x<8;x++){let v=n[x],g=v[0],m=v[1];g!==Number.MAX_SAFE_INTEGER&&m?(d&&a.getAttribute("morphTarget"+x)!==d[g]&&a.setAttribute("morphTarget"+x,d[g]),f&&a.getAttribute("morphNormal"+x)!==f[g]&&a.setAttribute("morphNormal"+x,f[g]),t[x]=m,p+=m):(d&&a.hasAttribute("morphTarget"+x)===!0&&a.deleteAttribute("morphTarget"+x),f&&a.hasAttribute("morphNormal"+x)===!0&&a.deleteAttribute("morphNormal"+x),t[x]=0)}let y=a.morphTargetsRelative?1:1-p;c.getUniforms().setValue(s,"morphTargetBaseInfluence",y),c.getUniforms().setValue(s,"morphTargetInfluences",t)}return{update:i}}function Lv(s,e,t,n){let i=new WeakMap;function r(c){let l=n.render.frame,h=c.geometry,u=e.get(c,h);return i.get(u)!==l&&(e.update(u),i.set(u,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",o)===!1&&c.addEventListener("dispose",o),t.update(c.instanceMatrix,34962),c.instanceColor!==null&&t.update(c.instanceColor,34962)),u}function a(){i=new WeakMap}function o(c){let l=c.target;l.removeEventListener("dispose",o),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:r,dispose:a}}var zs=class extends Kt{constructor(e=null,t=1,n=1,i=1){super(null),this.image={data:e,width:t,height:n,depth:i},this.magFilter=jt,this.minFilter=jt,this.wrapR=un,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.needsUpdate=!0}};zs.prototype.isDataTexture2DArray=!0;var Ds=class extends Kt{constructor(e=null,t=1,n=1,i=1){super(null),this.image={data:e,width:t,height:n,depth:i},this.magFilter=jt,this.minFilter=jt,this.wrapR=un,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.needsUpdate=!0}};Ds.prototype.isDataTexture3D=!0;var Yf=new Kt,Rv=new zs,zv=new Ds,Zf=new xi,nh=[],ih=[],rh=new Float32Array(16),sh=new Float32Array(9),ah=new Float32Array(4);function ns(s,e,t){let n=s[0];if(n<=0||n>0)return s;let i=e*t,r=nh[i];if(r===void 0&&(r=new Float32Array(i),nh[i]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,s[a].toArray(r,o)}return r}function dn(s,e){if(s.length!==e.length)return!1;for(let t=0,n=s.length;t<n;t++)if(s[t]!==e[t])return!1;return!0}function an(s,e){for(let t=0,n=e.length;t<n;t++)s[t]=e[t]}function jf(s,e){let t=ih[e];t===void 0&&(t=new Int32Array(e),ih[e]=t);for(let n=0;n!==e;++n)t[n]=s.allocateTextureUnit();return t}function Dv(s,e){let t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function Iv(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(dn(t,e))return;s.uniform2fv(this.addr,e),an(t,e)}}function Fv(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(dn(t,e))return;s.uniform3fv(this.addr,e),an(t,e)}}function Bv(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(dn(t,e))return;s.uniform4fv(this.addr,e),an(t,e)}}function kv(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(dn(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),an(t,e)}else{if(dn(t,n))return;ah.set(n),s.uniformMatrix2fv(this.addr,!1,ah),an(t,n)}}function Nv(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(dn(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),an(t,e)}else{if(dn(t,n))return;sh.set(n),s.uniformMatrix3fv(this.addr,!1,sh),an(t,n)}}function Uv(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(dn(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),an(t,e)}else{if(dn(t,n))return;rh.set(n),s.uniformMatrix4fv(this.addr,!1,rh),an(t,n)}}function Ov(s,e){let t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function Gv(s,e){let t=this.cache;dn(t,e)||(s.uniform2iv(this.addr,e),an(t,e))}function Wv(s,e){let t=this.cache;dn(t,e)||(s.uniform3iv(this.addr,e),an(t,e))}function Vv(s,e){let t=this.cache;dn(t,e)||(s.uniform4iv(this.addr,e),an(t,e))}function Hv(s,e){let t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function qv(s,e){let t=this.cache;dn(t,e)||(s.uniform2uiv(this.addr,e),an(t,e))}function Xv(s,e){let t=this.cache;dn(t,e)||(s.uniform3uiv(this.addr,e),an(t,e))}function Yv(s,e){let t=this.cache;dn(t,e)||(s.uniform4uiv(this.addr,e),an(t,e))}function Zv(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.safeSetTexture2D(e||Yf,i)}function jv(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||zv,i)}function Jv(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.safeSetTextureCube(e||Zf,i)}function $v(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||Rv,i)}function Kv(s){switch(s){case 5126:return Dv;case 35664:return Iv;case 35665:return Fv;case 35666:return Bv;case 35674:return kv;case 35675:return Nv;case 35676:return Uv;case 5124:case 35670:return Ov;case 35667:case 35671:return Gv;case 35668:case 35672:return Wv;case 35669:case 35673:return Vv;case 5125:return Hv;case 36294:return qv;case 36295:return Xv;case 36296:return Yv;case 35678:case 36198:case 36298:case 36306:case 35682:return Zv;case 35679:case 36299:case 36307:return jv;case 35680:case 36300:case 36308:case 36293:return Jv;case 36289:case 36303:case 36311:case 36292:return $v}}function Qv(s,e){s.uniform1fv(this.addr,e)}function ex(s,e){let t=ns(e,this.size,2);s.uniform2fv(this.addr,t)}function tx(s,e){let t=ns(e,this.size,3);s.uniform3fv(this.addr,t)}function nx(s,e){let t=ns(e,this.size,4);s.uniform4fv(this.addr,t)}function ix(s,e){let t=ns(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function rx(s,e){let t=ns(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function sx(s,e){let t=ns(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function ax(s,e){s.uniform1iv(this.addr,e)}function ox(s,e){s.uniform2iv(this.addr,e)}function lx(s,e){s.uniform3iv(this.addr,e)}function cx(s,e){s.uniform4iv(this.addr,e)}function ux(s,e){s.uniform1uiv(this.addr,e)}function hx(s,e){s.uniform2uiv(this.addr,e)}function dx(s,e){s.uniform3uiv(this.addr,e)}function fx(s,e){s.uniform4uiv(this.addr,e)}function px(s,e,t){let n=e.length,i=jf(t,n);s.uniform1iv(this.addr,i);for(let r=0;r!==n;++r)t.safeSetTexture2D(e[r]||Yf,i[r])}function mx(s,e,t){let n=e.length,i=jf(t,n);s.uniform1iv(this.addr,i);for(let r=0;r!==n;++r)t.safeSetTextureCube(e[r]||Zf,i[r])}function gx(s){switch(s){case 5126:return Qv;case 35664:return ex;case 35665:return tx;case 35666:return nx;case 35674:return ix;case 35675:return rx;case 35676:return sx;case 5124:case 35670:return ax;case 35667:case 35671:return ox;case 35668:case 35672:return lx;case 35669:case 35673:return cx;case 5125:return ux;case 36294:return hx;case 36295:return dx;case 36296:return fx;case 35678:case 36198:case 36298:case 36306:case 35682:return px;case 35680:case 36300:case 36308:case 36293:return mx}}function vx(s,e,t){this.id=s,this.addr=t,this.cache=[],this.setValue=Kv(e.type)}function Jf(s,e,t){this.id=s,this.addr=t,this.cache=[],this.size=e.size,this.setValue=gx(e.type)}Jf.prototype.updateCache=function(s){let e=this.cache;s instanceof Float32Array&&e.length!==s.length&&(this.cache=new Float32Array(s.length)),an(e,s)};function $f(s){this.id=s,this.seq=[],this.map={}}$f.prototype.setValue=function(s,e,t){let n=this.seq;for(let i=0,r=n.length;i!==r;++i){let a=n[i];a.setValue(s,e[a.id],t)}};var hc=/(\\w+)(\\])?(\\[|\\.)?/g;function oh(s,e){s.seq.push(e),s.map[e.id]=e}function xx(s,e,t){let n=s.name,i=n.length;for(hc.lastIndex=0;;){let r=hc.exec(n),a=hc.lastIndex,o=r[1],c=r[2]==="]",l=r[3];if(c&&(o=o|0),l===void 0||l==="["&&a+2===i){oh(t,l===void 0?new vx(o,s,e):new Jf(o,s,e));break}else{let u=t.map[o];u===void 0&&(u=new $f(o),oh(t,u)),t=u}}}function mi(s,e){this.seq=[],this.map={};let t=s.getProgramParameter(e,35718);for(let n=0;n<t;++n){let i=s.getActiveUniform(e,n),r=s.getUniformLocation(e,i.name);xx(i,r,this)}}mi.prototype.setValue=function(s,e,t,n){let i=this.map[e];i!==void 0&&i.setValue(s,t,n)};mi.prototype.setOptional=function(s,e,t){let n=e[t];n!==void 0&&this.setValue(s,t,n)};mi.upload=function(s,e,t,n){for(let i=0,r=e.length;i!==r;++i){let a=e[i],o=t[a.id];o.needsUpdate!==!1&&a.setValue(s,o.value,n)}};mi.seqWithValue=function(s,e){let t=[];for(let n=0,i=s.length;n!==i;++n){let r=s[n];r.id in e&&t.push(r)}return t};function lh(s,e,t){let n=s.createShader(e);return s.shaderSource(n,t),s.compileShader(n),n}var yx=0;function bx(s){let e=s.split(\`
\`);for(let t=0;t<e.length;t++)e[t]=t+1+": "+e[t];return e.join(\`
\`)}function Kf(s){switch(s){case hn:return["Linear","( value )"];case Ba:return["sRGB","( value )"];case zl:return["RGBE","( value )"];case _u:return["RGBM","( value, 7.0 )"];case Su:return["RGBM","( value, 16.0 )"];case Au:return["RGBD","( value, 256.0 )"];case Rl:return["Gamma","( value, float( GAMMA_FACTOR ) )"];case Bf:return["LogLuv","( value )"];default:return console.warn("THREE.WebGLProgram: Unsupported encoding:",s),["Linear","( value )"]}}function ch(s,e,t){let n=s.getShaderParameter(e,35713),i=s.getShaderInfoLog(e).trim();if(n&&i==="")return"";let r=s.getShaderSource(e);return"THREE.WebGLShader: gl.getShaderInfoLog() "+t+\`
\`+i+bx(r)}function cs(s,e){let t=Kf(e);return"vec4 "+s+"( vec4 value ) { return "+t[0]+"ToLinear"+t[1]+"; }"}function wx(s,e){let t=Kf(e);return"vec4 "+s+"( vec4 value ) { return LinearTo"+t[0]+t[1]+"; }"}function Mx(s,e){let t;switch(e){case Id:t="Linear";break;case Fd:t="Reinhard";break;case Bd:t="OptimizedCineon";break;case kd:t="ACESFilmic";break;case Nd:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}function _x(s){return[s.extensionDerivatives||s.envMapCubeUV||s.bumpMap||s.tangentSpaceNormalMap||s.clearcoatNormalMap||s.flatShading||s.shaderID==="physical"?"#extension GL_OES_standard_derivatives : enable":"",(s.extensionFragDepth||s.logarithmicDepthBuffer)&&s.rendererExtensionFragDepth?"#extension GL_EXT_frag_depth : enable":"",s.extensionDrawBuffers&&s.rendererExtensionDrawBuffers?"#extension GL_EXT_draw_buffers : require":"",(s.extensionShaderTextureLOD||s.envMap)&&s.rendererExtensionShaderTextureLod?"#extension GL_EXT_shader_texture_lod : enable":""].filter(vs).join(\`
\`)}function Sx(s){let e=[];for(let t in s){let n=s[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(\`
\`)}function Ax(s,e){let t={},n=s.getProgramParameter(e,35721);for(let i=0;i<n;i++){let a=s.getActiveAttrib(e,i).name;t[a]=s.getAttribLocation(e,a)}return t}function vs(s){return s!==""}function uh(s,e){return s.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function hh(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var Tx=/^[ \\t]*#include +<([\\w\\d./]+)>/gm;function Gc(s){return s.replace(Tx,Ex)}function Ex(s,e){let t=Et[e];if(t===void 0)throw new Error("Can not resolve #include <"+e+">");return Gc(t)}var Cx=/#pragma unroll_loop[\\s]+?for \\( int i \\= (\\d+)\\; i < (\\d+)\\; i \\+\\+ \\) \\{([\\s\\S]+?)(?=\\})\\}/g,Px=/#pragma unroll_loop_start\\s+for\\s*\\(\\s*int\\s+i\\s*=\\s*(\\d+)\\s*;\\s*i\\s*<\\s*(\\d+)\\s*;\\s*i\\s*\\+\\+\\s*\\)\\s*{([\\s\\S]+?)}\\s+#pragma unroll_loop_end/g;function dh(s){return s.replace(Px,Qf).replace(Cx,Lx)}function Lx(s,e,t,n){return console.warn("WebGLProgram: #pragma unroll_loop shader syntax is deprecated. Please use #pragma unroll_loop_start syntax instead."),Qf(s,e,t,n)}function Qf(s,e,t,n){let i="";for(let r=parseInt(e);r<parseInt(t);r++)i+=n.replace(/\\[\\s*i\\s*\\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function fh(s){let e="precision "+s.precision+\` float;
precision \`+s.precision+" int;";return s.precision==="highp"?e+=\`
#define HIGH_PRECISION\`:s.precision==="mediump"?e+=\`
#define MEDIUM_PRECISION\`:s.precision==="lowp"&&(e+=\`
#define LOW_PRECISION\`),e}function Rx(s){let e="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===vu?e="SHADOWMAP_TYPE_PCF":s.shadowMapType===dd?e="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===_r&&(e="SHADOWMAP_TYPE_VSM"),e}function zx(s){let e="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case Da:case Ia:e="ENVMAP_TYPE_CUBE";break;case Qr:case Fa:e="ENVMAP_TYPE_CUBE_UV";break}return e}function Dx(s){let e="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case Ia:case Fa:e="ENVMAP_MODE_REFRACTION";break}return e}function Ix(s){let e="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case za:e="ENVMAP_BLENDING_MULTIPLY";break;case zd:e="ENVMAP_BLENDING_MIX";break;case Dd:e="ENVMAP_BLENDING_ADD";break}return e}function Fx(s,e,t,n){let i=s.getContext(),r=t.defines,a=t.vertexShader,o=t.fragmentShader,c=Rx(t),l=zx(t),h=Dx(t),u=Ix(t),d=s.gammaFactor>0?s.gammaFactor:1,f=t.isWebGL2?"":_x(t),p=Sx(r),y=i.createProgram(),x,v,g=t.glslVersion?"#version "+t.glslVersion+\`
\`:"";t.isRawShaderMaterial?(x=[p].filter(vs).join(\`
\`),x.length>0&&(x+=\`
\`),v=[f,p].filter(vs).join(\`
\`),v.length>0&&(v+=\`
\`)):(x=[fh(t),"#define SHADER_NAME "+t.shaderName,p,t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.supportsVertexTextures?"#define VERTEX_TEXTURES":"","#define GAMMA_FACTOR "+d,"#define MAX_BONES "+t.maxBones,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMap&&t.objectSpaceNormalMap?"#define OBJECTSPACE_NORMALMAP":"",t.normalMap&&t.tangentSpaceNormalMap?"#define TANGENTSPACE_NORMALMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.displacementMap&&t.supportsVertexTextures?"#define USE_DISPLACEMENTMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.vertexTangents?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUvs?"#define USE_UV":"",t.uvsVertexOnly?"#define UVS_VERTEX_ONLY":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.useVertexTexture?"#define BONE_TEXTURE":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_MORPHTARGETS","	attribute vec3 morphTarget0;","	attribute vec3 morphTarget1;","	attribute vec3 morphTarget2;","	attribute vec3 morphTarget3;","	#ifdef USE_MORPHNORMALS","		attribute vec3 morphNormal0;","		attribute vec3 morphNormal1;","		attribute vec3 morphNormal2;","		attribute vec3 morphNormal3;","	#else","		attribute vec3 morphTarget4;","		attribute vec3 morphTarget5;","		attribute vec3 morphTarget6;","		attribute vec3 morphTarget7;","	#endif","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",\`
\`].filter(vs).join(\`
\`),v=[f,fh(t),"#define SHADER_NAME "+t.shaderName,p,t.alphaTest?"#define ALPHATEST "+t.alphaTest+(t.alphaTest%1?"":".0"):"","#define GAMMA_FACTOR "+d,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMap&&t.objectSpaceNormalMap?"#define OBJECTSPACE_NORMALMAP":"",t.normalMap&&t.tangentSpaceNormalMap?"#define TANGENTSPACE_NORMALMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.sheen?"#define USE_SHEEN":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.vertexTangents?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUvs?"#define USE_UV":"",t.uvsVertexOnly?"#define UVS_VERTEX_ONLY":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.physicallyCorrectLights?"#define PHYSICALLY_CORRECT_LIGHTS":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.logarithmicDepthBuffer&&t.rendererExtensionFragDepth?"#define USE_LOGDEPTHBUF_EXT":"",(t.extensionShaderTextureLOD||t.envMap)&&t.rendererExtensionShaderTextureLod?"#define TEXTURE_LOD_EXT":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==ki?"#define TONE_MAPPING":"",t.toneMapping!==ki?Et.tonemapping_pars_fragment:"",t.toneMapping!==ki?Mx("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",Et.encodings_pars_fragment,t.map?cs("mapTexelToLinear",t.mapEncoding):"",t.matcap?cs("matcapTexelToLinear",t.matcapEncoding):"",t.envMap?cs("envMapTexelToLinear",t.envMapEncoding):"",t.emissiveMap?cs("emissiveMapTexelToLinear",t.emissiveMapEncoding):"",t.lightMap?cs("lightMapTexelToLinear",t.lightMapEncoding):"",wx("linearToOutputTexel",t.outputEncoding),t.depthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",\`
\`].filter(vs).join(\`
\`)),a=Gc(a),a=uh(a,t),a=hh(a,t),o=Gc(o),o=uh(o,t),o=hh(o,t),a=dh(a),o=dh(o),t.isWebGL2&&t.isRawShaderMaterial!==!0&&(g=\`#version 300 es
\`,x=["#define attribute in","#define varying out","#define texture2D texture"].join(\`
\`)+\`
\`+x,v=["#define varying in",t.glslVersion===Uc?"":"out highp vec4 pc_fragColor;",t.glslVersion===Uc?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(\`
\`)+\`
\`+v);let m=g+x+a,S=g+v+o,w=lh(i,35633,m),b=lh(i,35632,S);if(i.attachShader(y,w),i.attachShader(y,b),t.index0AttributeName!==void 0?i.bindAttribLocation(y,0,t.index0AttributeName):t.morphTargets===!0&&i.bindAttribLocation(y,0,"position"),i.linkProgram(y),s.debug.checkShaderErrors){let O=i.getProgramInfoLog(y).trim(),ae=i.getShaderInfoLog(w).trim(),_=i.getShaderInfoLog(b).trim(),E=!0,z=!0;if(i.getProgramParameter(y,35714)===!1){E=!1;let D=ch(i,w,"vertex"),C=ch(i,b,"fragment");console.error("THREE.WebGLProgram: shader error: ",i.getError(),"35715",i.getProgramParameter(y,35715),"gl.getProgramInfoLog",O,D,C)}else O!==""?console.warn("THREE.WebGLProgram: gl.getProgramInfoLog()",O):(ae===""||_==="")&&(z=!1);z&&(this.diagnostics={runnable:E,programLog:O,vertexShader:{log:ae,prefix:x},fragmentShader:{log:_,prefix:v}})}i.deleteShader(w),i.deleteShader(b);let F;this.getUniforms=function(){return F===void 0&&(F=new mi(i,y)),F};let L;return this.getAttributes=function(){return L===void 0&&(L=Ax(i,y)),L},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(y),this.program=void 0},this.name=t.shaderName,this.id=yx++,this.cacheKey=e,this.usedTimes=1,this.program=y,this.vertexShader=w,this.fragmentShader=b,this}function Bx(s,e,t,n,i,r){let a=[],o=n.isWebGL2,c=n.logarithmicDepthBuffer,l=n.floatVertexTextures,h=n.maxVertexUniforms,u=n.vertexTextures,d=n.precision,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"},p=["precision","isWebGL2","supportsVertexTextures","outputEncoding","instancing","instancingColor","map","mapEncoding","matcap","matcapEncoding","envMap","envMapMode","envMapEncoding","envMapCubeUV","lightMap","lightMapEncoding","aoMap","emissiveMap","emissiveMapEncoding","bumpMap","normalMap","objectSpaceNormalMap","tangentSpaceNormalMap","clearcoatMap","clearcoatRoughnessMap","clearcoatNormalMap","displacementMap","specularMap","roughnessMap","metalnessMap","gradientMap","alphaMap","combine","vertexColors","vertexAlphas","vertexTangents","vertexUvs","uvsVertexOnly","fog","useFog","fogExp2","flatShading","sizeAttenuation","logarithmicDepthBuffer","skinning","maxBones","useVertexTexture","morphTargets","morphNormals","premultipliedAlpha","numDirLights","numPointLights","numSpotLights","numHemiLights","numRectAreaLights","numDirLightShadows","numPointLightShadows","numSpotLightShadows","shadowMapEnabled","shadowMapType","toneMapping","physicallyCorrectLights","alphaTest","doubleSided","flipSided","numClippingPlanes","numClipIntersection","depthPacking","dithering","sheen","transmissionMap"];function y(b){let L=b.skeleton.bones;if(l)return 1024;{let ae=Math.floor((h-20)/4),_=Math.min(ae,L.length);return _<L.length?(console.warn("THREE.WebGLRenderer: Skeleton has "+L.length+" bones. This GPU supports "+_+"."),0):_}}function x(b){let F;return b&&b.isTexture?F=b.encoding:b&&b.isWebGLRenderTarget?(console.warn("THREE.WebGLPrograms.getTextureEncodingFromMap: don't use render targets as textures. Use their .texture property instead."),F=b.texture.encoding):F=hn,F}function v(b,F,L,O,ae){let _=O.fog,E=b.isMeshStandardMaterial?O.environment:null,z=e.get(b.envMap||E),D=f[b.type],C=ae.isSkinnedMesh?y(ae):0;b.precision!==null&&(d=n.getMaxPrecision(b.precision),d!==b.precision&&console.warn("THREE.WebGLProgram.getParameters:",b.precision,"not supported, using",d,"instead."));let I,K;if(D){let le=Cn[D];I=le.vertexShader,K=le.fragmentShader}else I=b.vertexShader,K=b.fragmentShader;let G=s.getRenderTarget();return{isWebGL2:o,shaderID:D,shaderName:b.type,vertexShader:I,fragmentShader:K,defines:b.defines,isRawShaderMaterial:b.isRawShaderMaterial===!0,glslVersion:b.glslVersion,precision:d,instancing:ae.isInstancedMesh===!0,instancingColor:ae.isInstancedMesh===!0&&ae.instanceColor!==null,supportsVertexTextures:u,outputEncoding:G!==null?x(G.texture):s.outputEncoding,map:!!b.map,mapEncoding:x(b.map),matcap:!!b.matcap,matcapEncoding:x(b.matcap),envMap:!!z,envMapMode:z&&z.mapping,envMapEncoding:x(z),envMapCubeUV:!!z&&(z.mapping===Qr||z.mapping===Fa),lightMap:!!b.lightMap,lightMapEncoding:x(b.lightMap),aoMap:!!b.aoMap,emissiveMap:!!b.emissiveMap,emissiveMapEncoding:x(b.emissiveMap),bumpMap:!!b.bumpMap,normalMap:!!b.normalMap,objectSpaceNormalMap:b.normalMapType===Uf,tangentSpaceNormalMap:b.normalMapType===er,clearcoatMap:!!b.clearcoatMap,clearcoatRoughnessMap:!!b.clearcoatRoughnessMap,clearcoatNormalMap:!!b.clearcoatNormalMap,displacementMap:!!b.displacementMap,roughnessMap:!!b.roughnessMap,metalnessMap:!!b.metalnessMap,specularMap:!!b.specularMap,alphaMap:!!b.alphaMap,gradientMap:!!b.gradientMap,sheen:!!b.sheen,transmissionMap:!!b.transmissionMap,combine:b.combine,vertexTangents:b.normalMap&&b.vertexTangents,vertexColors:b.vertexColors,vertexAlphas:b.vertexColors===!0&&ae.geometry&&ae.geometry.attributes.color&&ae.geometry.attributes.color.itemSize===4,vertexUvs:!!b.map||!!b.bumpMap||!!b.normalMap||!!b.specularMap||!!b.alphaMap||!!b.emissiveMap||!!b.roughnessMap||!!b.metalnessMap||!!b.clearcoatMap||!!b.clearcoatRoughnessMap||!!b.clearcoatNormalMap||!!b.displacementMap||!!b.transmissionMap,uvsVertexOnly:!(b.map||b.bumpMap||b.normalMap||b.specularMap||b.alphaMap||b.emissiveMap||b.roughnessMap||b.metalnessMap||b.clearcoatNormalMap||b.transmissionMap)&&!!b.displacementMap,fog:!!_,useFog:b.fog,fogExp2:_&&_.isFogExp2,flatShading:!!b.flatShading,sizeAttenuation:b.sizeAttenuation,logarithmicDepthBuffer:c,skinning:b.skinning&&C>0,maxBones:C,useVertexTexture:l,morphTargets:b.morphTargets,morphNormals:b.morphNormals,numDirLights:F.directional.length,numPointLights:F.point.length,numSpotLights:F.spot.length,numRectAreaLights:F.rectArea.length,numHemiLights:F.hemi.length,numDirLightShadows:F.directionalShadowMap.length,numPointLightShadows:F.pointShadowMap.length,numSpotLightShadows:F.spotShadowMap.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:b.dithering,shadowMapEnabled:s.shadowMap.enabled&&L.length>0,shadowMapType:s.shadowMap.type,toneMapping:b.toneMapped?s.toneMapping:ki,physicallyCorrectLights:s.physicallyCorrectLights,premultipliedAlpha:b.premultipliedAlpha,alphaTest:b.alphaTest,doubleSided:b.side===Ra,flipSided:b.side===Ht,depthPacking:b.depthPacking!==void 0?b.depthPacking:!1,index0AttributeName:b.index0AttributeName,extensionDerivatives:b.extensions&&b.extensions.derivatives,extensionFragDepth:b.extensions&&b.extensions.fragDepth,extensionDrawBuffers:b.extensions&&b.extensions.drawBuffers,extensionShaderTextureLOD:b.extensions&&b.extensions.shaderTextureLOD,rendererExtensionFragDepth:o||t.has("EXT_frag_depth"),rendererExtensionDrawBuffers:o||t.has("WEBGL_draw_buffers"),rendererExtensionShaderTextureLod:o||t.has("EXT_shader_texture_lod"),customProgramCacheKey:b.customProgramCacheKey()}}function g(b){let F=[];if(b.shaderID?F.push(b.shaderID):(F.push(b.fragmentShader),F.push(b.vertexShader)),b.defines!==void 0)for(let L in b.defines)F.push(L),F.push(b.defines[L]);if(b.isRawShaderMaterial===!1){for(let L=0;L<p.length;L++)F.push(b[p[L]]);F.push(s.outputEncoding),F.push(s.gammaFactor)}return F.push(b.customProgramCacheKey),F.join()}function m(b){let F=f[b.type],L;if(F){let O=Cn[F];L=qf.clone(O.uniforms)}else L=b.uniforms;return L}function S(b,F){let L;for(let O=0,ae=a.length;O<ae;O++){let _=a[O];if(_.cacheKey===F){L=_,++L.usedTimes;break}}return L===void 0&&(L=new Fx(s,F,b,i),a.push(L)),L}function w(b){if(--b.usedTimes===0){let F=a.indexOf(b);a[F]=a[a.length-1],a.pop(),b.destroy()}}return{getParameters:v,getProgramCacheKey:g,getUniforms:m,acquireProgram:S,releaseProgram:w,programs:a}}function kx(){let s=new WeakMap;function e(r){let a=s.get(r);return a===void 0&&(a={},s.set(r,a)),a}function t(r){s.delete(r)}function n(r,a,o){s.get(r)[a]=o}function i(){s=new WeakMap}return{get:e,remove:t,update:n,dispose:i}}function Nx(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.program!==e.program?s.program.id-e.program.id:s.material.id!==e.material.id?s.material.id-e.material.id:s.z!==e.z?s.z-e.z:s.id-e.id}function Ux(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function ph(s){let e=[],t=0,n=[],i=[],r={id:-1};function a(){t=0,n.length=0,i.length=0}function o(d,f,p,y,x,v){let g=e[t],m=s.get(p);return g===void 0?(g={id:d.id,object:d,geometry:f,material:p,program:m.program||r,groupOrder:y,renderOrder:d.renderOrder,z:x,group:v},e[t]=g):(g.id=d.id,g.object=d,g.geometry=f,g.material=p,g.program=m.program||r,g.groupOrder=y,g.renderOrder=d.renderOrder,g.z=x,g.group=v),t++,g}function c(d,f,p,y,x,v){let g=o(d,f,p,y,x,v);(p.transparent===!0?i:n).push(g)}function l(d,f,p,y,x,v){let g=o(d,f,p,y,x,v);(p.transparent===!0?i:n).unshift(g)}function h(d,f){n.length>1&&n.sort(d||Nx),i.length>1&&i.sort(f||Ux)}function u(){for(let d=t,f=e.length;d<f;d++){let p=e[d];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.program=null,p.group=null}}return{opaque:n,transparent:i,init:a,push:c,unshift:l,finish:u,sort:h}}function Ox(s){let e=new WeakMap;function t(i,r){let a;return e.has(i)===!1?(a=new ph(s),e.set(i,[a])):r>=e.get(i).length?(a=new ph(s),e.get(i).push(a)):a=e.get(i)[r],a}function n(){e=new WeakMap}return{get:t,dispose:n}}function Gx(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new Y,color:new ut};break;case"SpotLight":t={position:new Y,direction:new Y,color:new ut,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new Y,color:new ut,distance:0,decay:0};break;case"HemisphereLight":t={direction:new Y,skyColor:new ut,groundColor:new ut};break;case"RectAreaLight":t={color:new ut,position:new Y,halfWidth:new Y,halfHeight:new Y};break}return s[e.id]=t,t}}}function Wx(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Je};break;case"SpotLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Je};break;case"PointLight":t={shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Je,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[e.id]=t,t}}}var Vx=0;function Hx(s,e){return(e.castShadow?1:0)-(s.castShadow?1:0)}function qx(s,e){let t=new Gx,n=Wx(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotShadow:[],spotShadowMap:[],spotShadowMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[]};for(let h=0;h<9;h++)i.probe.push(new Y);let r=new Y,a=new bt,o=new bt;function c(h){let u=0,d=0,f=0;for(let F=0;F<9;F++)i.probe[F].set(0,0,0);let p=0,y=0,x=0,v=0,g=0,m=0,S=0,w=0;h.sort(Hx);for(let F=0,L=h.length;F<L;F++){let O=h[F],ae=O.color,_=O.intensity,E=O.distance,z=O.shadow&&O.shadow.map?O.shadow.map.texture:null;if(O.isAmbientLight)u+=ae.r*_,d+=ae.g*_,f+=ae.b*_;else if(O.isLightProbe)for(let D=0;D<9;D++)i.probe[D].addScaledVector(O.sh.coefficients[D],_);else if(O.isDirectionalLight){let D=t.get(O);if(D.color.copy(O.color).multiplyScalar(O.intensity),O.castShadow){let C=O.shadow,I=n.get(O);I.shadowBias=C.bias,I.shadowNormalBias=C.normalBias,I.shadowRadius=C.radius,I.shadowMapSize=C.mapSize,i.directionalShadow[p]=I,i.directionalShadowMap[p]=z,i.directionalShadowMatrix[p]=O.shadow.matrix,m++}i.directional[p]=D,p++}else if(O.isSpotLight){let D=t.get(O);if(D.position.setFromMatrixPosition(O.matrixWorld),D.color.copy(ae).multiplyScalar(_),D.distance=E,D.coneCos=Math.cos(O.angle),D.penumbraCos=Math.cos(O.angle*(1-O.penumbra)),D.decay=O.decay,O.castShadow){let C=O.shadow,I=n.get(O);I.shadowBias=C.bias,I.shadowNormalBias=C.normalBias,I.shadowRadius=C.radius,I.shadowMapSize=C.mapSize,i.spotShadow[x]=I,i.spotShadowMap[x]=z,i.spotShadowMatrix[x]=O.shadow.matrix,w++}i.spot[x]=D,x++}else if(O.isRectAreaLight){let D=t.get(O);D.color.copy(ae).multiplyScalar(_),D.halfWidth.set(O.width*.5,0,0),D.halfHeight.set(0,O.height*.5,0),i.rectArea[v]=D,v++}else if(O.isPointLight){let D=t.get(O);if(D.color.copy(O.color).multiplyScalar(O.intensity),D.distance=O.distance,D.decay=O.decay,O.castShadow){let C=O.shadow,I=n.get(O);I.shadowBias=C.bias,I.shadowNormalBias=C.normalBias,I.shadowRadius=C.radius,I.shadowMapSize=C.mapSize,I.shadowCameraNear=C.camera.near,I.shadowCameraFar=C.camera.far,i.pointShadow[y]=I,i.pointShadowMap[y]=z,i.pointShadowMatrix[y]=O.shadow.matrix,S++}i.point[y]=D,y++}else if(O.isHemisphereLight){let D=t.get(O);D.skyColor.copy(O.color).multiplyScalar(_),D.groundColor.copy(O.groundColor).multiplyScalar(_),i.hemi[g]=D,g++}}v>0&&(e.isWebGL2||s.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=lt.LTC_FLOAT_1,i.rectAreaLTC2=lt.LTC_FLOAT_2):s.has("OES_texture_half_float_linear")===!0?(i.rectAreaLTC1=lt.LTC_HALF_1,i.rectAreaLTC2=lt.LTC_HALF_2):console.error("THREE.WebGLRenderer: Unable to use RectAreaLight. Missing WebGL extensions.")),i.ambient[0]=u,i.ambient[1]=d,i.ambient[2]=f;let b=i.hash;(b.directionalLength!==p||b.pointLength!==y||b.spotLength!==x||b.rectAreaLength!==v||b.hemiLength!==g||b.numDirectionalShadows!==m||b.numPointShadows!==S||b.numSpotShadows!==w)&&(i.directional.length=p,i.spot.length=x,i.rectArea.length=v,i.point.length=y,i.hemi.length=g,i.directionalShadow.length=m,i.directionalShadowMap.length=m,i.pointShadow.length=S,i.pointShadowMap.length=S,i.spotShadow.length=w,i.spotShadowMap.length=w,i.directionalShadowMatrix.length=m,i.pointShadowMatrix.length=S,i.spotShadowMatrix.length=w,b.directionalLength=p,b.pointLength=y,b.spotLength=x,b.rectAreaLength=v,b.hemiLength=g,b.numDirectionalShadows=m,b.numPointShadows=S,b.numSpotShadows=w,i.version=Vx++)}function l(h,u){let d=0,f=0,p=0,y=0,x=0,v=u.matrixWorldInverse;for(let g=0,m=h.length;g<m;g++){let S=h[g];if(S.isDirectionalLight){let w=i.directional[d];w.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(v),d++}else if(S.isSpotLight){let w=i.spot[p];w.position.setFromMatrixPosition(S.matrixWorld),w.position.applyMatrix4(v),w.direction.setFromMatrixPosition(S.matrixWorld),r.setFromMatrixPosition(S.target.matrixWorld),w.direction.sub(r),w.direction.transformDirection(v),p++}else if(S.isRectAreaLight){let w=i.rectArea[y];w.position.setFromMatrixPosition(S.matrixWorld),w.position.applyMatrix4(v),o.identity(),a.copy(S.matrixWorld),a.premultiply(v),o.extractRotation(a),w.halfWidth.set(S.width*.5,0,0),w.halfHeight.set(0,S.height*.5,0),w.halfWidth.applyMatrix4(o),w.halfHeight.applyMatrix4(o),y++}else if(S.isPointLight){let w=i.point[f];w.position.setFromMatrixPosition(S.matrixWorld),w.position.applyMatrix4(v),f++}else if(S.isHemisphereLight){let w=i.hemi[x];w.direction.setFromMatrixPosition(S.matrixWorld),w.direction.transformDirection(v),w.direction.normalize(),x++}}}return{setup:c,setupView:l,state:i}}function mh(s,e){let t=new qx(s,e),n=[],i=[];function r(){n.length=0,i.length=0}function a(u){n.push(u)}function o(u){i.push(u)}function c(){t.setup(n)}function l(u){t.setupView(n,u)}return{init:r,state:{lightsArray:n,shadowsArray:i,lights:t},setupLights:c,setupLightsView:l,pushLight:a,pushShadow:o}}function Xx(s,e){let t=new WeakMap;function n(r,a=0){let o;return t.has(r)===!1?(o=new mh(s,e),t.set(r,[o])):a>=t.get(r).length?(o=new mh(s,e),t.get(r).push(o)):o=t.get(r)[a],o}function i(){t=new WeakMap}return{get:n,dispose:i}}var kr=class extends Yt{constructor(e){super(),this.type="MeshDepthMaterial",this.depthPacking=kf,this.skinning=!1,this.morphTargets=!1,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}};kr.prototype.isMeshDepthMaterial=!0;var Nr=class extends Yt{constructor(e){super(),this.type="MeshDistanceMaterial",this.referencePosition=new Y,this.nearDistance=1,this.farDistance=1e3,this.skinning=!1,this.morphTargets=!1,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.fog=!1,this.setValues(e)}copy(e){return super.copy(e),this.referencePosition.copy(e.referencePosition),this.nearDistance=e.nearDistance,this.farDistance=e.farDistance,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};Nr.prototype.isMeshDistanceMaterial=!0;var Yx=\`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	float mean = 0.0;
	float squared_mean = 0.0;
	float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy ) / resolution ) );
	for ( float i = -1.0; i < 1.0 ; i += SAMPLE_RATE) {
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( i, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, i ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean * HALF_SAMPLE_RATE;
	squared_mean = squared_mean * HALF_SAMPLE_RATE;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}\`,Zx=\`void main() {
	gl_Position = vec4( position, 1.0 );
}\`;function ep(s,e,t){let n=new Wi,i=new Je,r=new Je,a=new Lt,o=[],c=[],l={},h=t.maxTextureSize,u={0:Ht,1:Kr,2:Ra},d=new Rn({defines:{SAMPLE_RATE:2/8,HALF_SAMPLE_RATE:1/8},uniforms:{shadow_pass:{value:null},resolution:{value:new Je},radius:{value:4}},vertexShader:Zx,fragmentShader:Yx}),f=d.clone();f.defines.HORIZONTAL_PASS=1;let p=new _t;p.setAttribute("position",new St(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new Ot(p,d),x=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=vu,this.render=function(b,F,L){if(x.enabled===!1||x.autoUpdate===!1&&x.needsUpdate===!1||b.length===0)return;let O=s.getRenderTarget(),ae=s.getActiveCubeFace(),_=s.getActiveMipmapLevel(),E=s.state;E.setBlending(Kn),E.buffers.color.setClear(1,1,1,1),E.buffers.depth.setTest(!0),E.setScissorTest(!1);for(let z=0,D=b.length;z<D;z++){let C=b[z],I=C.shadow;if(I===void 0){console.warn("THREE.WebGLShadowMap:",C,"has no shadow.");continue}if(I.autoUpdate===!1&&I.needsUpdate===!1)continue;i.copy(I.mapSize);let K=I.getFrameExtents();if(i.multiply(K),r.copy(I.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/K.x),i.x=r.x*K.x,I.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/K.y),i.y=r.y*K.y,I.mapSize.y=r.y)),I.map===null&&!I.isPointLightShadow&&this.type===_r){let oe={minFilter:Jt,magFilter:Jt,format:xn};I.map=new Pn(i.x,i.y,oe),I.map.texture.name=C.name+".shadowMap",I.mapPass=new Pn(i.x,i.y,oe),I.camera.updateProjectionMatrix()}if(I.map===null){let oe={minFilter:jt,magFilter:jt,format:xn};I.map=new Pn(i.x,i.y,oe),I.map.texture.name=C.name+".shadowMap",I.camera.updateProjectionMatrix()}s.setRenderTarget(I.map),s.clear();let G=I.getViewportCount();for(let oe=0;oe<G;oe++){let le=I.getViewport(oe);a.set(r.x*le.x,r.y*le.y,r.x*le.z,r.y*le.w),E.viewport(a),I.updateMatrices(C,oe),n=I.getFrustum(),w(F,L,I.camera,C,this.type)}!I.isPointLightShadow&&this.type===_r&&v(I,L),I.needsUpdate=!1}x.needsUpdate=!1,s.setRenderTarget(O,ae,_)};function v(b,F){let L=e.update(y);d.uniforms.shadow_pass.value=b.map.texture,d.uniforms.resolution.value=b.mapSize,d.uniforms.radius.value=b.radius,s.setRenderTarget(b.mapPass),s.clear(),s.renderBufferDirect(F,null,L,d,y,null),f.uniforms.shadow_pass.value=b.mapPass.texture,f.uniforms.resolution.value=b.mapSize,f.uniforms.radius.value=b.radius,s.setRenderTarget(b.map),s.clear(),s.renderBufferDirect(F,null,L,f,y,null)}function g(b,F,L){let O=b<<0|F<<1|L<<2,ae=o[O];return ae===void 0&&(ae=new kr({depthPacking:Nf,morphTargets:b,skinning:F}),o[O]=ae),ae}function m(b,F,L){let O=b<<0|F<<1|L<<2,ae=c[O];return ae===void 0&&(ae=new Nr({morphTargets:b,skinning:F}),c[O]=ae),ae}function S(b,F,L,O,ae,_,E){let z=null,D=g,C=b.customDepthMaterial;if(O.isPointLight===!0&&(D=m,C=b.customDistanceMaterial),C===void 0){let I=!1;L.morphTargets===!0&&(I=F.morphAttributes&&F.morphAttributes.position&&F.morphAttributes.position.length>0);let K=!1;b.isSkinnedMesh===!0&&(L.skinning===!0?K=!0:console.warn("THREE.WebGLShadowMap: THREE.SkinnedMesh with material.skinning set to false:",b));let G=b.isInstancedMesh===!0;z=D(I,K,G)}else z=C;if(s.localClippingEnabled&&L.clipShadows===!0&&L.clippingPlanes.length!==0){let I=z.uuid,K=L.uuid,G=l[I];G===void 0&&(G={},l[I]=G);let oe=G[K];oe===void 0&&(oe=z.clone(),G[K]=oe),z=oe}return z.visible=L.visible,z.wireframe=L.wireframe,E===_r?z.side=L.shadowSide!==null?L.shadowSide:L.side:z.side=L.shadowSide!==null?L.shadowSide:u[L.side],z.clipShadows=L.clipShadows,z.clippingPlanes=L.clippingPlanes,z.clipIntersection=L.clipIntersection,z.wireframeLinewidth=L.wireframeLinewidth,z.linewidth=L.linewidth,O.isPointLight===!0&&z.isMeshDistanceMaterial===!0&&(z.referencePosition.setFromMatrixPosition(O.matrixWorld),z.nearDistance=ae,z.farDistance=_),z}function w(b,F,L,O,ae){if(b.visible===!1)return;if(b.layers.test(F.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&ae===_r)&&(!b.frustumCulled||n.intersectsObject(b))){b.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,b.matrixWorld);let z=e.update(b),D=b.material;if(Array.isArray(D)){let C=z.groups;for(let I=0,K=C.length;I<K;I++){let G=C[I],oe=D[G.materialIndex];if(oe&&oe.visible){let le=S(b,z,oe,O,L.near,L.far,ae);s.renderBufferDirect(L,null,z,le,b,G)}}}else if(D.visible){let C=S(b,z,D,O,L.near,L.far,ae);s.renderBufferDirect(L,null,z,C,b,null)}}let E=b.children;for(let z=0,D=E.length;z<D;z++)w(E[z],F,L,O,ae)}}function jx(s,e,t){let n=t.isWebGL2;function i(){let ee=!1,Ee=new Lt,Ue=null,Ve=new Lt(0,0,0,0);return{setMask:function(we){Ue!==we&&!ee&&(s.colorMask(we,we,we,we),Ue=we)},setLocked:function(we){ee=we},setClear:function(we,Qe,ct,vt,xt){xt===!0&&(we*=vt,Qe*=vt,ct*=vt),Ee.set(we,Qe,ct,vt),Ve.equals(Ee)===!1&&(s.clearColor(we,Qe,ct,vt),Ve.copy(Ee))},reset:function(){ee=!1,Ue=null,Ve.set(-1,0,0,0)}}}function r(){let ee=!1,Ee=null,Ue=null,Ve=null;return{setTest:function(we){we?q(2929):se(2929)},setMask:function(we){Ee!==we&&!ee&&(s.depthMask(we),Ee=we)},setFunc:function(we){if(Ue!==we){if(we)switch(we){case Ad:s.depthFunc(512);break;case Td:s.depthFunc(519);break;case Ed:s.depthFunc(513);break;case zo:s.depthFunc(515);break;case Cd:s.depthFunc(514);break;case Pd:s.depthFunc(518);break;case Ld:s.depthFunc(516);break;case Rd:s.depthFunc(517);break;default:s.depthFunc(515)}else s.depthFunc(515);Ue=we}},setLocked:function(we){ee=we},setClear:function(we){Ve!==we&&(s.clearDepth(we),Ve=we)},reset:function(){ee=!1,Ee=null,Ue=null,Ve=null}}}function a(){let ee=!1,Ee=null,Ue=null,Ve=null,we=null,Qe=null,ct=null,vt=null,xt=null;return{setTest:function(tt){ee||(tt?q(2960):se(2960))},setMask:function(tt){Ee!==tt&&!ee&&(s.stencilMask(tt),Ee=tt)},setFunc:function(tt,Q,Le){(Ue!==tt||Ve!==Q||we!==Le)&&(s.stencilFunc(tt,Q,Le),Ue=tt,Ve=Q,we=Le)},setOp:function(tt,Q,Le){(Qe!==tt||ct!==Q||vt!==Le)&&(s.stencilOp(tt,Q,Le),Qe=tt,ct=Q,vt=Le)},setLocked:function(tt){ee=tt},setClear:function(tt){xt!==tt&&(s.clearStencil(tt),xt=tt)},reset:function(){ee=!1,Ee=null,Ue=null,Ve=null,we=null,Qe=null,ct=null,vt=null,xt=null}}}let o=new i,c=new r,l=new a,h={},u=null,d={},f=null,p=!1,y=null,x=null,v=null,g=null,m=null,S=null,w=null,b=!1,F=null,L=null,O=null,ae=null,_=null,E=s.getParameter(35661),z=!1,D=0,C=s.getParameter(7938);C.indexOf("WebGL")!==-1?(D=parseFloat(/^WebGL (\\d)/.exec(C)[1]),z=D>=1):C.indexOf("OpenGL ES")!==-1&&(D=parseFloat(/^OpenGL ES (\\d)/.exec(C)[1]),z=D>=2);let I=null,K={},G=new Lt(0,0,s.canvas.width,s.canvas.height),oe=new Lt(0,0,s.canvas.width,s.canvas.height);function le(ee,Ee,Ue){let Ve=new Uint8Array(4),we=s.createTexture();s.bindTexture(ee,we),s.texParameteri(ee,10241,9728),s.texParameteri(ee,10240,9728);for(let Qe=0;Qe<Ue;Qe++)s.texImage2D(Ee+Qe,0,6408,1,1,0,6408,5121,Ve);return we}let M={};M[3553]=le(3553,3553,1),M[34067]=le(34067,34069,6),o.setClear(0,0,0,1),c.setClear(1),l.setClear(0),q(2929),c.setFunc(zo),ce(!1),H(_c),q(2884),k(Kn);function q(ee){h[ee]!==!0&&(s.enable(ee),h[ee]=!0)}function se(ee){h[ee]!==!1&&(s.disable(ee),h[ee]=!1)}function X(ee){ee!==u&&(s.bindFramebuffer(36160,ee),u=ee)}function pe(ee,Ee){Ee===null&&u!==null&&(Ee=u),d[ee]!==Ee&&(s.bindFramebuffer(ee,Ee),d[ee]=Ee,n&&(ee===36009&&(d[36160]=Ee),ee===36160&&(d[36009]=Ee)))}function ve(ee){return f!==ee?(s.useProgram(ee),f=ee,!0):!1}let fe={[Ii]:32774,[pd]:32778,[md]:32779};if(n)fe[Ec]=32775,fe[Cc]=32776;else{let ee=e.get("EXT_blend_minmax");ee!==null&&(fe[Ec]=ee.MIN_EXT,fe[Cc]=ee.MAX_EXT)}let J={[gd]:0,[vd]:1,[xd]:768,[yu]:770,[Sd]:776,[Md]:774,[bd]:772,[yd]:769,[bu]:771,[_d]:775,[wd]:773};function k(ee,Ee,Ue,Ve,we,Qe,ct,vt){if(ee===Kn){p===!0&&(se(3042),p=!1);return}if(p===!1&&(q(3042),p=!0),ee!==fd){if(ee!==y||vt!==b){if((x!==Ii||m!==Ii)&&(s.blendEquation(32774),x=Ii,m=Ii),vt)switch(ee){case Ar:s.blendFuncSeparate(1,771,1,771);break;case Sc:s.blendFunc(1,1);break;case Ac:s.blendFuncSeparate(0,0,769,771);break;case Tc:s.blendFuncSeparate(0,768,0,770);break;default:console.error("THREE.WebGLState: Invalid blending: ",ee);break}else switch(ee){case Ar:s.blendFuncSeparate(770,771,1,771);break;case Sc:s.blendFunc(770,1);break;case Ac:s.blendFunc(0,769);break;case Tc:s.blendFunc(0,768);break;default:console.error("THREE.WebGLState: Invalid blending: ",ee);break}v=null,g=null,S=null,w=null,y=ee,b=vt}return}we=we||Ee,Qe=Qe||Ue,ct=ct||Ve,(Ee!==x||we!==m)&&(s.blendEquationSeparate(fe[Ee],fe[we]),x=Ee,m=we),(Ue!==v||Ve!==g||Qe!==S||ct!==w)&&(s.blendFuncSeparate(J[Ue],J[Ve],J[Qe],J[ct]),v=Ue,g=Ve,S=Qe,w=ct),y=ee,b=null}function ne(ee,Ee){ee.side===Ra?se(2884):q(2884);let Ue=ee.side===Ht;Ee&&(Ue=!Ue),ce(Ue),ee.blending===Ar&&ee.transparent===!1?k(Kn):k(ee.blending,ee.blendEquation,ee.blendSrc,ee.blendDst,ee.blendEquationAlpha,ee.blendSrcAlpha,ee.blendDstAlpha,ee.premultipliedAlpha),c.setFunc(ee.depthFunc),c.setTest(ee.depthTest),c.setMask(ee.depthWrite),o.setMask(ee.colorWrite);let Ve=ee.stencilWrite;l.setTest(Ve),Ve&&(l.setMask(ee.stencilWriteMask),l.setFunc(ee.stencilFunc,ee.stencilRef,ee.stencilFuncMask),l.setOp(ee.stencilFail,ee.stencilZFail,ee.stencilZPass)),he(ee.polygonOffset,ee.polygonOffsetFactor,ee.polygonOffsetUnits),ee.alphaToCoverage===!0?q(32926):se(32926)}function ce(ee){F!==ee&&(ee?s.frontFace(2304):s.frontFace(2305),F=ee)}function H(ee){ee!==ud?(q(2884),ee!==L&&(ee===_c?s.cullFace(1029):ee===hd?s.cullFace(1028):s.cullFace(1032))):se(2884),L=ee}function j(ee){ee!==O&&(z&&s.lineWidth(ee),O=ee)}function he(ee,Ee,Ue){ee?(q(32823),(ae!==Ee||_!==Ue)&&(s.polygonOffset(Ee,Ue),ae=Ee,_=Ue)):se(32823)}function de(ee){ee?q(3089):se(3089)}function ie(ee){ee===void 0&&(ee=33984+E-1),I!==ee&&(s.activeTexture(ee),I=ee)}function R(ee,Ee){I===null&&ie();let Ue=K[I];Ue===void 0&&(Ue={type:void 0,texture:void 0},K[I]=Ue),(Ue.type!==ee||Ue.texture!==Ee)&&(s.bindTexture(ee,Ee||M[ee]),Ue.type=ee,Ue.texture=Ee)}function T(){let ee=K[I];ee!==void 0&&ee.type!==void 0&&(s.bindTexture(ee.type,null),ee.type=void 0,ee.texture=void 0)}function te(){try{s.compressedTexImage2D.apply(s,arguments)}catch(ee){console.error("THREE.WebGLState:",ee)}}function $(){try{s.texImage2D.apply(s,arguments)}catch(ee){console.error("THREE.WebGLState:",ee)}}function xe(){try{s.texImage3D.apply(s,arguments)}catch(ee){console.error("THREE.WebGLState:",ee)}}function Z(ee){G.equals(ee)===!1&&(s.scissor(ee.x,ee.y,ee.z,ee.w),G.copy(ee))}function Ie(ee){oe.equals(ee)===!1&&(s.viewport(ee.x,ee.y,ee.z,ee.w),oe.copy(ee))}function Ne(){s.disable(3042),s.disable(2884),s.disable(2929),s.disable(32823),s.disable(3089),s.disable(2960),s.disable(32926),s.blendEquation(32774),s.blendFunc(1,0),s.blendFuncSeparate(1,0,1,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(513),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(519,0,4294967295),s.stencilOp(7680,7680,7680),s.clearStencil(0),s.cullFace(1029),s.frontFace(2305),s.polygonOffset(0,0),s.activeTexture(33984),s.bindFramebuffer(36160,null),n===!0&&(s.bindFramebuffer(36009,null),s.bindFramebuffer(36008,null)),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),h={},I=null,K={},u=null,d={},f=null,p=!1,y=null,x=null,v=null,g=null,m=null,S=null,w=null,b=!1,F=null,L=null,O=null,ae=null,_=null,G.set(0,0,s.canvas.width,s.canvas.height),oe.set(0,0,s.canvas.width,s.canvas.height),o.reset(),c.reset(),l.reset()}return{buffers:{color:o,depth:c,stencil:l},enable:q,disable:se,bindFramebuffer:pe,bindXRFramebuffer:X,useProgram:ve,setBlending:k,setMaterial:ne,setFlipSided:ce,setCullFace:H,setLineWidth:j,setPolygonOffset:he,setScissorTest:de,activeTexture:ie,bindTexture:R,unbindTexture:T,compressedTexImage2D:te,texImage2D:$,texImage3D:xe,scissor:Z,viewport:Ie,reset:Ne}}function Jx(s,e,t,n,i,r,a){let o=i.isWebGL2,c=i.maxTextures,l=i.maxCubemapSize,h=i.maxTextureSize,u=i.maxSamples,d=new WeakMap,f,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function y(R,T){return p?new OffscreenCanvas(R,T):document.createElementNS("http://www.w3.org/1999/xhtml","canvas")}function x(R,T,te,$){let xe=1;if((R.width>$||R.height>$)&&(xe=$/Math.max(R.width,R.height)),xe<1||T===!0)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap){let Z=T?Wf:Math.floor,Ie=Z(xe*R.width),Ne=Z(xe*R.height);f===void 0&&(f=y(Ie,Ne));let ee=te?y(Ie,Ne):f;return ee.width=Ie,ee.height=Ne,ee.getContext("2d").drawImage(R,0,0,Ie,Ne),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+R.width+"x"+R.height+") to ("+Ie+"x"+Ne+")."),ee}else return"data"in R&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+R.width+"x"+R.height+")."),R;return R}function v(R){return Oc(R.width)&&Oc(R.height)}function g(R){return o?!1:R.wrapS!==un||R.wrapT!==un||R.minFilter!==jt&&R.minFilter!==Jt}function m(R,T){return R.generateMipmaps&&T&&R.minFilter!==jt&&R.minFilter!==Jt}function S(R,T,te,$){s.generateMipmap(R);let xe=n.get(T);xe.__maxMipLevel=Math.log2(Math.max(te,$))}function w(R,T,te){if(o===!1)return T;if(R!==null){if(s[R]!==void 0)return s[R];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let $=T;return T===6403&&(te===5126&&($=33326),te===5131&&($=33325),te===5121&&($=33321)),T===6407&&(te===5126&&($=34837),te===5131&&($=34843),te===5121&&($=32849)),T===6408&&(te===5126&&($=34836),te===5131&&($=34842),te===5121&&($=32856)),($===33325||$===33326||$===34842||$===34836)&&e.get("EXT_color_buffer_float"),$}function b(R){return R===jt||R===Fo||R===Bo?9728:9729}function F(R){let T=R.target;T.removeEventListener("dispose",F),O(T),T.isVideoTexture&&d.delete(T),a.memory.textures--}function L(R){let T=R.target;T.removeEventListener("dispose",L),ae(T),a.memory.textures--}function O(R){let T=n.get(R);T.__webglInit!==void 0&&(s.deleteTexture(T.__webglTexture),n.remove(R))}function ae(R){let T=R.texture,te=n.get(R),$=n.get(T);if(R){if($.__webglTexture!==void 0&&s.deleteTexture($.__webglTexture),R.depthTexture&&R.depthTexture.dispose(),R.isWebGLCubeRenderTarget)for(let xe=0;xe<6;xe++)s.deleteFramebuffer(te.__webglFramebuffer[xe]),te.__webglDepthbuffer&&s.deleteRenderbuffer(te.__webglDepthbuffer[xe]);else s.deleteFramebuffer(te.__webglFramebuffer),te.__webglDepthbuffer&&s.deleteRenderbuffer(te.__webglDepthbuffer),te.__webglMultisampledFramebuffer&&s.deleteFramebuffer(te.__webglMultisampledFramebuffer),te.__webglColorRenderbuffer&&s.deleteRenderbuffer(te.__webglColorRenderbuffer),te.__webglDepthRenderbuffer&&s.deleteRenderbuffer(te.__webglDepthRenderbuffer);n.remove(T),n.remove(R)}}let _=0;function E(){_=0}function z(){let R=_;return R>=c&&console.warn("THREE.WebGLTextures: Trying to use "+R+" texture units while this GPU supports only "+c),_+=1,R}function D(R,T){let te=n.get(R);if(R.isVideoTexture&&H(R),R.version>0&&te.__version!==R.version){let $=R.image;if($===void 0)console.warn("THREE.WebGLRenderer: Texture marked for update but image is undefined");else if($.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{q(te,R,T);return}}t.activeTexture(33984+T),t.bindTexture(3553,te.__webglTexture)}function C(R,T){let te=n.get(R);if(R.version>0&&te.__version!==R.version){q(te,R,T);return}t.activeTexture(33984+T),t.bindTexture(35866,te.__webglTexture)}function I(R,T){let te=n.get(R);if(R.version>0&&te.__version!==R.version){q(te,R,T);return}t.activeTexture(33984+T),t.bindTexture(32879,te.__webglTexture)}function K(R,T){let te=n.get(R);if(R.version>0&&te.__version!==R.version){se(te,R,T);return}t.activeTexture(33984+T),t.bindTexture(34067,te.__webglTexture)}let G={[_s]:10497,[un]:33071,[Ss]:33648},oe={[jt]:9728,[Fo]:9984,[Bo]:9986,[Jt]:9729,[wu]:9985,[es]:9987};function le(R,T,te){if(te?(s.texParameteri(R,10242,G[T.wrapS]),s.texParameteri(R,10243,G[T.wrapT]),(R===32879||R===35866)&&s.texParameteri(R,32882,G[T.wrapR]),s.texParameteri(R,10240,oe[T.magFilter]),s.texParameteri(R,10241,oe[T.minFilter])):(s.texParameteri(R,10242,33071),s.texParameteri(R,10243,33071),(R===32879||R===35866)&&s.texParameteri(R,32882,33071),(T.wrapS!==un||T.wrapT!==un)&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.wrapS and Texture.wrapT should be set to THREE.ClampToEdgeWrapping."),s.texParameteri(R,10240,b(T.magFilter)),s.texParameteri(R,10241,b(T.minFilter)),T.minFilter!==jt&&T.minFilter!==Jt&&console.warn("THREE.WebGLRenderer: Texture is not power of two. Texture.minFilter should be set to THREE.NearestFilter or THREE.LinearFilter.")),e.has("EXT_texture_filter_anisotropic")===!0){let $=e.get("EXT_texture_filter_anisotropic");if(T.type===Jn&&e.has("OES_texture_float_linear")===!1||o===!1&&T.type===Ts&&e.has("OES_texture_half_float_linear")===!1)return;(T.anisotropy>1||n.get(T).__currentAnisotropy)&&(s.texParameterf(R,$.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(T.anisotropy,i.getMaxAnisotropy())),n.get(T).__currentAnisotropy=T.anisotropy)}}function M(R,T){R.__webglInit===void 0&&(R.__webglInit=!0,T.addEventListener("dispose",F),R.__webglTexture=s.createTexture(),a.memory.textures++)}function q(R,T,te){let $=3553;T.isDataTexture2DArray&&($=35866),T.isDataTexture3D&&($=32879),M(R,T),t.activeTexture(33984+te),t.bindTexture($,R.__webglTexture),s.pixelStorei(37440,T.flipY),s.pixelStorei(37441,T.premultiplyAlpha),s.pixelStorei(3317,T.unpackAlignment),s.pixelStorei(37443,0);let xe=g(T)&&v(T.image)===!1,Z=x(T.image,xe,!1,h),Ie=v(Z)||o,Ne=r.convert(T.format),ee=r.convert(T.type),Ee=w(T.internalFormat,Ne,ee);le($,T,Ie);let Ue,Ve=T.mipmaps;if(T.isDepthTexture)Ee=6402,o?T.type===Jn?Ee=36012:T.type===xs?Ee=33190:T.type===Tr?Ee=35056:Ee=33189:T.type===Jn&&console.error("WebGLRenderer: Floating point depth texture requires WebGL2."),T.format===Ni&&Ee===6402&&T.type!==As&&T.type!==xs&&(console.warn("THREE.WebGLRenderer: Use UnsignedShortType or UnsignedIntType for DepthFormat DepthTexture."),T.type=As,ee=r.convert(T.type)),T.format===Cr&&Ee===6402&&(Ee=34041,T.type!==Tr&&(console.warn("THREE.WebGLRenderer: Use UnsignedInt248Type for DepthStencilFormat DepthTexture."),T.type=Tr,ee=r.convert(T.type))),t.texImage2D(3553,0,Ee,Z.width,Z.height,0,Ne,ee,null);else if(T.isDataTexture)if(Ve.length>0&&Ie){for(let we=0,Qe=Ve.length;we<Qe;we++)Ue=Ve[we],t.texImage2D(3553,we,Ee,Ue.width,Ue.height,0,Ne,ee,Ue.data);T.generateMipmaps=!1,R.__maxMipLevel=Ve.length-1}else t.texImage2D(3553,0,Ee,Z.width,Z.height,0,Ne,ee,Z.data),R.__maxMipLevel=0;else if(T.isCompressedTexture){for(let we=0,Qe=Ve.length;we<Qe;we++)Ue=Ve[we],T.format!==xn&&T.format!==pi?Ne!==null?t.compressedTexImage2D(3553,we,Ee,Ue.width,Ue.height,0,Ue.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):t.texImage2D(3553,we,Ee,Ue.width,Ue.height,0,Ne,ee,Ue.data);R.__maxMipLevel=Ve.length-1}else if(T.isDataTexture2DArray)t.texImage3D(35866,0,Ee,Z.width,Z.height,Z.depth,0,Ne,ee,Z.data),R.__maxMipLevel=0;else if(T.isDataTexture3D)t.texImage3D(32879,0,Ee,Z.width,Z.height,Z.depth,0,Ne,ee,Z.data),R.__maxMipLevel=0;else if(Ve.length>0&&Ie){for(let we=0,Qe=Ve.length;we<Qe;we++)Ue=Ve[we],t.texImage2D(3553,we,Ee,Ne,ee,Ue);T.generateMipmaps=!1,R.__maxMipLevel=Ve.length-1}else t.texImage2D(3553,0,Ee,Ne,ee,Z),R.__maxMipLevel=0;m(T,Ie)&&S($,T,Z.width,Z.height),R.__version=T.version,T.onUpdate&&T.onUpdate(T)}function se(R,T,te){if(T.image.length!==6)return;M(R,T),t.activeTexture(33984+te),t.bindTexture(34067,R.__webglTexture),s.pixelStorei(37440,T.flipY),s.pixelStorei(37441,T.premultiplyAlpha),s.pixelStorei(3317,T.unpackAlignment),s.pixelStorei(37443,0);let $=T&&(T.isCompressedTexture||T.image[0].isCompressedTexture),xe=T.image[0]&&T.image[0].isDataTexture,Z=[];for(let we=0;we<6;we++)!$&&!xe?Z[we]=x(T.image[we],!1,!0,l):Z[we]=xe?T.image[we].image:T.image[we];let Ie=Z[0],Ne=v(Ie)||o,ee=r.convert(T.format),Ee=r.convert(T.type),Ue=w(T.internalFormat,ee,Ee);le(34067,T,Ne);let Ve;if($){for(let we=0;we<6;we++){Ve=Z[we].mipmaps;for(let Qe=0;Qe<Ve.length;Qe++){let ct=Ve[Qe];T.format!==xn&&T.format!==pi?ee!==null?t.compressedTexImage2D(34069+we,Qe,Ue,ct.width,ct.height,0,ct.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):t.texImage2D(34069+we,Qe,Ue,ct.width,ct.height,0,ee,Ee,ct.data)}}R.__maxMipLevel=Ve.length-1}else{Ve=T.mipmaps;for(let we=0;we<6;we++)if(xe){t.texImage2D(34069+we,0,Ue,Z[we].width,Z[we].height,0,ee,Ee,Z[we].data);for(let Qe=0;Qe<Ve.length;Qe++){let vt=Ve[Qe].image[we].image;t.texImage2D(34069+we,Qe+1,Ue,vt.width,vt.height,0,ee,Ee,vt.data)}}else{t.texImage2D(34069+we,0,Ue,ee,Ee,Z[we]);for(let Qe=0;Qe<Ve.length;Qe++){let ct=Ve[Qe];t.texImage2D(34069+we,Qe+1,Ue,ee,Ee,ct.image[we])}}R.__maxMipLevel=Ve.length}m(T,Ne)&&S(34067,T,Ie.width,Ie.height),R.__version=T.version,T.onUpdate&&T.onUpdate(T)}function X(R,T,te,$){let xe=T.texture,Z=r.convert(xe.format),Ie=r.convert(xe.type),Ne=w(xe.internalFormat,Z,Ie);$===32879||$===35866?t.texImage3D($,0,Ne,T.width,T.height,T.depth,0,Z,Ie,null):t.texImage2D($,0,Ne,T.width,T.height,0,Z,Ie,null),t.bindFramebuffer(36160,R),s.framebufferTexture2D(36160,te,$,n.get(xe).__webglTexture,0),t.bindFramebuffer(36160,null)}function pe(R,T,te){if(s.bindRenderbuffer(36161,R),T.depthBuffer&&!T.stencilBuffer){let $=33189;if(te){let xe=T.depthTexture;xe&&xe.isDepthTexture&&(xe.type===Jn?$=36012:xe.type===xs&&($=33190));let Z=ce(T);s.renderbufferStorageMultisample(36161,Z,$,T.width,T.height)}else s.renderbufferStorage(36161,$,T.width,T.height);s.framebufferRenderbuffer(36160,36096,36161,R)}else if(T.depthBuffer&&T.stencilBuffer){if(te){let $=ce(T);s.renderbufferStorageMultisample(36161,$,35056,T.width,T.height)}else s.renderbufferStorage(36161,34041,T.width,T.height);s.framebufferRenderbuffer(36160,33306,36161,R)}else{let $=T.texture,xe=r.convert($.format),Z=r.convert($.type),Ie=w($.internalFormat,xe,Z);if(te){let Ne=ce(T);s.renderbufferStorageMultisample(36161,Ne,Ie,T.width,T.height)}else s.renderbufferStorage(36161,Ie,T.width,T.height)}s.bindRenderbuffer(36161,null)}function ve(R,T){if(T&&T.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(36160,R),!(T.depthTexture&&T.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!n.get(T.depthTexture).__webglTexture||T.depthTexture.image.width!==T.width||T.depthTexture.image.height!==T.height)&&(T.depthTexture.image.width=T.width,T.depthTexture.image.height=T.height,T.depthTexture.needsUpdate=!0),D(T.depthTexture,0);let $=n.get(T.depthTexture).__webglTexture;if(T.depthTexture.format===Ni)s.framebufferTexture2D(36160,36096,3553,$,0);else if(T.depthTexture.format===Cr)s.framebufferTexture2D(36160,33306,3553,$,0);else throw new Error("Unknown depthTexture format")}function fe(R){let T=n.get(R),te=R.isWebGLCubeRenderTarget===!0;if(R.depthTexture){if(te)throw new Error("target.depthTexture not supported in Cube render targets");ve(T.__webglFramebuffer,R)}else if(te){T.__webglDepthbuffer=[];for(let $=0;$<6;$++)t.bindFramebuffer(36160,T.__webglFramebuffer[$]),T.__webglDepthbuffer[$]=s.createRenderbuffer(),pe(T.__webglDepthbuffer[$],R,!1)}else t.bindFramebuffer(36160,T.__webglFramebuffer),T.__webglDepthbuffer=s.createRenderbuffer(),pe(T.__webglDepthbuffer,R,!1);t.bindFramebuffer(36160,null)}function J(R){let T=R.texture,te=n.get(R),$=n.get(T);R.addEventListener("dispose",L),$.__webglTexture=s.createTexture(),$.__version=T.version,a.memory.textures++;let xe=R.isWebGLCubeRenderTarget===!0,Z=R.isWebGLMultisampleRenderTarget===!0,Ie=T.isDataTexture3D||T.isDataTexture2DArray,Ne=v(R)||o;if(o&&T.format===pi&&(T.type===Jn||T.type===Ts)&&(T.format=xn,console.warn("THREE.WebGLRenderer: Rendering to textures with RGB format is not supported. Using RGBA format instead.")),xe){te.__webglFramebuffer=[];for(let ee=0;ee<6;ee++)te.__webglFramebuffer[ee]=s.createFramebuffer()}else if(te.__webglFramebuffer=s.createFramebuffer(),Z)if(o){te.__webglMultisampledFramebuffer=s.createFramebuffer(),te.__webglColorRenderbuffer=s.createRenderbuffer(),s.bindRenderbuffer(36161,te.__webglColorRenderbuffer);let ee=r.convert(T.format),Ee=r.convert(T.type),Ue=w(T.internalFormat,ee,Ee),Ve=ce(R);s.renderbufferStorageMultisample(36161,Ve,Ue,R.width,R.height),t.bindFramebuffer(36160,te.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(36160,36064,36161,te.__webglColorRenderbuffer),s.bindRenderbuffer(36161,null),R.depthBuffer&&(te.__webglDepthRenderbuffer=s.createRenderbuffer(),pe(te.__webglDepthRenderbuffer,R,!0)),t.bindFramebuffer(36160,null)}else console.warn("THREE.WebGLRenderer: WebGLMultisampleRenderTarget can only be used with WebGL2.");if(xe){t.bindTexture(34067,$.__webglTexture),le(34067,T,Ne);for(let ee=0;ee<6;ee++)X(te.__webglFramebuffer[ee],R,36064,34069+ee);m(T,Ne)&&S(34067,T,R.width,R.height),t.bindTexture(34067,null)}else{let ee=3553;Ie&&(o?ee=T.isDataTexture3D?32879:35866:console.warn("THREE.DataTexture3D and THREE.DataTexture2DArray only supported with WebGL2.")),t.bindTexture(ee,$.__webglTexture),le(ee,T,Ne),X(te.__webglFramebuffer,R,36064,ee),m(T,Ne)&&S(3553,T,R.width,R.height),t.bindTexture(3553,null)}R.depthBuffer&&fe(R)}function k(R){let T=R.texture,te=v(R)||o;if(m(T,te)){let $=R.isWebGLCubeRenderTarget?34067:3553,xe=n.get(T).__webglTexture;t.bindTexture($,xe),S($,T,R.width,R.height),t.bindTexture($,null)}}function ne(R){if(R.isWebGLMultisampleRenderTarget)if(o){let T=R.width,te=R.height,$=16384;R.depthBuffer&&($|=256),R.stencilBuffer&&($|=1024);let xe=n.get(R);t.bindFramebuffer(36008,xe.__webglMultisampledFramebuffer),t.bindFramebuffer(36009,xe.__webglFramebuffer),s.blitFramebuffer(0,0,T,te,0,0,T,te,$,9728),t.bindFramebuffer(36008,null),t.bindFramebuffer(36009,xe.__webglMultisampledFramebuffer)}else console.warn("THREE.WebGLRenderer: WebGLMultisampleRenderTarget can only be used with WebGL2.")}function ce(R){return o&&R.isWebGLMultisampleRenderTarget?Math.min(u,R.samples):0}function H(R){let T=a.render.frame;d.get(R)!==T&&(d.set(R,T),R.update())}let j=!1,he=!1;function de(R,T){R&&R.isWebGLRenderTarget&&(j===!1&&(console.warn("THREE.WebGLTextures.safeSetTexture2D: don't use render targets as textures. Use their .texture property instead."),j=!0),R=R.texture),D(R,T)}function ie(R,T){R&&R.isWebGLCubeRenderTarget&&(he===!1&&(console.warn("THREE.WebGLTextures.safeSetTextureCube: don't use cube render targets as textures. Use their .texture property instead."),he=!0),R=R.texture),K(R,T)}this.allocateTextureUnit=z,this.resetTextureUnits=E,this.setTexture2D=D,this.setTexture2DArray=C,this.setTexture3D=I,this.setTextureCube=K,this.setupRenderTarget=J,this.updateRenderTargetMipmap=k,this.updateMultisampleRenderTarget=ne,this.safeSetTexture2D=de,this.safeSetTextureCube=ie}function tp(s,e,t){let n=t.isWebGL2;function i(r){let a;if(r===ts)return 5121;if(r===Wd)return 32819;if(r===Vd)return 32820;if(r===Hd)return 33635;if(r===Ud)return 5120;if(r===Od)return 5122;if(r===As)return 5123;if(r===Gd)return 5124;if(r===xs)return 5125;if(r===Jn)return 5126;if(r===Ts)return n?5131:(a=e.get("OES_texture_half_float"),a!==null?a.HALF_FLOAT_OES:null);if(r===qd)return 6406;if(r===pi)return 6407;if(r===xn)return 6408;if(r===Xd)return 6409;if(r===Yd)return 6410;if(r===Ni)return 6402;if(r===Cr)return 34041;if(r===jd)return 6403;if(r===Jd)return 36244;if(r===$d)return 33319;if(r===Kd)return 33320;if(r===Qd)return 36248;if(r===ef)return 36249;if(r===Pc||r===Lc||r===Rc||r===zc)if(a=e.get("WEBGL_compressed_texture_s3tc"),a!==null){if(r===Pc)return a.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===Lc)return a.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===Rc)return a.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===zc)return a.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===Dc||r===Ic||r===Fc||r===Bc)if(a=e.get("WEBGL_compressed_texture_pvrtc"),a!==null){if(r===Dc)return a.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===Ic)return a.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===Fc)return a.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===Bc)return a.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===tf)return a=e.get("WEBGL_compressed_texture_etc1"),a!==null?a.COMPRESSED_RGB_ETC1_WEBGL:null;if((r===kc||r===Nc)&&(a=e.get("WEBGL_compressed_texture_etc"),a!==null)){if(r===kc)return a.COMPRESSED_RGB8_ETC2;if(r===Nc)return a.COMPRESSED_RGBA8_ETC2_EAC}if(r===nf||r===rf||r===sf||r===af||r===of||r===lf||r===cf||r===uf||r===hf||r===df||r===ff||r===pf||r===mf||r===gf||r===xf||r===yf||r===bf||r===wf||r===Mf||r===_f||r===Sf||r===Af||r===Tf||r===Ef||r===Cf||r===Pf||r===Lf||r===Rf)return a=e.get("WEBGL_compressed_texture_astc"),a!==null?r:null;if(r===vf)return a=e.get("EXT_texture_compression_bptc"),a!==null?r:null;if(r===Tr)return n?34042:(a=e.get("WEBGL_depth_texture"),a!==null?a.UNSIGNED_INT_24_8_WEBGL:null)}return{convert:i}}var Is=class extends qt{constructor(e=[]){super(),this.cameras=e}};Is.prototype.isArrayCamera=!0;var $n=class extends Ct{constructor(){super(),this.type="Group"}};$n.prototype.isGroup=!0;var $x={type:"move"},bs=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new $n,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new $n,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new Y,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new Y),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new $n,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new Y,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new Y),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,r=null,a=null,o=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred")if(o!==null&&(i=t.getPose(e.targetRaySpace,n),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent($x))),l&&e.hand){a=!0;for(let y of e.hand.values()){let x=t.getJointPose(y,n);if(l.joints[y.jointName]===void 0){let g=new $n;g.matrixAutoUpdate=!1,g.visible=!1,l.joints[y.jointName]=g,l.add(g)}let v=l.joints[y.jointName];x!==null&&(v.matrix.fromArray(x.transform.matrix),v.matrix.decompose(v.position,v.rotation,v.scale),v.jointRadius=x.radius),v.visible=x!==null}let h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],d=h.position.distanceTo(u.position),f=.02,p=.005;l.inputState.pinching&&d>f+p?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=f-p&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));return o!==null&&(o.visible=i!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=a!==null),this}},Wc=class extends Un{constructor(e,t){super();let n=this,i=e.state,r=null,a=1,o=null,c="local-floor",l=null,h=[],u=new Map,d=new qt;d.layers.enable(1),d.viewport=new Lt;let f=new qt;f.layers.enable(2),f.viewport=new Lt;let p=[d,f],y=new Is;y.layers.enable(1),y.layers.enable(2);let x=null,v=null;this.enabled=!1,this.isPresenting=!1,this.getController=function(E){let z=h[E];return z===void 0&&(z=new bs,h[E]=z),z.getTargetRaySpace()},this.getControllerGrip=function(E){let z=h[E];return z===void 0&&(z=new bs,h[E]=z),z.getGripSpace()},this.getHand=function(E){let z=h[E];return z===void 0&&(z=new bs,h[E]=z),z.getHandSpace()};function g(E){let z=u.get(E.inputSource);z&&z.dispatchEvent({type:E.type,data:E.inputSource})}function m(){u.forEach(function(E,z){E.disconnect(z)}),u.clear(),x=null,v=null,i.bindXRFramebuffer(null),e.setRenderTarget(e.getRenderTarget()),_.stop(),n.isPresenting=!1,n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(E){a=E,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(E){c=E,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return o},this.getSession=function(){return r},this.setSession=async function(E){if(r=E,r!==null){r.addEventListener("select",g),r.addEventListener("selectstart",g),r.addEventListener("selectend",g),r.addEventListener("squeeze",g),r.addEventListener("squeezestart",g),r.addEventListener("squeezeend",g),r.addEventListener("end",m),r.addEventListener("inputsourceschange",S);let z=t.getContextAttributes();z.xrCompatible!==!0&&await t.makeXRCompatible();let D={antialias:z.antialias,alpha:z.alpha,depth:z.depth,stencil:z.stencil,framebufferScaleFactor:a},C=new XRWebGLLayer(r,t,D);r.updateRenderState({baseLayer:C}),o=await r.requestReferenceSpace(c),_.setContext(r),_.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}};function S(E){let z=r.inputSources;for(let D=0;D<h.length;D++)u.set(z[D],h[D]);for(let D=0;D<E.removed.length;D++){let C=E.removed[D],I=u.get(C);I&&(I.dispatchEvent({type:"disconnected",data:C}),u.delete(C))}for(let D=0;D<E.added.length;D++){let C=E.added[D],I=u.get(C);I&&I.dispatchEvent({type:"connected",data:C})}}let w=new Y,b=new Y;function F(E,z,D){w.setFromMatrixPosition(z.matrixWorld),b.setFromMatrixPosition(D.matrixWorld);let C=w.distanceTo(b),I=z.projectionMatrix.elements,K=D.projectionMatrix.elements,G=I[14]/(I[10]-1),oe=I[14]/(I[10]+1),le=(I[9]+1)/I[5],M=(I[9]-1)/I[5],q=(I[8]-1)/I[0],se=(K[8]+1)/K[0],X=G*q,pe=G*se,ve=C/(-q+se),fe=ve*-q;z.matrixWorld.decompose(E.position,E.quaternion,E.scale),E.translateX(fe),E.translateZ(ve),E.matrixWorld.compose(E.position,E.quaternion,E.scale),E.matrixWorldInverse.copy(E.matrixWorld).invert();let J=G+ve,k=oe+ve,ne=X-fe,ce=pe+(C-fe),H=le*oe/k*J,j=M*oe/k*J;E.projectionMatrix.makePerspective(ne,ce,H,j,J,k)}function L(E,z){z===null?E.matrixWorld.copy(E.matrix):E.matrixWorld.multiplyMatrices(z.matrixWorld,E.matrix),E.matrixWorldInverse.copy(E.matrixWorld).invert()}this.getCamera=function(E){y.near=f.near=d.near=E.near,y.far=f.far=d.far=E.far,(x!==y.near||v!==y.far)&&(r.updateRenderState({depthNear:y.near,depthFar:y.far}),x=y.near,v=y.far);let z=E.parent,D=y.cameras;L(y,z);for(let I=0;I<D.length;I++)L(D[I],z);E.matrixWorld.copy(y.matrixWorld),E.matrix.copy(y.matrix),E.matrix.decompose(E.position,E.quaternion,E.scale);let C=E.children;for(let I=0,K=C.length;I<K;I++)C[I].updateMatrixWorld(!0);return D.length===2?F(y,d,f):y.projectionMatrix.copy(d.projectionMatrix),y};let O=null;function ae(E,z){if(l=z.getViewerPose(o),l!==null){let C=l.views,I=r.renderState.baseLayer;i.bindXRFramebuffer(I.framebuffer);let K=!1;C.length!==y.cameras.length&&(y.cameras.length=0,K=!0);for(let G=0;G<C.length;G++){let oe=C[G],le=I.getViewport(oe),M=p[G];M.matrix.fromArray(oe.transform.matrix),M.projectionMatrix.fromArray(oe.projectionMatrix),M.viewport.set(le.x,le.y,le.width,le.height),G===0&&y.matrix.copy(M.matrix),K===!0&&y.cameras.push(M)}}let D=r.inputSources;for(let C=0;C<h.length;C++){let I=h[C],K=D[C];I.update(K,z,o)}O&&O(E,z)}let _=new Xf;_.setAnimationLoop(ae),this.setAnimationLoop=function(E){O=E},this.dispose=function(){}}};function Kx(s){function e(v,g){v.fogColor.value.copy(g.color),g.isFog?(v.fogNear.value=g.near,v.fogFar.value=g.far):g.isFogExp2&&(v.fogDensity.value=g.density)}function t(v,g,m,S){g.isMeshBasicMaterial?n(v,g):g.isMeshLambertMaterial?(n(v,g),c(v,g)):g.isMeshToonMaterial?(n(v,g),h(v,g)):g.isMeshPhongMaterial?(n(v,g),l(v,g)):g.isMeshStandardMaterial?(n(v,g),g.isMeshPhysicalMaterial?d(v,g):u(v,g)):g.isMeshMatcapMaterial?(n(v,g),f(v,g)):g.isMeshDepthMaterial?(n(v,g),p(v,g)):g.isMeshDistanceMaterial?(n(v,g),y(v,g)):g.isMeshNormalMaterial?(n(v,g),x(v,g)):g.isLineBasicMaterial?(i(v,g),g.isLineDashedMaterial&&r(v,g)):g.isPointsMaterial?a(v,g,m,S):g.isSpriteMaterial?o(v,g):g.isShadowMaterial?(v.color.value.copy(g.color),v.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function n(v,g){v.opacity.value=g.opacity,g.color&&v.diffuse.value.copy(g.color),g.emissive&&v.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(v.map.value=g.map),g.alphaMap&&(v.alphaMap.value=g.alphaMap),g.specularMap&&(v.specularMap.value=g.specularMap);let m=s.get(g).envMap;if(m){v.envMap.value=m,v.flipEnvMap.value=m.isCubeTexture&&m._needsFlipEnvMap?-1:1,v.reflectivity.value=g.reflectivity,v.refractionRatio.value=g.refractionRatio;let b=s.get(m).__maxMipLevel;b!==void 0&&(v.maxMipLevel.value=b)}g.lightMap&&(v.lightMap.value=g.lightMap,v.lightMapIntensity.value=g.lightMapIntensity),g.aoMap&&(v.aoMap.value=g.aoMap,v.aoMapIntensity.value=g.aoMapIntensity);let S;g.map?S=g.map:g.specularMap?S=g.specularMap:g.displacementMap?S=g.displacementMap:g.normalMap?S=g.normalMap:g.bumpMap?S=g.bumpMap:g.roughnessMap?S=g.roughnessMap:g.metalnessMap?S=g.metalnessMap:g.alphaMap?S=g.alphaMap:g.emissiveMap?S=g.emissiveMap:g.clearcoatMap?S=g.clearcoatMap:g.clearcoatNormalMap?S=g.clearcoatNormalMap:g.clearcoatRoughnessMap&&(S=g.clearcoatRoughnessMap),S!==void 0&&(S.isWebGLRenderTarget&&(S=S.texture),S.matrixAutoUpdate===!0&&S.updateMatrix(),v.uvTransform.value.copy(S.matrix));let w;g.aoMap?w=g.aoMap:g.lightMap&&(w=g.lightMap),w!==void 0&&(w.isWebGLRenderTarget&&(w=w.texture),w.matrixAutoUpdate===!0&&w.updateMatrix(),v.uv2Transform.value.copy(w.matrix))}function i(v,g){v.diffuse.value.copy(g.color),v.opacity.value=g.opacity}function r(v,g){v.dashSize.value=g.dashSize,v.totalSize.value=g.dashSize+g.gapSize,v.scale.value=g.scale}function a(v,g,m,S){v.diffuse.value.copy(g.color),v.opacity.value=g.opacity,v.size.value=g.size*m,v.scale.value=S*.5,g.map&&(v.map.value=g.map),g.alphaMap&&(v.alphaMap.value=g.alphaMap);let w;g.map?w=g.map:g.alphaMap&&(w=g.alphaMap),w!==void 0&&(w.matrixAutoUpdate===!0&&w.updateMatrix(),v.uvTransform.value.copy(w.matrix))}function o(v,g){v.diffuse.value.copy(g.color),v.opacity.value=g.opacity,v.rotation.value=g.rotation,g.map&&(v.map.value=g.map),g.alphaMap&&(v.alphaMap.value=g.alphaMap);let m;g.map?m=g.map:g.alphaMap&&(m=g.alphaMap),m!==void 0&&(m.matrixAutoUpdate===!0&&m.updateMatrix(),v.uvTransform.value.copy(m.matrix))}function c(v,g){g.emissiveMap&&(v.emissiveMap.value=g.emissiveMap)}function l(v,g){v.specular.value.copy(g.specular),v.shininess.value=Math.max(g.shininess,1e-4),g.emissiveMap&&(v.emissiveMap.value=g.emissiveMap),g.bumpMap&&(v.bumpMap.value=g.bumpMap,v.bumpScale.value=g.bumpScale,g.side===Ht&&(v.bumpScale.value*=-1)),g.normalMap&&(v.normalMap.value=g.normalMap,v.normalScale.value.copy(g.normalScale),g.side===Ht&&v.normalScale.value.negate()),g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias)}function h(v,g){g.gradientMap&&(v.gradientMap.value=g.gradientMap),g.emissiveMap&&(v.emissiveMap.value=g.emissiveMap),g.bumpMap&&(v.bumpMap.value=g.bumpMap,v.bumpScale.value=g.bumpScale,g.side===Ht&&(v.bumpScale.value*=-1)),g.normalMap&&(v.normalMap.value=g.normalMap,v.normalScale.value.copy(g.normalScale),g.side===Ht&&v.normalScale.value.negate()),g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias)}function u(v,g){v.roughness.value=g.roughness,v.metalness.value=g.metalness,g.roughnessMap&&(v.roughnessMap.value=g.roughnessMap),g.metalnessMap&&(v.metalnessMap.value=g.metalnessMap),g.emissiveMap&&(v.emissiveMap.value=g.emissiveMap),g.bumpMap&&(v.bumpMap.value=g.bumpMap,v.bumpScale.value=g.bumpScale,g.side===Ht&&(v.bumpScale.value*=-1)),g.normalMap&&(v.normalMap.value=g.normalMap,v.normalScale.value.copy(g.normalScale),g.side===Ht&&v.normalScale.value.negate()),g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias),s.get(g).envMap&&(v.envMapIntensity.value=g.envMapIntensity)}function d(v,g){u(v,g),v.reflectivity.value=g.reflectivity,v.clearcoat.value=g.clearcoat,v.clearcoatRoughness.value=g.clearcoatRoughness,g.sheen&&v.sheen.value.copy(g.sheen),g.clearcoatMap&&(v.clearcoatMap.value=g.clearcoatMap),g.clearcoatRoughnessMap&&(v.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap),g.clearcoatNormalMap&&(v.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),v.clearcoatNormalMap.value=g.clearcoatNormalMap,g.side===Ht&&v.clearcoatNormalScale.value.negate()),v.transmission.value=g.transmission,g.transmissionMap&&(v.transmissionMap.value=g.transmissionMap)}function f(v,g){g.matcap&&(v.matcap.value=g.matcap),g.bumpMap&&(v.bumpMap.value=g.bumpMap,v.bumpScale.value=g.bumpScale,g.side===Ht&&(v.bumpScale.value*=-1)),g.normalMap&&(v.normalMap.value=g.normalMap,v.normalScale.value.copy(g.normalScale),g.side===Ht&&v.normalScale.value.negate()),g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias)}function p(v,g){g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias)}function y(v,g){g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias),v.referencePosition.value.copy(g.referencePosition),v.nearDistance.value=g.nearDistance,v.farDistance.value=g.farDistance}function x(v,g){g.bumpMap&&(v.bumpMap.value=g.bumpMap,v.bumpScale.value=g.bumpScale,g.side===Ht&&(v.bumpScale.value*=-1)),g.normalMap&&(v.normalMap.value=g.normalMap,v.normalScale.value.copy(g.normalScale),g.side===Ht&&v.normalScale.value.negate()),g.displacementMap&&(v.displacementMap.value=g.displacementMap,v.displacementScale.value=g.displacementScale,v.displacementBias.value=g.displacementBias)}return{refreshFogUniforms:e,refreshMaterialUniforms:t}}function Qx(){let s=document.createElementNS("http://www.w3.org/1999/xhtml","canvas");return s.style.display="block",s}function Dt(s){s=s||{};let e=s.canvas!==void 0?s.canvas:Qx(),t=s.context!==void 0?s.context:null,n=s.alpha!==void 0?s.alpha:!1,i=s.depth!==void 0?s.depth:!0,r=s.stencil!==void 0?s.stencil:!0,a=s.antialias!==void 0?s.antialias:!1,o=s.premultipliedAlpha!==void 0?s.premultipliedAlpha:!0,c=s.preserveDrawingBuffer!==void 0?s.preserveDrawingBuffer:!1,l=s.powerPreference!==void 0?s.powerPreference:"default",h=s.failIfMajorPerformanceCaveat!==void 0?s.failIfMajorPerformanceCaveat:!1,u=null,d=null,f=[],p=[];this.domElement=e,this.debug={checkShaderErrors:!0},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.gammaFactor=2,this.outputEncoding=hn,this.physicallyCorrectLights=!1,this.toneMapping=ki,this.toneMappingExposure=1;let y=this,x=!1,v=0,g=0,m=null,S=-1,w=null,b=new Lt,F=new Lt,L=null,O=e.width,ae=e.height,_=1,E=null,z=null,D=new Lt(0,0,O,ae),C=new Lt(0,0,O,ae),I=!1,K=new Wi,G=!1,oe=!1,le=new bt,M=new Y,q={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};function se(){return m===null?_:1}let X=t;function pe(N,Pe){for(let be=0;be<N.length;be++){let Te=N[be],He=e.getContext(Te,Pe);if(He!==null)return He}return null}try{let N={alpha:n,depth:i,stencil:r,antialias:a,premultipliedAlpha:o,preserveDrawingBuffer:c,powerPreference:l,failIfMajorPerformanceCaveat:h};if(e.addEventListener("webglcontextlost",Qe,!1),e.addEventListener("webglcontextrestored",ct,!1),X===null){let Pe=["webgl2","webgl","experimental-webgl"];if(y.isWebGL1Renderer===!0&&Pe.shift(),X=pe(Pe,N),X===null)throw pe(Pe)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}X.getShaderPrecisionFormat===void 0&&(X.getShaderPrecisionFormat=function(){return{rangeMin:1,rangeMax:1,precision:1}})}catch(N){throw console.error("THREE.WebGLRenderer: "+N.message),N}let ve,fe,J,k,ne,ce,H,j,he,de,ie,R,T,te,$,xe,Z,Ie,Ne,ee,Ee,Ue;function Ve(){ve=new _v(X),fe=new bv(X,ve,s),ve.init(fe),Ee=new tp(X,ve,fe),J=new jx(X,ve,fe),k=new Tv(X),ne=new kx,ce=new Jx(X,ve,J,ne,fe,Ee,k),H=new Mv(y),j=new j0(X,fe),Ue=new xv(X,ve,j,fe),he=new Sv(X,j,k,Ue),de=new Lv(X,he,j,k),Ie=new Pv(X),$=new wv(ne),ie=new Bx(y,H,ve,fe,Ue,$),R=new Kx(ne),T=new Ox(ne),te=new Xx(ve,fe),Z=new vv(y,H,J,de,o),xe=new ep(y,de,fe),Ne=new yv(X,ve,k,fe),ee=new Av(X,ve,k,fe),k.programs=ie.programs,y.capabilities=fe,y.extensions=ve,y.properties=ne,y.renderLists=T,y.shadowMap=xe,y.state=J,y.info=k}Ve();let we=new Wc(y,X);this.xr=we,this.getContext=function(){return X},this.getContextAttributes=function(){return X.getContextAttributes()},this.forceContextLoss=function(){let N=ve.get("WEBGL_lose_context");N&&N.loseContext()},this.forceContextRestore=function(){let N=ve.get("WEBGL_lose_context");N&&N.restoreContext()},this.getPixelRatio=function(){return _},this.setPixelRatio=function(N){N!==void 0&&(_=N,this.setSize(O,ae,!1))},this.getSize=function(N){return N===void 0&&(console.warn("WebGLRenderer: .getsize() now requires a Vector2 as an argument"),N=new Je),N.set(O,ae)},this.setSize=function(N,Pe,be){if(we.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}O=N,ae=Pe,e.width=Math.floor(N*_),e.height=Math.floor(Pe*_),be!==!1&&(e.style.width=N+"px",e.style.height=Pe+"px"),this.setViewport(0,0,N,Pe)},this.getDrawingBufferSize=function(N){return N===void 0&&(console.warn("WebGLRenderer: .getdrawingBufferSize() now requires a Vector2 as an argument"),N=new Je),N.set(O*_,ae*_).floor()},this.setDrawingBufferSize=function(N,Pe,be){O=N,ae=Pe,_=be,e.width=Math.floor(N*be),e.height=Math.floor(Pe*be),this.setViewport(0,0,N,Pe)},this.getCurrentViewport=function(N){return N===void 0&&(console.warn("WebGLRenderer: .getCurrentViewport() now requires a Vector4 as an argument"),N=new Lt),N.copy(b)},this.getViewport=function(N){return N.copy(D)},this.setViewport=function(N,Pe,be,Te){N.isVector4?D.set(N.x,N.y,N.z,N.w):D.set(N,Pe,be,Te),J.viewport(b.copy(D).multiplyScalar(_).floor())},this.getScissor=function(N){return N.copy(C)},this.setScissor=function(N,Pe,be,Te){N.isVector4?C.set(N.x,N.y,N.z,N.w):C.set(N,Pe,be,Te),J.scissor(F.copy(C).multiplyScalar(_).floor())},this.getScissorTest=function(){return I},this.setScissorTest=function(N){J.setScissorTest(I=N)},this.setOpaqueSort=function(N){E=N},this.setTransparentSort=function(N){z=N},this.getClearColor=function(N){return N===void 0&&(console.warn("WebGLRenderer: .getClearColor() now requires a Color as an argument"),N=new ut),N.copy(Z.getClearColor())},this.setClearColor=function(){Z.setClearColor.apply(Z,arguments)},this.getClearAlpha=function(){return Z.getClearAlpha()},this.setClearAlpha=function(){Z.setClearAlpha.apply(Z,arguments)},this.clear=function(N,Pe,be){let Te=0;(N===void 0||N)&&(Te|=16384),(Pe===void 0||Pe)&&(Te|=256),(be===void 0||be)&&(Te|=1024),X.clear(Te)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",Qe,!1),e.removeEventListener("webglcontextrestored",ct,!1),T.dispose(),te.dispose(),ne.dispose(),H.dispose(),de.dispose(),Ue.dispose(),we.dispose(),we.removeEventListener("sessionstart",qe),we.removeEventListener("sessionend",Me),Re.stop()};function Qe(N){N.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),x=!0}function ct(){console.log("THREE.WebGLRenderer: Context Restored."),x=!1;let N=k.autoReset,Pe=xe.enabled,be=xe.autoUpdate,Te=xe.needsUpdate,He=xe.type;Ve(),k.autoReset=N,xe.enabled=Pe,xe.autoUpdate=be,xe.needsUpdate=Te,xe.type=He}function vt(N){let Pe=N.target;Pe.removeEventListener("dispose",vt),xt(Pe)}function xt(N){tt(N),ne.remove(N)}function tt(N){let Pe=ne.get(N).programs;Pe!==void 0&&Pe.forEach(function(be){ie.releaseProgram(be)})}function Q(N,Pe){N.render(function(be){y.renderBufferImmediate(be,Pe)})}this.renderBufferImmediate=function(N,Pe){Ue.initAttributes();let be=ne.get(N);N.hasPositions&&!be.position&&(be.position=X.createBuffer()),N.hasNormals&&!be.normal&&(be.normal=X.createBuffer()),N.hasUvs&&!be.uv&&(be.uv=X.createBuffer()),N.hasColors&&!be.color&&(be.color=X.createBuffer());let Te=Pe.getAttributes();N.hasPositions&&(X.bindBuffer(34962,be.position),X.bufferData(34962,N.positionArray,35048),Ue.enableAttribute(Te.position),X.vertexAttribPointer(Te.position,3,5126,!1,0,0)),N.hasNormals&&(X.bindBuffer(34962,be.normal),X.bufferData(34962,N.normalArray,35048),Ue.enableAttribute(Te.normal),X.vertexAttribPointer(Te.normal,3,5126,!1,0,0)),N.hasUvs&&(X.bindBuffer(34962,be.uv),X.bufferData(34962,N.uvArray,35048),Ue.enableAttribute(Te.uv),X.vertexAttribPointer(Te.uv,2,5126,!1,0,0)),N.hasColors&&(X.bindBuffer(34962,be.color),X.bufferData(34962,N.colorArray,35048),Ue.enableAttribute(Te.color),X.vertexAttribPointer(Te.color,3,5126,!1,0,0)),Ue.disableUnusedAttributes(),X.drawArrays(4,0,N.count),N.count=0},this.renderBufferDirect=function(N,Pe,be,Te,He,rt){Pe===null&&(Pe=q);let A=He.isMesh&&He.matrixWorld.determinant()<0,We=ft(N,Pe,Te,He);J.setMaterial(Te,A);let Xe=be.index,De=be.attributes.position;if(Xe===null){if(De===void 0||De.count===0)return}else if(Xe.count===0)return;let U=1;Te.wireframe===!0&&(Xe=he.getWireframeAttribute(be),U=2),(Te.morphTargets||Te.morphNormals)&&Ie.update(He,be,Te,We),Ue.setup(He,Te,We,be,Xe);let P,at=Ne;Xe!==null&&(P=j.get(Xe),at=ee,at.setIndex(P));let ot=Xe!==null?Xe.count:De.count,it=be.drawRange.start*U,pt=be.drawRange.count*U,me=rt!==null?rt.start*U:0,ue=rt!==null?rt.count*U:1/0,Ae=Math.max(it,me),Ce=Math.min(ot,it+pt,me+ue)-1,B=Math.max(0,Ce-Ae+1);if(B!==0){if(He.isMesh)Te.wireframe===!0?(J.setLineWidth(Te.wireframeLinewidth*se()),at.setMode(1)):at.setMode(4);else if(He.isLine){let W=Te.linewidth;W===void 0&&(W=1),J.setLineWidth(W*se()),He.isLineSegments?at.setMode(1):He.isLineLoop?at.setMode(2):at.setMode(3)}else He.isPoints?at.setMode(0):He.isSprite&&at.setMode(4);if(He.isInstancedMesh)at.renderInstances(Ae,B,He.count);else if(be.isInstancedBufferGeometry){let W=Math.min(be.instanceCount,be._maxInstanceCount);at.renderInstances(Ae,B,W)}else at.render(Ae,B)}},this.compile=function(N,Pe){d=te.get(N),d.init(),N.traverseVisible(function(be){be.isLight&&be.layers.test(Pe.layers)&&(d.pushLight(be),be.castShadow&&d.pushShadow(be))}),d.setupLights(),N.traverse(function(be){let Te=be.material;if(Te)if(Array.isArray(Te))for(let He=0;He<Te.length;He++){let rt=Te[He];Fe(rt,N,be)}else Fe(Te,N,be)})};let Le=null;function Ge(N){Le&&Le(N)}function qe(){Re.stop()}function Me(){Re.start()}let Re=new Xf;Re.setAnimationLoop(Ge),typeof window<"u"&&Re.setContext(window),this.setAnimationLoop=function(N){Le=N,we.setAnimationLoop(N),N===null?Re.stop():Re.start()},we.addEventListener("sessionstart",qe),we.addEventListener("sessionend",Me),this.render=function(N,Pe){let be,Te;if(arguments[2]!==void 0&&(console.warn("THREE.WebGLRenderer.render(): the renderTarget argument has been removed. Use .setRenderTarget() instead."),be=arguments[2]),arguments[3]!==void 0&&(console.warn("THREE.WebGLRenderer.render(): the forceClear argument has been removed. Use .clear() instead."),Te=arguments[3]),Pe!==void 0&&Pe.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(x===!0)return;N.autoUpdate===!0&&N.updateMatrixWorld(),Pe.parent===null&&Pe.updateMatrixWorld(),we.enabled===!0&&we.isPresenting===!0&&(Pe=we.getCamera(Pe)),N.isScene===!0&&N.onBeforeRender(y,N,Pe,be||m),d=te.get(N,p.length),d.init(),p.push(d),le.multiplyMatrices(Pe.projectionMatrix,Pe.matrixWorldInverse),K.setFromProjectionMatrix(le),oe=this.localClippingEnabled,G=$.init(this.clippingPlanes,oe,Pe),u=T.get(N,f.length),u.init(),f.push(u),Be(N,Pe,0,y.sortObjects),u.finish(),y.sortObjects===!0&&u.sort(E,z),G===!0&&$.beginShadows();let He=d.state.shadowsArray;xe.render(He,N,Pe),d.setupLights(),d.setupLightsView(Pe),G===!0&&$.endShadows(),this.info.autoReset===!0&&this.info.reset(),be!==void 0&&this.setRenderTarget(be),Z.render(u,N,Pe,Te);let rt=u.opaque,A=u.transparent;rt.length>0&&Ze(rt,N,Pe),A.length>0&&Ze(A,N,Pe),m!==null&&(ce.updateRenderTargetMipmap(m),ce.updateMultisampleRenderTarget(m)),N.isScene===!0&&N.onAfterRender(y,N,Pe),J.buffers.depth.setTest(!0),J.buffers.depth.setMask(!0),J.buffers.color.setMask(!0),J.setPolygonOffset(!1),Ue.resetDefaultState(),S=-1,w=null,p.pop(),p.length>0?d=p[p.length-1]:d=null,f.pop(),f.length>0?u=f[f.length-1]:u=null};function Be(N,Pe,be,Te){if(N.visible===!1)return;if(N.layers.test(Pe.layers)){if(N.isGroup)be=N.renderOrder;else if(N.isLOD)N.autoUpdate===!0&&N.update(Pe);else if(N.isLight)d.pushLight(N),N.castShadow&&d.pushShadow(N);else if(N.isSprite){if(!N.frustumCulled||K.intersectsSprite(N)){Te&&M.setFromMatrixPosition(N.matrixWorld).applyMatrix4(le);let A=de.update(N),We=N.material;We.visible&&u.push(N,A,We,be,M.z,null)}}else if(N.isImmediateRenderObject)Te&&M.setFromMatrixPosition(N.matrixWorld).applyMatrix4(le),u.push(N,null,N.material,be,M.z,null);else if((N.isMesh||N.isLine||N.isPoints)&&(N.isSkinnedMesh&&N.skeleton.frame!==k.render.frame&&(N.skeleton.update(),N.skeleton.frame=k.render.frame),!N.frustumCulled||K.intersectsObject(N))){Te&&M.setFromMatrixPosition(N.matrixWorld).applyMatrix4(le);let A=de.update(N),We=N.material;if(Array.isArray(We)){let Xe=A.groups;for(let De=0,U=Xe.length;De<U;De++){let P=Xe[De],at=We[P.materialIndex];at&&at.visible&&u.push(N,A,at,be,M.z,P)}}else We.visible&&u.push(N,A,We,be,M.z,null)}}let rt=N.children;for(let A=0,We=rt.length;A<We;A++)Be(rt[A],Pe,be,Te)}function Ze(N,Pe,be){let Te=Pe.isScene===!0?Pe.overrideMaterial:null;for(let He=0,rt=N.length;He<rt;He++){let A=N[He],We=A.object,Xe=A.geometry,De=Te===null?A.material:Te,U=A.group;if(be.isArrayCamera){let P=be.cameras;for(let at=0,ot=P.length;at<ot;at++){let it=P[at];We.layers.test(it.layers)&&(J.viewport(b.copy(it.viewport)),d.setupLightsView(it),$e(We,Pe,it,Xe,De,U))}}else $e(We,Pe,be,Xe,De,U)}}function $e(N,Pe,be,Te,He,rt){if(N.onBeforeRender(y,Pe,be,Te,He,rt),N.modelViewMatrix.multiplyMatrices(be.matrixWorldInverse,N.matrixWorld),N.normalMatrix.getNormalMatrix(N.modelViewMatrix),N.isImmediateRenderObject){let A=ft(be,Pe,He,N);J.setMaterial(He),Ue.reset(),Q(N,A)}else y.renderBufferDirect(be,Pe,Te,He,N,rt);N.onAfterRender(y,Pe,be,Te,He,rt)}function Fe(N,Pe,be){Pe.isScene!==!0&&(Pe=q);let Te=ne.get(N),He=d.state.lights,rt=d.state.shadowsArray,A=He.state.version,We=ie.getParameters(N,He.state,rt,Pe,be),Xe=ie.getProgramCacheKey(We),De=Te.programs;Te.environment=N.isMeshStandardMaterial?Pe.environment:null,Te.fog=Pe.fog,Te.envMap=H.get(N.envMap||Te.environment),De===void 0&&(N.addEventListener("dispose",vt),De=new Map,Te.programs=De);let U=De.get(Xe);if(U!==void 0){if(Te.currentProgram===U&&Te.lightsStateVersion===A)return st(N,We),U}else We.uniforms=ie.getUniforms(N),N.onBuild(We,y),N.onBeforeCompile(We,y),U=ie.acquireProgram(We,Xe),De.set(Xe,U),Te.uniforms=We.uniforms;let P=Te.uniforms;(!N.isShaderMaterial&&!N.isRawShaderMaterial||N.clipping===!0)&&(P.clippingPlanes=$.uniform),st(N,We),Te.needsLights=gt(N),Te.lightsStateVersion=A,Te.needsLights&&(P.ambientLightColor.value=He.state.ambient,P.lightProbe.value=He.state.probe,P.directionalLights.value=He.state.directional,P.directionalLightShadows.value=He.state.directionalShadow,P.spotLights.value=He.state.spot,P.spotLightShadows.value=He.state.spotShadow,P.rectAreaLights.value=He.state.rectArea,P.ltc_1.value=He.state.rectAreaLTC1,P.ltc_2.value=He.state.rectAreaLTC2,P.pointLights.value=He.state.point,P.pointLightShadows.value=He.state.pointShadow,P.hemisphereLights.value=He.state.hemi,P.directionalShadowMap.value=He.state.directionalShadowMap,P.directionalShadowMatrix.value=He.state.directionalShadowMatrix,P.spotShadowMap.value=He.state.spotShadowMap,P.spotShadowMatrix.value=He.state.spotShadowMatrix,P.pointShadowMap.value=He.state.pointShadowMap,P.pointShadowMatrix.value=He.state.pointShadowMatrix);let at=U.getUniforms(),ot=mi.seqWithValue(at.seq,P);return Te.currentProgram=U,Te.uniformsList=ot,U}function st(N,Pe){let be=ne.get(N);be.outputEncoding=Pe.outputEncoding,be.instancing=Pe.instancing,be.numClippingPlanes=Pe.numClippingPlanes,be.numIntersection=Pe.numClipIntersection,be.vertexAlphas=Pe.vertexAlphas}function ft(N,Pe,be,Te){Pe.isScene!==!0&&(Pe=q),ce.resetTextureUnits();let He=Pe.fog,rt=be.isMeshStandardMaterial?Pe.environment:null,A=m===null?y.outputEncoding:m.texture.encoding,We=H.get(be.envMap||rt),Xe=be.vertexColors===!0&&Te.geometry&&Te.geometry.attributes.color&&Te.geometry.attributes.color.itemSize===4,De=ne.get(be),U=d.state.lights;if(G===!0&&(oe===!0||N!==w)){let Ae=N===w&&be.id===S;$.setState(be,N,Ae)}let P=!1;be.version===De.__version?(De.needsLights&&De.lightsStateVersion!==U.state.version||De.outputEncoding!==A||Te.isInstancedMesh&&De.instancing===!1||!Te.isInstancedMesh&&De.instancing===!0||De.envMap!==We||be.fog&&De.fog!==He||De.numClippingPlanes!==void 0&&(De.numClippingPlanes!==$.numPlanes||De.numIntersection!==$.numIntersection)||De.vertexAlphas!==Xe)&&(P=!0):(P=!0,De.__version=be.version);let at=De.currentProgram;P===!0&&(at=Fe(be,Pe,Te));let ot=!1,it=!1,pt=!1,me=at.getUniforms(),ue=De.uniforms;if(J.useProgram(at.program)&&(ot=!0,it=!0,pt=!0),be.id!==S&&(S=be.id,it=!0),ot||w!==N){if(me.setValue(X,"projectionMatrix",N.projectionMatrix),fe.logarithmicDepthBuffer&&me.setValue(X,"logDepthBufFC",2/(Math.log(N.far+1)/Math.LN2)),w!==N&&(w=N,it=!0,pt=!0),be.isShaderMaterial||be.isMeshPhongMaterial||be.isMeshToonMaterial||be.isMeshStandardMaterial||be.envMap){let Ae=me.map.cameraPosition;Ae!==void 0&&Ae.setValue(X,M.setFromMatrixPosition(N.matrixWorld))}(be.isMeshPhongMaterial||be.isMeshToonMaterial||be.isMeshLambertMaterial||be.isMeshBasicMaterial||be.isMeshStandardMaterial||be.isShaderMaterial)&&me.setValue(X,"isOrthographic",N.isOrthographicCamera===!0),(be.isMeshPhongMaterial||be.isMeshToonMaterial||be.isMeshLambertMaterial||be.isMeshBasicMaterial||be.isMeshStandardMaterial||be.isShaderMaterial||be.isShadowMaterial||be.skinning)&&me.setValue(X,"viewMatrix",N.matrixWorldInverse)}if(be.skinning){me.setOptional(X,Te,"bindMatrix"),me.setOptional(X,Te,"bindMatrixInverse");let Ae=Te.skeleton;if(Ae){let Ce=Ae.bones;if(fe.floatVertexTextures){if(Ae.boneTexture===null){let B=Math.sqrt(Ce.length*4);B=Gf(B),B=Math.max(B,4);let W=new Float32Array(B*B*4);W.set(Ae.boneMatrices);let V=new yi(W,B,B,xn,Jn);Ae.boneMatrices=W,Ae.boneTexture=V,Ae.boneTextureSize=B}me.setValue(X,"boneTexture",Ae.boneTexture,ce),me.setValue(X,"boneTextureSize",Ae.boneTextureSize)}else me.setOptional(X,Ae,"boneMatrices")}}return(it||De.receiveShadow!==Te.receiveShadow)&&(De.receiveShadow=Te.receiveShadow,me.setValue(X,"receiveShadow",Te.receiveShadow)),it&&(me.setValue(X,"toneMappingExposure",y.toneMappingExposure),De.needsLights&&ht(ue,pt),He&&be.fog&&R.refreshFogUniforms(ue,He),R.refreshMaterialUniforms(ue,be,_,ae),mi.upload(X,De.uniformsList,ue,ce)),be.isShaderMaterial&&be.uniformsNeedUpdate===!0&&(mi.upload(X,De.uniformsList,ue,ce),be.uniformsNeedUpdate=!1),be.isSpriteMaterial&&me.setValue(X,"center",Te.center),me.setValue(X,"modelViewMatrix",Te.modelViewMatrix),me.setValue(X,"normalMatrix",Te.normalMatrix),me.setValue(X,"modelMatrix",Te.matrixWorld),at}function ht(N,Pe){N.ambientLightColor.needsUpdate=Pe,N.lightProbe.needsUpdate=Pe,N.directionalLights.needsUpdate=Pe,N.directionalLightShadows.needsUpdate=Pe,N.pointLights.needsUpdate=Pe,N.pointLightShadows.needsUpdate=Pe,N.spotLights.needsUpdate=Pe,N.spotLightShadows.needsUpdate=Pe,N.rectAreaLights.needsUpdate=Pe,N.hemisphereLights.needsUpdate=Pe}function gt(N){return N.isMeshLambertMaterial||N.isMeshToonMaterial||N.isMeshPhongMaterial||N.isMeshStandardMaterial||N.isShadowMaterial||N.isShaderMaterial&&N.lights===!0}this.getActiveCubeFace=function(){return v},this.getActiveMipmapLevel=function(){return g},this.getRenderTarget=function(){return m},this.setRenderTarget=function(N,Pe=0,be=0){m=N,v=Pe,g=be,N&&ne.get(N).__webglFramebuffer===void 0&&ce.setupRenderTarget(N);let Te=null,He=!1,rt=!1;if(N){let A=N.texture;(A.isDataTexture3D||A.isDataTexture2DArray)&&(rt=!0);let We=ne.get(N).__webglFramebuffer;N.isWebGLCubeRenderTarget?(Te=We[Pe],He=!0):N.isWebGLMultisampleRenderTarget?Te=ne.get(N).__webglMultisampledFramebuffer:Te=We,b.copy(N.viewport),F.copy(N.scissor),L=N.scissorTest}else b.copy(D).multiplyScalar(_).floor(),F.copy(C).multiplyScalar(_).floor(),L=I;if(J.bindFramebuffer(36160,Te),J.viewport(b),J.scissor(F),J.setScissorTest(L),He){let A=ne.get(N.texture);X.framebufferTexture2D(36160,36064,34069+Pe,A.__webglTexture,be)}else if(rt){let A=ne.get(N.texture),We=Pe||0;X.framebufferTextureLayer(36160,36064,A.__webglTexture,be||0,We)}},this.readRenderTargetPixels=function(N,Pe,be,Te,He,rt,A){if(!(N&&N.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let We=ne.get(N).__webglFramebuffer;if(N.isWebGLCubeRenderTarget&&A!==void 0&&(We=We[A]),We){J.bindFramebuffer(36160,We);try{let Xe=N.texture,De=Xe.format,U=Xe.type;if(De!==xn&&Ee.convert(De)!==X.getParameter(35739)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}let P=U===Ts&&(ve.has("EXT_color_buffer_half_float")||fe.isWebGL2&&ve.has("EXT_color_buffer_float"));if(U!==ts&&Ee.convert(U)!==X.getParameter(35738)&&!(U===Jn&&(fe.isWebGL2||ve.has("OES_texture_float")||ve.has("WEBGL_color_buffer_float")))&&!P){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}X.checkFramebufferStatus(36160)===36053?Pe>=0&&Pe<=N.width-Te&&be>=0&&be<=N.height-He&&X.readPixels(Pe,be,Te,He,Ee.convert(De),Ee.convert(U),rt):console.error("THREE.WebGLRenderer.readRenderTargetPixels: readPixels from renderTarget failed. Framebuffer not complete.")}finally{let Xe=m!==null?ne.get(m).__webglFramebuffer:null;J.bindFramebuffer(36160,Xe)}}},this.copyFramebufferToTexture=function(N,Pe,be=0){let Te=Math.pow(2,-be),He=Math.floor(Pe.image.width*Te),rt=Math.floor(Pe.image.height*Te),A=Ee.convert(Pe.format);ce.setTexture2D(Pe,0),X.copyTexImage2D(3553,be,A,N.x,N.y,He,rt,0),J.unbindTexture()},this.copyTextureToTexture=function(N,Pe,be,Te=0){let He=Pe.image.width,rt=Pe.image.height,A=Ee.convert(be.format),We=Ee.convert(be.type);ce.setTexture2D(be,0),X.pixelStorei(37440,be.flipY),X.pixelStorei(37441,be.premultiplyAlpha),X.pixelStorei(3317,be.unpackAlignment),Pe.isDataTexture?X.texSubImage2D(3553,Te,N.x,N.y,He,rt,A,We,Pe.image.data):Pe.isCompressedTexture?X.compressedTexSubImage2D(3553,Te,N.x,N.y,Pe.mipmaps[0].width,Pe.mipmaps[0].height,A,Pe.mipmaps[0].data):X.texSubImage2D(3553,Te,N.x,N.y,A,We,Pe.image),Te===0&&be.generateMipmaps&&X.generateMipmap(3553),J.unbindTexture()},this.copyTextureToTexture3D=function(N,Pe,be,Te,He=0){if(y.isWebGL1Renderer){console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: can only be used with WebGL2.");return}let{width:rt,height:A,data:We}=be.image,Xe=Ee.convert(Te.format),De=Ee.convert(Te.type),U;if(Te.isDataTexture3D)ce.setTexture3D(Te,0),U=32879;else if(Te.isDataTexture2DArray)ce.setTexture2DArray(Te,0),U=35866;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}X.pixelStorei(37440,Te.flipY),X.pixelStorei(37441,Te.premultiplyAlpha),X.pixelStorei(3317,Te.unpackAlignment);let P=X.getParameter(3314),at=X.getParameter(32878),ot=X.getParameter(3316),it=X.getParameter(3315),pt=X.getParameter(32877);X.pixelStorei(3314,rt),X.pixelStorei(32878,A),X.pixelStorei(3316,N.min.x),X.pixelStorei(3315,N.min.y),X.pixelStorei(32877,N.min.z),X.texSubImage3D(U,He,Pe.x,Pe.y,Pe.z,N.max.x-N.min.x+1,N.max.y-N.min.y+1,N.max.z-N.min.z+1,Xe,De,We),X.pixelStorei(3314,P),X.pixelStorei(32878,at),X.pixelStorei(3316,ot),X.pixelStorei(3315,it),X.pixelStorei(32877,pt),He===0&&Te.generateMipmaps&&X.generateMipmap(U),J.unbindTexture()},this.initTexture=function(N){ce.setTexture2D(N,0),J.unbindTexture()},this.resetState=function(){v=0,g=0,m=null,J.reset(),Ue.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}var qo=class extends Dt{};qo.prototype.isWebGL1Renderer=!0;var Fs=class s{constructor(e,t=25e-5){this.name="",this.color=new ut(e),this.density=t}clone(){return new s(this.color,this.density)}toJSON(){return{type:"FogExp2",color:this.color.getHex(),density:this.density}}};Fs.prototype.isFogExp2=!0;var Bs=class s{constructor(e,t=1,n=1e3){this.name="",this.color=new ut(e),this.near=t,this.far=n}clone(){return new s(this.color,this.near,this.far)}toJSON(){return{type:"Fog",color:this.color.getHex(),near:this.near,far:this.far}}};Bs.prototype.isFog=!0;var Ur=class extends Ct{constructor(){super(),this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.overrideMaterial=null,this.autoUpdate=!0,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.autoUpdate=e.autoUpdate,this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.background!==null&&(t.object.background=this.background.toJSON(e)),this.environment!==null&&(t.object.environment=this.environment.toJSON(e)),this.fog!==null&&(t.object.fog=this.fog.toJSON()),t}};Ur.prototype.isScene=!0;var ei=class s{constructor(e,t){this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Pr,this.updateRange={offset:0,count:-1},this.version=0,this.uuid=yn(),this.onUploadCallback=function(){}}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=yn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new s(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=yn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.prototype.slice.call(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}};ei.prototype.isInterleavedBuffer=!0;var Gt=new Y,bi=class s{constructor(e,t,n,i){this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i===!0}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Gt.x=this.getX(t),Gt.y=this.getY(t),Gt.z=this.getZ(t),Gt.applyMatrix4(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Gt.x=this.getX(t),Gt.y=this.getY(t),Gt.z=this.getZ(t),Gt.applyNormalMatrix(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Gt.x=this.getX(t),Gt.y=this.getY(t),Gt.z=this.getZ(t),Gt.transformDirection(e),this.setXYZ(t,Gt.x,Gt.y,Gt.z);return this}setX(e,t){return this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){return this.data.array[e*this.data.stride+this.offset]}getY(e){return this.data.array[e*this.data.stride+this.offset+1]}getZ(e){return this.data.array[e*this.data.stride+this.offset+2]}getW(e){return this.data.array[e*this.data.stride+this.offset+3]}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e=e*this.data.stride+this.offset,this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interlaved buffer attribute will deinterleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new St(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new s(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interlaved buffer attribute will deinterleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}};bi.prototype.isInterleavedBufferAttribute=!0;var Or=class extends Yt{constructor(e){super(),this.type="SpriteMaterial",this.color=new ut(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this}};Or.prototype.isSpriteMaterial=!0;var vr,us=new Y,xr=new Y,yr=new Y,br=new Je,hs=new Je,np=new bt,ao=new Y,ds=new Y,oo=new Y,gh=new Je,dc=new Je,vh=new Je,Gr=class extends Ct{constructor(e){if(super(),this.type="Sprite",vr===void 0){vr=new _t;let t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new ei(t,5);vr.setIndex([0,1,2,0,2,3]),vr.setAttribute("position",new bi(n,3,0,!1)),vr.setAttribute("uv",new bi(n,2,3,!1))}this.geometry=vr,this.material=e!==void 0?e:new Or,this.center=new Je(.5,.5)}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),xr.setFromMatrixScale(this.matrixWorld),np.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),yr.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&xr.multiplyScalar(-yr.z);let n=this.material.rotation,i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));let a=this.center;lo(ao.set(-.5,-.5,0),yr,a,xr,i,r),lo(ds.set(.5,-.5,0),yr,a,xr,i,r),lo(oo.set(.5,.5,0),yr,a,xr,i,r),gh.set(0,0),dc.set(1,0),vh.set(1,1);let o=e.ray.intersectTriangle(ao,ds,oo,!1,us);if(o===null&&(lo(ds.set(-.5,.5,0),yr,a,xr,i,r),dc.set(0,1),o=e.ray.intersectTriangle(ao,oo,ds,!1,us),o===null))return;let c=e.ray.origin.distanceTo(us);c<e.near||c>e.far||t.push({distance:c,point:us.clone(),uv:nn.getUV(us,ao,ds,oo,gh,dc,vh,new Je),face:null,object:this})}copy(e){return super.copy(e),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};Gr.prototype.isSprite=!0;function lo(s,e,t,n,i,r){br.subVectors(s,t).addScalar(.5).multiply(n),i!==void 0?(hs.x=r*br.x-i*br.y,hs.y=i*br.x+r*br.y):hs.copy(br),s.copy(e),s.x+=hs.x,s.y+=hs.y,s.applyMatrix4(np)}var co=new Y,xh=new Y,Xo=class extends Ct{constructor(){super(),this._currentLevel=0,this.type="LOD",Object.defineProperties(this,{levels:{enumerable:!0,value:[]},isLOD:{value:!0}}),this.autoUpdate=!0}copy(e){super.copy(e,!1);let t=e.levels;for(let n=0,i=t.length;n<i;n++){let r=t[n];this.addLevel(r.object.clone(),r.distance)}return this.autoUpdate=e.autoUpdate,this}addLevel(e,t=0){t=Math.abs(t);let n=this.levels,i;for(i=0;i<n.length&&!(t<n[i].distance);i++);return n.splice(i,0,{distance:t,object:e}),this.add(e),this}getCurrentLevel(){return this._currentLevel}getObjectForDistance(e){let t=this.levels;if(t.length>0){let n,i;for(n=1,i=t.length;n<i&&!(e<t[n].distance);n++);return t[n-1].object}return null}raycast(e,t){if(this.levels.length>0){co.setFromMatrixPosition(this.matrixWorld);let i=e.ray.origin.distanceTo(co);this.getObjectForDistance(i).raycast(e,t)}}update(e){let t=this.levels;if(t.length>1){co.setFromMatrixPosition(e.matrixWorld),xh.setFromMatrixPosition(this.matrixWorld);let n=co.distanceTo(xh)/e.zoom;t[0].object.visible=!0;let i,r;for(i=1,r=t.length;i<r&&n>=t[i].distance;i++)t[i-1].object.visible=!1,t[i].object.visible=!0;for(this._currentLevel=i-1;i<r;i++)t[i].object.visible=!1}}toJSON(e){let t=super.toJSON(e);this.autoUpdate===!1&&(t.object.autoUpdate=!1),t.object.levels=[];let n=this.levels;for(let i=0,r=n.length;i<r;i++){let a=n[i];t.object.levels.push({object:a.object.uuid,distance:a.distance})}return t}},yh=new Y,bh=new Lt,wh=new Lt,ey=new Y,Mh=new bt,Wr=class extends Ot{constructor(e,t){super(e,t),this.type="SkinnedMesh",this.bindMode="attached",this.bindMatrix=new bt,this.bindMatrixInverse=new bt}copy(e){return super.copy(e),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,this}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new Lt,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.x=t.getX(n),e.y=t.getY(n),e.z=t.getZ(n),e.w=t.getW(n);let r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode==="attached"?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode==="detached"?this.bindMatrixInverse.copy(this.bindMatrix).invert():console.warn("THREE.SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}boneTransform(e,t){let n=this.skeleton,i=this.geometry;bh.fromBufferAttribute(i.attributes.skinIndex,e),wh.fromBufferAttribute(i.attributes.skinWeight,e),yh.fromBufferAttribute(i.attributes.position,e).applyMatrix4(this.bindMatrix),t.set(0,0,0);for(let r=0;r<4;r++){let a=wh.getComponent(r);if(a!==0){let o=bh.getComponent(r);Mh.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),t.addScaledVector(ey.copy(yh).applyMatrix4(Mh),a)}}return t.applyMatrix4(this.bindMatrixInverse)}};Wr.prototype.isSkinnedMesh=!0;var Vr=class extends Ct{constructor(){super(),this.type="Bone"}};Vr.prototype.isBone=!0;var _h=new bt,ty=new bt,Yo=class s{constructor(e=[],t=[]){this.uuid=yn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.boneTextureSize=0,this.frame=-1,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new bt)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new bt;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,a=e.length;r<a;r++){let o=e[r]?e[r].matrixWorld:ty;_h.multiplyMatrices(o,t[r]),_h.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new s(this.bones,this.boneInverses)}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let i=this.bones[t];if(i.name===e)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let r=e.bones[n],a=t[r];a===void 0&&(console.warn("THREE.Skeleton: No bone found with UUID:",r),a=new Vr),this.bones.push(a),this.boneInverses.push(new bt().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.5,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){let a=t[i];e.bones.push(a.uuid);let o=n[i];e.boneInverses.push(o.toArray())}return e}},Sh=new bt,Ah=new bt,uo=[],fs=new Ot,ks=class extends Ot{constructor(e,t,n){super(e,t),this.instanceMatrix=new St(new Float32Array(n*16),16),this.instanceColor=null,this.count=n,this.frustumCulled=!1}copy(e){return super.copy(e),this.instanceMatrix.copy(e.instanceMatrix),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}raycast(e,t){let n=this.matrixWorld,i=this.count;if(fs.geometry=this.geometry,fs.material=this.material,fs.material!==void 0)for(let r=0;r<i;r++){this.getMatrixAt(r,Sh),Ah.multiplyMatrices(n,Sh),fs.matrixWorld=Ah,fs.raycast(e,uo);for(let a=0,o=uo.length;a<o;a++){let c=uo[a];c.instanceId=r,c.object=this,t.push(c)}uo.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new St(new Float32Array(this.count*3),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"})}};ks.prototype.isInstancedMesh=!0;var Zt=class extends Yt{constructor(e){super(),this.type="LineBasicMaterial",this.color=new ut(16777215),this.linewidth=1,this.linecap="round",this.linejoin="round",this.morphTargets=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.morphTargets=e.morphTargets,this}};Zt.prototype.isLineBasicMaterial=!0;var Th=new Y,Eh=new Y,Ch=new bt,fc=new Gn,ho=new On,zn=class extends Ct{constructor(e=new _t,t=new Zt){super(),this.type="Line",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e){return super.copy(e),this.material=e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.isBufferGeometry)if(e.index===null){let t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)Th.fromBufferAttribute(t,i-1),Eh.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=Th.distanceTo(Eh);e.setAttribute("lineDistance",new dt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");else e.isGeometry&&console.error("THREE.Line.computeLineDistances() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.");return this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ho.copy(n.boundingSphere),ho.applyMatrix4(i),ho.radius+=r,e.ray.intersectsSphere(ho)===!1)return;Ch.copy(i).invert(),fc.copy(e.ray).applyMatrix4(Ch);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=o*o,l=new Y,h=new Y,u=new Y,d=new Y,f=this.isLineSegments?2:1;if(n.isBufferGeometry){let p=n.index,x=n.attributes.position;if(p!==null){let v=Math.max(0,a.start),g=Math.min(p.count,a.start+a.count);for(let m=v,S=g-1;m<S;m+=f){let w=p.getX(m),b=p.getX(m+1);if(l.fromBufferAttribute(x,w),h.fromBufferAttribute(x,b),fc.distanceSqToSegment(l,h,d,u)>c)continue;d.applyMatrix4(this.matrixWorld);let L=e.ray.origin.distanceTo(d);L<e.near||L>e.far||t.push({distance:L,point:u.clone().applyMatrix4(this.matrixWorld),index:m,face:null,faceIndex:null,object:this})}}else{let v=Math.max(0,a.start),g=Math.min(x.count,a.start+a.count);for(let m=v,S=g-1;m<S;m+=f){if(l.fromBufferAttribute(x,m),h.fromBufferAttribute(x,m+1),fc.distanceSqToSegment(l,h,d,u)>c)continue;d.applyMatrix4(this.matrixWorld);let b=e.ray.origin.distanceTo(d);b<e.near||b>e.far||t.push({distance:b,point:u.clone().applyMatrix4(this.matrixWorld),index:m,face:null,faceIndex:null,object:this})}}}else n.isGeometry&&console.error("THREE.Line.raycast() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.")}updateMorphTargets(){let e=this.geometry;if(e.isBufferGeometry){let t=e.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}else{let t=e.morphTargets;t!==void 0&&t.length>0&&console.error("THREE.Line.updateMorphTargets() does not support THREE.Geometry. Use THREE.BufferGeometry instead.")}}};zn.prototype.isLine=!0;var Ph=new Y,Lh=new Y,on=class extends zn{constructor(e,t){super(e,t),this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.isBufferGeometry)if(e.index===null){let t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)Ph.fromBufferAttribute(t,i),Lh.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+Ph.distanceTo(Lh);e.setAttribute("lineDistance",new dt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");else e.isGeometry&&console.error("THREE.LineSegments.computeLineDistances() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.");return this}};on.prototype.isLineSegments=!0;var Ns=class extends zn{constructor(e,t){super(e,t),this.type="LineLoop"}};Ns.prototype.isLineLoop=!0;var ti=class extends Yt{constructor(e){super(),this.type="PointsMaterial",this.color=new ut(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.morphTargets=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.morphTargets=e.morphTargets,this}};ti.prototype.isPointsMaterial=!0;var Rh=new bt,Vc=new Gn,fo=new On,po=new Y,Vi=class extends Ct{constructor(e=new _t,t=new ti){super(),this.type="Points",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e){return super.copy(e),this.material=e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),fo.copy(n.boundingSphere),fo.applyMatrix4(i),fo.radius+=r,e.ray.intersectsSphere(fo)===!1)return;Rh.copy(i).invert(),Vc.copy(e.ray).applyMatrix4(Rh);let o=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=o*o;if(n.isBufferGeometry){let l=n.index,u=n.attributes.position;if(l!==null){let d=Math.max(0,a.start),f=Math.min(l.count,a.start+a.count);for(let p=d,y=f;p<y;p++){let x=l.getX(p);po.fromBufferAttribute(u,x),zh(po,x,c,i,e,t,this)}}else{let d=Math.max(0,a.start),f=Math.min(u.count,a.start+a.count);for(let p=d,y=f;p<y;p++)po.fromBufferAttribute(u,p),zh(po,p,c,i,e,t,this)}}else console.error("THREE.Points.raycast() no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.")}updateMorphTargets(){let e=this.geometry;if(e.isBufferGeometry){let t=e.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=i.length;r<a;r++){let o=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}else{let t=e.morphTargets;t!==void 0&&t.length>0&&console.error("THREE.Points.updateMorphTargets() does not support THREE.Geometry. Use THREE.BufferGeometry instead.")}}};Vi.prototype.isPoints=!0;function zh(s,e,t,n,i,r,a){let o=Vc.distanceSqToPoint(s);if(o<t){let c=new Y;Vc.closestPointToPoint(s,c),c.applyMatrix4(n);let l=i.ray.origin.distanceTo(c);if(l<i.near||l>i.far)return;r.push({distance:l,distanceToRay:Math.sqrt(o),point:c,index:e,face:null,object:a})}}var Zo=class extends Kt{constructor(e,t,n,i,r,a,o,c,l){super(e,t,n,i,r,a,o,c,l),this.format=o!==void 0?o:pi,this.minFilter=a!==void 0?a:Jt,this.magFilter=r!==void 0?r:Jt,this.generateMipmaps=!1;let h=this;function u(){h.needsUpdate=!0,e.requestVideoFrameCallback(u)}"requestVideoFrameCallback"in e&&e.requestVideoFrameCallback(u)}clone(){return new this.constructor(this.image).copy(this)}update(){let e=this.image;"requestVideoFrameCallback"in e===!1&&e.readyState>=e.HAVE_CURRENT_DATA&&(this.needsUpdate=!0)}};Zo.prototype.isVideoTexture=!0;var Us=class extends Kt{constructor(e,t,n,i,r,a,o,c,l,h,u,d){super(null,a,o,c,l,h,i,r,u,d),this.image={width:t,height:n},this.mipmaps=e,this.flipY=!1,this.generateMipmaps=!1}};Us.prototype.isCompressedTexture=!0;var jo=class extends Kt{constructor(e,t,n,i,r,a,o,c,l){super(e,t,n,i,r,a,o,c,l),this.needsUpdate=!0}};jo.prototype.isCanvasTexture=!0;var Jo=class extends Kt{constructor(e,t,n,i,r,a,o,c,l,h){if(h=h!==void 0?h:Ni,h!==Ni&&h!==Cr)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===Ni&&(n=As),n===void 0&&h===Cr&&(n=Tr),super(null,i,r,a,o,c,h,n,l),this.image={width:e,height:t},this.magFilter=o!==void 0?o:jt,this.minFilter=c!==void 0?c:jt,this.flipY=!1,this.generateMipmaps=!1}};Jo.prototype.isDepthTexture=!0;var Os=class extends _t{constructor(e=1,t=8,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:i},t=Math.max(3,t);let r=[],a=[],o=[],c=[],l=new Y,h=new Je;a.push(0,0,0),o.push(0,0,1),c.push(.5,.5);for(let u=0,d=3;u<=t;u++,d+=3){let f=n+u/t*i;l.x=e*Math.cos(f),l.y=e*Math.sin(f),a.push(l.x,l.y,l.z),o.push(0,0,1),h.x=(a[d]/e+1)/2,h.y=(a[d+1]/e+1)/2,c.push(h.x,h.y)}for(let u=1;u<=t;u++)r.push(u,u+1,0);this.setIndex(r),this.setAttribute("position",new dt(a,3)),this.setAttribute("normal",new dt(o,3)),this.setAttribute("uv",new dt(c,2))}},Hi=class extends _t{constructor(e=1,t=1,n=1,i=8,r=1,a=!1,o=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:i,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:c};let l=this;i=Math.floor(i),r=Math.floor(r);let h=[],u=[],d=[],f=[],p=0,y=[],x=n/2,v=0;g(),a===!1&&(e>0&&m(!0),t>0&&m(!1)),this.setIndex(h),this.setAttribute("position",new dt(u,3)),this.setAttribute("normal",new dt(d,3)),this.setAttribute("uv",new dt(f,2));function g(){let S=new Y,w=new Y,b=0,F=(t-e)/n;for(let L=0;L<=r;L++){let O=[],ae=L/r,_=ae*(t-e)+e;for(let E=0;E<=i;E++){let z=E/i,D=z*c+o,C=Math.sin(D),I=Math.cos(D);w.x=_*C,w.y=-ae*n+x,w.z=_*I,u.push(w.x,w.y,w.z),S.set(C,F,I).normalize(),d.push(S.x,S.y,S.z),f.push(z,1-ae),O.push(p++)}y.push(O)}for(let L=0;L<i;L++)for(let O=0;O<r;O++){let ae=y[O][L],_=y[O+1][L],E=y[O+1][L+1],z=y[O][L+1];h.push(ae,_,z),h.push(_,E,z),b+=6}l.addGroup(v,b,0),v+=b}function m(S){let w=p,b=new Je,F=new Y,L=0,O=S===!0?e:t,ae=S===!0?1:-1;for(let E=1;E<=i;E++)u.push(0,x*ae,0),d.push(0,ae,0),f.push(.5,.5),p++;let _=p;for(let E=0;E<=i;E++){let D=E/i*c+o,C=Math.cos(D),I=Math.sin(D);F.x=O*I,F.y=x*ae,F.z=O*C,u.push(F.x,F.y,F.z),d.push(0,ae,0),b.x=C*.5+.5,b.y=I*.5*ae+.5,f.push(b.x,b.y),p++}for(let E=0;E<i;E++){let z=w+E,D=_+E;S===!0?h.push(D,D+1,z):h.push(D+1,D,z),L+=3}l.addGroup(v,L,S===!0?1:2),v+=L}}},Gs=class extends Hi{constructor(e=1,t=1,n=8,i=1,r=!1,a=0,o=Math.PI*2){super(0,e,t,n,i,r,a,o),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:a,thetaLength:o}}},ni=class extends _t{constructor(e,t,n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:i};let r=[],a=[];o(i),l(n),h(),this.setAttribute("position",new dt(r,3)),this.setAttribute("normal",new dt(r.slice(),3)),this.setAttribute("uv",new dt(a,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function o(g){let m=new Y,S=new Y,w=new Y;for(let b=0;b<t.length;b+=3)f(t[b+0],m),f(t[b+1],S),f(t[b+2],w),c(m,S,w,g)}function c(g,m,S,w){let b=w+1,F=[];for(let L=0;L<=b;L++){F[L]=[];let O=g.clone().lerp(S,L/b),ae=m.clone().lerp(S,L/b),_=b-L;for(let E=0;E<=_;E++)E===0&&L===b?F[L][E]=O:F[L][E]=O.clone().lerp(ae,E/_)}for(let L=0;L<b;L++)for(let O=0;O<2*(b-L)-1;O++){let ae=Math.floor(O/2);O%2===0?(d(F[L][ae+1]),d(F[L+1][ae]),d(F[L][ae])):(d(F[L][ae+1]),d(F[L+1][ae+1]),d(F[L+1][ae]))}}function l(g){let m=new Y;for(let S=0;S<r.length;S+=3)m.x=r[S+0],m.y=r[S+1],m.z=r[S+2],m.normalize().multiplyScalar(g),r[S+0]=m.x,r[S+1]=m.y,r[S+2]=m.z}function h(){let g=new Y;for(let m=0;m<r.length;m+=3){g.x=r[m+0],g.y=r[m+1],g.z=r[m+2];let S=x(g)/2/Math.PI+.5,w=v(g)/Math.PI+.5;a.push(S,1-w)}p(),u()}function u(){for(let g=0;g<a.length;g+=6){let m=a[g+0],S=a[g+2],w=a[g+4],b=Math.max(m,S,w),F=Math.min(m,S,w);b>.9&&F<.1&&(m<.2&&(a[g+0]+=1),S<.2&&(a[g+2]+=1),w<.2&&(a[g+4]+=1))}}function d(g){r.push(g.x,g.y,g.z)}function f(g,m){let S=g*3;m.x=e[S+0],m.y=e[S+1],m.z=e[S+2]}function p(){let g=new Y,m=new Y,S=new Y,w=new Y,b=new Je,F=new Je,L=new Je;for(let O=0,ae=0;O<r.length;O+=9,ae+=6){g.set(r[O+0],r[O+1],r[O+2]),m.set(r[O+3],r[O+4],r[O+5]),S.set(r[O+6],r[O+7],r[O+8]),b.set(a[ae+0],a[ae+1]),F.set(a[ae+2],a[ae+3]),L.set(a[ae+4],a[ae+5]),w.copy(g).add(m).add(S).divideScalar(3);let _=x(w);y(b,ae+0,g,_),y(F,ae+2,m,_),y(L,ae+4,S,_)}}function y(g,m,S,w){w<0&&g.x===1&&(a[m]=g.x-1),S.x===0&&S.z===0&&(a[m]=w/2/Math.PI+.5)}function x(g){return Math.atan2(g.z,-g.x)}function v(g){return Math.atan2(-g.y,Math.sqrt(g.x*g.x+g.z*g.z))}}},Ws=class extends ni{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,i=1/n,r=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],a=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(r,a,e,t),this.type="DodecahedronGeometry",this.parameters={radius:e,detail:t}}},mo=new Y,go=new Y,pc=new Y,vo=new nn,Vs=class extends _t{constructor(e,t){if(super(),this.type="EdgesGeometry",this.parameters={thresholdAngle:t},t=t!==void 0?t:1,e.isGeometry===!0){console.error("THREE.EdgesGeometry no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.");return}let i=Math.pow(10,4),r=Math.cos(Ui*t),a=e.getIndex(),o=e.getAttribute("position"),c=a?a.count:o.count,l=[0,0,0],h=["a","b","c"],u=new Array(3),d={},f=[];for(let p=0;p<c;p+=3){a?(l[0]=a.getX(p),l[1]=a.getX(p+1),l[2]=a.getX(p+2)):(l[0]=p,l[1]=p+1,l[2]=p+2);let{a:y,b:x,c:v}=vo;if(y.fromBufferAttribute(o,l[0]),x.fromBufferAttribute(o,l[1]),v.fromBufferAttribute(o,l[2]),vo.getNormal(pc),u[0]=\`\${Math.round(y.x*i)},\${Math.round(y.y*i)},\${Math.round(y.z*i)}\`,u[1]=\`\${Math.round(x.x*i)},\${Math.round(x.y*i)},\${Math.round(x.z*i)}\`,u[2]=\`\${Math.round(v.x*i)},\${Math.round(v.y*i)},\${Math.round(v.z*i)}\`,!(u[0]===u[1]||u[1]===u[2]||u[2]===u[0]))for(let g=0;g<3;g++){let m=(g+1)%3,S=u[g],w=u[m],b=vo[h[g]],F=vo[h[m]],L=\`\${S}_\${w}\`,O=\`\${w}_\${S}\`;O in d&&d[O]?(pc.dot(d[O].normal)<=r&&(f.push(b.x,b.y,b.z),f.push(F.x,F.y,F.z)),d[O]=null):L in d||(d[L]={index0:l[g],index1:l[m],normal:pc.clone()})}}for(let p in d)if(d[p]){let{index0:y,index1:x}=d[p];mo.fromBufferAttribute(o,y),go.fromBufferAttribute(o,x),f.push(mo.x,mo.y,mo.z),f.push(go.x,go.y,go.z)}this.setAttribute("position",new dt(f,3))}},ny={triangulate:function(s,e,t){t=t||2;let n=e&&e.length,i=n?e[0]*t:s.length,r=ip(s,0,i,t,!0),a=[];if(!r||r.next===r.prev)return a;let o,c,l,h,u,d,f;if(n&&(r=oy(s,e,r,t)),s.length>80*t){o=l=s[0],c=h=s[1];for(let p=t;p<i;p+=t)u=s[p],d=s[p+1],u<o&&(o=u),d<c&&(c=d),u>l&&(l=u),d>h&&(h=d);f=Math.max(l-o,h-c),f=f!==0?1/f:0}return Hs(r,a,t,o,c,f),a}};function ip(s,e,t,n,i){let r,a;if(i===xy(s,e,t,n)>0)for(r=e;r<t;r+=n)a=Dh(r,s[r],s[r+1],a);else for(r=t-n;r>=e;r-=n)a=Dh(r,s[r],s[r+1],a);return a&&Dl(a,a.next)&&(Xs(a),a=a.next),a}function wi(s,e){if(!s)return s;e||(e=s);let t=s,n;do if(n=!1,!t.steiner&&(Dl(t,t.next)||kt(t.prev,t,t.next)===0)){if(Xs(t),t=e=t.prev,t===t.next)break;n=!0}else t=t.next;while(n||t!==e);return e}function Hs(s,e,t,n,i,r,a){if(!s)return;!a&&r&&dy(s,n,i,r);let o=s,c,l;for(;s.prev!==s.next;){if(c=s.prev,l=s.next,r?ry(s,n,i,r):iy(s)){e.push(c.i/t),e.push(s.i/t),e.push(l.i/t),Xs(s),s=l.next,o=l.next;continue}if(s=l,s===o){a?a===1?(s=sy(wi(s),e,t),Hs(s,e,t,n,i,r,2)):a===2&&ay(s,e,t,n,i,r):Hs(wi(s),e,t,n,i,r,1);break}}}function iy(s){let e=s.prev,t=s,n=s.next;if(kt(e,t,n)>=0)return!1;let i=s.next.next;for(;i!==s.prev;){if(Sr(e.x,e.y,t.x,t.y,n.x,n.y,i.x,i.y)&&kt(i.prev,i,i.next)>=0)return!1;i=i.next}return!0}function ry(s,e,t,n){let i=s.prev,r=s,a=s.next;if(kt(i,r,a)>=0)return!1;let o=i.x<r.x?i.x<a.x?i.x:a.x:r.x<a.x?r.x:a.x,c=i.y<r.y?i.y<a.y?i.y:a.y:r.y<a.y?r.y:a.y,l=i.x>r.x?i.x>a.x?i.x:a.x:r.x>a.x?r.x:a.x,h=i.y>r.y?i.y>a.y?i.y:a.y:r.y>a.y?r.y:a.y,u=Hc(o,c,e,t,n),d=Hc(l,h,e,t,n),f=s.prevZ,p=s.nextZ;for(;f&&f.z>=u&&p&&p.z<=d;){if(f!==s.prev&&f!==s.next&&Sr(i.x,i.y,r.x,r.y,a.x,a.y,f.x,f.y)&&kt(f.prev,f,f.next)>=0||(f=f.prevZ,p!==s.prev&&p!==s.next&&Sr(i.x,i.y,r.x,r.y,a.x,a.y,p.x,p.y)&&kt(p.prev,p,p.next)>=0))return!1;p=p.nextZ}for(;f&&f.z>=u;){if(f!==s.prev&&f!==s.next&&Sr(i.x,i.y,r.x,r.y,a.x,a.y,f.x,f.y)&&kt(f.prev,f,f.next)>=0)return!1;f=f.prevZ}for(;p&&p.z<=d;){if(p!==s.prev&&p!==s.next&&Sr(i.x,i.y,r.x,r.y,a.x,a.y,p.x,p.y)&&kt(p.prev,p,p.next)>=0)return!1;p=p.nextZ}return!0}function sy(s,e,t){let n=s;do{let i=n.prev,r=n.next.next;!Dl(i,r)&&rp(i,n,n.next,r)&&qs(i,r)&&qs(r,i)&&(e.push(i.i/t),e.push(n.i/t),e.push(r.i/t),Xs(n),Xs(n.next),n=s=r),n=n.next}while(n!==s);return wi(n)}function ay(s,e,t,n,i,r){let a=s;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&my(a,o)){let c=sp(a,o);a=wi(a,a.next),c=wi(c,c.next),Hs(a,e,t,n,i,r),Hs(c,e,t,n,i,r);return}o=o.next}a=a.next}while(a!==s)}function oy(s,e,t,n){let i=[],r,a,o,c,l;for(r=0,a=e.length;r<a;r++)o=e[r]*n,c=r<a-1?e[r+1]*n:s.length,l=ip(s,o,c,n,!1),l===l.next&&(l.steiner=!0),i.push(py(l));for(i.sort(ly),r=0;r<i.length;r++)cy(i[r],t),t=wi(t,t.next);return t}function ly(s,e){return s.x-e.x}function cy(s,e){if(e=uy(s,e),e){let t=sp(e,s);wi(e,e.next),wi(t,t.next)}}function uy(s,e){let t=e,n=s.x,i=s.y,r=-1/0,a;do{if(i<=t.y&&i>=t.next.y&&t.next.y!==t.y){let d=t.x+(i-t.y)*(t.next.x-t.x)/(t.next.y-t.y);if(d<=n&&d>r){if(r=d,d===n){if(i===t.y)return t;if(i===t.next.y)return t.next}a=t.x<t.next.x?t:t.next}}t=t.next}while(t!==e);if(!a)return null;if(n===r)return a;let o=a,c=a.x,l=a.y,h=1/0,u;t=a;do n>=t.x&&t.x>=c&&n!==t.x&&Sr(i<l?n:r,i,c,l,i<l?r:n,i,t.x,t.y)&&(u=Math.abs(i-t.y)/(n-t.x),qs(t,s)&&(u<h||u===h&&(t.x>a.x||t.x===a.x&&hy(a,t)))&&(a=t,h=u)),t=t.next;while(t!==o);return a}function hy(s,e){return kt(s.prev,s,e.prev)<0&&kt(e.next,s,s.next)<0}function dy(s,e,t,n){let i=s;do i.z===null&&(i.z=Hc(i.x,i.y,e,t,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==s);i.prevZ.nextZ=null,i.prevZ=null,fy(i)}function fy(s){let e,t,n,i,r,a,o,c,l=1;do{for(t=s,s=null,r=null,a=0;t;){for(a++,n=t,o=0,e=0;e<l&&(o++,n=n.nextZ,!!n);e++);for(c=l;o>0||c>0&&n;)o!==0&&(c===0||!n||t.z<=n.z)?(i=t,t=t.nextZ,o--):(i=n,n=n.nextZ,c--),r?r.nextZ=i:s=i,i.prevZ=r,r=i;t=n}r.nextZ=null,l*=2}while(a>1);return s}function Hc(s,e,t,n,i){return s=32767*(s-t)*i,e=32767*(e-n)*i,s=(s|s<<8)&16711935,s=(s|s<<4)&252645135,s=(s|s<<2)&858993459,s=(s|s<<1)&1431655765,e=(e|e<<8)&16711935,e=(e|e<<4)&252645135,e=(e|e<<2)&858993459,e=(e|e<<1)&1431655765,s|e<<1}function py(s){let e=s,t=s;do(e.x<t.x||e.x===t.x&&e.y<t.y)&&(t=e),e=e.next;while(e!==s);return t}function Sr(s,e,t,n,i,r,a,o){return(i-a)*(e-o)-(s-a)*(r-o)>=0&&(s-a)*(n-o)-(t-a)*(e-o)>=0&&(t-a)*(r-o)-(i-a)*(n-o)>=0}function my(s,e){return s.next.i!==e.i&&s.prev.i!==e.i&&!gy(s,e)&&(qs(s,e)&&qs(e,s)&&vy(s,e)&&(kt(s.prev,s,e.prev)||kt(s,e.prev,e))||Dl(s,e)&&kt(s.prev,s,s.next)>0&&kt(e.prev,e,e.next)>0)}function kt(s,e,t){return(e.y-s.y)*(t.x-e.x)-(e.x-s.x)*(t.y-e.y)}function Dl(s,e){return s.x===e.x&&s.y===e.y}function rp(s,e,t,n){let i=yo(kt(s,e,t)),r=yo(kt(s,e,n)),a=yo(kt(t,n,s)),o=yo(kt(t,n,e));return!!(i!==r&&a!==o||i===0&&xo(s,t,e)||r===0&&xo(s,n,e)||a===0&&xo(t,s,n)||o===0&&xo(t,e,n))}function xo(s,e,t){return e.x<=Math.max(s.x,t.x)&&e.x>=Math.min(s.x,t.x)&&e.y<=Math.max(s.y,t.y)&&e.y>=Math.min(s.y,t.y)}function yo(s){return s>0?1:s<0?-1:0}function gy(s,e){let t=s;do{if(t.i!==s.i&&t.next.i!==s.i&&t.i!==e.i&&t.next.i!==e.i&&rp(t,t.next,s,e))return!0;t=t.next}while(t!==s);return!1}function qs(s,e){return kt(s.prev,s,s.next)<0?kt(s,e,s.next)>=0&&kt(s,s.prev,e)>=0:kt(s,e,s.prev)<0||kt(s,s.next,e)<0}function vy(s,e){let t=s,n=!1,i=(s.x+e.x)/2,r=(s.y+e.y)/2;do t.y>r!=t.next.y>r&&t.next.y!==t.y&&i<(t.next.x-t.x)*(r-t.y)/(t.next.y-t.y)+t.x&&(n=!n),t=t.next;while(t!==s);return n}function sp(s,e){let t=new qc(s.i,s.x,s.y),n=new qc(e.i,e.x,e.y),i=s.next,r=e.prev;return s.next=e,e.prev=s,t.next=i,i.prev=t,n.next=t,t.prev=n,r.next=n,n.prev=r,n}function Dh(s,e,t,n){let i=new qc(s,e,t);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function Xs(s){s.next.prev=s.prev,s.prev.next=s.next,s.prevZ&&(s.prevZ.nextZ=s.nextZ),s.nextZ&&(s.nextZ.prevZ=s.prevZ)}function qc(s,e,t){this.i=s,this.x=e,this.y=t,this.prev=null,this.next=null,this.z=null,this.prevZ=null,this.nextZ=null,this.steiner=!1}function xy(s,e,t,n){let i=0;for(let r=e,a=t-n;r<t;r+=n)i+=(s[a]-s[r])*(s[r+1]+s[a+1]),a=r;return i}var kn=class s{static area(e){let t=e.length,n=0;for(let i=t-1,r=0;r<t;i=r++)n+=e[i].x*e[r].y-e[r].x*e[i].y;return n*.5}static isClockWise(e){return s.area(e)<0}static triangulateShape(e,t){let n=[],i=[],r=[];Ih(e),Fh(n,e);let a=e.length;t.forEach(Ih);for(let c=0;c<t.length;c++)i.push(a),a+=t[c].length,Fh(n,t[c]);let o=ny.triangulate(n,i);for(let c=0;c<o.length;c+=3)r.push(o.slice(c,c+3));return r}};function Ih(s){let e=s.length;e>2&&s[e-1].equals(s[0])&&s.pop()}function Fh(s,e){for(let t=0;t<e.length;t++)s.push(e[t].x),s.push(e[t].y)}var Wn=class extends _t{constructor(e,t){super(),this.type="ExtrudeGeometry",this.parameters={shapes:e,options:t},e=Array.isArray(e)?e:[e];let n=this,i=[],r=[];for(let o=0,c=e.length;o<c;o++){let l=e[o];a(l)}this.setAttribute("position",new dt(i,3)),this.setAttribute("uv",new dt(r,2)),this.computeVertexNormals();function a(o){let c=[],l=t.curveSegments!==void 0?t.curveSegments:12,h=t.steps!==void 0?t.steps:1,u=t.depth!==void 0?t.depth:100,d=t.bevelEnabled!==void 0?t.bevelEnabled:!0,f=t.bevelThickness!==void 0?t.bevelThickness:6,p=t.bevelSize!==void 0?t.bevelSize:f-2,y=t.bevelOffset!==void 0?t.bevelOffset:0,x=t.bevelSegments!==void 0?t.bevelSegments:3,v=t.extrudePath,g=t.UVGenerator!==void 0?t.UVGenerator:yy;t.amount!==void 0&&(console.warn("THREE.ExtrudeBufferGeometry: amount has been renamed to depth."),u=t.amount);let m,S=!1,w,b,F,L;v&&(m=v.getSpacedPoints(h),S=!0,d=!1,w=v.computeFrenetFrames(h,!1),b=new Y,F=new Y,L=new Y),d||(x=0,f=0,p=0,y=0);let O=o.extractPoints(l),ae=O.shape,_=O.holes;if(!kn.isClockWise(ae)){ae=ae.reverse();for(let H=0,j=_.length;H<j;H++){let he=_[H];kn.isClockWise(he)&&(_[H]=he.reverse())}}let z=kn.triangulateShape(ae,_),D=ae;for(let H=0,j=_.length;H<j;H++){let he=_[H];ae=ae.concat(he)}function C(H,j,he){return j||console.error("THREE.ExtrudeGeometry: vec does not exist"),j.clone().multiplyScalar(he).add(H)}let I=ae.length,K=z.length;function G(H,j,he){let de,ie,R,T=H.x-j.x,te=H.y-j.y,$=he.x-H.x,xe=he.y-H.y,Z=T*T+te*te,Ie=T*xe-te*$;if(Math.abs(Ie)>Number.EPSILON){let Ne=Math.sqrt(Z),ee=Math.sqrt($*$+xe*xe),Ee=j.x-te/Ne,Ue=j.y+T/Ne,Ve=he.x-xe/ee,we=he.y+$/ee,Qe=((Ve-Ee)*xe-(we-Ue)*$)/(T*xe-te*$);de=Ee+T*Qe-H.x,ie=Ue+te*Qe-H.y;let ct=de*de+ie*ie;if(ct<=2)return new Je(de,ie);R=Math.sqrt(ct/2)}else{let Ne=!1;T>Number.EPSILON?$>Number.EPSILON&&(Ne=!0):T<-Number.EPSILON?$<-Number.EPSILON&&(Ne=!0):Math.sign(te)===Math.sign(xe)&&(Ne=!0),Ne?(de=-te,ie=T,R=Math.sqrt(Z)):(de=T,ie=te,R=Math.sqrt(Z/2))}return new Je(de/R,ie/R)}let oe=[];for(let H=0,j=D.length,he=j-1,de=H+1;H<j;H++,he++,de++)he===j&&(he=0),de===j&&(de=0),oe[H]=G(D[H],D[he],D[de]);let le=[],M,q=oe.concat();for(let H=0,j=_.length;H<j;H++){let he=_[H];M=[];for(let de=0,ie=he.length,R=ie-1,T=de+1;de<ie;de++,R++,T++)R===ie&&(R=0),T===ie&&(T=0),M[de]=G(he[de],he[R],he[T]);le.push(M),q=q.concat(M)}for(let H=0;H<x;H++){let j=H/x,he=f*Math.cos(j*Math.PI/2),de=p*Math.sin(j*Math.PI/2)+y;for(let ie=0,R=D.length;ie<R;ie++){let T=C(D[ie],oe[ie],de);fe(T.x,T.y,-he)}for(let ie=0,R=_.length;ie<R;ie++){let T=_[ie];M=le[ie];for(let te=0,$=T.length;te<$;te++){let xe=C(T[te],M[te],de);fe(xe.x,xe.y,-he)}}}let se=p+y;for(let H=0;H<I;H++){let j=d?C(ae[H],q[H],se):ae[H];S?(F.copy(w.normals[0]).multiplyScalar(j.x),b.copy(w.binormals[0]).multiplyScalar(j.y),L.copy(m[0]).add(F).add(b),fe(L.x,L.y,L.z)):fe(j.x,j.y,0)}for(let H=1;H<=h;H++)for(let j=0;j<I;j++){let he=d?C(ae[j],q[j],se):ae[j];S?(F.copy(w.normals[H]).multiplyScalar(he.x),b.copy(w.binormals[H]).multiplyScalar(he.y),L.copy(m[H]).add(F).add(b),fe(L.x,L.y,L.z)):fe(he.x,he.y,u/h*H)}for(let H=x-1;H>=0;H--){let j=H/x,he=f*Math.cos(j*Math.PI/2),de=p*Math.sin(j*Math.PI/2)+y;for(let ie=0,R=D.length;ie<R;ie++){let T=C(D[ie],oe[ie],de);fe(T.x,T.y,u+he)}for(let ie=0,R=_.length;ie<R;ie++){let T=_[ie];M=le[ie];for(let te=0,$=T.length;te<$;te++){let xe=C(T[te],M[te],de);S?fe(xe.x,xe.y+m[h-1].y,m[h-1].x+he):fe(xe.x,xe.y,u+he)}}}X(),pe();function X(){let H=i.length/3;if(d){let j=0,he=I*j;for(let de=0;de<K;de++){let ie=z[de];J(ie[2]+he,ie[1]+he,ie[0]+he)}j=h+x*2,he=I*j;for(let de=0;de<K;de++){let ie=z[de];J(ie[0]+he,ie[1]+he,ie[2]+he)}}else{for(let j=0;j<K;j++){let he=z[j];J(he[2],he[1],he[0])}for(let j=0;j<K;j++){let he=z[j];J(he[0]+I*h,he[1]+I*h,he[2]+I*h)}}n.addGroup(H,i.length/3-H,0)}function pe(){let H=i.length/3,j=0;ve(D,j),j+=D.length;for(let he=0,de=_.length;he<de;he++){let ie=_[he];ve(ie,j),j+=ie.length}n.addGroup(H,i.length/3-H,1)}function ve(H,j){let he=H.length;for(;--he>=0;){let de=he,ie=he-1;ie<0&&(ie=H.length-1);for(let R=0,T=h+x*2;R<T;R++){let te=I*R,$=I*(R+1),xe=j+de+te,Z=j+ie+te,Ie=j+ie+$,Ne=j+de+$;k(xe,Z,Ie,Ne)}}}function fe(H,j,he){c.push(H),c.push(j),c.push(he)}function J(H,j,he){ne(H),ne(j),ne(he);let de=i.length/3,ie=g.generateTopUV(n,i,de-3,de-2,de-1);ce(ie[0]),ce(ie[1]),ce(ie[2])}function k(H,j,he,de){ne(H),ne(j),ne(de),ne(j),ne(he),ne(de);let ie=i.length/3,R=g.generateSideWallUV(n,i,ie-6,ie-3,ie-2,ie-1);ce(R[0]),ce(R[1]),ce(R[3]),ce(R[1]),ce(R[2]),ce(R[3])}function ne(H){i.push(c[H*3+0]),i.push(c[H*3+1]),i.push(c[H*3+2])}function ce(H){r.push(H.x),r.push(H.y)}}}toJSON(){let e=_t.prototype.toJSON.call(this),t=this.parameters.shapes,n=this.parameters.options;return by(t,n,e)}},yy={generateTopUV:function(s,e,t,n,i){let r=e[t*3],a=e[t*3+1],o=e[n*3],c=e[n*3+1],l=e[i*3],h=e[i*3+1];return[new Je(r,a),new Je(o,c),new Je(l,h)]},generateSideWallUV:function(s,e,t,n,i,r){let a=e[t*3],o=e[t*3+1],c=e[t*3+2],l=e[n*3],h=e[n*3+1],u=e[n*3+2],d=e[i*3],f=e[i*3+1],p=e[i*3+2],y=e[r*3],x=e[r*3+1],v=e[r*3+2];return Math.abs(o-h)<.01?[new Je(a,1-c),new Je(l,1-u),new Je(d,1-p),new Je(y,1-v)]:[new Je(o,1-c),new Je(h,1-u),new Je(f,1-p),new Je(x,1-v)]}};function by(s,e,t){if(t.shapes=[],Array.isArray(s))for(let n=0,i=s.length;n<i;n++){let r=s[n];t.shapes.push(r.uuid)}else t.shapes.push(s.uuid);return e.extrudePath!==void 0&&(t.options.extrudePath=e.extrudePath.toJSON()),t}var Ys=class extends ni{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}},Zs=class extends _t{constructor(e,t=12,n=0,i=Math.PI*2){super(),this.type="LatheGeometry",this.parameters={points:e,segments:t,phiStart:n,phiLength:i},t=Math.floor(t),i=tn(i,0,Math.PI*2);let r=[],a=[],o=[],c=1/t,l=new Y,h=new Je;for(let u=0;u<=t;u++){let d=n+u*c*i,f=Math.sin(d),p=Math.cos(d);for(let y=0;y<=e.length-1;y++)l.x=e[y].x*f,l.y=e[y].y,l.z=e[y].x*p,a.push(l.x,l.y,l.z),h.x=u/t,h.y=y/(e.length-1),o.push(h.x,h.y)}for(let u=0;u<t;u++)for(let d=0;d<e.length-1;d++){let f=d+u*e.length,p=f,y=f+e.length,x=f+e.length+1,v=f+1;r.push(p,y,v),r.push(y,x,v)}if(this.setIndex(r),this.setAttribute("position",new dt(a,3)),this.setAttribute("uv",new dt(o,2)),this.computeVertexNormals(),i===Math.PI*2){let u=this.attributes.normal.array,d=new Y,f=new Y,p=new Y,y=t*e.length*3;for(let x=0,v=0;x<e.length;x++,v+=3)d.x=u[v+0],d.y=u[v+1],d.z=u[v+2],f.x=u[y+v+0],f.y=u[y+v+1],f.z=u[y+v+2],p.addVectors(d,f).normalize(),u[v+0]=u[y+v+0]=p.x,u[v+1]=u[y+v+1]=p.y,u[v+2]=u[y+v+2]=p.z}}},Hr=class extends ni{constructor(e=1,t=0){let n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}},js=class extends _t{constructor(e,t,n){super(),this.type="ParametricGeometry",this.parameters={func:e,slices:t,stacks:n};let i=[],r=[],a=[],o=[],c=1e-5,l=new Y,h=new Y,u=new Y,d=new Y,f=new Y;e.length<3&&console.error("THREE.ParametricGeometry: Function must now modify a Vector3 as third parameter.");let p=t+1;for(let y=0;y<=n;y++){let x=y/n;for(let v=0;v<=t;v++){let g=v/t;e(g,x,h),r.push(h.x,h.y,h.z),g-c>=0?(e(g-c,x,u),d.subVectors(h,u)):(e(g+c,x,u),d.subVectors(u,h)),x-c>=0?(e(g,x-c,u),f.subVectors(h,u)):(e(g,x+c,u),f.subVectors(u,h)),l.crossVectors(d,f).normalize(),a.push(l.x,l.y,l.z),o.push(g,x)}}for(let y=0;y<n;y++)for(let x=0;x<t;x++){let v=y*p+x,g=y*p+x+1,m=(y+1)*p+x+1,S=(y+1)*p+x;i.push(v,g,S),i.push(g,m,S)}this.setIndex(i),this.setAttribute("position",new dt(r,3)),this.setAttribute("normal",new dt(a,3)),this.setAttribute("uv",new dt(o,2))}},Js=class extends _t{constructor(e=.5,t=1,n=8,i=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:a},n=Math.max(3,n),i=Math.max(1,i);let o=[],c=[],l=[],h=[],u=e,d=(t-e)/i,f=new Y,p=new Je;for(let y=0;y<=i;y++){for(let x=0;x<=n;x++){let v=r+x/n*a;f.x=u*Math.cos(v),f.y=u*Math.sin(v),c.push(f.x,f.y,f.z),l.push(0,0,1),p.x=(f.x/t+1)/2,p.y=(f.y/t+1)/2,h.push(p.x,p.y)}u+=d}for(let y=0;y<i;y++){let x=y*(n+1);for(let v=0;v<n;v++){let g=v+x,m=g,S=g+n+1,w=g+n+2,b=g+1;o.push(m,S,b),o.push(S,w,b)}}this.setIndex(o),this.setAttribute("position",new dt(c,3)),this.setAttribute("normal",new dt(l,3)),this.setAttribute("uv",new dt(h,2))}},qr=class extends _t{constructor(e,t=12){super(),this.type="ShapeGeometry",this.parameters={shapes:e,curveSegments:t};let n=[],i=[],r=[],a=[],o=0,c=0;if(Array.isArray(e)===!1)l(e);else for(let h=0;h<e.length;h++)l(e[h]),this.addGroup(o,c,h),o+=c,c=0;this.setIndex(n),this.setAttribute("position",new dt(i,3)),this.setAttribute("normal",new dt(r,3)),this.setAttribute("uv",new dt(a,2));function l(h){let u=i.length/3,d=h.extractPoints(t),f=d.shape,p=d.holes;kn.isClockWise(f)===!1&&(f=f.reverse());for(let x=0,v=p.length;x<v;x++){let g=p[x];kn.isClockWise(g)===!0&&(p[x]=g.reverse())}let y=kn.triangulateShape(f,p);for(let x=0,v=p.length;x<v;x++){let g=p[x];f=f.concat(g)}for(let x=0,v=f.length;x<v;x++){let g=f[x];i.push(g.x,g.y,0),r.push(0,0,1),a.push(g.x,g.y)}for(let x=0,v=y.length;x<v;x++){let g=y[x],m=g[0]+u,S=g[1]+u,w=g[2]+u;n.push(m,S,w),c+=3}}}toJSON(){let e=_t.prototype.toJSON.call(this),t=this.parameters.shapes;return wy(t,e)}};function wy(s,e){if(e.shapes=[],Array.isArray(s))for(let t=0,n=s.length;t<n;t++){let i=s[t];e.shapes.push(i.uuid)}else e.shapes.push(s.uuid);return e}var Xr=class extends _t{constructor(e=1,t=8,n=6,i=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let c=Math.min(a+o,Math.PI),l=0,h=[],u=new Y,d=new Y,f=[],p=[],y=[],x=[];for(let v=0;v<=n;v++){let g=[],m=v/n,S=0;v==0&&a==0?S=.5/t:v==n&&c==Math.PI&&(S=-.5/t);for(let w=0;w<=t;w++){let b=w/t;u.x=-e*Math.cos(i+b*r)*Math.sin(a+m*o),u.y=e*Math.cos(a+m*o),u.z=e*Math.sin(i+b*r)*Math.sin(a+m*o),p.push(u.x,u.y,u.z),d.copy(u).normalize(),y.push(d.x,d.y,d.z),x.push(b+S,1-m),g.push(l++)}h.push(g)}for(let v=0;v<n;v++)for(let g=0;g<t;g++){let m=h[v][g+1],S=h[v][g],w=h[v+1][g],b=h[v+1][g+1];(v!==0||a>0)&&f.push(m,S,b),(v!==n-1||c<Math.PI)&&f.push(S,w,b)}this.setIndex(f),this.setAttribute("position",new dt(p,3)),this.setAttribute("normal",new dt(y,3)),this.setAttribute("uv",new dt(x,2))}},$s=class extends ni{constructor(e=1,t=0){let n=[1,1,1,-1,-1,1,-1,1,-1,1,-1,-1],i=[2,1,0,0,3,2,1,3,0,2,3,1];super(n,i,e,t),this.type="TetrahedronGeometry",this.parameters={radius:e,detail:t}}},Ks=class extends Wn{constructor(e,t={}){let n=t.font;if(!(n&&n.isFont))return console.error("THREE.TextGeometry: font parameter is not an instance of THREE.Font."),new _t;let i=n.generateShapes(e,t.size);t.depth=t.height!==void 0?t.height:50,t.bevelThickness===void 0&&(t.bevelThickness=10),t.bevelSize===void 0&&(t.bevelSize=8),t.bevelEnabled===void 0&&(t.bevelEnabled=!1),super(i,t),this.type="TextGeometry"}},Qs=class extends _t{constructor(e=1,t=.4,n=8,i=6,r=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:i,arc:r},n=Math.floor(n),i=Math.floor(i);let a=[],o=[],c=[],l=[],h=new Y,u=new Y,d=new Y;for(let f=0;f<=n;f++)for(let p=0;p<=i;p++){let y=p/i*r,x=f/n*Math.PI*2;u.x=(e+t*Math.cos(x))*Math.cos(y),u.y=(e+t*Math.cos(x))*Math.sin(y),u.z=t*Math.sin(x),o.push(u.x,u.y,u.z),h.x=e*Math.cos(y),h.y=e*Math.sin(y),d.subVectors(u,h).normalize(),c.push(d.x,d.y,d.z),l.push(p/i),l.push(f/n)}for(let f=1;f<=n;f++)for(let p=1;p<=i;p++){let y=(i+1)*f+p-1,x=(i+1)*(f-1)+p-1,v=(i+1)*(f-1)+p,g=(i+1)*f+p;a.push(y,x,g),a.push(x,v,g)}this.setIndex(a),this.setAttribute("position",new dt(o,3)),this.setAttribute("normal",new dt(c,3)),this.setAttribute("uv",new dt(l,2))}},ea=class extends _t{constructor(e=1,t=.4,n=64,i=8,r=2,a=3){super(),this.type="TorusKnotGeometry",this.parameters={radius:e,tube:t,tubularSegments:n,radialSegments:i,p:r,q:a},n=Math.floor(n),i=Math.floor(i);let o=[],c=[],l=[],h=[],u=new Y,d=new Y,f=new Y,p=new Y,y=new Y,x=new Y,v=new Y;for(let m=0;m<=n;++m){let S=m/n*r*Math.PI*2;g(S,r,a,e,f),g(S+.01,r,a,e,p),x.subVectors(p,f),v.addVectors(p,f),y.crossVectors(x,v),v.crossVectors(y,x),y.normalize(),v.normalize();for(let w=0;w<=i;++w){let b=w/i*Math.PI*2,F=-t*Math.cos(b),L=t*Math.sin(b);u.x=f.x+(F*v.x+L*y.x),u.y=f.y+(F*v.y+L*y.y),u.z=f.z+(F*v.z+L*y.z),c.push(u.x,u.y,u.z),d.subVectors(u,f).normalize(),l.push(d.x,d.y,d.z),h.push(m/n),h.push(w/i)}}for(let m=1;m<=n;m++)for(let S=1;S<=i;S++){let w=(i+1)*(m-1)+(S-1),b=(i+1)*m+(S-1),F=(i+1)*m+S,L=(i+1)*(m-1)+S;o.push(w,b,L),o.push(b,F,L)}this.setIndex(o),this.setAttribute("position",new dt(c,3)),this.setAttribute("normal",new dt(l,3)),this.setAttribute("uv",new dt(h,2));function g(m,S,w,b,F){let L=Math.cos(m),O=Math.sin(m),ae=w/S*m,_=Math.cos(ae);F.x=b*(2+_)*.5*L,F.y=b*(2+_)*O*.5,F.z=b*Math.sin(ae)*.5}}},ta=class extends _t{constructor(e,t=64,n=1,i=8,r=!1){super(),this.type="TubeGeometry",this.parameters={path:e,tubularSegments:t,radius:n,radialSegments:i,closed:r};let a=e.computeFrenetFrames(t,r);this.tangents=a.tangents,this.normals=a.normals,this.binormals=a.binormals;let o=new Y,c=new Y,l=new Je,h=new Y,u=[],d=[],f=[],p=[];y(),this.setIndex(p),this.setAttribute("position",new dt(u,3)),this.setAttribute("normal",new dt(d,3)),this.setAttribute("uv",new dt(f,2));function y(){for(let m=0;m<t;m++)x(m);x(r===!1?t:0),g(),v()}function x(m){h=e.getPointAt(m/t,h);let S=a.normals[m],w=a.binormals[m];for(let b=0;b<=i;b++){let F=b/i*Math.PI*2,L=Math.sin(F),O=-Math.cos(F);c.x=O*S.x+L*w.x,c.y=O*S.y+L*w.y,c.z=O*S.z+L*w.z,c.normalize(),d.push(c.x,c.y,c.z),o.x=h.x+n*c.x,o.y=h.y+n*c.y,o.z=h.z+n*c.z,u.push(o.x,o.y,o.z)}}function v(){for(let m=1;m<=t;m++)for(let S=1;S<=i;S++){let w=(i+1)*(m-1)+(S-1),b=(i+1)*m+(S-1),F=(i+1)*m+S,L=(i+1)*(m-1)+S;p.push(w,b,L),p.push(b,F,L)}}function g(){for(let m=0;m<=t;m++)for(let S=0;S<=i;S++)l.x=m/t,l.y=S/i,f.push(l.x,l.y)}}toJSON(){let e=_t.prototype.toJSON.call(this);return e.path=this.parameters.path.toJSON(),e}},na=class extends _t{constructor(e){if(super(),this.type="WireframeGeometry",e.isGeometry===!0){console.error("THREE.WireframeGeometry no longer supports THREE.Geometry. Use THREE.BufferGeometry instead.");return}let t=[],n=[0,0],i={},r=new Y;if(e.index!==null){let a=e.attributes.position,o=e.index,c=e.groups;c.length===0&&(c=[{start:0,count:o.count,materialIndex:0}]);for(let l=0,h=c.length;l<h;++l){let u=c[l],d=u.start,f=u.count;for(let p=d,y=d+f;p<y;p+=3)for(let x=0;x<3;x++){let v=o.getX(p+x),g=o.getX(p+(x+1)%3);n[0]=Math.min(v,g),n[1]=Math.max(v,g);let m=n[0]+","+n[1];i[m]===void 0&&(i[m]={index1:n[0],index2:n[1]})}}for(let l in i){let h=i[l];r.fromBufferAttribute(a,h.index1),t.push(r.x,r.y,r.z),r.fromBufferAttribute(a,h.index2),t.push(r.x,r.y,r.z)}}else{let a=e.attributes.position;for(let o=0,c=a.count/3;o<c;o++)for(let l=0;l<3;l++){let h=3*o+l;r.fromBufferAttribute(a,h),t.push(r.x,r.y,r.z);let u=3*o+(l+1)%3;r.fromBufferAttribute(a,u),t.push(r.x,r.y,r.z)}}this.setAttribute("position",new dt(t,3))}},cn=Object.freeze({__proto__:null,BoxGeometry:vi,BoxBufferGeometry:vi,CircleGeometry:Os,CircleBufferGeometry:Os,ConeGeometry:Gs,ConeBufferGeometry:Gs,CylinderGeometry:Hi,CylinderBufferGeometry:Hi,DodecahedronGeometry:Ws,DodecahedronBufferGeometry:Ws,EdgesGeometry:Vs,ExtrudeGeometry:Wn,ExtrudeBufferGeometry:Wn,IcosahedronGeometry:Ys,IcosahedronBufferGeometry:Ys,LatheGeometry:Zs,LatheBufferGeometry:Zs,OctahedronGeometry:Hr,OctahedronBufferGeometry:Hr,ParametricGeometry:js,ParametricBufferGeometry:js,PlaneGeometry:Br,PlaneBufferGeometry:Br,PolyhedronGeometry:ni,PolyhedronBufferGeometry:ni,RingGeometry:Js,RingBufferGeometry:Js,ShapeGeometry:qr,ShapeBufferGeometry:qr,SphereGeometry:Xr,SphereBufferGeometry:Xr,TetrahedronGeometry:$s,TetrahedronBufferGeometry:$s,TextGeometry:Ks,TextBufferGeometry:Ks,TorusGeometry:Qs,TorusBufferGeometry:Qs,TorusKnotGeometry:ea,TorusKnotBufferGeometry:ea,TubeGeometry:ta,TubeBufferGeometry:ta,WireframeGeometry:na}),ia=class extends Yt{constructor(e){super(),this.type="ShadowMaterial",this.color=new ut(0),this.transparent=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this}};ia.prototype.isShadowMaterial=!0;var Mi=class extends Rn{constructor(e){super(e),this.type="RawShaderMaterial"}};Mi.prototype.isRawShaderMaterial=!0;var Yr=class extends Yt{constructor(e){super(),this.defines={STANDARD:""},this.type="MeshStandardMaterial",this.color=new ut(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new Je(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.flatShading=!1,this.vertexTangents=!1,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapIntensity=e.envMapIntensity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.flatShading=e.flatShading,this.vertexTangents=e.vertexTangents,this}};Yr.prototype.isMeshStandardMaterial=!0;var ra=class extends Yr{constructor(e){super(),this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.clearcoat=0,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Je(1,1),this.clearcoatNormalMap=null,this.reflectivity=.5,Object.defineProperty(this,"ior",{get:function(){return(1+.4*this.reflectivity)/(1-.4*this.reflectivity)},set:function(t){this.reflectivity=tn(2.5*(t-1)/(t+1),0,1)}}),this.sheen=null,this.transmission=0,this.transmissionMap=null,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.reflectivity=e.reflectivity,e.sheen?this.sheen=(this.sheen||new ut).copy(e.sheen):this.sheen=null,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this}};ra.prototype.isMeshPhysicalMaterial=!0;var sa=class extends Yt{constructor(e){super(),this.type="MeshPhongMaterial",this.color=new ut(16777215),this.specular=new ut(1118481),this.shininess=30,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new Je(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=za,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.flatShading=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.specular.copy(e.specular),this.shininess=e.shininess,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.flatShading=e.flatShading,this}};sa.prototype.isMeshPhongMaterial=!0;var aa=class extends Yt{constructor(e){super(),this.defines={TOON:""},this.type="MeshToonMaterial",this.color=new ut(16777215),this.map=null,this.gradientMap=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new Je(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.alphaMap=null,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.gradientMap=e.gradientMap,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.alphaMap=e.alphaMap,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this}};aa.prototype.isMeshToonMaterial=!0;var oa=class extends Yt{constructor(e){super(),this.type="MeshNormalMaterial",this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new Je(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.flatShading=!1,this.setValues(e)}copy(e){return super.copy(e),this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.flatShading=e.flatShading,this}};oa.prototype.isMeshNormalMaterial=!0;var la=class extends Yt{constructor(e){super(),this.type="MeshLambertMaterial",this.color=new ut(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ut(0),this.emissiveIntensity=1,this.emissiveMap=null,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.combine=za,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this}};la.prototype.isMeshLambertMaterial=!0;var ca=class extends Yt{constructor(e){super(),this.defines={MATCAP:""},this.type="MeshMatcapMaterial",this.color=new ut(16777215),this.matcap=null,this.map=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=er,this.normalScale=new Je(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.alphaMap=null,this.skinning=!1,this.morphTargets=!1,this.morphNormals=!1,this.flatShading=!1,this.setValues(e)}copy(e){return super.copy(e),this.defines={MATCAP:""},this.color.copy(e.color),this.matcap=e.matcap,this.map=e.map,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.alphaMap=e.alphaMap,this.skinning=e.skinning,this.morphTargets=e.morphTargets,this.morphNormals=e.morphNormals,this.flatShading=e.flatShading,this}};ca.prototype.isMeshMatcapMaterial=!0;var ua=class extends Zt{constructor(e){super(),this.type="LineDashedMaterial",this.scale=1,this.dashSize=3,this.gapSize=1,this.setValues(e)}copy(e){return super.copy(e),this.scale=e.scale,this.dashSize=e.dashSize,this.gapSize=e.gapSize,this}};ua.prototype.isLineDashedMaterial=!0;var My=Object.freeze({__proto__:null,ShadowMaterial:ia,SpriteMaterial:Or,RawShaderMaterial:Mi,ShaderMaterial:Rn,PointsMaterial:ti,MeshPhysicalMaterial:ra,MeshStandardMaterial:Yr,MeshPhongMaterial:sa,MeshToonMaterial:aa,MeshNormalMaterial:oa,MeshLambertMaterial:la,MeshDepthMaterial:kr,MeshDistanceMaterial:Nr,MeshBasicMaterial:Ln,MeshMatcapMaterial:ca,LineDashedMaterial:ua,LineBasicMaterial:Zt,Material:Yt}),Bt={arraySlice:function(s,e,t){return Bt.isTypedArray(s)?new s.constructor(s.subarray(e,t!==void 0?t:s.length)):s.slice(e,t)},convertArray:function(s,e,t){return!s||!t&&s.constructor===e?s:typeof e.BYTES_PER_ELEMENT=="number"?new e(s):Array.prototype.slice.call(s)},isTypedArray:function(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)},getKeyframeOrder:function(s){function e(i,r){return s[i]-s[r]}let t=s.length,n=new Array(t);for(let i=0;i!==t;++i)n[i]=i;return n.sort(e),n},sortedArray:function(s,e,t){let n=s.length,i=new s.constructor(n);for(let r=0,a=0;a!==n;++r){let o=t[r]*e;for(let c=0;c!==e;++c)i[a++]=s[o+c]}return i},flattenJSON:function(s,e,t,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(e.push(r.time),t.push.apply(t,a)),r=s[i++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(e.push(r.time),a.toArray(t,t.length)),r=s[i++];while(r!==void 0);else do a=r[n],a!==void 0&&(e.push(r.time),t.push(a)),r=s[i++];while(r!==void 0)},subclip:function(s,e,t,n,i=30){let r=s.clone();r.name=e;let a=[];for(let c=0;c<r.tracks.length;++c){let l=r.tracks[c],h=l.getValueSize(),u=[],d=[];for(let f=0;f<l.times.length;++f){let p=l.times[f]*i;if(!(p<t||p>=n)){u.push(l.times[f]);for(let y=0;y<h;++y)d.push(l.values[f*h+y])}}u.length!==0&&(l.times=Bt.convertArray(u,l.times.constructor),l.values=Bt.convertArray(d,l.values.constructor),a.push(l))}r.tracks=a;let o=1/0;for(let c=0;c<r.tracks.length;++c)o>r.tracks[c].times[0]&&(o=r.tracks[c].times[0]);for(let c=0;c<r.tracks.length;++c)r.tracks[c].shift(-1*o);return r.resetDuration(),r},makeClipAdditive:function(s,e=0,t=s,n=30){n<=0&&(n=30);let i=t.tracks.length,r=e/n;for(let a=0;a<i;++a){let o=t.tracks[a],c=o.ValueTypeName;if(c==="bool"||c==="string")continue;let l=s.tracks.find(function(v){return v.name===o.name&&v.ValueTypeName===c});if(l===void 0)continue;let h=0,u=o.getValueSize();o.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline&&(h=u/3);let d=0,f=l.getValueSize();l.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline&&(d=f/3);let p=o.times.length-1,y;if(r<=o.times[0]){let v=h,g=u-h;y=Bt.arraySlice(o.values,v,g)}else if(r>=o.times[p]){let v=p*u+h,g=v+u-h;y=Bt.arraySlice(o.values,v,g)}else{let v=o.createInterpolant(),g=h,m=u-h;v.evaluate(r),y=Bt.arraySlice(v.resultBuffer,g,m)}c==="quaternion"&&new Xt().fromArray(y).normalize().conjugate().toArray(y);let x=l.times.length;for(let v=0;v<x;++v){let g=v*f+d;if(c==="quaternion")Xt.multiplyQuaternionsFlat(l.values,g,y,0,l.values,g);else{let m=f-d*2;for(let S=0;S<m;++S)l.values[g+S]-=y[S]}}}return s.blendMode=Mu,s}},Dn=class{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];e:{t:{let a;n:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.afterEnd_(n-1,e,r)}if(n===o)break;if(r=i,i=t[++n],e<i)break t}a=t.length;break n}if(!(e>=r)){let o=t[1];e<o&&(n=2,r=o);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.beforeStart_(0,e,i);if(n===c)break;if(i=r,r=t[--n-1],e>=r)break t}a=n,n=0;break n}break e}for(;n<a;){let o=n+a>>>1;e<t[o]?a=o:n=o+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.beforeStart_(0,e,i);if(i===void 0)return n=t.length,this._cachedIndex=n,this.afterEnd_(n-1,r,e)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let a=0;a!==i;++a)t[a]=n[r+a];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}};Dn.prototype.beforeStart_=Dn.prototype.copySampleValue_;Dn.prototype.afterEnd_=Dn.prototype.copySampleValue_;var $o=class extends Dn{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:Fi,endingEnd:Fi}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,a=e+1,o=i[r],c=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case Bi:r=e,o=2*t-n;break;case Ps:r=i.length-2,o=t+i[r]-i[r+1];break;default:r=e,o=n}if(c===void 0)switch(this.getSettings_().endingEnd){case Bi:a=e,c=2*n-t;break;case Ps:a=1,c=n+i[1]-i[0];break;default:a=e-1,c=t}let l=(n-t)*.5,h=this.valueSize;this._weightPrev=l/(t-o),this._weightNext=l/(c-n),this._offsetPrev=r*h,this._offsetNext=a*h}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(i-t),y=p*p,x=y*p,v=-d*x+2*d*y-d*p,g=(1+d)*x+(-1.5-2*d)*y+(-.5+d)*p+1,m=(-1-f)*x+(1.5+f)*y+.5*p,S=f*x-f*y;for(let w=0;w!==o;++w)r[w]=v*a[h+w]+g*a[l+w]+m*a[c+w]+S*a[u+w];return r}},ha=class extends Dn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,h=(n-t)/(i-t),u=1-h;for(let d=0;d!==o;++d)r[d]=a[l+d]*u+a[c+d]*h;return r}},Ko=class extends Dn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}},bn=class{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=Bt.convertArray(t,this.TimeBufferType),this.values=Bt.convertArray(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:Bt.convertArray(e.times,Array),values:Bt.convertArray(e.values,Array)};let i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ko(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new ha(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new $o(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case Es:t=this.InterpolantFactoryMethodDiscrete;break;case Cs:t=this.InterpolantFactoryMethodLinear;break;case Lo:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return Es;case this.InterpolantFactoryMethodLinear:return Cs;case this.InterpolantFactoryMethodSmooth:return Lo}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){let n=this.times,i=n.length,r=0,a=i-1;for(;r!==i&&n[r]<e;)++r;for(;a!==-1&&n[a]>t;)--a;if(++a,r!==0||a!==i){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=Bt.arraySlice(n,r,a),this.values=Bt.arraySlice(this.values,r*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==r;o++){let c=n[o];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,o,c),e=!1;break}if(a!==null&&a>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,o,c,a),e=!1;break}a=c}if(i!==void 0&&Bt.isTypedArray(i))for(let o=0,c=i.length;o!==c;++o){let l=i[o];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,o,l),e=!1;break}}return e}optimize(){let e=Bt.arraySlice(this.times),t=Bt.arraySlice(this.values),n=this.getValueSize(),i=this.getInterpolation()===Lo,r=e.length-1,a=1;for(let o=1;o<r;++o){let c=!1,l=e[o],h=e[o+1];if(l!==h&&(o!==1||l!==e[0]))if(i)c=!0;else{let u=o*n,d=u-n,f=u+n;for(let p=0;p!==n;++p){let y=t[u+p];if(y!==t[d+p]||y!==t[f+p]){c=!0;break}}}if(c){if(o!==a){e[a]=e[o];let u=o*n,d=a*n;for(let f=0;f!==n;++f)t[d+f]=t[u+f]}++a}}if(r>0){e[a]=e[r];for(let o=r*n,c=a*n,l=0;l!==n;++l)t[c+l]=t[o+l];++a}return a!==e.length?(this.times=Bt.arraySlice(e,0,a),this.values=Bt.arraySlice(t,0,a*n)):(this.times=e,this.values=t),this}clone(){let e=Bt.arraySlice(this.times,0),t=Bt.arraySlice(this.values,0),n=this.constructor,i=new n(this.name,e,t);return i.createInterpolant=this.createInterpolant,i}};bn.prototype.TimeBufferType=Float32Array;bn.prototype.ValueBufferType=Float32Array;bn.prototype.DefaultInterpolation=Cs;var ii=class extends bn{};ii.prototype.ValueTypeName="bool";ii.prototype.ValueBufferType=Array;ii.prototype.DefaultInterpolation=Es;ii.prototype.InterpolantFactoryMethodLinear=void 0;ii.prototype.InterpolantFactoryMethodSmooth=void 0;var da=class extends bn{};da.prototype.ValueTypeName="color";var qi=class extends bn{};qi.prototype.ValueTypeName="number";var Qo=class extends Dn{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=(n-t)/(i-t),l=e*o;for(let h=l+o;l!==h;l+=4)Xt.slerpFlat(r,0,a,l-o,a,l,c);return r}},_i=class extends bn{InterpolantFactoryMethodLinear(e){return new Qo(this.times,this.values,this.getValueSize(),e)}};_i.prototype.ValueTypeName="quaternion";_i.prototype.DefaultInterpolation=Cs;_i.prototype.InterpolantFactoryMethodSmooth=void 0;var ri=class extends bn{};ri.prototype.ValueTypeName="string";ri.prototype.ValueBufferType=Array;ri.prototype.DefaultInterpolation=Es;ri.prototype.InterpolantFactoryMethodLinear=void 0;ri.prototype.InterpolantFactoryMethodSmooth=void 0;var Xi=class extends bn{};Xi.prototype.ValueTypeName="vector";var Yi=class{constructor(e,t=-1,n,i=Ll){this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=yn(),this.duration<0&&this.resetDuration()}static parse(e){let t=[],n=e.tracks,i=1/(e.fps||1);for(let a=0,o=n.length;a!==o;++a)t.push(Sy(n[a]).scale(i));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r}static toJSON(e){let t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode};for(let r=0,a=n.length;r!==a;++r)t.push(bn.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){let r=t.length,a=[];for(let o=0;o<r;o++){let c=[],l=[];c.push((o+r-1)%r,o,(o+1)%r),l.push(0,1,0);let h=Bt.getKeyframeOrder(c);c=Bt.sortedArray(c,1,h),l=Bt.sortedArray(l,1,h),!i&&c[0]===0&&(c.push(r),l.push(l[0])),a.push(new qi(".morphTargetInfluences["+t[o].name+"]",c,l).scale(1/n))}return new this(e,-1,a)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let i={},r=/^([\\w-]*?)([\\d]+)$/;for(let o=0,c=e.length;o<c;o++){let l=e[o],h=l.name.match(r);if(h&&h.length>1){let u=h[1],d=i[u];d||(i[u]=d=[]),d.push(l)}}let a=[];for(let o in i)a.push(this.CreateFromMorphTargetSequence(o,i[o],t,n));return a}static parseAnimation(e,t){if(!e)return console.error("THREE.AnimationClip: No animation in JSONLoader data."),null;let n=function(u,d,f,p,y){if(f.length!==0){let x=[],v=[];Bt.flattenJSON(f,x,v,p),x.length!==0&&y.push(new u(d,x,v))}},i=[],r=e.name||"default",a=e.fps||30,o=e.blendMode,c=e.length||-1,l=e.hierarchy||[];for(let u=0;u<l.length;u++){let d=l[u].keys;if(!(!d||d.length===0))if(d[0].morphTargets){let f={},p;for(p=0;p<d.length;p++)if(d[p].morphTargets)for(let y=0;y<d[p].morphTargets.length;y++)f[d[p].morphTargets[y]]=-1;for(let y in f){let x=[],v=[];for(let g=0;g!==d[p].morphTargets.length;++g){let m=d[p];x.push(m.time),v.push(m.morphTarget===y?1:0)}i.push(new qi(".morphTargetInfluence["+y+"]",x,v))}c=f.length*(a||1)}else{let f=".bones["+t[u].name+"]";n(Xi,f+".position",d,"pos",i),n(_i,f+".quaternion",d,"rot",i),n(Xi,f+".scale",d,"scl",i)}}return i.length===0?null:new this(r,c,i,o)}resetDuration(){let e=this.tracks,t=0;for(let n=0,i=e.length;n!==i;++n){let r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let t=0;t<this.tracks.length;t++)e.push(this.tracks[t].clone());return new this.constructor(this.name,this.duration,e,this.blendMode)}toJSON(){return this.constructor.toJSON(this)}};function _y(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return qi;case"vector":case"vector2":case"vector3":case"vector4":return Xi;case"color":return da;case"quaternion":return _i;case"bool":case"boolean":return ii;case"string":return ri}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function Sy(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let e=_y(s.type);if(s.times===void 0){let t=[],n=[];Bt.flattenJSON(s.keys,t,n,"value"),s.times=t,s.values=n}return e.parse!==void 0?e.parse(s):new e(s.name,s.times,s.values,s.interpolation)}var Zi={enabled:!1,files:{},add:function(s,e){this.enabled!==!1&&(this.files[s]=e)},get:function(s){if(this.enabled!==!1)return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}},fa=class{constructor(e,t,n){let i=this,r=!1,a=0,o=0,c,l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(h){o++,r===!1&&i.onStart!==void 0&&i.onStart(h,a,o),r=!0},this.itemEnd=function(h){a++,i.onProgress!==void 0&&i.onProgress(h,a,o),a===o&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return c?c(h):h},this.setURLModifier=function(h){return c=h,this},this.addHandler=function(h,u){return l.push(h,u),this},this.removeHandler=function(h){let u=l.indexOf(h);return u!==-1&&l.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=l.length;u<d;u+=2){let f=l[u],p=l[u+1];if(f.global&&(f.lastIndex=0),f.test(h))return p}return null}}},ap=new fa,Qt=class{constructor(e){this.manager=e!==void 0?e:ap,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}},En={},_n=class extends Qt{constructor(e){super(e)}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Zi.get(e);if(a!==void 0)return r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0),a;if(En[e]!==void 0){En[e].push({onLoad:t,onProgress:n,onError:i});return}let o=/^data:(.*?)(;base64)?,(.*)$/,c=e.match(o),l;if(c){let h=c[1],u=!!c[2],d=c[3];d=decodeURIComponent(d),u&&(d=atob(d));try{let f,p=(this.responseType||"").toLowerCase();switch(p){case"arraybuffer":case"blob":let y=new Uint8Array(d.length);for(let v=0;v<d.length;v++)y[v]=d.charCodeAt(v);p==="blob"?f=new Blob([y.buffer],{type:h}):f=y.buffer;break;case"document":f=new DOMParser().parseFromString(d,h);break;case"json":f=JSON.parse(d);break;default:f=d;break}setTimeout(function(){t&&t(f),r.manager.itemEnd(e)},0)}catch(f){setTimeout(function(){i&&i(f),r.manager.itemError(e),r.manager.itemEnd(e)},0)}}else{En[e]=[],En[e].push({onLoad:t,onProgress:n,onError:i}),l=new XMLHttpRequest,l.open("GET",e,!0),l.addEventListener("load",function(h){let u=this.response,d=En[e];if(delete En[e],this.status===200||this.status===0){this.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),Zi.add(e,u);for(let f=0,p=d.length;f<p;f++){let y=d[f];y.onLoad&&y.onLoad(u)}r.manager.itemEnd(e)}else{for(let f=0,p=d.length;f<p;f++){let y=d[f];y.onError&&y.onError(h)}r.manager.itemError(e),r.manager.itemEnd(e)}},!1),l.addEventListener("progress",function(h){let u=En[e];for(let d=0,f=u.length;d<f;d++){let p=u[d];p.onProgress&&p.onProgress(h)}},!1),l.addEventListener("error",function(h){let u=En[e];delete En[e];for(let d=0,f=u.length;d<f;d++){let p=u[d];p.onError&&p.onError(h)}r.manager.itemError(e),r.manager.itemEnd(e)},!1),l.addEventListener("abort",function(h){let u=En[e];delete En[e];for(let d=0,f=u.length;d<f;d++){let p=u[d];p.onError&&p.onError(h)}r.manager.itemError(e),r.manager.itemEnd(e)},!1),this.responseType!==void 0&&(l.responseType=this.responseType),this.withCredentials!==void 0&&(l.withCredentials=this.withCredentials),l.overrideMimeType&&l.overrideMimeType(this.mimeType!==void 0?this.mimeType:"text/plain");for(let h in this.requestHeader)l.setRequestHeader(h,this.requestHeader[h]);l.send(null)}return r.manager.itemStart(e),l}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}},Xc=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new _n(this.manager);a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(o){try{t(r.parse(JSON.parse(o)))}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}parse(e){let t=[];for(let n=0;n<e.length;n++){let i=Yi.parse(e[n]);t.push(i)}return t}},Yc=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=[],o=new Us,c=new _n(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(r.withCredentials);let l=0;function h(u){c.load(e[u],function(d){let f=r.parse(d,!0);a[u]={width:f.width,height:f.height,format:f.format,mipmaps:f.mipmaps},l+=1,l===6&&(f.mipmapCount===1&&(o.minFilter=Jt),o.image=a,o.format=f.format,o.needsUpdate=!0,t&&t(o))},n,i)}if(Array.isArray(e))for(let u=0,d=e.length;u<d;++u)h(u);else c.load(e,function(u){let d=r.parse(u,!0);if(d.isCubemap){let f=d.mipmaps.length/d.mipmapCount;for(let p=0;p<f;p++){a[p]={mipmaps:[]};for(let y=0;y<d.mipmapCount;y++)a[p].mipmaps.push(d.mipmaps[p*d.mipmapCount+y]),a[p].format=d.format,a[p].width=d.width,a[p].height=d.height}o.image=a}else o.image.width=d.width,o.image.height=d.height,o.mipmaps=d.mipmaps;d.mipmapCount===1&&(o.minFilter=Jt),o.format=d.format,o.needsUpdate=!0,t&&t(o)},n,i);return o}},Zr=class extends Qt{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Zi.get(e);if(a!==void 0)return r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0),a;let o=document.createElementNS("http://www.w3.org/1999/xhtml","img");function c(){o.removeEventListener("load",c,!1),o.removeEventListener("error",l,!1),Zi.add(e,this),t&&t(this),r.manager.itemEnd(e)}function l(h){o.removeEventListener("load",c,!1),o.removeEventListener("error",l,!1),i&&i(h),r.manager.itemError(e),r.manager.itemEnd(e)}return o.addEventListener("load",c,!1),o.addEventListener("error",l,!1),e.substr(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),r.manager.itemStart(e),o.src=e,o}},el=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=new xi,a=new Zr(this.manager);a.setCrossOrigin(this.crossOrigin),a.setPath(this.path);let o=0;function c(l){a.load(e[l],function(h){r.images[l]=h,o++,o===6&&(r.needsUpdate=!0,t&&t(r))},void 0,i)}for(let l=0;l<e.length;++l)c(l);return r}},tl=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new yi,o=new _n(this.manager);return o.setResponseType("arraybuffer"),o.setRequestHeader(this.requestHeader),o.setPath(this.path),o.setWithCredentials(r.withCredentials),o.load(e,function(c){let l=r.parse(c);l&&(l.image!==void 0?a.image=l.image:l.data!==void 0&&(a.image.width=l.width,a.image.height=l.height,a.image.data=l.data),a.wrapS=l.wrapS!==void 0?l.wrapS:un,a.wrapT=l.wrapT!==void 0?l.wrapT:un,a.magFilter=l.magFilter!==void 0?l.magFilter:Jt,a.minFilter=l.minFilter!==void 0?l.minFilter:Jt,a.anisotropy=l.anisotropy!==void 0?l.anisotropy:1,l.encoding!==void 0&&(a.encoding=l.encoding),l.flipY!==void 0&&(a.flipY=l.flipY),l.format!==void 0&&(a.format=l.format),l.type!==void 0&&(a.type=l.type),l.mipmaps!==void 0&&(a.mipmaps=l.mipmaps,a.minFilter=es),l.mipmapCount===1&&(a.minFilter=Jt),l.generateMipmaps!==void 0&&(a.generateMipmaps=l.generateMipmaps),a.needsUpdate=!0,t&&t(a,l))},n,i),a}},nl=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=new Kt,a=new Zr(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(o){r.image=o;let c=e.search(/\\.jpe?g($|\\?)/i)>0||e.search(/^data\\:image\\/jpeg/)===0;r.format=c?pi:xn,r.needsUpdate=!0,t!==void 0&&t(r)},n,i),r}},fn=class{constructor(){this.type="Curve",this.arcLengthDivisions=200}getPoint(){return console.warn("THREE.Curve: .getPoint() not implemented."),null}getPointAt(e,t){let n=this.getUtoTmapping(e);return this.getPoint(n,t)}getPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return t}getSpacedPoints(e=5){let t=[];for(let n=0;n<=e;n++)t.push(this.getPointAt(n/e));return t}getLength(){let e=this.getLengths();return e[e.length-1]}getLengths(e=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===e+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;let t=[],n,i=this.getPoint(0),r=0;t.push(0);for(let a=1;a<=e;a++)n=this.getPoint(a/e),r+=n.distanceTo(i),t.push(r),i=n;return this.cacheArcLengths=t,t}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(e,t){let n=this.getLengths(),i=0,r=n.length,a;t?a=t:a=e*n[r-1];let o=0,c=r-1,l;for(;o<=c;)if(i=Math.floor(o+(c-o)/2),l=n[i]-a,l<0)o=i+1;else if(l>0)c=i-1;else{c=i;break}if(i=c,n[i]===a)return i/(r-1);let h=n[i],d=n[i+1]-h,f=(a-h)/d;return(i+f)/(r-1)}getTangent(e,t){let i=e-1e-4,r=e+1e-4;i<0&&(i=0),r>1&&(r=1);let a=this.getPoint(i),o=this.getPoint(r),c=t||(a.isVector2?new Je:new Y);return c.copy(o).sub(a).normalize(),c}getTangentAt(e,t){let n=this.getUtoTmapping(e);return this.getTangent(n,t)}computeFrenetFrames(e,t){let n=new Y,i=[],r=[],a=[],o=new Y,c=new bt;for(let f=0;f<=e;f++){let p=f/e;i[f]=this.getTangentAt(p,new Y),i[f].normalize()}r[0]=new Y,a[0]=new Y;let l=Number.MAX_VALUE,h=Math.abs(i[0].x),u=Math.abs(i[0].y),d=Math.abs(i[0].z);h<=l&&(l=h,n.set(1,0,0)),u<=l&&(l=u,n.set(0,1,0)),d<=l&&n.set(0,0,1),o.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],o),a[0].crossVectors(i[0],r[0]);for(let f=1;f<=e;f++){if(r[f]=r[f-1].clone(),a[f]=a[f-1].clone(),o.crossVectors(i[f-1],i[f]),o.length()>Number.EPSILON){o.normalize();let p=Math.acos(tn(i[f-1].dot(i[f]),-1,1));r[f].applyMatrix4(c.makeRotationAxis(o,p))}a[f].crossVectors(i[f],r[f])}if(t===!0){let f=Math.acos(tn(r[0].dot(r[e]),-1,1));f/=e,i[0].dot(o.crossVectors(r[0],r[e]))>0&&(f=-f);for(let p=1;p<=e;p++)r[p].applyMatrix4(c.makeRotationAxis(i[p],f*p)),a[p].crossVectors(i[p],r[p])}return{tangents:i,normals:r,binormals:a}}clone(){return new this.constructor().copy(this)}copy(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}toJSON(){let e={metadata:{version:4.5,type:"Curve",generator:"Curve.toJSON"}};return e.arcLengthDivisions=this.arcLengthDivisions,e.type=this.type,e}fromJSON(e){return this.arcLengthDivisions=e.arcLengthDivisions,this}},ji=class extends fn{constructor(e=0,t=0,n=1,i=1,r=0,a=Math.PI*2,o=!1,c=0){super(),this.type="EllipseCurve",this.aX=e,this.aY=t,this.xRadius=n,this.yRadius=i,this.aStartAngle=r,this.aEndAngle=a,this.aClockwise=o,this.aRotation=c}getPoint(e,t){let n=t||new Je,i=Math.PI*2,r=this.aEndAngle-this.aStartAngle,a=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=i;for(;r>i;)r-=i;r<Number.EPSILON&&(a?r=0:r=i),this.aClockwise===!0&&!a&&(r===i?r=-i:r=r-i);let o=this.aStartAngle+e*r,c=this.aX+this.xRadius*Math.cos(o),l=this.aY+this.yRadius*Math.sin(o);if(this.aRotation!==0){let h=Math.cos(this.aRotation),u=Math.sin(this.aRotation),d=c-this.aX,f=l-this.aY;c=d*h-f*u+this.aX,l=d*u+f*h+this.aY}return n.set(c,l)}copy(e){return super.copy(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}toJSON(){let e=super.toJSON();return e.aX=this.aX,e.aY=this.aY,e.xRadius=this.xRadius,e.yRadius=this.yRadius,e.aStartAngle=this.aStartAngle,e.aEndAngle=this.aEndAngle,e.aClockwise=this.aClockwise,e.aRotation=this.aRotation,e}fromJSON(e){return super.fromJSON(e),this.aX=e.aX,this.aY=e.aY,this.xRadius=e.xRadius,this.yRadius=e.yRadius,this.aStartAngle=e.aStartAngle,this.aEndAngle=e.aEndAngle,this.aClockwise=e.aClockwise,this.aRotation=e.aRotation,this}};ji.prototype.isEllipseCurve=!0;var pa=class extends ji{constructor(e,t,n,i,r,a){super(e,t,n,n,i,r,a),this.type="ArcCurve"}};pa.prototype.isArcCurve=!0;function Eu(){let s=0,e=0,t=0,n=0;function i(r,a,o,c){s=r,e=o,t=-3*r+3*a-2*o-c,n=2*r-2*a+o+c}return{initCatmullRom:function(r,a,o,c,l){i(a,o,l*(o-r),l*(c-a))},initNonuniformCatmullRom:function(r,a,o,c,l,h,u){let d=(a-r)/l-(o-r)/(l+h)+(o-a)/h,f=(o-a)/h-(c-a)/(h+u)+(c-o)/u;d*=h,f*=h,i(a,o,d,f)},calc:function(r){let a=r*r,o=a*r;return s+e*r+t*a+n*o}}}var bo=new Y,mc=new Eu,gc=new Eu,vc=new Eu,ma=class extends fn{constructor(e=[],t=!1,n="centripetal",i=.5){super(),this.type="CatmullRomCurve3",this.points=e,this.closed=t,this.curveType=n,this.tension=i}getPoint(e,t=new Y){let n=t,i=this.points,r=i.length,a=(r-(this.closed?0:1))*e,o=Math.floor(a),c=a-o;this.closed?o+=o>0?0:(Math.floor(Math.abs(o)/r)+1)*r:c===0&&o===r-1&&(o=r-2,c=1);let l,h;this.closed||o>0?l=i[(o-1)%r]:(bo.subVectors(i[0],i[1]).add(i[0]),l=bo);let u=i[o%r],d=i[(o+1)%r];if(this.closed||o+2<r?h=i[(o+2)%r]:(bo.subVectors(i[r-1],i[r-2]).add(i[r-1]),h=bo),this.curveType==="centripetal"||this.curveType==="chordal"){let f=this.curveType==="chordal"?.5:.25,p=Math.pow(l.distanceToSquared(u),f),y=Math.pow(u.distanceToSquared(d),f),x=Math.pow(d.distanceToSquared(h),f);y<1e-4&&(y=1),p<1e-4&&(p=y),x<1e-4&&(x=y),mc.initNonuniformCatmullRom(l.x,u.x,d.x,h.x,p,y,x),gc.initNonuniformCatmullRom(l.y,u.y,d.y,h.y,p,y,x),vc.initNonuniformCatmullRom(l.z,u.z,d.z,h.z,p,y,x)}else this.curveType==="catmullrom"&&(mc.initCatmullRom(l.x,u.x,d.x,h.x,this.tension),gc.initCatmullRom(l.y,u.y,d.y,h.y,this.tension),vc.initCatmullRom(l.z,u.z,d.z,h.z,this.tension));return n.set(mc.calc(c),gc.calc(c),vc.calc(c)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(i.clone())}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let i=this.points[t];e.points.push(i.toArray())}return e.closed=this.closed,e.curveType=this.curveType,e.tension=this.tension,e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(new Y().fromArray(i))}return this.closed=e.closed,this.curveType=e.curveType,this.tension=e.tension,this}};ma.prototype.isCatmullRomCurve3=!0;function Bh(s,e,t,n,i){let r=(n-e)*.5,a=(i-t)*.5,o=s*s,c=s*o;return(2*t-2*n+r+a)*c+(-3*t+3*n-2*r-a)*o+r*s+t}function Ay(s,e){let t=1-s;return t*t*e}function Ty(s,e){return 2*(1-s)*s*e}function Ey(s,e){return s*s*e}function ws(s,e,t,n){return Ay(s,e)+Ty(s,t)+Ey(s,n)}function Cy(s,e){let t=1-s;return t*t*t*e}function Py(s,e){let t=1-s;return 3*t*t*s*e}function Ly(s,e){return 3*(1-s)*s*s*e}function Ry(s,e){return s*s*s*e}function Ms(s,e,t,n,i){return Cy(s,e)+Py(s,t)+Ly(s,n)+Ry(s,i)}var jr=class extends fn{constructor(e=new Je,t=new Je,n=new Je,i=new Je){super(),this.type="CubicBezierCurve",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new Je){let n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(Ms(e,i.x,r.x,a.x,o.x),Ms(e,i.y,r.y,a.y,o.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}};jr.prototype.isCubicBezierCurve=!0;var ga=class extends fn{constructor(e=new Y,t=new Y,n=new Y,i=new Y){super(),this.type="CubicBezierCurve3",this.v0=e,this.v1=t,this.v2=n,this.v3=i}getPoint(e,t=new Y){let n=t,i=this.v0,r=this.v1,a=this.v2,o=this.v3;return n.set(Ms(e,i.x,r.x,a.x,o.x),Ms(e,i.y,r.y,a.y,o.y),Ms(e,i.z,r.z,a.z,o.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this.v3.copy(e.v3),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e.v3=this.v3.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this.v3.fromArray(e.v3),this}};ga.prototype.isCubicBezierCurve3=!0;var Ji=class extends fn{constructor(e=new Je,t=new Je){super(),this.type="LineCurve",this.v1=e,this.v2=t}getPoint(e,t=new Je){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}getTangent(e,t){let n=t||new Je;return n.copy(this.v2).sub(this.v1).normalize(),n}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}};Ji.prototype.isLineCurve=!0;var il=class extends fn{constructor(e=new Y,t=new Y){super(),this.type="LineCurve3",this.isLineCurve3=!0,this.v1=e,this.v2=t}getPoint(e,t=new Y){let n=t;return e===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(e).add(this.v1)),n}getPointAt(e,t){return this.getPoint(e,t)}copy(e){return super.copy(e),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}},Jr=class extends fn{constructor(e=new Je,t=new Je,n=new Je){super(),this.type="QuadraticBezierCurve",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new Je){let n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(ws(e,i.x,r.x,a.x),ws(e,i.y,r.y,a.y)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}};Jr.prototype.isQuadraticBezierCurve=!0;var va=class extends fn{constructor(e=new Y,t=new Y,n=new Y){super(),this.type="QuadraticBezierCurve3",this.v0=e,this.v1=t,this.v2=n}getPoint(e,t=new Y){let n=t,i=this.v0,r=this.v1,a=this.v2;return n.set(ws(e,i.x,r.x,a.x),ws(e,i.y,r.y,a.y),ws(e,i.z,r.z,a.z)),n}copy(e){return super.copy(e),this.v0.copy(e.v0),this.v1.copy(e.v1),this.v2.copy(e.v2),this}toJSON(){let e=super.toJSON();return e.v0=this.v0.toArray(),e.v1=this.v1.toArray(),e.v2=this.v2.toArray(),e}fromJSON(e){return super.fromJSON(e),this.v0.fromArray(e.v0),this.v1.fromArray(e.v1),this.v2.fromArray(e.v2),this}};va.prototype.isQuadraticBezierCurve3=!0;var $r=class extends fn{constructor(e=[]){super(),this.type="SplineCurve",this.points=e}getPoint(e,t=new Je){let n=t,i=this.points,r=(i.length-1)*e,a=Math.floor(r),o=r-a,c=i[a===0?a:a-1],l=i[a],h=i[a>i.length-2?i.length-1:a+1],u=i[a>i.length-3?i.length-1:a+2];return n.set(Bh(o,c.x,l.x,h.x,u.x),Bh(o,c.y,l.y,h.y,u.y)),n}copy(e){super.copy(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(i.clone())}return this}toJSON(){let e=super.toJSON();e.points=[];for(let t=0,n=this.points.length;t<n;t++){let i=this.points[t];e.points.push(i.toArray())}return e}fromJSON(e){super.fromJSON(e),this.points=[];for(let t=0,n=e.points.length;t<n;t++){let i=e.points[t];this.points.push(new Je().fromArray(i))}return this}};$r.prototype.isSplineCurve=!0;var Zc=Object.freeze({__proto__:null,ArcCurve:pa,CatmullRomCurve3:ma,CubicBezierCurve:jr,CubicBezierCurve3:ga,EllipseCurve:ji,LineCurve:Ji,LineCurve3:il,QuadraticBezierCurve:Jr,QuadraticBezierCurve3:va,SplineCurve:$r}),rl=class extends fn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(e){this.curves.push(e)}closePath(){let e=this.curves[0].getPoint(0),t=this.curves[this.curves.length-1].getPoint(1);e.equals(t)||this.curves.push(new Ji(t,e))}getPoint(e){let t=e*this.getLength(),n=this.getCurveLengths(),i=0;for(;i<n.length;){if(n[i]>=t){let r=n[i]-t,a=this.curves[i],o=a.getLength(),c=o===0?0:1-r/o;return a.getPointAt(c)}i++}return null}getLength(){let e=this.getCurveLengths();return e[e.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;let e=[],t=0;for(let n=0,i=this.curves.length;n<i;n++)t+=this.curves[n].getLength(),e.push(t);return this.cacheLengths=e,e}getSpacedPoints(e=40){let t=[];for(let n=0;n<=e;n++)t.push(this.getPoint(n/e));return this.autoClose&&t.push(t[0]),t}getPoints(e=12){let t=[],n;for(let i=0,r=this.curves;i<r.length;i++){let a=r[i],o=a&&a.isEllipseCurve?e*2:a&&(a.isLineCurve||a.isLineCurve3)?1:a&&a.isSplineCurve?e*a.points.length:e,c=a.getPoints(o);for(let l=0;l<c.length;l++){let h=c[l];n&&n.equals(h)||(t.push(h),n=h)}}return this.autoClose&&t.length>1&&!t[t.length-1].equals(t[0])&&t.push(t[0]),t}copy(e){super.copy(e),this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let i=e.curves[t];this.curves.push(i.clone())}return this.autoClose=e.autoClose,this}toJSON(){let e=super.toJSON();e.autoClose=this.autoClose,e.curves=[];for(let t=0,n=this.curves.length;t<n;t++){let i=this.curves[t];e.curves.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.autoClose=e.autoClose,this.curves=[];for(let t=0,n=e.curves.length;t<n;t++){let i=e.curves[t];this.curves.push(new Zc[i.type]().fromJSON(i))}return this}},$i=class extends rl{constructor(e){super(),this.type="Path",this.currentPoint=new Je,e&&this.setFromPoints(e)}setFromPoints(e){this.moveTo(e[0].x,e[0].y);for(let t=1,n=e.length;t<n;t++)this.lineTo(e[t].x,e[t].y);return this}moveTo(e,t){return this.currentPoint.set(e,t),this}lineTo(e,t){let n=new Ji(this.currentPoint.clone(),new Je(e,t));return this.curves.push(n),this.currentPoint.set(e,t),this}quadraticCurveTo(e,t,n,i){let r=new Jr(this.currentPoint.clone(),new Je(e,t),new Je(n,i));return this.curves.push(r),this.currentPoint.set(n,i),this}bezierCurveTo(e,t,n,i,r,a){let o=new jr(this.currentPoint.clone(),new Je(e,t),new Je(n,i),new Je(r,a));return this.curves.push(o),this.currentPoint.set(r,a),this}splineThru(e){let t=[this.currentPoint.clone()].concat(e),n=new $r(t);return this.curves.push(n),this.currentPoint.copy(e[e.length-1]),this}arc(e,t,n,i,r,a){let o=this.currentPoint.x,c=this.currentPoint.y;return this.absarc(e+o,t+c,n,i,r,a),this}absarc(e,t,n,i,r,a){return this.absellipse(e,t,n,n,i,r,a),this}ellipse(e,t,n,i,r,a,o,c){let l=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(e+l,t+h,n,i,r,a,o,c),this}absellipse(e,t,n,i,r,a,o,c){let l=new ji(e,t,n,i,r,a,o,c);if(this.curves.length>0){let u=l.getPoint(0);u.equals(this.currentPoint)||this.lineTo(u.x,u.y)}this.curves.push(l);let h=l.getPoint(1);return this.currentPoint.copy(h),this}copy(e){return super.copy(e),this.currentPoint.copy(e.currentPoint),this}toJSON(){let e=super.toJSON();return e.currentPoint=this.currentPoint.toArray(),e}fromJSON(e){return super.fromJSON(e),this.currentPoint.fromArray(e.currentPoint),this}},Nn=class extends $i{constructor(e){super(e),this.uuid=yn(),this.type="Shape",this.holes=[]}getPointsHoles(e){let t=[];for(let n=0,i=this.holes.length;n<i;n++)t[n]=this.holes[n].getPoints(e);return t}extractPoints(e){return{shape:this.getPoints(e),holes:this.getPointsHoles(e)}}copy(e){super.copy(e),this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let i=e.holes[t];this.holes.push(i.clone())}return this}toJSON(){let e=super.toJSON();e.uuid=this.uuid,e.holes=[];for(let t=0,n=this.holes.length;t<n;t++){let i=this.holes[t];e.holes.push(i.toJSON())}return e}fromJSON(e){super.fromJSON(e),this.uuid=e.uuid,this.holes=[];for(let t=0,n=e.holes.length;t<n;t++){let i=e.holes[t];this.holes.push(new $i().fromJSON(i))}return this}},wn=class extends Ct{constructor(e,t=1){super(),this.type="Light",this.color=new ut(e),this.intensity=t}dispose(){}copy(e){return super.copy(e),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),t}};wn.prototype.isLight=!0;var xa=class extends wn{constructor(e,t,n){super(e,n),this.type="HemisphereLight",this.position.copy(Ct.DefaultUp),this.updateMatrix(),this.groundColor=new ut(t)}copy(e){return wn.prototype.copy.call(this,e),this.groundColor.copy(e.groundColor),this}};xa.prototype.isHemisphereLight=!0;var kh=new bt,Nh=new Y,Uh=new Y,ya=class{constructor(e){this.camera=e,this.bias=0,this.normalBias=0,this.radius=1,this.mapSize=new Je(512,512),this.map=null,this.mapPass=null,this.matrix=new bt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Wi,this._frameExtents=new Je(1,1),this._viewportCount=1,this._viewports=[new Lt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;Nh.setFromMatrixPosition(e.matrixWorld),t.position.copy(Nh),Uh.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Uh),t.updateMatrixWorld(),kh.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(kh),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(t.projectionMatrix),n.multiply(t.matrixWorldInverse)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},sl=class extends ya{constructor(){super(new qt(50,1,.5,500)),this.focus=1}updateMatrices(e){let t=this.camera,n=Ls*2*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height,r=e.distance||t.far;(n!==t.fov||i!==t.aspect||r!==t.far)&&(t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}};sl.prototype.isSpotLightShadow=!0;var ba=class extends wn{constructor(e,t,n=0,i=Math.PI/3,r=0,a=1){super(e,t),this.type="SpotLight",this.position.copy(Ct.DefaultUp),this.updateMatrix(),this.target=new Ct,this.distance=n,this.angle=i,this.penumbra=r,this.decay=a,this.shadow=new sl}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}};ba.prototype.isSpotLight=!0;var Oh=new bt,ps=new Y,xc=new Y,al=class extends ya{constructor(){super(new qt(90,1,.5,500)),this._frameExtents=new Je(4,2),this._viewportCount=6,this._viewports=[new Lt(2,1,1,1),new Lt(0,1,1,1),new Lt(3,1,1,1),new Lt(1,1,1,1),new Lt(3,0,1,1),new Lt(1,0,1,1)],this._cubeDirections=[new Y(1,0,0),new Y(-1,0,0),new Y(0,0,1),new Y(0,0,-1),new Y(0,1,0),new Y(0,-1,0)],this._cubeUps=[new Y(0,1,0),new Y(0,1,0),new Y(0,1,0),new Y(0,1,0),new Y(0,0,1),new Y(0,0,-1)]}updateMatrices(e,t=0){let n=this.camera,i=this.matrix,r=e.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),ps.setFromMatrixPosition(e.matrixWorld),n.position.copy(ps),xc.copy(n.position),xc.add(this._cubeDirections[t]),n.up.copy(this._cubeUps[t]),n.lookAt(xc),n.updateMatrixWorld(),i.makeTranslation(-ps.x,-ps.y,-ps.z),Oh.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Oh)}};al.prototype.isPointLightShadow=!0;var wa=class extends wn{constructor(e,t,n=0,i=1){super(e,t),this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new al}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}};wa.prototype.isPointLight=!0;var Ki=class extends Gi{constructor(e=-1,t=1,n=1,i=-1,r=.1,a=2e3){super(),this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,a=n+e,o=i+t,c=i-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,a=r+l*this.view.width,o-=h*this.view.offsetY,c=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,c,this.near,this.far),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}};Ki.prototype.isOrthographicCamera=!0;var ol=class extends ya{constructor(){super(new Ki(-5,5,5,-5,.5,500))}};ol.prototype.isDirectionalLightShadow=!0;var Ma=class extends wn{constructor(e,t){super(e,t),this.type="DirectionalLight",this.position.copy(Ct.DefaultUp),this.updateMatrix(),this.target=new Ct,this.shadow=new ol}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}};Ma.prototype.isDirectionalLight=!0;var _a=class extends wn{constructor(e,t){super(e,t),this.type="AmbientLight"}};_a.prototype.isAmbientLight=!0;var Sa=class extends wn{constructor(e,t,n=10,i=10){super(e,t),this.type="RectAreaLight",this.width=n,this.height=i}copy(e){return super.copy(e),this.width=e.width,this.height=e.height,this}toJSON(e){let t=super.toJSON(e);return t.object.width=this.width,t.object.height=this.height,t}};Sa.prototype.isRectAreaLight=!0;var Aa=class{constructor(){this.coefficients=[];for(let e=0;e<9;e++)this.coefficients.push(new Y)}set(e){for(let t=0;t<9;t++)this.coefficients[t].copy(e[t]);return this}zero(){for(let e=0;e<9;e++)this.coefficients[e].set(0,0,0);return this}getAt(e,t){let n=e.x,i=e.y,r=e.z,a=this.coefficients;return t.copy(a[0]).multiplyScalar(.282095),t.addScaledVector(a[1],.488603*i),t.addScaledVector(a[2],.488603*r),t.addScaledVector(a[3],.488603*n),t.addScaledVector(a[4],1.092548*(n*i)),t.addScaledVector(a[5],1.092548*(i*r)),t.addScaledVector(a[6],.315392*(3*r*r-1)),t.addScaledVector(a[7],1.092548*(n*r)),t.addScaledVector(a[8],.546274*(n*n-i*i)),t}getIrradianceAt(e,t){let n=e.x,i=e.y,r=e.z,a=this.coefficients;return t.copy(a[0]).multiplyScalar(.886227),t.addScaledVector(a[1],2*.511664*i),t.addScaledVector(a[2],2*.511664*r),t.addScaledVector(a[3],2*.511664*n),t.addScaledVector(a[4],2*.429043*n*i),t.addScaledVector(a[5],2*.429043*i*r),t.addScaledVector(a[6],.743125*r*r-.247708),t.addScaledVector(a[7],2*.429043*n*r),t.addScaledVector(a[8],.429043*(n*n-i*i)),t}add(e){for(let t=0;t<9;t++)this.coefficients[t].add(e.coefficients[t]);return this}addScaledSH(e,t){for(let n=0;n<9;n++)this.coefficients[n].addScaledVector(e.coefficients[n],t);return this}scale(e){for(let t=0;t<9;t++)this.coefficients[t].multiplyScalar(e);return this}lerp(e,t){for(let n=0;n<9;n++)this.coefficients[n].lerp(e.coefficients[n],t);return this}equals(e){for(let t=0;t<9;t++)if(!this.coefficients[t].equals(e.coefficients[t]))return!1;return!0}copy(e){return this.set(e.coefficients)}clone(){return new this.constructor().copy(this)}fromArray(e,t=0){let n=this.coefficients;for(let i=0;i<9;i++)n[i].fromArray(e,t+i*3);return this}toArray(e=[],t=0){let n=this.coefficients;for(let i=0;i<9;i++)n[i].toArray(e,t+i*3);return e}static getBasisAt(e,t){let n=e.x,i=e.y,r=e.z;t[0]=.282095,t[1]=.488603*i,t[2]=.488603*r,t[3]=.488603*n,t[4]=1.092548*n*i,t[5]=1.092548*i*r,t[6]=.315392*(3*r*r-1),t[7]=1.092548*n*r,t[8]=.546274*(n*n-i*i)}};Aa.prototype.isSphericalHarmonics3=!0;var Qi=class extends wn{constructor(e=new Aa,t=1){super(void 0,t),this.sh=e}copy(e){return super.copy(e),this.sh.copy(e.sh),this}fromJSON(e){return this.intensity=e.intensity,this.sh.fromArray(e.sh),this}toJSON(e){let t=super.toJSON(e);return t.object.sh=this.sh.toArray(),t}};Qi.prototype.isLightProbe=!0;var ll=class extends Qt{constructor(e){super(e),this.textures={}}load(e,t,n,i){let r=this,a=new _n(r.manager);a.setPath(r.path),a.setRequestHeader(r.requestHeader),a.setWithCredentials(r.withCredentials),a.load(e,function(o){try{t(r.parse(JSON.parse(o)))}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}parse(e){let t=this.textures;function n(r){return t[r]===void 0&&console.warn("THREE.MaterialLoader: Undefined texture",r),t[r]}let i=new My[e.type];if(e.uuid!==void 0&&(i.uuid=e.uuid),e.name!==void 0&&(i.name=e.name),e.color!==void 0&&i.color!==void 0&&i.color.setHex(e.color),e.roughness!==void 0&&(i.roughness=e.roughness),e.metalness!==void 0&&(i.metalness=e.metalness),e.sheen!==void 0&&(i.sheen=new ut().setHex(e.sheen)),e.emissive!==void 0&&i.emissive!==void 0&&i.emissive.setHex(e.emissive),e.specular!==void 0&&i.specular!==void 0&&i.specular.setHex(e.specular),e.shininess!==void 0&&(i.shininess=e.shininess),e.clearcoat!==void 0&&(i.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=e.clearcoatRoughness),e.fog!==void 0&&(i.fog=e.fog),e.flatShading!==void 0&&(i.flatShading=e.flatShading),e.blending!==void 0&&(i.blending=e.blending),e.combine!==void 0&&(i.combine=e.combine),e.side!==void 0&&(i.side=e.side),e.shadowSide!==void 0&&(i.shadowSide=e.shadowSide),e.opacity!==void 0&&(i.opacity=e.opacity),e.transparent!==void 0&&(i.transparent=e.transparent),e.alphaTest!==void 0&&(i.alphaTest=e.alphaTest),e.depthTest!==void 0&&(i.depthTest=e.depthTest),e.depthWrite!==void 0&&(i.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(i.colorWrite=e.colorWrite),e.stencilWrite!==void 0&&(i.stencilWrite=e.stencilWrite),e.stencilWriteMask!==void 0&&(i.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(i.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(i.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(i.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(i.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(i.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(i.stencilZPass=e.stencilZPass),e.wireframe!==void 0&&(i.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(i.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(i.rotation=e.rotation),e.linewidth!==1&&(i.linewidth=e.linewidth),e.dashSize!==void 0&&(i.dashSize=e.dashSize),e.gapSize!==void 0&&(i.gapSize=e.gapSize),e.scale!==void 0&&(i.scale=e.scale),e.polygonOffset!==void 0&&(i.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(i.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(i.polygonOffsetUnits=e.polygonOffsetUnits),e.skinning!==void 0&&(i.skinning=e.skinning),e.morphTargets!==void 0&&(i.morphTargets=e.morphTargets),e.morphNormals!==void 0&&(i.morphNormals=e.morphNormals),e.dithering!==void 0&&(i.dithering=e.dithering),e.alphaToCoverage!==void 0&&(i.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(i.premultipliedAlpha=e.premultipliedAlpha),e.vertexTangents!==void 0&&(i.vertexTangents=e.vertexTangents),e.visible!==void 0&&(i.visible=e.visible),e.toneMapped!==void 0&&(i.toneMapped=e.toneMapped),e.userData!==void 0&&(i.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?i.vertexColors=e.vertexColors>0:i.vertexColors=e.vertexColors),e.uniforms!==void 0)for(let r in e.uniforms){let a=e.uniforms[r];switch(i.uniforms[r]={},a.type){case"t":i.uniforms[r].value=n(a.value);break;case"c":i.uniforms[r].value=new ut().setHex(a.value);break;case"v2":i.uniforms[r].value=new Je().fromArray(a.value);break;case"v3":i.uniforms[r].value=new Y().fromArray(a.value);break;case"v4":i.uniforms[r].value=new Lt().fromArray(a.value);break;case"m3":i.uniforms[r].value=new Vt().fromArray(a.value);break;case"m4":i.uniforms[r].value=new bt().fromArray(a.value);break;default:i.uniforms[r].value=a.value}}if(e.defines!==void 0&&(i.defines=e.defines),e.vertexShader!==void 0&&(i.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(i.fragmentShader=e.fragmentShader),e.extensions!==void 0)for(let r in e.extensions)i.extensions[r]=e.extensions[r];if(e.shading!==void 0&&(i.flatShading=e.shading===1),e.size!==void 0&&(i.size=e.size),e.sizeAttenuation!==void 0&&(i.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(i.map=n(e.map)),e.matcap!==void 0&&(i.matcap=n(e.matcap)),e.alphaMap!==void 0&&(i.alphaMap=n(e.alphaMap)),e.bumpMap!==void 0&&(i.bumpMap=n(e.bumpMap)),e.bumpScale!==void 0&&(i.bumpScale=e.bumpScale),e.normalMap!==void 0&&(i.normalMap=n(e.normalMap)),e.normalMapType!==void 0&&(i.normalMapType=e.normalMapType),e.normalScale!==void 0){let r=e.normalScale;Array.isArray(r)===!1&&(r=[r,r]),i.normalScale=new Je().fromArray(r)}return e.displacementMap!==void 0&&(i.displacementMap=n(e.displacementMap)),e.displacementScale!==void 0&&(i.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(i.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(i.roughnessMap=n(e.roughnessMap)),e.metalnessMap!==void 0&&(i.metalnessMap=n(e.metalnessMap)),e.emissiveMap!==void 0&&(i.emissiveMap=n(e.emissiveMap)),e.emissiveIntensity!==void 0&&(i.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(i.specularMap=n(e.specularMap)),e.envMap!==void 0&&(i.envMap=n(e.envMap)),e.envMapIntensity!==void 0&&(i.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(i.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(i.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(i.lightMap=n(e.lightMap)),e.lightMapIntensity!==void 0&&(i.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(i.aoMap=n(e.aoMap)),e.aoMapIntensity!==void 0&&(i.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(i.gradientMap=n(e.gradientMap)),e.clearcoatMap!==void 0&&(i.clearcoatMap=n(e.clearcoatMap)),e.clearcoatRoughnessMap!==void 0&&(i.clearcoatRoughnessMap=n(e.clearcoatRoughnessMap)),e.clearcoatNormalMap!==void 0&&(i.clearcoatNormalMap=n(e.clearcoatNormalMap)),e.clearcoatNormalScale!==void 0&&(i.clearcoatNormalScale=new Je().fromArray(e.clearcoatNormalScale)),e.transmission!==void 0&&(i.transmission=e.transmission),e.transmissionMap!==void 0&&(i.transmissionMap=n(e.transmissionMap)),i}setTextures(e){return this.textures=e,this}},Ta=class{static decodeText(e){if(typeof TextDecoder<"u")return new TextDecoder().decode(e);let t="";for(let n=0,i=e.length;n<i;n++)t+=String.fromCharCode(e[n]);try{return decodeURIComponent(escape(t))}catch{return t}}static extractUrlBase(e){let t=e.lastIndexOf("/");return t===-1?"./":e.substr(0,t+1)}},Ea=class extends _t{constructor(){super(),this.type="InstancedBufferGeometry",this.instanceCount=1/0}copy(e){return super.copy(e),this.instanceCount=e.instanceCount,this}clone(){return new this.constructor().copy(this)}toJSON(){let e=super.toJSON(this);return e.instanceCount=this.instanceCount,e.isInstancedBufferGeometry=!0,e}};Ea.prototype.isInstancedBufferGeometry=!0;var Ca=class extends St{constructor(e,t,n,i){typeof n=="number"&&(i=n,n=!1,console.error("THREE.InstancedBufferAttribute: The constructor now expects normalized as the third argument.")),super(e,t,n),this.meshPerAttribute=i||1}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}};Ca.prototype.isInstancedBufferAttribute=!0;var cl=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new _n(r.manager);a.setPath(r.path),a.setRequestHeader(r.requestHeader),a.setWithCredentials(r.withCredentials),a.load(e,function(o){try{t(r.parse(JSON.parse(o)))}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}parse(e){let t={},n={};function i(f,p){if(t[p]!==void 0)return t[p];let x=f.interleavedBuffers[p],v=r(f,x.buffer),g=gs(x.type,v),m=new ei(g,x.stride);return m.uuid=x.uuid,t[p]=m,m}function r(f,p){if(n[p]!==void 0)return n[p];let x=f.arrayBuffers[p],v=new Uint32Array(x).buffer;return n[p]=v,v}let a=e.isInstancedBufferGeometry?new Ea:new _t,o=e.data.index;if(o!==void 0){let f=gs(o.type,o.array);a.setIndex(new St(f,1))}let c=e.data.attributes;for(let f in c){let p=c[f],y;if(p.isInterleavedBufferAttribute){let x=i(e.data,p.data);y=new bi(x,p.itemSize,p.offset,p.normalized)}else{let x=gs(p.type,p.array),v=p.isInstancedBufferAttribute?Ca:St;y=new v(x,p.itemSize,p.normalized)}p.name!==void 0&&(y.name=p.name),p.usage!==void 0&&y.setUsage(p.usage),p.updateRange!==void 0&&(y.updateRange.offset=p.updateRange.offset,y.updateRange.count=p.updateRange.count),a.setAttribute(f,y)}let l=e.data.morphAttributes;if(l)for(let f in l){let p=l[f],y=[];for(let x=0,v=p.length;x<v;x++){let g=p[x],m;if(g.isInterleavedBufferAttribute){let S=i(e.data,g.data);m=new bi(S,g.itemSize,g.offset,g.normalized)}else{let S=gs(g.type,g.array);m=new St(S,g.itemSize,g.normalized)}g.name!==void 0&&(m.name=g.name),y.push(m)}a.morphAttributes[f]=y}e.data.morphTargetsRelative&&(a.morphTargetsRelative=!0);let u=e.data.groups||e.data.drawcalls||e.data.offsets;if(u!==void 0)for(let f=0,p=u.length;f!==p;++f){let y=u[f];a.addGroup(y.start,y.count,y.materialIndex)}let d=e.data.boundingSphere;if(d!==void 0){let f=new Y;d.center!==void 0&&f.fromArray(d.center),a.boundingSphere=new On(f,d.radius)}return e.name&&(a.name=e.name),e.userData&&(a.userData=e.userData),a}},jc=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=this.path===""?Ta.extractUrlBase(e):this.path;this.resourcePath=this.resourcePath||a;let o=new _n(this.manager);o.setPath(this.path),o.setRequestHeader(this.requestHeader),o.setWithCredentials(this.withCredentials),o.load(e,function(c){let l=null;try{l=JSON.parse(c)}catch(u){i!==void 0&&i(u),console.error("THREE:ObjectLoader: Can't parse "+e+".",u.message);return}let h=l.metadata;if(h===void 0||h.type===void 0||h.type.toLowerCase()==="geometry"){console.error("THREE.ObjectLoader: Can't load "+e);return}r.parse(l,t)},n,i)}parse(e,t){let n=this.parseAnimations(e.animations),i=this.parseShapes(e.shapes),r=this.parseGeometries(e.geometries,i),a=this.parseImages(e.images,function(){t!==void 0&&t(l)}),o=this.parseTextures(e.textures,a),c=this.parseMaterials(e.materials,o),l=this.parseObject(e.object,r,c,n),h=this.parseSkeletons(e.skeletons,l);if(this.bindSkeletons(l,h),t!==void 0){let u=!1;for(let d in a)if(a[d]instanceof HTMLImageElement){u=!0;break}u===!1&&t(l)}return l}parseShapes(e){let t={};if(e!==void 0)for(let n=0,i=e.length;n<i;n++){let r=new Nn().fromJSON(e[n]);t[r.uuid]=r}return t}parseSkeletons(e,t){let n={},i={};if(t.traverse(function(r){r.isBone&&(i[r.uuid]=r)}),e!==void 0)for(let r=0,a=e.length;r<a;r++){let o=new Yo().fromJSON(e[r],i);n[o.uuid]=o}return n}parseGeometries(e,t){let n={},i;if(e!==void 0){let r=new cl;for(let a=0,o=e.length;a<o;a++){let c,l=e[a];switch(l.type){case"PlaneGeometry":case"PlaneBufferGeometry":c=new cn[l.type](l.width,l.height,l.widthSegments,l.heightSegments);break;case"BoxGeometry":case"BoxBufferGeometry":c=new cn[l.type](l.width,l.height,l.depth,l.widthSegments,l.heightSegments,l.depthSegments);break;case"CircleGeometry":case"CircleBufferGeometry":c=new cn[l.type](l.radius,l.segments,l.thetaStart,l.thetaLength);break;case"CylinderGeometry":case"CylinderBufferGeometry":c=new cn[l.type](l.radiusTop,l.radiusBottom,l.height,l.radialSegments,l.heightSegments,l.openEnded,l.thetaStart,l.thetaLength);break;case"ConeGeometry":case"ConeBufferGeometry":c=new cn[l.type](l.radius,l.height,l.radialSegments,l.heightSegments,l.openEnded,l.thetaStart,l.thetaLength);break;case"SphereGeometry":case"SphereBufferGeometry":c=new cn[l.type](l.radius,l.widthSegments,l.heightSegments,l.phiStart,l.phiLength,l.thetaStart,l.thetaLength);break;case"DodecahedronGeometry":case"DodecahedronBufferGeometry":case"IcosahedronGeometry":case"IcosahedronBufferGeometry":case"OctahedronGeometry":case"OctahedronBufferGeometry":case"TetrahedronGeometry":case"TetrahedronBufferGeometry":c=new cn[l.type](l.radius,l.detail);break;case"RingGeometry":case"RingBufferGeometry":c=new cn[l.type](l.innerRadius,l.outerRadius,l.thetaSegments,l.phiSegments,l.thetaStart,l.thetaLength);break;case"TorusGeometry":case"TorusBufferGeometry":c=new cn[l.type](l.radius,l.tube,l.radialSegments,l.tubularSegments,l.arc);break;case"TorusKnotGeometry":case"TorusKnotBufferGeometry":c=new cn[l.type](l.radius,l.tube,l.tubularSegments,l.radialSegments,l.p,l.q);break;case"TubeGeometry":case"TubeBufferGeometry":c=new cn[l.type](new Zc[l.path.type]().fromJSON(l.path),l.tubularSegments,l.radius,l.radialSegments,l.closed);break;case"LatheGeometry":case"LatheBufferGeometry":c=new cn[l.type](l.points,l.segments,l.phiStart,l.phiLength);break;case"PolyhedronGeometry":case"PolyhedronBufferGeometry":c=new cn[l.type](l.vertices,l.indices,l.radius,l.details);break;case"ShapeGeometry":case"ShapeBufferGeometry":i=[];for(let u=0,d=l.shapes.length;u<d;u++){let f=t[l.shapes[u]];i.push(f)}c=new cn[l.type](i,l.curveSegments);break;case"ExtrudeGeometry":case"ExtrudeBufferGeometry":i=[];for(let u=0,d=l.shapes.length;u<d;u++){let f=t[l.shapes[u]];i.push(f)}let h=l.options.extrudePath;h!==void 0&&(l.options.extrudePath=new Zc[h.type]().fromJSON(h)),c=new cn[l.type](i,l.options);break;case"BufferGeometry":case"InstancedBufferGeometry":c=r.parse(l);break;case"Geometry":console.error('THREE.ObjectLoader: Loading "Geometry" is not supported anymore.');break;default:console.warn('THREE.ObjectLoader: Unsupported geometry type "'+l.type+'"');continue}c.uuid=l.uuid,l.name!==void 0&&(c.name=l.name),c.isBufferGeometry===!0&&l.userData!==void 0&&(c.userData=l.userData),n[l.uuid]=c}}return n}parseMaterials(e,t){let n={},i={};if(e!==void 0){let r=new ll;r.setTextures(t);for(let a=0,o=e.length;a<o;a++){let c=e[a];if(c.type==="MultiMaterial"){let l=[];for(let h=0;h<c.materials.length;h++){let u=c.materials[h];n[u.uuid]===void 0&&(n[u.uuid]=r.parse(u)),l.push(n[u.uuid])}i[c.uuid]=l}else n[c.uuid]===void 0&&(n[c.uuid]=r.parse(c)),i[c.uuid]=n[c.uuid]}}return i}parseAnimations(e){let t={};if(e!==void 0)for(let n=0;n<e.length;n++){let i=e[n],r=Yi.parse(i);t[r.uuid]=r}return t}parseImages(e,t){let n=this,i={},r;function a(c){return n.manager.itemStart(c),r.load(c,function(){n.manager.itemEnd(c)},void 0,function(){n.manager.itemError(c),n.manager.itemEnd(c)})}function o(c){if(typeof c=="string"){let l=c,h=/^(\\/\\/)|([a-z]+:(\\/\\/)?)/i.test(l)?l:n.resourcePath+l;return a(h)}else return c.data?{data:gs(c.type,c.data),width:c.width,height:c.height}:null}if(e!==void 0&&e.length>0){let c=new fa(t);r=new Zr(c),r.setCrossOrigin(this.crossOrigin);for(let l=0,h=e.length;l<h;l++){let u=e[l],d=u.url;if(Array.isArray(d)){i[u.uuid]=[];for(let f=0,p=d.length;f<p;f++){let y=d[f],x=o(y);x!==null&&(x instanceof HTMLImageElement?i[u.uuid].push(x):i[u.uuid].push(new yi(x.data,x.width,x.height)))}}else{let f=o(u.url);f!==null&&(i[u.uuid]=f)}}}return i}parseTextures(e,t){function n(r,a){return typeof r=="number"?r:(console.warn("THREE.ObjectLoader.parseTexture: Constant should be in numeric form.",r),a[r])}let i={};if(e!==void 0)for(let r=0,a=e.length;r<a;r++){let o=e[r];o.image===void 0&&console.warn('THREE.ObjectLoader: No "image" specified for',o.uuid),t[o.image]===void 0&&console.warn("THREE.ObjectLoader: Undefined image",o.image);let c,l=t[o.image];Array.isArray(l)?(c=new xi(l),l.length===6&&(c.needsUpdate=!0)):(l&&l.data?c=new yi(l.data,l.width,l.height):c=new Kt(l),l&&(c.needsUpdate=!0)),c.uuid=o.uuid,o.name!==void 0&&(c.name=o.name),o.mapping!==void 0&&(c.mapping=n(o.mapping,zy)),o.offset!==void 0&&c.offset.fromArray(o.offset),o.repeat!==void 0&&c.repeat.fromArray(o.repeat),o.center!==void 0&&c.center.fromArray(o.center),o.rotation!==void 0&&(c.rotation=o.rotation),o.wrap!==void 0&&(c.wrapS=n(o.wrap[0],Gh),c.wrapT=n(o.wrap[1],Gh)),o.format!==void 0&&(c.format=o.format),o.type!==void 0&&(c.type=o.type),o.encoding!==void 0&&(c.encoding=o.encoding),o.minFilter!==void 0&&(c.minFilter=n(o.minFilter,Wh)),o.magFilter!==void 0&&(c.magFilter=n(o.magFilter,Wh)),o.anisotropy!==void 0&&(c.anisotropy=o.anisotropy),o.flipY!==void 0&&(c.flipY=o.flipY),o.premultiplyAlpha!==void 0&&(c.premultiplyAlpha=o.premultiplyAlpha),o.unpackAlignment!==void 0&&(c.unpackAlignment=o.unpackAlignment),i[o.uuid]=c}return i}parseObject(e,t,n,i){let r;function a(h){return t[h]===void 0&&console.warn("THREE.ObjectLoader: Undefined geometry",h),t[h]}function o(h){if(h!==void 0){if(Array.isArray(h)){let u=[];for(let d=0,f=h.length;d<f;d++){let p=h[d];n[p]===void 0&&console.warn("THREE.ObjectLoader: Undefined material",p),u.push(n[p])}return u}return n[h]===void 0&&console.warn("THREE.ObjectLoader: Undefined material",h),n[h]}}let c,l;switch(e.type){case"Scene":r=new Ur,e.background!==void 0&&Number.isInteger(e.background)&&(r.background=new ut(e.background)),e.fog!==void 0&&(e.fog.type==="Fog"?r.fog=new Bs(e.fog.color,e.fog.near,e.fog.far):e.fog.type==="FogExp2"&&(r.fog=new Fs(e.fog.color,e.fog.density)));break;case"PerspectiveCamera":r=new qt(e.fov,e.aspect,e.near,e.far),e.focus!==void 0&&(r.focus=e.focus),e.zoom!==void 0&&(r.zoom=e.zoom),e.filmGauge!==void 0&&(r.filmGauge=e.filmGauge),e.filmOffset!==void 0&&(r.filmOffset=e.filmOffset),e.view!==void 0&&(r.view=Object.assign({},e.view));break;case"OrthographicCamera":r=new Ki(e.left,e.right,e.top,e.bottom,e.near,e.far),e.zoom!==void 0&&(r.zoom=e.zoom),e.view!==void 0&&(r.view=Object.assign({},e.view));break;case"AmbientLight":r=new _a(e.color,e.intensity);break;case"DirectionalLight":r=new Ma(e.color,e.intensity);break;case"PointLight":r=new wa(e.color,e.intensity,e.distance,e.decay);break;case"RectAreaLight":r=new Sa(e.color,e.intensity,e.width,e.height);break;case"SpotLight":r=new ba(e.color,e.intensity,e.distance,e.angle,e.penumbra,e.decay);break;case"HemisphereLight":r=new xa(e.color,e.groundColor,e.intensity);break;case"LightProbe":r=new Qi().fromJSON(e);break;case"SkinnedMesh":c=a(e.geometry),l=o(e.material),r=new Wr(c,l),e.bindMode!==void 0&&(r.bindMode=e.bindMode),e.bindMatrix!==void 0&&r.bindMatrix.fromArray(e.bindMatrix),e.skeleton!==void 0&&(r.skeleton=e.skeleton);break;case"Mesh":c=a(e.geometry),l=o(e.material),r=new Ot(c,l);break;case"InstancedMesh":c=a(e.geometry),l=o(e.material);let h=e.count,u=e.instanceMatrix,d=e.instanceColor;r=new ks(c,l,h),r.instanceMatrix=new St(new Float32Array(u.array),16),d!==void 0&&(r.instanceColor=new St(new Float32Array(d.array),d.itemSize));break;case"LOD":r=new Xo;break;case"Line":r=new zn(a(e.geometry),o(e.material));break;case"LineLoop":r=new Ns(a(e.geometry),o(e.material));break;case"LineSegments":r=new on(a(e.geometry),o(e.material));break;case"PointCloud":case"Points":r=new Vi(a(e.geometry),o(e.material));break;case"Sprite":r=new Gr(o(e.material));break;case"Group":r=new $n;break;case"Bone":r=new Vr;break;default:r=new Ct}if(r.uuid=e.uuid,e.name!==void 0&&(r.name=e.name),e.matrix!==void 0?(r.matrix.fromArray(e.matrix),e.matrixAutoUpdate!==void 0&&(r.matrixAutoUpdate=e.matrixAutoUpdate),r.matrixAutoUpdate&&r.matrix.decompose(r.position,r.quaternion,r.scale)):(e.position!==void 0&&r.position.fromArray(e.position),e.rotation!==void 0&&r.rotation.fromArray(e.rotation),e.quaternion!==void 0&&r.quaternion.fromArray(e.quaternion),e.scale!==void 0&&r.scale.fromArray(e.scale)),e.castShadow!==void 0&&(r.castShadow=e.castShadow),e.receiveShadow!==void 0&&(r.receiveShadow=e.receiveShadow),e.shadow&&(e.shadow.bias!==void 0&&(r.shadow.bias=e.shadow.bias),e.shadow.normalBias!==void 0&&(r.shadow.normalBias=e.shadow.normalBias),e.shadow.radius!==void 0&&(r.shadow.radius=e.shadow.radius),e.shadow.mapSize!==void 0&&r.shadow.mapSize.fromArray(e.shadow.mapSize),e.shadow.camera!==void 0&&(r.shadow.camera=this.parseObject(e.shadow.camera))),e.visible!==void 0&&(r.visible=e.visible),e.frustumCulled!==void 0&&(r.frustumCulled=e.frustumCulled),e.renderOrder!==void 0&&(r.renderOrder=e.renderOrder),e.userData!==void 0&&(r.userData=e.userData),e.layers!==void 0&&(r.layers.mask=e.layers),e.children!==void 0){let h=e.children;for(let u=0;u<h.length;u++)r.add(this.parseObject(h[u],t,n,i))}if(e.animations!==void 0){let h=e.animations;for(let u=0;u<h.length;u++){let d=h[u];r.animations.push(i[d])}}if(e.type==="LOD"){e.autoUpdate!==void 0&&(r.autoUpdate=e.autoUpdate);let h=e.levels;for(let u=0;u<h.length;u++){let d=h[u],f=r.getObjectByProperty("uuid",d.object);f!==void 0&&r.addLevel(f,d.distance)}}return r}bindSkeletons(e,t){Object.keys(t).length!==0&&e.traverse(function(n){if(n.isSkinnedMesh===!0&&n.skeleton!==void 0){let i=t[n.skeleton];i===void 0?console.warn("THREE.ObjectLoader: No skeleton found with UUID:",n.skeleton):n.bind(i,n.bindMatrix)}})}setTexturePath(e){return console.warn("THREE.ObjectLoader: .setTexturePath() has been renamed to .setResourcePath()."),this.setResourcePath(e)}},zy={UVMapping:Pl,CubeReflectionMapping:Da,CubeRefractionMapping:Ia,EquirectangularReflectionMapping:Do,EquirectangularRefractionMapping:Io,CubeUVReflectionMapping:Qr,CubeUVRefractionMapping:Fa},Gh={RepeatWrapping:_s,ClampToEdgeWrapping:un,MirroredRepeatWrapping:Ss},Wh={NearestFilter:jt,NearestMipmapNearestFilter:Fo,NearestMipmapLinearFilter:Bo,LinearFilter:Jt,LinearMipmapNearestFilter:wu,LinearMipmapLinearFilter:es},ul=class extends Qt{constructor(e){super(e),typeof createImageBitmap>"u"&&console.warn("THREE.ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&console.warn("THREE.ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"}}setOptions(e){return this.options=e,this}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,a=Zi.get(e);if(a!==void 0)return r.manager.itemStart(e),setTimeout(function(){t&&t(a),r.manager.itemEnd(e)},0),a;let o={};o.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",o.headers=this.requestHeader,fetch(e,o).then(function(c){return c.blob()}).then(function(c){return createImageBitmap(c,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(c){Zi.add(e,c),t&&t(c),r.manager.itemEnd(e)}).catch(function(c){i&&i(c),r.manager.itemError(e),r.manager.itemEnd(e)}),r.manager.itemStart(e)}};ul.prototype.isImageBitmapLoader=!0;var hl=class{constructor(){this.type="ShapePath",this.color=new ut,this.subPaths=[],this.currentPath=null}moveTo(e,t){return this.currentPath=new $i,this.subPaths.push(this.currentPath),this.currentPath.moveTo(e,t),this}lineTo(e,t){return this.currentPath.lineTo(e,t),this}quadraticCurveTo(e,t,n,i){return this.currentPath.quadraticCurveTo(e,t,n,i),this}bezierCurveTo(e,t,n,i,r,a){return this.currentPath.bezierCurveTo(e,t,n,i,r,a),this}splineThru(e){return this.currentPath.splineThru(e),this}toShapes(e,t){function n(g){let m=[];for(let S=0,w=g.length;S<w;S++){let b=g[S],F=new Nn;F.curves=b.curves,m.push(F)}return m}function i(g,m){let S=m.length,w=!1;for(let b=S-1,F=0;F<S;b=F++){let L=m[b],O=m[F],ae=O.x-L.x,_=O.y-L.y;if(Math.abs(_)>Number.EPSILON){if(_<0&&(L=m[F],ae=-ae,O=m[b],_=-_),g.y<L.y||g.y>O.y)continue;if(g.y===L.y){if(g.x===L.x)return!0}else{let E=_*(g.x-L.x)-ae*(g.y-L.y);if(E===0)return!0;if(E<0)continue;w=!w}}else{if(g.y!==L.y)continue;if(O.x<=g.x&&g.x<=L.x||L.x<=g.x&&g.x<=O.x)return!0}}return w}let r=kn.isClockWise,a=this.subPaths;if(a.length===0)return[];if(t===!0)return n(a);let o,c,l,h=[];if(a.length===1)return c=a[0],l=new Nn,l.curves=c.curves,h.push(l),h;let u=!r(a[0].getPoints());u=e?!u:u;let d=[],f=[],p=[],y=0,x;f[y]=void 0,p[y]=[];for(let g=0,m=a.length;g<m;g++)c=a[g],x=c.getPoints(),o=r(x),o=e?!o:o,o?(!u&&f[y]&&y++,f[y]={s:new Nn,p:x},f[y].s.curves=c.curves,u&&y++,p[y]=[]):p[y].push({h:c,p:x[0]});if(!f[0])return n(a);if(f.length>1){let g=!1,m=[];for(let S=0,w=f.length;S<w;S++)d[S]=[];for(let S=0,w=f.length;S<w;S++){let b=p[S];for(let F=0;F<b.length;F++){let L=b[F],O=!0;for(let ae=0;ae<f.length;ae++)i(L.p,f[ae].p)&&(S!==ae&&m.push({froms:S,tos:ae,hole:F}),O?(O=!1,d[ae].push(L)):g=!0);O&&d[S].push(L)}}m.length>0&&(g||(p=d))}let v;for(let g=0,m=f.length;g<m;g++){l=f[g].s,h.push(l),v=p[g];for(let S=0,w=v.length;S<w;S++)l.holes.push(v[S].h)}return h}},Pa=class{constructor(e){this.type="Font",this.data=e}generateShapes(e,t=100){let n=[],i=Dy(e,t,this.data);for(let r=0,a=i.length;r<a;r++)Array.prototype.push.apply(n,i[r].toShapes());return n}};function Dy(s,e,t){let n=Array.from(s),i=e/t.resolution,r=(t.boundingBox.yMax-t.boundingBox.yMin+t.underlineThickness)*i,a=[],o=0,c=0;for(let l=0;l<n.length;l++){let h=n[l];if(h===\`
\`)o=0,c-=r;else{let u=Iy(h,i,o,c,t);o+=u.offsetX,a.push(u.path)}}return a}function Iy(s,e,t,n,i){let r=i.glyphs[s]||i.glyphs["?"];if(!r){console.error('THREE.Font: character "'+s+'" does not exists in font family '+i.familyName+".");return}let a=new hl,o,c,l,h,u,d,f,p;if(r.o){let y=r._cachedOutline||(r._cachedOutline=r.o.split(" "));for(let x=0,v=y.length;x<v;)switch(y[x++]){case"m":o=y[x++]*e+t,c=y[x++]*e+n,a.moveTo(o,c);break;case"l":o=y[x++]*e+t,c=y[x++]*e+n,a.lineTo(o,c);break;case"q":l=y[x++]*e+t,h=y[x++]*e+n,u=y[x++]*e+t,d=y[x++]*e+n,a.quadraticCurveTo(u,d,l,h);break;case"b":l=y[x++]*e+t,h=y[x++]*e+n,u=y[x++]*e+t,d=y[x++]*e+n,f=y[x++]*e+t,p=y[x++]*e+n,a.bezierCurveTo(u,d,f,p,l,h);break}}return{offsetX:r.ha*e,path:a}}Pa.prototype.isFont=!0;var Jc=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new _n(this.manager);a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(r.withCredentials),a.load(e,function(o){let c;try{c=JSON.parse(o)}catch{console.warn("THREE.FontLoader: typeface.js support is being deprecated. Use typeface.json instead."),c=JSON.parse(o.substring(65,o.length-2))}let l=r.parse(c);t&&t(l)},n,i)}parse(e){return new Pa(e)}},wo,Cu={getContext:function(){return wo===void 0&&(wo=new(window.AudioContext||window.webkitAudioContext)),wo},setContext:function(s){wo=s}},dl=class extends Qt{constructor(e){super(e)}load(e,t,n,i){let r=this,a=new _n(this.manager);a.setResponseType("arraybuffer"),a.setPath(this.path),a.setRequestHeader(this.requestHeader),a.setWithCredentials(this.withCredentials),a.load(e,function(o){try{let c=o.slice(0);Cu.getContext().decodeAudioData(c,function(h){t(h)})}catch(c){i?i(c):console.error(c),r.manager.itemError(e)}},n,i)}},fl=class extends Qi{constructor(e,t,n=1){super(void 0,n);let i=new ut().set(e),r=new ut().set(t),a=new Y(i.r,i.g,i.b),o=new Y(r.r,r.g,r.b),c=Math.sqrt(Math.PI),l=c*Math.sqrt(.75);this.sh.coefficients[0].copy(a).add(o).multiplyScalar(c),this.sh.coefficients[1].copy(a).sub(o).multiplyScalar(l)}};fl.prototype.isHemisphereLightProbe=!0;var pl=class extends Qi{constructor(e,t=1){super(void 0,t);let n=new ut().set(e);this.sh.coefficients[0].set(n.r,n.g,n.b).multiplyScalar(2*Math.sqrt(Math.PI))}};pl.prototype.isAmbientLightProbe=!0;var Vh=new bt,Hh=new bt,$c=class{constructor(){this.type="StereoCamera",this.aspect=1,this.eyeSep=.064,this.cameraL=new qt,this.cameraL.layers.enable(1),this.cameraL.matrixAutoUpdate=!1,this.cameraR=new qt,this.cameraR.layers.enable(2),this.cameraR.matrixAutoUpdate=!1,this._cache={focus:null,fov:null,aspect:null,near:null,far:null,zoom:null,eyeSep:null}}update(e){let t=this._cache;if(t.focus!==e.focus||t.fov!==e.fov||t.aspect!==e.aspect*this.aspect||t.near!==e.near||t.far!==e.far||t.zoom!==e.zoom||t.eyeSep!==this.eyeSep){t.focus=e.focus,t.fov=e.fov,t.aspect=e.aspect*this.aspect,t.near=e.near,t.far=e.far,t.zoom=e.zoom,t.eyeSep=this.eyeSep;let i=e.projectionMatrix.clone(),r=t.eyeSep/2,a=r*t.near/t.focus,o=t.near*Math.tan(Ui*t.fov*.5)/t.zoom,c,l;Hh.elements[12]=-r,Vh.elements[12]=r,c=-o*t.aspect+a,l=o*t.aspect+a,i.elements[0]=2*t.near/(l-c),i.elements[8]=(l+c)/(l-c),this.cameraL.projectionMatrix.copy(i),c=-o*t.aspect-a,l=o*t.aspect-a,i.elements[0]=2*t.near/(l-c),i.elements[8]=(l+c)/(l-c),this.cameraR.projectionMatrix.copy(i)}this.cameraL.matrixWorld.copy(e.matrixWorld).multiply(Hh),this.cameraR.matrixWorld.copy(e.matrixWorld).multiply(Vh)}},ml=class{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=qh(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){let t=qh();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}};function qh(){return(typeof performance>"u"?Date:performance).now()}var Ci=new Y,Xh=new Xt,Fy=new Y,Pi=new Y,Kc=class extends Ct{constructor(){super(),this.type="AudioListener",this.context=Cu.getContext(),this.gain=this.context.createGain(),this.gain.connect(this.context.destination),this.filter=null,this.timeDelta=0,this._clock=new ml}getInput(){return this.gain}removeFilter(){return this.filter!==null&&(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination),this.gain.connect(this.context.destination),this.filter=null),this}getFilter(){return this.filter}setFilter(e){return this.filter!==null?(this.gain.disconnect(this.filter),this.filter.disconnect(this.context.destination)):this.gain.disconnect(this.context.destination),this.filter=e,this.gain.connect(this.filter),this.filter.connect(this.context.destination),this}getMasterVolume(){return this.gain.gain.value}setMasterVolume(e){return this.gain.gain.setTargetAtTime(e,this.context.currentTime,.01),this}updateMatrixWorld(e){super.updateMatrixWorld(e);let t=this.context.listener,n=this.up;if(this.timeDelta=this._clock.getDelta(),this.matrixWorld.decompose(Ci,Xh,Fy),Pi.set(0,0,-1).applyQuaternion(Xh),t.positionX){let i=this.context.currentTime+this.timeDelta;t.positionX.linearRampToValueAtTime(Ci.x,i),t.positionY.linearRampToValueAtTime(Ci.y,i),t.positionZ.linearRampToValueAtTime(Ci.z,i),t.forwardX.linearRampToValueAtTime(Pi.x,i),t.forwardY.linearRampToValueAtTime(Pi.y,i),t.forwardZ.linearRampToValueAtTime(Pi.z,i),t.upX.linearRampToValueAtTime(n.x,i),t.upY.linearRampToValueAtTime(n.y,i),t.upZ.linearRampToValueAtTime(n.z,i)}else t.setPosition(Ci.x,Ci.y,Ci.z),t.setOrientation(Pi.x,Pi.y,Pi.z,n.x,n.y,n.z)}},La=class extends Ct{constructor(e){super(),this.type="Audio",this.listener=e,this.context=e.context,this.gain=this.context.createGain(),this.gain.connect(e.getInput()),this.autoplay=!1,this.buffer=null,this.detune=0,this.loop=!1,this.loopStart=0,this.loopEnd=0,this.offset=0,this.duration=void 0,this.playbackRate=1,this.isPlaying=!1,this.hasPlaybackControl=!0,this.source=null,this.sourceType="empty",this._startedAt=0,this._progress=0,this._connected=!1,this.filters=[]}getOutput(){return this.gain}setNodeSource(e){return this.hasPlaybackControl=!1,this.sourceType="audioNode",this.source=e,this.connect(),this}setMediaElementSource(e){return this.hasPlaybackControl=!1,this.sourceType="mediaNode",this.source=this.context.createMediaElementSource(e),this.connect(),this}setMediaStreamSource(e){return this.hasPlaybackControl=!1,this.sourceType="mediaStreamNode",this.source=this.context.createMediaStreamSource(e),this.connect(),this}setBuffer(e){return this.buffer=e,this.sourceType="buffer",this.autoplay&&this.play(),this}play(e=0){if(this.isPlaying===!0){console.warn("THREE.Audio: Audio is already playing.");return}if(this.hasPlaybackControl===!1){console.warn("THREE.Audio: this Audio has no playback control.");return}this._startedAt=this.context.currentTime+e;let t=this.context.createBufferSource();return t.buffer=this.buffer,t.loop=this.loop,t.loopStart=this.loopStart,t.loopEnd=this.loopEnd,t.onended=this.onEnded.bind(this),t.start(this._startedAt,this._progress+this.offset,this.duration),this.isPlaying=!0,this.source=t,this.setDetune(this.detune),this.setPlaybackRate(this.playbackRate),this.connect()}pause(){if(this.hasPlaybackControl===!1){console.warn("THREE.Audio: this Audio has no playback control.");return}return this.isPlaying===!0&&(this._progress+=Math.max(this.context.currentTime-this._startedAt,0)*this.playbackRate,this.loop===!0&&(this._progress=this._progress%(this.duration||this.buffer.duration)),this.source.stop(),this.source.onended=null,this.isPlaying=!1),this}stop(){if(this.hasPlaybackControl===!1){console.warn("THREE.Audio: this Audio has no playback control.");return}return this._progress=0,this.source.stop(),this.source.onended=null,this.isPlaying=!1,this}connect(){if(this.filters.length>0){this.source.connect(this.filters[0]);for(let e=1,t=this.filters.length;e<t;e++)this.filters[e-1].connect(this.filters[e]);this.filters[this.filters.length-1].connect(this.getOutput())}else this.source.connect(this.getOutput());return this._connected=!0,this}disconnect(){if(this.filters.length>0){this.source.disconnect(this.filters[0]);for(let e=1,t=this.filters.length;e<t;e++)this.filters[e-1].disconnect(this.filters[e]);this.filters[this.filters.length-1].disconnect(this.getOutput())}else this.source.disconnect(this.getOutput());return this._connected=!1,this}getFilters(){return this.filters}setFilters(e){return e||(e=[]),this._connected===!0?(this.disconnect(),this.filters=e.slice(),this.connect()):this.filters=e.slice(),this}setDetune(e){if(this.detune=e,this.source.detune!==void 0)return this.isPlaying===!0&&this.source.detune.setTargetAtTime(this.detune,this.context.currentTime,.01),this}getDetune(){return this.detune}getFilter(){return this.getFilters()[0]}setFilter(e){return this.setFilters(e?[e]:[])}setPlaybackRate(e){if(this.hasPlaybackControl===!1){console.warn("THREE.Audio: this Audio has no playback control.");return}return this.playbackRate=e,this.isPlaying===!0&&this.source.playbackRate.setTargetAtTime(this.playbackRate,this.context.currentTime,.01),this}getPlaybackRate(){return this.playbackRate}onEnded(){this.isPlaying=!1}getLoop(){return this.hasPlaybackControl===!1?(console.warn("THREE.Audio: this Audio has no playback control."),!1):this.loop}setLoop(e){if(this.hasPlaybackControl===!1){console.warn("THREE.Audio: this Audio has no playback control.");return}return this.loop=e,this.isPlaying===!0&&(this.source.loop=this.loop),this}setLoopStart(e){return this.loopStart=e,this}setLoopEnd(e){return this.loopEnd=e,this}getVolume(){return this.gain.gain.value}setVolume(e){return this.gain.gain.setTargetAtTime(e,this.context.currentTime,.01),this}},Li=new Y,Yh=new Xt,By=new Y,Ri=new Y,Qc=class extends La{constructor(e){super(e),this.panner=this.context.createPanner(),this.panner.panningModel="HRTF",this.panner.connect(this.gain)}getOutput(){return this.panner}getRefDistance(){return this.panner.refDistance}setRefDistance(e){return this.panner.refDistance=e,this}getRolloffFactor(){return this.panner.rolloffFactor}setRolloffFactor(e){return this.panner.rolloffFactor=e,this}getDistanceModel(){return this.panner.distanceModel}setDistanceModel(e){return this.panner.distanceModel=e,this}getMaxDistance(){return this.panner.maxDistance}setMaxDistance(e){return this.panner.maxDistance=e,this}setDirectionalCone(e,t,n){return this.panner.coneInnerAngle=e,this.panner.coneOuterAngle=t,this.panner.coneOuterGain=n,this}updateMatrixWorld(e){if(super.updateMatrixWorld(e),this.hasPlaybackControl===!0&&this.isPlaying===!1)return;this.matrixWorld.decompose(Li,Yh,By),Ri.set(0,0,1).applyQuaternion(Yh);let t=this.panner;if(t.positionX){let n=this.context.currentTime+this.listener.timeDelta;t.positionX.linearRampToValueAtTime(Li.x,n),t.positionY.linearRampToValueAtTime(Li.y,n),t.positionZ.linearRampToValueAtTime(Li.z,n),t.orientationX.linearRampToValueAtTime(Ri.x,n),t.orientationY.linearRampToValueAtTime(Ri.y,n),t.orientationZ.linearRampToValueAtTime(Ri.z,n)}else t.setPosition(Li.x,Li.y,Li.z),t.setOrientation(Ri.x,Ri.y,Ri.z)}},gl=class{constructor(e,t=2048){this.analyser=e.context.createAnalyser(),this.analyser.fftSize=t,this.data=new Uint8Array(this.analyser.frequencyBinCount),e.getOutput().connect(this.analyser)}getFrequencyData(){return this.analyser.getByteFrequencyData(this.data),this.data}getAverageFrequency(){let e=0,t=this.getFrequencyData();for(let n=0;n<t.length;n++)e+=t[n];return e/t.length}},vl=class{constructor(e,t,n){this.binding=e,this.valueSize=n;let i,r,a;switch(t){case"quaternion":i=this._slerp,r=this._slerpAdditive,a=this._setAdditiveIdentityQuaternion,this.buffer=new Float64Array(n*6),this._workIndex=5;break;case"string":case"bool":i=this._select,r=this._select,a=this._setAdditiveIdentityOther,this.buffer=new Array(n*5);break;default:i=this._lerp,r=this._lerpAdditive,a=this._setAdditiveIdentityNumeric,this.buffer=new Float64Array(n*5)}this._mixBufferRegion=i,this._mixBufferRegionAdditive=r,this._setIdentity=a,this._origIndex=3,this._addIndex=4,this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,this.useCount=0,this.referenceCount=0}accumulate(e,t){let n=this.buffer,i=this.valueSize,r=e*i+i,a=this.cumulativeWeight;if(a===0){for(let o=0;o!==i;++o)n[r+o]=n[o];a=t}else{a+=t;let o=t/a;this._mixBufferRegion(n,r,0,o,i)}this.cumulativeWeight=a}accumulateAdditive(e){let t=this.buffer,n=this.valueSize,i=n*this._addIndex;this.cumulativeWeightAdditive===0&&this._setIdentity(),this._mixBufferRegionAdditive(t,i,0,e,n),this.cumulativeWeightAdditive+=e}apply(e){let t=this.valueSize,n=this.buffer,i=e*t+t,r=this.cumulativeWeight,a=this.cumulativeWeightAdditive,o=this.binding;if(this.cumulativeWeight=0,this.cumulativeWeightAdditive=0,r<1){let c=t*this._origIndex;this._mixBufferRegion(n,i,c,1-r,t)}a>0&&this._mixBufferRegionAdditive(n,i,this._addIndex*t,1,t);for(let c=t,l=t+t;c!==l;++c)if(n[c]!==n[c+t]){o.setValue(n,i);break}}saveOriginalState(){let e=this.binding,t=this.buffer,n=this.valueSize,i=n*this._origIndex;e.getValue(t,i);for(let r=n,a=i;r!==a;++r)t[r]=t[i+r%n];this._setIdentity(),this.cumulativeWeight=0,this.cumulativeWeightAdditive=0}restoreOriginalState(){let e=this.valueSize*3;this.binding.setValue(this.buffer,e)}_setAdditiveIdentityNumeric(){let e=this._addIndex*this.valueSize,t=e+this.valueSize;for(let n=e;n<t;n++)this.buffer[n]=0}_setAdditiveIdentityQuaternion(){this._setAdditiveIdentityNumeric(),this.buffer[this._addIndex*this.valueSize+3]=1}_setAdditiveIdentityOther(){let e=this._origIndex*this.valueSize,t=this._addIndex*this.valueSize;for(let n=0;n<this.valueSize;n++)this.buffer[t+n]=this.buffer[e+n]}_select(e,t,n,i,r){if(i>=.5)for(let a=0;a!==r;++a)e[t+a]=e[n+a]}_slerp(e,t,n,i){Xt.slerpFlat(e,t,e,t,e,n,i)}_slerpAdditive(e,t,n,i,r){let a=this._workIndex*r;Xt.multiplyQuaternionsFlat(e,a,e,t,e,n),Xt.slerpFlat(e,t,e,t,e,a,i)}_lerp(e,t,n,i,r){let a=1-i;for(let o=0;o!==r;++o){let c=t+o;e[c]=e[c]*a+e[n+o]*i}}_lerpAdditive(e,t,n,i,r){for(let a=0;a!==r;++a){let o=t+a;e[o]=e[o]+e[n+a]*i}}},Pu="\\\\[\\\\]\\\\.:\\\\/",ky=new RegExp("["+Pu+"]","g"),Lu="[^"+Pu+"]",Ny="[^"+Pu.replace("\\\\.","")+"]",Uy=/((?:WC+[\\/:])*)/.source.replace("WC",Lu),Oy=/(WCOD+)?/.source.replace("WCOD",Ny),Gy=/(?:\\.(WC+)(?:\\[(.+)\\])?)?/.source.replace("WC",Lu),Wy=/\\.(WC+)(?:\\[(.+)\\])?/.source.replace("WC",Lu),Vy=new RegExp("^"+Uy+Oy+Gy+Wy+"$"),Hy=["material","materials","bones"],eu=class{constructor(e,t,n){let i=n||zt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},zt=class s{constructor(e,t,n){this.path=t,this.parsedPath=n||s.parseTrackName(t),this.node=s.findNode(e,this.parsedPath.nodeName)||e,this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new s.Composite(e,t,n):new s(e,t,n)}static sanitizeNodeName(e){return e.replace(/\\s/g,"_").replace(ky,"")}static parseTrackName(e){let t=Vy.exec(e);if(!t)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);Hy.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(!t||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===t||o.uuid===t)return o;let c=n(o.children);if(c)return c}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.node[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,i=t.propertyName,r=t.propertyIndex;if(e||(e=s.findNode(this.rootNode,t.nodeName)||this.rootNode,this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.error("THREE.PropertyBinding: Trying to update node for track: "+this.path+" but it wasn't found.");return}if(n){let l=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===l){l=h;break}break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(l!==void 0){if(e[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[l]}}let a=e[i];if(a===void 0){let l=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+i+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.needsUpdate!==void 0?o=this.Versioning.NeedsUpdate:e.matrixWorldNeedsUpdate!==void 0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(e.geometry.isBufferGeometry){if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}else{console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences on THREE.Geometry. Use THREE.BufferGeometry instead.",this);return}}c=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(c=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};zt.Composite=eu;zt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};zt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};zt.prototype.GetterByBindingType=[zt.prototype._getValue_direct,zt.prototype._getValue_array,zt.prototype._getValue_arrayElement,zt.prototype._getValue_toArray];zt.prototype.SetterByBindingTypeAndVersioning=[[zt.prototype._setValue_direct,zt.prototype._setValue_direct_setNeedsUpdate,zt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[zt.prototype._setValue_array,zt.prototype._setValue_array_setNeedsUpdate,zt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[zt.prototype._setValue_arrayElement,zt.prototype._setValue_arrayElement_setNeedsUpdate,zt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[zt.prototype._setValue_fromArray,zt.prototype._setValue_fromArray_setNeedsUpdate,zt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var xl=class{constructor(){this.uuid=yn(),this._objects=Array.prototype.slice.call(arguments),this.nCachedObjects_=0;let e={};this._indicesByUUID=e;for(let n=0,i=arguments.length;n!==i;++n)e[arguments[n].uuid]=n;this._paths=[],this._parsedPaths=[],this._bindings=[],this._bindingsIndicesByPath={};let t=this;this.stats={objects:{get total(){return t._objects.length},get inUse(){return this.total-t.nCachedObjects_}},get bindingsPerObject(){return t._bindings.length}}}add(){let e=this._objects,t=this._indicesByUUID,n=this._paths,i=this._parsedPaths,r=this._bindings,a=r.length,o,c=e.length,l=this.nCachedObjects_;for(let h=0,u=arguments.length;h!==u;++h){let d=arguments[h],f=d.uuid,p=t[f];if(p===void 0){p=c++,t[f]=p,e.push(d);for(let y=0,x=a;y!==x;++y)r[y].push(new zt(d,n[y],i[y]))}else if(p<l){o=e[p];let y=--l,x=e[y];t[x.uuid]=p,e[p]=x,t[f]=y,e[y]=d;for(let v=0,g=a;v!==g;++v){let m=r[v],S=m[y],w=m[p];m[p]=S,w===void 0&&(w=new zt(d,n[v],i[v])),m[y]=w}}else e[p]!==o&&console.error("THREE.AnimationObjectGroup: Different objects with the same UUID detected. Clean the caches or recreate your infrastructure when reloading scenes.")}this.nCachedObjects_=l}remove(){let e=this._objects,t=this._indicesByUUID,n=this._bindings,i=n.length,r=this.nCachedObjects_;for(let a=0,o=arguments.length;a!==o;++a){let c=arguments[a],l=c.uuid,h=t[l];if(h!==void 0&&h>=r){let u=r++,d=e[u];t[d.uuid]=h,e[h]=d,t[l]=u,e[u]=c;for(let f=0,p=i;f!==p;++f){let y=n[f],x=y[u],v=y[h];y[h]=x,y[u]=v}}}this.nCachedObjects_=r}uncache(){let e=this._objects,t=this._indicesByUUID,n=this._bindings,i=n.length,r=this.nCachedObjects_,a=e.length;for(let o=0,c=arguments.length;o!==c;++o){let l=arguments[o],h=l.uuid,u=t[h];if(u!==void 0)if(delete t[h],u<r){let d=--r,f=e[d],p=--a,y=e[p];t[f.uuid]=u,e[u]=f,t[y.uuid]=d,e[d]=y,e.pop();for(let x=0,v=i;x!==v;++x){let g=n[x],m=g[d],S=g[p];g[u]=m,g[d]=S,g.pop()}}else{let d=--a,f=e[d];d>0&&(t[f.uuid]=u),e[u]=f,e.pop();for(let p=0,y=i;p!==y;++p){let x=n[p];x[u]=x[d],x.pop()}}}this.nCachedObjects_=r}subscribe_(e,t){let n=this._bindingsIndicesByPath,i=n[e],r=this._bindings;if(i!==void 0)return r[i];let a=this._paths,o=this._parsedPaths,c=this._objects,l=c.length,h=this.nCachedObjects_,u=new Array(l);i=r.length,n[e]=i,a.push(e),o.push(t),r.push(u);for(let d=h,f=c.length;d!==f;++d){let p=c[d];u[d]=new zt(p,e,t)}return u}unsubscribe_(e){let t=this._bindingsIndicesByPath,n=t[e];if(n!==void 0){let i=this._paths,r=this._parsedPaths,a=this._bindings,o=a.length-1,c=a[o],l=e[o];t[l]=n,a[n]=c,a.pop(),r[n]=r[o],r.pop(),i[n]=i[o],i.pop()}}};xl.prototype.isAnimationObjectGroup=!0;var tu=class{constructor(e,t,n=null,i=t.blendMode){this._mixer=e,this._clip=t,this._localRoot=n,this.blendMode=i;let r=t.tracks,a=r.length,o=new Array(a),c={endingStart:Fi,endingEnd:Fi};for(let l=0;l!==a;++l){let h=r[l].createInterpolant(null);o[l]=h,h.settings=c}this._interpolantSettings=c,this._interpolants=o,this._propertyBindings=new Array(a),this._cacheIndex=null,this._byClipCacheIndex=null,this._timeScaleInterpolant=null,this._weightInterpolant=null,this.loop=Df,this._loopCount=-1,this._startTime=null,this.time=0,this.timeScale=1,this._effectiveTimeScale=1,this.weight=1,this._effectiveWeight=1,this.repetitions=1/0,this.paused=!1,this.enabled=!0,this.clampWhenFinished=!1,this.zeroSlopeAtStart=!0,this.zeroSlopeAtEnd=!0}play(){return this._mixer._activateAction(this),this}stop(){return this._mixer._deactivateAction(this),this.reset()}reset(){return this.paused=!1,this.enabled=!0,this.time=0,this._loopCount=-1,this._startTime=null,this.stopFading().stopWarping()}isRunning(){return this.enabled&&!this.paused&&this.timeScale!==0&&this._startTime===null&&this._mixer._isActiveAction(this)}isScheduled(){return this._mixer._isActiveAction(this)}startAt(e){return this._startTime=e,this}setLoop(e,t){return this.loop=e,this.repetitions=t,this}setEffectiveWeight(e){return this.weight=e,this._effectiveWeight=this.enabled?e:0,this.stopFading()}getEffectiveWeight(){return this._effectiveWeight}fadeIn(e){return this._scheduleFading(e,0,1)}fadeOut(e){return this._scheduleFading(e,1,0)}crossFadeFrom(e,t,n){if(e.fadeOut(t),this.fadeIn(t),n){let i=this._clip.duration,r=e._clip.duration,a=r/i,o=i/r;e.warp(1,a,t),this.warp(o,1,t)}return this}crossFadeTo(e,t,n){return e.crossFadeFrom(this,t,n)}stopFading(){let e=this._weightInterpolant;return e!==null&&(this._weightInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this}setEffectiveTimeScale(e){return this.timeScale=e,this._effectiveTimeScale=this.paused?0:e,this.stopWarping()}getEffectiveTimeScale(){return this._effectiveTimeScale}setDuration(e){return this.timeScale=this._clip.duration/e,this.stopWarping()}syncWith(e){return this.time=e.time,this.timeScale=e.timeScale,this.stopWarping()}halt(e){return this.warp(this._effectiveTimeScale,0,e)}warp(e,t,n){let i=this._mixer,r=i.time,a=this.timeScale,o=this._timeScaleInterpolant;o===null&&(o=i._lendControlInterpolant(),this._timeScaleInterpolant=o);let c=o.parameterPositions,l=o.sampleValues;return c[0]=r,c[1]=r+n,l[0]=e/a,l[1]=t/a,this}stopWarping(){let e=this._timeScaleInterpolant;return e!==null&&(this._timeScaleInterpolant=null,this._mixer._takeBackControlInterpolant(e)),this}getMixer(){return this._mixer}getClip(){return this._clip}getRoot(){return this._localRoot||this._mixer._root}_update(e,t,n,i){if(!this.enabled){this._updateWeight(e);return}let r=this._startTime;if(r!==null){let c=(e-r)*n;if(c<0||n===0)return;this._startTime=null,t=n*c}t*=this._updateTimeScale(e);let a=this._updateTime(t),o=this._updateWeight(e);if(o>0){let c=this._interpolants,l=this._propertyBindings;switch(this.blendMode){case Mu:for(let h=0,u=c.length;h!==u;++h)c[h].evaluate(a),l[h].accumulateAdditive(o);break;case Ll:default:for(let h=0,u=c.length;h!==u;++h)c[h].evaluate(a),l[h].accumulate(i,o)}}}_updateWeight(e){let t=0;if(this.enabled){t=this.weight;let n=this._weightInterpolant;if(n!==null){let i=n.evaluate(e)[0];t*=i,e>n.parameterPositions[1]&&(this.stopFading(),i===0&&(this.enabled=!1))}}return this._effectiveWeight=t,t}_updateTimeScale(e){let t=0;if(!this.paused){t=this.timeScale;let n=this._timeScaleInterpolant;if(n!==null){let i=n.evaluate(e)[0];t*=i,e>n.parameterPositions[1]&&(this.stopWarping(),t===0?this.paused=!0:this.timeScale=t)}}return this._effectiveTimeScale=t,t}_updateTime(e){let t=this._clip.duration,n=this.loop,i=this.time+e,r=this._loopCount,a=n===If;if(e===0)return r===-1?i:a&&(r&1)===1?t-i:i;if(n===zf){r===-1&&(this._loopCount=0,this._setEndings(!0,!0,!1));e:{if(i>=t)i=t;else if(i<0)i=0;else{this.time=i;break e}this.clampWhenFinished?this.paused=!0:this.enabled=!1,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e<0?-1:1})}}else{if(r===-1&&(e>=0?(r=0,this._setEndings(!0,this.repetitions===0,a)):this._setEndings(this.repetitions===0,!0,a)),i>=t||i<0){let o=Math.floor(i/t);i-=t*o,r+=Math.abs(o);let c=this.repetitions-r;if(c<=0)this.clampWhenFinished?this.paused=!0:this.enabled=!1,i=e>0?t:0,this.time=i,this._mixer.dispatchEvent({type:"finished",action:this,direction:e>0?1:-1});else{if(c===1){let l=e<0;this._setEndings(l,!l,a)}else this._setEndings(!1,!1,a);this._loopCount=r,this.time=i,this._mixer.dispatchEvent({type:"loop",action:this,loopDelta:o})}}else this.time=i;if(a&&(r&1)===1)return t-i}return i}_setEndings(e,t,n){let i=this._interpolantSettings;n?(i.endingStart=Bi,i.endingEnd=Bi):(e?i.endingStart=this.zeroSlopeAtStart?Bi:Fi:i.endingStart=Ps,t?i.endingEnd=this.zeroSlopeAtEnd?Bi:Fi:i.endingEnd=Ps)}_scheduleFading(e,t,n){let i=this._mixer,r=i.time,a=this._weightInterpolant;a===null&&(a=i._lendControlInterpolant(),this._weightInterpolant=a);let o=a.parameterPositions,c=a.sampleValues;return o[0]=r,c[0]=t,o[1]=r+e,c[1]=n,this}},yl=class extends Un{constructor(e){super(),this._root=e,this._initMemoryManager(),this._accuIndex=0,this.time=0,this.timeScale=1}_bindAction(e,t){let n=e._localRoot||this._root,i=e._clip.tracks,r=i.length,a=e._propertyBindings,o=e._interpolants,c=n.uuid,l=this._bindingsByRootAndName,h=l[c];h===void 0&&(h={},l[c]=h);for(let u=0;u!==r;++u){let d=i[u],f=d.name,p=h[f];if(p!==void 0)a[u]=p;else{if(p=a[u],p!==void 0){p._cacheIndex===null&&(++p.referenceCount,this._addInactiveBinding(p,c,f));continue}let y=t&&t._propertyBindings[u].binding.parsedPath;p=new vl(zt.create(n,f,y),d.ValueTypeName,d.getValueSize()),++p.referenceCount,this._addInactiveBinding(p,c,f),a[u]=p}o[u].resultBuffer=p.buffer}}_activateAction(e){if(!this._isActiveAction(e)){if(e._cacheIndex===null){let n=(e._localRoot||this._root).uuid,i=e._clip.uuid,r=this._actionsByClip[i];this._bindAction(e,r&&r.knownActions[0]),this._addInactiveAction(e,i,n)}let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];r.useCount++===0&&(this._lendBinding(r),r.saveOriginalState())}this._lendAction(e)}}_deactivateAction(e){if(this._isActiveAction(e)){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];--r.useCount===0&&(r.restoreOriginalState(),this._takeBackBinding(r))}this._takeBackAction(e)}}_initMemoryManager(){this._actions=[],this._nActiveActions=0,this._actionsByClip={},this._bindings=[],this._nActiveBindings=0,this._bindingsByRootAndName={},this._controlInterpolants=[],this._nActiveControlInterpolants=0;let e=this;this.stats={actions:{get total(){return e._actions.length},get inUse(){return e._nActiveActions}},bindings:{get total(){return e._bindings.length},get inUse(){return e._nActiveBindings}},controlInterpolants:{get total(){return e._controlInterpolants.length},get inUse(){return e._nActiveControlInterpolants}}}}_isActiveAction(e){let t=e._cacheIndex;return t!==null&&t<this._nActiveActions}_addInactiveAction(e,t,n){let i=this._actions,r=this._actionsByClip,a=r[t];if(a===void 0)a={knownActions:[e],actionByRoot:{}},e._byClipCacheIndex=0,r[t]=a;else{let o=a.knownActions;e._byClipCacheIndex=o.length,o.push(e)}e._cacheIndex=i.length,i.push(e),a.actionByRoot[n]=e}_removeInactiveAction(e){let t=this._actions,n=t[t.length-1],i=e._cacheIndex;n._cacheIndex=i,t[i]=n,t.pop(),e._cacheIndex=null;let r=e._clip.uuid,a=this._actionsByClip,o=a[r],c=o.knownActions,l=c[c.length-1],h=e._byClipCacheIndex;l._byClipCacheIndex=h,c[h]=l,c.pop(),e._byClipCacheIndex=null;let u=o.actionByRoot,d=(e._localRoot||this._root).uuid;delete u[d],c.length===0&&delete a[r],this._removeInactiveBindingsForAction(e)}_removeInactiveBindingsForAction(e){let t=e._propertyBindings;for(let n=0,i=t.length;n!==i;++n){let r=t[n];--r.referenceCount===0&&this._removeInactiveBinding(r)}}_lendAction(e){let t=this._actions,n=e._cacheIndex,i=this._nActiveActions++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackAction(e){let t=this._actions,n=e._cacheIndex,i=--this._nActiveActions,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_addInactiveBinding(e,t,n){let i=this._bindingsByRootAndName,r=this._bindings,a=i[t];a===void 0&&(a={},i[t]=a),a[n]=e,e._cacheIndex=r.length,r.push(e)}_removeInactiveBinding(e){let t=this._bindings,n=e.binding,i=n.rootNode.uuid,r=n.path,a=this._bindingsByRootAndName,o=a[i],c=t[t.length-1],l=e._cacheIndex;c._cacheIndex=l,t[l]=c,t.pop(),delete o[r],Object.keys(o).length===0&&delete a[i]}_lendBinding(e){let t=this._bindings,n=e._cacheIndex,i=this._nActiveBindings++,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_takeBackBinding(e){let t=this._bindings,n=e._cacheIndex,i=--this._nActiveBindings,r=t[i];e._cacheIndex=i,t[i]=e,r._cacheIndex=n,t[n]=r}_lendControlInterpolant(){let e=this._controlInterpolants,t=this._nActiveControlInterpolants++,n=e[t];return n===void 0&&(n=new ha(new Float32Array(2),new Float32Array(2),1,this._controlInterpolantsResultBuffer),n.__cacheIndex=t,e[t]=n),n}_takeBackControlInterpolant(e){let t=this._controlInterpolants,n=e.__cacheIndex,i=--this._nActiveControlInterpolants,r=t[i];e.__cacheIndex=i,t[i]=e,r.__cacheIndex=n,t[n]=r}clipAction(e,t,n){let i=t||this._root,r=i.uuid,a=typeof e=="string"?Yi.findByName(i,e):e,o=a!==null?a.uuid:e,c=this._actionsByClip[o],l=null;if(n===void 0&&(a!==null?n=a.blendMode:n=Ll),c!==void 0){let u=c.actionByRoot[r];if(u!==void 0&&u.blendMode===n)return u;l=c.knownActions[0],a===null&&(a=l._clip)}if(a===null)return null;let h=new tu(this,a,t,n);return this._bindAction(h,l),this._addInactiveAction(h,o,r),h}existingAction(e,t){let n=t||this._root,i=n.uuid,r=typeof e=="string"?Yi.findByName(n,e):e,a=r?r.uuid:e,o=this._actionsByClip[a];return o!==void 0&&o.actionByRoot[i]||null}stopAllAction(){let e=this._actions,t=this._nActiveActions;for(let n=t-1;n>=0;--n)e[n].stop();return this}update(e){e*=this.timeScale;let t=this._actions,n=this._nActiveActions,i=this.time+=e,r=Math.sign(e),a=this._accuIndex^=1;for(let l=0;l!==n;++l)t[l]._update(i,e,r,a);let o=this._bindings,c=this._nActiveBindings;for(let l=0;l!==c;++l)o[l].apply(a);return this}setTime(e){this.time=0;for(let t=0;t<this._actions.length;t++)this._actions[t].time=0;return this.update(e)}getRoot(){return this._root}uncacheClip(e){let t=this._actions,n=e.uuid,i=this._actionsByClip,r=i[n];if(r!==void 0){let a=r.knownActions;for(let o=0,c=a.length;o!==c;++o){let l=a[o];this._deactivateAction(l);let h=l._cacheIndex,u=t[t.length-1];l._cacheIndex=null,l._byClipCacheIndex=null,u._cacheIndex=h,t[h]=u,t.pop(),this._removeInactiveBindingsForAction(l)}delete i[n]}}uncacheRoot(e){let t=e.uuid,n=this._actionsByClip;for(let a in n){let o=n[a].actionByRoot,c=o[t];c!==void 0&&(this._deactivateAction(c),this._removeInactiveAction(c))}let i=this._bindingsByRootAndName,r=i[t];if(r!==void 0)for(let a in r){let o=r[a];o.restoreOriginalState(),this._removeInactiveBinding(o)}}uncacheAction(e,t){let n=this.existingAction(e,t);n!==null&&(this._deactivateAction(n),this._removeInactiveAction(n))}};yl.prototype._controlInterpolantsResultBuffer=new Float32Array(1);var bl=class s{constructor(e){typeof e=="string"&&(console.warn("THREE.Uniform: Type parameter is no longer needed."),e=arguments[1]),this.value=e}clone(){return new s(this.value.clone===void 0?this.value:this.value.clone())}},wl=class extends ei{constructor(e,t,n=1){super(e,t),this.meshPerAttribute=n||1}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}clone(e){let t=super.clone(e);return t.meshPerAttribute=this.meshPerAttribute,t}toJSON(e){let t=super.toJSON(e);return t.isInstancedInterleavedBuffer=!0,t.meshPerAttribute=this.meshPerAttribute,t}};wl.prototype.isInstancedInterleavedBuffer=!0;var Ml=class{constructor(e,t,n,i,r){this.buffer=e,this.type=t,this.itemSize=n,this.elementSize=i,this.count=r,this.version=0}set needsUpdate(e){e===!0&&this.version++}setBuffer(e){return this.buffer=e,this}setType(e,t){return this.type=e,this.elementSize=t,this}setItemSize(e){return this.itemSize=e,this}setCount(e){return this.count=e,this}};Ml.prototype.isGLBufferAttribute=!0;var nu=class{constructor(e,t,n=0,i=1/0){this.ray=new Gn(e,t),this.near=n,this.far=i,this.camera=null,this.layers=new Rs,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t&&t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t&&t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}intersectObject(e,t=!1,n=[]){return iu(e,this,n,t),n.sort(Zh),n}intersectObjects(e,t=!1,n=[]){for(let i=0,r=e.length;i<r;i++)iu(e[i],this,n,t);return n.sort(Zh),n}};function Zh(s,e){return s.distance-e.distance}function iu(s,e,t,n){if(s.layers.test(e.layers)&&s.raycast(e,t),n===!0){let i=s.children;for(let r=0,a=i.length;r<a;r++)iu(i[r],e,t,!0)}}var ru=class{constructor(e=1,t=0,n=0){return this.radius=e,this.phi=t,this.theta=n,this}set(e,t,n){return this.radius=e,this.phi=t,this.theta=n,this}copy(e){return this.radius=e.radius,this.phi=e.phi,this.theta=e.theta,this}makeSafe(){return this.phi=Math.max(1e-6,Math.min(Math.PI-1e-6,this.phi)),this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+t*t+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(e,n),this.phi=Math.acos(tn(t/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}},su=class{constructor(e=1,t=0,n=0){return this.radius=e,this.theta=t,this.y=n,this}set(e,t,n){return this.radius=e,this.theta=t,this.y=n,this}copy(e){return this.radius=e.radius,this.theta=e.theta,this.y=e.y,this}setFromVector3(e){return this.setFromCartesianCoords(e.x,e.y,e.z)}setFromCartesianCoords(e,t,n){return this.radius=Math.sqrt(e*e+n*n),this.theta=Math.atan2(e,n),this.y=t,this}clone(){return new this.constructor().copy(this)}},jh=new Je,Si=class{constructor(e=new Je(1/0,1/0),t=new Je(-1/0,-1/0)){this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=jh.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=1/0,this.max.x=this.max.y=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y}getCenter(e){return e===void 0&&(console.warn("THREE.Box2: .getCenter() target is now required"),e=new Je),this.isEmpty()?e.set(0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return e===void 0&&(console.warn("THREE.Box2: .getSize() target is now required"),e=new Je),this.isEmpty()?e.set(0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}containsPoint(e){return!(e.x<this.min.x||e.x>this.max.x||e.y<this.min.y||e.y>this.max.y)}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y}getParameter(e,t){return t===void 0&&(console.warn("THREE.Box2: .getParameter() target is now required"),t=new Je),t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y))}intersectsBox(e){return!(e.max.x<this.min.x||e.min.x>this.max.x||e.max.y<this.min.y||e.min.y>this.max.y)}clampPoint(e,t){return t===void 0&&(console.warn("THREE.Box2: .clampPoint() target is now required"),t=new Je),t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return jh.copy(e).clamp(this.min,this.max).sub(e).length()}intersect(e){return this.min.max(e.min),this.max.min(e.max),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}};Si.prototype.isBox2=!0;var Jh=new Y,Mo=new Y,_l=class{constructor(e=new Y,t=new Y){this.start=e,this.end=t}set(e,t){return this.start.copy(e),this.end.copy(t),this}copy(e){return this.start.copy(e.start),this.end.copy(e.end),this}getCenter(e){return e===void 0&&(console.warn("THREE.Line3: .getCenter() target is now required"),e=new Y),e.addVectors(this.start,this.end).multiplyScalar(.5)}delta(e){return e===void 0&&(console.warn("THREE.Line3: .delta() target is now required"),e=new Y),e.subVectors(this.end,this.start)}distanceSq(){return this.start.distanceToSquared(this.end)}distance(){return this.start.distanceTo(this.end)}at(e,t){return t===void 0&&(console.warn("THREE.Line3: .at() target is now required"),t=new Y),this.delta(t).multiplyScalar(e).add(this.start)}closestPointToPointParameter(e,t){Jh.subVectors(e,this.start),Mo.subVectors(this.end,this.start);let n=Mo.dot(Mo),r=Mo.dot(Jh)/n;return t&&(r=tn(r,0,1)),r}closestPointToPoint(e,t,n){let i=this.closestPointToPointParameter(e,t);return n===void 0&&(console.warn("THREE.Line3: .closestPointToPoint() target is now required"),n=new Y),this.delta(n).multiplyScalar(i).add(this.start)}applyMatrix4(e){return this.start.applyMatrix4(e),this.end.applyMatrix4(e),this}equals(e){return e.start.equals(this.start)&&e.end.equals(this.end)}clone(){return new this.constructor().copy(this)}},Sl=class extends Ct{constructor(e){super(),this.material=e,this.render=function(){},this.hasPositions=!1,this.hasNormals=!1,this.hasColors=!1,this.hasUvs=!1,this.positionArray=null,this.normalArray=null,this.colorArray=null,this.uvArray=null,this.count=0}};Sl.prototype.isImmediateRenderObject=!0;var $h=new Y,au=class extends Ct{constructor(e,t){super(),this.light=e,this.light.updateMatrixWorld(),this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1,this.color=t;let n=new _t,i=[0,0,0,0,0,1,0,0,0,1,0,1,0,0,0,-1,0,1,0,0,0,0,1,1,0,0,0,0,-1,1];for(let a=0,o=1,c=32;a<c;a++,o++){let l=a/c*Math.PI*2,h=o/c*Math.PI*2;i.push(Math.cos(l),Math.sin(l),1,Math.cos(h),Math.sin(h),1)}n.setAttribute("position",new dt(i,3));let r=new Zt({fog:!1,toneMapped:!1});this.cone=new on(n,r),this.add(this.cone),this.update()}dispose(){this.cone.geometry.dispose(),this.cone.material.dispose()}update(){this.light.updateMatrixWorld();let e=this.light.distance?this.light.distance:1e3,t=e*Math.tan(this.light.angle);this.cone.scale.set(t,t,e),$h.setFromMatrixPosition(this.light.target.matrixWorld),this.cone.lookAt($h),this.color!==void 0?this.cone.material.color.set(this.color):this.cone.material.color.copy(this.light.color)}},fi=new Y,_o=new bt,yc=new bt,Al=class extends on{constructor(e){let t=op(e),n=new _t,i=[],r=[],a=new ut(0,0,1),o=new ut(0,1,0);for(let l=0;l<t.length;l++){let h=t[l];h.parent&&h.parent.isBone&&(i.push(0,0,0),i.push(0,0,0),r.push(a.r,a.g,a.b),r.push(o.r,o.g,o.b))}n.setAttribute("position",new dt(i,3)),n.setAttribute("color",new dt(r,3));let c=new Zt({vertexColors:!0,depthTest:!1,depthWrite:!1,toneMapped:!1,transparent:!0});super(n,c),this.type="SkeletonHelper",this.isSkeletonHelper=!0,this.root=e,this.bones=t,this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1}updateMatrixWorld(e){let t=this.bones,n=this.geometry,i=n.getAttribute("position");yc.copy(this.root.matrixWorld).invert();for(let r=0,a=0;r<t.length;r++){let o=t[r];o.parent&&o.parent.isBone&&(_o.multiplyMatrices(yc,o.matrixWorld),fi.setFromMatrixPosition(_o),i.setXYZ(a,fi.x,fi.y,fi.z),_o.multiplyMatrices(yc,o.parent.matrixWorld),fi.setFromMatrixPosition(_o),i.setXYZ(a+1,fi.x,fi.y,fi.z),a+=2)}n.getAttribute("position").needsUpdate=!0,super.updateMatrixWorld(e)}};function op(s){let e=[];s&&s.isBone&&e.push(s);for(let t=0;t<s.children.length;t++)e.push.apply(e,op(s.children[t]));return e}var ou=class extends Ot{constructor(e,t,n){let i=new Xr(t,4,2),r=new Ln({wireframe:!0,fog:!1,toneMapped:!1});super(i,r),this.light=e,this.light.updateMatrixWorld(),this.color=n,this.type="PointLightHelper",this.matrix=this.light.matrixWorld,this.matrixAutoUpdate=!1,this.update()}dispose(){this.geometry.dispose(),this.material.dispose()}update(){this.color!==void 0?this.material.color.set(this.color):this.material.color.copy(this.light.color)}},qy=new Y,Kh=new ut,Qh=new ut,lu=class extends Ct{constructor(e,t,n){super(),this.light=e,this.light.updateMatrixWorld(),this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1,this.color=n;let i=new Hr(t);i.rotateY(Math.PI*.5),this.material=new Ln({wireframe:!0,fog:!1,toneMapped:!1}),this.color===void 0&&(this.material.vertexColors=!0);let r=i.getAttribute("position"),a=new Float32Array(r.count*3);i.setAttribute("color",new St(a,3)),this.add(new Ot(i,this.material)),this.update()}dispose(){this.children[0].geometry.dispose(),this.children[0].material.dispose()}update(){let e=this.children[0];if(this.color!==void 0)this.material.color.set(this.color);else{let t=e.geometry.getAttribute("color");Kh.copy(this.light.color),Qh.copy(this.light.groundColor);for(let n=0,i=t.count;n<i;n++){let r=n<i/2?Kh:Qh;t.setXYZ(n,r.r,r.g,r.b)}t.needsUpdate=!0}e.lookAt(qy.setFromMatrixPosition(this.light.matrixWorld).negate())}},Tl=class extends on{constructor(e=10,t=10,n=4473924,i=8947848){n=new ut(n),i=new ut(i);let r=t/2,a=e/t,o=e/2,c=[],l=[];for(let d=0,f=0,p=-o;d<=t;d++,p+=a){c.push(-o,0,p,o,0,p),c.push(p,0,-o,p,0,o);let y=d===r?n:i;y.toArray(l,f),f+=3,y.toArray(l,f),f+=3,y.toArray(l,f),f+=3,y.toArray(l,f),f+=3}let h=new _t;h.setAttribute("position",new dt(c,3)),h.setAttribute("color",new dt(l,3));let u=new Zt({vertexColors:!0,toneMapped:!1});super(h,u),this.type="GridHelper"}},cu=class extends on{constructor(e=10,t=16,n=8,i=64,r=4473924,a=8947848){r=new ut(r),a=new ut(a);let o=[],c=[];for(let u=0;u<=t;u++){let d=u/t*(Math.PI*2),f=Math.sin(d)*e,p=Math.cos(d)*e;o.push(0,0,0),o.push(f,0,p);let y=u&1?r:a;c.push(y.r,y.g,y.b),c.push(y.r,y.g,y.b)}for(let u=0;u<=n;u++){let d=u&1?r:a,f=e-e/n*u;for(let p=0;p<i;p++){let y=p/i*(Math.PI*2),x=Math.sin(y)*f,v=Math.cos(y)*f;o.push(x,0,v),c.push(d.r,d.g,d.b),y=(p+1)/i*(Math.PI*2),x=Math.sin(y)*f,v=Math.cos(y)*f,o.push(x,0,v),c.push(d.r,d.g,d.b)}}let l=new _t;l.setAttribute("position",new dt(o,3)),l.setAttribute("color",new dt(c,3));let h=new Zt({vertexColors:!0,toneMapped:!1});super(l,h),this.type="PolarGridHelper"}},ed=new Y,So=new Y,td=new Y,uu=class extends Ct{constructor(e,t,n){super(),this.light=e,this.light.updateMatrixWorld(),this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1,this.color=n,t===void 0&&(t=1);let i=new _t;i.setAttribute("position",new dt([-t,t,0,t,t,0,t,-t,0,-t,-t,0,-t,t,0],3));let r=new Zt({fog:!1,toneMapped:!1});this.lightPlane=new zn(i,r),this.add(this.lightPlane),i=new _t,i.setAttribute("position",new dt([0,0,0,0,0,1],3)),this.targetLine=new zn(i,r),this.add(this.targetLine),this.update()}dispose(){this.lightPlane.geometry.dispose(),this.lightPlane.material.dispose(),this.targetLine.geometry.dispose(),this.targetLine.material.dispose()}update(){ed.setFromMatrixPosition(this.light.matrixWorld),So.setFromMatrixPosition(this.light.target.matrixWorld),td.subVectors(So,ed),this.lightPlane.lookAt(So),this.color!==void 0?(this.lightPlane.material.color.set(this.color),this.targetLine.material.color.set(this.color)):(this.lightPlane.material.color.copy(this.light.color),this.targetLine.material.color.copy(this.light.color)),this.targetLine.lookAt(So),this.targetLine.scale.z=td.length()}},Ao=new Y,Ut=new Gi,hu=class extends on{constructor(e){let t=new _t,n=new Zt({color:16777215,vertexColors:!0,toneMapped:!1}),i=[],r=[],a={},o=new ut(16755200),c=new ut(16711680),l=new ut(43775),h=new ut(16777215),u=new ut(3355443);d("n1","n2",o),d("n2","n4",o),d("n4","n3",o),d("n3","n1",o),d("f1","f2",o),d("f2","f4",o),d("f4","f3",o),d("f3","f1",o),d("n1","f1",o),d("n2","f2",o),d("n3","f3",o),d("n4","f4",o),d("p","n1",c),d("p","n2",c),d("p","n3",c),d("p","n4",c),d("u1","u2",l),d("u2","u3",l),d("u3","u1",l),d("c","t",h),d("p","c",u),d("cn1","cn2",u),d("cn3","cn4",u),d("cf1","cf2",u),d("cf3","cf4",u);function d(p,y,x){f(p,x),f(y,x)}function f(p,y){i.push(0,0,0),r.push(y.r,y.g,y.b),a[p]===void 0&&(a[p]=[]),a[p].push(i.length/3-1)}t.setAttribute("position",new dt(i,3)),t.setAttribute("color",new dt(r,3)),super(t,n),this.type="CameraHelper",this.camera=e,this.camera.updateProjectionMatrix&&this.camera.updateProjectionMatrix(),this.matrix=e.matrixWorld,this.matrixAutoUpdate=!1,this.pointMap=a,this.update()}update(){let e=this.geometry,t=this.pointMap,n=1,i=1;Ut.projectionMatrixInverse.copy(this.camera.projectionMatrixInverse),Wt("c",t,e,Ut,0,0,-1),Wt("t",t,e,Ut,0,0,1),Wt("n1",t,e,Ut,-n,-i,-1),Wt("n2",t,e,Ut,n,-i,-1),Wt("n3",t,e,Ut,-n,i,-1),Wt("n4",t,e,Ut,n,i,-1),Wt("f1",t,e,Ut,-n,-i,1),Wt("f2",t,e,Ut,n,-i,1),Wt("f3",t,e,Ut,-n,i,1),Wt("f4",t,e,Ut,n,i,1),Wt("u1",t,e,Ut,n*.7,i*1.1,-1),Wt("u2",t,e,Ut,-n*.7,i*1.1,-1),Wt("u3",t,e,Ut,0,i*2,-1),Wt("cf1",t,e,Ut,-n,0,1),Wt("cf2",t,e,Ut,n,0,1),Wt("cf3",t,e,Ut,0,-i,1),Wt("cf4",t,e,Ut,0,i,1),Wt("cn1",t,e,Ut,-n,0,-1),Wt("cn2",t,e,Ut,n,0,-1),Wt("cn3",t,e,Ut,0,-i,-1),Wt("cn4",t,e,Ut,0,i,-1),e.getAttribute("position").needsUpdate=!0}dispose(){this.geometry.dispose(),this.material.dispose()}};function Wt(s,e,t,n,i,r,a){Ao.set(i,r,a).unproject(n);let o=e[s];if(o!==void 0){let c=t.getAttribute("position");for(let l=0,h=o.length;l<h;l++)c.setXYZ(o[l],Ao.x,Ao.y,Ao.z)}}var To=new sn,El=class extends on{constructor(e,t=16776960){let n=new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]),i=new Float32Array(24),r=new _t;r.setIndex(new St(n,1)),r.setAttribute("position",new St(i,3)),super(r,new Zt({color:t,toneMapped:!1})),this.object=e,this.type="BoxHelper",this.matrixAutoUpdate=!1,this.update()}update(e){if(e!==void 0&&console.warn("THREE.BoxHelper: .update() has no longer arguments."),this.object!==void 0&&To.setFromObject(this.object),To.isEmpty())return;let t=To.min,n=To.max,i=this.geometry.attributes.position,r=i.array;r[0]=n.x,r[1]=n.y,r[2]=n.z,r[3]=t.x,r[4]=n.y,r[5]=n.z,r[6]=t.x,r[7]=t.y,r[8]=n.z,r[9]=n.x,r[10]=t.y,r[11]=n.z,r[12]=n.x,r[13]=n.y,r[14]=t.z,r[15]=t.x,r[16]=n.y,r[17]=t.z,r[18]=t.x,r[19]=t.y,r[20]=t.z,r[21]=n.x,r[22]=t.y,r[23]=t.z,i.needsUpdate=!0,this.geometry.computeBoundingSphere()}setFromObject(e){return this.object=e,this.update(),this}copy(e){return on.prototype.copy.call(this,e),this.object=e.object,this}},du=class extends on{constructor(e,t=16776960){let n=new Uint16Array([0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,4,1,5,2,6,3,7]),i=[1,1,1,-1,1,1,-1,-1,1,1,-1,1,1,1,-1,-1,1,-1,-1,-1,-1,1,-1,-1],r=new _t;r.setIndex(new St(n,1)),r.setAttribute("position",new dt(i,3)),super(r,new Zt({color:t,toneMapped:!1})),this.box=e,this.type="Box3Helper",this.geometry.computeBoundingSphere()}updateMatrixWorld(e){let t=this.box;t.isEmpty()||(t.getCenter(this.position),t.getSize(this.scale),this.scale.multiplyScalar(.5),super.updateMatrixWorld(e))}},fu=class extends zn{constructor(e,t=1,n=16776960){let i=n,r=[1,-1,1,-1,1,1,-1,-1,1,1,1,1,-1,1,1,-1,-1,1,1,-1,1,1,1,1,0,0,1,0,0,0],a=new _t;a.setAttribute("position",new dt(r,3)),a.computeBoundingSphere(),super(a,new Zt({color:i,toneMapped:!1})),this.type="PlaneHelper",this.plane=e,this.size=t;let o=[1,1,1,-1,1,1,-1,-1,1,1,1,1,-1,-1,1,1,-1,1],c=new _t;c.setAttribute("position",new dt(o,3)),c.computeBoundingSphere(),this.add(new Ot(c,new Ln({color:i,opacity:.2,transparent:!0,depthWrite:!1,toneMapped:!1})))}updateMatrixWorld(e){let t=-this.plane.constant;Math.abs(t)<1e-8&&(t=1e-8),this.scale.set(.5*this.size,.5*this.size,t),this.children[0].material.side=t<0?Ht:Kr,this.lookAt(this.plane.normal),super.updateMatrixWorld(e)}},nd=new Y,Eo,bc,pu=class extends Ct{constructor(e=new Y(0,0,1),t=new Y(0,0,0),n=1,i=16776960,r=n*.2,a=r*.2){super(),this.type="ArrowHelper",Eo===void 0&&(Eo=new _t,Eo.setAttribute("position",new dt([0,0,0,0,1,0],3)),bc=new Hi(0,.5,1,5,1),bc.translate(0,-.5,0)),this.position.copy(t),this.line=new zn(Eo,new Zt({color:i,toneMapped:!1})),this.line.matrixAutoUpdate=!1,this.add(this.line),this.cone=new Ot(bc,new Ln({color:i,toneMapped:!1})),this.cone.matrixAutoUpdate=!1,this.add(this.cone),this.setDirection(e),this.setLength(n,r,a)}setDirection(e){if(e.y>.99999)this.quaternion.set(0,0,0,1);else if(e.y<-.99999)this.quaternion.set(1,0,0,0);else{nd.set(e.z,0,-e.x).normalize();let t=Math.acos(e.y);this.quaternion.setFromAxisAngle(nd,t)}}setLength(e,t=e*.2,n=t*.2){this.line.scale.set(1,Math.max(1e-4,e-t),1),this.line.updateMatrix(),this.cone.scale.set(n,t,n),this.cone.position.y=e,this.cone.updateMatrix()}setColor(e){this.line.material.color.set(e),this.cone.material.color.set(e)}copy(e){return super.copy(e,!1),this.line.copy(e.line),this.cone.copy(e.cone),this}},Cl=class extends on{constructor(e=1){let t=[0,0,0,e,0,0,0,0,0,0,e,0,0,0,0,0,0,e],n=[1,0,0,1,.6,0,0,1,0,.6,1,0,0,0,1,0,.6,1],i=new _t;i.setAttribute("position",new dt(t,3)),i.setAttribute("color",new dt(n,3));let r=new Zt({vertexColors:!0,toneMapped:!1});super(i,r),this.type="AxesHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}},lp=new Float32Array(1),Xy=new Int32Array(lp.buffer),mu=class{static toHalfFloat(e){lp[0]=e;let t=Xy[0],n=t>>16&32768,i=t>>12&2047,r=t>>23&255;return r<103?n:r>142?(n|=31744,n|=(r==255?0:1)&&t&8388607,n):r<113?(i|=2048,n|=(i>>114-r)+(i>>113-r&1),n):(n|=r-112<<10|i>>1,n+=i&1,n)}},Er=4,gi=8,Fn=Math.pow(2,gi),cp=[.125,.215,.35,.446,.526,.582],up=gi-Er+1+cp.length,wr=20,Bn={[hn]:0,[Ba]:1,[zl]:2,[_u]:3,[Su]:4,[Au]:5,[Rl]:6},zi=new Ln({side:Ht,depthWrite:!1,depthTest:!1}),Yy=new Ot(new vi,zi),wc=new Ki,{_lodPlanes:ms,_sizeLods:id,_sigmas:Co}=jy(),rd=new ut,Mc=null,Di=(1+Math.sqrt(5))/2,Mr=1/Di,sd=[new Y(1,1,1),new Y(-1,1,1),new Y(1,1,-1),new Y(-1,1,-1),new Y(0,Di,Mr),new Y(0,Di,-Mr),new Y(Mr,0,Di),new Y(-Mr,0,Di),new Y(Di,Mr,0),new Y(-Di,Mr,0)];function ad(s){let e=Math.max(s.r,s.g,s.b),t=Math.min(Math.max(Math.ceil(Math.log2(e)),-128),127);return s.multiplyScalar(Math.pow(2,-t)),(t+128)/255}var gu=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._blurMaterial=Jy(wr),this._equirectShader=null,this._cubemapShader=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,i=100){Mc=this._renderer.getRenderTarget();let r=this._allocateTargets();return this._sceneToCubeUV(e,n,i,r),t>0&&this._blur(r,0,0,t),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(e){return this._fromTexture(e)}fromCubemap(e){return this._fromTexture(e)}compileCubemapShader(){this._cubemapShader===null&&(this._cubemapShader=cd(),this._compileMaterial(this._cubemapShader))}compileEquirectangularShader(){this._equirectShader===null&&(this._equirectShader=ld(),this._compileMaterial(this._equirectShader))}dispose(){this._blurMaterial.dispose(),this._cubemapShader!==null&&this._cubemapShader.dispose(),this._equirectShader!==null&&this._equirectShader.dispose();for(let e=0;e<ms.length;e++)ms[e].dispose()}_cleanup(e){this._pingPongRenderTarget.dispose(),this._renderer.setRenderTarget(Mc),e.scissorTest=!1,Po(e,0,0,e.width,e.height)}_fromTexture(e){Mc=this._renderer.getRenderTarget();let t=this._allocateTargets(e);return this._textureToCubeUV(e,t),this._applyPMREM(t),this._cleanup(t),t}_allocateTargets(e){let t={magFilter:jt,minFilter:jt,generateMipmaps:!1,type:ts,format:Zd,encoding:Zy(e)?e.encoding:zl,depthBuffer:!1},n=od(t);return n.depthBuffer=!e,this._pingPongRenderTarget=od(t),n}_compileMaterial(e){let t=new Ot(ms[0],e);this._renderer.compile(t,wc)}_sceneToCubeUV(e,t,n,i){let o=new qt(90,1,t,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],h=this._renderer,u=h.autoClear,d=h.outputEncoding,f=h.toneMapping;h.getClearColor(rd),h.toneMapping=ki,h.outputEncoding=hn,h.autoClear=!1;let p=!1,y=e.background;if(y){if(y.isColor){zi.color.copy(y).convertSRGBToLinear(),e.background=null;let x=ad(zi.color);zi.opacity=x,p=!0}}else{zi.color.copy(rd).convertSRGBToLinear();let x=ad(zi.color);zi.opacity=x,p=!0}for(let x=0;x<6;x++){let v=x%3;v==0?(o.up.set(0,c[x],0),o.lookAt(l[x],0,0)):v==1?(o.up.set(0,0,c[x]),o.lookAt(0,l[x],0)):(o.up.set(0,c[x],0),o.lookAt(0,0,l[x])),Po(i,v*Fn,x>2?Fn:0,Fn,Fn),h.setRenderTarget(i),p&&h.render(Yy,o),h.render(e,o)}h.toneMapping=f,h.outputEncoding=d,h.autoClear=u}_textureToCubeUV(e,t){let n=this._renderer;e.isCubeTexture?this._cubemapShader==null&&(this._cubemapShader=cd()):this._equirectShader==null&&(this._equirectShader=ld());let i=e.isCubeTexture?this._cubemapShader:this._equirectShader,r=new Ot(ms[0],i),a=i.uniforms;a.envMap.value=e,e.isCubeTexture||a.texelSize.value.set(1/e.image.width,1/e.image.height),a.inputEncoding.value=Bn[e.encoding],a.outputEncoding.value=Bn[t.texture.encoding],Po(t,0,0,3*Fn,2*Fn),n.setRenderTarget(t),n.render(r,wc)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;for(let i=1;i<up;i++){let r=Math.sqrt(Co[i]*Co[i]-Co[i-1]*Co[i-1]),a=sd[(i-1)%sd.length];this._blur(e,i-1,i,r,a)}t.autoClear=n}_blur(e,t,n,i,r){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,i,"latitudinal",r),this._halfBlur(a,e,n,n,i,"longitudinal",r)}_halfBlur(e,t,n,i,r,a,o){let c=this._renderer,l=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new Ot(ms[i],l),d=l.uniforms,f=id[n]-1,p=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*wr-1),y=r/p,x=isFinite(r)?1+Math.floor(h*y):wr;x>wr&&console.warn(\`sigmaRadians, \${r}, is too large and will clip, as it requested \${x} samples when the maximum is set to \${wr}\`);let v=[],g=0;for(let b=0;b<wr;++b){let F=b/y,L=Math.exp(-F*F/2);v.push(L),b==0?g+=L:b<x&&(g+=2*L)}for(let b=0;b<v.length;b++)v[b]=v[b]/g;d.envMap.value=e.texture,d.samples.value=x,d.weights.value=v,d.latitudinal.value=a==="latitudinal",o&&(d.poleAxis.value=o),d.dTheta.value=p,d.mipInt.value=gi-n,d.inputEncoding.value=Bn[e.texture.encoding],d.outputEncoding.value=Bn[e.texture.encoding];let m=id[i],S=3*Math.max(0,Fn-2*m),w=(i===0?0:2*Fn)+2*m*(i>gi-Er?i-gi+Er:0);Po(t,S,w,3*m,2*m),c.setRenderTarget(t),c.render(u,wc)}};function Zy(s){return s===void 0||s.type!==ts?!1:s.encoding===hn||s.encoding===Ba||s.encoding===Rl}function jy(){let s=[],e=[],t=[],n=gi;for(let i=0;i<up;i++){let r=Math.pow(2,n);e.push(r);let a=1/r;i>gi-Er?a=cp[i-gi+Er-1]:i==0&&(a=0),t.push(a);let o=1/(r-1),c=-o/2,l=1+o/2,h=[c,c,l,c,l,l,c,c,l,l,c,l],u=6,d=6,f=3,p=2,y=1,x=new Float32Array(f*d*u),v=new Float32Array(p*d*u),g=new Float32Array(y*d*u);for(let S=0;S<u;S++){let w=S%3*2/3-1,b=S>2?0:-1,F=[w,b,0,w+2/3,b,0,w+2/3,b+1,0,w,b,0,w+2/3,b+1,0,w,b+1,0];x.set(F,f*d*S),v.set(h,p*d*S);let L=[S,S,S,S,S,S];g.set(L,y*d*S)}let m=new _t;m.setAttribute("position",new St(x,f)),m.setAttribute("uv",new St(v,p)),m.setAttribute("faceIndex",new St(g,y)),s.push(m),n>Er&&n--}return{_lodPlanes:s,_sizeLods:e,_sigmas:t}}function od(s){let e=new Pn(3*Fn,3*Fn,s);return e.texture.mapping=Qr,e.texture.name="PMREM.cubeUv",e.scissorTest=!0,e}function Po(s,e,t,n,i){s.viewport.set(e,t,n,i),s.scissor.set(e,t,n,i)}function Jy(s){let e=new Float32Array(s),t=new Y(0,1,0);return new Mi({name:"SphericalGaussianBlur",defines:{n:s},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:e},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:t},inputEncoding:{value:Bn[hn]},outputEncoding:{value:Bn[hn]}},vertexShader:Ru(),fragmentShader:\`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			\${zu()}

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

				gl_FragColor = linearToOutputTexel( gl_FragColor );

			}
		\`,blending:Kn,depthTest:!1,depthWrite:!1})}function ld(){let s=new Je(1,1);return new Mi({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null},texelSize:{value:s},inputEncoding:{value:Bn[hn]},outputEncoding:{value:Bn[hn]}},vertexShader:Ru(),fragmentShader:\`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform vec2 texelSize;

			\${zu()}

			#include <common>

			void main() {

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				vec2 f = fract( uv / texelSize - 0.5 );
				uv -= f * texelSize;
				vec3 tl = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
				uv.x += texelSize.x;
				vec3 tr = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
				uv.y += texelSize.y;
				vec3 br = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
				uv.x -= texelSize.x;
				vec3 bl = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;

				vec3 tm = mix( tl, tr, f.x );
				vec3 bm = mix( bl, br, f.x );
				gl_FragColor.rgb = mix( tm, bm, f.y );

				gl_FragColor = linearToOutputTexel( gl_FragColor );

			}
		\`,blending:Kn,depthTest:!1,depthWrite:!1})}function cd(){return new Mi({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},inputEncoding:{value:Bn[hn]},outputEncoding:{value:Bn[hn]}},vertexShader:Ru(),fragmentShader:\`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			\${zu()}

			void main() {

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb = envMapTexelToLinear( textureCube( envMap, vec3( - vOutputDirection.x, vOutputDirection.yz ) ) ).rgb;
				gl_FragColor = linearToOutputTexel( gl_FragColor );

			}
		\`,blending:Kn,depthTest:!1,depthWrite:!1})}function Ru(){return\`

		precision mediump float;
		precision mediump int;

		attribute vec3 position;
		attribute vec2 uv;
		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	\`}function zu(){return\`

		uniform int inputEncoding;
		uniform int outputEncoding;

		#include <encodings_pars_fragment>

		vec4 inputTexelToLinear( vec4 value ) {

			if ( inputEncoding == 0 ) {

				return value;

			} else if ( inputEncoding == 1 ) {

				return sRGBToLinear( value );

			} else if ( inputEncoding == 2 ) {

				return RGBEToLinear( value );

			} else if ( inputEncoding == 3 ) {

				return RGBMToLinear( value, 7.0 );

			} else if ( inputEncoding == 4 ) {

				return RGBMToLinear( value, 16.0 );

			} else if ( inputEncoding == 5 ) {

				return RGBDToLinear( value, 256.0 );

			} else {

				return GammaToLinear( value, 2.2 );

			}

		}

		vec4 linearToOutputTexel( vec4 value ) {

			if ( outputEncoding == 0 ) {

				return value;

			} else if ( outputEncoding == 1 ) {

				return LinearTosRGB( value );

			} else if ( outputEncoding == 2 ) {

				return LinearToRGBE( value );

			} else if ( outputEncoding == 3 ) {

				return LinearToRGBM( value, 7.0 );

			} else if ( outputEncoding == 4 ) {

				return LinearToRGBM( value, 16.0 );

			} else if ( outputEncoding == 5 ) {

				return LinearToRGBD( value, 256.0 );

			} else {

				return LinearToGamma( value, 2.2 );

			}

		}

		vec4 envMapTexelToLinear( vec4 color ) {

			return inputTexelToLinear( color );

		}
	\`}var $y=0,Ky=1,Qy=0,e1=1,t1=2;function n1(s){return console.warn("THREE.MeshFaceMaterial has been removed. Use an Array instead."),s}function i1(s=[]){return console.warn("THREE.MultiMaterial has been removed. Use an Array instead."),s.isMultiMaterial=!0,s.materials=s,s.clone=function(){return s.slice()},s}function r1(s,e){return console.warn("THREE.PointCloud has been renamed to THREE.Points."),new Vi(s,e)}function s1(s){return console.warn("THREE.Particle has been renamed to THREE.Sprite."),new Gr(s)}function a1(s,e){return console.warn("THREE.ParticleSystem has been renamed to THREE.Points."),new Vi(s,e)}function o1(s){return console.warn("THREE.PointCloudMaterial has been renamed to THREE.PointsMaterial."),new ti(s)}function l1(s){return console.warn("THREE.ParticleBasicMaterial has been renamed to THREE.PointsMaterial."),new ti(s)}function c1(s){return console.warn("THREE.ParticleSystemMaterial has been renamed to THREE.PointsMaterial."),new ti(s)}function u1(s,e,t){return console.warn("THREE.Vertex has been removed. Use THREE.Vector3 instead."),new Y(s,e,t)}function h1(s,e){return console.warn("THREE.DynamicBufferAttribute has been removed. Use new THREE.BufferAttribute().setUsage( THREE.DynamicDrawUsage ) instead."),new St(s,e).setUsage(Lr)}function d1(s,e){return console.warn("THREE.Int8Attribute has been removed. Use new THREE.Int8BufferAttribute() instead."),new No(s,e)}function f1(s,e){return console.warn("THREE.Uint8Attribute has been removed. Use new THREE.Uint8BufferAttribute() instead."),new Uo(s,e)}function p1(s,e){return console.warn("THREE.Uint8ClampedAttribute has been removed. Use new THREE.Uint8ClampedBufferAttribute() instead."),new Oo(s,e)}function m1(s,e){return console.warn("THREE.Int16Attribute has been removed. Use new THREE.Int16BufferAttribute() instead."),new Go(s,e)}function g1(s,e){return console.warn("THREE.Uint16Attribute has been removed. Use new THREE.Uint16BufferAttribute() instead."),new Rr(s,e)}function v1(s,e){return console.warn("THREE.Int32Attribute has been removed. Use new THREE.Int32BufferAttribute() instead."),new Wo(s,e)}function x1(s,e){return console.warn("THREE.Uint32Attribute has been removed. Use new THREE.Uint32BufferAttribute() instead."),new zr(s,e)}function y1(s,e){return console.warn("THREE.Float32Attribute has been removed. Use new THREE.Float32BufferAttribute() instead."),new dt(s,e)}function b1(s,e){return console.warn("THREE.Float64Attribute has been removed. Use new THREE.Float64BufferAttribute() instead."),new Ho(s,e)}fn.create=function(s,e){return console.log("THREE.Curve.create() has been deprecated"),s.prototype=Object.create(fn.prototype),s.prototype.constructor=s,s.prototype.getPoint=e,s};$i.prototype.fromPoints=function(s){return console.warn("THREE.Path: .fromPoints() has been renamed to .setFromPoints()."),this.setFromPoints(s)};function w1(s){return console.warn("THREE.AxisHelper has been renamed to THREE.AxesHelper."),new Cl(s)}function M1(s,e){return console.warn("THREE.BoundingBoxHelper has been deprecated. Creating a THREE.BoxHelper instead."),new El(s,e)}function _1(s,e){return console.warn("THREE.EdgesHelper has been removed. Use THREE.EdgesGeometry instead."),new on(new Vs(s.geometry),new Zt({color:e!==void 0?e:16777215}))}Tl.prototype.setColors=function(){console.error("THREE.GridHelper: setColors() has been deprecated, pass them in the constructor instead.")};Al.prototype.update=function(){console.error("THREE.SkeletonHelper: update() no longer needs to be called.")};function S1(s,e){return console.warn("THREE.WireframeHelper has been removed. Use THREE.WireframeGeometry instead."),new on(new na(s.geometry),new Zt({color:e!==void 0?e:16777215}))}Qt.prototype.extractUrlBase=function(s){return console.warn("THREE.Loader: .extractUrlBase() has been deprecated. Use THREE.LoaderUtils.extractUrlBase() instead."),Ta.extractUrlBase(s)};Qt.Handlers={add:function(){console.error("THREE.Loader: Handlers.add() has been removed. Use LoadingManager.addHandler() instead.")},get:function(){console.error("THREE.Loader: Handlers.get() has been removed. Use LoadingManager.getHandler() instead.")}};function A1(s){return console.warn("THREE.XHRLoader has been renamed to THREE.FileLoader."),new _n(s)}function T1(s){return console.warn("THREE.BinaryTextureLoader has been renamed to THREE.DataTextureLoader."),new tl(s)}Si.prototype.center=function(s){return console.warn("THREE.Box2: .center() has been renamed to .getCenter()."),this.getCenter(s)};Si.prototype.empty=function(){return console.warn("THREE.Box2: .empty() has been renamed to .isEmpty()."),this.isEmpty()};Si.prototype.isIntersectionBox=function(s){return console.warn("THREE.Box2: .isIntersectionBox() has been renamed to .intersectsBox()."),this.intersectsBox(s)};Si.prototype.size=function(s){return console.warn("THREE.Box2: .size() has been renamed to .getSize()."),this.getSize(s)};sn.prototype.center=function(s){return console.warn("THREE.Box3: .center() has been renamed to .getCenter()."),this.getCenter(s)};sn.prototype.empty=function(){return console.warn("THREE.Box3: .empty() has been renamed to .isEmpty()."),this.isEmpty()};sn.prototype.isIntersectionBox=function(s){return console.warn("THREE.Box3: .isIntersectionBox() has been renamed to .intersectsBox()."),this.intersectsBox(s)};sn.prototype.isIntersectionSphere=function(s){return console.warn("THREE.Box3: .isIntersectionSphere() has been renamed to .intersectsSphere()."),this.intersectsSphere(s)};sn.prototype.size=function(s){return console.warn("THREE.Box3: .size() has been renamed to .getSize()."),this.getSize(s)};On.prototype.empty=function(){return console.warn("THREE.Sphere: .empty() has been renamed to .isEmpty()."),this.isEmpty()};Wi.prototype.setFromMatrix=function(s){return console.warn("THREE.Frustum: .setFromMatrix() has been renamed to .setFromProjectionMatrix()."),this.setFromProjectionMatrix(s)};_l.prototype.center=function(s){return console.warn("THREE.Line3: .center() has been renamed to .getCenter()."),this.getCenter(s)};Vt.prototype.flattenToArrayOffset=function(s,e){return console.warn("THREE.Matrix3: .flattenToArrayOffset() has been deprecated. Use .toArray() instead."),this.toArray(s,e)};Vt.prototype.multiplyVector3=function(s){return console.warn("THREE.Matrix3: .multiplyVector3() has been removed. Use vector.applyMatrix3( matrix ) instead."),s.applyMatrix3(this)};Vt.prototype.multiplyVector3Array=function(){console.error("THREE.Matrix3: .multiplyVector3Array() has been removed.")};Vt.prototype.applyToBufferAttribute=function(s){return console.warn("THREE.Matrix3: .applyToBufferAttribute() has been removed. Use attribute.applyMatrix3( matrix ) instead."),s.applyMatrix3(this)};Vt.prototype.applyToVector3Array=function(){console.error("THREE.Matrix3: .applyToVector3Array() has been removed.")};Vt.prototype.getInverse=function(s){return console.warn("THREE.Matrix3: .getInverse() has been removed. Use matrixInv.copy( matrix ).invert(); instead."),this.copy(s).invert()};bt.prototype.extractPosition=function(s){return console.warn("THREE.Matrix4: .extractPosition() has been renamed to .copyPosition()."),this.copyPosition(s)};bt.prototype.flattenToArrayOffset=function(s,e){return console.warn("THREE.Matrix4: .flattenToArrayOffset() has been deprecated. Use .toArray() instead."),this.toArray(s,e)};bt.prototype.getPosition=function(){return console.warn("THREE.Matrix4: .getPosition() has been removed. Use Vector3.setFromMatrixPosition( matrix ) instead."),new Y().setFromMatrixColumn(this,3)};bt.prototype.setRotationFromQuaternion=function(s){return console.warn("THREE.Matrix4: .setRotationFromQuaternion() has been renamed to .makeRotationFromQuaternion()."),this.makeRotationFromQuaternion(s)};bt.prototype.multiplyToArray=function(){console.warn("THREE.Matrix4: .multiplyToArray() has been removed.")};bt.prototype.multiplyVector3=function(s){return console.warn("THREE.Matrix4: .multiplyVector3() has been removed. Use vector.applyMatrix4( matrix ) instead."),s.applyMatrix4(this)};bt.prototype.multiplyVector4=function(s){return console.warn("THREE.Matrix4: .multiplyVector4() has been removed. Use vector.applyMatrix4( matrix ) instead."),s.applyMatrix4(this)};bt.prototype.multiplyVector3Array=function(){console.error("THREE.Matrix4: .multiplyVector3Array() has been removed.")};bt.prototype.rotateAxis=function(s){console.warn("THREE.Matrix4: .rotateAxis() has been removed. Use Vector3.transformDirection( matrix ) instead."),s.transformDirection(this)};bt.prototype.crossVector=function(s){return console.warn("THREE.Matrix4: .crossVector() has been removed. Use vector.applyMatrix4( matrix ) instead."),s.applyMatrix4(this)};bt.prototype.translate=function(){console.error("THREE.Matrix4: .translate() has been removed.")};bt.prototype.rotateX=function(){console.error("THREE.Matrix4: .rotateX() has been removed.")};bt.prototype.rotateY=function(){console.error("THREE.Matrix4: .rotateY() has been removed.")};bt.prototype.rotateZ=function(){console.error("THREE.Matrix4: .rotateZ() has been removed.")};bt.prototype.rotateByAxis=function(){console.error("THREE.Matrix4: .rotateByAxis() has been removed.")};bt.prototype.applyToBufferAttribute=function(s){return console.warn("THREE.Matrix4: .applyToBufferAttribute() has been removed. Use attribute.applyMatrix4( matrix ) instead."),s.applyMatrix4(this)};bt.prototype.applyToVector3Array=function(){console.error("THREE.Matrix4: .applyToVector3Array() has been removed.")};bt.prototype.makeFrustum=function(s,e,t,n,i,r){return console.warn("THREE.Matrix4: .makeFrustum() has been removed. Use .makePerspective( left, right, top, bottom, near, far ) instead."),this.makePerspective(s,e,n,t,i,r)};bt.prototype.getInverse=function(s){return console.warn("THREE.Matrix4: .getInverse() has been removed. Use matrixInv.copy( matrix ).invert(); instead."),this.copy(s).invert()};vn.prototype.isIntersectionLine=function(s){return console.warn("THREE.Plane: .isIntersectionLine() has been renamed to .intersectsLine()."),this.intersectsLine(s)};Xt.prototype.multiplyVector3=function(s){return console.warn("THREE.Quaternion: .multiplyVector3() has been removed. Use is now vector.applyQuaternion( quaternion ) instead."),s.applyQuaternion(this)};Xt.prototype.inverse=function(){return console.warn("THREE.Quaternion: .inverse() has been renamed to invert()."),this.invert()};Gn.prototype.isIntersectionBox=function(s){return console.warn("THREE.Ray: .isIntersectionBox() has been renamed to .intersectsBox()."),this.intersectsBox(s)};Gn.prototype.isIntersectionPlane=function(s){return console.warn("THREE.Ray: .isIntersectionPlane() has been renamed to .intersectsPlane()."),this.intersectsPlane(s)};Gn.prototype.isIntersectionSphere=function(s){return console.warn("THREE.Ray: .isIntersectionSphere() has been renamed to .intersectsSphere()."),this.intersectsSphere(s)};nn.prototype.area=function(){return console.warn("THREE.Triangle: .area() has been renamed to .getArea()."),this.getArea()};nn.prototype.barycoordFromPoint=function(s,e){return console.warn("THREE.Triangle: .barycoordFromPoint() has been renamed to .getBarycoord()."),this.getBarycoord(s,e)};nn.prototype.midpoint=function(s){return console.warn("THREE.Triangle: .midpoint() has been renamed to .getMidpoint()."),this.getMidpoint(s)};nn.prototypenormal=function(s){return console.warn("THREE.Triangle: .normal() has been renamed to .getNormal()."),this.getNormal(s)};nn.prototype.plane=function(s){return console.warn("THREE.Triangle: .plane() has been renamed to .getPlane()."),this.getPlane(s)};nn.barycoordFromPoint=function(s,e,t,n,i){return console.warn("THREE.Triangle: .barycoordFromPoint() has been renamed to .getBarycoord()."),nn.getBarycoord(s,e,t,n,i)};nn.normal=function(s,e,t,n){return console.warn("THREE.Triangle: .normal() has been renamed to .getNormal()."),nn.getNormal(s,e,t,n)};Nn.prototype.extractAllPoints=function(s){return console.warn("THREE.Shape: .extractAllPoints() has been removed. Use .extractPoints() instead."),this.extractPoints(s)};Nn.prototype.extrude=function(s){return console.warn("THREE.Shape: .extrude() has been removed. Use ExtrudeGeometry() instead."),new Wn(this,s)};Nn.prototype.makeGeometry=function(s){return console.warn("THREE.Shape: .makeGeometry() has been removed. Use ShapeGeometry() instead."),new qr(this,s)};Je.prototype.fromAttribute=function(s,e,t){return console.warn("THREE.Vector2: .fromAttribute() has been renamed to .fromBufferAttribute()."),this.fromBufferAttribute(s,e,t)};Je.prototype.distanceToManhattan=function(s){return console.warn("THREE.Vector2: .distanceToManhattan() has been renamed to .manhattanDistanceTo()."),this.manhattanDistanceTo(s)};Je.prototype.lengthManhattan=function(){return console.warn("THREE.Vector2: .lengthManhattan() has been renamed to .manhattanLength()."),this.manhattanLength()};Y.prototype.setEulerFromRotationMatrix=function(){console.error("THREE.Vector3: .setEulerFromRotationMatrix() has been removed. Use Euler.setFromRotationMatrix() instead.")};Y.prototype.setEulerFromQuaternion=function(){console.error("THREE.Vector3: .setEulerFromQuaternion() has been removed. Use Euler.setFromQuaternion() instead.")};Y.prototype.getPositionFromMatrix=function(s){return console.warn("THREE.Vector3: .getPositionFromMatrix() has been renamed to .setFromMatrixPosition()."),this.setFromMatrixPosition(s)};Y.prototype.getScaleFromMatrix=function(s){return console.warn("THREE.Vector3: .getScaleFromMatrix() has been renamed to .setFromMatrixScale()."),this.setFromMatrixScale(s)};Y.prototype.getColumnFromMatrix=function(s,e){return console.warn("THREE.Vector3: .getColumnFromMatrix() has been renamed to .setFromMatrixColumn()."),this.setFromMatrixColumn(e,s)};Y.prototype.applyProjection=function(s){return console.warn("THREE.Vector3: .applyProjection() has been removed. Use .applyMatrix4( m ) instead."),this.applyMatrix4(s)};Y.prototype.fromAttribute=function(s,e,t){return console.warn("THREE.Vector3: .fromAttribute() has been renamed to .fromBufferAttribute()."),this.fromBufferAttribute(s,e,t)};Y.prototype.distanceToManhattan=function(s){return console.warn("THREE.Vector3: .distanceToManhattan() has been renamed to .manhattanDistanceTo()."),this.manhattanDistanceTo(s)};Y.prototype.lengthManhattan=function(){return console.warn("THREE.Vector3: .lengthManhattan() has been renamed to .manhattanLength()."),this.manhattanLength()};Lt.prototype.fromAttribute=function(s,e,t){return console.warn("THREE.Vector4: .fromAttribute() has been renamed to .fromBufferAttribute()."),this.fromBufferAttribute(s,e,t)};Lt.prototype.lengthManhattan=function(){return console.warn("THREE.Vector4: .lengthManhattan() has been renamed to .manhattanLength()."),this.manhattanLength()};Ct.prototype.getChildByName=function(s){return console.warn("THREE.Object3D: .getChildByName() has been renamed to .getObjectByName()."),this.getObjectByName(s)};Ct.prototype.renderDepth=function(){console.warn("THREE.Object3D: .renderDepth has been removed. Use .renderOrder, instead.")};Ct.prototype.translate=function(s,e){return console.warn("THREE.Object3D: .translate() has been removed. Use .translateOnAxis( axis, distance ) instead."),this.translateOnAxis(e,s)};Ct.prototype.getWorldRotation=function(){console.error("THREE.Object3D: .getWorldRotation() has been removed. Use THREE.Object3D.getWorldQuaternion( target ) instead.")};Ct.prototype.applyMatrix=function(s){return console.warn("THREE.Object3D: .applyMatrix() has been renamed to .applyMatrix4()."),this.applyMatrix4(s)};Object.defineProperties(Ct.prototype,{eulerOrder:{get:function(){return console.warn("THREE.Object3D: .eulerOrder is now .rotation.order."),this.rotation.order},set:function(s){console.warn("THREE.Object3D: .eulerOrder is now .rotation.order."),this.rotation.order=s}},useQuaternion:{get:function(){console.warn("THREE.Object3D: .useQuaternion has been removed. The library now uses quaternions by default.")},set:function(){console.warn("THREE.Object3D: .useQuaternion has been removed. The library now uses quaternions by default.")}}});Ot.prototype.setDrawMode=function(){console.error("THREE.Mesh: .setDrawMode() has been removed. The renderer now always assumes THREE.TrianglesDrawMode. Transform your geometry via BufferGeometryUtils.toTrianglesDrawMode() if necessary.")};Object.defineProperties(Ot.prototype,{drawMode:{get:function(){return console.error("THREE.Mesh: .drawMode has been removed. The renderer now always assumes THREE.TrianglesDrawMode."),Ff},set:function(){console.error("THREE.Mesh: .drawMode has been removed. The renderer now always assumes THREE.TrianglesDrawMode. Transform your geometry via BufferGeometryUtils.toTrianglesDrawMode() if necessary.")}}});Wr.prototype.initBones=function(){console.error("THREE.SkinnedMesh: initBones() has been removed.")};qt.prototype.setLens=function(s,e){console.warn("THREE.PerspectiveCamera.setLens is deprecated. Use .setFocalLength and .filmGauge for a photographic setup."),e!==void 0&&(this.filmGauge=e),this.setFocalLength(s)};Object.defineProperties(wn.prototype,{onlyShadow:{set:function(){console.warn("THREE.Light: .onlyShadow has been removed.")}},shadowCameraFov:{set:function(s){console.warn("THREE.Light: .shadowCameraFov is now .shadow.camera.fov."),this.shadow.camera.fov=s}},shadowCameraLeft:{set:function(s){console.warn("THREE.Light: .shadowCameraLeft is now .shadow.camera.left."),this.shadow.camera.left=s}},shadowCameraRight:{set:function(s){console.warn("THREE.Light: .shadowCameraRight is now .shadow.camera.right."),this.shadow.camera.right=s}},shadowCameraTop:{set:function(s){console.warn("THREE.Light: .shadowCameraTop is now .shadow.camera.top."),this.shadow.camera.top=s}},shadowCameraBottom:{set:function(s){console.warn("THREE.Light: .shadowCameraBottom is now .shadow.camera.bottom."),this.shadow.camera.bottom=s}},shadowCameraNear:{set:function(s){console.warn("THREE.Light: .shadowCameraNear is now .shadow.camera.near."),this.shadow.camera.near=s}},shadowCameraFar:{set:function(s){console.warn("THREE.Light: .shadowCameraFar is now .shadow.camera.far."),this.shadow.camera.far=s}},shadowCameraVisible:{set:function(){console.warn("THREE.Light: .shadowCameraVisible has been removed. Use new THREE.CameraHelper( light.shadow.camera ) instead.")}},shadowBias:{set:function(s){console.warn("THREE.Light: .shadowBias is now .shadow.bias."),this.shadow.bias=s}},shadowDarkness:{set:function(){console.warn("THREE.Light: .shadowDarkness has been removed.")}},shadowMapWidth:{set:function(s){console.warn("THREE.Light: .shadowMapWidth is now .shadow.mapSize.width."),this.shadow.mapSize.width=s}},shadowMapHeight:{set:function(s){console.warn("THREE.Light: .shadowMapHeight is now .shadow.mapSize.height."),this.shadow.mapSize.height=s}}});Object.defineProperties(St.prototype,{length:{get:function(){return console.warn("THREE.BufferAttribute: .length has been deprecated. Use .count instead."),this.array.length}},dynamic:{get:function(){return console.warn("THREE.BufferAttribute: .dynamic has been deprecated. Use .usage instead."),this.usage===Lr},set:function(){console.warn("THREE.BufferAttribute: .dynamic has been deprecated. Use .usage instead."),this.setUsage(Lr)}}});St.prototype.setDynamic=function(s){return console.warn("THREE.BufferAttribute: .setDynamic() has been deprecated. Use .setUsage() instead."),this.setUsage(s===!0?Lr:Pr),this};St.prototype.copyIndicesArray=function(){console.error("THREE.BufferAttribute: .copyIndicesArray() has been removed.")},St.prototype.setArray=function(){console.error("THREE.BufferAttribute: .setArray has been removed. Use BufferGeometry .setAttribute to replace/resize attribute buffers")};_t.prototype.addIndex=function(s){console.warn("THREE.BufferGeometry: .addIndex() has been renamed to .setIndex()."),this.setIndex(s)};_t.prototype.addAttribute=function(s,e){return console.warn("THREE.BufferGeometry: .addAttribute() has been renamed to .setAttribute()."),!(e&&e.isBufferAttribute)&&!(e&&e.isInterleavedBufferAttribute)?(console.warn("THREE.BufferGeometry: .addAttribute() now expects ( name, attribute )."),this.setAttribute(s,new St(arguments[1],arguments[2]))):s==="index"?(console.warn("THREE.BufferGeometry.addAttribute: Use .setIndex() for index attribute."),this.setIndex(e),this):this.setAttribute(s,e)};_t.prototype.addDrawCall=function(s,e,t){t!==void 0&&console.warn("THREE.BufferGeometry: .addDrawCall() no longer supports indexOffset."),console.warn("THREE.BufferGeometry: .addDrawCall() is now .addGroup()."),this.addGroup(s,e)};_t.prototype.clearDrawCalls=function(){console.warn("THREE.BufferGeometry: .clearDrawCalls() is now .clearGroups()."),this.clearGroups()};_t.prototype.computeOffsets=function(){console.warn("THREE.BufferGeometry: .computeOffsets() has been removed.")};_t.prototype.removeAttribute=function(s){return console.warn("THREE.BufferGeometry: .removeAttribute() has been renamed to .deleteAttribute()."),this.deleteAttribute(s)};_t.prototype.applyMatrix=function(s){return console.warn("THREE.BufferGeometry: .applyMatrix() has been renamed to .applyMatrix4()."),this.applyMatrix4(s)};Object.defineProperties(_t.prototype,{drawcalls:{get:function(){return console.error("THREE.BufferGeometry: .drawcalls has been renamed to .groups."),this.groups}},offsets:{get:function(){return console.warn("THREE.BufferGeometry: .offsets has been renamed to .groups."),this.groups}}});ei.prototype.setDynamic=function(s){return console.warn("THREE.InterleavedBuffer: .setDynamic() has been deprecated. Use .setUsage() instead."),this.setUsage(s===!0?Lr:Pr),this};ei.prototype.setArray=function(){console.error("THREE.InterleavedBuffer: .setArray has been removed. Use BufferGeometry .setAttribute to replace/resize attribute buffers")};Wn.prototype.getArrays=function(){console.error("THREE.ExtrudeGeometry: .getArrays() has been removed.")};Wn.prototype.addShapeList=function(){console.error("THREE.ExtrudeGeometry: .addShapeList() has been removed.")};Wn.prototype.addShape=function(){console.error("THREE.ExtrudeGeometry: .addShape() has been removed.")};Ur.prototype.dispose=function(){console.error("THREE.Scene: .dispose() has been removed.")};bl.prototype.onUpdate=function(){return console.warn("THREE.Uniform: .onUpdate() has been removed. Use object.onBeforeRender() instead."),this};Object.defineProperties(Yt.prototype,{wrapAround:{get:function(){console.warn("THREE.Material: .wrapAround has been removed.")},set:function(){console.warn("THREE.Material: .wrapAround has been removed.")}},overdraw:{get:function(){console.warn("THREE.Material: .overdraw has been removed.")},set:function(){console.warn("THREE.Material: .overdraw has been removed.")}},wrapRGB:{get:function(){return console.warn("THREE.Material: .wrapRGB has been removed."),new ut}},shading:{get:function(){console.error("THREE."+this.type+": .shading has been removed. Use the boolean .flatShading instead.")},set:function(s){console.warn("THREE."+this.type+": .shading has been removed. Use the boolean .flatShading instead."),this.flatShading=s===xu}},stencilMask:{get:function(){return console.warn("THREE."+this.type+": .stencilMask has been removed. Use .stencilFuncMask instead."),this.stencilFuncMask},set:function(s){console.warn("THREE."+this.type+": .stencilMask has been removed. Use .stencilFuncMask instead."),this.stencilFuncMask=s}}});Object.defineProperties(Rn.prototype,{derivatives:{get:function(){return console.warn("THREE.ShaderMaterial: .derivatives has been moved to .extensions.derivatives."),this.extensions.derivatives},set:function(s){console.warn("THREE. ShaderMaterial: .derivatives has been moved to .extensions.derivatives."),this.extensions.derivatives=s}}});Dt.prototype.clearTarget=function(s,e,t,n){console.warn("THREE.WebGLRenderer: .clearTarget() has been deprecated. Use .setRenderTarget() and .clear() instead."),this.setRenderTarget(s),this.clear(e,t,n)};Dt.prototype.animate=function(s){console.warn("THREE.WebGLRenderer: .animate() is now .setAnimationLoop()."),this.setAnimationLoop(s)};Dt.prototype.getCurrentRenderTarget=function(){return console.warn("THREE.WebGLRenderer: .getCurrentRenderTarget() is now .getRenderTarget()."),this.getRenderTarget()};Dt.prototype.getMaxAnisotropy=function(){return console.warn("THREE.WebGLRenderer: .getMaxAnisotropy() is now .capabilities.getMaxAnisotropy()."),this.capabilities.getMaxAnisotropy()};Dt.prototype.getPrecision=function(){return console.warn("THREE.WebGLRenderer: .getPrecision() is now .capabilities.precision."),this.capabilities.precision};Dt.prototype.resetGLState=function(){return console.warn("THREE.WebGLRenderer: .resetGLState() is now .state.reset()."),this.state.reset()};Dt.prototype.supportsFloatTextures=function(){return console.warn("THREE.WebGLRenderer: .supportsFloatTextures() is now .extensions.get( 'OES_texture_float' )."),this.extensions.get("OES_texture_float")};Dt.prototype.supportsHalfFloatTextures=function(){return console.warn("THREE.WebGLRenderer: .supportsHalfFloatTextures() is now .extensions.get( 'OES_texture_half_float' )."),this.extensions.get("OES_texture_half_float")};Dt.prototype.supportsStandardDerivatives=function(){return console.warn("THREE.WebGLRenderer: .supportsStandardDerivatives() is now .extensions.get( 'OES_standard_derivatives' )."),this.extensions.get("OES_standard_derivatives")};Dt.prototype.supportsCompressedTextureS3TC=function(){return console.warn("THREE.WebGLRenderer: .supportsCompressedTextureS3TC() is now .extensions.get( 'WEBGL_compressed_texture_s3tc' )."),this.extensions.get("WEBGL_compressed_texture_s3tc")};Dt.prototype.supportsCompressedTexturePVRTC=function(){return console.warn("THREE.WebGLRenderer: .supportsCompressedTexturePVRTC() is now .extensions.get( 'WEBGL_compressed_texture_pvrtc' )."),this.extensions.get("WEBGL_compressed_texture_pvrtc")};Dt.prototype.supportsBlendMinMax=function(){return console.warn("THREE.WebGLRenderer: .supportsBlendMinMax() is now .extensions.get( 'EXT_blend_minmax' )."),this.extensions.get("EXT_blend_minmax")};Dt.prototype.supportsVertexTextures=function(){return console.warn("THREE.WebGLRenderer: .supportsVertexTextures() is now .capabilities.vertexTextures."),this.capabilities.vertexTextures};Dt.prototype.supportsInstancedArrays=function(){return console.warn("THREE.WebGLRenderer: .supportsInstancedArrays() is now .extensions.get( 'ANGLE_instanced_arrays' )."),this.extensions.get("ANGLE_instanced_arrays")};Dt.prototype.enableScissorTest=function(s){console.warn("THREE.WebGLRenderer: .enableScissorTest() is now .setScissorTest()."),this.setScissorTest(s)};Dt.prototype.initMaterial=function(){console.warn("THREE.WebGLRenderer: .initMaterial() has been removed.")};Dt.prototype.addPrePlugin=function(){console.warn("THREE.WebGLRenderer: .addPrePlugin() has been removed.")};Dt.prototype.addPostPlugin=function(){console.warn("THREE.WebGLRenderer: .addPostPlugin() has been removed.")};Dt.prototype.updateShadowMap=function(){console.warn("THREE.WebGLRenderer: .updateShadowMap() has been removed.")};Dt.prototype.setFaceCulling=function(){console.warn("THREE.WebGLRenderer: .setFaceCulling() has been removed.")};Dt.prototype.allocTextureUnit=function(){console.warn("THREE.WebGLRenderer: .allocTextureUnit() has been removed.")};Dt.prototype.setTexture=function(){console.warn("THREE.WebGLRenderer: .setTexture() has been removed.")};Dt.prototype.setTexture2D=function(){console.warn("THREE.WebGLRenderer: .setTexture2D() has been removed.")};Dt.prototype.setTextureCube=function(){console.warn("THREE.WebGLRenderer: .setTextureCube() has been removed.")};Dt.prototype.getActiveMipMapLevel=function(){return console.warn("THREE.WebGLRenderer: .getActiveMipMapLevel() is now .getActiveMipmapLevel()."),this.getActiveMipmapLevel()};Object.defineProperties(Dt.prototype,{shadowMapEnabled:{get:function(){return this.shadowMap.enabled},set:function(s){console.warn("THREE.WebGLRenderer: .shadowMapEnabled is now .shadowMap.enabled."),this.shadowMap.enabled=s}},shadowMapType:{get:function(){return this.shadowMap.type},set:function(s){console.warn("THREE.WebGLRenderer: .shadowMapType is now .shadowMap.type."),this.shadowMap.type=s}},shadowMapCullFace:{get:function(){console.warn("THREE.WebGLRenderer: .shadowMapCullFace has been removed. Set Material.shadowSide instead.")},set:function(){console.warn("THREE.WebGLRenderer: .shadowMapCullFace has been removed. Set Material.shadowSide instead.")}},context:{get:function(){return console.warn("THREE.WebGLRenderer: .context has been removed. Use .getContext() instead."),this.getContext()}},vr:{get:function(){return console.warn("THREE.WebGLRenderer: .vr has been renamed to .xr"),this.xr}},gammaInput:{get:function(){return console.warn("THREE.WebGLRenderer: .gammaInput has been removed. Set the encoding for textures via Texture.encoding instead."),!1},set:function(){console.warn("THREE.WebGLRenderer: .gammaInput has been removed. Set the encoding for textures via Texture.encoding instead.")}},gammaOutput:{get:function(){return console.warn("THREE.WebGLRenderer: .gammaOutput has been removed. Set WebGLRenderer.outputEncoding instead."),!1},set:function(s){console.warn("THREE.WebGLRenderer: .gammaOutput has been removed. Set WebGLRenderer.outputEncoding instead."),this.outputEncoding=s===!0?Ba:hn}},toneMappingWhitePoint:{get:function(){return console.warn("THREE.WebGLRenderer: .toneMappingWhitePoint has been removed."),1},set:function(){console.warn("THREE.WebGLRenderer: .toneMappingWhitePoint has been removed.")}}});Object.defineProperties(ep.prototype,{cullFace:{get:function(){console.warn("THREE.WebGLRenderer: .shadowMap.cullFace has been removed. Set Material.shadowSide instead.")},set:function(){console.warn("THREE.WebGLRenderer: .shadowMap.cullFace has been removed. Set Material.shadowSide instead.")}},renderReverseSided:{get:function(){console.warn("THREE.WebGLRenderer: .shadowMap.renderReverseSided has been removed. Set Material.shadowSide instead.")},set:function(){console.warn("THREE.WebGLRenderer: .shadowMap.renderReverseSided has been removed. Set Material.shadowSide instead.")}},renderSingleSided:{get:function(){console.warn("THREE.WebGLRenderer: .shadowMap.renderSingleSided has been removed. Set Material.shadowSide instead.")},set:function(){console.warn("THREE.WebGLRenderer: .shadowMap.renderSingleSided has been removed. Set Material.shadowSide instead.")}}});function E1(s,e,t){return console.warn("THREE.WebGLRenderTargetCube( width, height, options ) is now WebGLCubeRenderTarget( size, options )."),new Fr(s,t)}Object.defineProperties(Pn.prototype,{wrapS:{get:function(){return console.warn("THREE.WebGLRenderTarget: .wrapS is now .texture.wrapS."),this.texture.wrapS},set:function(s){console.warn("THREE.WebGLRenderTarget: .wrapS is now .texture.wrapS."),this.texture.wrapS=s}},wrapT:{get:function(){return console.warn("THREE.WebGLRenderTarget: .wrapT is now .texture.wrapT."),this.texture.wrapT},set:function(s){console.warn("THREE.WebGLRenderTarget: .wrapT is now .texture.wrapT."),this.texture.wrapT=s}},magFilter:{get:function(){return console.warn("THREE.WebGLRenderTarget: .magFilter is now .texture.magFilter."),this.texture.magFilter},set:function(s){console.warn("THREE.WebGLRenderTarget: .magFilter is now .texture.magFilter."),this.texture.magFilter=s}},minFilter:{get:function(){return console.warn("THREE.WebGLRenderTarget: .minFilter is now .texture.minFilter."),this.texture.minFilter},set:function(s){console.warn("THREE.WebGLRenderTarget: .minFilter is now .texture.minFilter."),this.texture.minFilter=s}},anisotropy:{get:function(){return console.warn("THREE.WebGLRenderTarget: .anisotropy is now .texture.anisotropy."),this.texture.anisotropy},set:function(s){console.warn("THREE.WebGLRenderTarget: .anisotropy is now .texture.anisotropy."),this.texture.anisotropy=s}},offset:{get:function(){return console.warn("THREE.WebGLRenderTarget: .offset is now .texture.offset."),this.texture.offset},set:function(s){console.warn("THREE.WebGLRenderTarget: .offset is now .texture.offset."),this.texture.offset=s}},repeat:{get:function(){return console.warn("THREE.WebGLRenderTarget: .repeat is now .texture.repeat."),this.texture.repeat},set:function(s){console.warn("THREE.WebGLRenderTarget: .repeat is now .texture.repeat."),this.texture.repeat=s}},format:{get:function(){return console.warn("THREE.WebGLRenderTarget: .format is now .texture.format."),this.texture.format},set:function(s){console.warn("THREE.WebGLRenderTarget: .format is now .texture.format."),this.texture.format=s}},type:{get:function(){return console.warn("THREE.WebGLRenderTarget: .type is now .texture.type."),this.texture.type},set:function(s){console.warn("THREE.WebGLRenderTarget: .type is now .texture.type."),this.texture.type=s}},generateMipmaps:{get:function(){return console.warn("THREE.WebGLRenderTarget: .generateMipmaps is now .texture.generateMipmaps."),this.texture.generateMipmaps},set:function(s){console.warn("THREE.WebGLRenderTarget: .generateMipmaps is now .texture.generateMipmaps."),this.texture.generateMipmaps=s}}});La.prototype.load=function(s){console.warn("THREE.Audio: .load has been deprecated. Use THREE.AudioLoader instead.");let e=this;return new dl().load(s,function(n){e.setBuffer(n)}),this};gl.prototype.getData=function(){return console.warn("THREE.AudioAnalyser: .getData() is now .getFrequencyData()."),this.getFrequencyData()};Ir.prototype.updateCubeMap=function(s,e){return console.warn("THREE.CubeCamera: .updateCubeMap() is now .update()."),this.update(s,e)};Ir.prototype.clear=function(s,e,t,n){return console.warn("THREE.CubeCamera: .clear() is now .renderTarget.clear()."),this.renderTarget.clear(s,e,t,n)};Qn.crossOrigin=void 0;Qn.loadTexture=function(s,e,t,n){console.warn("THREE.ImageUtils.loadTexture has been deprecated. Use THREE.TextureLoader() instead.");let i=new nl;i.setCrossOrigin(this.crossOrigin);let r=i.load(s,t,void 0,n);return e&&(r.mapping=e),r};Qn.loadTextureCube=function(s,e,t,n){console.warn("THREE.ImageUtils.loadTextureCube has been deprecated. Use THREE.CubeTextureLoader() instead.");let i=new el;i.setCrossOrigin(this.crossOrigin);let r=i.load(s,t,void 0,n);return e&&(r.mapping=e),r};Qn.loadCompressedTexture=function(){console.error("THREE.ImageUtils.loadCompressedTexture has been removed. Use THREE.DDSLoader instead.")};Qn.loadCompressedTextureCube=function(){console.error("THREE.ImageUtils.loadCompressedTextureCube has been removed. Use THREE.DDSLoader instead.")};function C1(){console.error("THREE.CanvasRenderer has been removed")}function P1(){console.error("THREE.JSONLoader has been removed.")}var L1={createMultiMaterialObject:function(){console.error("THREE.SceneUtils has been moved to /examples/jsm/utils/SceneUtils.js")},detach:function(){console.error("THREE.SceneUtils has been moved to /examples/jsm/utils/SceneUtils.js")},attach:function(){console.error("THREE.SceneUtils has been moved to /examples/jsm/utils/SceneUtils.js")}};function R1(){console.error("THREE.LensFlare has been moved to /examples/jsm/objects/Lensflare.js")}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"128"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="128");function hp(s,e,t,n){(function(i){"use strict";let l=(p,y=0,x=1)=>Math.max(y,Math.min(x,p));function h(p){return[...p].sort((x,v)=>x.z!==v.z?x.z-v.z:(x.order??0)-(v.order??0)).map((x,v)=>({...x,layer:v}))}function u(p,y=0,x=256,v=3.2){let g=l(p,0,x-1),m=l(.5-y/v,.08,1-.08);return(g+m)/(x*16)}function d(p,y,x=35,v=.1,g=80,m=256,S=3.2){let w=p*m*16,b=Math.floor(w);return b>=0&&b<y.length?y[b]-(w-b-.5)*S:x-(v+(g-v)*p)}function f(p,y=256){let x=Array.from({length:y},()=>new p.Scene),v=new p.Group,g=new p.Group,m=new Float32Array(y),S=new Uint8Array(y*4),w=new p.DataTexture(S,y,1,p.RGBAFormat,p.UnsignedByteType);w.minFilter=w.magFilter=p.NearestFilter,w.generateMipmaps=!1,w.needsUpdate=!0;let b=new p.ShaderMaterial({side:p.DoubleSide,uniforms:{layer:{value:0},centerZ:{value:0},span:{value:3.2},bands:{value:4096}},vertexShader:"varying float worldZ;void main(){vec4 w=modelMatrix*vec4(position,1.);worldZ=w.z;gl_Position=projectionMatrix*viewMatrix*w;}",fragmentShader:\`precision highp float;varying float worldZ;uniform float layer,centerZ,span,bands;
  void main(){float within=clamp(.5-(worldZ-centerZ)/span,\${.08},\${1-.08});gl_FragColor=vec4((layer+within)/bands,0.,0.,1.);}\`}),F=new p.ShaderMaterial({side:p.DoubleSide,vertexShader:\`attribute vec4 motion;attribute vec3 bonePivot;attribute float part,layer,centerZ;varying float vLayer,vCenterZ,worldZ;uniform float clock;
  vec3 rx(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
  vec3 ry(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
  vec3 rz(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
  void main(){vec3 v=position;float ax=0.,ay=0.,az=0.,stroke=motion.x,seed=motion.y,response=motion.z,effort=motion.w;
  if(part>.5&&part<2.5){float side=part<1.5?-1.:1.,beat=stroke+side*.35;az=side*(.08+sin(beat)*(.16+effort*.22));ax=cos(beat-.5)*(.12+effort*.20);ay=side*sin(beat+.7)*.12;if(side>0.){ax+=response*.65;ay+=response*sin(clock*7.+seed)*.36;}}
  else if(part>2.5&&part<4.5){float side=part<3.5?-1.:1.;az=sin(stroke*.63+side*1.5)*.13;ax=sin(stroke*.63+side*1.5-.6)*.12;}
  else if(part>4.5){float phase=mod(clock+seed*1.7,6.7),blink=phase<.20?sin(phase/.20*3.14159265):0.;v.y=bonePivot.y+(v.y-bonePivot.y)*(1.-blink*.92);}
  if(part>.5&&part<4.5)v=bonePivot+rz(ry(rx(v-bonePivot,ax),ay),az);
  vec4 w=modelMatrix*instanceMatrix*vec4(v,1.);worldZ=w.z;vLayer=layer;vCenterZ=centerZ;gl_Position=projectionMatrix*viewMatrix*w;}\`,fragmentShader:\`precision highp float;varying float vLayer,vCenterZ,worldZ;
  void main(){float within=clamp(.5-(worldZ-vCenterZ)/\${3.2},\${.08},\${1-.08});gl_FragColor=vec4((vLayer+within)/4096.,0.,0.,1.);}\`});x[0].add(v,g);let L=new WeakMap,O=new WeakMap,ae=[],_=[];function E(I){let K=L.get(I);if(K)return K;K=new p.Group,K.matrixAutoUpdate=!1;let G=[];return I.traverse(oe=>{if(!oe.isMesh)return;let le=new p.Mesh(oe.geometry,b);le.matrixAutoUpdate=!1,le.frustumCulled=!1,K.add(le),G.push([oe,le])}),K.userData.pairs=G,L.set(I,K),v.add(K),K}function z(I){let K=O.get(I);if(K)return K;let G=I.geometry.clone();G.getAttribute("motion")||G.setAttribute("motion",new p.InstancedBufferAttribute(new Float32Array(I.instanceMatrix.count*4),4)),G.getAttribute("bonePivot")||G.setAttribute("bonePivot",new p.Float32BufferAttribute(new Float32Array(G.attributes.position.count*3),3)),G.getAttribute("part")||G.setAttribute("part",new p.Float32BufferAttribute(new Float32Array(G.attributes.position.count),1));let oe=new p.InstancedBufferAttribute(new Float32Array(I.instanceMatrix.count),1).setUsage(p.DynamicDrawUsage),le=new p.InstancedBufferAttribute(new Float32Array(I.instanceMatrix.count),1).setUsage(p.DynamicDrawUsage);return G.setAttribute("layer",oe),G.setAttribute("centerZ",le),K=new p.InstancedMesh(G,F,I.instanceMatrix.count),K.instanceMatrix=I.instanceMatrix,K.frustumCulled=!1,K.visible=!1,K.userData={layer:oe,centerZ:le,motion:I.geometry.getAttribute("motion")},O.set(I,K),g.add(K),K}function D(I,K){I.updateWorldMatrix(!0,!0),K.visible=!0;for(let[G,oe]of K.userData.pairs)oe.visible=G.visible,oe.matrixWorld.copy(G.matrixWorld)}function C(I,K,G,oe,le=[],M=!1){for(let k of ae)k.visible=!1;ae.length=0;for(let k of _)k.visible=!1;_.length=0,m.fill(-999),S.fill(0);let q=[],se=0;for(let k of oe)M&&!k.solidIce||k?.group?.visible&&q.push({...k,order:se++});if(!M){for(let k of le)if(!(!k?.mesh?.visible||!k.mesh.count))for(let ne=0;ne<k.mesh.count;ne++){let ce=k.actors[ne];ce&&q.push({batch:k,slot:ne,z:ce.z,order:se++})}}let X=h(q).slice(0,y),pe=I.getRenderTarget(),ve=I.autoClear,fe=I.getClearColor(new p.Color),J=I.getClearAlpha();I.setRenderTarget(K),I.setClearColor(16777215,1),I.clear(!0,!0,!1),I.autoClear=!1;try{for(let k of X){let ne=k.layer;m[ne]=k.z;let ce=Math.round(l((k.z+12)/48)*255);if(S[ne*4]=ce,S[ne*4+1]=ce,S[ne*4+2]=ce,S[ne*4+3]=255,k.batch){let j=z(k.batch.mesh);j.count=k.batch.mesh.count,j.visible=!0,j.userData.layer.setX(k.slot,ne),j.userData.centerZ.setX(k.slot,k.z),_.includes(j)||_.push(j);continue}let H=E(k.group);D(k.group,H),ae.push(H),b.uniforms.layer.value=ne,b.uniforms.centerZ.value=k.z,I.render(x[0],G),H.visible=!1}if(_.length){for(let k of _)k.userData.layer.needsUpdate=!0,k.userData.centerZ.needsUpdate=!0,k.userData.motion&&(k.geometry.attributes.motion.needsUpdate=!0);F.uniforms.clock={value:performance.now()*.001},I.render(x[0],G)}w.needsUpdate=!0}finally{I.autoClear=ve,I.setClearColor(fe,J),I.setRenderTarget(pe)}return X}return{render:C,centers:m,centerTexture:w,texture:w,capacity:y,span:3.2}}i.OceanObjectOcclusion={CAPACITY:256,SPAN:3.2,BANDS:4096,assignLayers:h,encodeDepth:u,decodeHeight:d,createRenderer:f,create:f}})(s)}function dp(s,e,t,n){(function(i){"use strict";let r=Math.PI*2,a=(m,S=0,w=1)=>Math.max(S,Math.min(w,m)),o=(m,S,w)=>m+(S-m)*w,c=150,l=m=>(m=a(m),m*m*(3-2*m)),h=new WeakMap;function u(m,S){let w=m.route,b=0;S=a(S,0,m.travel);let F=a(S/m.entryDuration);for(S+=m.entryBoost*(1-(1-F)**3);b<w.length-2&&S>w[b+1].t;)b++;let L=w[b],O=w[b+1],ae=O.t-L.t,_=(S-L.t)/ae,E=_*_,z=E*_,D={};for(let C of["u","v"]){let I=oe=>{let le=w[Math.max(0,oe-1)],M=w[Math.min(w.length-1,oe+1)];return(M[C]-le[C])/(M.t-le.t)},K=I(b)*ae,G=I(b+1)*ae;D[C]=(2*z-3*E+1)*L[C]+(z-2*E+_)*K+(-2*z+3*E)*O[C]+(z-E)*G}return D}function d(m,S,w){let b=m.actors[S];return u(b,w-b.startAt)}function f(m,S){let w=h.get(m),b=1.95*m.size,F=1/0;for(let L=0;L<8;L++){let O=L/8*r;F=Math.min(F,w(S.u+Math.cos(O)*b/(20*m.ratio),S.v+Math.sin(O)*b/20))}return F}function p(m,S,w){h.set(m,w),m.size=Math.min(1.18,.78+m.ratio*.25)*.25,m.entry=1,m.actors=[],m.socialAt=0;let b=100+Math.min(50,Math.floor(S()*51)),F=E=>{for(let z=0;z<60&&f(m,E)<.065;z++)E.u+=.009,E.v-=.004;return E},L=["top","right","bottom"],O=Math.floor(S()*3),ae=L.map((E,z)=>{let D=[];for(let C=0;C<64;C++){let I=.09+C/63*.82,K=z===1?{u:.94,v:I}:{u:I,v:z===0?.94:.06},G=z===1?{u:1,v:I}:{u:I,v:z===0?1:0};f(m,K)>.09&&f(m,G)>.09&&D.push(K)}return D.length||D.push(z===1?{u:.94,v:.5}:{u:.65,v:z===0?.94:.06}),D}),_=E=>{let z=ae[E],D=z[Math.min(z.length-1,Math.floor(S()*z.length))],C=E===1?{u:1.18,v:D.v}:{u:D.u,v:E===0?1.18:-.18};return{inner:D,outer:C}};for(let E=0;E<b;E++){let z=E<2?["sponge","patrick"][E]:S()<.5?"sponge":"patrick",D=E/b*6+S()*.18,C=62+S()*12,I=Math.floor(S()*3),K=(E+O)%3,G=_(K),oe=_(I),le={kind:z,index:E,startAt:D,travel:C,entry:L[K],exit:L[I],...G.outer,z:.025,heading:0,pitch:0,roll:0,visible:!1,scale:m.size,seed:S()*r,reaction:0,social:0,cooldown:0,pushX:0,pushY:0,pushVX:0,pushVY:0,speed:0,stroke:S()*r,effort:.3,nextGreeting:12+S()*10},M=.47+S()*.22,q=.35+S()*.3,se=.2+S()*Math.min(.09,.94-M-.2),X=.21+S()*.08,pe=S()<.5?1:-1,ve=(E*.61803398875+S()*.16)%1*r;le.entryDuration=2+S()*8,le.entryBoost=C*.18-le.entryDuration,le.travel=C-le.entryBoost;let fe=[[0,G.outer.u,G.outer.v],[.08,G.inner.u,G.inner.v]];for(let J=0;J<=4;J++){let k=ve+pe*J*r/4;fe.push([.18+J*.16,M+Math.cos(k)*se,q+Math.sin(k)*X])}fe.push([.92,oe.inner.u,oe.inner.v],[1,oe.outer.u,oe.outer.v]),le.route=fe.map(([J,k,ne],ce)=>({t:J*C,...ce===0||ce===fe.length-1?{u:k,v:ne}:F({u:k,v:ne})}));for(let J=0;J<14;J++){let k=!1;for(let ne=1;ne<160;ne++){let ce=u(le,ne/160*le.travel);if(ce.u>0&&ce.u<1&&ce.v>0&&ce.v<1&&f(m,ce)<.035){k=!0;break}}if(!k)break;for(let ne=2;ne<le.route.length-2;ne++)le.route[ne].u=Math.min(.95,le.route[ne].u+.016),le.route[ne].v=a(le.route[ne].v-.004,.055,.95)}m.actors.push(le)}m.actor=m.actors[0],m.duration=Math.max(...m.actors.map(E=>E.startAt+E.travel))+1.7,m.travel=m.duration,m.bump=0,v(m,0)}function y(m,S,w,b,F){if(!m||m.type!=="duo")return!1;let L=Math.hypot(b*m.ratio,F);if(L<1e-4)return!1;for(let O of m.actors){if(!O.visible||m.age-O.startAt>O.travel*.84)continue;let ae=(O.u-S)*20*m.ratio,_=(O.v-w)*20,E=Math.hypot(ae,_),z=1-l((E-.25)/1.4);if(z<=0)continue;let D=Math.min(.05,L*3)*z;O.pushVX=a(O.pushVX+b*m.ratio/L*D,-.22,.22),O.pushVY=a(O.pushVY+F/L*D,-.22,.22)}return!0}function x(m,S){let w=m.actors[S];return!w?.visible||w.cooldown>0||m.age-w.startAt>w.travel-4?!1:(w.reaction=2.8,w.cooldown=4,!0)}function v(m,S){let w=m.age,b=m.actors.some(L=>w<L.startAt+L.entryDuration),F=w>m.duration-22;m.phase=m.actors.length+" 位迷你朋友 · "+(b?"从上、右、下方海域陆续漂来":F?"向上、右、下方海域散去":w<m.duration*.53?"结伴划水，互相招手":"绕过浅海，随水滑行");for(let L of m.actors){let O=w-L.startAt,ae=u(L,O),_=u(L,O-.03),E=u(L,O+.03);L.visible=O>=0&&O<L.travel,L.reaction=Math.max(0,L.reaction-S),L.social=Math.max(0,L.social-S),L.cooldown=Math.max(0,L.cooldown-S),L.pushVX+=(-L.pushX*.7-L.pushVX*2.7)*S,L.pushVY+=(-L.pushY*.7-L.pushVY*2.7)*S,L.pushX=a(L.pushX+L.pushVX*S,-.3,.3),L.pushY=a(L.pushY+L.pushVY*S,-.3,.3);let z=1-l((O/L.travel-.79)/.08),D={u:ae.u+L.pushX*z/(20*m.ratio),v:ae.v+L.pushY*z/20};(L.pushX||L.pushY)&&f(m,D)>.025&&(ae.u=D.u,ae.v=D.v),L.u=ae.u,L.v=ae.v,L.z=.035+Math.sin(w*1.12+L.seed)*.011;let C=(E.u-_.u)*20*m.ratio,I=(E.v-_.v)*20,K=Math.hypot(C,I)/.06;L.speed=K,L.effort=a(.24+K*.72,.25,.92),L.stroke+=S*(2.6+K*2.8);let G=Math.atan2(C,I);L.course??=G,K>.001&&(L.course+=Math.atan2(Math.sin(G-L.course),Math.cos(G-L.course)));let oe=L.course*.32+(L.kind==="sponge"?-.18:.18)+Math.sin(w*.29+L.seed)*.16,le=Math.atan2(Math.sin(oe-L.heading),Math.cos(oe-L.heading));L.heading+=S===0?le:le*(1-Math.exp(-S*1.8)),L.pitch=Math.sin(L.stroke-.7)*.035*L.effort+Math.sin(w*.8+L.seed)*.025,L.roll=Math.sin(L.stroke*.5+L.seed)*.045,L.visible||(L.speed=0)}if(w>=m.socialAt){m.socialAt=w+.4;for(let L of m.actors){if(!L.visible||w<L.nextGreeting||w-L.startAt>L.travel*.8)continue;let O=null,ae=1.4;for(let _ of m.actors){if(L===_||!_.visible)continue;let E=Math.hypot((L.u-_.u)*20*m.ratio,(L.v-_.v)*20);E<ae&&(ae=E,O=_)}L.nextGreeting=w+7+(Math.sin(L.seed+w)*.5+.5)*6,O&&(L.social=2.3,L.buddy=O.index,O.social===0&&(O.social=1.9))}}return w>=m.duration}function g({THREE:m,scene:S,toWorld:w,aspect:b,ripple:F,surfaceDepth:L,layerCenters:O}){let ae=new Set,_=[],E=[],z=Array.from({length:c},()=>[]),D=null,C=-1,I=0,K=ue=>(ae.add(ue),ue),G=K(new m.SphereGeometry(1,28,20)),oe=(ue,Ae)=>{let Ce=new m.Group;return Ce.name=Ae||"",ue?.add(Ce),Ce},le=(ue,Ae,Ce,B=[0,0,0],W=[1,1,1])=>{let V=new m.Mesh(K(Ae),Ce);return V.position.set(...B),V.scale.set(...W),ue.add(V),V},M=(ue,Ae,Ce,B)=>le(ue,G,Ae,Ce,B),q=(ue,Ae,Ce,B)=>le(ue,new m.TubeGeometry(new m.CatmullRomCurve3(Ae.map(W=>new m.Vector3(...W))),24,Ce,8,!1),B),se="varying vec3 p,N;void main(){p=position;N=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";function X(ue,Ae=0){return K(new m.ShaderMaterial({uniforms:{tone:{value:new m.Color(ue)},kind:{value:Ae}},vertexShader:se,fragmentShader:\`varying vec3 p,N;uniform vec3 tone;uniform float kind;
 float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec3 n=normalize(N);float light=max(0.,dot(n,normalize(vec3(.32,.35,.88))));float grain=sin(p.x*82.+p.z*37.)*sin(p.y*94.+p.z*61.);vec3 c=tone*(.70+.36*light);
 if(kind>.5&&kind<1.5){vec2 cell=floor(p.xy*10.),f=fract(p.xy*10.)-.5;float h=hash(cell);vec2 center=(vec2(hash(cell+13.),hash(cell+29.))-.5)*.3;float d=length((f-center)*vec2(1.,1.2));float pore=(1.-smoothstep(.07,.17,d))*step(.66,h);c*=1.-pore*.16*max(0.,n.z);c+=grain*.006;}
 if(kind>1.5&&kind<2.5)c*=1.+grain*.009+.025*sin(p.x*3.+p.y*2.);
 if(kind>2.5&&kind<3.5){vec2 q=p.xy*1.15+vec2(.15,.2),cell=floor(q),f=fract(q)-.5;float a=atan(f.y,f.x),d=length(f),petal=.20+.075*cos(a*4.+hash(cell)*6.);float flower=1.-smoothstep(petal-.025,petal+.015,d);c=mix(c,vec3(.48,.32,.58)*(.76+.24*light),flower);c*=1.+grain*.012;}
 if(kind>3.5&&kind<4.5){float a=atan(p.y,p.x),r=length(p.xy);c*=.81+.16*sin(a*38.+r*12.)+.04*sin(a*83.);c=mix(c,c*.55,smoothstep(.75,.98,r));}
 if(kind>4.5)c*=1.+sin(p.x*170.)*sin(p.y*170.)*.013;
 float sheen=pow(max(0.,dot(n,normalize(vec3(.2,.2,1.)))),24.);c+=vec3(.88,.97,.98)*sheen*.06;c=mix(c,c*vec3(.92,1.03,1.05),.14);gl_FragColor=vec4(c,1.);}\`}))}let pe=X(15716709,1),ve=X(11901763),fe=X(16112767),J=X(16184034),k=X(2306360),ne=X(9859660,5),ce=X(12737360),H=X(5681348,4),j=X(14982035,2),he=X(14453625),de=X(11846262,3),ie=X(9855065),R=X(4607570);function T(ue,Ae,Ce,B,W,V,re=.14){let ye=Math.min(.045,B*.22,Ae*.1,Ce*.1),Se=new m.Shape,Oe=-Ae/2,_e=-Ce/2;return Se.moveTo(Oe+re,_e),Se.lineTo(Oe+Ae-re,_e),Se.quadraticCurveTo(Oe+Ae,_e,Oe+Ae,_e+re),Se.lineTo(Oe+Ae,_e+Ce-re),Se.quadraticCurveTo(Oe+Ae,_e+Ce,Oe+Ae-re,_e+Ce),Se.lineTo(Oe+re,_e+Ce),Se.quadraticCurveTo(Oe,_e+Ce,Oe,_e+Ce-re),Se.lineTo(Oe,_e+re),Se.quadraticCurveTo(Oe,_e,Oe+re,_e),le(ue,new m.ExtrudeGeometry(Se,{depth:Math.max(.004,B-2*ye),bevelEnabled:!0,bevelSize:ye,bevelThickness:ye,bevelSegments:4,curveSegments:10}),W,[V[0],V[1],V[2]-B/2+ye])}function te(ue,Ae,Ce,B,W,V=!1){let re=oe(ue);re.position.set(Ae,Ce,B),M(re,J,[0,0,0],[W,W*1.13,W*.34]),V&&M(re,H,[0,-.005,W*.3],[W*.47,W*.55,W*.13]);let ye=M(re,k,[0,-.005,W*.405],[W*(V?.22:.16),W*(V?.3:.26),W*.09]);return M(re,J,[-W*.065,W*.1,W*.48],[W*.075,W*.095,W*.035]),re.userData.pupil=ye,re}let $=oe(S,"drift-sponge"),xe=oe($,"sponge-body"),Z=[],Ie=[],Ne=[];_.push($);let ee=T(xe,1.53,1.38,.53,pe,[0,.38,0],.15),Ee=ee.geometry.attributes.position;for(let ue=0;ue<Ee.count;ue++){let Ae=Ee.getX(ue),Ce=Ee.getY(ue),B=Ee.getZ(ue);Ee.setXYZ(ue,Ae+Math.sin(Ce*19+.6)*.014*Math.pow(Math.abs(Ae)/.83,4),Ce+Math.sin(Ae*17)*.013*Math.pow(Math.abs(Ce)/.75,4),B)}ee.geometry.computeVertexNormals();let Ue=[[-.62,.85,.07],[-.64,.41,.045],[-.65,-.06,.09],[.63,.94,.06],[.64,.54,.09],[.61,.05,.05],[-.45,1.01,.045],[.28,1.02,.045],[-.53,-.17,.035],[.45,-.21,.06]];for(let[ue,Ae,Ce]of Ue)M(xe,ve,[ue,Ae,.273],[Ce,Ce*.74,.008]),le(xe,new m.TorusGeometry(Ce*.79,.009,8,24),fe,[ue,Ae,.279],[1,.74,.6]),M(xe,pe,[ue-Ce*.09,Ae+Ce*.12,.282],[Ce*.56,Ce*.35,.006]),q(xe,[[ue-Ce*.75,Ae-Ce*.25,.278],[ue,Ae-Ce*.62,.282],[ue+Ce*.7,Ae-Ce*.2,.278]],.009,fe);for(let ue of[-1,1]){let Ae=te(xe,ue*.29,.63,.3,.278,!0);Z.push(Ae);for(let Ce=-1;Ce<=1;Ce++)q(xe,[[ue*.29+Ce*.12,.87,.32],[ue*.29+Ce*.16,1-Math.abs(Ce)*.025,.32]],.014,k);M(xe,pe,[ue*.49,.22,.3],[.2,.135,.065]),M(xe,he,[ue*.5,.255,.355],[.095,.055,.006]);for(let Ce=0;Ce<3;Ce++)M(xe,ce,[ue*(.46+Ce%2*.055),.25+(Ce===1?.025:-.02),.363],[.012,.012,.004])}M(xe,pe,[.015,.4,.47],[.09,.22,.13]),q(xe,[[-.51,.16,.35],[-.27,.02,.365],[0,-.005,.37],[.29,.025,.365],[.51,.16,.35]],.018,ie);for(let ue of[-1,1])T(xe,.14,.19,.045,J,[ue*.085,-.055,.391],.025);T(xe,1.47,.22,.52,J,[0,-.41,0],.06),T(xe,1.48,.42,.54,ne,[0,-.71,0],.09);for(let ue of[-1,1]){let Ae=new m.Shape;Ae.moveTo(ue*.07,-.32),Ae.lineTo(ue*.34,-.32),Ae.lineTo(ue*.19,-.5),Ae.closePath(),le(xe,new m.ExtrudeGeometry(Ae,{depth:.018,bevelEnabled:!0,bevelSize:.008,bevelThickness:.008,bevelSegments:2}),J,[0,0,.29]),T(xe,.16,.038,.025,k,[ue*.47,-.57,.293],.009),q(xe,[[ue*.57,-.62,.29],[ue*.53,-.76,.29],[ue*.36,-.79,.29]],.006,ie)}let Ve=new m.Shape;Ve.moveTo(0,-.46),Ve.lineTo(-.075,-.67),Ve.lineTo(0,-.77),Ve.lineTo(.075,-.67),Ve.closePath(),le(xe,new m.ExtrudeGeometry(Ve,{depth:.026,bevelEnabled:!0,bevelSize:.01,bevelThickness:.01,bevelSegments:2}),ce,[0,0,.29]),M(xe,ce,[0,-.44,.33],[.065,.055,.025]),q(xe,[[-.65,-.88,.28],[0,-.9,.28],[.65,-.88,.28]],.009,ie);for(let ue of[-1,1]){let Ae=oe(xe);Ae.position.set(ue*.76,-.14,0),M(Ae,J,[ue*.025,0,0],[.12,.15,.21]),q(Ae,[[ue*.05,0,0],[ue*.25,-.12,-.02],[ue*.39,-.19,.02]],.038,pe);let Ce=oe(Ae);Ce.position.set(ue*.4,-.18,.025),M(Ce,pe,[0,0,0],[.075,.08,.04]);for(let W=0;W<4;W++){let V=-.9+W*.6;q(Ce,[[ue*.035,0,0],[ue*(.1+Math.cos(V)*.055),Math.sin(V)*.105,0]],.023,pe)}Ie.push(Ae);let B=oe(xe);B.position.set(ue*.4,-.92,0),q(B,[[0,0,0],[ue*.03,-.23,0]],.038,pe),M(B,J,[ue*.03,-.34,.01],[.06,.16,.06]),q(B,[[ue*.03-.045,-.23,.045],[ue*.03+.045,-.23,.045]],.012,H),q(B,[[ue*.03-.045,-.27,.05],[ue*.03+.045,-.27,.05]],.01,ce),M(B,R,[ue*.1,-.52,0],[.19,.075,.065]),M(B,k,[ue*.1,-.49,.05],[.19,.085,.09]),Ne.push(B)}$.userData={body:xe,eyes:Z,arms:Ie,legs:Ne};function we(ue,Ae,Ce){let B=[],W=[];for(let Se=0;Se<=32;Se++){let Oe=Se/32*(Ae.length-1),_e=Math.min(Ae.length-2,Math.floor(Oe)),ge=Oe-_e,ze=Ae[Math.max(0,_e-1)],ke=Ae[_e],nt=Ae[_e+1],je=Ae[Math.min(Ae.length-1,_e+2)],Ye=ke.map((et,Ke)=>.5*(2*ke[Ke]+(-ze[Ke]+nt[Ke])*ge+(2*ze[Ke]-5*ke[Ke]+4*nt[Ke]-je[Ke])*ge*ge+(-ze[Ke]+3*ke[Ke]-3*nt[Ke]+je[Ke])*ge*ge*ge));for(let et=0;et<=28;et++){let Ke=et/28*r;B.push(Ye[0]+Math.cos(Ke)*Math.max(.003,Ye[2]),Ye[1],Math.sin(Ke)*Math.max(.003,Ye[3]))}}for(let Se=0;Se<32;Se++)for(let Oe=0;Oe<28;Oe++){let _e=Se*29+Oe,ge=_e+28+1;W.push(_e,ge,_e+1,ge,ge+1,_e+1)}for(let Se=1;Se<28;Se++){W.push(0,Se+1,Se);let Oe=928;W.push(Oe,Oe+Se,Oe+Se+1)}let ye=new m.BufferGeometry;return ye.setAttribute("position",new m.Float32BufferAttribute(B,3)),ye.setIndex(W),ye.computeVertexNormals(),le(ue,ye,Ce)}let Qe=oe(S,"drift-patrick"),ct=oe(Qe,"patrick-body"),vt=[],xt=[],tt=[];_.push(Qe),we(ct,[[0,-.73,.25,.16],[0,-.54,.56,.29],[0,-.13,.65,.35],[0,.22,.5,.29],[0,.58,.3,.23],[.015,1.1,.17,.16],[.055,1.46,.05,.06],[.065,1.53,.012,.016],[.065,1.54,.002,.002]],j);for(let ue of[-1,1]){let Ae=oe(ct);Ae.position.set(ue*.48,.13,-.015);let Ce=we(Ae,[[0,0,.25,.2],[ue*.03,.32,.19,.15],[ue*.06,.62,.12,.1],[ue*.07,.84,.015,.02],[ue*.07,.86,.002,.002]],j);Ce.rotation.z=-ue*1.75,vt.push(Ae);let B=oe(ct);B.position.set(ue*.3,-.51,-.015);let W=we(B,[[0,0,.29,.22],[ue*.035,.25,.245,.19],[ue*.08,.56,.13,.115],[ue*.12,.76,.025,.03],[ue*.12,.79,.002,.002]],j);W.rotation.z=-ue*(Math.PI-.4),xt.push(B)}let Q=[],Le=[],Ge=36,qe=16,Me=Ge+1,Re=(Ge+1)*(qe+1);for(let ue of[1,-1])for(let Ae=0;Ae<=qe;Ae++)for(let Ce=0;Ce<=Ge;Ce++){let B=Ce/Ge*2-1,W=Ae/qe,V=B*.615*(1-W*.055),re=-.88+.19*Math.exp(-B*B*16),ye=o(-.285+.018*B*B,re,W),Se=ue*(Math.sqrt(Math.max(0,1-(V/.665)**2))*.337+.004*Math.sin(V*28)*Math.sin(W*Math.PI));Q.push(V,ye,Se)}for(let ue=0;ue<2;ue++)for(let Ae=0;Ae<qe;Ae++)for(let Ce=0;Ce<Ge;Ce++){let B=ue*Re+Ae*Me+Ce,W=B+Me;ue===0?Le.push(B,W,B+1,W,W+1,B+1):Le.push(B,B+1,W,W,B+1,W+1)}let Be=[];for(let ue=0;ue<=Ge;ue++)Be.push(ue);for(let ue=1;ue<=qe;ue++)Be.push(ue*Me+Ge);for(let ue=Ge-1;ue>=0;ue--)Be.push(qe*Me+ue);for(let ue=qe-1;ue>0;ue--)Be.push(ue*Me);for(let ue=0;ue<Be.length;ue++){let Ae=Be[ue],Ce=Be[(ue+1)%Be.length];Le.push(Ae,Ce,Ae+Re,Ce,Ce+Re,Ae+Re)}let Ze=new m.BufferGeometry;Ze.setAttribute("position",new m.Float32BufferAttribute(Q,3)),Ze.setIndex(Le),Ze.computeVertexNormals();let $e=le(ct,Ze,de);for(let ue of[-1,1])q(ct,[[ue*.1,-.73,.33],[ue*.31,-.86,.29],[ue*.55,-.87,.18]],.008,de);q(ct,[[-.58,-.3,.15],[-.31,-.29,.3],[0,-.28,.337],[.31,-.29,.3],[.58,-.3,.15]],.018,de);for(let ue of[-1,1]){tt.push(te(ct,ue*.12,.69,.218,.145)),q(ct,[[ue*.04,.91,.235],[ue*.12,.95,.235],[ue*.21,.93,.215]],.018,ie),q(ct,[[ue*.03,.8,.25],[ue*.12,.85,.27],[ue*.23,.8,.24]],.012,j),M(ct,he,[ue*.31,.4,.258],[.065,.035,.007]);for(let Ae=0;Ae<4;Ae++)M(ct,he,[ue*(.3+Ae%2*.13),.13-Math.floor(Ae/2)*.14,.295],[.011,.017,.005])}q(ct,[[-.22,.4,.29],[-.1,.33,.32],[.06,.33,.33],[.24,.43,.28]],.018,ie),q(ct,[[-.05,-.11,.35],[0,-.145,.355],[.048,-.1,.35]],.012,ie),Qe.userData={body:ct,eyes:tt,arms:vt,legs:xt,shorts:$e};let Fe=\`attribute vec3 detailP,tint,bonePivot;attribute float region,part;attribute vec4 motion;
 varying vec3 p,N,tone;varying float kind;uniform float clock;
 vec3 rx(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
 vec3 ry(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
 vec3 rz(vec3 p,float a){float s=sin(a),c=cos(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
 void main(){vec3 v=position,n=normal;float ax=0.,ay=0.,az=0.,stroke=motion.x,seed=motion.y,response=motion.z,effort=motion.w;
 if(part>.5&&part<2.5){float side=part<1.5?-1.:1.,beat=stroke+side*.35;
  az=side*(.08+sin(beat)*(.16+effort*.22));ax=cos(beat-.5)*(.12+effort*.20);ay=side*sin(beat+.7)*.12;
  if(side>0.){ax+=response*.65;ay+=response*sin(clock*7.+seed)*.36;}
 }else if(part>2.5&&part<4.5){float side=part<3.5?-1.:1.;az=sin(stroke*.63+side*1.5)*.13;ax=sin(stroke*.63+side*1.5-.6)*.12;}
 else if(part>4.5){float phase=mod(clock+seed*1.7,6.7),blink=phase<.20?sin(phase/.20*3.14159265):0.,scaleY=1.-blink*.92;v.y=bonePivot.y+(v.y-bonePivot.y)*scaleY;n.y/=scaleY;}
 if(part>.5&&part<4.5){v=bonePivot+rz(ry(rx(v-bonePivot,ax),ay),az);n=rz(ry(rx(n,ax),ay),az);}
 p=detailP;tone=tint;kind=region;N=normalize(normalMatrix*mat3(instanceMatrix)*n);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(v,1.);}\`,st=pe.fragmentShader.replace("uniform vec3 tone;uniform float kind;","varying vec3 tone;varying float kind;");function ft(ue){ue.updateMatrixWorld(!0);let Ae=ue.userData,Ce=[...Ae.arms,...Ae.legs,...Ae.eyes],B={position:[],normal:[],detailP:[],tint:[],region:[],part:[],bonePivot:[]},W=[],V=new m.Vector3,re=new m.Vector3,ye=new m.Matrix3;ue.traverse(ge=>{if(!ge.isMesh)return;let ze=ge,ke=-1;for(;ze&&ze!==ue&&(ke=Ce.indexOf(ze),!(ke>=0));)ze=ze.parent;let nt=ke<0?new m.Vector3:Ce[ke].getWorldPosition(new m.Vector3),je=ge.geometry,Ye=je.attributes.position,et=je.attributes.normal,Ke=B.part.length,mt=ge.material.uniforms.tone.value,wt=ge.material.uniforms.kind.value;ye.getNormalMatrix(ge.matrixWorld);for(let yt=0;yt<Ye.count;yt++)V.fromBufferAttribute(Ye,yt),B.detailP.push(V.x,V.y,V.z),V.applyMatrix4(ge.matrixWorld),re.fromBufferAttribute(et,yt).applyMatrix3(ye).normalize(),B.position.push(V.x,V.y,V.z),B.normal.push(re.x,re.y,re.z),B.tint.push(mt.r,mt.g,mt.b),B.region.push(wt),B.part.push(ke+1),B.bonePivot.push(nt.x,nt.y,nt.z);if(je.index)for(let yt=0;yt<je.index.count;yt++)W.push(Ke+je.index.getX(yt));else for(let yt=0;yt<Ye.count;yt++)W.push(Ke+yt)});let Se=K(new m.BufferGeometry);for(let[ge,ze]of Object.entries(B))Se.setAttribute(ge,new m.Float32BufferAttribute(ze,["region","part"].includes(ge)?1:3));Se.setIndex(W),Se.setAttribute("motion",new m.InstancedBufferAttribute(new Float32Array(c*4),4).setUsage(m.DynamicDrawUsage));let Oe=K(new m.ShaderMaterial({uniforms:{clock:{value:0}},vertexShader:Fe,fragmentShader:st})),_e=new m.InstancedMesh(Se,Oe,c);return _e.instanceMatrix.setUsage(m.DynamicDrawUsage),_e.count=0,_e.frustumCulled=!1,_e.visible=!1,_e.renderOrder=6,S.add(_e),{mesh:_e,actors:[],kind:ue===$?"sponge":"patrick"}}let ht=_.map(ft);for(let ue of _)S.remove(ue),ue.visible=!1;let gt=K(new m.ShaderMaterial({transparent:!0,depthWrite:!1,vertexShader:"varying vec2 uvv;void main(){uvv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}",fragmentShader:"varying vec2 uvv;void main(){vec2 p=(uvv-.5)*3.7;float a=exp(-dot(p,p))*.16;gl_FragColor=vec4(.02,.11,.15,a);}"})),N=new m.InstancedMesh(K(new m.PlaneGeometry(3.4,4.1)),gt,c);N.instanceMatrix.setUsage(m.DynamicDrawUsage),N.count=0,N.frustumCulled=!1,N.visible=!1,N.renderOrder=1,S.add(N),E.push(N);let Pe=new m.Scene,be=i.OceanObjectOcclusion,Te=new m.Vector2,He=K(new m.BufferGeometry),rt=new m.BufferAttribute(new Float32Array(c*42*12*3),3).setUsage(m.DynamicDrawUsage),A=new m.BufferAttribute(new Float32Array(c*42*12*3),3).setUsage(m.DynamicDrawUsage);He.setAttribute("position",rt),He.setAttribute("flowData",A),He.setDrawRange(0,0);let We=K(new m.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,side:m.DoubleSide,uniforms:{clock:{value:0},frameSize:{value:Te},surfaceDepth:{value:L},layerCenters:{value:O},layerFormat:{value:new m.Vector3(be.BANDS,be.CAPACITY,be.SPAN)}},vertexShader:"attribute vec3 flowData;varying vec3 f;void main(){f=flowData;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:\`varying vec3 f;uniform float clock;uniform vec2 frameSize;uniform sampler2D surfaceDepth,layerCenters;uniform vec3 layerFormat;
 void main(){float a=(1.-smoothstep(0.,1.6,clock-f.x))*(1.-abs(f.y))*f.z*.34;if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float z=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);a*=1.-smoothstep(-.06,.06,z);}if(a<.002)discard;gl_FragColor=vec4(.76,.95,.96,a);}\`})),Xe=new m.Mesh(He,We);Xe.frustumCulled=!1,Xe.visible=!1,Pe.add(Xe);function De(ue,Ae,Ce){let B=z[Ce];for(;B.length&&Ae-B[0].t>1.6;)B.shift();if(!ue?.visible||ue.speed<.025||B.length&&Ae-B[B.length-1].t<1/24)return;let W=w(ue.u,ue.v),V=.95*ue.scale,re=Math.cos(ue.heading),ye=Math.sin(ue.heading);B.push({x:W.x,y:W.y,t:Ae,rx:re*V,ry:-ye*V,power:.5+ue.effort*.5}),B.length>42&&B.shift()}function U(ue){let Ae=0,Ce=(B,W,V,re,ye)=>{rt.setXYZ(Ae,B.x+W*B.rx+V*re*.025,B.y+W*B.ry+V*ye*.025,.015),A.setXYZ(Ae,B.t,V,B.power),Ae++};for(let B of z)for(let W=1;W<B.length;W++){let V=B[W-1],re=B[W],ye=re.x-V.x,Se=re.y-V.y,Oe=Math.hypot(ye,Se)||1;for(let _e of[-1,1])for(let[ge,ze]of[[V,-1],[V,1],[re,-1],[V,1],[re,1],[re,-1]])Ce(ge,_e,ze,-Se/Oe,ye/Oe)}He.setDrawRange(0,Ae),rt.needsUpdate=A.needsUpdate=!0,We.uniforms.clock.value=ue,Xe.visible=Ae>0}let P=new m.Object3D,at=new WeakMap,ot=[];function it(){D=null;for(let ue of ht)ue.mesh.count=0,ue.mesh.visible=!1,ue.actors.length=0;ot.length=0,N.count=0,N.visible=Xe.visible=!1,He.setDrawRange(0,0);for(let ue of z)ue.length=0}function pt(ue,Ae){C!==Ae&&(it(),C=Ae,I=0),D=ue;let Ce=0;ot.length=0;for(let B of ht)B.mesh.count=0,B.actors.length=0,B.mesh.material.uniforms.clock.value=ue.age;for(let B=0;B<c;B++){let W=ue.actors[B];if(De(W,ue.age,B),!W?.visible)continue;let V=ht[W.kind==="sponge"?0:1],re=V.mesh.count++,ye=w(W.u,W.v),Se=Math.max(W.reaction>0?Math.sin(Math.PI*(1-W.reaction/2.8)):0,W.social>0?Math.sin(Math.PI*a(W.social/2.3))*.72:0);P.position.set(ye.x,ye.y,W.z),P.rotation.set(W.pitch,W.roll,-W.heading,"ZYX"),P.scale.setScalar(W.scale),P.updateMatrix(),V.mesh.setMatrixAt(re,P.matrix),V.mesh.geometry.attributes.motion.setXYZW(re,W.stroke,W.seed,Se,W.effort),V.actors.push(W),P.position.set(ye.x+.025,ye.y-.03,-5.92),P.rotation.set(0,0,-W.heading),P.updateMatrix(),N.setMatrixAt(Ce++,P.matrix),at.has(W)||at.set(W,{z:-5.92}),ot.push(at.get(W))}for(let B of ht)B.mesh.visible=B.mesh.count>0,B.mesh.instanceMatrix.needsUpdate=!0,B.mesh.geometry.attributes.motion.needsUpdate=!0;if(N.count=Ce,N.visible=Ce>0,N.instanceMatrix.needsUpdate=!0,U(ue.age),ue.age-I>.48){I=ue.age;let B=Math.floor(ue.age*7)%ue.actors.length;for(let W=0;W<5;W++){let V=ue.actors[(B+W*13)%ue.actors.length];V.visible&&V.u>0&&V.u<1&&V.v>0&&V.v<1&&F(V.u,V.v,.008,.004)}}}function me(ue,Ae){if(!D)return!1;let Ce=null,B=1/0;for(let W of D.actors){if(!W.visible)continue;let V=(ue-W.u)*20*b(),re=(Ae-W.v)*20,ye=Math.cos(W.heading),Se=Math.sin(W.heading),Oe=V*ye-re*Se,_e=V*Se+re*ye,ge=(Oe/(1.15*W.scale))**2+(_e/(1.55*W.scale))**2;ge<1&&ge<B&&(B=ge,Ce={index:W.index})}return Ce||!1}return{render:pt,hide:it,hit:me,occlusionLayers:()=>[],occlusionBatches:()=>[...ht,{mesh:N,actors:ot}],stats:()=>({visible:N.count,bodyDraws:ht.filter(ue=>ue.mesh.visible).length,bodyTriangles:ht.reduce((ue,Ae)=>ue+Ae.mesh.geometry.index.count/3*Ae.mesh.count,0),trailVertices:He.drawRange.count}),renderSurface(ue,Ae){if(!Xe.visible)return;L?ue.getDrawingBufferSize(Te):Te.set(0,0);let Ce=ue.autoClear;ue.autoClear=!1;try{ue.render(Pe,Ae)}finally{ue.autoClear=Ce}},dispose(){it();for(let ue of[..._,...E,...ht.map(Ae=>Ae.mesh)])S.remove(ue);for(let ue of ae)ue.dispose()},models:_,batches:ht}}i.OceanDriftDuo={create:p,step:v,interact:x,pointer:y,curve:u,basePose:d,createStage:g}})(s)}function fp(s,e,t,n){(function(i){"use strict";let r=Math.PI*2,a=(_,E=0,z=1)=>Math.max(E,Math.min(z,_)),o=(_,E,z)=>_+(E-_)*z,c=new WeakMap,l=_=>(_=a(_),_*_*(3-2*_));function h(_,E,z,D){let C=[];for(let I=0;I<_.length;I++){let K=_[I],G=_[(I+1)%_.length],oe=K[0]*E+K[1]*z-D,le=G[0]*E+G[1]*z-D;if(oe<=0&&C.push(K),oe<0!=le<0){let M=oe/(oe-le);C.push([o(K[0],G[0],M),o(K[1],G[1],M)])}}return C}function u(_){let E=0,z=0,D=0;for(let C=0;C<_.length;C++){let I=_[C],K=_[(C+1)%_.length],G=I[0]*K[1]-K[0]*I[1];E+=G,z+=(I[0]+K[0])*G,D+=(I[1]+K[1])*G}return{area:Math.abs(E/2),center:Math.abs(E)>1e-8?[z/(3*E),D/(3*E)]:[0,0]}}function d(_,E){if(_.length<3)return-1/0;let z=1/0;for(let D=0;D<_.length;D++){let C=_[D],I=_[(D+1)%_.length],K=I[0]-C[0],G=I[1]-C[1],oe=Math.hypot(K,G);oe<1e-8||(z=Math.min(z,(K*(E[1]-C[1])-G*(E[0]-C[0]))/oe))}return z}function f(_,E,z,D=()=>1){c.set(_,D);let C=(Math.floor(_.seed*1e8)^1757159915)>>>0,I=()=>(C=Math.imul(C,1664525)+1013904223>>>0,C/4294967296);_.duration=116,_.entryV=.42+E()*.2,_.exitV=.24+E()*.4,_.splashes=[],_.breakAt=12+(Math.imul(C^2654435769,2246822519)>>>0)/4294967296*7;let K=Array.from({length:16},(M,q)=>{let se=q/16*r,X=1+.035*Math.sin(se*3+_.seed);return[Math.cos(se)*3.6*X,Math.sin(se)*2.65*X]});_.boundary=K;let G=[[-2.6,-.5],[-1.6,1.5],[.25,1.8],[2.4,1],[2.55,-1.2],[.65,-1.8],[-1.3,-1.7],[-.9,0],[.95,0]].map(M=>M.map(q=>q+(I()-.5)*.42));_.floes=G.map((M,q)=>{let se=K;for(let k of G){if(k===M)continue;let ne=k[0]-M[0],ce=k[1]-M[1],H=(k[0]**2+k[1]**2-M[0]**2-M[1]**2)/2;se=h(se,ne,ce,H)}se=se.filter((k,ne)=>Math.hypot(k[0]-se[(ne+1)%se.length][0],k[1]-se[(ne+1)%se.length][1])>1e-8);let X=u(se),pe=X.center;se=se.map(k=>[k[0]-pe[0],k[1]-pe[1]]);let ve=d(se,[0,0]),fe=12+I()*34,J=Math.atan2(pe[1],pe[0]);return{index:q,center:pe,polygon:se,area:X.area,radius:ve,seed:I()*r,meltAt:_.breakAt+1+I()*4,rate:ve/fe,drift:[Math.cos(J)*(.015+I()*.014),Math.sin(J)*(.015+I()*.014)],spin:(I()-.5)*.012}});let oe=[..._.floes].sort((M,q)=>M.radius/M.rate-q.radius/q.rate),le=[];for(let M=0;M<z;M++)le.push(oe[Math.round(M*(oe.length-1)/(z-1))].index);_.actors=le.map((M,q)=>({index:q,piece:M,local:[0,0],u:1.4,v:_.entryV,z:.3,heading:Math.PI,pitch:0,roll:0,visible:!0,scale:.82+E()*.12,seed:_.seed+q*1.83,reaction:0,cooldown:0,mode:"standing",hops:[],history:[],plan:null,diveAt:1/0,diveHit:1/0,checkAt:17+q*.12,landAt:0})),_.actor=_.actors[0],_.icePieces=_.floes.map(M=>p(_,0,M.index))}function p(_,E,z){if(_.iceTime===E&&_.icePieces?.[z])return _.icePieces[z];let D=_.floes[z],C=Math.max(0,E-D.meltAt),I=D.polygon;for(let X=0;X<D.polygon.length&&I.length>=3;X++){let pe=D.polygon[X],ve=D.polygon[(X+1)%D.polygon.length],fe=ve[0]-pe[0],J=ve[1]-pe[1],k=Math.hypot(fe,J),ne=J/k,ce=-fe/k,H=C*D.rate*(.79+.28*(.5+.5*Math.sin(D.seed+X*2.37)));I=h(I,ne,ce,ne*pe[0]+ce*pe[1]-H)}let K=u(I),G=Math.max(0,E-_.breakAt),oe=G*l(G/3),le=l(E/10),M={u:o(1.38,_.home.u,le),v:o(_.entryV,_.home.v,le)},q=K.area/D.area,se=.028+.26*Math.sqrt(Math.max(0,q));return{index:z,seed:D.seed,u:M.u+(D.center[0]+D.drift[0]*oe)/(20*_.ratio),v:M.v+(D.center[1]+D.drift[1]*oe)/20,z:.015+Math.sin(E*.75+D.seed)*.012*l(G/3),rotation:D.spin*oe,polygon:I,area:K.area,center:K.center,thickness:se,top:.015+Math.sin(E*.75+D.seed)*.012*l(G/3)+se*.53,visible:E>=_.breakAt&&K.area>.012,remaining:q}}function y(_,E,z){let D=Math.cos(E.rotation),C=Math.sin(E.rotation);return{u:E.u+(D*z[0]-C*z[1])/(20*_.ratio),v:E.v+(C*z[0]+D*z[1])/20,z:E.top+.015}}function x(_,E,z,D){let C=p(_,z,E.piece),I=y(_,C,E.local),K=D(E,z),G=l((z-E.landAt)/.5)*(E.plan?1-l((z-(E.plan.start-.5))/.3):1),oe=z<_.breakAt?1:a(d(C.polygon,E.local)/.65),le=K.side*G*oe;return I.u+=Math.cos(E.heading)*le/(20*_.ratio),I.v-=Math.sin(E.heading)*le/20,I.z+=K.hop*G*oe,{...I,lift:K.hop*G*oe,idleWeight:G*oe,swimming:!1,jumping:!1}}function v(_,E,z){let D=[E.center];for(let K of[.28,.52,.78])for(let G=0;G<8;G++)D.push([E.center[0]+Math.cos(G*r/8)*K,E.center[1]+Math.sin(G*r/8)*K]);let C=null,I=-1/0;for(let K of D){let G=d(E.polygon,K);if(G<.38*z.scale)continue;let oe=y(_,E,K),le=1/0;for(let q of _.actors){if(q===z)continue;let se=q.plan?.targetPiece===E.index?q.plan.targetLocal:q.mode==="standing"&&q.piece===E.index?q.local:null;se&&(le=Math.min(le,Math.hypot(K[0]-se[0],K[1]-se[1])))}if(le<.53)continue;let M=G+Math.min(1,le)*.2;M>I&&(I=M,C={local:K,world:oe,edge:G})}return C}function g(_,E,z=c.get(_)||(()=>1)){let D=.42/(20*_.ratio),C=.42/20,I=1/0;for(let[K,G]of[[0,0],[-D,0],[D,0],[0,-C],[0,C]])I=Math.min(I,z(E.u+K,E.v+G));return I}function m(_,E,z){let D=p(_,z,E.piece),C=d(D.polygon,E.local);if(!(C<.36*E.scale||D.area<.62||D.thickness<.085))return;let K=null,G=-1/0,oe=y(_,D,E.local),le=z+.48;for(let q of _.floes){if(q.index===E.piece)continue;let se=p(_,le+1.15,q.index);if(!se.visible||se.area<Math.max(.8,D.area*1.3)||se.remaining<.12)continue;let X=v(_,se,E,le+1.15);if(!X)continue;let pe=Math.hypot((X.world.u-oe.u)*20*_.ratio,(X.world.v-oe.v)*20);if(pe>3.35||pe<.12)continue;let ve=se.area/(1+pe*.9)+X.edge*.7;ve>G&&(G=ve,K={targetPiece:q.index,targetLocal:X.local,to:X.world,distance:pe})}let M={start:le,fromPiece:E.piece,fromLocal:[...E.local],water:!K};if(K)Object.assign(M,K),M.duration=.8+K.distance*.15,M.height=.48+K.distance*.22,M.to=y(_,p(_,le+M.duration,K.targetPiece),K.targetLocal);else{let q=_.floes[E.piece],se=Math.atan2(q.center[0],q.center[1]);M.duration=1.15,M.height=.8,M.to={u:oe.u+Math.sin(se)*1.45/(20*_.ratio),v:oe.v+Math.cos(se)*1.45/20,z:-.62};for(let X=0;X<60&&g(_,M.to)<.08;X++)M.to.u+=.012,M.to.v-=.006;M.heading=Math.atan2((M.to.u-oe.u)*_.ratio,M.to.v-oe.v),E.diveAt=le}if(M.from=y(_,p(_,le,E.piece),E.local),E.plan=M,E.hops.push({start:le,duration:M.duration,water:M.water}),M.water){let q=0,se=1;for(let X=0;X<28;X++){let pe=(q+se)/2;o(M.from.z,M.to.z,pe)+4*pe*(1-pe)*M.height>0?q=pe:se=pe}E.diveHit=le+(q+se)/2*M.duration}E.history.push({at:z,from:E.piece,to:K?.targetPiece??"water",area:D.area,support:C,distance:K?.distance??1.45,targetArea:K?p(_,le+M.duration,K.targetPiece).area:0})}function S(_,E){let z=_.plan,D=a((E-z.start)/z.duration),C=l(D),I=4*D*(1-D)*z.height;return{u:o(z.from.u,z.to.u,C),v:o(z.from.v,z.to.v,C),z:o(z.from.z,z.to.z,D)+I,lift:I,jumping:!0,swimming:!1,idleWeight:0,progress:D}}function w(_,E,z){let D=18+E.index*.4,C=E.swimRadius??1.65+.12*E.index,I=E.swimHeading,K=-I+z/D*r;return{u:E.water.u+(Math.cos(K)-Math.cos(I))*C/(20*_.ratio),v:E.water.v+(Math.sin(K)+Math.sin(I))*C/20}}function b(_,E,z,D){let C=w(_,E,18+E.index*.4+a(D)*z.duration),I=l(D);return{u:o(C.u,z.u,I),v:o(C.v,z.v,I)}}function F(_,E,z=c.get(_)||(()=>1)){let D=(Math.floor(E.seed*1e7)^Math.imul(E.index+1,1757159915))>>>0,C=()=>(D=Math.imul(D,1664525)+1013904223>>>0,D/4294967296),I=["top","right","bottom"],K=Math.floor(C()*3),G=oe=>g(_,oe,z)>.025;E.swimRadius=1.65+.12*E.index;for(let oe=0;oe<20;oe++){let le=!0;for(let M=0;M<64;M++)if(!G(w(_,E,(18+E.index*.4)*M/64))){le=!1;break}if(le)break;E.swimRadius*=.8}for(let oe=0;oe<3;oe++)for(let le=0;le<24;le++){let M=I[(K+oe)%3],q=.16+C()*.76,se={edge:M,u:M==="right"?1.24:q,v:M==="top"?1.24:M==="bottom"?-.24:q,duration:9};if(!G({u:M==="right"?.99:q,v:M==="top"?.99:M==="bottom"?.01:q}))continue;let pe=!0;for(let ve=0;ve<=48;ve++){let fe=b(_,E,se,ve/48);if(fe.u>=0&&fe.u<=1&&fe.v>=0&&fe.v<=1&&!G(fe)){pe=!1;break}}if(pe)return se}return{edge:"right",u:1.24,v:a(E.water.v,.12,.88),duration:9}}function L(_,E,z){let D=z-E.swimAt,C=18+E.index*.4,{u:I,v:K}=w(_,E,D);return D>C&&({u:I,v:K}=b(_,E,E.exit,(D-C)/E.exit.duration)),{u:I,v:K,z:-.62+Math.sin(z*2+E.seed)*.035*l(D/.8),lift:0,swimming:!0,jumping:!1,idleWeight:0,progress:1}}function O(_,E,z,D){let C=_.age;_.icePieces=_.floes.map(G=>p(_,C,G.index)),_.iceTime=C,_.intactIce={polygon:_.boundary,center:[0,0],area:u(_.boundary).area,remaining:1,thickness:.288,seed:_.seed,u:o(1.38,_.home.u,l(C/10)),v:o(_.entryV,_.home.v,l(C/10)),z:.015,rotation:0,visible:C<_.breakAt},_.raft=_.intactIce.visible?1:Math.max(0,..._.icePieces.filter(G=>G.visible).map(G=>G.remaining));for(let G of _.actors){let oe={u:G.u,v:G.v,z:G.z};G.mode==="standing"&&!G.plan&&C>G.checkAt&&C>_.breakAt+.3&&(m(_,G,C),G.checkAt=C+.2);let le;if(G.plan&&C>=G.plan.start){if(G.mode="jumping",le=S(G,C),G.plan.water&&C>=G.diveHit&&!G.splashed){G.splashed=!0;let se=S(G,G.diveHit),X=\`penguin-\${G.index}-dive\`;_.marks.push(X),_.splashes.push({key:X,member:G.index,at:G.diveHit,u:se.u,v:se.v,heading:G.plan.heading,type:"in"}),D(se.u,se.v)}if(C>=G.plan.start+G.plan.duration){let se=G.plan;se.water?(G.mode="swimming",G.swimAt=se.start+se.duration,G.water={...se.to},G.swimHeading=se.heading,G.exit=F(_,G),G.plan=null,le=L(_,G,C)):(G.mode="standing",G.piece=se.targetPiece,G.local=[...se.targetLocal],G.landAt=se.start+se.duration,G.plan=null,G.checkAt=C+.45,le=x(_,G,C,z))}}else G.mode==="swimming"?le=L(_,G,C):le=x(_,G,C,z);Object.assign(G,le),G.visible=G.mode!=="swimming"||C<G.swimAt+18+G.index*.4+G.exit.duration;let M=(G.u-oe.u)*20*_.ratio,q=(G.v-oe.v)*20;G.speed=E>0?Math.hypot(M,q)/E:0,G.swimBlend=Number.isFinite(G.diveAt)?l((C-G.diveAt-.38)/1.05):0,G.desiredHeading=G.plan?Math.atan2((G.plan.to.u-G.plan.from.u)*_.ratio,G.plan.to.v-G.plan.from.v):G.swimming?Math.atan2(M,q):Math.PI+z(G,C).turn}let I=_.actors.filter(G=>G.mode==="standing").length,K=_.icePieces.filter(G=>G.visible).length;return _.phase=\`\${_.actors.length} 只企鹅 · \${C<10?"乘完整浮冰漂来":C<_.breakAt?"在完整浮冰上嬉戏":I?\`\${I} 只等待或寻找落脚处 · \${K} 块浮冰\`:_.actors.some(G=>G.jumping)?"最后的企鹅跃入海中":"结伴潜游 · 先后离开"}\`,C>=_.duration||_.actors.every(G=>!G.visible)}function ae(_,E,z){let D=_.attributes.position,C=_.attributes.normal,I=z.polygon,K=0,G=(J,k,ne)=>{let ce=k[0]-J[0],H=k[1]-J[1],j=k[2]-J[2],he=ne[0]-J[0],de=ne[1]-J[1],ie=ne[2]-J[2],R=H*ie-j*de,T=j*he-ce*ie,te=ce*de-H*he,$=Math.hypot(R,T,te)||1;for(let xe of[J,k,ne])D.setXYZ(K,...xe),C.setXYZ(K,R/$,T/$,te/$),K++},oe=[];for(let J=0;J<I.length;J++){let k=I[(J+I.length-1)%I.length],ne=I[J],ce=I[(J+1)%I.length],H=[o(ne[0],k[0],.12),o(ne[1],k[1],.12)],j=[o(ne[0],ce[0],.12),o(ne[1],ce[1],.12)];for(let de=0;de<3;de++){let ie=de/2;oe.push([(1-ie)**2*H[0]+2*(1-ie)*ie*ne[0]+ie*ie*j[0],(1-ie)**2*H[1]+2*(1-ie)*ie*ne[1]+ie*ie*j[1]])}let he=[o(ce[0],ne[0],.12),o(ce[1],ne[1],.12)];for(let de=1;de<4;de++){let ie=de/4,R=o(j[0],he[0],ie),T=o(j[1],he[1],ie),te=z.center[0]-R,$=z.center[1]-T,xe=Math.hypot(te,$)||1,Z=(1-z.remaining)*.1*Math.sin(ie*Math.PI)**2*(.5+.5*Math.sin(R*11+T*7+z.seed));oe.push([R+te/xe*Z,T+$/xe*Z])}}if(oe.length<3){_.setDrawRange(0,0),E.setDrawRange(0,0);return}let le=z.center,M=z.thickness*.53,q=-z.thickness*.47,se=Math.min(.035,z.thickness*.25),X=J=>[o(J[0],le[0],.022),o(J[1],le[1],.022),M],pe=J=>[J[0],J[1],M-se],ve=J=>[J[0],J[1],q+se],fe=J=>[o(J[0],le[0],.012),o(J[1],le[1],.012),q];for(let J=0;J<oe.length;J++){let k=oe[J],ne=oe[(J+1)%oe.length],ce=X(k),H=X(ne),j=pe(k),he=pe(ne),de=ve(k),ie=ve(ne),R=fe(k),T=fe(ne);G([le[0],le[1],M-.009*(1-z.remaining)],ce,H),G(ce,j,he),G(ce,he,H),G(j,de,ie),G(j,ie,he),G(de,R,T),G(de,T,ie),G([le[0],le[1],q],T,R),E.attributes.position.setXYZ(J,ce[0],ce[1],M+.003)}_.setDrawRange(0,K),D.needsUpdate=!0,C.needsUpdate=!0,E.setDrawRange(0,oe.length),E.attributes.position.needsUpdate=!0}i.OceanPenguinIce={create:f,step:O,iceAt:p,clip:h,measure:u,clearance:d,world:y,flight:S,updateGeometry:ae,planExit:F,exitPose:b}})(s)}function pp(s,e,t,n){(function(i){"use strict";let r=Math.PI*2,a=(M,q=0,se=1)=>Math.max(q,Math.min(se,M)),o=(M,q,se)=>M+(q-M)*se,c=M=>(M=a(M),M*M*(3-2*M)),l=(M,q,se)=>c((M-q)/(se-q)),h=M=>(M=a(M),M*M*M*(M*(M*6-15)+10));function u(M,q,se,X,pe,ve,fe,J){let k=a(M/q),ne=X*q,ce=pe*q*q/2,H=ve-se-ne-ce,j=fe*q-ne-2*ce,he=J*q*q-2*ce;return se+ne*k+ce*k*k+(10*H-4*j+he/2)*k**3+(-15*H+7*j-he)*k**4+(6*H-3*j+he/2)*k**5}function d(M,q){let se=M-q,X=.68,pe=3.4,ve=4.8,fe=2*ve/(pe-X),J;if(se<0)J=u(se+.65,.65,0,0,0,-.32,0,0);else if(se<X)J=u(se,X,-.32,0,0,.88,ve,-fe);else if(se<pe){let k=se-X;J=.88+ve*k-fe*k*k/2}else se<4.15?J=u(se-pe,4.15-pe,.88,-ve,-fe,-.65,0,0):J=u(se-4.15,1.15,-.65,0,0,0,0,0);return{height:J,advance:.95*h((se+.15)/3.7)}}function f(M,q,se,X=0){let pe=a(M/3.3),ve=.5+.5*Math.sin(se*(.83+.035*Math.sin(q))+q),fe=(1-h((ve-.25)/.65))*(1-pe)**2*.24;return{effort:a(.16+pe*.94-fe+X*.12),beatHz:.45+pe*1.95-fe*.4}}let p={dolphin:"好奇的海豚",duo:"今天什么也不干"};function y(M,q,se,X,pe=()=>1){if(!Object.hasOwn(p,M))throw new RangeError("Unknown visitor event: "+M);let ve=se(.61+q()*.09,.48+q()*.12),fe={type:M,age:0,duration:{dolphin:50,duo:44}[M]||44,home:ve,ratio:X,phase:"",marks:[],reaction:0,cooldown:0,actor:{u:1.2,v:ve.v,z:-.65,heading:-Math.PI/2,pitch:0,roll:0,visible:!0},seed:q()*r,raft:1};if(M==="dolphin"){let J=(ve.v-.54)*.3;fe.entryV=.32+q()*.34,fe.exitV=.2+q()*.6,fe.route=[[0,1.26,fe.entryV],[4,.82,.49+J],[8,.64,.76+J],[12,.37,.66+J],[16,.33,.34+J],[20,.58,.24+J],[24,.82,.39+J],[29,.69,.66+J],[35,.53,.46+J],[40,.7,.3+J],[44,.85,o(.43,fe.exitV,.35)],[48,1.28,fe.exitV]].map(([k,ne,ce],H,j)=>({t:k,...H===0||H===j.length-1?{u:ne,v:ce}:se(ne,ce)})),fe.curve=m(fe.route),fe.splashes=[],fe.batchCount=4+Math.min(3,Math.floor(q()*4)),fe.batches=[],fe.actors=[];for(let k=0;k<fe.batchCount;k++){let ne=2+Math.min(3,Math.floor(q()*4)),ce=k*15,H=(q()-.5)*.055;fe.batches.push({count:ne,startAt:ce});for(let j=0;j<ne;j++){let he=fe.seed+k*2.7+j*1.9;fe.actors.push({batch:k,startAt:ce,drift:H,u:1.26,v:fe.entryV,z:-.8,heading:-Math.PI/2,pitch:0,roll:0,visible:!1,lag:j*.62,side:[-.6,.68,-.92,.94,0][j],seed:he,scale:.91+q()*.12,rose:q(),stroke:he,effort:.5,turn:0,bend:0,reaction:0,cooldown:0,leapAt:ce+22+j*4.6,air:0})}}fe.duration=50+(fe.batchCount-1)*15;for(let k of fe.actors){k.heading=w(fe,0,X,k).heading,k.flex=0,k.contacts={};for(let[ne,ce,H]of[["out",.1,1.4],["in",2.1,4.1]]){let j=k.leapAt+ce,he=k.leapAt+H;for(let de=0;de<28;de++){let ie=(j+he)/2,R=w(fe,ie,X,k),T=b(R,k);ne==="out"&&T<0||ne==="in"&&T>0?j=ie:he=ie}k.contacts[ne]=(j+he)/2}}fe.actor=fe.actors[0]}return M==="duo"&&i.OceanDriftDuo.create(fe,q,pe),L(fe,0),fe}function x(M,q){let se=(q+M.seed*1.6+(M.index||0)*1.13)%12.8,X=(ce,H)=>{let j=(se-ce)/H;return j>0&&j<1?Math.sin(j*Math.PI)**2:0},pe=(ce,H)=>{let j=q-ce,he=j%2.8/H;return q<10&&j>0&&he<1?Math.sin(he*Math.PI)**2:0},ve=Math.max(X(2.1,.6),pe(.6+(M.index||0)*.22,.68)),fe=Math.max(X(2.92,.68),pe(1.65+(M.index||0)*.18,.64)),J=X(5.1,2.1),k=X(8.1,1.9),ne=X(10.6,1.15);return{hop:ve*.24+fe*.17,preen:J,shuffle:k,flap:ne,turn:Math.sin(q*.78+M.seed)*.7+Math.sin(q*.31+(M.index||0))*.25,headTurn:Math.sin(q*1.35+M.seed)*.48+Math.sin(q*2.1+M.seed*.7)*.12,side:Math.sin((se-8.1)/1.9*r)*k*.105,bounce:ve+fe,rock:Math.sin(q*3.2+M.seed)*.065,phase:se}}function v(M,q){let se=0,X=0,pe=0;for(let{start:H,duration:j}of M.hops||[{start:M.hop1,duration:1.25},{start:M.hop2,duration:1.25},{start:M.diveAt,duration:1.4}]){se=Math.max(se,l(q,H-.55,H-.14)*(1-l(q,H-.14,H+.14)));let he=q-H-j;he>=0&&he<.5&&(X=Math.max(X,Math.sin(Math.PI*he/.5)*Math.exp(-he*4))),pe=Math.max(pe,l(q,H-.8,H-.18)*(1-l(q,H+.05,H+.4)))}let ve=M.speed||0,fe=M.swimBlend??0,J=M.stroke??q*(5.6+a(ve/3)*3)+M.seed,k=x(M,q),ne=.5+.5*Math.sin(q*1.3+M.seed),ce=Math.sin(J)*(.38+.23*ne);return{crouch:se,landing:X,anticipation:pe,stroke:ce,clock:J,swim:fe,idle:k,breath:Math.sin(q*1.8+M.seed)*.012}}function g(M,q,se){let X=M.age,pe=i.OceanPenguinIce.step(M,q,x,se);for(let ve of M.actors){ve.reaction=Math.max(0,ve.reaction-q),ve.cooldown=Math.max(0,ve.cooldown-q),ve.stroke=(ve.stroke??ve.seed)+q*(5.6+a(ve.speed/3)*3);let fe=x(ve,X);ve.idleAction=ve.idleWeight?fe.hop>.01?"small-hop":fe.preen>.1?"preen":fe.shuffle>.1?"shuffle":fe.flap>.1?"flipper-stretch":"look-around":"travel";let J=Math.atan2(Math.sin(ve.desiredHeading-ve.heading),Math.cos(ve.desiredHeading-ve.heading)),k=q===0?1:1-Math.exp(-q*6);ve.heading+=J*k,ve.bank=a(J,-.6,.6),ve.screenU=ve.u+(ve.lift||0)*.004/M.ratio,ve.screenV=ve.v+(ve.lift||0)*.027;let ne=v(ve,X),ce=ve.swimBlend,H=ve.swimming?Math.PI/2+Math.sin(ne.clock-.4)*.065:ve.jumping?Math.sin(ve.progress*Math.PI)*.45*(1-ce)+ce*Math.PI/2:.26+ne.anticipation*.16+fe.preen*.2*(ve.idleWeight||0);ve.pitch+=(H-ve.pitch)*k,ve.roll+=(Math.sin(X*2+ve.seed)*.035*(1-ce)-ve.bank*ce*.35-ve.roll)*k}return pe}function m(M){let q={};for(let se of["u","v"]){let X=M.length,pe=Array(X).fill(0),ve=Array(X).fill(0),fe=Array(X).fill(0),J=Array(X).fill(0);pe[0]=pe[X-1]=1;for(let k=1;k<X-1;k++){let ne=M[k].t-M[k-1].t,ce=M[k+1].t-M[k].t,H=ne/pe[k-1];pe[k]=2*(ne+ce)-H*fe[k-1],fe[k]=ce,ve[k]=6*((M[k+1][se]-M[k][se])/ce-(M[k][se]-M[k-1][se])/ne)-H*ve[k-1]}for(let k=X-2;k>=0;k--)J[k]=(ve[k]-fe[k]*J[k+1])/pe[k];q[se]=J}return q}function S(M,q,se,X){let pe=d(q,X.leapAt),ve=q-X.startAt-X.lag+pe.advance,fe=M.route,J=a(ve,0,48),k=0;for(;k<fe.length-2&&J>fe[k+1].t;)k++;let ne=fe[k],ce=fe[k+1],H=ce.t-ne.t,j=(ce.t-J)/H,he=(J-ne.t)/H,de={};for(let T of["u","v"]){let te=M.curve[T][k],$=M.curve[T][k+1];de[T]=j*ne[T]+he*ce[T]+((j*j*j-j)*te+(he*he*he-he)*$)*H*H/6,de["d"+T]=(ce[T]-ne[T])/H+((1-3*j*j)*te+(3*he*he-1)*$)*H/6}let ie=ve-J;de.u+=de.du*ie,de.v+=de.dv*ie;let R=(q-X.startAt)*.055;return de.u+=Math.sin(R)*X.side/(20*se),de.v+=Math.cos(R)*X.side/20+X.drift*Math.sin(Math.PI*a(ve/48))**2,de.z=-.88+.07*Math.sin(q*.48+X.seed)+pe.height,de}function w(M,q,se,X){let pe=S(M,q,se,X),ve=S(M,q-.015,se,X),fe=S(M,q+.015,se,X),J=.03,k=(fe.u-ve.u)*20*se,ne=(fe.v-ve.v)*20,ce=Math.hypot(k,ne);return{...pe,heading:ce>1e-5?Math.atan2(k,ne):Math.atan2(pe.du*se,pe.dv),speed:ce/J,pitch:ce>1e-5?Math.atan2(fe.z-ve.z,ce):0}}function b(M,q){return M.z+q.scale*(1.25*Math.sin(M.pitch)-.07*Math.cos(M.pitch))}function F(M,q,se,X){let pe=M.age,ve=Math.min(M.batchCount-1,Math.floor(pe/15));M.phase=\`\${M.batchCount} 批 · 共 \${M.actors.length} 只粉海豚 · 第 \${ve+1} 批\${pe<M.batches[ve].startAt+5?"结伴游入":"环游跃水"}\`;for(let fe=0;fe<M.actors.length;fe++){let J=M.actors[fe];if(J.visible=pe>=J.startAt&&pe<J.startAt+50,!J.visible)continue;let k=J.heading,ne=w(M,pe,se,J),ce=w(M,pe+.08,se,J);J.reaction=Math.max(0,J.reaction-q),J.cooldown=Math.max(0,J.cooldown-q);let H=J.reaction>0?Math.sin(Math.PI*(1-J.reaction/3.2))**2:0,j=Math.atan2(Math.sin(ce.heading-ne.heading),Math.cos(ce.heading-ne.heading))/.08;Object.assign(J,{u:ne.u,v:ne.v,z:ne.z+H*.25}),J.air=h((J.z+.1)/1.8);let he=Math.max(0,J.z);J.screenU=J.u+he*.006/se,J.screenV=J.v+he*.03,J.heading=k+Math.atan2(Math.sin(ne.heading-k),Math.cos(ne.heading-k));let de=q===0?1:1-Math.exp(-q*10),ie=Math.sin(J.stroke-.6)*(.025+J.effort*.075)*(1-J.air);J.pitch+=(ne.pitch+ie-J.pitch)*de,J.roll+=(a(j*.42,-.34,.34)+H*.48+Math.sin(pe*.7+J.seed)*.035*(1-J.air)-J.roll)*de,J.turn=j,J.bend+=(a(j*.12,-.16,.16)-J.bend)*(1-Math.exp(-q*5));let R=f(ne.speed,J.seed,pe,H);J.effort+=(R.effort-J.effort)*de,J.beatHz=(J.beatHz??R.beatHz)+(R.beatHz-(J.beatHz??R.beatHz))*de,J.stroke+=q*r*J.beatHz*(1-J.air*.86),J.speed=ne.speed,J.flex+=(a((ce.pitch-ne.pitch)/.08*.48,-.52,.52)*J.air-J.flex)*de;for(let T of["out","in"]){let te=\`dolphin-\${fe}-\${T}\`,$=J.contacts[T];if(pe>=$&&!M.marks.includes(te)){let xe=w(M,$,se,J),Z=J.scale*(1.25*Math.cos(xe.pitch)+.07*Math.sin(xe.pitch)),Ie=xe.u+Math.sin(xe.heading)*Z/(20*se),Ne=xe.v+Math.cos(xe.heading)*Z/20;M.marks.push(te),M.splashes.push({key:te,member:fe,type:T,at:$,u:Ie,v:Ne,heading:xe.heading,surfaceZ:b(xe,J)}),X(Ie,Ne)}}}return M.stroke=M.actor.stroke,M.speed=M.actor.speed,M.turn=M.actor.turn,pe>=M.duration}function L(M,q,{aspect:se=M.ratio,splash:X=()=>{}}={}){return q=a(q,0,.05),M.age+=q,M.reaction=Math.max(0,M.reaction-q),M.cooldown=Math.max(0,M.cooldown-q),M.type==="dolphin"?F(M,q,se,X):M.type==="penguin"?g(M,q,X):M.type==="duo"?i.OceanDriftDuo.step(M,q):M.age>=M.duration}function O(M,q=0){if(!M||M.age>M.duration-4)return!1;if(M.type==="duo")return i.OceanDriftDuo.interact(M,q);if(M.type==="dolphin"||M.type==="penguin"){let se=M.actors[q];return!se||se.cooldown>0||!se.visible?!1:(se.reaction=M.reaction=3.2,se.cooldown=M.cooldown=4,!0)}return!1}function ae(M){let q=[],se=[],X=[],pe=[[-1.59,.025,.035,0],[-1.34,.065,.075,0],[-1.06,.12,.13,0],[-.72,.21,.23,0],[-.28,.31,.31,0],[.2,.355,.345,0],[.63,.335,.33,.025],[.9,.285,.31,.065],[1.07,.235,.27,.09],[1.18,.145,.155,.045],[1.25,.095,.068,-.075],[1.46,.075,.052,-.082],[1.65,.036,.032,-.082],[1.7,.001,.002,-.082]],ve=40,fe=104;for(let ne=0;ne<=fe;ne++){let ce=ne/fe*(pe.length-1),H=Math.min(pe.length-2,Math.floor(ce)),j=ce-H,he=pe[Math.max(0,H-1)],de=pe[H],ie=pe[H+1],R=pe[Math.min(pe.length-1,H+2)],T=te=>.5*(2*de[te]+(-he[te]+ie[te])*j+(2*he[te]-5*de[te]+4*ie[te]-R[te])*j*j+(-he[te]+3*de[te]-3*ie[te]+R[te])*j*j*j);for(let te=0;te<=ve;te++){let $=te/ve*r;q.push(Math.cos($)*Math.max(.001,T(1)),o(de[0],ie[0],j),Math.sin($)*Math.max(.002,T(2))+T(3)),se.push(0)}}for(let ne=0;ne<fe;ne++)for(let ce=0;ce<ve;ce++){let H=ne*(ve+1)+ce,j=H+ve+1;X.push(H,j,H+1,j,j+1,H+1)}for(let ne=1;ne<ve;ne++){X.push(0,ne+1,ne);let ce=fe*(ve+1);X.push(ce,ce+ne,ce+ne+1)}function J(ne,ce=!1){let H=se.length,j=20,he=[];for(let ie=0;ie<=(ne.length-1)*5;ie++){let R=ie/5,T=Math.min(ne.length-2,Math.floor(R)),te=R-T,$=ne[Math.max(0,T-1)],xe=ne[T],Z=ne[T+1],Ie=ne[Math.min(ne.length-1,T+2)];he.push(xe.map((Ne,ee)=>{let Ee=.5*(2*xe[ee]+(-$[ee]+Z[ee])*te+(2*$[ee]-5*xe[ee]+4*Z[ee]-Ie[ee])*te*te+(-$[ee]+3*xe[ee]-3*Z[ee]+Ie[ee])*te*te*te);return ee>2?Math.max(.001,Ee):Ee}))}for(let[ie,R,T,te,$]of he)for(let xe=0;xe<=j;xe++){let Z=xe/j*r,Ie=Math.sin(Z)*$*(.8+.2*Math.cos(Z));q.push(ie+(ce?Ie:0),R+Math.cos(Z)*te,T+(ce?0:Ie)),se.push(1)}let de=X.length;for(let ie=0;ie<he.length-1;ie++)for(let R=0;R<j;R++){let T=H+ie*(j+1)+R,te=T+j+1;X.push(T,te,T+1,te,te+1,T+1)}for(let ie=1;ie<j;ie++){X.push(H,H+ie+1,H+ie);let R=H+(he.length-1)*(j+1);X.push(R,R+ie,R+ie+1)}if(!ce&&ne[1][0]>ne[0][0])for(let ie=de;ie<X.length;ie+=3){let R=X[ie];X[ie]=X[ie+1],X[ie+1]=R}}J([[0,-.16,.2,.32,.07],[0,-.17,.31,.3,.058],[0,-.2,.43,.23,.044],[0,-.26,.56,.16,.028],[0,-.35,.66,.09,.017],[0,-.45,.7,.018,.005],[0,-.48,.7,.001,.001]],!0);for(let ne of[-1,1])J([[ne*.24,.43,-.13,.24,.055],[ne*.38,.32,-.17,.24,.045],[ne*.55,.17,-.21,.19,.032],[ne*.72,-.01,-.24,.12,.022],[ne*.84,-.18,-.25,.045,.01],[ne*.87,-.23,-.25,.001,.001]]),J([[0,-1.64,0,.105,.052],[ne*.17,-1.65,.005,.2,.055],[ne*.36,-1.7,.015,.215,.044],[ne*.55,-1.79,.023,.17,.032],[ne*.72,-1.91,.027,.1,.018],[ne*.83,-2.02,.03,.03,.007],[ne*.86,-2.05,.03,.001,.001]]);let k=new M.BufferGeometry;return k.setAttribute("position",new M.Float32BufferAttribute(q,3)),k.setAttribute("fin",new M.Float32BufferAttribute(se,1)),k.setIndex(X),k.computeVertexNormals(),k}let _=\`attribute float fin;uniform float stroke,effort,turn,air,flex;varying vec3 localP,worldN,worldP;varying float isFin;
vec3 deform(vec3 original){vec3 p=original;float aft=clamp((.65-p.y)/2.7,0.,1.15),phase=stroke-aft*2.25,drive=.20+effort*.95;
float tail=1.-smoothstep(-1.55,-1.25,original.y);float angle=sin(stroke-2.)*(.17+effort*.70)*(1.-air*.85)*tail;float y=p.y+1.35;p.y=-1.35+cos(angle)*y-sin(angle)*p.z;p.z=sin(angle)*y+cos(angle)*p.z;
float arch=(original.y-.1)/1.8;p.z+=sin(phase)*aft*aft*drive*(1.-air*.88)+flex*aft*aft+air*.10*(1.-clamp(arch*arch,0.,1.));
p.x+=sin(phase+.8)*aft*aft*(.025+effort*.21)*(1.-air*.85)-turn*aft*aft;
float tip=smoothstep(.25,.85,abs(p.x)),flipper=step(.5,fin)*step(-.65,original.y);p.z+=flipper*tip*((.035+effort*.045)*sin(stroke-.5)+turn*.55*sign(p.x));return p;}
void main(){vec3 p=deform(position);float e=.002;vec3 x=(deform(position+vec3(e,0.,0.))-p)/e,y=(deform(position+vec3(0.,e,0.))-p)/e,z=(deform(position+vec3(0.,0.,e))-p)/e;vec3 n=normal.x*cross(y,z)+normal.y*cross(z,x)+normal.z*cross(x,y);localP=position;vec4 wp=modelMatrix*vec4(p,1.);worldP=wp.xyz;worldN=normalize(mat3(modelMatrix)*normalize(n));isFin=fin;gl_Position=projectionMatrix*viewMatrix*wp;}\`,E=\`precision highp float;uniform float rose,clock;varying vec3 localP,worldN,worldP;varying float isFin;
void main(){vec3 p=localP,n=normalize(worldN);
if(!gl_FrontFacing)n=-n;
vec3 bellyCol=vec3(1.0,.96,.97);
vec3 flankCol=mix(vec3(.99,.85,.90),vec3(1.0,.88,.92),rose*.5);
vec3 dorsalCol=mix(vec3(.96,.76,.82),vec3(.98,.80,.85),rose*.5);
float saddle=smoothstep(-.15,.22,p.z)+sin(p.y*1.8)*.06;
vec3 c=mix(bellyCol,flankCol,smoothstep(.0,.44,saddle));
c=mix(c,dorsalCol,smoothstep(.38,.90,saddle));
float throatBlush=smoothstep(.5,1.2,p.y)*(1.-smoothstep(-.25,.0,p.z));
c=mix(c,vec3(1.0,.88,.91),throatBlush*.4*(.8+rose*.4));
if(isFin>.5){
 vec3 finCol=mix(vec3(.97,.79,.85),vec3(.95,.73,.80),smoothstep(-.05,.45,p.z));
 c=mix(c,finCol,.85);
}
float eyeDist=length(vec2((abs(p.x)-.228)*1.4,(p.y-1.035)));
float eyeRing=1.-smoothstep(.022,.055,eyeDist);
float pupil=1.-smoothstep(.012,.024,eyeDist);
c=mix(c,vec3(.75,.48,.55),eyeRing*step(.015,p.z)*(1.-isFin)*.55);
c=mix(c,vec3(.12,.06,.09),pupil*step(.015,p.z)*(1.-isFin));
c+=pupil*.14*max(0.,n.z);
float mouth=(1.-smoothstep(.006,.016,abs(p.z+.09)))*smoothstep(.95,1.23,p.y)*(1.-smoothstep(1.58,1.67,p.y))*(1.-isFin);
c=mix(c,vec3(.85,.55,.62),mouth*.55);
float blowhole=length(vec2(p.x*1.6,(p.y-.78)*.78));
c=mix(c,vec3(.70,.45,.52),(1.-smoothstep(.025,.045,blowhole))*step(.30,p.z)*(1.-isFin));
vec3 sunDir=normalize(vec3(.35,.42,.84));
float NdotL=max(0.,dot(n,sunDir));
float wrapLight=max(0.,dot(n,sunDir)*.5+.5);
vec3 ambientSky=vec3(.96,.94,.97)*(.72+.28*max(0.,n.z));
vec3 directSun=vec3(1.0,.98,.96)*(NdotL*.35+wrapLight*.40);
vec3 halfway=normalize(sunDir+vec3(0.,0.,1.));
float specPower=worldP.z>0.?32.:20.;
float specIntensity=worldP.z>0.?.36:.16;
float sheen=pow(max(0.,dot(n,halfway)),specPower)*specIntensity;
float fresnel=pow(1.-max(0.,dot(n,vec3(0.,0.,1.))),3.);
vec3 rimColor=(vec3(1.0,.86,.92)*.75+vec3(.40,.92,.96)*.25)*fresnel*.22;
vec3 result=c*(ambientSky*.58+directSun*.52)+vec3(1.0,.96,.98)*sheen+rimColor;
float watery=sin(worldP.x*2.4+sin(worldP.y*2.8+clock*1.4)+clock*1.8)*cos(worldP.y*2.6-worldP.x*1.9-clock*1.3);
float caustic=pow(max(0.,watery),2.4)*max(0.,n.z*.8+.2)*smoothstep(.20,-.40,worldP.z);
result+=vec3(.70,.96,1.)*caustic*.16;
if(worldP.z<0.){result=mix(result,vec3(.30,.85,.90),clamp(-worldP.z*.08,0.,.14));}
gl_FragColor=vec4(clamp(result,0.,1.),1.);}\`,z=.95;function D(M,q){let X=M.stroke??0,pe=M.effort??.5,ve=q*.87,fe=-.23,J=-.25,k=a((.65-fe)/2.7,0,1.15),ne=X-k*2.25,ce=.2+pe*.95,H=M.air||0;J+=Math.sin(ne)*k*k*ce*(1-H*.88)+(M.flex||0)*k*k+H*.1*(1-a(((-.23-.1)/1.8)**2)),ve+=Math.sin(ne+.8)*k*k*(.025+pe*.21)*(1-H*.85)-(M.bend||0)*k*k;let j=c((Math.abs(ve)-.25)/.6);J+=j*((.035+pe*.045)*Math.sin(X-.5)+(M.bend||0)*.55*Math.sign(ve));let he=M.pitch||0,de=M.roll||0,ie=Math.cos(he),R=Math.sin(he),T=Math.cos(de),te=Math.sin(de),$=ie*fe-R*J,xe=R*fe+ie*J,Z=T*ve+te*xe;return{x:(Math.cos(M.heading)*Z+Math.sin(M.heading)*$)*M.scale,y:(-Math.sin(M.heading)*Z+Math.cos(M.heading)*$)*M.scale}}function C(M,q,se,X){for(;M.length&&se-M[0].at>z;)M.shift();let pe=M[M.length-1];if(!(q?.visible&&q.speed>.25&&q.air<.12&&q.z>-1.25&&q.z<.05)||pe&&(se-pe.at<.012||Math.hypot((q.u-pe.u)*20*X,(q.v-pe.v)*20)<.012))return M;let fe=!!pe&&se-pe.at<.12&&Math.hypot((q.u-pe.u)*20*X,(q.v-pe.v)*20)<.65;return M.push({u:q.u,v:q.v,at:se,heading:q.heading,scale:q.scale,seed:q.seed,depth:q.z-.25,left:D(q,-1),right:D(q,1),join:fe}),M.length>64&&M.shift(),M}let I=\`varying float born,edge,flowDepth,hue;uniform float clock;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
void main(){float age=clamp((clock-born)/.95,0.,1.);
float alpha=(1.-smoothstep(.50,1.,abs(edge)))*pow(1.-age,1.5)*.68;
float spectrum=.5+.5*sin(hue+born*5.5);
vec3 tint=spectrum<.5?mix(vec3(.25,.94,.90),vec3(.72,.52,.98),spectrum*2.):mix(vec3(.72,.52,.98),vec3(1.,.55,.75),(spectrum-.5)*2.);
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(flowDepth-.08,flowDepth+.12,height);}
if(alpha<.004)discard;gl_FragColor=vec4(tint,alpha);}\`,K=\`varying vec2 tex;uniform float life,impact;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
void main(){vec2 p=(tex-.5)*2.;float r=length(p),radius=.10+.74*sqrt(life),warp=(noise(p*9.)-.5)*.08,edge=abs(r-radius+warp);
vec2 cells=p*47.+noise(p*9.)*.45,cell=floor(cells),f=fract(cells)-.5,center=vec2(hash(cell),hash(cell+17.))*.3-.15;float bubbles=1.-smoothstep(.13,.39,length(f-center));
float ring=1.-smoothstep(.02,.085,edge),grains=(.25+.75*bubbles)*(.75+.25*noise(p*35.)),patches=mix(.22,1.,smoothstep(.20,.63,noise(p*8.)));
float core=(1.-smoothstep(.07,.42,r))*(1.-smoothstep(.04,.52,life));float alpha=(ring*grains*patches*.92+core*(.35+.65*bubbles)*.74)*pow(1.-life,1.18)*impact;
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(.05,.28,height);}
if(alpha<.008)discard;gl_FragColor=vec4(.95,.99,1.,alpha);}\`;function G(M,q){let se=M.age;if(M.type!=="penguin"||!M.intactIce?.visible||se<=0||se>=11.8)return 0;let X=(M.home.u-1.38)*20*M.ratio,pe=(M.home.v-M.entryV)*20,ve=Math.hypot(X,pe);if(ve<.001)return 0;let fe=-pe/ve,J=X/ve,k=Math.atan2(pe,X),ne=de=>{let ie=a(de/10),R=c(ie);return{x:(1.38+X/(20*M.ratio)*R-.5)*20*M.ratio,y:(M.entryV+pe/20*R-.5)*20,strength:a(ve*.6*ie*(1-ie)/1.8)}},ce=de=>{let ie=Math.cos(de),R=Math.sin(de),T=1/0;for(let te=0;te<M.boundary.length;te++){let $=M.boundary[te],xe=M.boundary[(te+1)%M.boundary.length],Z=xe[0]-$[0],Ie=xe[1]-$[1],Ne=ie*Ie-R*Z;if(Math.abs(Ne)<1e-8)continue;let ee=($[0]*Ie-$[1]*Z)/Ne,Ee=($[0]*R-$[1]*ie)/Ne;ee>0&&Ee>=0&&Ee<=1&&(T=Math.min(T,ee))}return[ie*T,R*T]},H=0,j=(de,ie)=>{for(let[R,T]of[[de,-1],[de,1],[ie,-1],[ie,-1],[de,1],[ie,1]])q(R.x+R.nx*R.width*T,R.y+R.ny*R.width*T,.045,R.alpha,T,R.phase),H++},he=ne(se);if(se<10)for(let de=0;de<48;de++){let ie=[de,de+1].map(R=>{let T=k-1.38+R/48*2.76,te=ce(T),$=Math.cos(T),xe=Math.sin(T);return{x:he.x+te[0]+$*.045,y:he.y+te[1]+xe*.045,nx:$,ny:xe,width:.055,alpha:he.strength*.43*Math.sin(R/48*Math.PI)**.45,phase:R/48*10}});j(...ie)}for(let de of[-1,1]){let ie=ce(k+de*Math.PI/2);for(let R=0;R<32;R++){let T=[R,R+1].map(te=>{let $=te/32*1.8,xe=se-$,Z=ne(Math.max(0,xe)),Ie=$*.22;return{x:Z.x+ie[0]+fe*de*(.035+Ie),y:Z.y+ie[1]+J*de*(.035+Ie),nx:fe,ny:J,width:.045+$*.035,alpha:xe>0&&xe<10?Z.strength*.38*(1-$/1.8)**1.5:0,phase:$*5+de}});j(...T)}}return H}let oe=\`varying vec3 flow;uniform float clock;uniform sampler2D surfaceDepth,layerCenters;uniform vec2 frameSize;uniform vec3 layerFormat;
void main(){float grain=.72+.28*sin(flow.z*11.-clock*4.);float alpha=flow.x*(1.-smoothstep(.05,1.,abs(flow.y)))*grain;
if(frameSize.x>1.){float raw=texture2D(surfaceDepth,gl_FragCoord.xy/frameSize).r,packed=raw*layerFormat.x,index=floor(packed);float height=index<layerFormat.y?texture2D(layerCenters,vec2((index+.5)/layerFormat.y,.5)).r-(fract(packed)-.5)*layerFormat.z:35.-mix(.1,80.,raw);alpha*=1.-smoothstep(.06,.18,height);}
if(alpha<.003)discard;gl_FragColor=vec4(.76,.96,.98,alpha);}\`;function le({THREE:M,scene:q,toWorld:se,aspect:X,splash:pe,ripple:ve,breachSplash:fe=(ce,H)=>pe(ce,H),surfaceDepth:J,layerCenters:k,surfaceParticles:ne}){let ce=i.OceanDriftDuo.createStage({THREE:M,scene:q,toWorld:se,aspect:X,ripple:ve,surfaceDepth:J,layerCenters:k}),H={},j=new M.SphereGeometry(1,28,18),he=new Set([j]),de=(V,re,ye,Se=[0,0,0],Oe=[1,1,1])=>{he.add(re);let _e=new M.Mesh(re,ye);return _e.position.set(...Se),_e.scale.set(...Oe),V.add(_e),_e},ie=(V,re,ye,Se)=>de(V,j,re,ye,Se),R=V=>{let re=new M.Group;return V?.add(re),re};function T(V,re,ye,Se,Oe=!1){let _e=new M.Shape;if(Oe){let ge=re.length;_e.moveTo((re[ge-1][0]+re[0][0])/2,(re[ge-1][1]+re[0][1])/2);for(let ze=0;ze<ge;ze++){let ke=re[ze],nt=re[(ze+1)%ge];_e.quadraticCurveTo(ke[0],ke[1],(ke[0]+nt[0])/2,(ke[1]+nt[1])/2)}}else{_e.moveTo(...re[0]);for(let ge=1;ge<re.length;ge++)_e.lineTo(...re[ge])}return _e.closePath(),de(V,new M.ExtrudeGeometry(_e,{depth:ye,bevelEnabled:!0,bevelSize:ye*.45,bevelThickness:ye*.4,bevelSegments:2,steps:1,curveSegments:12}),Se,[0,0,-ye/2])}let te=ae(M),$=Array.from({length:35},()=>{let V=R(),re=new M.ShaderMaterial({side:M.DoubleSide,vertexShader:_,fragmentShader:E,uniforms:{clock:{value:0},stroke:{value:0},effort:{value:.5},turn:{value:0},air:{value:0},flex:{value:0},rose:{value:.5}}});return he.add(re),de(V,te,re),V.userData={material:re,wake:0},V.visible=!1,V.renderOrder=4,V});H.dolphin=$[0];for(let V of $.slice(1))q.add(V);function xe(V){let re=new M.ShaderMaterial({uniforms:{tone:{value:new M.Color(V)},clock:{value:0}},vertexShader:"varying vec3 p,n;void main(){p=position;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec3 p,n;uniform vec3 tone;uniform float clock;void main(){vec3 N=normalize(n);if(!gl_FrontFacing)N=-N;float light=max(0.,dot(N,normalize(vec3(.32,.35,.88))));float grain=sin(p.x*110.+p.z*73.)*sin(p.y*95.-p.z*57.);vec3 c=tone*(.62+.42*light)*(1.+grain*.006);c=mix(c,c*vec3(.85,1.03,1.06),.18);gl_FragColor=vec4(c,1.);}"});return he.add(re),re}let Z=xe(2241339),Ie=xe(14672597),Ne=xe(11899220),ee=xe(858400),Ee=R(),Ue=R(Ee),Ve=[[0,.035],[.12,.06],[.235,.18],[.298,.39],[.285,.6],[.235,.78],[.16,.92],[.1,.99],[0,1.02]].map(([V,re])=>new M.Vector2(V,re)),we=de(Ue,new M.LatheGeometry(Ve,40),Z);we.rotation.x=Math.PI/2,we.scale.z=.84,ie(Ue,Ie,[0,-.173,.48],[.232,.105,.39]);let Qe=R(Ue);Qe.position.set(0,-.08,1.02),ie(Qe,Z,[0,0,0],[.19,.215,.215]),ie(Qe,Ie,[0,-.154,.112],[.133,.082,.078]);for(let V of[-1,1])ie(Qe,Ie,[V*.107,-.17,-.035],[.073,.065,.112]),ie(Qe,Ie,[V*.132,-.108,.115],[.055,.085,.065]),ie(Qe,ee,[V*.147,-.18,.051],[.015,.013,.016]);let ct=de(Qe,new M.ConeGeometry(.055,.205,16),Ne,[0,-.238,-.054],[1,1,.65]);ct.rotation.z=Math.PI;let vt=[],xt=[];for(let V of[-1,1]){let re=R(Ue);re.position.set(V*.25,.015,.82),T(re,[[0,.02],[V*.1,-.015],[V*.19,.04],[V*.21,.15],[V*.14,.19],[V*.03,.12]],.035,Z,!0).rotation.x=-Math.PI/2,re.scale.set(1,1,2.5),vt.push(re);let ye=R(Ue);ye.position.set(V*.12,-.015,.045),T(ye,[[-.075,.035],[-.095,-.16],[-.035,-.145],[.01,-.19],[.055,-.14],[.09,-.15],[.075,.03]],.025,Ne,!0),xt.push(ye)}let tt=T(Ue,[[-.1,.15],[0,.36],[.1,.15]],.04,Z,!0);tt.position.z=.22;let Q=R();Ue.name="penguin-body",Qe.name="penguin-head",tt.name="penguin-tail",vt.forEach((V,re)=>V.name=\`penguin-wing-\${re}\`),xt.forEach((V,re)=>V.name=\`penguin-foot-\${re}\`);let Le=[Ee,...Array.from({length:5},()=>Ee.clone(!0))];for(let V of Le)V.userData={bird:V.getObjectByName("penguin-body"),head:V.getObjectByName("penguin-head"),tail:V.getObjectByName("penguin-tail"),feet:[V.getObjectByName("penguin-foot-0"),V.getObjectByName("penguin-foot-1")],wings:[V.getObjectByName("penguin-wing-0"),V.getObjectByName("penguin-wing-1")]},V.visible=!1,V.renderOrder=6,q.add(V);H.penguin=Ee;let Ge=new M.ShaderMaterial({side:M.DoubleSide,vertexShader:"varying vec2 p;varying vec3 N;varying float level;void main(){p=position.xy;level=position.z;N=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:\`varying vec2 p;varying vec3 N;varying float level;
 float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 void main(){float frost=noise(p*1.3)*.82+noise(p*6.)*.15+noise(p*23.)*.03;float veins=pow(1.-abs(sin(p.x*2.5+p.y*1.5+noise(p*1.3)*4.)),20.);vec3 c=mix(vec3(.52,.80,.86),vec3(.88,.96,.97),smoothstep(.08,.95,frost));float top=smoothstep(.15,.8,abs(N.z)),wet=1.-smoothstep(.015,.14,level);c=mix(c*vec3(.72,.90,.96),c,top);c=mix(c,vec3(.22,.58,.68),wet*.28);c+=veins*.025*top;c*=.78+.26*max(0.,dot(normalize(N),normalize(vec3(.32,.35,.88))));gl_FragColor=vec4(c,1.);}\`});he.add(Ge);let qe=Array.from({length:10},()=>{let V=R(),re=new M.BufferGeometry,ye=new M.BufferGeometry;re.setAttribute("position",new M.BufferAttribute(new Float32Array(4096*3),3).setUsage(M.DynamicDrawUsage)),re.setAttribute("normal",new M.BufferAttribute(new Float32Array(4096*3),3).setUsage(M.DynamicDrawUsage)),re.setDrawRange(0,0),ye.setAttribute("position",new M.BufferAttribute(new Float32Array(256*3),3).setUsage(M.DynamicDrawUsage)),ye.setDrawRange(0,0),he.add(ye);let Se=de(V,re,Ge);Se.frustumCulled=!1;let Oe=new M.LineBasicMaterial({color:5275270,transparent:!0,opacity:0,depthWrite:!1});he.add(Oe);let _e=new M.LineLoop(ye,Oe);return _e.frustumCulled=!1,V.add(_e),V.userData={surface:Se,cracks:_e,crackMaterial:Oe},V.renderOrder=5,q.add(V),V.visible=!1,V});Q.visible=!1;let Me={};for(let V of Object.keys(H)){let re=H[V];re.visible=!1,q.add(re);let ye=new M.ShaderMaterial({transparent:!0,depthWrite:!1,uniforms:{opacity:{value:.18}},vertexShader:"varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec2 v;uniform float opacity;void main(){float a=exp(-dot((v-.5)*5.,(v-.5)*5.));gl_FragColor=vec4(.02,.12,.14,a*opacity);}"});he.add(ye),Me[V]=de(q,new M.PlaneGeometry(V==="dolphin"?3:2.5,4),ye),Me[V].visible=!1,Me[V].renderOrder=1}let Re=[Me.dolphin,...$.slice(1).map(()=>{let V=Me.dolphin.material.clone();he.add(V);let re=de(q,Me.dolphin.geometry,V);return re.visible=!1,re.renderOrder=1,re})],Be=[Me.penguin,...Le.slice(1).map(()=>{let V=Me.penguin.material.clone();he.add(V);let re=de(q,Me.penguin.geometry,V);return re.visible=!1,re.renderOrder=1,re})],Ze=new M.PlaneGeometry(.85,.68),$e=Le.map(()=>{let V=new M.ShaderMaterial({transparent:!0,depthWrite:!1,uniforms:{opacity:{value:0}},vertexShader:"varying vec2 p;void main(){p=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec2 p;uniform float opacity;void main(){float a=exp(-dot(p*5.,p*5.))*opacity;if(a<.003)discard;gl_FragColor=vec4(.08,.20,.23,a);}"});he.add(V);let re=de(q,Ze,V);return re.visible=!1,re.renderOrder=5,re}),Fe=new M.Scene,st=new M.Vector2,ft=new M.PlaneGeometry(1,1),ht=Array.from({length:8},()=>{let V=R(),re=i.OceanObjectOcclusion,ye=new M.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,side:M.DoubleSide,uniforms:{life:{value:0},impact:{value:1},surfaceDepth:{value:J},layerCenters:{value:k},frameSize:{value:st},layerFormat:{value:new M.Vector3(re.BANDS,re.CAPACITY,re.SPAN)}},vertexShader:"varying vec2 tex;void main(){tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:K});return he.add(ye),de(V,ft,ye),V.userData.material=ye,V.visible=!1,Fe.add(V),V}),gt=$.map(()=>[]),N=new M.BufferGeometry,Pe=new Float32Array(4410*6*3),be=new Float32Array(4410*6*4);N.setAttribute("position",new M.BufferAttribute(Pe,3).setUsage(M.DynamicDrawUsage)),N.setAttribute("wakeData",new M.BufferAttribute(be,4).setUsage(M.DynamicDrawUsage)),N.setDrawRange(0,0);let Te=i.OceanObjectOcclusion,He=new M.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,side:M.DoubleSide,uniforms:{clock:{value:0},surfaceDepth:{value:J},layerCenters:{value:k},frameSize:{value:st},layerFormat:{value:new M.Vector3(Te.BANDS,Te.CAPACITY,Te.SPAN)}},vertexShader:"attribute vec4 wakeData;varying float born,edge,flowDepth,hue;void main(){born=wakeData.x;edge=wakeData.y;flowDepth=wakeData.z;hue=wakeData.w;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:I}),rt=new M.Mesh(N,He);rt.frustumCulled=!1,rt.visible=!1,he.add(N),he.add(He),Fe.add(rt);let A=new M.BufferGeometry,We=new M.BufferAttribute(new Float32Array(768*3),3).setUsage(M.DynamicDrawUsage),Xe=new M.BufferAttribute(new Float32Array(768*3),3).setUsage(M.DynamicDrawUsage);A.setAttribute("position",We),A.setAttribute("flowData",Xe),A.setDrawRange(0,0);let De=new M.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,side:M.DoubleSide,uniforms:{clock:{value:0},surfaceDepth:{value:J},layerCenters:{value:k},frameSize:{value:st},layerFormat:{value:new M.Vector3(Te.BANDS,Te.CAPACITY,Te.SPAN)}},vertexShader:"attribute vec3 flowData;varying vec3 flow;void main(){flow=flowData;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:oe}),U=new M.Mesh(A,De);U.frustumCulled=!1,U.visible=!1,Fe.add(U),he.add(A),he.add(De);function P(V){let re=0,ye=G(V,(Se,Oe,_e,ge,ze,ke)=>{We.setXYZ(re,Se,Oe,_e),Xe.setXYZ(re,ge,ze,ke),re++});A.setDrawRange(0,ye),U.visible=ye>0,De.uniforms.clock.value=V.age,We.needsUpdate=Xe.needsUpdate=!0}function at(V){let re=0;for(let ye=0;ye<gt.length;ye++){let Se=C(gt[ye],V.actors[ye],V.age,X());for(let Oe=1;Oe<Se.length;Oe++){let _e=Se[Oe];if(!_e.join)continue;let ge=Se[Oe-1];for(let ze of[-1,1])for(let[ke,nt]of[[ge,-1],[ge,1],[_e,-1],[_e,-1],[ge,1],[_e,1]]){let je=Math.cos(ke.heading),Ye=-Math.sin(ke.heading),et=.022*ke.scale,Ke=ze<0?ke.left:ke.right,mt=se(ke.u,ke.v);Pe[re*3]=mt.x+Ke.x+je*nt*et,Pe[re*3+1]=mt.y+Ke.y+Ye*nt*et,Pe[re*3+2]=.04,be[re*4]=ke.at,be[re*4+1]=nt,be[re*4+2]=ke.depth,be[re*4+3]=ke.seed+ze*.6,re++}}}N.setDrawRange(0,re),rt.visible=re>0,He.uniforms.clock.value=V.age,N.attributes.position.needsUpdate=!0,N.attributes.wakeData.needsUpdate=!0}ne&&Fe.add(ne);let ot=null,it=0,pt=0;function me(V,re,ye,Se){let Oe=se(re,ye);V.position.set(Oe.x,Oe.y,Se)}function ue(){ce.hide();for(let V of[...Object.values(H),...$,...Le,...qe,...Be,...$e,...Object.values(Me),...Re,...ht,rt,U])V.visible=!1;for(let V of gt)V.length=0;N.setDrawRange(0,0),A.setDrawRange(0,0),Q.visible=!1,ot=null}function Ae(V,re){if(!V){ue();return}if(it!==re){ue(),it=re,pt=0;for(let Oe of $)Oe.userData.wake=0}ot=V;let ye=V,Se=ye.age;if(ye.type==="duo"){ce.render(ye,re);return}if(ye.type==="dolphin"){for(at(ye);pt<ye.splashes.length;pt++){let _e=ye.splashes[pt];fe(_e.u,_e.v,_e.type,_e.heading)}let Oe=ye.splashes.filter(_e=>Se-_e.at<(_e.type==="in"?1.8:1.25)).slice(-ht.length);for(let _e=0;_e<ht.length;_e++){let ge=ht[_e],ze=Oe[_e],ke=ze?Se-ze.at:-1,nt=ze?.type==="in"?1.8:1.25;if(ge.visible=ke>=0&&ke<nt,!ge.visible)continue;me(ge,ze.u,ze.v,.08);let je=ze.type==="in"?5.2:3.4;ge.rotation.z=-ze.heading,ge.scale.set(je*.72,je*1.14,1),ge.userData.material.uniforms.life.value=a(ke/nt),ge.userData.material.uniforms.impact.value=ze.type==="in"?1:.68}for(let _e=0;_e<$.length;_e++){let ge=ye.actors[_e],ze=$[_e],ke=Re[_e];if(ze.visible=ke.visible=!!ge?.visible,!ge?.visible)continue;me(ze,ge.screenU,ge.screenV,ge.z),ze.rotation.set(ge.pitch,ge.roll,-ge.heading,"ZYX"),ze.scale.setScalar(ge.scale*(1+Math.max(0,ge.z)*.035)),ze.renderOrder=ge.z>0?6:3;let nt=ze.userData.material.uniforms;nt.clock??={value:0},nt.clock.value=Se,nt.stroke.value=ge.stroke,nt.effort.value=ge.effort,nt.turn.value=ge.bend,nt.rose.value=ge.rose,nt.air.value=ge.air,nt.flex.value=ge.flex;let je=Math.max(0,ge.z);if(me(ke,ge.u+.004+je*.015/X(),ge.v-.008-je*.012,-5.92),ke.rotation.z=-ge.heading,ke.scale.setScalar(ge.scale*(1+je*.05)),ke.material.uniforms.opacity.value=.2*(1-a(ge.z/9)),Se<.1&&(ze.userData.wake=0),Se-ze.userData.wake>.4&&ge.u>0&&ge.u<1&&ge.v>0&&ge.v<1&&Math.abs(ge.z)<1){ze.userData.wake=Se;let Ye=ge.u-Math.sin(ge.heading)*1.25/(20*X()),et=ge.v-Math.cos(ge.heading)*1.25/20;for(let Ke of[-1,1])ve(Ye+Ke*Math.cos(ge.heading)*.2/(20*X()),et-Ke*Math.sin(ge.heading)*.2/20,.014,.005)}}return}if(ye.type==="penguin"){P(ye);let Oe=ye.splashes.filter(_e=>Se-_e.at<1.4).slice(-ht.length);for(let _e=0;_e<ht.length;_e++){let ge=ht[_e],ze=Oe[_e];ge.visible=!!ze,ze&&(me(ge,ze.u,ze.v,.035),ge.scale.set(1.35,1.75,1),ge.rotation.z=-ze.heading,ge.userData.material.uniforms.life.value=a((Se-ze.at)/1.4),ge.userData.material.uniforms.impact.value=.62)}for(let _e=0;_e<qe.length;_e++){let ge=_e===9?ye.intactIce:ye.icePieces[_e],ze=qe[_e];ze.visible=!!ge?.visible,ze.userData.cracks.visible=!1,ze.visible&&(i.OceanPenguinIce.updateGeometry(ze.userData.surface.geometry,ze.userData.cracks.geometry,ge),me(ze,ge.u,ge.v,ge.z),ze.rotation.z=ge.rotation)}for(let _e=0;_e<Le.length;_e++){let ge=ye.actors[_e],ze=Le[_e],ke=Be[_e],nt=$e[_e];if(ze.visible=ke.visible=!!ge?.visible,nt.visible=!!ge?.visible&&!ge.swimming&&!ge.jumping,!ge?.visible)continue;me(ze,ge.screenU??ge.u,ge.screenV??ge.v,ge.z),ze.scale.setScalar(ge.scale*(1+(ge.lift||0)*.02)),ze.rotation.set(ge.pitch,ge.roll,Math.PI-ge.heading,"ZYX"),ze.renderOrder=ge.swimming?3:6;let je=ze.userData,Ye=v(ge,Se),et=Ye.swim,Ke=Ye.idle,mt=ge.idleWeight||0,wt=Ye.crouch*.17+Ye.landing*.13+Ke.bounce*.045*mt;je.head.rotation.z=(Ke.headTurn+Ke.preen*.55)*mt+Math.sin(Se*.85+ge.seed)*.08*(1-et)*(1-mt),je.head.rotation.x=Ye.anticipation*.14+Math.sin(Ye.clock-.6)*.035*et+Ke.preen*.48*mt,je.head.position.z=1.02-wt*.18,je.head.position.y=-.08-Ke.preen*.035*mt,je.bird.position.z=Ye.breath-wt*.25+Math.sin(Ye.clock-.5)*.025*et,je.bird.scale.set(1+wt*.25,1+wt*.16,1-wt),je.bird.rotation.z=(Ke.rock+Ke.shuffle*Math.sin(Se*12+ge.seed)*.11)*mt*(1-Ye.anticipation),je.bird.rotation.x=Ye.anticipation*.1+Ye.landing*.08+Ke.preen*.1*mt,je.wings.forEach((Mt,At)=>{let Rt=At?1:-1,pn=.12+Math.sin(Se*1.7+ge.seed+At*.4)*.06,Tt=ge.jumping?.8*Math.sin(Math.PI*ge.progress):0,Pt=mt*(Ke.flap*(.38+Math.sin(Se*15+ge.seed)*.18)+Ke.bounce*.45+(At===ge.index%2?Ke.preen*.48:0));Mt.rotation.y=Rt*o(pn+Tt+Ye.anticipation*.35+Pt,.7+Ye.stroke,et),Mt.rotation.x=Math.sin(Ye.clock-.7)*.2*et,Mt.rotation.z=Rt*ge.bank*et*.22,ge.reaction>0&&(Mt.rotation.y+=Rt*Math.sin(ge.reaction*10)*Math.sin(Math.PI*ge.reaction/3.2)*.4)}),je.feet.forEach((Mt,At)=>{let Rt=Math.sin(Se*(3.7+Ke.shuffle*7)+ge.seed+At*Math.PI);Mt.rotation.x=o(Rt*(.13+Ke.shuffle*.23)*(1-Ye.anticipation),-.38+Math.sin(Ye.clock+.8+At*.25)*.14,et),Mt.position.z=.045+Math.max(0,Rt)*(.018+Ke.shuffle*.06)*mt}),je.tail.rotation.x=Math.sin(Ye.clock-1.2)*.1*et+Ke.bounce*.17*mt,me(ke,ge.u+.004,ge.v-.008,-5.92),ke.scale.setScalar(ge.scale),ke.rotation.z=-ge.heading,ke.material.uniforms.opacity.value=.16;let yt=Ke.hop*mt;me(nt,ge.u,ge.v,ge.z-yt-.02),nt.rotation.z=-ge.heading,nt.scale.setScalar(ge.scale*(1+yt*.8)),nt.material.uniforms.opacity.value=.18*(1-yt*1.5),ge.swimming&&Se-(ze.userData.wake||0)>.42&&(ze.userData.wake=Se,ve(ge.u,ge.v,.018,.005))}for(;pt<ye.splashes.length;pt++){let _e=ye.splashes[pt];fe(_e.u,_e.v,"in",_e.heading),ve(_e.u,_e.v,.16,.016)}return}}function Ce(V,re){if(!ot)return!1;if(ot.type==="duo")return ce.hit(V,re);let ye=ot.type==="dolphin",Se=ot.actors||[ot.actor],Oe=null;for(let _e=0;_e<Se.length;_e++){let ge=Se[_e];if(!ge.visible)continue;let ze=(V-(ge.screenU??ge.u))*20*X(),ke=(re-(ge.screenV??ge.v))*20,nt=Math.cos(ge.heading),je=Math.sin(ge.heading),Ye=ze*nt-ke*je,et=ze*je+ke*nt,Ke=(ge.scale||1)*(ye?1+Math.max(0,ge.z)*.035:1);(Ye/((ye?.56:.65)*Ke))**2+(et/((ye?1.9:.75)*Ke))**2<1&&(!Oe||ge.z>Oe.z)&&(Oe={index:_e,z:ge.z})}return Oe?{index:Oe.index}:!1}function B(){let V=ce.occlusionLayers();for(let re of[...Object.values(H),...$.slice(1),...Le.slice(1),...qe,...$e])re.visible&&V.push({group:re,z:re.position.z,solidIce:qe.includes(re)});return V}function W(V,re){if(ce.renderSurface(V,re),!ht.some(Se=>Se.visible)&&!rt.visible&&!U.visible&&!ne?.visible)return;J?V.getDrawingBufferSize(st):st.set(0,0),ne?.material?.uniforms?.frameSize&&ne.material.uniforms.frameSize.value.copy(st);let ye=V.autoClear;V.autoClear=!1;try{V.render(Fe,re)}finally{V.autoClear=ye}}return{render:Ae,renderSurface:W,hit:Ce,occlusionLayers:B,occlusionBatches:ce.occlusionBatches,stats:ce.stats,interact:(V=0)=>O(ot,V),pointer:(V,re,ye,Se)=>i.OceanDriftDuo.pointer(ot,V,re,ye,Se),snapshot:()=>ot?JSON.parse(JSON.stringify(ot)):null,dispose(){ue(),ce.dispose();for(let V of[...ht,rt,U])Fe.remove(V);for(let V of[...Object.values(H),...$.slice(1),...Le.slice(1),...qe,...Be.slice(1),...$e,...Object.values(Me),...Re.slice(1),Q])q.remove(V);for(let V of he)V.dispose()}}}i.OceanVisitors={names:p,create:y,step:L,interact:O,createStage:le,dolphinGeometry:ae,dolphinVertex:_,dolphinFragment:E,dolphinGait:f,sampleDolphinWake:C,penguinGait:v,penguinIdle:x,iceArrivalWake:G}})(s)}function mp(s,e,t,n){(function(i){"use strict";let r=(w,b=0,F=1)=>Math.max(b,Math.min(F,w)),a=w=>(w=r(w),w*w*(3-2*w));function u(w){let b=w-18,F=r(a((b-.8)/1.5)*(1-a((b-3.1)/2.2))*.65),L=b<0?0:(1-a(b/3.4))*Math.exp(-b*.65);return{white:F,shakeX:L*(Math.sin(b*38)+.4*Math.sin(b*67)),shakeY:L*(Math.cos(b*43)-Math.cos(b*19))*.65}}function d(w){let b=1-a((w-26)/12);return{dry:a((w-19.7)/.6)*(1-a((w-26)/12)),front:b,recovery:b,phase:w<18?"旋转陨石 · 斜向坠入":w<20.3?"猛烈撞击 · 水幕爆起":w<23.3?"蒸汽白幕 · 深坑显露":w<26?"深坑余烟":w<38?"海水漫回 · 生物加速落下":w<41?"生物落水 · 即刻游动":"浅海恢复宁静"}}function f(w){return 38+(w%8===0?0:w*.61803398875%1*2.6)}function p(w,b){return Number.isFinite(w)&&w>=18&&w<f(b)}function y(w,b,F){return!Number.isFinite(b)||b<18||b>=44||b<f(F)?(w.meteorLanded=!1,!1):w.meteorLanded?!1:(w.meteorLanded=!0,!0)}function x(w,b){let F=Math.hypot((w-1.3)*.8,(b-.5)*.7),L=Math.hypot((w-.76)*.8,(b-1.35)*.7),O=Math.hypot((w-.72)*.8,(b+.35)*.7);return-Math.log(Math.exp(-F*12)+Math.exp(-L*12)+Math.exp(-O*12))/12+.012*Math.sin(w*21+b*13)+.008*Math.sin(b*31-w*17)}function v(w){let b=0;for(let F=0;F<=100;F++)for(let L=0;L<=100;L++)w(L/100,F/100)>-.032&&(b=Math.max(b,x(L/100,F/100)));return b+.115}function g(w,b,F,L){let O=f(F),ae=r((b-18)/2.2),_=1-(1-ae)*(1-ae),E=r((b-(O-1.75))/1.75),z=_*(1-E*E),D=Math.atan2(w.v-.5,(w.u-.55)*L),C=Math.sin(F*2.4),I=Math.sin(Math.PI*ae)*(1-E)+Math.sin(Math.PI*E)*.65;return{...w,u:w.u+(Math.cos(D)*.34*z+C*.25*I)/L,v:w.v+(1.5+Math.sin(D)*.16)*z,z:w.z+(25-w.z)*z,roll:(w.roll||0)+C*(Math.sin(ae*Math.PI)*2.1+Math.sin(E*Math.PI)*1.3),flip:(w.flip||0)+Math.sin(ae*Math.PI)*1.4-Math.sin(E*Math.PI)*.9,lift:z,land:O}}function m(w,b,F){let L=F%4,O=L%2?1:-1,ae=L<2?1:-1,_=r(w/18),E=.55*_+.45*_*_;return{x:(1-E)*O*(10*b+15)*20/45+E*b,y:(1-E)*ae*25*20/45,z:25-18.3*E-Math.max(0,w-18)*30}}function S(w){let b=new w.Scene,F=new w.PerspectiveCamera(2*Math.atan(10/45)*180/Math.PI,1,.1,150);F.position.z=45;let L=new w.SphereGeometry(6.7,180,120),O=L.attributes.position.array.slice(),ae=new w.ShaderMaterial({uniforms:{clock:{value:0},seed:{value:0}},vertexShader:"varying vec3 localP,N,world;void main(){localP=position;N=normalize(mat3(modelMatrix)*normal);world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}",fragmentShader:\`
 precision highp float;uniform float clock,seed;varying vec3 localP,N,world;
 float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+1.),f.x),f.y),f.z);}
 void main(){
  vec3 p=localP*.85+seed;
  float grain=n(p*22.),stone=n(p)*.55+n(p*2.2)*.28+n(p*5.5)*.17;
  float strata=abs(sin(p.z*12.+n(p*2.4)*5.5)),chips=n(p*36.);
  vec3 warped=p*1.75+vec3(n(p*1.15),n(p*1.15+7.),n(p*1.15-4.))*.95;
  float fissure=abs(n(warped)-.5),branch=abs(n(warped*3.1)-.5);
  float vein=(1.-smoothstep(.015,.052,fissure))*smoothstep(.30,.62,n(p*.72));
  float core=(1.-smoothstep(.003,.017,fissure))*vein;
  float hair=(1.-smoothstep(.005,.017,branch))*(1.-smoothstep(.06,.17,fissure))*.35;
  // Multi-frequency thermal pulsation with atmospheric friction glow
  float heat=.76+.24*n(p*2.6+vec3(0.,clock*.75,clock*.15));
  vec3 normal=normalize(N+(vec3(n(p*14.+.13),n(p*14.+3.7),n(p*14.+9.1))-.5)*.36);
  float light=.24+.76*max(0.,dot(normal,normalize(vec3(-.45,.78,.95))));
  vec3 c=mix(vec3(.055,.065,.065),vec3(.34,.27,.21),stone)*light*(.75+.40*grain);
  c*=1.-.38*(1.-smoothstep(.018,.065,abs(grain-.45)));
  c*=.75+.18*smoothstep(.07,.23,strata)+.15*chips;
  // Vibrant incandescent molten veins & burning heat emission
  c+=vec3(1.0,.22,.02)*(vein+hair)*heat*1.15+vec3(1.,.72,.22)*core*heat*1.3;
  c+=vec3(.35,.06,.01)*exp(-fissure*16.)*heat;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);}\`}),_=new w.Mesh(L,ae);b.add(_);let E={clock:ae.uniforms.clock,seed:ae.uniforms.seed,eye:{value:new w.Vector3}},z=new w.ShaderMaterial({transparent:!0,depthWrite:!1,depthTest:!1,side:w.BackSide,uniforms:E,vertexShader:"varying vec3 P;void main(){P=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:\`
 precision highp float;uniform float clock,seed;uniform vec3 eye;varying vec3 P;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float n(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+1.),f.x),f.y),f.z);}
 float fbm(vec3 p){return n(p)*.56+n(p*2.05+5.)*.29+n(p*4.2-3.)*.15;}
 void main(){
  vec3 rd=normalize(P-eye);
  // Strictly safe inverse direction to eliminate all division-by-zero NaNs
  vec3 safeRd=sign(rd)*max(abs(rd),vec3(0.0001));
  vec3 inv=1./safeRd;
  vec3 lo=(-vec3(10.,10.,9.)-eye)*inv,hi=(vec3(10.,10.,30.)-eye)*inv;
  vec3 nearT=min(lo,hi),farT=max(lo,hi);
  float start=max(0.,max(nearT.x,max(nearT.y,nearT.z)));
  float end=min(farT.x,min(farT.y,farT.z));
  float b=dot(eye,rd),disc=b*b-dot(eye,eye)+6.6*6.6;
  if(disc>0.0001){float hit=-b-sqrt(max(0.0,disc));if(hit>start)end=min(end,hit);}
  if(end<=start+0.001)discard;
  float stepSize=(end-start)/44.;
  vec4 sum=vec4(0.);
  float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.54);
  for(int i=0;i<44;i++){
    vec3 q=eye+rd*(start+(float(i)+jitter)*stepSize);
    float z=max(0.,q.z);
    vec3 flow=q*vec3(.72,.72,.28)+vec3(seed,seed*.31,-clock*3.6);
    float turb=fbm(flow+vec3(sin(q.z*.28-clock*1.6),cos(q.z*.24-clock*1.3),0.)*.62);
    float tongues=(turb-.46)*4.8;
    // Hypersonic detached bow shock sheath wrapping closely around bolide apex
    float sheath=exp(-pow((length(q)-6.9-tongues)/.58,2.))*(1.-smoothstep(2.5,10.5,q.z));
    float radius=mix(6.4,.32,clamp(z/28.,0.,1.));
    vec2 curl=vec2(sin(z*.36-clock*2.1),cos(z*.31-clock*1.8))*z*.068;
    // Swirling aerodynamic fiery tail
    float tail=(1.-smoothstep(radius*.32,radius+1.1,length(q.xy-curl)))*smoothstep(1.,7.,q.z)*(1.-smoothstep(19.,30.,q.z));
    float shape=max(sheath,tail*.70);
    float density=shape*smoothstep(.47,.72,turb)*1.02;
    float hot=clamp(shape*.68+turb*.72-z*.016,0.,1.);
    // Multi-tier incandescent plasma color gradation: white-blue core -> gold -> fiery red
    vec3 col=mix(vec3(.76,.08,.01),vec3(1.,.46,.06),smoothstep(.22,.68,hot));
    col=mix(col,vec3(1.,.88,.52),smoothstep(.69,.94,hot));
    col=mix(col,vec3(.92,.98,1.0),smoothstep(.94,1.0,hot));
    float alpha=1.-exp(-density*stepSize);
    sum.rgb+=(1.-sum.a)*alpha*col;
    sum.a+=(1.-sum.a)*alpha;
    if(sum.a>.97)break;
  }
  if(sum.a<.005)discard;
  gl_FragColor=vec4(clamp(sum.rgb/max(sum.a,.001),0.,1.),clamp(sum.a,0.,1.));}\`}),D=new w.BoxGeometry(20,20,39);D.translate(0,0,10.5);let C=new w.Mesh(D,z);C.frustumCulled=!1,C.renderOrder=2,b.add(C);let I=2800,K=new Float32Array(I*3),G=new Float32Array(I*3),oe=new Float32Array(I),le=new Float32Array(I),M=new w.BufferGeometry;for(let[R,T,te]of[["position",K,3],["tint",G,3],["size",oe,1],["alpha",le,1]])M.setAttribute(R,new w.BufferAttribute(T,te));let q=new w.ShaderMaterial({transparent:!0,depthWrite:!1,uniforms:{viewport:{value:900}},vertexShader:"attribute vec3 tint;attribute float size,alpha;uniform float viewport;varying vec3 color;varying float opacity;void main(){color=tint;opacity=alpha;vec4 v=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(size*viewport/max(1.,-v.z),1.,130.);}",fragmentShader:"varying vec3 color;varying float opacity;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=pow(1.-d*d,2.)*opacity;gl_FragColor=vec4(color,clamp(a,0.,1.));}"}),se=new w.Points(M,q);se.frustumCulled=!1,b.add(se);let X={age:{value:0},seed:ae.uniforms.seed,center:{value:new w.Vector2}},pe=new w.ShaderMaterial({transparent:!0,side:w.DoubleSide,depthWrite:!1,uniforms:X,vertexShader:\`
 uniform float age,seed;uniform vec2 center;varying vec2 tex;varying float height;
 void main(){tex=uv;float angle=uv.x*6.2831853,a=max(0.,age),crest=1.+.16*sin(angle*13.+seed)+.08*sin(angle*29.-seed);
 float radius=5.8+a*(5.5+uv.y*3.8)+sin(angle*17.+seed)*.38*uv.y;
 height=max(0.,(21.*a-8.*a*a))*uv.y*crest;
 vec3 p=vec3(center+vec2(cos(angle),sin(angle))*radius,height);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}\`,fragmentShader:\`
 uniform float age,seed;varying vec2 tex;varying float height;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){vec2 flow=vec2(tex.x*210.,tex.y*19.-age*4.);float lace=n(flow+n(flow*.31)*2.)*.7+n(flow*2.3)*.3;float tear=smoothstep(.20,.55,lace+.45*(1.-tex.y)-age*.07);
 float rim=smoothstep(.45,.98,tex.y),fade=smoothstep(0.,.08,age)*(1.-smoothstep(1.6,2.6,age));
 vec3 c=mix(vec3(.12,.68,.75),vec3(.94,.99,1.),rim*.7+lace*.3);gl_FragColor=vec4(c,clamp(tear*fade*(.47+rim*.48),0.,1.));}\`}),ve=new w.Mesh(new w.PlaneGeometry(1,1,192,12),pe);ve.frustumCulled=!1,b.add(ve);let fe=new w.Scene,J=new w.OrthographicCamera(-1,1,1,-1,0,1),k={age:{value:0},ratio:{value:1},seed:{value:0}},ne=new w.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,uniforms:k,vertexShader:"varying vec2 screenUV;void main(){screenUV=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}",fragmentShader:\`
 precision highp float;varying vec2 screenUV;uniform float age,ratio,seed;
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec4 h=fract(sin(vec4(dot(i,vec2(127,311)),dot(i+vec2(1,0),vec2(127,311)),dot(i+vec2(0,1),vec2(127,311)),dot(i+1.,vec2(127,311)))+seed)*43758.5);return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);}
 void main(){
  vec2 p=(screenUV-vec2(.55,.5))*vec2(ratio,1.);float d=length(p),a=age-18.;
  if(a<0.){
    // Elegant warm atmospheric arrival glow instead of dark muddy circle
    float pre=exp(-d*d/.38)*smoothstep(10.,18.,age)*.14;
    gl_FragColor=vec4(vec3(1.0,.85,.62),clamp(pre,0.,1.));
    return;
  }
  float safeA=max(0.,a);
  float radius=.30+safeA*.42,warp=(n(p*19.+seed)-.5)*.025;
  // Strictly positive denominators to eliminate all potential shader divide-by-zeros
  float ring=exp(-pow((d+warp-radius)/(0.015+0.008*safeA),2.));
  float backwash=exp(-pow((d+warp-radius+.048)/(0.038+0.009*safeA),2.))*.35;
  vec2 foamUV=mat2(.8,.6,-.6,.8)*p*110.+vec2(n(p*17.),n(p*19.+3.))*4.;
  float cells=n(foamUV-safeA*1.3)*.6+n(foamUV*2.13+safeA)*.4,foam=(ring+backwash)*smoothstep(.30,.67,cells);
  float flash=exp(-safeA*8.);vec2 adv=p*7.+vec2(safeA*.38,-safeA*.51);adv+=vec2(n(adv+seed),n(adv+8.))*2.1;
  float cloud=n(adv)*.57+n(adv*2.2)*.29+n(adv*4.5)*.14;
  float steam=(.48+.52*smoothstep(.20,.70,cloud))*exp(-d*d/max(.12,safeA*.65))*smoothstep(0.,.15,safeA)*(1.-smoothstep(3.7,7.,safeA));
  float contact=(1.-smoothstep(.30+safeA*.18,.43+safeA*.27,d))*smoothstep(0.,.10,safeA)*(1.-smoothstep(.9,2.7,safeA));
  vec3 c=mix(vec3(.78,.91,.92),vec3(.96,.99,.98),clamp(foam+cloud*.6,0.,1.));c=mix(c,vec3(1.,.85,.59),flash);
  float alpha=clamp(flash*.45+foam*.95*exp(-safeA*.2)+steam*.84+contact*.98,0.,.98);
  gl_FragColor=vec4(clamp(c,0.,1.),clamp(alpha,0.,1.));}\`});fe.add(new w.Mesh(new w.PlaneGeometry(2,2),ne));let ce=new w.Scene,H=new w.ShaderMaterial({transparent:!0,depthTest:!1,depthWrite:!1,uniforms:{opacity:{value:0}},vertexShader:"void main(){gl_Position=vec4(position.xy,0.,1.);}",fragmentShader:"uniform float opacity;void main(){gl_FragColor=vec4(1.,1.,1.,clamp(opacity,0.,1.));}"});ce.add(new w.Mesh(new w.PlaneGeometry(2,2),H));let j=-1,he=[];function de(R){let T=R>>>0,te=()=>(T=Math.imul(T,1664525)+1013904223>>>0,T/4294967296),$=Array.from({length:72},(Z,Ie)=>({d:new w.Vector3(te()-.5,te()-.5,te()-.5).normalize(),r:Ie<26?.12+te()*.24:.032+te()*.09,depth:Ie<26?.13+te()*.24:.024+te()*.065})),xe=L.attributes.position;for(let Z=0;Z<xe.count;Z++){let Ie=O[Z*3]/6.7,Ne=O[Z*3+1]/6.7,ee=O[Z*3+2]/6.7,Ee=1+.058*Math.sin(Ie*9+R)*Math.cos(Ne*8-ee*7)+.038*Math.sin(Ne*17+ee*12)+.014*Math.sin(Ie*51+Ne*22+R)*Math.sin(ee*45-Ne*35)+.009*Math.sin(Ne*83+Ie*65)*Math.sin(ee*59);for(let Ue of $){let Ve=Math.hypot(Ie-Ue.d.x,Ne-Ue.d.y,ee-Ue.d.z)/Ue.r;Ee-=Ue.depth*Math.exp(-Ve*Ve*3.2),Ee+=.038*Math.exp(-Math.pow((Ve-1)*6,2))}xe.setXYZ(Z,Ie*6.7*Ee,Ne*6.7*Ee,ee*6.7*Ee)}xe.needsUpdate=!0,L.computeVertexNormals(),he=Array.from({length:I},()=>[te(),te(),te(),te(),te()]),ae.uniforms.seed.value=R%1e4*.013,k.seed.value=R%1e3,j=R}let ie=new w.Vector2;return{render(R,T,te,$=1,xe=1){if(T<0||T>26)return;$!==j&&de($),F.aspect=te,F.updateProjectionMatrix();let Z=m(T,te,$),Ie=m(T-.08,te,$),Ne=new w.Vector3(Ie.x-Z.x,Ie.y-Z.y,Ie.z-Z.z).normalize();_.position.set(Z.x,Z.y,Z.z),_.rotation.set(T*.23+$,T*.31,T*.12),_.visible=T<18.18,C.visible=T<18,ae.uniforms.clock.value=T,C.position.copy(_.position),C.quaternion.setFromUnitVectors(new w.Vector3(0,0,1),Ne),C.updateMatrixWorld(!0),E.eye.value.copy(F.position),C.worldToLocal(E.eye.value),ve.visible=T>=18&&T<20.6,X.age.value=T-18,X.center.value.set(te,0);for(let Ee=0;Ee<I;Ee++){let[Ue,Ve,we,Qe,ct]=he[Ee],vt,xt,tt,Q,Le,Ge;if(T<18){let qe=(T*(.7+Ve*.5)+Ue)%1,Me=we*Math.PI*2,Re=qe*(13+Qe*13),Be=Math.sqrt(Math.max(1e-4,1-Math.pow(2*Ve-1,2)))*7.2;vt=Z.x+Math.cos(Me)*Be+Ne.x*Re+Math.sin(qe*7+we*20)*qe*.7,xt=Z.y+Math.sin(Me)*Be+Ne.y*Re+Math.cos(qe*6+we*20)*qe*.7,tt=Z.z+(2*Ve-1)*7.2+Ne.z*Re,Q=.036+ct*.11,Le=Ee<260?(1-qe)*.82:0,Ge=[1,.48+(1-qe)*.28,.14]}else{let qe=T-18,Me=Ue*.65,Re=Math.max(0,qe-Me),Be=Ve*Math.PI*2,Ze=4+we*14,$e=Ee%3===0,Fe=4.5+Ze*Re;vt=te+Math.cos(Be)*Fe+Math.sin(Re*2+we*12)*Re*.4,xt=Math.sin(Be)*Fe+Math.cos(Re*2+Ue*12)*Re*.4,tt=($e?8:19+Qe*12)*Re-($e?1.6:7.8)*Re*Re,Q=$e?1.4+Re*2.2:.12+ct*.38,Le=qe<Me||tt<0?0:r(1-Re/($e?5:4))*($e?.23:.95),Ge=$e?[.88,.93,.91]:Ee%11===0?[.38,.29,.22]:[.88,.97,.96]}K.set([vt,xt,tt],Ee*3),G.set(Ge,Ee*3),oe[Ee]=Q,le[Ee]=Le}for(let Ee of Object.values(M.attributes))Ee.needsUpdate=!0;R.getDrawingBufferSize(ie),q.uniforms.viewport.value=ie.y,k.age.value=T,k.ratio.value=te;let ee=R.autoClear;R.autoClear=!1;try{T<18&&R.render(fe,J),R.clearDepth(),R.render(b,F),T>=18&&R.render(fe,J),H.uniforms.opacity.value=u(T).white,H.uniforms.opacity.value>.001&&R.render(ce,J)}finally{R.autoClear=ee}},stats:()=>({seed:j,vertices:L.attributes.position.count,particles:I})}}i.OceanMeteor={state:d,impact:u,flight:g,create:S,path:m,landing:f,isFlying:p,reentry:y,recoveryField:x,recoveryReach:v,IMPACT:18,REFILL:26,RESTORED:38,DURATION:44}})(s)}function gp(s,e,t,n){(function(i){"use strict";class r{constructor(){this.ctx=null,this.enabled=!1,this.masterGain=null,this.swashGain=null,this.foamGain=null,this.vortexGain=null,this.swashFilter=null,this.foamFilter=null,this.vortexFilter=null,this.pentatonic=[523.25,587.33,659.25,783.99,880,1046.5,1174.66,1318.51]}init(){if(this.ctx)return;let o=t.AudioContext||t.webkitAudioContext;if(!o)return;this.ctx=new o,this.masterGain=this.ctx.createGain(),this.masterGain.gain.value=0,this.masterGain.connect(this.ctx.destination);let c=this.ctx.sampleRate,l=c*4,h=this.ctx.createBuffer(2,l,c);for(let p=0;p<2;p++){let y=h.getChannelData(p),x=0,v=0,g=0,m=0,S=0,w=0,b=0;for(let F=0;F<l;F++){let L=Math.random()*2-1;x=.99886*x+L*.0555179,v=.99332*v+L*.0750759,g=.969*g+L*.153852,m=.8665*m+L*.3104856,S=.55*S+L*.5329522,w=-.7616*w-L*.016898,y[F]=(x+v+g+m+S+w+b+L*.5362)*.045,b=L*.115926}}let u=this.ctx.createBufferSource();u.buffer=h,u.loop=!0,this.swashFilter=this.ctx.createBiquadFilter(),this.swashFilter.type="lowpass",this.swashFilter.frequency.value=260,this.swashFilter.Q.value=.8,this.swashGain=this.ctx.createGain(),this.swashGain.gain.value=.18,u.connect(this.swashFilter),this.swashFilter.connect(this.swashGain),this.swashGain.connect(this.masterGain),u.start();let d=this.ctx.createBufferSource();d.buffer=h,d.loop=!0,this.foamFilter=this.ctx.createBiquadFilter(),this.foamFilter.type="bandpass",this.foamFilter.frequency.value=1450,this.foamFilter.Q.value=.7,this.foamGain=this.ctx.createGain(),this.foamGain.gain.value=.04,d.connect(this.foamFilter),this.foamFilter.connect(this.foamGain),this.foamGain.connect(this.masterGain),d.start(0,1.3);let f=this.ctx.createBufferSource();f.buffer=h,f.loop=!0,this.vortexFilter=this.ctx.createBiquadFilter(),this.vortexFilter.type="bandpass",this.vortexFilter.frequency.value=140,this.vortexFilter.Q.value=2.4,this.vortexGain=this.ctx.createGain(),this.vortexGain.gain.value=0,f.connect(this.vortexFilter),this.vortexFilter.connect(this.vortexGain),this.vortexGain.connect(this.masterGain),f.start(0,.7)}toggle(){if(this.init(),!this.ctx)return!1;this.ctx.state==="suspended"&&this.ctx.resume(),this.enabled=!this.enabled;let o=this.ctx.currentTime;return this.masterGain.gain.cancelScheduledValues(o),this.masterGain.gain.setTargetAtTime(this.enabled?.85:0,o,.25),this.enabled&&this.playChime(3),this.enabled}toggleSound(){return this.toggle()}unlock(){this.ctx&&this.ctx.state==="suspended"&&this.ctx.resume()}updateSurf(o,c=0,l=!1,h=1){this.update(c,o,l,h)}update(o,c,l,h=1){if(!this.ctx||!this.enabled)return;let u=this.ctx.currentTime,d=Math.pow(Math.max(0,Math.sin(c*Math.PI*2)),1.6)*Math.max(.25,h),f=Math.pow(Math.max(0,Math.sin((c-.18)*Math.PI*2)),2.2)*Math.max(.2,h);this.swashFilter.frequency.setTargetAtTime(170+d*390,u,.08),this.swashGain.gain.setTargetAtTime(.11+d*.28,u,.08),this.foamFilter.frequency.setTargetAtTime(1100+f*1300,u,.08),this.foamGain.gain.setTargetAtTime(.02+f*.15,u,.08);let p=typeof l=="number"?l:l?1:0;this.vortexGain.gain.setTargetAtTime(.24*p,u,.25),p>.01&&this.vortexFilter.frequency.setTargetAtTime(110+p*35+Math.sin(o*2.5)*25,u,.1)}playSplash(o=1){if(!this.ctx||!this.enabled)return;let c=this.ctx.currentTime,l=Math.min(1.2,Math.max(.12,o)),h=this.ctx.createOscillator(),u=this.ctx.createGain();h.type="sine";let d=95+Math.random()*45;h.frequency.setValueAtTime(d,c),h.frequency.exponentialRampToValueAtTime(d*3.4,c+.19),u.gain.setValueAtTime(.24*l,c),u.gain.exponentialRampToValueAtTime(.001,c+.22),h.connect(u),u.connect(this.masterGain),h.start(c),h.stop(c+.24);let f=.35+l*.25,p=Math.floor(this.ctx.sampleRate*f),y=this.ctx.createBuffer(1,p,this.ctx.sampleRate),x=y.getChannelData(0);for(let S=0;S<p;S++)x[S]=(Math.random()*2-1)*Math.exp(-S/(this.ctx.sampleRate*(.09+l*.08)));let v=this.ctx.createBufferSource();v.buffer=y;let g=this.ctx.createBiquadFilter();g.type="bandpass",g.frequency.setValueAtTime(480,c),g.frequency.exponentialRampToValueAtTime(1650,c+f*.7),g.Q.value=1.1;let m=this.ctx.createGain();m.gain.setValueAtTime(.38*l,c),m.gain.exponentialRampToValueAtTime(.001,c+f),v.connect(g),g.connect(m),m.connect(this.masterGain),v.start(c)}playChime(o=null,c=.16){if(!this.ctx||!this.enabled)return;let l=this.ctx.currentTime,h=o!==null?Math.abs(Math.floor(o))%this.pentatonic.length:Math.floor(Math.random()*this.pentatonic.length),u=this.pentatonic[h]*(.985+Math.random()*.03),d=this.ctx.createOscillator(),f=this.ctx.createOscillator(),p=this.ctx.createGain();d.type="sine",f.type="triangle",d.frequency.setValueAtTime(u,l),d.frequency.exponentialRampToValueAtTime(u*1.03,l+.06),f.frequency.setValueAtTime(u*2,l);let y=this.ctx.createGain();y.gain.setValueAtTime(.18,l),y.gain.exponentialRampToValueAtTime(.001,l+.12),p.gain.setValueAtTime(.001,l),p.gain.linearRampToValueAtTime(c,l+.008),p.gain.exponentialRampToValueAtTime(8e-4,l+.48),d.connect(p),f.connect(y),y.connect(p),p.connect(this.masterGain),d.start(l),f.start(l),d.stop(l+.5),f.stop(l+.5)}}i.OceanAudioEngine=r})(s)}function vp(s,e,t,n){(function(i){"use strict";function r(m){return m-Math.floor(m)}function a(m,S,w){return m+(S-m)*w}function o(m,S,w){return Math.max(S,Math.min(w,m))}function c(m,S,w){let b=o((w-m)/(S-m),0,1);return b*b*(3-2*b)}function l(m,S){return r(Math.sin(m*127.1+S*311.7)*43758.5453123)}function h(m,S){let w=Math.floor(m),b=Math.floor(S),F=m-w,L=S-b,O=F*F*(3-2*F),ae=L*L*(3-2*L),_=l(w,b),E=l(w+1,b),z=l(w,b+1),D=l(w+1,b+1);return a(a(_,E,O),a(z,D,O),ae)}function u(m,S){let w=0,b=.5;for(let F=0;F<4;F++)w+=b*h(m,S),m=m*2.03+13.7,S=S*2.03+7.1,b*=.5;return w}function d(m,S,w=1){if(w<=.001){let D=(u(m*6.5+2.1,S*6.5+4.3)-.5)*.45;return 2.4+(m*.6+(1-S)*.5)*2.2+D}let b=m*1.15,F=(1-S)*1.35,L=Math.sqrt(b*b+F*F),O=.045*Math.sin(m*9+(1-S)*6)+.025*Math.cos(m*17-S*11),ae=.34*Math.pow(o(w,0,2.2),.72),_=L-ae+O;if(_<0)return _*3.8;let E=Math.pow(_,1.18)*5.2,z=(u(m*6.5+2.1,S*6.5+4.3)-.5)*.45*c(.05,.35,_);return E+z}function f(m){let S=m*.16%1,w=Math.sin(S*Math.PI*2),b=w>0?Math.pow(w,.72):-Math.pow(-w,1.35)*.65;return{phase:S,runup:b}}let p=[{u:.24,v:.52,r:.052,type:"brain",hue:0},{u:.31,v:.46,r:.038,type:"staghorn",hue:1},{u:.18,v:.36,r:.044,type:"rock",hue:2},{u:.58,v:.76,r:.058,type:"brain",hue:1},{u:.65,v:.71,r:.042,type:"table",hue:0},{u:.78,v:.58,r:.062,type:"rock",hue:2},{u:.83,v:.51,r:.046,type:"staghorn",hue:0},{u:.44,v:.22,r:.054,type:"brain",hue:1},{u:.51,v:.18,r:.039,type:"rock",hue:2},{u:.74,v:.26,r:.049,type:"table",hue:0},{u:.36,v:.61,r:.045,type:"staghorn",hue:0},{u:.62,v:.38,r:.05,type:"brain",hue:0},{u:.86,v:.33,r:.044,type:"table",hue:1},{u:.4,v:.36,r:.041,type:"rock",hue:2},{u:.69,v:.82,r:.046,type:"staghorn",hue:1},{u:.53,v:.54,r:.048,type:"brain",hue:1}],y=[{u:.44,v:.62,rx:.13,ry:.09},{u:.28,v:.42,rx:.1,ry:.11},{u:.52,v:.4,rx:.14,ry:.1},{u:.36,v:.24,rx:.11,ry:.09},{u:.68,v:.46,rx:.12,ry:.11},{u:.84,v:.72,rx:.11,ry:.09},{u:.6,v:.66,rx:.12,ry:.09},{u:.76,v:.3,rx:.12,ry:.1}];function x(m,S,w=1,b=0){if(w<=.001)return 2.4+(m*.6+(1-S)*.5)*2.2+b;let F=m*1.15,L=(1-S)*1.35,O=Math.sqrt(F*F+L*L),ae=.045*Math.sin(m*9+(1-S)*6)+.025*Math.cos(m*17-S*11),_=.34*Math.pow(o(w,0,2.2),.72),E=O-_+ae;return E<0?E*3.8:Math.pow(E,1.18)*5.2+b*c(.05,.35,E)}function v(m,S={},w=null){let b=S.beachSize!==void 0?S.beachSize:1,F=S.coralDensity!==void 0?S.coralDensity:1,L=S.grassDensity!==void 0?S.grassDensity:1,O=1024,ae=w?.albedoCanvas||e.createElement("canvas");ae.width=O,ae.height=O;let _=ae.getContext("2d"),E=w?.dataCanvas||e.createElement("canvas");E.width=O,E.height=O;let z=E.getContext("2d"),D=_.createImageData(O,O),C=z.createImageData(O,O),I=D.data,K=C.data,G=Math.round(o(F*10,0,p.length)),oe=p.slice(0,G).filter(k=>d(k.u,k.v,b)>.32),le=Math.round(o(L*5+(L>.01?1:0),0,y.length)),M=y.slice(0,le),q=w?.baseCache;if(!q){q={sandPx:new Uint8ClampedArray(O*O*4),baseDpx:new Uint8ClampedArray(O*O*4),undulation:new Float32Array(O*O),turf:new Float32Array(O*O)};for(let k=0;k<O;k++){let ne=1-k/O;for(let ce=0;ce<O;ce++){let H=ce/O,j=k*O+ce,he=j*4,de=(u(H*6.5+2.1,ne*6.5+4.3)-.5)*.45;q.undulation[j]=de;let ie=H*.76+(1-ne)*.65,R=-H*.65+(1-ne)*.76,T=u(H*14,ne*14)*.035,te=Math.sin((ie+T)*210)*.5+.5,$=Math.sin((ie*1.4-T)*420+R*40)*.5+.5,xe=te*.72+$*.28,Z=(l(ce*.7,k*.7)-.5)*14+(h(H*95,ne*95)-.5)*18;q.turf[j]=u(H*65,ne*65);let Ie=236+(xe-.4)*22+Z,Ne=221+(xe-.4)*19+Z*.9,ee=188+(xe-.4)*15+Z*.75;q.sandPx[he]=o(Math.round(Ie),0,255),q.sandPx[he+1]=o(Math.round(Ne),0,255),q.sandPx[he+2]=o(Math.round(ee),0,255),q.sandPx[he+3]=255,q.baseDpx[he]=Math.round(o(de+.5,0,1)*255),q.baseDpx[he+1]=Math.round(o(xe,0,1)*255),q.baseDpx[he+2]=0,q.baseDpx[he+3]=255}}}if(I.set(q.sandPx),K.set(q.baseDpx),L>.01){let k=o(L,0,2);for(let ne=0;ne<M.length;ne++){let ce=M[ne],H=.82+.22*Math.min(k,1.6),j=ce.rx*H,he=ce.ry*H,de=Math.max(0,Math.floor((ce.u-j*1.35)*O)),ie=Math.min(O-1,Math.ceil((ce.u+j*1.35)*O)),R=Math.max(0,Math.floor((1-(ce.v+he*1.35))*O)),T=Math.min(O-1,Math.ceil((1-(ce.v-he*1.35))*O));for(let te=R;te<=T;te++){let $=1-te/O,xe=($-ce.v)/he,Z=xe*xe;if(!(Z>=1.45))for(let Ie=de;Ie<=ie;Ie++){let Ne=Ie/O,ee=(Ne-ce.u)/j,Ee=ee*ee+Z;if(Ee>=1.45)continue;let Ue=te*O+Ie,Ve=q.undulation[Ue],we=x(Ne,$,b,Ve),Qe=c(.32,.68,we);if(Qe<=.001)continue;let vt=c(1.35,.2,Ee)*Qe*Math.min(1.3,k);if(vt<=.005)continue;let xt=Ue*4,tt=K[xt+2]/255,Q=Math.max(tt,vt);K[xt+2]=Math.round(Q*255);let Le=q.turf[Ue],Ge=40+Le*28,qe=98+Le*38,Me=54+Le*22,Re=vt*.76;I[xt]=Math.round(a(I[xt],Ge,Re)),I[xt+1]=Math.round(a(I[xt+1],qe,Re)),I[xt+2]=Math.round(a(I[xt+2],Me,Re))}}}}if(_.putImageData(D,0,0),z.putImageData(C,0,0),L>.01){let k=o(L,0,2),ne=Math.round(340*k);for(let ce=0;ce<M.length;ce++){let H=M[ce],j=.82+.22*Math.min(k,1.6),he=H.rx*j,de=H.ry*j;for(let ie=0;ie<ne;ie++){let R=l(ce*71+ie,ie*1.3)*Math.PI*2,T=Math.sqrt(l(ie*2.7,ce*19)),te=1+.16*Math.sin(R*3+ce*2.1)+.1*Math.cos(R*5-ce),$=T*te,xe=H.u+Math.cos(R)*$*he,Z=H.v+Math.sin(R)*$*de,Ie=d(xe,Z,b),Ne=c(.32,.68,Ie),ee=c(1.3,.3,$),Ee=Ne*ee*Math.min(1,k*1.15);if(l(ce*93.1+ie*4.7,ie*11.3)>Ee)continue;let Ve=xe*O,we=(1-Z)*O,Qe=.5+.5*Ee,ct=(9+l(ie,ce*3.7)*15)*Qe,vt=-.55+(l(ce,ie*4.1)-.5)*.7,xt=Ve+Math.cos(vt)*ct,tt=we+Math.sin(vt)*ct,Q=(Ve+xt)*.5-3.2,Le=(we+tt)*.5-3.2;_.beginPath(),_.moveTo(Ve+1.8,we+1.8),_.quadraticCurveTo(Q+1.8,Le+1.8,xt+1.8,tt+1.8),_.strokeStyle="rgba(12, 36, 24, "+.24*Qe+")",_.lineWidth=2*Qe,_.stroke();let Ge=_.createLinearGradient(Ve,we,xt,tt);Ge.addColorStop(0,"#1d4d30"),Ge.addColorStop(.55,"#36854b"),Ge.addColorStop(1,"#7ed968"),_.beginPath(),_.moveTo(Ve,we),_.quadraticCurveTo(Q,Le,xt,tt),_.strokeStyle=Ge,_.lineWidth=1.5*Qe,_.lineCap="round",_.stroke()}}}if(oe.length>0&&F>.05){let k=Math.round(380*o(F,0,2));for(let ne=0;ne<k;ne++){let ce=oe[ne%oe.length],H=l(ne*1.9,9.2)*Math.PI*2,j=ce.r*(.85+l(ne*3.1,4.7)*1.6),he=ce.u+Math.cos(H)*j,de=ce.v+Math.sin(H)*j;if(he<.02||he>.98||de<.02||de>.98||d(he,de,b)<.28)continue;let ie=he*O,R=(1-de)*O,T=1.8+l(ne,15.3)*4.2;_.fillStyle="rgba(20, 24, 30, 0.35)",_.beginPath(),_.ellipse(ie+1.8,R+1.8,T*1.1,T*.85,H,0,Math.PI*2),_.fill();let te=175+Math.floor(l(ne*7.1,2.3)*55);_.fillStyle=\`rgb(\${te}, \${te-12}, \${te-26})\`,_.beginPath(),_.ellipse(ie,R,T,T*.78,H,0,Math.PI*2),_.fill()}}let se=.82+.18*o(F,.3,1.8);oe.forEach((k,ne)=>{let ce=k.u*O,H=(1-k.v)*O,j=k.r*se*O,he=_.createRadialGradient(ce+j*.22,H+j*.24,j*.2,ce+j*.18,H+j*.2,j*1.42);he.addColorStop(0,"rgba(8, 20, 28, 0.68)"),he.addColorStop(.65,"rgba(8, 22, 32, 0.35)"),he.addColorStop(1,"rgba(8, 22, 32, 0.0)"),_.fillStyle=he,_.beginPath(),_.arc(ce+j*.18,H+j*.2,j*1.42,0,Math.PI*2),_.fill();let de=9;_.save(),_.beginPath();for(let R=0;R<=64;R++){let T=R/64*Math.PI*2,te=1+.14*Math.sin(T*de+ne*2.1)+.08*Math.cos(T*5-ne),$=j*te,xe=ce+Math.cos(T)*$,Z=H+Math.sin(T)*$;R===0?_.moveTo(xe,Z):_.lineTo(xe,Z)}_.closePath();let ie=_.createRadialGradient(ce-j*.28,H-j*.28,j*.1,ce,H,j*1.15);if(k.type==="brain"?(ie.addColorStop(0,k.hue===0?"#f2b880":"#d89ce2"),ie.addColorStop(.65,k.hue===0?"#b86b35":"#88499c"),ie.addColorStop(1,"#3d241c")):k.type==="staghorn"||k.type==="table"?(ie.addColorStop(0,k.hue===0?"#ff9b85":"#7de8d2"),ie.addColorStop(.7,k.hue===0?"#c44b4f":"#2e8b7d"),ie.addColorStop(1,"#331c24")):(ie.addColorStop(0,"#c8bca8"),ie.addColorStop(.6,"#7d7266"),ie.addColorStop(1,"#38322e")),_.fillStyle=ie,_.fill(),_.clip(),k.type==="brain"){_.strokeStyle="rgba(45, 20, 14, 0.48)",_.lineWidth=2.2;for(let R=6;R<j*1.1;R+=6.5){_.beginPath();for(let T=0;T<Math.PI*2;T+=.15){let te=R+Math.sin(T*8+R*.4)*2.6,$=ce+Math.cos(T)*te,xe=H+Math.sin(T)*te;T===0?_.moveTo($,xe):_.lineTo($,xe)}_.closePath(),_.stroke()}}else if(k.type==="staghorn"||k.type==="table")for(let R=0;R<28;R++){let T=R/28*Math.PI*2+ne%3*.2,te=j*(.45+l(R,ne)*.55);_.strokeStyle=R%2===0?"rgba(255, 238, 220, 0.65)":"rgba(60, 20, 30, 0.42)",_.lineWidth=2.8,_.beginPath(),_.moveTo(ce,H),_.lineTo(ce+Math.cos(T)*te,H+Math.sin(T)*te),_.stroke()}else for(let R=0;R<18;R++){let T=l(R,ne*9)*Math.PI*2,te=l(ne,R*3)*j*.75;_.fillStyle=R%3===0?"rgba(198, 102, 136, 0.32)":"rgba(35, 30, 26, 0.28)",_.beginPath(),_.arc(ce+Math.cos(T)*te,H+Math.sin(T)*te,4+R%5*2,0,Math.PI*2),_.fill()}_.restore()}),[{u:.22,v:.68,s:12,rot:.4,col:"#f25c3b"},{u:.39,v:.56,s:10.5,rot:1.9,col:"#ff7847"},{u:.15,v:.46,s:11,rot:2.7,col:"#e84a38"},{u:.54,v:.62,s:11.5,rot:.9,col:"#f56a3f"},{u:.34,v:.33,s:10,rot:3.8,col:"#ff854d"},{u:.68,v:.34,s:12,rot:1.2,col:"#eb5536"}].forEach(k=>{if(d(k.u,k.v,b)<.08)return;let ne=k.u*O,ce=(1-k.v)*O;for(let H=0;H<2;H++){let j=H===0?2.2:0,he=H===0?2.4:0;_.beginPath();for(let de=0;de<=50;de++){let ie=de/50*Math.PI*2+k.rot,R=Math.pow(Math.cos(ie*2.5),2),T=k.s*(.34+.66*R),te=ne+j+Math.cos(ie)*T,$=ce+he+Math.sin(ie)*T;de===0?_.moveTo(te,$):_.lineTo(te,$)}if(_.closePath(),H===0)_.fillStyle="rgba(15, 22, 28, 0.42)",_.fill();else{_.fillStyle=k.col,_.fill(),_.fillStyle="#4a1c17";for(let de=0;de<5;de++){let ie=k.rot+de*Math.PI*2/5;_.beginPath(),_.arc(ne+Math.cos(ie)*k.s*.45,ce+Math.sin(ie)*k.s*.45,1.4,0,Math.PI*2),_.fill()}}}}),[{u:.14,v:.64,s:6.5,rot:.8,type:"scallop"},{u:.25,v:.77,s:7,rot:2.1,type:"conch"},{u:.31,v:.83,s:5.8,rot:-.6,type:"scallop"},{u:.09,v:.56,s:6.2,rot:1.4,type:"conch"},{u:.42,v:.72,s:6,rot:2.9,type:"scallop"},{u:.21,v:.29,s:6.8,rot:.3,type:"conch"},{u:.59,v:.51,s:6,rot:1.7,type:"scallop"}].forEach(k=>{let ne=k.u*O,ce=(1-k.v)*O;_.save(),_.translate(ne,ce),_.rotate(k.rot),_.fillStyle="rgba(18, 22, 26, 0.38)",_.beginPath(),_.ellipse(1.5,1.8,k.s,k.s*.78,0,0,Math.PI*2),_.fill(),_.fillStyle=k.type==="scallop"?"#fff1df":"#f7d4bc",_.beginPath(),_.ellipse(0,0,k.s,k.s*.75,0,0,Math.PI*2),_.fill(),_.strokeStyle="#c98a6b",_.lineWidth=1.1;for(let H=-2;H<=2;H++)_.beginPath(),_.moveTo(-k.s*.7,0),_.lineTo(k.s*.8,H*1.8),_.stroke();_.restore()}),[{u:.27,v:.5,r:9.5},{u:.29,v:.48,r:8},{u:.21,v:.38,r:9},{u:.61,v:.73,r:10},{u:.75,v:.55,r:9.5},{u:.47,v:.21,r:8.8},{u:.8,v:.49,r:8.5}].slice(0,Math.round(7*o(F,0,1.5))).forEach((k,ne)=>{let ce=k.u*O,H=(1-k.v)*O;_.fillStyle="rgba(8, 12, 18, 0.45)",_.beginPath(),_.arc(ce+1.8,H+1.8,k.r*.75,0,Math.PI*2),_.fill(),_.strokeStyle="#191124",_.lineWidth=1.15;for(let j=0;j<26;j++){let he=j/26*Math.PI*2+ne*.3,de=k.r*(.78+j%3*.14);_.beginPath(),_.moveTo(ce,H),_.lineTo(ce+Math.cos(he)*de,H+Math.sin(he)*de),_.stroke()}_.fillStyle="#120b1c",_.beginPath(),_.arc(ce,H,k.r*.32,0,Math.PI*2),_.fill(),_.fillStyle="#4d7cff",_.beginPath(),_.arc(ce-.5,H-.5,k.r*.11,0,Math.PI*2),_.fill()});let fe=w?.albedoTex;fe||(fe=new m.CanvasTexture(ae),fe.wrapS=m.ClampToEdgeWrapping,fe.wrapT=m.ClampToEdgeWrapping,fe.minFilter=m.LinearMipMapLinearFilter,fe.magFilter=m.LinearFilter),fe.needsUpdate=!0;let J=w?.dataTex;return J||(J=new m.CanvasTexture(E),J.wrapS=m.ClampToEdgeWrapping,J.wrapT=m.ClampToEdgeWrapping,J.minFilter=m.LinearFilter,J.magFilter=m.LinearFilter),J.needsUpdate=!0,{albedoTex:fe,dataTex:J,albedoCanvas:ae,dataCanvas:E,baseCache:q,coralHeads:oe.length?oe:p.slice(0,6)}}function g({THREE:m,renderer:S,scene:w}){let b=t.innerWidth/t.innerHeight,F=20,L=20*b;function O(Me,Re,Be=0){return{x:(Me-.5)*L,y:(Re-.5)*F,z:Be}}function ae(Me,Re){return{u:Me/L+.5,v:Re/F+.5}}let _={beachSize:1,coralDensity:1,grassDensity:1},E=v(m,_);function z(Me){_={..._,...Me};let Re=v(m,_,E);return E.coralHeads=Re.coralHeads,E.baseCache=Re.baseCache,E.coralHeads}let D=256,I=S.capabilities.isWebGL2||S.extensions.get("OES_texture_half_float")?m.HalfFloatType:m.UnsignedByteType;function K(){return new m.WebGLRenderTarget(D,D,{minFilter:m.LinearFilter,magFilter:m.LinearFilter,wrapS:m.ClampToEdgeWrapping,wrapT:m.ClampToEdgeWrapping,format:m.RGBAFormat,type:I,depthBuffer:!1,stencilBuffer:!1})}let G=K(),oe=K(),le=16,M=[],q=Array.from({length:le},()=>new m.Vector4(0,0,0,0));function se(Me,Re,Be=.022,Ze=-.35,$e=1){Me<-.05||Me>1.05||Re<-.05||Re>1.05||M.length<le&&M.push({u:Me,v:Re,r:o(Be,.006,.08),s:o(Ze*$e,-1.35,1.35)})}function X(Me,Re,Be=.72,Ze=-.38,$e=1){let{u:Fe,v:st}=ae(Me,Re),ft=Be/Math.max(L,F);se(Fe,st,ft,Ze,$e)}let pe=new m.Scene,ve=new m.OrthographicCamera(-1,1,1,-1,0,1),fe=new m.ShaderMaterial({uniforms:{uPrevState:{value:null},uSeabedData:{value:E.dataTex},uTexel:{value:new m.Vector2(1/D,1/D)},uImpulses:{value:q},uImpulseCount:{value:0},uWhirlpool:{value:new m.Vector4(.55,.45,0,0)},uDamping:{value:.986},uBeachSize:{value:_.beachSize}},vertexShader:\`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uPrevState;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform vec4 uImpulses[\${le}];
        uniform int uImpulseCount;
        uniform vec4 uWhirlpool;
        uniform float uDamping;
        uniform float uBeachSize;

        float computeBathymetry(vec2 uv, float beachSize, float undulation) {
          if (beachSize <= 0.001) {
            return 2.4 + (uv.x * 0.6 + (1.0 - uv.y) * 0.5) * 2.2 + undulation;
          }
          float dx = uv.x * 1.15;
          float dy = (1.0 - uv.y) * 1.35;
          float radial = sqrt(dx * dx + dy * dy);
          float curve = 0.045 * sin(uv.x * 9.0 + (1.0 - uv.y) * 6.0) + 0.025 * cos(uv.x * 17.0 - uv.y * 11.0);
          float shoreRadius = 0.34 * pow(max(0.0001, clamp(beachSize, 0.0, 2.2)), 0.72);
          float shoreDist = radial - shoreRadius + curve;
          if (shoreDist < 0.0) {
            return shoreDist * 3.8;
          }
          float shelf = pow(shoreDist, 1.18) * 5.2;
          return shelf + undulation * smoothstep(0.05, 0.35, shoreDist);
        }

        void main() {
          vec4 cur = texture2D(uPrevState, vUv);
          float h = cur.r;
          float v = cur.g;
          float foam = cur.b;

          float n = texture2D(uPrevState, vUv + vec2(0.0, uTexel.y)).r;
          float s = texture2D(uPrevState, vUv - vec2(0.0, uTexel.y)).r;
          float e = texture2D(uPrevState, vUv + vec2(uTexel.x, 0.0)).r;
          float w = texture2D(uPrevState, vUv - vec2(uTexel.x, 0.0)).r;
          float ne = texture2D(uPrevState, vUv + vec2(uTexel.x, uTexel.y)).r;
          float nw = texture2D(uPrevState, vUv + vec2(-uTexel.x, uTexel.y)).r;
          float se = texture2D(uPrevState, vUv + vec2(uTexel.x, -uTexel.y)).r;
          float sw = texture2D(uPrevState, vUv + vec2(-uTexel.x, -uTexel.y)).r;

          float avg = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05;
          float laplacian = avg - h;

          v += laplacian * 0.42 - h * 0.0065;

          for (int i = 0; i < \${le}; i++) {
            if (i >= uImpulseCount) break;
            vec4 imp = uImpulses[i];
            vec2 d = vUv - imp.xy;
            float dist2 = dot(d, d);
            float r2 = max(imp.z * imp.z, 0.00002);
            if (dist2 < r2 * 5.0) {
              float radial = sqrt(dist2 / r2);
              float waveProfile = (1.0 - radial * radial * 0.85) * exp(-radial * radial * 0.9);
              v += imp.w * waveProfile;
              foam = min(1.5, foam + abs(imp.w) * exp(-radial * radial * 1.1) * 0.65);
            }
          }

          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            float vr = length(vd);
            float maxR = mix(0.05, 0.22, uWhirlpool.z);
            if (vr < maxR) {
              float va = atan(vd.y, vd.x);
              float spiral = sin(va * 3.0 - vr * 52.0 + uWhirlpool.w * 7.5);
              float env = smoothstep(maxR, 0.012, vr) * smoothstep(0.003, 0.03, vr);
              v += spiral * env * 0.018 * uWhirlpool.z;
              foam = min(0.85, foam + env * 0.012 * uWhirlpool.z);
            }
          }

          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float edgeSponge = smoothstep(0.0, 0.075, edgeDist);
          float edgeDamp = mix(0.76, uDamping, edgeSponge);

          float undulation = texture2D(uSeabedData, vUv).r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);
          float beachSponge = smoothstep(-0.18, 0.12, depth);

          v *= edgeDamp * beachSponge;
          h = (h + v) * mix(0.84, 0.996, edgeSponge) * beachSponge;
          h = clamp(h, -1.5, 1.5);

          foam = max(0.0, foam * 0.968 + abs(laplacian) * 0.28);

          gl_FragColor = vec4(h, v, foam, 1.0);
        }
      \`}),J=new m.Mesh(new m.PlaneBufferGeometry(2,2),fe);pe.add(J);function k(Me,Re,Be,Ze){let $e=Math.min(M.length,le);for(let ft=0;ft<$e;ft++){let ht=M[ft];q[ft].set(ht.u,ht.v,ht.r,ht.s)}M.length=0;let Fe=typeof Re=="number"?Re:Re?1:0;fe.uniforms.uPrevState.value=G.texture,fe.uniforms.uImpulseCount.value=$e,fe.uniforms.uWhirlpool.value.set(Be.u,Be.v,Fe,Me),fe.uniforms.uDamping.value=Ze>.01?.92:.986,fe.uniforms.uBeachSize.value=_.beachSize,S.setRenderTarget(oe),S.render(pe,ve),S.setRenderTarget(null);let st=G;G=oe,oe=st}let ne=64,ce=Array.from({length:ne},()=>new m.Vector4(0,0,-100,0)),H=new m.PlaneBufferGeometry(1,1,1,1),j=\`
      vec2 hash22(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      vec2 voronoi(vec2 x, float t) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float m1 = 8.0;
        float m2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            o = 0.5 + 0.42 * sin(t * 1.15 + 6.2831 * o);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < m1) {
              m2 = m1;
              m1 = d;
            } else if (d < m2) {
              m2 = d;
            }
          }
        }
        return vec2(sqrt(m1), sqrt(m2) - sqrt(m1));
      }

      float computeCaustics(vec2 p, float t) {
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        vec2 p1 = p * 2.15 + vec2(t * 0.18, -t * 0.14);
        vec2 p2 = (rot * p) * 2.65 + vec2(-t * 0.15, t * 0.21);
        vec2 v1 = voronoi(p1, t);
        vec2 v2 = voronoi(p2, t);
        float c1 = smoothstep(0.18, 0.0, v1.y);
        float c2 = smoothstep(0.19, 0.0, v2.y);
        return pow(c1 * 0.62 + c2 * 0.58, 1.35);
      }

      float computeLacyFoam(vec2 p, float density, float t) {
        if (density <= 0.005) return 0.0;
        vec2 vBig = voronoi(p * 4.2 + vec2(t * 0.08), t);
        vec2 vSmall = voronoi(p * 9.5 - vec2(t * 0.11), t);
        float webBig = smoothstep(0.16 * density, 0.0, vBig.y);
        float webSmall = smoothstep(0.22 * density, 0.0, vSmall.y);
        float solidFill = smoothstep(0.65, 1.15, density);
        return clamp(max(webBig * 0.9, webSmall * 0.65 * density) + solidFill * 0.75, 0.0, 1.0);
      }

      float computePalmShadow(vec2 uv, float t, vec2 worldSize, float beachSize) {
        if (beachSize <= 0.02) return 0.0;
        float scale = clamp(0.65 + 0.35 * beachSize, 0.4, 1.35);
        vec2 base = vec2(-0.02, 0.96);
        vec2 crown = base + (vec2(0.145, -0.145) * scale) + vec2(sin(t * 1.1) * 0.004, cos(t * 0.85) * 0.004);

        float shadow = 0.0;
        vec2 pa = uv - base;
        vec2 ba = crown - base;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        vec2 archOffset = vec2(-ba.y, ba.x) * (sin(h * 3.14159) * 0.14);
        vec2 trunkPt = base + ba * h + archOffset;
        float trunkWidth = mix(0.018, 0.009, h) * (0.94 + 0.06 * sin(h * 45.0)) * scale;
        float dTrunk = length(uv - trunkPt);
        shadow = max(shadow, smoothstep(trunkWidth, trunkWidth * 0.35, dTrunk));

        vec2 rel = uv - crown;
        rel.x *= worldSize.x / max(worldSize.y, 1.0);
        float r = length(rel);
        if (r < 0.28 * scale) {
          float ang = atan(rel.y, rel.x);
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            float baseAng = -1.35 + fi * 0.74 + sin(t * 1.25 + fi * 1.7) * 0.065;
            float dAng = atan(sin(ang - baseAng - r * 1.35), cos(ang - baseAng - r * 1.35));
            float frondLen = (0.165 + 0.035 * sin(fi * 2.3)) * scale;
            float along = r / frondLen;
            if (along < 1.05 && abs(dAng) < 0.42) {
              float spineDist = abs(dAng) * r;
              float stem = smoothstep(0.0045, 0.001, spineDist) * smoothstep(1.0, 0.82, along);
              float env = sin(clamp(along, 0.0, 1.0) * 3.14159) * 0.036 * scale;
              float leafletWave = sin(along * 52.0 - abs(dAng) * 14.0 + sin(t * 2.3 + fi) * 0.8);
              float leaflet = smoothstep(env, env * 0.25, spineDist) * smoothstep(-0.15, 0.45, leafletWave);
              shadow = max(shadow, max(stem, leaflet * 0.88));
            }
          }
        }
        return clamp(shadow, 0.0, 1.0);
      }

      float computeRecoveryField(vec2 uv) {
        float a = length((uv - vec2(1.3, 0.5)) * vec2(0.8, 0.7));
        float b = length((uv - vec2(0.76, 1.35)) * vec2(0.8, 0.7));
        float c = length((uv - vec2(0.72, -0.35)) * vec2(0.8, 0.7));
        return -log(exp(-a * 12.0) + exp(-b * 12.0) + exp(-c * 12.0)) / 12.0
               + 0.012 * sin(uv.x * 21.0 + uv.y * 13.0)
               + 0.008 * sin(uv.y * 31.0 - uv.x * 17.0);
      }

      float computeBathymetry(vec2 uv, float beachSize, float undulation) {
        if (beachSize <= 0.001) {
          return 2.4 + (uv.x * 0.6 + (1.0 - uv.y) * 0.5) * 2.2 + undulation;
        }
        float dx = uv.x * 1.15;
        float dy = (1.0 - uv.y) * 1.35;
        float radial = sqrt(dx * dx + dy * dy);
        float curve = 0.045 * sin(uv.x * 9.0 + (1.0 - uv.y) * 6.0) + 0.025 * cos(uv.x * 17.0 - uv.y * 11.0);
        float shoreRadius = 0.34 * pow(max(0.0001, clamp(beachSize, 0.0, 2.2)), 0.72);
        float shoreDist = radial - shoreRadius + curve;
        if (shoreDist < 0.0) {
          return shoreDist * 3.8;
        }
        float shelf = pow(shoreDist, 1.18) * 5.2;
        return shelf + undulation * smoothstep(0.05, 0.35, shoreDist);
      }
    \`,he=new m.ShaderMaterial({uniforms:{uTime:{value:0},uSwellTime:{value:0},uWorldSize:{value:new m.Vector2(L,F)},uHeightMap:{value:G.texture},uSeabedAlbedo:{value:E.albedoTex},uSeabedData:{value:E.dataTex},uTexel:{value:new m.Vector2(1/D,1/D)},uSwashRunup:{value:0},uWetReach:{value:.12},uSwellScale:{value:1},uWaterClarity:{value:.9},uCausticsIntensity:{value:1},uRefractionScale:{value:1},uShadowIntensity:{value:.65},uBeachSize:{value:1},uWhirlpool:{value:new m.Vector4(.55,.45,0,0)},uCreatureShadows:{value:ce},uCreatureCount:{value:0},uDry:{value:0},uRecoveryFront:{value:0},uRecoveryReach:{value:1.3}},vertexShader:\`
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;
        uniform vec2 uWorldSize;
        void main() {
          vUv = uv;
          vec3 wp = vec3(position.x * uWorldSize.x, position.y * uWorldSize.y, 0.0);
          vHorizontalXZ = vec2(wp.x, -wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;

        uniform float uTime;
        uniform float uSwellTime;
        uniform vec2 uWorldSize;
        uniform sampler2D uHeightMap;
        uniform sampler2D uSeabedAlbedo;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform float uSwashRunup;
        uniform float uWetReach;
        uniform float uSwellScale;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;
        uniform float uRefractionScale;
        uniform float uShadowIntensity;
        uniform float uBeachSize;
        uniform vec4 uWhirlpool;
        uniform vec4 uCreatureShadows[\${ne}];
        uniform int uCreatureCount;
        uniform float uDry;
        uniform float uRecoveryFront;
        uniform float uRecoveryReach;

        \${j}

        void main() {
          vec4 bedData = texture2D(uSeabedData, vUv);
          float undulation = bedData.r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);
          float sandRipple = bedData.g;
          float grassMask = bedData.b;

          vec2 swellDir1 = normalize(vec2(-0.74, 0.67));
          vec2 swellDir2 = normalize(vec2(-0.58, 0.81));
          float distAlong1 = dot(vHorizontalXZ, swellDir1);
          float distAlong2 = dot(vHorizontalXZ, swellDir2);

          float shoal = smoothstep(-0.2, 2.5, depth);
          float swellPhase1 = distAlong1 * mix(1.05, 0.62, shoal) - uSwellTime * 2.15;
          float swellPhase2 = distAlong2 * 0.85 - uSwellTime * 1.65 + 1.7;

          float w1 = sin(swellPhase1) + 0.28 * (1.0 - shoal) * sin(swellPhase1 * 2.0);
          float w2 = sin(swellPhase2) * 0.55;
          float swellHeight = (w1 * 0.09 + w2 * 0.05) * uSwellScale * smoothstep(-0.15, 0.35, depth);

          float hL = texture2D(uHeightMap, vUv - vec2(uTexel.x, 0.0)).r;
          float hR = texture2D(uHeightMap, vUv + vec2(uTexel.x, 0.0)).r;
          float hD = texture2D(uHeightMap, vUv - vec2(0.0, uTexel.y)).r;
          float hU = texture2D(uHeightMap, vUv + vec2(0.0, uTexel.y)).r;
          vec2 rippleGrad = vec2(hR - hL, hU - hD) * 2.4;

          vec2 swellGrad = (swellDir1 * cos(swellPhase1) * 0.14 + swellDir2 * cos(swellPhase2) * 0.08) * uSwellScale;
          vec2 microUv = vHorizontalXZ * 2.8;
          vec2 microGrad = vec2(
            cos(microUv.x * 3.1 + uTime * 3.4 + microUv.y * 1.7),
            sin(microUv.y * 3.5 - uTime * 2.9 + microUv.x * 1.9)
          ) * 0.032;

          vec2 vortexGrad = vec2(0.0);
          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            vd.x *= uWorldSize.x / max(uWorldSize.y, 1.0);
            float vr = length(vd);
            float maxR = mix(0.06, 0.24, uWhirlpool.z);
            if (vr < maxR) {
              float rNorm = vr / maxR;
              float funnel = exp(-rNorm * rNorm * 4.6) * uWhirlpool.z;
              float angle = atan(vd.y, vd.x) + uTime * 5.2 - vr * 28.0;
              vortexGrad = (normalize(vd + 0.0001) * funnel * 1.5 + vec2(-vd.y, vd.x) * sin(angle * 3.0) * 1.8) * uWhirlpool.z;
            }
          }

          float shoreNoise = (sin(vUv.x * 28.0 + vUv.y * 23.0) * 0.018 + cos(vUv.x * 55.0 - vUv.y * 41.0) * 0.009);
          float swashShift = uSwashRunup * 0.24 + shoreNoise;
          float effectiveDepth = depth + swashShift + swellHeight * 0.8;

          // Meteor event seabed drain & 3-front offshore water recovery
          float recDist = computeRecoveryField(vUv);
          float frontPos = (1.0 - uRecoveryFront) * uRecoveryReach;
          float floodMask = uDry > 0.001
            ? mix(1.0, smoothstep(frontPos + 0.035, frontPos - 0.025, recDist), clamp(uDry * 1.35, 0.0, 1.0))
            : 1.0;

          float maxWetDepth = depth + uWetReach * 0.27 + shoreNoise;
          float wetness = smoothstep(0.04, -0.14, maxWetDepth) * smoothstep(-0.36, -0.02, depth);
          wetness = max(wetness, smoothstep(-0.03, 0.05, effectiveDepth));

          float waterMask = smoothstep(-0.015, 0.035, effectiveDepth) * floodMask;

          vec2 totalGrad = (rippleGrad + swellGrad + microGrad + vortexGrad) * waterMask;
          vec3 normal = normalize(vec3(-totalGrad.x, 1.0, totalGrad.y));

          vec2 refractOffset = normal.xz * clamp(effectiveDepth * 0.028, 0.0, 0.048) * uRefractionScale * waterMask;
          vec2 swayOffset = vec2(
            sin(vHorizontalXZ.x * 1.8 + uTime * 2.2),
            cos(vHorizontalXZ.y * 1.8 + uTime * 1.9)
          ) * 0.0022 * grassMask * waterMask;

          vec2 bedUv = clamp(vUv + refractOffset + swayOffset, 0.001, 0.999);
          vec3 sandColor = texture2D(uSeabedAlbedo, bedUv).rgb;

          // Meteor impact crater on seabed when uDry > 0
          if (uDry > 0.005) {
            vec2 cp = (vUv - vec2(0.55, 0.50)) * vec2(uWorldSize.x / uWorldSize.y, 1.0);
            float cr = length(cp);
            float rim = exp(-pow((cr - 0.28) / 0.055, 2.0));
            float pit = smoothstep(0.30, 0.02, cr);
            float strata = 0.5 + 0.5 * sin(cr * 95.0 + sin(atan(cp.y, cp.x) * 7.0) * 2.0);
            vec3 craterRock = mix(vec3(0.18, 0.15, 0.13), vec3(0.46, 0.39, 0.31), strata);
            sandColor = mix(sandColor, craterRock, clamp((pit * 0.88 + rim * 0.55) * uDry, 0.0, 0.92));
          }

          vec3 drySandCol = sandColor * 1.05;
          vec3 wetSandCol = sandColor * vec3(0.74, 0.71, 0.66);
          vec3 baseBeachCol = mix(drySandCol, wetSandCol, wetness * (1.0 - waterMask * 0.7));

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          float wetSandGloss = wetness * (1.0 - waterMask) * smoothstep(-0.28, 0.02, depth);
          vec3 wetSheen = vec3(0.78, 0.93, 0.99) * wetSandGloss * (0.28 + 0.14 * sandRipple);
          baseBeachCol += wetSheen;

          float caustics = computeCaustics(vHorizontalXZ + refractOffset * 18.0, uTime);
          float causticFade = smoothstep(0.02, 0.28, effectiveDepth) * exp(-max(0.0, effectiveDepth) * 0.28) * waterMask;

          float creatureShadow = 0.0;
          vec2 seabedWorldXZ = vHorizontalXZ + refractOffset * 12.0;
          for (int i = 0; i < \${ne}; i++) {
            if (i >= uCreatureCount) break;
            vec4 c = uCreatureShadows[i];
            float hAboveBed = max(0.15, c.y + max(0.0, effectiveDepth));
            vec2 shadowCenter = c.xz - lightDir.xz * hAboveBed * 0.55;
            float dist = length(seabedWorldXZ - shadowCenter);
            float sRad = c.w * (1.0 + hAboveBed * 0.12);
            float sh = smoothstep(sRad, sRad * 0.25, dist) * clamp(0.66 - hAboveBed * 0.06, 0.18, 0.64);
            creatureShadow = max(creatureShadow, sh);
          }
          creatureShadow *= 0.72;

          float palmShadow = computePalmShadow(vUv + refractOffset * 0.35, uTime, uWorldSize, uBeachSize) * 0.75;
          float totalBedShadow = max(creatureShadow, palmShadow * 0.68);

          vec3 litSeabed = baseBeachCol * (1.0 - totalBedShadow * uShadowIntensity);
          litSeabed += vec3(0.55, 0.95, 1.0) * caustics * causticFade * uCausticsIntensity * (1.0 - totalBedShadow * clamp(uShadowIntensity * 1.15, 0.0, 1.0)) * 0.62;

          vec3 shallowTurquoise = vec3(0.09, 0.81, 0.78);
          vec3 midLagoonBlue = vec3(0.03, 0.48, 0.72);
          vec3 deepSapphire = vec3(0.015, 0.16, 0.38);

          float dNorm = clamp(effectiveDepth / 4.6, 0.0, 1.0);
          vec3 waterTint = mix(shallowTurquoise, midLagoonBlue, smoothstep(0.0, 0.48, dNorm));
          waterTint = mix(waterTint, deepSapphire, smoothstep(0.42, 1.0, dNorm));

          float turbidity = clamp(1.0 - uWaterClarity * 0.82, 0.05, 1.0);
          vec3 absorption = exp(-vec3(0.58, 0.18, 0.12) * max(0.0, effectiveDepth) * (0.28 + turbidity * 1.05));
          float scatterMix = (1.0 - exp(-max(0.0, effectiveDepth) * (0.22 + turbidity * 0.85))) * (1.0 - uWaterClarity * 0.48);
          vec3 underwaterCol = mix(litSeabed * absorption, waterTint, scatterMix);

          vec3 finalColor = mix(litSeabed, underwaterCol, waterMask);
          finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.95));

          gl_FragColor = vec4(finalColor, 1.0);
        }
      \`,depthWrite:!1,depthTest:!1}),de=new m.Mesh(H,he);de.scale.set(L,F,1),de.renderOrder=0,w.add(de);let ie=new m.ShaderMaterial({uniforms:{uTime:{value:0},uSwellTime:{value:0},uWorldSize:{value:new m.Vector2(L,F)},uHeightMap:{value:G.texture},uSeabedData:{value:E.dataTex},uTexel:{value:new m.Vector2(1/D,1/D)},uSwashRunup:{value:0},uSwellScale:{value:1},uSurfaceReflection:{value:.28},uSunGlintIntensity:{value:1},uFoamIntensity:{value:1},uBeachSize:{value:1},uWhirlpool:{value:new m.Vector4(.55,.45,0,0)},uDry:{value:0},uRecoveryFront:{value:0},uRecoveryReach:{value:1.3}},vertexShader:\`
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;
        uniform vec2 uWorldSize;
        void main() {
          vUv = uv;
          vec3 wp = vec3(position.x * uWorldSize.x, position.y * uWorldSize.y, 0.0);
          vHorizontalXZ = vec2(wp.x, -wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec2 vUv;
        varying vec2 vHorizontalXZ;

        uniform float uTime;
        uniform float uSwellTime;
        uniform vec2 uWorldSize;
        uniform sampler2D uHeightMap;
        uniform sampler2D uSeabedData;
        uniform vec2 uTexel;
        uniform float uSwashRunup;
        uniform float uSwellScale;
        uniform float uSurfaceReflection;
        uniform float uSunGlintIntensity;
        uniform float uFoamIntensity;
        uniform float uBeachSize;
        uniform vec4 uWhirlpool;
        uniform float uDry;
        uniform float uRecoveryFront;
        uniform float uRecoveryReach;

        \${j}

        void main() {
          vec4 bedData = texture2D(uSeabedData, vUv);
          float undulation = bedData.r - 0.5;
          float depth = computeBathymetry(vUv, uBeachSize, undulation);

          vec2 swellDir1 = normalize(vec2(-0.74, 0.67));
          vec2 swellDir2 = normalize(vec2(-0.58, 0.81));
          float distAlong1 = dot(vHorizontalXZ, swellDir1);
          float distAlong2 = dot(vHorizontalXZ, swellDir2);

          float shoal = smoothstep(-0.2, 2.5, depth);
          float swellPhase1 = distAlong1 * mix(1.05, 0.62, shoal) - uSwellTime * 2.15;
          float swellPhase2 = distAlong2 * 0.85 - uSwellTime * 1.65 + 1.7;

          float w1 = sin(swellPhase1) + 0.28 * (1.0 - shoal) * sin(swellPhase1 * 2.0);
          float w2 = sin(swellPhase2) * 0.55;
          float swellHeight = (w1 * 0.09 + w2 * 0.05) * uSwellScale * smoothstep(-0.15, 0.35, depth);

          vec4 sim = texture2D(uHeightMap, vUv);
          float hL = texture2D(uHeightMap, vUv - vec2(uTexel.x, 0.0)).r;
          float hR = texture2D(uHeightMap, vUv + vec2(uTexel.x, 0.0)).r;
          float hD = texture2D(uHeightMap, vUv - vec2(0.0, uTexel.y)).r;
          float hU = texture2D(uHeightMap, vUv + vec2(0.0, uTexel.y)).r;
          vec2 rippleGrad = vec2(hR - hL, hU - hD) * 2.4;

          vec2 swellGrad = (swellDir1 * cos(swellPhase1) * 0.14 + swellDir2 * cos(swellPhase2) * 0.08) * uSwellScale;
          vec2 microUv = vHorizontalXZ * 2.8;
          vec2 microGrad = vec2(
            cos(microUv.x * 3.1 + uTime * 3.4 + microUv.y * 1.7),
            sin(microUv.y * 3.5 - uTime * 2.9 + microUv.x * 1.9)
          ) * 0.032;

          float vortexFoam = 0.0;
          vec2 vortexGrad = vec2(0.0);
          if (uWhirlpool.z > 0.005) {
            vec2 vd = vUv - uWhirlpool.xy;
            vd.x *= uWorldSize.x / max(uWorldSize.y, 1.0);
            float vr = length(vd);
            float maxR = mix(0.06, 0.25, uWhirlpool.z);
            if (vr < maxR) {
              float rNorm = vr / maxR;
              float funnel = exp(-rNorm * rNorm * 4.6) * uWhirlpool.z;
              float angle = atan(vd.y, vd.x) + uTime * 5.2 - vr * 28.0;
              vortexGrad = (normalize(vd + 0.0001) * funnel * 1.5 + vec2(-vd.y, vd.x) * sin(angle * 3.0) * 1.8) * uWhirlpool.z;
              // Swirling foam streamers rather than a solid disc
              float swirlRibbon = pow(max(0.0, sin(angle * 2.5)), 2.8);
              vortexFoam = smoothstep(maxR * 0.75, 0.045, vr) * smoothstep(0.015, 0.050, vr) * (0.20 + 0.80 * swirlRibbon) * uWhirlpool.z * 0.42;
            }
          }

          float shoreNoise = (sin(vUv.x * 28.0 + vUv.y * 23.0) * 0.018 + cos(vUv.x * 55.0 - vUv.y * 41.0) * 0.009);
          float swashShift = uSwashRunup * 0.24 + shoreNoise;
          float effectiveDepth = depth + swashShift + swellHeight * 0.8;

          float recDist = computeRecoveryField(vUv);
          float frontPos = (1.0 - uRecoveryFront) * uRecoveryReach;
          float floodMask = uDry > 0.001
            ? mix(1.0, smoothstep(frontPos + 0.035, frontPos - 0.025, recDist), clamp(uDry * 1.35, 0.0, 1.0))
            : 1.0;
          float floodCrestFoam = uDry > 0.005
            ? exp(-pow((recDist - frontPos) / 0.032, 2.0)) * uDry * 1.25
            : 0.0;

          float waterMask = smoothstep(-0.015, 0.035, effectiveDepth) * floodMask;

          vec2 totalGrad = (rippleGrad + swellGrad + microGrad + vortexGrad) * waterMask;
          vec3 normal = normalize(vec3(-totalGrad.x, 1.0, totalGrad.y));

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          vec3 viewDir = vec3(0.0, 1.0, 0.0);
          vec3 halfVec = normalize(lightDir + viewDir);

          float palmShadow = computePalmShadow(vUv, uTime, uWorldSize, uBeachSize) * 0.75;

          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.6);
          float rippleSlope = clamp(length(rippleGrad) * 0.45, 0.0, 0.65);
          float reflAlpha = clamp((fresnel * 1.35 + rippleSlope * 0.35) * uSurfaceReflection, 0.0, 0.72) * (1.0 - palmShadow * 0.5) * waterMask;
          vec3 skyCol = mix(vec3(0.46, 0.86, 0.98), vec3(0.86, 0.97, 1.0), fresnel);

          float spec = pow(max(0.0, dot(normal, halfVec)), 140.0);
          float glintNoise = fract(sin(dot(floor(vHorizontalXZ * 16.0 + uTime * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
          float sunGlint = spec * (1.2 + step(0.75, glintNoise) * 2.4) * uSunGlintIntensity * (1.0 - palmShadow * 0.85) * waterMask;

          float hasBeach = smoothstep(0.01, 0.12, uBeachSize);
          float swashEdge = exp(-pow((effectiveDepth - 0.025) / 0.045, 2.0)) * hasBeach;
          float breakerZone = exp(-pow((effectiveDepth - 0.24 + uSwashRunup * 0.08) / 0.14, 2.0)) * max(0.0, uSwashRunup + 0.35) * hasBeach;
          float simFoam = sim.b * (1.0 - smoothstep(0.02, 0.32, length(vUv - uWhirlpool.xy)) * uWhirlpool.z * 0.75);
          float foamDensity = clamp((swashEdge * 1.15 + breakerZone * 0.85 + simFoam * 0.75 + vortexFoam * 0.85 + floodCrestFoam) * uFoamIntensity, 0.0, 1.35);

          float lacy = computeLacyFoam(vHorizontalXZ * 0.85 + normal.xz * 0.6, foamDensity, uTime);
          float lip = smoothstep(0.032, 0.004, abs(effectiveDepth - 0.012)) * 0.88 * clamp(uFoamIntensity, 0.0, 1.4) * hasBeach;
          float totalFoam = clamp(max(lacy, lip), 0.0, 1.0) * floodMask;

          // Translucency control for storm vortex waves (transparent enough to see swirling creatures)
          float vortexMask = clamp(vortexFoam * 2.8, 0.0, 1.0);
          float foamAlphaCap = mix(0.96, 0.38, vortexMask);
          totalFoam = min(totalFoam, foamAlphaCap);
          vec3 foamColor = vec3(0.96, 0.99, 1.0) * (1.0 - palmShadow * 0.38);

          float glintAlpha = clamp(sunGlint * 0.85, 0.0, 1.0);
          float maxAlpha = mix(0.98, 0.46, vortexMask);
          float outAlpha = clamp(reflAlpha + glintAlpha + totalFoam, 0.0, maxAlpha);
          if (outAlpha < 0.004) discard;

          vec3 surfCol = mix(skyCol, vec3(1.0, 0.98, 0.90), clamp(glintAlpha / max(reflAlpha + glintAlpha, 0.001), 0.0, 1.0));
          surfCol = mix(surfCol, foamColor, totalFoam * mix(1.0, 0.50, vortexMask));

          gl_FragColor = vec4(surfCol, outAlpha);
        }
      \`,transparent:!0,depthWrite:!1,depthTest:!0}),R=new m.Mesh(H,ie);R.scale.set(L,F,1),R.renderOrder=5,w.add(R);let T=750,te=1,$=T,xe=new Float32Array(T*3),Z=new Float32Array(T*4),Ie=new Float32Array(T),Ne=[],ee=new m.BufferGeometry,Ee=new m.BufferAttribute(xe,3).setUsage(m.DynamicDrawUsage),Ue=new m.BufferAttribute(Z,4).setUsage(m.DynamicDrawUsage),Ve=new m.BufferAttribute(Ie,1).setUsage(m.DynamicDrawUsage);ee.setAttribute("position",Ee),ee.setAttribute("aColor",Ue),ee.setAttribute("aSize",Ve),ee.setDrawRange(0,0);let we=new m.ShaderMaterial({vertexShader:\`
        precision highp float;
        attribute vec4 aColor;
        attribute float aSize;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(-mvPos.z, 1.0));
          gl_Position = projectionMatrix * mvPos;
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0) discard;
          float soft = exp(-r2 * 2.2);
          gl_FragColor = vec4(vColor.rgb, vColor.a * soft);
        }
      \`,transparent:!0,depthWrite:!1}),Qe=new m.Points(ee,we);Qe.frustumCulled=!1,Qe.renderOrder=7,w.add(Qe);function ct(Me,Re,Be=1,Ze=null,$e=1){let Fe=O(Me,Re,0);se(Me,Re,.02+Be*.01,-.82*Be,$e),setTimeout(()=>{se(Me,Re,.014+Be*.006,.58*Be,$e)},85),Ze&&Ze.playSplash(Be);let st=Math.min(48,Math.floor((18+Be*22)*te));for(let ft=0;ft<st&&!(Ne.length>=$);ft++){let ht=ft/st*Math.PI*2+(Math.random()-.5)*.35,gt=(.1+Math.random()*.24)*Be,N=(1.1+Math.random()*2.5)*Be,Pe=(3.2+Math.random()*4)*Math.sqrt(Be);Ne.push({type:"droplet",x:Fe.x+Math.cos(ht)*gt,y:Fe.y+Math.sin(ht)*gt,z:.08+Math.random()*.14,vx:Math.cos(ht)*N,vy:Math.sin(ht)*N,vz:Pe,age:0,maxAge:.55+Math.random()*.45,size:.22+Math.random()*.24,r:.92,g:.99,b:1,rippleOnHit:ft%4===0})}}function vt(Me,Re,Be){Ne.length>=$||Ne.push({type:"drip",x:Me+(Math.random()-.5)*.06,y:Re+(Math.random()-.5)*.06,z:Math.max(.1,Be),vx:(Math.random()-.5)*.2,vy:(Math.random()-.5)*.2,vz:-.6-Math.random()*.5,age:0,maxAge:1.1,size:.2+Math.random()*.12,r:.88,g:.98,b:1,rippleOnHit:!0})}function xt(Me,Re,Be){let Ze=Math.max(1,Math.round(34*te));for(let $e=0;$e<Ze&&!(Ne.length>=$);$e++){let Fe=Math.random()*Math.PI*2,st=.35+Math.random()*1.45;Ne.push({type:"silt",x:Me+(Math.random()-.5)*.55,y:Re+(Math.random()-.5)*.55,z:Be+.05+Math.random()*.15,vx:Math.cos(Fe)*st,vy:Math.sin(Fe)*st,vz:.22+Math.random()*.45,age:0,maxAge:1.35+Math.random()*.95,size:.65+Math.random()*.75,r:.85,g:.76,b:.56,rippleOnHit:!1})}}function tt(Me,Re,Be=1){let Ze=0;for(let $e=Ne.length-1;$e>=0;$e--){let Fe=Ne[$e];if(Fe.age+=Me,Fe.age>=Fe.maxAge){Ne.splice($e,1);continue}if(Fe.type==="droplet"||Fe.type==="drip"){if(Fe.vz-=13.5*Me,Fe.x+=Fe.vx*Me,Fe.y+=Fe.vy*Me,Fe.z+=Fe.vz*Me,Fe.z<=0&&Fe.vz<0){Fe.rippleOnHit&&(X(Fe.x,Fe.y,Fe.type==="drip"?.32:.38,Fe.type==="drip"?-.2:-.24,Be),Fe.type==="drip"&&Re&&Math.random()<.22&&Re.playChime(null,.045)),Ne.splice($e,1);continue}}else Fe.type==="silt"&&(Fe.vx*=Math.pow(.22,Me),Fe.vy*=Math.pow(.22,Me),Fe.vz*=Math.pow(.45,Me),Fe.x+=Fe.vx*Me,Fe.y+=Fe.vy*Me,Fe.z+=Fe.vz*Me,Fe.size+=Me*.55);let st=Fe.age/Fe.maxAge,ft=Fe.type==="silt"?Math.sin(st*Math.PI)*.62:(1-st*.7)*.92;xe[Ze*3]=Fe.x,xe[Ze*3+1]=Fe.y,xe[Ze*3+2]=Fe.z,Z[Ze*4]=Fe.r,Z[Ze*4+1]=Fe.g,Z[Ze*4+2]=Fe.b,Z[Ze*4+3]=ft,Ie[Ze]=Fe.size,Ze++}Ee.needsUpdate=!0,Ue.needsUpdate=!0,Ve.needsUpdate=!0,ee.setDrawRange(0,Ze)}function Q(Me){b=Me,F=20,L=20*b,de.scale.set(L,F,1),R.scale.set(L,F,1),he.uniforms.uWorldSize.value.set(L,F),ie.uniforms.uWorldSize.value.set(L,F)}function Le(Me){_.beachSize=Me,he.uniforms.uBeachSize.value=Me,ie.uniforms.uBeachSize.value=Me,fe.uniforms.uBeachSize.value=Me}function Ge(Me,Re){let Be=_.beachSize;if(Be<=.001)return 999;let Ze=Me,$e=(1-Re)*1.35,Fe=Math.sqrt(Ze*Ze+$e*$e),st=.045*Math.sin(Me*9+(1-Re)*6)+.025*Math.cos(Me*17-Re*11),ft=.34*Math.pow(o(Be,0,2.2),.72);return Fe-ft+st}function qe(Me,Re,Be=.08){let Ze=_.beachSize;if(Ze<=.001)return{u:Me,v:Re,normalU:0,normalV:0,clamped:!1};let $e=Me,Fe=Re,st=!1,ft=0,ht=0;for(let gt=0;gt<3;gt++){let N=$e,Pe=(1-Fe)*1.35,be=Math.sqrt(N*N+Pe*Pe),Te=.045*Math.sin($e*9+(1-Fe)*6)+.025*Math.cos($e*17-Fe*11),He=.34*Math.pow(o(Ze,0,2.2),.72),rt=be-He+Te;if(rt<Be){st=!0;let A=Be-rt,We=Math.max(be,1e-4),Xe=N/We,De=-Pe/(We*1.35),U=Math.hypot(Xe,De)||1;ft=Xe/U,ht=De/U,$e+=ft*(A+.008),Fe+=ht*(A+.008)}else break}return{u:$e,v:Fe,normalU:ft,normalV:ht,clamped:st}}return{getAspect:()=>b,getWorldSize:()=>({worldW:L,worldH:F}),toWorld:O,worldToUv:ae,getUvBathymetry:(Me,Re)=>d(Me,Re,_.beachSize),getShoreDistance:Ge,enforceBeachBoundary:qe,setBeachSize:Le,getSwashState:f,rebuildSeabed:z,getCoralHeads:()=>E.coralHeads,addWaterImpulseUv:se,addWaterImpulseWorld:X,stepWaterSimulation:k,spawnWaterSplashUv:ct,spawnTentacleDripWorld:vt,spawnSandSiltCloudWorld:xt,updateParticles:tt,setParticleBudget(Me){te=Math.max(.2,Math.min(1,Me)),$=Math.round(T*te)},clearParticles:()=>{Ne.length=0,ee.setDrawRange(0,0)},resize:Q,oceanMesh:de,waterSurfaceMesh:R,oceanMaterial:he,waterSurfaceMaterial:ie,simMaterial:fe,creatureShadowData:ce,MAX_SHADOW_CASTERS:ne,getHeightMapTexture:()=>G.texture}}i.OceanWaterSeabed={fract:r,mix:a,clamp:o,smoothstep:c,hash2:l,noise2:h,fbm2:u,getUvBathymetry:d,getSwashState:f,bakeSeabedTextures:v,createWaterAndSeabedSystem:g}})(s)}function xp(s,e,t,n){(function(i){"use strict";let{fract:r,mix:a,clamp:o,smoothstep:c}=i.OceanWaterSeabed,l=48,h=14,u=l*12;function d(x){let v=r(x);if(v<.28){let g=v/.28,m=Math.sin(g*Math.PI*.5),S=Math.sin(g*Math.PI);return{squeeze:m,thrust:S}}else{let g=(v-.28)/.72,m=Math.cos(g*Math.PI*.5),S=-.12*Math.sin(g*Math.PI);return{squeeze:m,thrust:S}}}function f(x){let w=[],b=[],F=[],L=[];function O(G,oe,le,M,q,se,X,pe,ve,fe){w.push(G,oe,le),b.push(M,q,se),F.push(X,pe,ve,fe)}let ae=37,E=ae*29;for(let G=0;G<2;G++){let oe=G===0?1:-1;for(let le=0;le<=28;le++){let M=le/28*2-1;for(let q=0;q<=36;q++){let se=q/36*2-1,X=Math.max(0,(1-se*se)*(1-M*M)),pe=.065*Math.pow(X,.65),ve=oe*pe;O(se,ve,M,0,oe,0,se,M,oe,0)}}}for(let G=0;G<28;G++)for(let oe=0;oe<36;oe++){let le=G*ae+oe,M=le+1,q=le+ae,se=q+1;L.push(le,q,M,M,q,se);let X=E+le,pe=E+M,ve=E+q,fe=E+se;L.push(X,pe,ve,pe,fe,ve)}let z=w.length/3;for(let G=0;G<=24;G++){let oe=G/24;for(let le=0;le<6;le++){let M=le/6*Math.PI*2,q=Math.cos(M),se=Math.sin(M),X=.032*(1-oe*.82);O(q*X,se*X,.85+oe*1.4,q,se,0,q,oe,se>=0?1:-1,1)}}for(let G=0;G<24;G++)for(let oe=0;oe<6;oe++){let le=(oe+1)%6,M=z+G*6+oe,q=z+G*6+le,se=z+(G+1)*6+oe,X=z+(G+1)*6+le;L.push(M,se,q,q,se,X)}let D=new x.InstancedBufferGeometry;D.setIndex(L),D.setAttribute("position",new x.Float32BufferAttribute(w,3)),D.setAttribute("normal",new x.Float32BufferAttribute(b,3)),D.setAttribute("aBodyCoord",new x.Float32BufferAttribute(F,4));let C=new Float32Array(l*4),I=new Float32Array(l*4),K=new Float32Array(l*4);return D.setAttribute("aInstAnim",new x.InstancedBufferAttribute(C,4).setUsage(x.DynamicDrawUsage)),D.setAttribute("aInstState",new x.InstancedBufferAttribute(I,4).setUsage(x.DynamicDrawUsage)),D.setAttribute("aInstPose",new x.InstancedBufferAttribute(K,4).setUsage(x.DynamicDrawUsage)),D}function p(x){let m=[],S=[],w=[],b=[];for(let E=0;E<=22;E++){let z=E/22,D=z*Math.PI*.52,C=Math.sin(D),I=Math.cos(D);for(let K=0;K<=40;K++){let G=K/40,oe=G*Math.PI*2,le=Math.cos(oe),M=Math.sin(oe),q=C*le,se=C*M,X=I-.35;m.push(q,X,se),S.push(C*le,I,C*M),w.push(z,oe,G)}}let F=41;for(let E=0;E<22;E++)for(let z=0;z<40;z++){let D=E*F+z,C=D+1,I=D+F,K=I+1;b.push(D,I,C,C,I,K)}let L=new x.InstancedBufferGeometry;L.setIndex(b),L.setAttribute("position",new x.Float32BufferAttribute(m,3)),L.setAttribute("normal",new x.Float32BufferAttribute(S,3)),L.setAttribute("aBellCoord",new x.Float32BufferAttribute(w,3));let O=new Float32Array(l*4),ae=new Float32Array(l*4),_=new Float32Array(l*4);return L.setAttribute("aInstPose",new x.InstancedBufferAttribute(O,4).setUsage(x.DynamicDrawUsage)),L.setAttribute("aInstAxis",new x.InstancedBufferAttribute(ae,4).setUsage(x.DynamicDrawUsage)),L.setAttribute("aInstMeta",new x.InstancedBufferAttribute(_,4).setUsage(x.DynamicDrawUsage)),L}function y({THREE:x,scene:v,camera:g,waterSystem:m,sound:S}){let w=f(x),b=new x.ShaderMaterial({uniforms:{uTime:{value:0},uWaterClarity:{value:.9},uCausticsIntensity:{value:1},uRefractionScale:{value:1}},vertexShader:\`
        precision highp float;
        attribute vec4 aBodyCoord; // u, v, dorsalSign, isTail
        attribute vec4 aInstAnim;  // phase, flapAmp, speciesId (0=manta, 1=eagle, 2=stingray), pitchAngle
        attribute vec4 aInstState; // turnBend, rollBank, sandBurial, sizeScale
        attribute vec4 aInstPose;  // worldX, worldY(elev), worldZ(south), headingYaw

        uniform float uTime;
        uniform float uRefractionScale;

        varying vec4 vBodyCoord;
        varying float vSpecies;
        varying float vSandBurial;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        // Planform silhouette shaping per ray species.
        // Local +Z is FORWARD (head & cephalic horns); Local -Z is REAR (trailing edge & whip tail).
        vec3 shapeRayVertex(vec4 bc, float species, float phase, float flapAmp, float turnBend, out vec3 localNorm) {
          float u = bc.x; // [-1..1] spanwise
          float v = bc.y; // [-1..1] nose(-1) to rear(+1), or [0..1] along tail
          float dorsal = bc.z;
          float isTail = bc.w;

          float au = abs(u);
          float su = sign(u);

          if (isTail > 0.5) {
            float tLen = (species < 0.5) ? 1.15 : ((species < 1.5) ? 2.15 : 1.05);
            float zBase = (species > 1.5) ? 0.72 : 0.62;
            float zPos = -(zBase + v * tLen); // Trails behind at negative local Z!
            float tailWave = sin(phase - v * 4.2) * (0.08 * v * v) * flapAmp;
            float tailTurn = -turnBend * v * v * 0.55;
            float radScale = (species > 1.5) ? (1.0 + 0.35 * sin(v * 3.14159)) : (1.0 - v * 0.65);
            float xPos = u * 0.026 * radScale + tailWave + tailTurn;
            float yPos = dorsal * 0.022 * radScale + cos(phase - v * 3.2) * 0.035 * v * flapAmp;
            localNorm = normalize(vec3(u * 0.6, dorsal, 0.0));
            return vec3(xPos, yPos, zPos);
          }

          float x = 0.0;
          float z = 0.0;
          float y = position.y;
          float wingZ = 0.0;
          float dWingDu = 0.0;
          float dWingDv = 0.0;

          if (species < 0.5) {
            // SPECIES 0: MANTA RAY (Head & cephalic horn lobes lead at +Z)
            float zLead = -0.58 + 0.52 * pow(au, 0.88);
            float horn = exp(-pow((au - 0.21) / 0.065, 2.0)) * (1.0 - smoothstep(0.0, 0.14, au) * 0.2);
            zLead -= horn * 0.42;
            float zTrail = 0.64 - 0.58 * pow(au, 0.72) + 0.08 * exp(-au * 14.0);
            float chord01 = v * 0.5 + 0.5;
            z = -mix(zLead, zTrail, chord01); // Flip so nose/cephalic horns are at +Z (forward)!
            x = u * 1.48;

            float spanFactor = pow(au, 1.45);
            float flapPhase = phase - au * 1.35 - chord01 * 0.35;
            float arch = sin(flapPhase) * spanFactor * 0.48 * flapAmp;
            float camber = -0.12 * au * au * cos(flapPhase);
            wingZ = arch + camber - horn * (1.0 - chord01) * 0.08;
            dWingDu = su * 1.45 * pow(max(au, 0.01), 0.45) * sin(flapPhase) * 0.48 * flapAmp;
          } else if (species < 1.5) {
            // SPECIES 1: SPOTTED EAGLE RAY (Protruding snout leads at +Z)
            float snout = 0.34 * exp(-pow(au / 0.16, 2.0));
            float zLead = -0.52 - snout + 0.62 * pow(au, 0.95);
            float pelvic = 0.16 * exp(-pow((au - 0.12) / 0.08, 2.0));
            float zTrail = 0.62 + pelvic - 0.50 * pow(au, 0.68);
            float chord01 = v * 0.5 + 0.5;
            z = -mix(zLead, zTrail, chord01); // Flip so snout is at +Z (forward)!
            x = u * 1.34;

            float spanFactor = pow(au, 1.38);
            float flapPhase = phase - au * 1.45 - chord01 * 0.4;
            wingZ = sin(flapPhase) * spanFactor * 0.44 * flapAmp - 0.09 * au * au * cos(flapPhase);
            dWingDu = su * 1.38 * pow(max(au, 0.01), 0.38) * sin(flapPhase) * 0.44 * flapAmp;
          } else {
            // SPECIES 2: BLUE-SPOTTED STINGRAY (Anterior snout leads at +Z)
            float r = max(au, abs(v));
            float ang = atan(v, u);
            vec2 oval = vec2(cos(ang) * 0.88, sin(ang) * 0.96);
            oval.y -= 0.06 * exp(-pow(u * 4.0, 2.0)) * step(v, 0.0);
            x = oval.x * r;
            z = -oval.y * r; // Flip so anterior snout is at +Z (forward)!

            float eyeBump = exp(-(pow((abs(x) - 0.18) / 0.07, 2.0) + pow((z - 0.24) / 0.09, 2.0)));
            if (dorsal > 0.0) {
              y += eyeBump * 0.055;
            }

            float rimFactor = smoothstep(0.28, 0.92, length(vec2(x, z * 0.9)));
            float waveArg = -z * 5.8 - phase * 1.35 + au * 1.2;
            wingZ = sin(waveArg) * rimFactor * 0.16 * flapAmp;
            dWingDv = -cos(waveArg) * 5.8 * rimFactor * 0.16 * flapAmp;
          }

          x -= turnBend * z * z * 0.28;
          y += wingZ;

          localNorm = normalize(vec3(-dWingDu * 0.65, dorsal, dWingDv * 0.45));
          return vec3(x, y, z);
        }

        void main() {
          vBodyCoord = aBodyCoord;
          vSpecies = aInstAnim.z;
          vSandBurial = aInstState.z;

          float phase = aInstAnim.x;
          float flapAmp = aInstAnim.y;
          float pitch = aInstAnim.w;

          float turnBend = aInstState.x;
          float rollBank = aInstState.y;
          float sizeScale = aInstState.w;

          vec3 worldCenter = aInstPose.xyz; // (x, y_up, z_south)
          float yaw = aInstPose.w;

          vec3 localNorm;
          vec3 p = shapeRayVertex(aBodyCoord, vSpecies, phase, flapAmp, turnBend, localNorm);
          p *= sizeScale;

          float cr = cos(rollBank), sr = sin(rollBank);
          vec3 pRoll = vec3(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
          vec3 nRoll = vec3(localNorm.x * cr - localNorm.y * sr, localNorm.x * sr + localNorm.y * cr, localNorm.z);

          float cp = cos(pitch), sp = sin(pitch);
          vec3 pPitch = vec3(pRoll.x, pRoll.y * cp + pRoll.z * sp, -pRoll.y * sp + pRoll.z * cp);
          vec3 nPitch = vec3(nRoll.x, nRoll.y * cp + nRoll.z * sp, -nRoll.y * sp + nRoll.z * cp);

          float cy = cos(yaw), sy = sin(yaw);
          vec3 worldOffset = vec3(pPitch.x * cy + pPitch.z * sy, pPitch.y, -pPitch.x * sy + pPitch.z * cy);
          vWorldNormal = normalize(vec3(nPitch.x * cy + nPitch.z * sy, nPitch.y, -nPitch.x * sy + nPitch.z * cy));

          vec3 wp = worldCenter + worldOffset;
          if (wp.y < 0.0) {
            float subDepth = clamp(-wp.y, 0.0, 2.5);
            wp.x += sin(wp.x * 2.4 + wp.z * 1.9 + uTime * 3.1) * 0.025 * subDepth * uRefractionScale;
            wp.z += cos(wp.z * 2.4 - wp.x * 1.9 + uTime * 2.7) * 0.025 * subDepth * uRefractionScale;
          }
          vWorldPos = wp;

          // Map (x, y_up, z_south) to unified scene coordinates (x, -z_south, y_up)
          vec3 scenePos = vec3(wp.x, -wp.z, wp.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec4 vBodyCoord;
        varying float vSpecies;
        varying float vSandBurial;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        vec2 spotGrid(vec2 p) {
          vec2 n = floor(p);
          vec2 f = fract(p);
          float minDist = 8.0;
          float cellId = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 g = vec2(float(i), float(j));
              vec2 rnd = vec2(hash21(n + g), hash21(n + g + 17.3));
              vec2 o = 0.22 + 0.56 * rnd;
              float d = length(g + o - f);
              if (d < minDist) {
                minDist = d;
                cellId = rnd.x;
              }
            }
          }
          return vec2(minDist, cellId);
        }

        void main() {
          float u = vBodyCoord.x;
          float v = vBodyCoord.y;
          float dorsal = vBodyCoord.z;
          float isTail = vBodyCoord.w;
          float au = abs(u);

          vec3 albedo = vec3(0.1);

          if (vSpecies < 0.5) {
            if (isTail > 0.5) {
              albedo = vec3(0.08, 0.09, 0.12);
            } else if (dorsal > 0.0) {
              vec3 jetBlack = vec3(0.06, 0.07, 0.11);
              vec3 shoulderWhite = vec3(0.95, 0.98, 1.0);
              float inPatchU = smoothstep(0.07, 0.13, au) * smoothstep(0.56, 0.34, au);
              float inPatchV = smoothstep(-0.62, -0.36, v) * smoothstep(0.18, -0.08, v - au * 0.35);
              float collarCut = smoothstep(0.05, 0.18, abs(v + 0.22 + au * 0.4));
              float patchMask = inPatchU * inPatchV * (0.35 + 0.65 * collarCut);

              float hornTip = exp(-pow((au - 0.21) / 0.06, 2.0)) * smoothstep(-0.55, -0.88, v);
              float rimEdge = smoothstep(0.84, 0.99, au) * 0.25;
              albedo = mix(jetBlack, shoulderWhite, clamp(patchMask * 0.95 + hornTip * 0.8 + rimEdge, 0.0, 1.0));
            } else {
              vec3 bellyWhite = vec3(0.96, 0.97, 0.99);
              vec2 sg = spotGrid(vec2(u * 4.5, v * 4.5 + 1.3));
              float bellySpot = smoothstep(0.24, 0.14, sg.x) * step(0.42, sg.y) * smoothstep(0.75, 0.25, au);
              float gillU = smoothstep(0.08, 0.12, au) * smoothstep(0.28, 0.22, au);
              float gillV = smoothstep(-0.45, -0.15, v) * smoothstep(0.15, -0.05, v);
              float gillBars = step(0.65, sin(v * 52.0)) * gillU * gillV;
              float darkEdge = smoothstep(0.72, 0.98, au);
              albedo = mix(bellyWhite, vec3(0.11, 0.13, 0.17), clamp(bellySpot * 0.85 + gillBars * 0.75 + darkEdge * 0.65, 0.0, 1.0));
            }
          } else if (vSpecies < 1.5) {
            if (isTail > 0.5) {
              albedo = vec3(0.07, 0.09, 0.14);
            } else if (dorsal > 0.0) {
              vec3 darkBack = vec3(0.07, 0.11, 0.19);
              vec3 spotWhite = vec3(0.97, 0.99, 1.0);
              float bodyInterior = smoothstep(0.96, 0.78, max(au, abs(v))) * smoothstep(-0.78, -0.45, v);
              vec2 sg = spotGrid(vec2(u * 9.5, v * 8.0));
              float solidSpot = smoothstep(0.22, 0.12, sg.x) * step(0.45, sg.y);
              float ringSpot = smoothstep(0.11, 0.04, abs(sg.x - 0.24)) * step(sg.y, 0.45);
              float pattern = clamp(solidSpot + ringSpot, 0.0, 1.0) * bodyInterior;
              albedo = mix(darkBack, spotWhite, pattern * 0.96);
            } else {
              albedo = mix(vec3(0.94, 0.96, 0.98), vec3(0.14, 0.17, 0.24), smoothstep(0.75, 0.98, au));
            }
          } else {
            vec3 tanBase = vec3(0.72, 0.58, 0.34);
            vec3 electricBlue = vec3(0.06, 0.80, 1.0);
            if (isTail > 0.5) {
              float sideStripe = smoothstep(0.35, 0.75, au) * smoothstep(0.85, 0.2, v);
              float bands = 0.85 + 0.15 * sin(v * 42.0);
              float whiteTip = smoothstep(0.78, 0.95, v);
              albedo = mix(tanBase * bands, electricBlue, sideStripe * 0.92);
              albedo = mix(albedo, vec3(0.95, 0.97, 1.0), whiteTip);
            } else if (dorsal > 0.0) {
              float rimDist = length(vec2(u * 0.92, v * 0.95));
              vec3 rimYellow = vec3(0.84, 0.71, 0.45);
              albedo = mix(tanBase, rimYellow, smoothstep(0.68, 0.96, rimDist));

              vec2 sg = spotGrid(vec2(u * 6.8 + 0.5, v * 6.8 + 0.3));
              float spotCore = smoothstep(0.24, 0.14, sg.x) * smoothstep(0.92, 0.45, rimDist);
              float spotHalo = smoothstep(0.31, 0.23, sg.x) * (1.0 - spotCore) * smoothstep(0.92, 0.45, rimDist);
              albedo = mix(albedo, vec3(0.36, 0.27, 0.14), spotHalo * 0.55);
              albedo = mix(albedo, electricBlue, spotCore);

              float eyeMask = smoothstep(0.06, 0.025, length(vec2(au - 0.19, v + 0.29)));
              float spiracleMask = smoothstep(0.075, 0.03, length(vec2(au - 0.21, v + 0.19)));
              albedo = mix(albedo, vec3(0.08, 0.07, 0.06), max(eyeMask, spiracleMask * 0.88));

              if (vSandBurial > 0.01) {
                float sandNoise = fract(sin(dot(floor(vec2(u, v) * 32.0), vec2(12.9898, 78.233))) * 43758.5453);
                float dustMask = smoothstep(0.25, 0.85, rimDist + sandNoise * 0.35) * vSandBurial;
                albedo = mix(albedo, vec3(0.86, 0.80, 0.67), dustMask * 0.65);
              }
            } else {
              albedo = vec3(0.92, 0.89, 0.82);
            }
          }

          vec3 lightDir = normalize(vec3(0.32, 0.88, -0.35));
          vec3 norm = normalize(vWorldNormal);
          float ndl = max(0.35, dot(norm, lightDir));
          vec3 col = albedo * (0.48 + 0.65 * ndl);

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            float cWave1 = sin(vWorldPos.x * 3.8 + uTime * 2.4) * cos(vWorldPos.z * 3.8 - uTime * 2.1);
            float cWave2 = sin((vWorldPos.x - vWorldPos.z) * 4.5 - uTime * 1.9);
            float causticLight = pow(max(0.0, cWave1 * 0.65 + cWave2 * 0.35), 2.4) * smoothstep(-0.2, 0.6, norm.y) * exp(-subDepth * 0.35);
            col += vec3(0.48, 0.95, 1.0) * causticLight * uCausticsIntensity * 0.46;

            vec3 waterCol = mix(vec3(0.09, 0.78, 0.78), vec3(0.03, 0.42, 0.66), clamp(subDepth / 3.2, 0.0, 1.0));
            float turbidity = clamp(1.0 - uWaterClarity * 0.82, 0.04, 1.0);
            float fog = (1.0 - exp(-subDepth * (0.18 + turbidity * 0.55))) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterCol, clamp(fog, 0.0, 0.82));
          } else {
            vec3 viewDir = normalize(vec3(0.0, 1.0, 0.1));
            vec3 halfVec = normalize(lightDir + viewDir);
            float spec = pow(max(0.0, dot(norm, halfVec)), 48.0);
            col += vec3(1.0, 0.98, 0.92) * spec * 0.42;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      \`,depthTest:!0,depthWrite:!0,side:x.DoubleSide}),F=new x.Mesh(w,b);F.frustumCulled=!1,F.renderOrder=2,w.instanceCount=0,v.add(F);let L=p(x),O=new x.ShaderMaterial({uniforms:{uTime:{value:0},uWaterClarity:{value:.9},uCameraPos:{value:new x.Vector3(0,35,.01)}},vertexShader:\`
        precision highp float;
        attribute vec3 aBellCoord;
        attribute vec4 aInstPose;
        attribute vec4 aInstAxis;
        attribute vec4 aInstMeta;

        varying vec3 vBellCoord;
        varying float vSpecies;
        varying float vSqueeze;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        mat3 alignToAxis(vec3 dir) {
          vec3 up = normalize(dir);
          vec3 helper = abs(up.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 right = normalize(cross(helper, up));
          vec3 fwd = cross(up, right);
          return mat3(right, up, fwd);
        }

        void main() {
          vBellCoord = aBellCoord;
          vSpecies = aInstMeta.x;
          vSqueeze = aInstMeta.y;

          float r01 = aBellCoord.x;
          float theta = aBellCoord.y;
          float scale = aInstPose.w;

          float domeHeight = (vSpecies < 0.5) ? 0.56 : 0.86;
          float delayedSqueeze = sin(clamp(vSqueeze * 1.15 - r01 * 0.28, 0.0, 1.0) * 1.570796);
          float radialContract = 1.0 - delayedSqueeze * (0.28 * pow(r01, 1.35));
          float axialStretch = 1.0 + delayedSqueeze * 0.22;

          float lobes = (vSpecies < 0.5) ? 8.0 : 16.0;
          float scallop = sin(theta * lobes) * 0.025 * pow(r01, 3.0);

          vec3 localPos = vec3(
            position.x * radialContract,
            position.y * domeHeight * axialStretch + scallop,
            position.z * radialContract
          ) * scale;

          vec3 localNorm = normalize(vec3(
            normal.x / max(radialContract, 0.2),
            normal.y / max(domeHeight * axialStretch, 0.2),
            normal.z / max(radialContract, 0.2)
          ));

          mat3 rot = alignToAxis(aInstAxis.xyz);
          vWorldPos = aInstPose.xyz + rot * localPos;
          vWorldNormal = normalize(rot * localNorm);

          vec3 scenePos = vec3(vWorldPos.x, -vWorldPos.z, vWorldPos.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec3 vBellCoord;
        varying float vSpecies;
        varying float vSqueeze;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform vec3 uCameraPos;

        void main() {
          float r = vBellCoord.x;
          float theta = vBellCoord.y;

          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 norm = normalize(vWorldNormal);
          float ndv = abs(dot(norm, viewDir));
          float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.15);

          vec3 col = vec3(0.0);
          float alpha = 0.5;

          if (vSpecies < 0.5) {
            vec3 baseCyan = vec3(0.74, 0.92, 1.0);
            vec3 rimGlow = vec3(0.92, 0.98, 1.0);

            float gonadMask = 0.0;
            vec2 uvBell = vec2(cos(theta), sin(theta)) * r;
            for (int k = 0; k < 4; k++) {
              float ang = float(k) * 1.5707963 + 0.785398;
              vec2 dir = vec2(cos(ang), sin(ang));
              vec2 perp = vec2(-dir.y, dir.x);
              vec2 center = dir * 0.34;
              vec2 local = uvBell - center;
              float gx = dot(local, dir);
              float gy = dot(local, perp);
              float gr = length(vec2(gx * 1.15, gy));
              float ring = exp(-pow((gr - 0.115) / 0.032, 2.0));
              float gapCut = smoothstep(0.01, -0.05, gx);
              gonadMask = max(gonadMask, ring * (0.2 + 0.8 * gapCut));
            }

            float canal16 = pow(abs(cos(theta * 8.0 + sin(r * 10.0) * 0.15)), 18.0);
            float canal32 = pow(abs(cos(theta * 16.0)), 24.0) * smoothstep(0.35, 0.85, r);
            float canals = clamp(canal16 * 0.65 + canal32 * 0.55, 0.0, 1.0) * smoothstep(0.15, 0.96, r);

            float fringe = smoothstep(0.88, 0.99, r) * (0.55 + 0.45 * sin(theta * 72.0 + uTime * 4.0));

            vec3 gonadPink = vec3(1.0, 0.48, 0.78);
            col = mix(baseCyan, rimGlow, fresnel);
            col = mix(col, vec3(0.90, 0.97, 1.0), canals * 0.55 + fringe * 0.65);
            col = mix(col, gonadPink, gonadMask * 0.94);

            alpha = clamp(0.32 + fresnel * 0.52 + gonadMask * 0.55 + canals * 0.22 + fringe * 0.30, 0.24, 0.94);
          } else {
            vec3 amberCore = vec3(1.0, 0.70, 0.22);
            vec3 rustStripe = vec3(0.78, 0.22, 0.07);
            vec3 warmRim = vec3(1.0, 0.88, 0.55);

            float stripeWave = cos(theta * 16.0);
            float stripeMask = smoothstep(0.15, 0.72, stripeWave) * smoothstep(0.14, 0.55, r);
            float marginRing = smoothstep(0.78, 0.98, r);
            float apexSpot = smoothstep(0.22, 0.0, r) * 0.55;

            col = mix(amberCore, rustStripe, clamp(stripeMask * 0.85 + marginRing * 0.65 + apexSpot, 0.0, 1.0));
            col += warmRim * fresnel * 0.75;

            alpha = clamp(0.52 + fresnel * 0.44 + stripeMask * 0.18, 0.40, 0.96);
          }

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            vec3 waterTint = mix(vec3(0.10, 0.78, 0.78), vec3(0.03, 0.38, 0.62), clamp(subDepth / 3.2, 0.0, 1.0));
            float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterTint, clamp(fog, 0.0, 0.75));
          }

          gl_FragColor = vec4(col, alpha);
        }
      \`,transparent:!0,depthTest:!0,depthWrite:!0,side:x.DoubleSide}),ae=new x.Mesh(L,O);ae.frustumCulled=!1,ae.renderOrder=4,L.instanceCount=0,v.add(ae);let _=u*h*2,E=u*(h-1)*2,z=new Float32Array(_*3),D=new Float32Array(_*2),C=new Float32Array(_*4),I=new Uint32Array(E*3),K=0;for(let Z=0;Z<u;Z++){let Ie=Z*h*2;for(let Ne=0;Ne<h-1;Ne++){let ee=Ie+Ne*2,Ee=ee+1,Ue=ee+2,Ve=ee+3;I[K++]=ee,I[K++]=Ue,I[K++]=Ee,I[K++]=Ee,I[K++]=Ue,I[K++]=Ve}}let G=new x.BufferGeometry;G.setIndex(new x.BufferAttribute(I,1));let oe=new x.BufferAttribute(z,3).setUsage(x.DynamicDrawUsage),le=new x.BufferAttribute(D,2).setUsage(x.DynamicDrawUsage),M=new x.BufferAttribute(C,4).setUsage(x.DynamicDrawUsage);G.setAttribute("position",oe),G.setAttribute("uv",le),G.setAttribute("aRibbonColor",M),G.setDrawRange(0,0);let q=new x.ShaderMaterial({uniforms:{uTime:{value:0},uWaterClarity:{value:.9}},vertexShader:\`
        precision highp float;
        attribute vec4 aRibbonColor;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vColor = aRibbonColor;
          vWorldPos = position;
          vec3 scenePos = vec3(position.x, -position.z, position.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(scenePos, 1.0);
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec2 vUv;
        varying vec4 vColor;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform float uWaterClarity;

        void main() {
          float u = vUv.x * 2.0 - 1.0;
          float v = vUv.y;
          float rType = vColor.a;

          vec3 col = vColor.rgb;
          float alpha = 0.0;

          if (rType < 0.5) {
            float ruffleWave = sin(v * 38.0 - uTime * 3.2) * 0.35 + cos(v * 64.0 + u * 4.0) * 0.22;
            float edge = abs(u + ruffleWave * (1.0 - v * 0.4));
            float frill = smoothstep(0.95, 0.25, edge);
            float pleatHighlight = smoothstep(0.15, 0.75, abs(sin(v * 42.0 + u * 3.0)));
            col = mix(col * 0.85, vec3(1.0, 0.97, 0.90), pleatHighlight * 0.55);
            alpha = frill * (1.0 - pow(v, 1.6)) * 0.82;
          } else {
            float core = exp(-u * u * 4.5);
            float bead = 0.85 + 0.15 * sin(v * 55.0 - uTime * 4.0);
            alpha = core * (1.0 - pow(v, 1.35)) * bead * 0.80;
          }

          if (alpha < 0.02) discard;

          if (vWorldPos.y < 0.0) {
            float subDepth = -vWorldPos.y;
            vec3 waterTint = mix(vec3(0.10, 0.78, 0.78), vec3(0.03, 0.38, 0.62), clamp(subDepth / 3.2, 0.0, 1.0));
            float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
            col = mix(col, waterTint, clamp(fog, 0.0, 0.75));
          }

          gl_FragColor = vec4(col, alpha);
        }
      \`,transparent:!0,depthTest:!0,depthWrite:!1,side:x.DoubleSide}),se=new x.Mesh(G,q);se.frustumCulled=!1,se.renderOrder=3,v.add(se);let X=[],pe=1;function ve(Z,Ie,Ne,ee,Ee){let Ue=[];for(let Ve=0;Ve<12;Ve++){let we=Ve<4,Qe=we?4:8,vt=(we?Ve:Ve-4)/Qe*Math.PI*2+(we?.35:.12),xt=(we?.18:.68)*Ee,Q=(ee?(we?1.55:2.35+Ve%3*.28)*Ee:(we?.68:.44+Ve%2*.1)*Ee)/(h-1),Le=we?(ee?.16:.1)*Ee:(ee?.036:.022)*Ee,Ge=[];for(let qe=0;qe<h;qe++)Ge.push({x:Z+Math.cos(vt)*xt,y:Ie-qe*Q,z:Ne+Math.sin(vt)*xt,vx:0,vy:0,vz:0});Ue.push({isOral:we,angle:vt,radius:xt,segLen:Q,width:Le,nodes:Ge})}return Ue}function fe(){for(let Z=0;Z<25;Z++){let Ie=.24+Math.random()*.66,Ne=.14+Math.random()*.72;if(m.getUvBathymetry(Ie,Ne)>.65)return{u:Ie,v:Ne}}return{u:.58,v:.44}}function J(Z,Ie){let{worldW:Ne,worldH:ee}=m.getWorldSize();return{x:(Z-.5)*Ne,z:(.5-Ie)*ee}}function k(Z,Ie){let{worldW:Ne,worldH:ee}=m.getWorldSize();return{u:Z/Ne+.5,v:.5-Ie/ee}}function ne(Z,Ie={}){if(X.length>=l){let vt=X.findIndex(xt=>xt.state!=="hovered");if(vt!==-1)X.splice(vt,1);else return null}let Ne=Z==="manta"||Z==="eagle"||Z==="stingray",ee;if(Ie.u!==void 0&&Ie.v!==void 0)ee=J(Ie.u,Ie.v);else if(Ie.x!==void 0&&Ie.z!==void 0)ee={x:Ie.x,z:Ie.z};else{let vt=fe();ee=J(vt.u,vt.v)}let Ee=k(ee.x,ee.z),Ue=Math.max(.45,m.getUvBathymetry(Ee.u,Ee.v)),Ve=Z==="stingray"?-Math.min(Ue*.85,1.45):Ne?-.42-Math.random()*.5:-.36-Math.random()*.42,we=Ie.yaw!==void 0?Ie.yaw:Math.random()*Math.PI*2,Qe=Z==="manta"?1.15+Math.random()*.22:Z==="eagle"?.96+Math.random()*.18:Z==="stingray"?.82+Math.random()*.14:Z==="nettle"?.76+Math.random()*.14:.72+Math.random()*.14,ct={id:pe++,species:Z,isRay:Ne,speciesId:Z==="manta"?0:Z==="eagle"?1:Z==="stingray"?2:Z==="moon"?0:1,state:Ie.state||"swimming",x:ee.x,y:Ie.y!==void 0?Ie.y:Ve,z:ee.z,vx:Ie.vx||0,vy:Ie.vy||0,vz:Ie.vz||0,yaw:we,targetYaw:we,turnRate:0,turnBend:0,rollBank:0,pitch:Ie.pitch||0,speed:Z==="manta"?2.35:Z==="eagle"?2.55:Z==="stingray"?1.65:.45,baseSpeed:Z==="manta"?2.35:Z==="eagle"?2.55:Z==="stingray"?1.65:.45,phase:Math.random()*Math.PI*2,flapAmp:1,scale:Qe,sandBurial:0,stateTimer:4+Math.random()*9,wakeTimer:0,dripTimer:0,axis:new x.Vector3(Math.sin(we)*.75,.42,Math.cos(we)*.75).normalize(),targetAxis:new x.Vector3(Math.sin(we)*.75,.42,Math.cos(we)*.75).normalize(),ribbons:Ne?null:ve(ee.x,Ie.y!==void 0?Ie.y:Ve,ee.z,Z==="nettle",Qe)};return X.push(ct),ct}function ce(Z,Ie,Ne,ee=1){let Ee=Z.x-Ie,Ue=Z.z-Ne,Ve=Math.atan2(Ee,Ue)+(Math.random()-.5)*.45;if(Z.species==="stingray"&&(Z.state==="resting"||Z.sandBurial>.15)){m.spawnSandSiltCloudWorld(Z.x,-Z.z,Z.y);let Qe=k(Z.x,Z.z);m.addWaterImpulseUv(Qe.u,Qe.v,.022,-.35,ee),S&&S.playSplash(.35)}Z.state="swimming",Z.sandBurial=0,Z.targetYaw=Ve,Z.speed=Z.baseSpeed*2.55,Z.stateTimer=5+Math.random()*6;let we=k(Z.x,Z.z);m.addWaterImpulseUv(we.u,we.v,.018,-.32,ee)}function H(Z,Ie=1){if(Z.state!=="swimming"||Z.species!=="manta"&&Z.species!=="eagle")return;Z.state="breaching",Z.y=.02;let Ne=Z.baseSpeed*1.45;Z.vx=Math.sin(Z.yaw)*Ne,Z.vz=Math.cos(Z.yaw)*Ne,Z.vy=7.6+Math.random()*1.4,Z.pitch=.55,Z.breachFlipMode=Math.random()<.5?"backflip":"barrel",Z.breachProgress=0;let ee=k(Z.x,Z.z);m.spawnWaterSplashUv(ee.u,ee.v,.95,S,Ie)}let j=new x.Vector3,he=new x.Vector3,de=new x.Vector3,ie=new x.Vector3,R=new x.Vector3,T=new x.Vector3,te=new x.Vector3(0,35,.01);function $(Z,Ie,{isWhirlpool:Ne,whirlStrength:ee,whirlpoolUv:Ee,settings:Ue={},swimSpeedMult:Ve,rippleStrengthMult:we,waterClarity:Qe,causticsIntensity:ct,meteorAge:vt=-1}){let{worldW:xt,worldH:tt}=m.getWorldSize(),Q=m.getAspect(),Le=Ve??Ue.fishSpeed??1,Ge=we??Ue.rippleStrength??1,qe=Qe??o((Ue.clarity??1.15)*.78,.15,1),Me=ct??Ue.caustics??1,Re=typeof ee=="number"?ee:Ne?1:0,Be=Re>.01&&Ee;b.uniforms.uTime.value=Ie,b.uniforms.uWaterClarity.value=qe,b.uniforms.uCausticsIntensity.value=Me,O.uniforms.uTime.value=Ie,O.uniforms.uWaterClarity.value=qe,q.uniforms.uTime.value=Ie,q.uniforms.uWaterClarity.value=qe;let Ze=Ee&&typeof Ee.u=="number"&&typeof Ee.v=="number"?J(Ee.u,Ee.v):{x:0,z:0},$e=0,Fe=0,st=0,ft=0,ht=0,gt=w.attributes.aInstAnim,N=w.attributes.aInstState,Pe=w.attributes.aInstPose,be=L.attributes.aInstPose,Te=L.attributes.aInstAxis,He=L.attributes.aInstMeta;for(let rt=0;rt<X.length;rt++){let A=X[rt],We=i.OceanMeteor.isFlying(vt,rt),Xe=k(A.x,A.z);i.OceanMeteor.reentry(A,vt,rt)&&(A.state="swimming",A.sandBurial=0,A.stateTimer=Math.max(A.stateTimer,2),A.speed=Math.max(A.speed,A.baseSpeed*Le*.72),A.y=Math.min(A.y,-.25),A.vy=0,A.airborne=!1,A.airborneVy=0,!A.isRay&&Math.hypot(A.vx,A.vz)<.001&&(A.vx=Math.sin(A.yaw)*A.baseSpeed*Le,A.vz=Math.cos(A.yaw)*A.baseSpeed*Le),m.spawnWaterSplashUv(Xe.u,Xe.v,.85,S,Ge));let De=m.getUvBathymetry(Xe.u,Xe.v),U=A.scale,P=A.x,at=A.y,ot=A.z,it=A.rollBank,pt=A.pitch;if(We){let me=i.OceanMeteor.flight({u:Xe.u,v:Xe.v,z:A.y,roll:A.rollBank,flip:A.pitch},vt,rt,Q),ue=J(me.u,me.v);P=ue.x,ot=ue.z,at=me.z,it=me.roll,pt=me.flip}if(st<m.MAX_SHADOW_CASTERS){let me=A.isRay?U*1.25:U*.72;m.creatureShadowData[st].set(P,at,ot,me),st++}if(A.isRay){if(!We){if(A.state==="hovered")A.phase+=Z*6.5*Le,A.flapAmp=.85,A.pitch=x.MathUtils.lerp(A.pitch,0,Z*6),A.rollBank=x.MathUtils.lerp(A.rollBank,0,Z*6),A.turnBend=x.MathUtils.lerp(A.turnBend,0,Z*6);else if(A.state==="thrown"){A.vy-=14.5*Z,A.x+=A.vx*Z,A.y+=A.vy*Z,A.z+=A.vz*Z,A.phase+=Z*8*Le,A.flapAmp=.9;let me=Math.hypot(A.vx,A.vz)+.001;if(A.pitch=o(Math.atan2(A.vy,me)*.65,-.95,.95),A.y<=-.05){let ue=k(A.x,A.z);m.spawnWaterSplashUv(ue.u,ue.v,1.15,S,Ge),A.state="swimming",A.y=-.25,A.speed=A.baseSpeed*1.45,A.pitch=0}}else if(A.state==="breaching"){A.vy-=12.8*Z,A.x+=A.vx*Z,A.y+=A.vy*Z,A.z+=A.vz*Z,A.phase+=Z*7.5*Le,A.flapAmp=.65,A.breachProgress=o((A.breachProgress||0)+Z*.92,0,1);let me=c(.05,.92,A.breachProgress)*Math.PI*2;if(A.breachFlipMode==="barrel"?(A.rollBank=me,A.pitch=o(A.vy*.06,-.45,.45)):(A.pitch=me,A.rollBank=0),A.y<=-.05&&A.vy<0){let ue=k(A.x,A.z);m.spawnWaterSplashUv(ue.u,ue.v,1.35,S,Ge),A.state="swimming",A.y=-.35,A.pitch=0,A.rollBank=0,A.speed=A.baseSpeed*1.35,A.stateTimer=8+Math.random()*10}}else if(A.state==="resting"){A.sandBurial=x.MathUtils.lerp(A.sandBurial,.85,Z*1.8),A.speed=x.MathUtils.lerp(A.speed,0,Z*4),A.flapAmp=x.MathUtils.lerp(A.flapAmp,.14,Z*3),A.phase+=Z*2.2;let me=-Math.max(.35,Math.min(De*.9,1.65));A.y=x.MathUtils.lerp(A.y,me,Z*3.5),A.rollBank=x.MathUtils.lerp(A.rollBank,0,Z*5),A.turnBend=x.MathUtils.lerp(A.turnBend,0,Z*5),A.stateTimer-=Z,A.stateTimer<=0&&(A.state="swimming",A.sandBurial=0,A.stateTimer=7+Math.random()*9,A.targetYaw=A.yaw+(Math.random()-.5)*1.6)}else{A.sandBurial=x.MathUtils.lerp(A.sandBurial,0,Z*3.5),A.speed=x.MathUtils.lerp(A.speed,A.baseSpeed*Le,Z*1.8);let me=A.speed/Math.max(.1,A.baseSpeed),ue=(A.species==="stingray"?5.8:3.6)*(.65+.45*me);A.phase+=Z*ue,A.flapAmp=x.MathUtils.lerp(A.flapAmp,o(.75+.25*me,.6,1.35),Z*4);let Ae=2.6,Ce=A.x+Math.sin(A.yaw)*Ae,B=A.z+Math.cos(A.yaw)*Ae,W=k(Ce,B),V=m.getUvBathymetry(W.u,W.v);Math.abs(A.x)>xt*.5||Math.abs(A.z)>tt*.5?A.offscreenTimer=(A.offscreenTimer||0)+Z:A.offscreenTimer=0;let ye=xt*.6,Se=tt*.6,Oe=Math.abs(Ce)>ye||Math.abs(B)>Se||A.offscreenTimer>3.8;if((m.getShoreDistance?m.getShoreDistance(W.u,W.v):1)<.22||V<.62&&W.u<.38&&W.v>.52||Oe){let Ye=(Math.random()-.5)*xt*.3,et=(Math.random()-.5)*tt*.3;A.targetYaw=Math.atan2(Ye-A.x,et-A.z)+(Math.random()-.5)*.35}else Math.random()<Z*.45&&(A.targetYaw+=(Math.random()-.5)*.75);if(Be){let Ye=Ze.x-A.x,et=Ze.z-A.z,Ke=Math.hypot(Ye,et)+.001,mt=1.8+3.6*Re;if(Ke<mt){let wt=o((mt-Ke)/(mt*.45),0,1)*Re,yt=3.2+.4*((A.id||0)%3),Mt=Ke-yt,At=o(Mt*2.2,-.8,3.2)*(.95+1.25*Re);A.x+=Ye/Ke*At*Z*wt,A.z+=et/Ke*At*Z*wt;let Rt=Math.atan2(et,-Ye),pn=Math.atan2(Math.sin(Rt-A.targetYaw),Math.cos(Rt-A.targetYaw));A.targetYaw+=pn*wt*Z*3.4,A.speed=a(A.speed,(1.15+.35*Re)*Le,wt),A.rollBank=a(A.rollBank,-.42*Re,wt*Z*4)}}if(A.airborne&&(A.airborneVy=(A.airborneVy||5)-11.5*Z,A.y+=A.airborneVy*Z,A.rollBank+=Z*5,A.pitch+=Z*3.5,A.y<=-A.targetDepth)){A.airborne=!1,A.y=-A.targetDepth,A.airborneVy=0;let Ye=k(A.x,A.z);m.spawnWaterSplashUv(Ye.u,Ye.v,1.45,S,Ge)}let ze=Math.atan2(Math.sin(A.targetYaw-A.yaw),Math.cos(A.targetYaw-A.yaw)),ke=(A.species==="stingray"?2.4:1.85)*Z*(.7+.3*Le),nt=o(ze,-ke,ke);if(A.yaw+=nt,A.turnRate=nt/Math.max(Z,.001),A.rollBank=x.MathUtils.lerp(A.rollBank,o(-A.turnRate*.34,-.62,.62),Z*5.5),A.turnBend=x.MathUtils.lerp(A.turnBend,o(A.turnRate*.28,-.55,.55),Z*5.5),A.pitch=x.MathUtils.lerp(A.pitch,0,Z*5),A.x=o(A.x+Math.sin(A.yaw)*A.speed*Z,-xt*.64,xt*.64),A.z=o(A.z+Math.cos(A.yaw)*A.speed*Z,-tt*.64,tt*.64),m.enforceBeachBoundary){let Ye=k(A.x,A.z),et=m.enforceBeachBoundary(Ye.u,Ye.v,.09);if(et.clamped){let Ke=J(et.u,et.v);A.x=Ke.x,A.z=Ke.z,A.targetYaw=Math.atan2(0-A.x,0-A.z),A.yaw=A.targetYaw}}let je=A.species==="stingray"?-Math.max(.35,Math.min(De*.82,1.45)):-.32-.18*Math.sin(Ie*.7+A.id);if(A.y=x.MathUtils.lerp(A.y,je,Z*2.5),A.wakeTimer-=Z,A.y>-.65&&A.wakeTimer<=0){A.wakeTimer=.085;let Ye=o(.14*me,.08,.28),et=k(A.x-Math.sin(A.yaw)*U*.35,A.z-Math.cos(A.yaw)*U*.35);m.addWaterImpulseUv(et.u,et.v,.016*U,-Ye,Ge)}if(A.stateTimer-=Z,A.stateTimer<=0){let Ye=Math.abs(A.x)<xt*.46&&Math.abs(A.z)<tt*.46;A.species==="stingray"&&De>.55&&Ye?(A.state="resting",A.stateTimer=5+Math.random()*7):(A.species==="manta"||A.species==="eagle")&&De>1.2&&Ye&&Math.random()<.45?H(A,Ge):A.stateTimer=6+Math.random()*9}}P=A.x,at=A.y,ot=A.z,it=A.rollBank,pt=A.pitch}gt.setXYZW($e,A.phase,A.flapAmp,A.speciesId,pt),N.setXYZW($e,A.turnBend,it,A.sandBurial,U),Pe.setXYZW($e,P,at,ot,A.yaw),$e++}else{let me=A.species==="nettle",ue=(me?.52:.62)*Le;A.phase=(A.phase+Z*ue)%1;let{squeeze:Ae,thrust:Ce}=d(A.phase);if(!We){if(A.state==="hovered"){if(A.vx=0,A.vy=0,A.vz=0,A.axis.lerp(new x.Vector3(0,1,0),Z*5).normalize(),A.dripTimer-=Z,A.dripTimer<=0&&A.ribbons){A.dripTimer=.065+Math.random()*.06;let W=A.ribbons[Math.floor(Math.random()*A.ribbons.length)].nodes[h-1];m.spawnTentacleDripWorld(W.x,-W.z,W.y)}}else if(A.state==="thrown"){if(A.vy-=14.2*Z,A.x+=A.vx*Z,A.y+=A.vy*Z,A.z+=A.vz*Z,A.axis.set(A.vx,A.vy+4,A.vz).normalize(),A.y<=-.05){let B=k(A.x,A.z);m.spawnWaterSplashUv(B.u,B.v,.95,S,Ge),A.state="swimming",A.y=-.35,A.vx*=.25,A.vy=0,A.vz*=.25}}else{if(Math.random()<Z*.35){let je=Math.atan2(A.targetAxis.x,A.targetAxis.z)+(Math.random()-.5)*.9;A.targetAxis.set(Math.sin(je)*.85,.28+Math.random()*.25,Math.cos(je)*.85).normalize()}let B=Math.abs(A.x)>xt*.5||Math.abs(A.z)>tt*.5,W=xt*.58,V=tt*.58,re=k(A.x,A.z);(m.getShoreDistance?m.getShoreDistance(re.u,re.v):1)<.22||De<.65&&A.x<-xt*.15&&A.z>tt*.15||Math.abs(A.x)>W||Math.abs(A.z)>V?A.targetAxis.set((Math.random()-.5)*xt*.25-A.x,.35,(Math.random()-.5)*tt*.25-A.z).normalize():B&&Math.random()<Z*.4&&A.targetAxis.set(0-A.x,.35,0-A.z).normalize();let Oe=Math.sin(Ie*.35+A.z*.2)*.18,_e=Math.cos(Ie*.3+A.x*.2)*.18;if(Be){let je=Ze.x-A.x,Ye=Ze.z-A.z,et=Math.hypot(je,Ye)+.05,Ke=1.8+3.6*Re;if(et<Ke){let mt=o((Ke-et)/(Ke*.45),0,1)*Re,wt=1.25+.35*((A.id||0)%3),yt=et-wt,Mt=o(yt*2,-.8,2.8)*(.85+1.15*Re),At=je/et,Rt=Ye/et;Oe+=(At*Mt-Rt*(1.6+1.2*Re))*mt,_e+=(Rt*Mt+At*(1.6+1.2*Re))*mt,A.targetAxis.set(-Rt*.75+At*.35,.4,At*.75+Rt*.35).normalize()}}if(A.airborne&&(A.airborneVy=(A.airborneVy||4)-10*Z,A.y+=A.airborneVy*Z,A.y<=-A.targetDepth)){A.airborne=!1,A.y=-A.targetDepth,A.airborneVy=0;let je=k(A.x,A.z);m.spawnWaterSplashUv(je.u,je.v,.95,S,Ge)}A.axis.lerp(A.targetAxis,Z*2.2).normalize();let ge=(me?1.35:.95)*Le*Math.max(.05,Ce),ze=A.axis.x*ge+Oe,ke=A.axis.z*ge+_e;if(A.vx=x.MathUtils.lerp(A.vx,ze,Z*3.2),A.vz=x.MathUtils.lerp(A.vz,ke,Z*3.2),A.x=o(A.x+A.vx*Z,-xt*.62,xt*.62),A.z=o(A.z+A.vz*Z,-tt*.62,tt*.62),m.enforceBeachBoundary){let je=k(A.x,A.z),Ye=m.enforceBeachBoundary(je.u,je.v,.1);if(Ye.clamped){let et=J(Ye.u,Ye.v);A.x=et.x,A.z=et.z,A.targetAxis.set(Ye.normalU,.35,Ye.normalV).normalize(),A.vx=Ye.normalU*.35,A.vz=Ye.normalV*.35}}let nt=-.36-.15*Math.sin(Ie*.9+A.id);if(A.y=x.MathUtils.lerp(A.y,nt,Z*2.5),Ce>.85&&Math.random()<.18){let je=k(A.x,A.z);m.addWaterImpulseUv(je.u,je.v,.015*U,-.09,Ge)}}P=A.x,at=A.y,ot=A.z}if(be.setXYZW(Fe,P,at,ot,U),Te.setXYZW(Fe,A.axis.x,A.axis.y,A.axis.z,A.phase),He.setXYZW(Fe,me?1:0,Ae,A.id*.17,0),Fe++,A.ribbons){ie.copy(A.axis).normalize();let B=Math.abs(ie.y)<.99?new x.Vector3(0,1,0):new x.Vector3(1,0,0);R.crossVectors(B,ie).normalize(),T.crossVectors(ie,R).normalize();let W=at>.12,V=me?[1,.93,.78]:[.96,.72,.88],re=me?[.86,.34,.14]:[.78,.92,1];for(let ye=0;ye<A.ribbons.length;ye++){let Se=A.ribbons[ye],Oe=Se.nodes,_e=Math.cos(Se.angle),ge=Math.sin(Se.angle),ze=Se.radius*(1-Ae*.18),ke=Se.segLen,nt=Se.width,je=-.22*U;Oe[0].x=P+(R.x*_e+T.x*ge)*ze+ie.x*je,Oe[0].y=at+(R.y*_e+T.y*ge)*ze+ie.y*je,Oe[0].z=ot+(R.z*_e+T.z*ge)*ze+ie.z*je;let Ye=W?-9.5:-1.35,et=W?.24:.18;for(let wt=1;wt<h;wt++){let yt=Oe[wt-1],Mt=Oe[wt],At=wt/(h-1),Rt=W?.015:(Se.isOral?.045:.075)*At,pn=Math.sin(Ie*2.8-wt*.55+ye*1.3)*Rt,Tt=Math.cos(Ie*2.5-wt*.55+ye*1.7)*Rt,Pt=Math.hypot(A.vx,A.vz),It=W?.05:o(Pt*.85,.12,.92),Nt=a(0,-ie.x,It),ln=a(-1,-ie.y-.35,It),Mn=a(0,-ie.z,It),nr=Math.hypot(Nt,ln,Mn)+1e-4,Na=yt.x+Nt/nr*ke+pn,Ua=yt.y+ln/nr*ke+Ye*.015*Z,Ul=yt.z+Mn/nr*ke+Tt;Mt.x+=(Na-Mt.x)*o(Z*(11-At*4.5)/et*.18,.08,.65),Mt.y+=(Ua-Mt.y)*o(Z*(11-At*4.5)/et*.18,.08,.65),Mt.z+=(Ul-Mt.z)*o(Z*(11-At*4.5)/et*.18,.08,.65);let Oa=Mt.x-yt.x,rs=Mt.y-yt.y,Gu=Mt.z-yt.z,Ol=Math.hypot(Oa,rs,Gu)+1e-4;Mt.x=yt.x+Oa/Ol*ke,Mt.y=yt.y+rs/Ol*ke,Mt.z=yt.z+Gu/Ol*ke}let Ke=Se.isOral?V:re,mt=Se.isOral?0:1;for(let wt=0;wt<h;wt++){let yt=Oe[wt],Mt=Oe[Math.max(0,wt-1)],At=Oe[Math.min(h-1,wt+1)];j.set(At.x-Mt.x,At.y-Mt.y,At.z-Mt.z).normalize(),he.set(te.x-yt.x,te.y-yt.y,te.z-yt.z).normalize(),de.crossVectors(j,he),de.lengthSq()<1e-4?de.set(1,0,0):de.normalize();let Rt=wt/(h-1),pn=nt*(1-Rt*.62);for(let Tt=0;Tt<2;Tt++){let Pt=Tt===0?-1:1;z[ft*3]=yt.x+de.x*pn*Pt,z[ft*3+1]=yt.y+de.y*pn*Pt,z[ft*3+2]=yt.z+de.z*pn*Pt,D[ft*2]=Tt,D[ft*2+1]=Rt,C[ft*4]=Ke[0],C[ft*4+1]=Ke[1],C[ft*4+2]=Ke[2],C[ft*4+3]=mt,ft++}}ht+=(h-1)*6}}}}return w.instanceCount=$e,$e>0&&(gt.needsUpdate=!0,N.needsUpdate=!0,Pe.needsUpdate=!0),L.instanceCount=Fe,Fe>0&&(be.needsUpdate=!0,Te.needsUpdate=!0,He.needsUpdate=!0),oe.needsUpdate=!0,le.needsUpdate=!0,M.needsUpdate=!0,G.setDrawRange(0,ht),st}function xe(){let Z=0,Ie=0;for(let Ne=0;Ne<X.length;Ne++)X[Ne].isRay?Z++:Ie++;return{rays:Z,jellies:Ie}}return{creatures:X,spawnCreature:ne,startleRay:ce,triggerRayBreach:H,update:$,getCounts:xe,uvToXZ:J,xzToUv:k,findOpenSeaUv:fe,rayMaterial:b,jellyBellMaterial:O,ribbonMaterial:q,createRayInstancedGeometry:()=>f(x),createJellyBellInstancedGeometry:()=>p(x),ribbonIndices:I,NODES_PER_RIBBON:h}}i.OceanMarineLife={createRaysAndJelliesSystem:y}})(s)}function yp(s,e,t,n){(function(i){"use strict";let{clamp:r,mix:a,smoothstep:o}=i.OceanWaterSeabed,c=Math.PI*2,l=240,h=1440,u=l+h,d=8,f=6;function p(m){let S=[],w=[],b=[],F=[[-1.08,.065,.28,0],[-.86,.032,.16,0],[-.64,.062,.11,0],[-.36,.135,.19,0],[-.04,.205,.25,.005],[.28,.225,.26,.008],[.58,.18,.21,.004],[.82,.102,.13,-.004],[.98,.02,.03,-.008]],L=32,O=18;for(let E=0;E<=L;E++){let z=E/L*(F.length-1),D=Math.min(F.length-2,Math.floor(z)),C=z-D,I=F[Math.max(0,D-1)],K=F[D],G=F[D+1],oe=F[Math.min(F.length-1,D+2)],le=pe=>.5*(2*K[pe]+(-I[pe]+G[pe])*C+(2*I[pe]-5*K[pe]+4*G[pe]-oe[pe])*C*C+(-I[pe]+3*K[pe]-3*G[pe]+oe[pe])*C*C*C),M=a(K[0],G[0],C),q=Math.max(.004,le(1)),se=Math.max(.008,le(2)),X=le(3);for(let pe=0;pe<=O;pe++){let ve=pe/O*c,fe=Math.cos(ve),J=Math.sin(ve);S.push(fe*q,M,J*se+X),w.push(fe/q,0,J/se)}}for(let E=0;E<L;E++)for(let z=0;z<O;z++){let D=E*(O+1)+z,C=D+O+1;b.push(D,C,D+1,C,C+1,D+1)}function ae(E,z){let D=S.length/3;for(let C of E)S.push(C[0],C[1],C[2]),w.push(z[0],z[1],z[2]);b.push(D,D+1,D+2,D,D+2,D+3),b.push(D,D+2,D+1,D,D+3,D+2)}ae([[0,.28,.2],[0,-.36,.16],[0,-.48,.38],[0,.06,.4]],[1,0,.25]);for(let E of[-1,1])ae([[0,-.72,.04],[0,-.84,-.04],[E*.16,-1.16,-.18],[E*.18,-1.14,.22]],[E*.6,-.2,.75]);for(let E of[-1,1])ae([[E*.15,.36,-.02],[E*.13,.12,-.04],[E*.46,-.02,-.07],[E*.42,.26,-.03]],[0,0,1]);let _=new m.BufferGeometry;return _.setAttribute("position",new m.Float32BufferAttribute(S,3)),_.setAttribute("normal",new m.Float32BufferAttribute(w,3)),_.setIndex(b),_.computeVertexNormals(),_}function y(m){let S=[],w=[],b=[],F=[[-1.72,.008,.015,.03],[-1.45,.038,.048,.01],[-1.12,.085,.095,0],[-.72,.165,.175,0],[-.25,.255,.245,.01],[.22,.295,.265,.015],[.62,.265,.225,.01],[.98,.195,.155,-.005],[1.28,.115,.085,-.015],[1.48,.035,.028,-.02],[1.54,.002,.002,-.02]],L=32,O=72;for(let E=0;E<=O;E++){let z=E/O*(F.length-1),D=Math.min(F.length-2,Math.floor(z)),C=z-D,I=F[Math.max(0,D-1)],K=F[D],G=F[D+1],oe=F[Math.min(F.length-1,D+2)],le=M=>.5*(2*K[M]+(-I[M]+G[M])*C+(2*I[M]-5*K[M]+4*G[M]-oe[M])*C*C+(-I[M]+3*K[M]-3*G[M]+oe[M])*C*C*C);for(let M=0;M<=L;M++){let q=M/L*c;S.push(Math.cos(q)*Math.max(.002,le(1)),a(K[0],G[0],C),Math.sin(q)*Math.max(.002,le(2))+le(3)),w.push(0)}}for(let E=0;E<O;E++)for(let z=0;z<L;z++){let D=E*(L+1)+z,C=D+L+1;b.push(D,C,D+1,C,C+1,D+1)}function ae(E,z=!1,D=1){let C=w.length,I=16,K=[];for(let G=0;G<=(E.length-1)*4;G++){let oe=G/4,le=Math.min(E.length-2,Math.floor(oe)),M=oe-le,q=E[Math.max(0,le-1)],se=E[le],X=E[le+1],pe=E[Math.min(E.length-1,le+2)];K.push(se.map((ve,fe)=>{let J=.5*(2*se[fe]+(-q[fe]+X[fe])*M+(2*q[fe]-5*se[fe]+4*X[fe]-pe[fe])*M*M+(-q[fe]+3*se[fe]-3*X[fe]+pe[fe])*M*M*M);return fe>2?Math.max(.001,J):J}))}for(let[G,oe,le,M,q]of K)for(let se=0;se<=I;se++){let X=se/I*c,pe=Math.sin(X)*q*(.8+.2*Math.cos(X));S.push(G+(z?pe:0),oe+Math.cos(X)*M,le+(z?0:pe)),w.push(D)}for(let G=0;G<K.length-1;G++)for(let oe=0;oe<I;oe++){let le=C+G*(I+1)+oe,M=le+I+1;b.push(le,M,le+1,M,M+1,le+1)}}ae([[0,.08,.22,.28,.045],[0,.02,.38,.22,.035],[0,-.08,.56,.14,.024],[0,-.18,.68,.05,.01],[0,-.22,.71,.004,.002]],!0,1),ae([[0,-.92,.09,.11,.022],[0,-.98,.19,.07,.015],[0,-1.04,.25,.02,.005]],!0,1),ae([[0,-1.48,.02,.14,.028],[0,-1.68,.18,.15,.024],[0,-1.92,.36,.11,.016],[0,-2.12,.48,.04,.006]],!0,2),ae([[0,-1.48,-.01,.12,.024],[0,-1.62,-.16,.1,.018],[0,-1.74,-.26,.03,.006]],!0,2);for(let E of[-1,1])ae([[E*.22,.36,-.1,.24,.036],[E*.46,.22,-.14,.21,.028],[E*.72,.04,-.17,.14,.018],[E*.9,-.1,-.18,.04,.006]],!1,1),ae([[E*.12,-.52,-.11,.12,.022],[E*.26,-.6,-.13,.09,.015],[E*.34,-.66,-.14,.02,.005]],!1,1);let _=new m.BufferGeometry;return _.setAttribute("position",new m.Float32BufferAttribute(S,3)),_.setAttribute("fin",new m.Float32BufferAttribute(w,1)),_.setIndex(b),_.computeVertexNormals(),_}function x(m){let S=[],w=[],b=[],F=[],L=[];function O(H,j,he,de,ie,R,T,te,$){return S.push(H,j,he),w.push(0,0,1),b.push(de,ie,R,T),F.push(te,$),S.length/3-1}let ae=20,_=36,E=-.13,z=0;for(let H=0;H<=ae;H++){let j=H/ae;for(let he=0;he<=_;he++){let de=he/_*c,ie=Math.sin(de),R=Math.cos(de),T=.45*ie*(1+.1*R),te=.54*R,$=j*T,xe=E+j*te,Z=.27*Math.sqrt(Math.max(.001,1-j*j)),Ie=j>.8?.012*Math.sin((j-.8)/.2*Math.PI*.5):0,Ne=.012*Math.exp(-(($/.12)**2))*Math.sin((1-j)*Math.PI*.88),ee=Z+Ie+Ne,Ee=$/.45,Ue=(xe-E)/.54;O($,xe,ee,0,j,de/c,ie>=0?1:-1,Ee,Ue)}}let D=_+1;for(let H=0;H<ae;H++)for(let j=0;j<_;j++){let he=z+H*D+j,de=he+1,ie=z+(H+1)*D+j,R=ie+1;L.push(he,ie,de,de,ie,R)}let C=12,I=S.length/3;for(let H=0;H<=C;H++){let j=H/C;for(let he=0;he<=_;he++){let de=he/_*c,ie=Math.sin(de),R=Math.cos(de),T=.41*ie*(1+.1*R),te=.5*R,$=j*T,xe=E+j*te,Z=-.085*(1-j*.88),Ie=$/.41,Ne=(xe-E)/.5;O($,xe,Z,.5,j,de/c,ie>=0?1:-1,Ie,Ne)}}for(let H=0;H<C;H++)for(let j=0;j<_;j++){let he=I+H*D+j,de=he+1,ie=I+(H+1)*D+j,R=ie+1;L.push(he,de,ie,de,R,ie)}let K=z+ae*D,G=I+C*D;for(let H=0;H<_;H++){let j=K+H,he=j+1,de=G+H,ie=de+1;L.push(j,de,he,he,de,ie)}let oe=16,le=20,M=S.length/3;for(let H=0;H<=oe;H++){let j=H/oe,he=.24+j*.38,de,ie,R;if(j<.42){let T=j/.42;de=.095+.018*T,ie=.082+.016*T,R=.012+.014*T}else if(j<.8){let T=(j-.42)/.38;de=.118+.018*Math.sin(T*Math.PI),ie=.098+.016*Math.sin(T*Math.PI),R=.024+.01*Math.sin(T*Math.PI)}else{let T=(j-.8)/.2;de=.118*(1-T*.58),ie=.098*(1-T*.52),R=.024-T*.012}for(let T=0;T<=le;T++){let te=T/le*c,$=Math.cos(te),xe=Math.sin(te),Z=$*de,Ie=he,Ne=R+xe*ie;O(Z,Ie,Ne,1,j,te/c,Z>=0?1:-1,Z*2.4,j)}}let q=le+1;for(let H=0;H<oe;H++)for(let j=0;j<le;j++){let he=M+H*q+j,de=he+1,ie=M+(H+1)*q+j,R=ie+1;L.push(he,ie,de,de,ie,R)}let se=18,X=10;for(let H of[-1,1]){let j=S.length/3,he=H*.21,de=.21,ie=-.02;for(let T=0;T<=se;T++){let te=T/se,$=he+H*.48*te,xe=de-.26*Math.pow(te,1.25),Z=ie-.025*te,Ie=.2*(1-.46*te)*(.32+.68*Math.sqrt(te)),Ne=.026*(1-.65*te);for(let ee=0;ee<=X*2;ee++){let Ee=ee/(X*2),Ue=Ee<=.5,Ve=Ue?Ee*2:(1-Ee)*2,we=-Ve*Ie*.96,Qe=-H*Ve*Ie*.18,ct=(Ue?1:-1)*Ne*Math.sin(Ve*Math.PI),vt=$+Qe,xt=xe+we,tt=Z+ct;O(vt,xt,tt,2,te,Ve,H,te,Ve)}}let R=X*2+1;for(let T=0;T<se;T++)for(let te=0;te<X*2;te++){let $=j+T*R+te,xe=$+1,Z=j+(T+1)*R+te,Ie=Z+1;H>0?L.push($,Z,xe,xe,Z,Ie):L.push($,xe,Z,xe,Ie,Z)}}let pe=10,ve=8;for(let H of[-1,1]){let j=S.length/3,he=H*.16,de=-.54,ie=-.04;for(let T=0;T<=pe;T++){let te=T/pe,$=he+H*.25*te,xe=de-.3*te,Z=ie-.02*te,Ie=.17*Math.sin(te*Math.PI*.85+.15),Ne=.022*(1-.55*te);for(let ee=0;ee<=ve*2;ee++){let Ee=ee/(ve*2),Ue=Ee<=.5,Ve=Ue?Ee*2:(1-Ee)*2,we=H*(Ve-.5)*Ie*.38,Qe=-(Ve-.5)*Ie*.9,ct=(Ue?1:-1)*Ne*Math.sin(Ve*Math.PI);O($+we,xe+Qe,Z+ct,3,te,Ve,H,te,Ve)}}let R=ve*2+1;for(let T=0;T<pe;T++)for(let te=0;te<ve*2;te++){let $=j+T*R+te,xe=$+1,Z=j+(T+1)*R+te,Ie=Z+1;H>0?L.push($,Z,xe,xe,Z,Ie):L.push($,xe,Z,xe,Ie,Z)}}let fe=6,J=8,k=S.length/3;for(let H=0;H<=fe;H++){let j=H/fe,he=-.65-.16*j,de=.035*(1-j*.88),ie=-.04;for(let R=0;R<=J;R++){let T=R/J*c,te=Math.cos(T)*de,$=he,xe=ie+Math.sin(T)*de;O(te,$,xe,4,j,T/c,0,te*4,j)}}let ne=J+1;for(let H=0;H<fe;H++)for(let j=0;j<J;j++){let he=k+H*ne+j,de=he+1,ie=k+(H+1)*ne+j,R=ie+1;L.push(he,ie,de,de,ie,R)}let ce=new m.BufferGeometry;return ce.setAttribute("position",new m.Float32BufferAttribute(S,3)),ce.setAttribute("normal",new m.Float32BufferAttribute(w,3)),ce.setAttribute("aPart",new m.Float32BufferAttribute(b,4)),ce.setAttribute("aScute",new m.Float32BufferAttribute(F,2)),ce.setIndex(L),ce.computeVertexNormals(),ce}function v(m){let S=[],w=[],b=[],F=[];for(let z=0;z<42;z++){let D=z<10?0:z<24?1:2,K=(D===0?z:D===1?z-10:z-24)/(D===0?10:D===1?14:18)*c+D*.42,G=D===0?.18:D===1?.36:.54,oe=D===0?.18:D===1?.42:.68,le=D===0?.58:D===1?.52:.44,M=Math.cos(K)*G,q=Math.sin(K)*G,se=S.length/3;for(let X=0;X<=10;X++){let pe=X/10,ve=Math.pow(pe,1.25)*oe,fe=M+Math.cos(K)*ve,J=q+Math.sin(K)*ve,k=pe*le,ne=Math.exp(-Math.pow((pe-.86)/.11,2))*.022,ce=(.048*(1-pe*.55)+ne)*(1-_(pe));for(let H=0;H<6;H++){let j=H/6*c,he=Math.cos(j),de=Math.sin(j);S.push(fe+he*ce,J+de*ce,k),w.push(he,de,.35),b.push(z*.17,pe,G)}}for(let X=0;X<10;X++)for(let pe=0;pe<6;pe++){let ve=(pe+1)%6,fe=se+X*6+pe,J=se+X*6+ve,k=se+(X+1)*6+pe,ne=se+(X+1)*6+ve;F.push(fe,J,k,J,ne,k)}}function _(z){return z>.96?(z-.96)/.04:0}let E=new m.BufferGeometry;return E.setAttribute("position",new m.Float32BufferAttribute(S,3)),E.setAttribute("normal",new m.Float32BufferAttribute(w,3)),E.setAttribute("aTentacle",new m.Float32BufferAttribute(b,3)),E.setIndex(F),E}function g({THREE:m,scene:S,waterSystem:w,sound:b}){let F=[{u:.255,v:.505,scale:.74,palette:0,squish:0,phase:.4},{u:.302,v:.472,scale:.66,palette:.35,squish:0,phase:1.9},{u:.592,v:.745,scale:.8,palette:.7,squish:0,phase:3.1},{u:.642,v:.715,scale:.68,palette:.15,squish:0,phase:4.5},{u:.792,v:.562,scale:.84,palette:.85,squish:0,phase:2.3},{u:.455,v:.232,scale:.72,palette:.5,squish:0,phase:5.2}],L=v(m),O=new m.ShaderMaterial({uniforms:{uTime:{value:0},uWaterClarity:{value:.9},uCausticsIntensity:{value:1}},vertexShader:\`
        precision highp float;
        attribute vec3 aTentacle; // id, heightFrac, radial
        attribute vec4 aAnemoneData; // phase, squish, palette, scale
        varying vec3 vTentacle;
        varying float vPalette;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
          vTentacle = aTentacle;
          vPalette = aAnemoneData.z;
          float phase = aAnemoneData.x;
          float squish = aAnemoneData.y;
          float f = aTentacle.y;
          float tid = aTentacle.x;

          vec3 p = position;
          // Gentle current & swell sway + reactive squish when brushed
          float swayX = sin(uTime * 2.1 + phase + tid * 3.7 - f * 2.2) * 0.14 * f * f;
          float swayY = cos(uTime * 1.8 + phase * 1.3 + tid * 2.9 - f * 2.0) * 0.14 * f * f;
          p.x = p.x * (1.0 + squish * 0.22) + swayX;
          p.y = p.y * (1.0 + squish * 0.22) + swayY;
          p.z *= (1.0 - squish * 0.38);

          vec4 wp = instanceMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec3 vTentacle;
        varying float vPalette;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        void main() {
          float f = vTentacle.y;
          vec3 baseCol = mix(vec3(0.42, 0.16, 0.38), vec3(0.16, 0.46, 0.52), smoothstep(0.2, 0.8, vPalette));
          vec3 midCol = mix(vec3(0.88, 0.36, 0.64), vec3(0.28, 0.84, 0.76), vPalette);
          vec3 tipCol = mix(vec3(1.0, 0.72, 0.92), vec3(0.76, 1.0, 0.88), vPalette);

          vec3 col = mix(baseCol, midCol, smoothstep(0.0, 0.65, f));
          col = mix(col, tipCol, smoothstep(0.68, 0.98, f));

          vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
          float diff = 0.55 + 0.45 * max(0.0, dot(normalize(vNormal), lightDir));
          col *= diff;

          // Bioluminescent / translucent rim & caustic dappling
          float cWave = sin(vWorldPos.x * 3.6 + uTime * 2.2) * cos(vWorldPos.y * 3.6 - uTime * 1.9);
          float caustic = pow(max(0.0, cWave), 2.2) * uCausticsIntensity;
          col += vec3(0.55, 0.96, 1.0) * caustic * 0.28;

          float subDepth = clamp(-vWorldPos.z * 0.35, 0.0, 1.5);
          vec3 waterTint = vec3(0.06, 0.62, 0.72);
          float fog = (1.0 - exp(-subDepth * 0.25)) * (1.0 - uWaterClarity * 0.68);
          col = mix(col, waterTint, clamp(fog, 0.0, 0.65));

          gl_FragColor = vec4(col, 0.95);
        }
      \`,transparent:!0,depthTest:!0,depthWrite:!0,side:m.DoubleSide}),ae=new Float32Array(F.length*4),_=new m.InstancedBufferAttribute(ae,4).setUsage(m.DynamicDrawUsage);L.setAttribute("aAnemoneData",_);let E=new m.InstancedMesh(L,O,F.length);E.instanceMatrix.setUsage(m.DynamicDrawUsage),E.frustumCulled=!1,E.renderOrder=2,S.add(E);let z=p(m),D=new Float32Array(u*4),C=new m.InstancedBufferAttribute(D,4).setUsage(m.DynamicDrawUsage);z.setAttribute("aFishState",C);let I=new m.ShaderMaterial({uniforms:{uTime:{value:0},uWaterClarity:{value:.9},uCausticsIntensity:{value:1}},vertexShader:\`
        precision highp float;
        attribute vec4 aFishState; // phase, kind, bend, shimmer
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec4 vFishState;

        void main() {
          vLocalPos = position;
          vFishState = aFishState;
          float phase = aFishState.x;
          float kind = aFishState.y;
          float bend = aFishState.z;

          vec3 p = position;
          vec3 n = normal;
          bool isSilver = (kind < 0.5 || (kind > 3.5 && kind < 4.5));
          if (isSilver) {
            // Balanced, elegant slender willow-leaf / blade profile
            p.y *= 1.10; // Moderate 10% length extension
            p.x *= 0.52; // Compressed laterally for sleek flat profile
            p.z *= 0.80; // Flatter dorsal-ventral depth
            n.y /= 1.10;
            n.x /= 0.52;
            n.z /= 0.80;
            n = normalize(n);
          }

          // Travelling wave undulation from head (+Y) to tail (-Y)
          float aft = clamp((0.65 - p.y) / 1.75, 0.0, 1.2);
          float wave = sin(phase - aft * 4.2) * aft * aft * 0.22 + bend * aft * aft * 0.35;
          p.x += wave;

          vec4 wp = instanceMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(instanceMatrix) * n);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      \`,fragmentShader:\`
        precision highp float;
        varying vec3 vLocalPos;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec4 vFishState;

        uniform float uTime;
        uniform float uWaterClarity;
        uniform float uCausticsIntensity;

        void main() {
          vec3 p = vLocalPos;
          float kind = vFishState.y;
          vec3 n = normalize(vWorldNormal);
          if (!gl_FrontFacing) n = -n;

          vec3 col = vec3(0.8);
          float dorsal = smoothstep(-0.12, 0.16, p.z);

          bool isSilver = (kind < 0.5 || (kind > 3.5 && kind < 4.5));
          if (isSilver) {
            // KIND 0 & 4: SILVER SCHOOLING FISH (银色鱼群 / 鱼群穿境 — Genuine Metallic Liquid Silver)
            vec3 bellySilver = vec3(0.85, 0.88, 0.92);
            vec3 spineSteel = vec3(0.42, 0.49, 0.56);
            float lateralLine = exp(-pow((p.z - 0.02) / 0.05, 2.0));
            float dorsalCurve = smoothstep(-0.06, 0.20, p.z);
            float flankReflect = smoothstep(0.18, -0.05, abs(p.z - 0.01));

            // Silver metal base: contrasting steel spine with high-reflectance silver flank
            col = mix(bellySilver, spineSteel, dorsalCurve * 0.72);
            col = mix(col, vec3(0.96, 0.98, 1.0), lateralLine * 0.42 + flankReflect * 0.15);
          } else if (kind < 1.5) {
            // KIND 1: REEF FISH A — Royal Blue Tang / Gold-tail Damselfish
            vec3 cobalt = mix(vec3(0.06, 0.38, 0.88), vec3(0.04, 0.18, 0.52), dorsal);
            vec3 goldTail = vec3(1.0, 0.82, 0.16);
            float tailMask = smoothstep(-0.28, -0.68, p.y);
            float dorsalRim = smoothstep(0.16, 0.28, p.z);
            col = mix(cobalt, goldTail, clamp(tailMask + dorsalRim * 0.65, 0.0, 1.0));
          } else if (kind < 2.5) {
            // KIND 2: REEF FISH B — Tropical Butterflyfish (Sunburst Gold & Coral)
            vec3 warmGold = vec3(1.0, 0.78, 0.24);
            vec3 coralRose = vec3(0.96, 0.36, 0.42);
            float chevrons = 0.5 + 0.5 * sin(p.y * 22.0 + abs(p.z) * 14.0);
            float eyeBand = exp(-pow((p.y - 0.58) / 0.10, 2.0));
            col = mix(warmGold, coralRose, smoothstep(-0.4, 0.4, p.y) * 0.65 + chevrons * 0.22);
            col = mix(col, vec3(0.08, 0.10, 0.14), eyeBand * 0.85);
          } else if (kind < 3.5) {
            // KIND 3: REEF FISH C — Lagoon Moorish Idol / Emerald Bannerfish
            vec3 cream = vec3(0.96, 0.98, 0.92);
            vec3 turquoise = vec3(0.12, 0.82, 0.76);
            vec3 darkBand = vec3(0.08, 0.14, 0.20);
            float b1 = exp(-pow((p.y - 0.42) / 0.14, 2.0));
            float b2 = exp(-pow((p.y + 0.18) / 0.16, 2.0));
            col = mix(cream, turquoise, dorsal * 0.75);
            col = mix(col, darkBand, clamp(b1 + b2, 0.0, 0.88));
          } else {
            // KIND 5: CLOWNFISH (海葵小丑鱼 — Tangerine Orange + 3 White Bands with Black Rims)
            vec3 tangerine = mix(vec3(1.0, 0.42, 0.06), vec3(0.88, 0.28, 0.03), dorsal * 0.5);
            vec3 pureWhite = vec3(0.98, 0.99, 1.0);
            vec3 jetBlack = vec3(0.05, 0.06, 0.08);

            float d1 = abs(p.y - 0.46 + p.z * 0.12);
            float d2 = abs(p.y + 0.04 + sin(p.z * 8.0) * 0.04);
            float d3 = abs(p.y + 0.56);
            float bandDist = min(d1, min(d2, d3));

            float whiteStripe = 1.0 - smoothstep(0.055, 0.085, bandDist);
            float blackEdge = (1.0 - smoothstep(0.080, 0.118, bandDist)) * (1.0 - whiteStripe);
            float finTip = smoothstep(-0.78, -0.98, p.y) + smoothstep(0.22, 0.32, abs(p.x));

            col = tangerine;
            col = mix(col, jetBlack, clamp(blackEdge * 0.92 + finTip * 0.75, 0.0, 1.0));
            col = mix(col, pureWhite, whiteStripe);
          }

          // Eye spot near +Y nose
          float eyeDist = length(vec2(p.y - 0.68, p.z - 0.04));
          float eyeMask = (1.0 - smoothstep(0.045, 0.075, eyeDist)) * step(0.03, abs(p.x));
          col = mix(col, vec3(0.04, 0.05, 0.07), eyeMask);

          vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
          vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
          float diff = max(0.32, dot(n, lightDir));

          if (isSilver) {
            // Metallic Lighting: controlled diffuse, sharp metallic specular + Fresnel chrome rim reflection
            vec3 viewDir = normalize(vec3(0.0, 1.0, 0.15));
            vec3 specHalf = normalize(lightDir + viewDir);
            float ndh = max(0.0, dot(n, specHalf));
            float sharpSpec = pow(ndh, 38.0) * 0.95; // Crisp metallic gleam
            float broadSpec = pow(ndh, 10.0) * 0.32; // Soft metallic surface sheen
            float fresnel = pow(1.0 - max(0.0, dot(n, vec3(0.0, 1.0, 0.0))), 2.4);

            vec3 skyReflect = vec3(0.88, 0.93, 0.98);
            col = col * (0.44 + 0.45 * diff) + skyReflect * (fresnel * 0.45 + broadSpec) + vec3(1.0, 1.0, 1.0) * sharpSpec;
          } else {
            float spec = pow(max(0.0, dot(n, halfVec)), 28.0) * 0.32;
            col = col * (0.52 + 0.55 * diff) + vec3(0.92, 0.98, 1.0) * spec;
          }

          // Underwater Voronoi caustic shimmer on fish backs
          float cWave = sin(vWorldPos.x * 3.8 + uTime * 2.4) * cos(vWorldPos.y * 3.8 - uTime * 2.1);
          float caustic = pow(max(0.0, cWave), 2.4) * max(0.0, n.z) * uCausticsIntensity;
          vec3 causticTint = isSilver ? vec3(0.85, 0.95, 1.0) : vec3(0.48, 0.95, 1.0);
          col += causticTint * caustic * (isSilver ? 0.28 : 0.36);

          float subDepth = clamp(-vWorldPos.z * 0.3, 0.0, 1.5);
          vec3 waterCol = vec3(0.07, 0.68, 0.74);
          float fog = (1.0 - exp(-subDepth * 0.22)) * (1.0 - uWaterClarity * 0.68) * (isSilver ? 0.45 : 1.0);
          col = mix(col, waterCol, clamp(fog, 0.0, 0.65));

          gl_FragColor = vec4(col, 1.0);
        }
      \`,side:m.DoubleSide}),K=new m.InstancedMesh(z,I,u);K.instanceMatrix.setUsage(m.DynamicDrawUsage),K.count=0,K.frustumCulled=!1,K.renderOrder=3,S.add(K);let G=y(m),oe=\`
      attribute float fin;
      uniform float stroke, turn, clock;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying float vIsFin;

      vec3 deform(vec3 orig) {
        vec3 p = orig;
        float aft = clamp((0.55 - p.y) / 2.25, 0.0, 1.25);
        float wave = sin(stroke - aft * 3.2) * aft * aft * 0.26 - turn * aft * aft * 0.32;
        p.x += wave;
        return p;
      }

      void main() {
        vec3 p = deform(position);
        vLocalP = position;
        vIsFin = fin;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldP = wp.xyz;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    \`,le=\`
      precision highp float;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying float vIsFin;
      uniform float clock, uWaterClarity, uCausticsIntensity;

      void main() {
        vec3 p = vLocalP;
        vec3 n = normalize(vWorldN);
        if (!gl_FrontFacing) n = -n;

        // Counter-shaded reef shark bronze-grey back & pale cream belly
        vec3 belly = vec3(0.88, 0.89, 0.86);
        vec3 dorsalCol = vec3(0.34, 0.39, 0.40);
        vec3 c = mix(belly, dorsalCol, smoothstep(-0.10, 0.14, p.z));

        // Characteristic white sub-terminal band + jet-black fin tips!
        float dorsalTip = smoothstep(0.46, 0.58, p.z) * step(0.5, vIsFin);
        float pectoralTip = smoothstep(0.68, 0.84, abs(p.x)) * step(0.5, vIsFin);
        float tailTip = smoothstep(0.32, 0.44, abs(p.z)) * step(1.5, vIsFin);
        float blackTipMask = clamp(dorsalTip + pectoralTip + tailTip, 0.0, 1.0);
        float whiteHalo = smoothstep(0.34, 0.46, p.z) * (1.0 - dorsalTip) * step(0.5, vIsFin) * (1.0 - step(1.5, vIsFin));

        c = mix(c, vec3(0.95, 0.96, 0.94), whiteHalo * 0.55);
        c = mix(c, vec3(0.04, 0.05, 0.06), blackTipMask * 0.95);

        // Eyes & 5 gill slits
        float eye = length(vec2((abs(p.x) - 0.14) * 1.4, p.y - 1.08));
        float eyeMask = (1.0 - smoothstep(0.018, 0.032, eye)) * step(-0.02, p.z) * (1.0 - step(0.5, vIsFin));
        c = mix(c, vec3(0.02, 0.03, 0.04), eyeMask);

        float gillZone = smoothstep(0.45, 0.52, p.y) * smoothstep(0.76, 0.68, p.y) * smoothstep(0.05, 0.22, abs(p.x));
        float gills = step(0.68, sin(p.y * 85.0)) * gillZone * (1.0 - step(0.5, vIsFin));
        c *= 1.0 - gills * 0.38;

        vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
        float diff = max(0.32, dot(n, lightDir));
        vec3 result = c * (0.54 + 0.50 * diff);

        float cWave = sin(vWorldP.x * 3.2 + clock * 2.2) * cos(vWorldP.y * 3.2 - clock * 1.9);
        float caustic = pow(max(0.0, cWave), 2.4) * max(0.0, n.z) * uCausticsIntensity;
        result += vec3(0.48, 0.95, 1.0) * caustic * 0.30;

        float subDepth = clamp(-vWorldP.z * 0.28, 0.0, 1.5);
        vec3 waterTint = vec3(0.06, 0.62, 0.70);
        float fog = (1.0 - exp(-subDepth * 0.22)) * (1.0 - uWaterClarity * 0.68);
        result = mix(result, waterTint, clamp(fog, 0.0, 0.65));

        gl_FragColor = vec4(result, 1.0);
      }
    \`,M=Array.from({length:d},()=>{let Q=new m.ShaderMaterial({side:m.DoubleSide,uniforms:{stroke:{value:0},turn:{value:0},clock:{value:0},uWaterClarity:{value:.9},uCausticsIntensity:{value:1}},vertexShader:oe,fragmentShader:le}),Le=new m.Mesh(G,Q);return Le.visible=!1,Le.frustumCulled=!1,Le.renderOrder=3,S.add(Le),{mesh:Le,mat:Q}}),q=x(m),se=\`
      attribute vec4 aPart;
      attribute vec2 aScute;
      uniform float stroke, turn, clock;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying vec4 vPart;
      varying vec2 vScute;

      vec3 deformTurtle(vec3 orig, vec4 part) {
        float partId = part.x;
        float span = part.y;
        float chord = part.z;
        float side = part.w;
        vec3 pos = orig;

        if (partId < 0.8) {
          float heave = sin(stroke) * 0.022;
          float pitchWobble = cos(stroke) * 0.032;
          pos.z += heave;
          pos.z += pos.y * pitchWobble;
          pos.y -= pos.z * pitchWobble;
        } else if (partId < 1.5) {
          float lookTurn = turn * 0.35;
          float headBob = sin(stroke - 0.5) * 0.038;
          pos.x += (pos.y - 0.24) * lookTurn;
          pos.z += headBob;
        } else if (partId < 2.5) {
          float flipperSpan = span;
          float spanPow = pow(clamp(flipperSpan, 0.0, 1.0), 1.22);
          float turnFactor = 1.0 + side * turn * 0.45;
          float flapPhase = stroke - spanPow * 0.72;
          float flapAngle = sin(flapPhase) * 0.45 * turnFactor;
          float featherAngle = cos(flapPhase) * 0.24;

          float shoulderX = side * 0.21;
          float shoulderY = 0.21;
          float shoulderZ = -0.02;

          vec3 rel = pos - vec3(shoulderX, shoulderY, shoulderZ);

          float cosF = cos(flapAngle * side);
          float sinF = sin(flapAngle * side);
          float rx = rel.x * cosF - rel.z * sinF;
          float rz = rel.x * sinF + rel.z * cosF;

          float cosP = cos(featherAngle * spanPow);
          float sinP = sin(featherAngle * spanPow);
          float ry = rel.y * cosP - rz * sinP;
          rz = rel.y * sinP + rz * cosP;

          pos = vec3(shoulderX, shoulderY, shoulderZ) + vec3(rx, ry, rz);
        } else if (partId < 3.5) {
          float steer = turn * 0.42 + sin(stroke * 0.8 + 1.2) * 0.14;
          float hipX = side * 0.16;
          float hipY = -0.54;
          float hipZ = -0.04;
          vec3 rel = pos - vec3(hipX, hipY, hipZ);

          float cosS = cos(steer * side);
          float sinS = sin(steer * side);
          float rx = rel.x * cosS - rel.z * sinS;
          float rz = rel.x * sinS + rel.z * cosS;
          pos = vec3(hipX, hipY, hipZ) + vec3(rx, rel.y, rz);
        } else {
          float tailWag = -turn * 0.32 + sin(stroke) * 0.05;
          pos.x += tailWag * (orig.y - (-0.65));
        }

        return pos;
      }

      void main() {
        vec3 p = deformTurtle(position, aPart);
        vLocalP = position;
        vPart = aPart;
        vScute = aScute;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldP = wp.xyz;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    \`,X=\`
      precision highp float;
      varying vec3 vLocalP, vWorldN, vWorldP;
      varying vec4 vPart;
      varying vec2 vScute;
      uniform float clock, uWaterClarity, uCausticsIntensity;

      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      vec2 voronoi2D(vec2 p) {
        vec2 n = floor(p);
        vec2 f = fract(p);
        float md = 8.0;
        float md2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hash21(n + g), hash21(n + g + vec2(17.1, 31.7)));
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md2 = md;
              md = d;
            } else if (d < md2) {
              md2 = d;
            }
          }
        }
        return vec2(sqrt(md), sqrt(md2));
      }

      void main() {
        vec3 p = vLocalP;
        vec3 n = normalize(vWorldN);
        if (!gl_FrontFacing) n = -n;

        float partId = vPart.x;
        float span = vPart.y;
        float chord = vPart.z;
        float side = vPart.w;

        vec3 baseColor = vec3(0.18, 0.22, 0.12);
        float roughness = 0.35;

        // 1. CARAPACE (Back Shell) - Realistic Green Sea Turtle (Chelonia mydas) from 3-view reference
        if (partId < 0.25) {
          roughness = 0.26; // wet, organic keratin surface sheen
          float u = vScute.x;
          float v = vScute.y;

          // Colors accurately sampled from the realistic 3-view photograph:
          vec3 darkEspresso  = vec3(0.23, 0.18, 0.12); // deep rich chocolate/espresso ground
          vec3 honeyAmber    = vec3(0.63, 0.46, 0.24); // warm honey amber plate body
          vec3 sunCaramel    = vec3(0.82, 0.63, 0.33); // radiant caramel gold rays & marbling
          vec3 sutureIvory   = vec3(0.87, 0.80, 0.59); // fine pale ivory-gold suture lines
          vec3 sutureShadow  = vec3(0.14, 0.10, 0.06); // deep groove shadow flanking sutures
          vec3 marginalGold  = vec3(0.88, 0.78, 0.48); // outer marginal rim edge

          // Normalized longitudinal axis: 0.0 at tail, 1.0 at neck
          float vNorm = clamp((v + 1.0) * 0.5, 0.0, 1.0);
          float midDist = abs(u);

          // A. VERTEBRAL SCUTES (5 Hexagonal shield plates along the spine)
          float vertCoord = vNorm * 5.0 - 0.08;
          float vertIdx = clamp(floor(vertCoord), 0.0, 4.0);
          float vertFrac = fract(vertCoord);
          
          float hexBulge = sin(vertFrac * 3.14159265);
          float vertWidth = 0.16 + 0.070 * hexBulge - 0.035 * (1.0 - vNorm);
          float isVertebral = 1.0 - smoothstep(vertWidth - 0.03, vertWidth + 0.03, midDist);

          // Transverse seam: forward-pointing chevron arch
          float vertChevron = 0.042 * (1.0 - midDist / max(0.01, vertWidth));
          float vertSeamDist = abs(vertFrac - vertChevron);
          vertSeamDist = min(vertSeamDist, 1.0 - vertSeamDist);
          float vertSeam = smoothstep(0.038, 0.008, vertSeamDist);

          // B. COSTAL SCUTES (4 pairs of lateral plates sweeping backward in smooth hydrodynamic arcs)
          float dOut = max(0.0, midDist - 0.12);
          float backwardSweep = (0.28 + 0.16 * (1.0 - vNorm)) * pow(dOut, 1.30);
          float costalV = vNorm + backwardSweep;
          float costalCoord = costalV * 4.0 - 0.05;
          float costalIdx = clamp(floor(costalCoord), 0.0, 3.0);
          float costalFrac = fract(costalCoord);
          float costalSeamDist = abs(costalFrac - 0.5);
          float costalSeam = smoothstep(0.038, 0.008, costalSeamDist);

          // C. SUTURE GROOVES
          float lateralSeamDist = abs(midDist - vertWidth);
          float lateralSeam = smoothstep(0.038, 0.008, lateralSeamDist);

          float activeTransverseSeam = mix(costalSeam, vertSeam, isVertebral);
          float sutureMask = clamp(activeTransverseSeam + lateralSeam, 0.0, 1.0);
          float minSeamDist = min(lateralSeamDist, mix(costalSeamDist, vertSeamDist, isVertebral));

          // D. NATURAL RADIATING MARBLING & GROWTH RINGS (Symmetrical, organic tiger rays)
          float scuteSide = u >= 0.0 ? 1.0 : -1.0;
          vec2 costalNucleus = vec2(scuteSide * (0.18 + 0.05 * costalIdx), ((costalIdx + 0.75) / 4.0) * 2.0 - 1.0);
          vec2 vertNucleus = vec2(0.0, ((vertIdx + 0.5) / 5.0) * 2.0 - 1.0);

          float rayAngle = 0.0;
          float scuteDist = 0.0;
          if (isVertebral > 0.5) {
            vec2 rVec = vec2(midDist, v - vertNucleus.y);
            rayAngle = atan(rVec.y, max(0.001, rVec.x));
            scuteDist = length(rVec);
          } else {
            vec2 rVec = vec2((u - costalNucleus.x) * scuteSide, v - costalNucleus.y);
            rayAngle = atan(rVec.y - 0.16 * max(0.0, rVec.x), max(0.001, rVec.x));
            scuteDist = length(rVec);
          }

          // Radiating fan rays
          float fanRays = cos(rayAngle * 4.0) * 0.5 + 0.5;
          fanRays = smoothstep(0.15, 0.85, fanRays);

          // Organic concentric growth rings (keratin ridges)
          float growthRings = sin(scuteDist * 42.0) * 0.5 + 0.5;

          // Radial fade from deep nucleus out toward plate borders
          float radialFade = smoothstep(0.03, 0.40, scuteDist);
          vec3 plateColor = mix(darkEspresso, honeyAmber, radialFade * 0.58);
          plateColor = mix(plateColor, sunCaramel, fanRays * radialFade * 0.70 + growthRings * 0.08);

          // Plate perimeter halo:
          float scuteMargin = smoothstep(0.11, 0.02, minSeamDist);
          plateColor = mix(plateColor, sunCaramel * 1.05, scuteMargin * 0.45);

          // E. MARGINAL RIM (24 oval-rim marginal scutes with pale golden edge)
          float isMarginal = smoothstep(0.77, 0.88, span);
          float rimAngle = atan(v, u * 1.08);
          float marginalSeamDist = abs(fract(rimAngle * (24.0 / 6.2831853)) - 0.5);
          float marginalSeam = smoothstep(0.05, 0.01, marginalSeamDist);
          vec3 rimColor = mix(marginalGold, darkEspresso * 0.85, marginalSeam * 0.60);
          baseColor = mix(plateColor, rimColor, isMarginal * 0.95);

          // F. REALISTIC 3D SUTURE RELIEF (Narrow groove shadow with fine pale ivory-gold line in center)
          float sutureGroove = smoothstep(0.036, 0.008, minSeamDist);
          float sutureCore = smoothstep(0.012, 0.003, minSeamDist);
          vec3 sutureRelief = mix(sutureShadow, sutureIvory, sutureCore * 0.85);
          baseColor = mix(baseColor, sutureRelief, sutureMask * 0.95);
        }
        // 2. PLASTRON (Belly Shell) - Realistic Warm Pale Cream/Ivory
        else if (partId < 0.75) {
          roughness = 0.28;
          vec3 creamBelly = vec3(0.74, 0.75, 0.55);
          vec3 goldenSuture = vec3(0.65, 0.58, 0.38);
          float bellySuture = smoothstep(0.025, 0.0, abs(vScute.x)) * smoothstep(0.2, 0.8, span);
          float transBelly = smoothstep(0.025, 0.0, abs(fract(vScute.y * 2.5) - 0.5)) * step(0.15, span);
          baseColor = mix(creamBelly, goldenSuture, clamp(bellySuture + transBelly, 0.0, 0.45));
        }
        // 3. HEAD, BEAK, CHIN & EYES - Realistic Polygonal Mosaic Scales & Natural Eye
        else if (partId < 1.5) {
          roughness = 0.30;

          // Realistic polygonal scale tiles with pale grout channels
          vec2 vDist = voronoi2D(vec2(p.x * 24.0, (p.y - 0.22) * 22.0));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);
          vec3 scaleTile = mix(vec3(0.18, 0.14, 0.10), vec3(0.30, 0.22, 0.13), hash21(floor(vec2(p.x * 20.0, p.y * 18.0))));
          vec3 groutCol = vec3(0.74, 0.66, 0.44);
          vec3 headSkin = mix(scaleTile, groutCol, cellGrout * 0.88);

          // A. Lower Jaw & Chin: Smooth pale cream
          float isChin = smoothstep(0.02, -0.04, p.z) * smoothstep(0.30, 0.45, p.y);
          vec3 chinCream = vec3(0.78, 0.76, 0.58);
          headSkin = mix(headSkin, chinCream, isChin * 0.95);

          // B. Upper Beak Shield: Realistic horn/amber keratin
          float isBeak = smoothstep(0.52, 0.60, p.y);
          vec3 beakHorn = vec3(0.55, 0.44, 0.26);
          headSkin = mix(headSkin, beakHorn, isBeak * 0.82);

          // C. Neck wrinkles near shell
          float isNeck = smoothstep(0.34, 0.24, p.y);
          float wrinkle = sin(p.y * 50.0) * 0.5 + 0.5;
          vec3 neckSkin = mix(vec3(0.68, 0.58, 0.38), vec3(0.78, 0.76, 0.58), wrinkle * 0.5);
          headSkin = mix(headSkin, neckSkin, isNeck * 0.85);

          baseColor = headSkin;

          // D. Realistic green turtle eye (natural size, dark espresso iris, sharp specular highlight)
          float eyeDist = length(vec3((abs(p.x) - 0.105) * 1.0, (p.y - 0.46) * 1.15, (p.z - 0.022) * 1.0));
          if (eyeDist < 0.042) {
            roughness = 0.04;
            float eyeR = eyeDist / 0.042;
            vec3 eyelidCol = vec3(0.35, 0.26, 0.16);
            vec3 irisDark = vec3(0.18, 0.12, 0.07);
            vec3 pupilBlack = vec3(0.015, 0.015, 0.02);
            vec3 eyeCol = eyeR < 0.55 ? pupilBlack : (eyeR < 0.85 ? mix(irisDark, eyelidCol, smoothstep(0.70, 0.85, eyeR)) : eyelidCol);

            // Natural crisp specular catchlight
            vec2 eyeLocal = vec2(abs(p.x) - 0.105, p.z - 0.022);
            float sparkle = smoothstep(0.012, 0.004, length(eyeLocal - vec2(0.008, 0.010)));
            eyeCol = mix(eyeCol, vec3(1.0, 1.0, 1.0), sparkle);
            baseColor = eyeCol;
          }
        }
        // 4. FRONT WING FLIPPERS (Pectorals) - Realistic Polygonal Scales with Pale Channels
        else if (partId < 2.5) {
          roughness = 0.30;
          float scaleDensity = mix(12.0, 22.0, chord);
          vec2 vDist = voronoi2D(vec2(span * scaleDensity, chord * scaleDensity * 0.88));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);

          vec3 scaleTile = mix(vec3(0.15, 0.14, 0.10), vec3(0.24, 0.18, 0.11), span);
          vec3 groutCol = mix(vec3(0.72, 0.62, 0.38), vec3(0.68, 0.58, 0.35), chord);
          vec3 dorsalSkin = mix(scaleTile, groutCol, cellGrout * 0.85);

          // Pale leading edge border
          float isLeading = smoothstep(0.15, 0.0, chord);
          vec3 leadingTrim = vec3(0.76, 0.68, 0.44);
          dorsalSkin = mix(dorsalSkin, leadingTrim, isLeading * 0.65);

          float isDorsal = step(0.0, n.z);
          vec3 ventralSkin = vec3(0.76, 0.76, 0.58);
          baseColor = mix(ventralSkin, dorsalSkin, isDorsal);
        }
        // 5. REAR FLIPPERS & TAIL - Realistic Matching Scales
        else {
          roughness = 0.32;
          vec2 vDist = voronoi2D(vec2(span * 14.0, chord * 12.0));
          float cellGrout = smoothstep(0.10, 0.02, vDist.y - vDist.x);
          float isDorsal = step(0.0, n.z);
          vec3 scaleTile = vec3(0.16, 0.14, 0.10);
          vec3 groutCol = vec3(0.72, 0.62, 0.38);
          vec3 dorsalSkin = mix(scaleTile, groutCol, cellGrout * 0.82);
          vec3 ventralSkin = vec3(0.76, 0.76, 0.58);
          baseColor = mix(ventralSkin, dorsalSkin, isDorsal);
        }

        // Sunlight illumination & Soft wet sheen (zero sparkling chatter)
        vec3 lightDir = normalize(vec3(0.32, 0.35, 0.88));
        float diff = max(0.0, dot(n, lightDir));
        vec3 viewDir = normalize(vec3(0.0, -0.2, 1.0));
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(0.0, dot(n, halfDir)), mix(14.0, 4.0, roughness)) * (1.0 - roughness);

        // High ambient floor (0.76) ensures turtles retain uniform, vibrant golden colors regardless of swimming heading
        vec3 result = baseColor * (0.76 + 0.26 * diff) + vec3(0.95, 0.95, 0.90) * spec * 0.24;

        // Gentle flowing tropical water caustics (soft & calm, no harsh flickering)
        float cWave = sin(vWorldP.x * 2.8 + clock * 1.5) * cos(vWorldP.y * 2.8 - clock * 1.2);
        float caustic = pow(max(0.0, cWave), 1.8) * max(0.0, n.z) * uCausticsIntensity;
        result += vec3(0.40, 0.90, 1.0) * caustic * 0.16;

        // Tropical turquoise water clarity & Depth fog (carapace protected from muddy cyan tinting)
        float subDepth = clamp(-vWorldP.z * 0.28, 0.0, 1.5);
        vec3 waterTint = vec3(0.06, 0.62, 0.70);
        float rawFog = (1.0 - exp(-subDepth * 0.20)) * (1.0 - uWaterClarity * 0.68);
        float fog = partId < 0.25 ? rawFog * 0.35 : rawFog;
        result = mix(result, waterTint, clamp(fog, 0.0, 0.35));

        gl_FragColor = vec4(result, 1.0);
      }
    \`,pe=Array.from({length:f},()=>{let Q=new m.ShaderMaterial({side:m.DoubleSide,uniforms:{stroke:{value:0},turn:{value:0},clock:{value:0},uWaterClarity:{value:.9},uCausticsIntensity:{value:1}},vertexShader:se,fragmentShader:X}),Le=new m.Mesh(q,Q);return Le.visible=!1,Le.frustumCulled=!1,Le.renderOrder=3,S.add(Le),{mesh:Le,mat:Q}}),ve=[{u:.44,v:.56,vx:.025,vy:.015},{u:.68,v:.42,vx:-.02,vy:.022},{u:.54,v:.28,vx:.018,vy:-.018}],fe=[],J=[],k=[],ne=null;function ce(Q=.55){for(let Le=0;Le<30;Le++){let Ge=.16+Math.random()*.76,qe=.12+Math.random()*.78;if(w.getUvBathymetry(Ge,qe)>Q)return{u:Ge,v:qe}}return{u:.58,v:.46}}function H(Q,Le={}){let Ge,qe=Math.floor(Math.random()*F.length);if(Le.u!==void 0&&Le.v!==void 0)Ge={u:Le.u,v:Le.v};else if(Q==="clown"){let Be=F[qe];Ge={u:Be.u+(Math.random()-.5)*.04,v:Be.v+(Math.random()-.5)*.04}}else if(Q==="silver"){let Be=ve[Math.floor(Math.random()*ve.length)];Ge={u:r(Be.u+(Math.random()-.5)*.14,.12,.92),v:r(Be.v+(Math.random()-.5)*.14,.1,.9)}}else Ge=ce(.5);let Me=Le.heading!==void 0?Le.heading:Math.random()*c,Re=Q==="silver"?0:Q==="clown"?5:1+Math.floor(Math.random()*3);return{group:Q,kind:Re,u:Ge.u,v:Ge.v,z:Le.z!==void 0?Le.z:Q==="clown"?-1.15:Q==="reef"?-.95:-.68,vx:Math.sin(Me)*.06,vy:Math.cos(Me)*.06,vz:Le.vz||0,heading:Me,pitch:0,roll:0,bend:0,phase:Math.random()*c,seed:Math.random()*c,size:(Q==="silver"?.28:Q==="clown"?.32:.35)*(.9+Math.random()*.22),schoolId:Math.floor(Math.random()*ve.length),homeIndex:qe,excited:Le.excited||0,airborne:!!Le.airborne}}function j(Q={}){let Le=Q.u!==void 0&&Q.v!==void 0?{u:Q.u,v:Q.v}:ce(.85),Ge=Q.heading!==void 0?Q.heading:Math.random()*c;return{u:Le.u,v:Le.v,z:Q.z!==void 0?Q.z:-.75,vz:Q.vz||0,heading:Ge,targetHeading:Ge,speed:1.55,baseSpeed:1.55,stroke:Math.random()*c,turn:0,roll:0,pitch:0,scale:.78+Math.random()*.12,seed:Math.random()*c,excited:0,wakeTimer:0,airborne:!!Q.airborne}}function he(Q={}){let Le=Q.u!==void 0&&Q.v!==void 0?{u:Q.u,v:Q.v}:ce(.65),Ge=Q.heading!==void 0?Q.heading:Math.random()*c;return{u:Le.u,v:Le.v,z:Q.z!==void 0?Q.z:-.62,vz:Q.vz||0,heading:Ge,targetHeading:Ge,speed:.72,baseSpeed:.72,stroke:Math.random()*c,turn:0,roll:0,pitch:0,scale:1.48+Math.random()*.18,seed:Math.random()*c,excited:0,glideTimer:1.5+Math.random()*2,isGliding:!1,diveTimer:12+Math.random()*20,targetDepth:-.62,wakeTimer:0,airborne:!!Q.airborne,offscreenTimer:0}}function de(Q){let Le={silver:Math.round(r(Q.silverCount??72,0,160)),reef:Math.round(r(Q.reefCount??12,0,36)),clown:Math.round(r(Q.clownCount??6,0,18))};for(let Me of["silver","reef","clown"]){let Re=fe.filter(Be=>Be.group===Me).length;for(;Re<Le[Me]&&fe.length<l;)fe.push(H(Me)),Re++;for(;Re>Le[Me];){let Be=fe.findLastIndex(Ze=>Ze.group===Me);if(Be===-1)break;fe.splice(Be,1),Re--}}let Ge=Math.round(r(Q.sharkCount??2,0,d));for(;J.length<Ge;)J.push(j());for(;J.length>Ge;)J.pop();let qe=Math.round(r(Q.turtleCount??2,0,f));for(;k.length<qe;)k.push(he());for(;k.length>qe;)k.pop()}function ie(Q,Le,Ge,qe,Me,Re){let Be=w.getAspect();if(Q==="silver"){if((Re.silverCount??72)>=160)return!1;Re.silverCount=Math.min(160,(Re.silverCount??72)+12);for(let Ze=0;Ze<12&&fe.length<l;Ze++){let $e=Ze*2.39996,Fe=Math.sqrt(Ze/12)*.045,st=r(qe+Math.cos($e)*Fe/Be,.08,.92),ft=r(Me+Math.sin($e)*Fe,.08,.92),ht=.88+Ze*.024,gt=H("silver",{u:Le+(Math.random()-.5)*.03,v:Ge,z:2.2,airborne:!0,excited:2});gt.flight={elapsed:0,duration:ht,startU:gt.u,startV:gt.v,endU:st,endV:ft,splash:Ze===0||Ze===5||Ze===11},gt.heading=Math.atan2((st-gt.u)*Be,ft-gt.v),gt.pitch=.55,fe.push(gt)}return!0}if(Q==="reef"||Q==="clown"){let Ze=Q==="reef"?"reefCount":"clownCount",$e=Q==="reef"?36:18;if((Re[Ze]??(Q==="reef"?12:6))>=$e)return!1;Re[Ze]=Math.min($e,(Re[Ze]??(Q==="reef"?12:6))+1);let Fe=.92,st=H(Q,{u:Le,v:Ge,z:2.3,airborne:!0,excited:2.4});return st.flight={elapsed:0,duration:Fe,startU:Le,startV:Ge,endU:qe,endV:Me,splash:!0},st.heading=Math.atan2((qe-Le)*Be,Me-Ge),st.pitch=.55,fe.push(st),!0}if(Q==="shark"){J.length>=d&&J.shift(),Re.sharkCount=Math.min(d,(Re.sharkCount??2)+1);let Ze=1.05,$e=j({u:Le,v:Ge,z:2.5,airborne:!0,excited:2.5});return $e.flight={elapsed:0,duration:Ze,startU:Le,startV:Ge,endU:qe,endV:Me,splash:!0},$e.heading=Math.atan2((qe-Le)*Be,Me-Ge),$e.pitch=.5,J.push($e),!0}if(Q==="turtle"){k.length>=f&&k.shift(),Re.turtleCount=Math.min(f,(Re.turtleCount??2)+1);let Ze=1.05,$e=he({u:Le,v:Ge,z:2.4,airborne:!0,excited:2.5});return $e.flight={elapsed:0,duration:Ze,startU:Le,startV:Ge,endU:qe,endV:Me,splash:!0},$e.heading=Math.atan2((qe-Le)*Be,Me-Ge),$e.pitch=.45,k.push($e),!0}return!1}function R(Q,Le,Ge,qe,Me={}){typeof Me=="boolean"&&(Me={airborne:Me});let Re=Me.startU!==void 0?Me.startU:Le,Be=Me.startV!==void 0?Me.startV:.06;return ie(Q,Re,Be,Le,Ge,qe)}function T(Q){for(;Q>Math.PI;)Q-=Math.PI*2;for(;Q<-Math.PI;)Q+=Math.PI*2;return Q}function te(Q,Le){let Ge=Q,qe=(1-Le)*1.35;return Math.hypot(Ge,qe)-.34}function $(Q,Le=.2,Ge=1.777){if(!Q||Q.length<2)return Q||[];let qe=[Q[0]],Me=0,Re=Q[0];for(let Be=1;Be<Q.length;Be++){let Ze=Q[Be],$e=Math.hypot((Ze.u-Re.u)*Ge,Ze.v-Re.v);if(!($e<1e-4)){for(;Me+$e>=Le;){let st=(Le-Me)/$e,ft=Re.u+(Ze.u-Re.u)*st,ht=Re.v+(Ze.v-Re.v)*st,gt={u:ft,v:ht};qe.push(gt),Re=gt,$e=Math.hypot((Ze.u-Re.u)*Ge,Ze.v-Re.v),Me=0}Me+=$e,Re=Ze}}return Me>.06&&qe.push(Q[Q.length-1]),qe}function xe(Q){let Le=Math.random(),Ge=Le<.5?2:Le<.85?3:4,qe=[];for(let A=0;A<Ge-1;A++)qe.push((A+1)/Ge+(Math.random()-.5)*.12);qe.sort((A,We)=>A-We);let Me=Math.random(),Re=Me<.65?"grand":Me<.9?"medium":"small",Be=Math.floor(Math.random()*5),Ze=[],$e={u:.6,v:.5,heading:0},Fe=.64+(Math.random()-.5)*.03,st=.5+(Math.random()-.5)*.03,ft=.275+Math.random()*.015,ht=.385+Math.random()*.015;if(Be===0){let A=.45+Math.random()*.08;Ze=[{u:A,v:1.55},{u:A,v:1.28},{u:A,v:1.04},{u:A,v:.82}],$e={u:A,v:.82,heading:Math.PI}}else if(Be===1){let A=.42+Math.random()*.08;Ze=[{u:A,v:-.55},{u:A,v:-.28},{u:A,v:-.04},{u:A,v:.18}],$e={u:A,v:.18,heading:0}}else if(Be===2){let A=.5+(Math.random()-.5)*.25;Ze=[{u:1.55,v:A},{u:1.28,v:A},{u:1.04,v:A},{u:.9,v:A}],$e={u:.9,v:A,heading:-Math.PI*.5}}else if(Be===3){let A=.72+Math.random()*.14;Ze=[{u:A,v:1.55},{u:A,v:1.28},{u:A,v:1.04},{u:A,v:.86}],$e={u:A,v:.86,heading:Math.PI}}else{let A=.7+Math.random()*.14;Ze=[{u:A,v:-.55},{u:A,v:-.28},{u:A,v:-.04},{u:A,v:.16}],$e={u:A,v:.16,heading:0}}function gt(A,We,Xe){let De=Math.max(2,Math.round(Xe/.2)),U=Xe/De,P=Math.sin(We.heading)*U/Q,at=Math.cos(We.heading)*U;for(let ot=1;ot<=De;ot++)We.u+=P,We.v+=at,A.push({u:We.u,v:We.v})}function N(A,We,Xe,De,U){let P=We.heading+U*Math.PI*.5,at=We.u+Math.sin(P)*Xe/Q,ot=We.v+Math.cos(P)*Xe,it=Math.atan2((We.u-at)*Q,We.v-ot),pt=Xe*De,me=Math.max(2,Math.round(pt/.18));for(let ue=1;ue<=me;ue++){let Ae=ue/me,Ce=it+U*De*Ae,B=at+Math.sin(Ce)*Xe/Q,W=ot+Math.cos(Ce)*Xe;A.push({u:B,v:W}),We.u=B,We.v=W,We.heading=Math.atan2(Math.sin(Ce+U*Math.PI*.5),Math.cos(Ce+U*Math.PI*.5))}}function Pe(A,We){return!(A<.35||A>.96||We<.08||We>.92||te(A,We)<.05)}function be(A,We,Xe,De,U,P,at,ot){let it=Math.atan2((We.v-De)/P,(We.u-Xe)/U),pt=-U*Math.sin(it)*ot,me=P*Math.cos(it)*ot,ue=Math.atan2(pt*Q,me),Ae=T(ue-We.heading);if(Math.abs(Ae)>.08){let W=Ae>=0?1:-1;N(A,We,.16,Math.abs(Ae),W),it=Math.atan2((We.v-De)/P,(We.u-Xe)/U)}let Ce=Math.max(16,Math.round(at*Math.max(U*Q,P)/.18));for(let W=1;W<=Ce;W++){let V=W/Ce,re=it+ot*at*V,ye=Xe+U*Math.cos(re),Se=De+P*Math.sin(re);if(ye<.42&&Se>.5){let Oe=te(ye,Se);if(Oe<.07){let _e=.07-Oe;ye+=_e*1.3,Se-=_e*.8}}A.push({u:ye,v:Se}),We.u=ye,We.v=Se}let B=A.length;if(B>=2){let W=A[B-2],V=A[B-1];We.heading=Math.atan2((V.u-W.u)*Q,V.v-W.v)}}function Te(A,We,Xe,De){let U=[];if(Xe==="grand_loop"){let it=Math.PI*1.6+Math.random()*Math.PI*.5;U.push({type:"ellipse",cu:Fe,cv:st,ru:ft,rv:ht,sweep:it,cw:De})}else if(Xe==="left_wing_loop")U.push({type:"ellipse",cu:.48,cv:.5,ru:.13,rv:.32,sweep:Math.PI*1.7+Math.random()*.4,cw:De});else if(Xe==="medium_loop"){let it=We.v>.5;U.push({type:"ellipse",cu:.62+(Math.random()-.5)*.05,cv:it?.65:.35,ru:.22+Math.random()*.03,rv:.26+Math.random()*.03,sweep:Math.PI*1.5+Math.random()*.6,cw:De})}else Xe==="jewel_swirl"?U.push({type:"arc",radius:.12+Math.random()*.03,sweep:Math.PI*1.7+Math.random()*.5,cw:De},{type:"arc",radius:.12+Math.random()*.03,sweep:Math.PI*1.7+Math.random()*.5,cw:-De}):Xe==="edge_cruise"?U.push({type:"line",length:.45+Math.random()*.35},{type:"arc",radius:.18+Math.random()*.05,sweep:Math.PI*.5,cw:De},{type:"arc",radius:.18+Math.random()*.05,sweep:Math.PI*.5,cw:-De}):U.push({type:"line",length:.35+Math.random()*.25},{type:"arc",radius:.18,sweep:Math.PI*.65,cw:De},{type:"arc",radius:.18,sweep:Math.PI*.65,cw:-De});U.push({type:"arc",radius:.15,sweep:Math.PI*.5,cw:De},{type:"arc",radius:.15,sweep:Math.PI*.5,cw:-De},{type:"arc",radius:.12,sweep:Math.PI*.75,cw:1},{type:"arc",radius:.12,sweep:Math.PI*.75,cw:-1});for(let it of U){let pt={...We},me=[];it.type==="ellipse"?be(me,pt,it.cu,it.cv,it.ru,it.rv,it.sweep,it.cw):it.type==="line"?gt(me,pt,it.length):N(me,pt,it.radius,it.sweep,it.cw);let ue=!0;for(let Ae of me)if(!Pe(Ae.u,Ae.v)){ue=!1;break}if(ue&&me.length>0){for(let Ae of me)A.push(Ae);return We.u=pt.u,We.v=pt.v,We.heading=pt.heading,!0}}let P=Math.atan2((.64-We.u)*Q,.5-We.v),at=T(P-We.heading),ot=at>=0?1:-1;return N(A,We,.14,Math.min(Math.PI*.75,Math.abs(at)),ot),!0}let He=[];for(let A=0;A<Ge;A++){let We=A%2===0?1:-1,Xe=Ze.map(pt=>({u:pt.u,v:pt.v})),De={...$e};for(A===0?(Te(Xe,De,"grand_loop",1),Te(Xe,De,"edge_cruise",1)):A===1?Math.random()<.5?(Te(Xe,De,"left_wing_loop",-1),Te(Xe,De,"medium_loop",1)):(Te(Xe,De,"grand_loop",-1),Te(Xe,De,"jewel_swirl",1)):A===2?(Te(Xe,De,"left_wing_loop",1),Te(Xe,De,"traverse",-1),Te(Xe,De,"jewel_swirl",1)):(Te(Xe,De,"medium_loop",We),Te(Xe,De,"edge_cruise",-We));Xe.length<38;)Te(Xe,De,Math.random()<.5?"edge_cruise":"jewel_swirl",We);let U;De.u>=.65&&De.v>.55&&Math.cos(De.heading)>0?U=0:De.v<.45&&Math.cos(De.heading)<0?U=Math.PI:U=Math.PI*.5;let P=T(U-De.heading);if(Math.abs(P)>.15){let pt=P>=0?1:-1;N(Xe,De,.16,Math.abs(P),pt)}gt(Xe,De,.75);let at=De.u+Math.sin(De.heading)*.28/Q,ot=De.v+Math.cos(De.heading)*.28;Xe.push({u:at,v:ot});let it=$(Xe,.2,Q);He.push({branchId:A,cw:We,exit:it[it.length-1],waypoints:it})}let rt="浅海大洋全域环游";return Re==="grand"?rt="全域大环游 · 鱼群环绕大半个海域多路分流巡弋":Re==="medium"?rt="半域中环游 · 鱼群半区海域开阔巡回":rt="花式小环游 · 鱼群珊瑚礁盘紧凑旋流穿梭",{branchCount:Ge,splitCutoffs:qe,entryCorridor:Be,tourTier:Re,routeTitle:rt,branches:He}}function Z(Q,Le,Ge,qe,Me){let Re=Me*Me,Be=Re*Me;return .5*(2*Le+(-Q+Ge)*Me+(2*Q-5*Le+4*Ge-qe)*Re+(-Q+3*Le-3*Ge+qe)*Be)}function Ie(Q,Le,Ge,qe,Me){let Re=Me*Me;return .5*(-Q+Ge+2*(2*Q-5*Le+4*Ge-qe)*Me+3*(-Q+3*Le-3*Ge+qe)*Re)}function Ne(Q,Le,Ge){let qe=Q.length-3,Me=r(Le,0,1)*qe,Re=Math.min(Math.floor(Me),qe-1),Be=Me-Re,Ze=Q[Re],$e=Q[Re+1],Fe=Q[Re+2],st=Q[Re+3],ft=Z(Ze.u,$e.u,Fe.u,st.u,Be),ht=Z(Ze.v,$e.v,Fe.v,st.v,Be),gt=Ie(Ze.u,$e.u,Fe.u,st.u,Be),N=Ie(Ze.v,$e.v,Fe.v,st.v,Be),Pe=Math.hypot(gt*Ge,N)||1,be=-N/(Pe*Ge),Te=gt*Ge/Pe;return{u:ft,v:ht,tu:gt,tv:N,normU:be,normV:Te}}let ee=h;function Ee(){let Q=ee,Le=w.getAspect(),{branchCount:Ge,splitCutoffs:qe,routeTitle:Me,tourTier:Re,branches:Be}=xe(Le),Ze=Ne(Be[0].waypoints,0,Le),$e=Math.atan2(Ze.tu*Le,Ze.tv),Fe=[];for(let st=0;st<Q;st++){let ft=-(st/Q)*.76-Math.random()*.02,ht=(Math.random()-.5)*2,gt=st/Q,N=0;if(Ge===1)N=0;else if(Ge===2){let be=qe[0],Te=(gt-be)/.08,He=r(.5+Te*.5,0,1);N=Math.random()<He?1:0}else if(Ge===3){let be=qe[0],Te=qe[1];gt<be-.04?N=0:gt>Te+.04?N=2:gt<be+.04?N=Math.random()<(gt-(be-.04))/.08?1:0:gt>Te-.04?N=Math.random()<(gt-(Te-.04))/.08?2:1:N=1}else{let be=0;for(;be<qe.length&&gt>qe[be]+(Math.random()-.5)*.05;)be++;N=Math.min(be,Ge-1)}let Pe=Be[N].waypoints[1];Fe.push({branchId:N,progress:ft,lane:ht,laneDrift:(Math.random()-.5)*.45,wanderPhase:Math.random()*c,wanderFreq:1.5+Math.random()*1.3,speed:.0107+Math.random()*.0022,u:Pe.u,v:Pe.v,z:-.62-st%8*.015,vx:0,vy:0,heading:$e,bend:0,roll:0,phase:Math.random()*c,size:.26+Math.random()*.05,initialized:!1})}return ne={active:!0,type:"school",age:0,duration:295,routeTitle:Me,tourTier:Re,branches:Be,branchCount:Ge,splitCutoffs:qe,members:Fe,phase:\`鱼群穿境 · \${Me}（自远海入境）\`},ne}function Ue(){ne=null}function Ve(Q,Le){let Ge=w.getAspect();for(let Me of k)if(Math.hypot((Me.u-Q)*20*Ge,(Me.v-Le)*20)<1.35)return Me.excited=2.4,Me.isGliding=!1,Me.speed=Me.baseSpeed*2.2,w.addWaterImpulseUv(Me.u,Me.v,.02,-.3),b&&b.playSplash(.38),"海龟惊起快速划水";for(let Me of J)if(Math.hypot((Me.u-Q)*20*Ge,(Me.v-Le)*20)<1.35)return Me.excited=2.6,Me.speed=Me.baseSpeed*2.35,w.addWaterImpulseUv(Me.u,Me.v,.022,-.35),b&&b.playSplash(.42),"黑鳍礁鲨加速潜掠";for(let Me of F)Math.hypot((Me.u-Q)*20*Ge,(Me.v-Le)*20)<.85&&(Me.squish=1,b&&b.playChime(2,.1));let qe=0;for(let Me of fe)if(Math.hypot((Me.u-Q)*20*Ge,(Me.v-Le)*20)<1.25){Me.excited=2.4;let Be=Math.atan2((Me.u-Q)*Ge,Me.v-Le)+(Math.random()-.5)*.5;Me.vx=Math.sin(Be)*.22,Me.vy=Math.cos(Be)*.22,qe++}return qe>0?(b&&b.playChime(4,.1),"鱼群受惊散开"):null}let we=new m.Object3D;function Qe(Q,Le,Ge,qe,Me){if(i.OceanMeteor.reentry(Q,Le,Ge)){if(Q.flight=null,Q.airborne=!1,Q.vz=0,Q.z=Math.min(Q.z,-.25),Q.baseSpeed!==void 0)Q.speed=Math.max(Q.speed,Q.baseSpeed*qe*.72);else if(Math.hypot(Q.vx*Me,Q.vy)<.001){let Re=(Q.group==="silver"?.075:Q.group==="clown"?.052:.058)*qe;Q.vx=Math.sin(Q.heading)*Re/Me,Q.vy=Math.cos(Q.heading)*Re}}}function ct(Q,Le,{settings:Ge,pointerUv:qe,isWhirlpool:Me,whirlStrength:Re,whirlpoolUv:Be,meteorAge:Ze=-1,shadowOffset:$e=0}){let Fe=w.getAspect(),st=Ge.fishSpeed??1,ft=Ge.fishSize??1,ht=Ge.schoolCohesion??1,gt=Ge.fleeRadius??1,N=Ge.rippleStrength??1,Pe=r((Ge.clarity??1.15)*.78,.15,1),be=Ge.caustics??1,Te=typeof Re=="number"?Re:Me?1:0,He=Te>.01&&Be;O.uniforms.uTime.value=Le,O.uniforms.uWaterClarity.value=Pe,O.uniforms.uCausticsIntensity.value=be;let rt=Ge.coralDensity??1,A=rt<=.05?0:F.length;E.count=A;for(let De=0;De<A;De++){let U=F[De];U.squish=Math.max(0,U.squish-Q*1.8),qe&&qe.active&&Math.hypot((U.u-qe.u)*20*Fe,(U.v-qe.v)*20)<.9&&(U.squish=Math.max(U.squish,.75));let P=w.toWorld(U.u,U.v,-1.35);we.position.set(P.x,P.y,P.z),we.rotation.set(0,0,De*1.1),we.scale.setScalar(U.scale*(.85+.15*r(rt,.2,1.6))),we.updateMatrix(),E.setMatrixAt(De,we.matrix),_.setXYZW(De,U.phase,U.squish,U.palette,U.scale)}A>0&&(E.instanceMatrix.needsUpdate=!0,_.needsUpdate=!0);for(let De=0;De<ve.length;De++){let U=ve[De];if(U.u+=U.vx*Q*st,U.v+=U.vy*Q*st,U.u<.1?(U.vx+=Q*.05,U.u<-.04&&(U.vx=Math.abs(U.vx))):U.u>.92&&(U.vx-=Q*.05,U.u>1.04&&(U.vx=-Math.abs(U.vx))),U.v<.08?(U.vy+=Q*.05,U.v<-.04&&(U.vy=Math.abs(U.vy))):U.v>.9&&(U.vy-=Q*.05,U.v>1.04&&(U.vy=-Math.abs(U.vy))),w.getShoreDistance){let P=w.getShoreDistance(U.u,U.v);if(P<.22){let ot=(.22-P)*.65;U.vx+=Q*ot*5,U.vy-=Q*ot*5}let at=w.enforceBeachBoundary(U.u,U.v,.14);at.clamped&&(U.u=at.u,U.v=at.v,U.vx=Math.abs(U.vx),U.vy=-Math.abs(U.vy))}else w.getUvBathymetry(U.u,U.v)<.7&&U.u<.35&&U.v>.55&&(U.vx=Math.abs(U.vx),U.vy=-Math.abs(U.vy))}let We=$e;for(let De=0;De<d;De++){let U=M[De],P=J[De];if(!P){U.mesh.visible=!1;continue}U.mesh.visible=!0;let at=i.OceanMeteor.isFlying(Ze,20+De);if(Qe(P,Ze,20+De,st,Fe),!at)if(P.flight){P.flight.elapsed+=Q;let Ce=r(P.flight.elapsed/P.flight.duration,0,1),B=Ce*Ce*(3-2*Ce);P.u=P.flight.startU+(P.flight.endU-P.flight.startU)*B,P.v=P.flight.startV+(P.flight.endV-P.flight.startV)*B;let W=-.72;P.z=2.5*(1-Ce)+W*Ce+Math.sin(Math.PI*Ce)*3.6;let V=(P.flight.endU-P.flight.startU)*Fe,re=P.flight.endV-P.flight.startV;P.heading=Math.atan2(V,re),P.pitch=a(.5,-.68,o(.15,.85,Ce)),P.roll=0,P.turn=0,P.stroke+=Q*10,Ce>=1&&(P.u=P.flight.endU,P.v=P.flight.endV,P.z=W,P.pitch=0,P.flight=null,P.airborne=!1,P.excited=2.5,w.spawnWaterSplashUv(P.u,P.v,1.45,b,N))}else if(P.airborne)P.vz=(P.vz||4)-11.5*Q,P.z+=P.vz*Q,P.stroke+=Q*14,P.pitch=a(P.pitch,.45,Q*4),P.roll=(P.roll||0)+Q*4.5,P.z<=-.25&&(P.airborne=!1,P.z=-.65,P.vz=0,w.spawnWaterSplashUv(P.u,P.v,1.65,b,N));else{P.excited=Math.max(0,P.excited-Q);let Ce=P.baseSpeed*st*(P.excited>0?1.85:1);P.speed=a(P.speed,Ce,Q*2.5),P.stroke+=Q*(4.2+P.speed*1.8);let B=P.u+Math.sin(P.heading)*2.8/(20*Fe),W=P.v+Math.cos(P.heading)*2.8/20,V=w.getUvBathymetry(B,W);P.u<-.01||P.u>1.01||P.v<-.01||P.v>1.01?P.offscreenTimer=(P.offscreenTimer||0)+Q:P.offscreenTimer=0;let ye=B<-.12||B>1.12||W<-.12||W>1.12||P.offscreenTimer>3.6;if((w.getShoreDistance?w.getShoreDistance(B,W):1)<.22||V<.72&&B<.38&&W>.52||ye){let ke=.52+(Math.random()-.5)*.28,nt=.46+(Math.random()-.5)*.28;P.targetHeading=Math.atan2((ke-P.u)*Fe,nt-P.v)+(Math.random()-.5)*.35}else Math.random()<Q*.45&&(P.targetHeading+=(Math.random()-.5)*.65);if(He){let ke=(Be.u-P.u)*Fe,nt=Be.v-P.v,je=Math.hypot(ke,nt),Ye=.12+.26*Te;if(je<Ye){let et=r((Ye-je)/(Ye*.45),0,1)*Te,Ke=.145+.03*((P.seed||1)%2),mt=je-Ke,wt=r(mt*2.5,-.5,1.8)*(.85+1.15*Te),yt=ke/Math.max(je,.001),Mt=nt/Math.max(je,.001);P.u+=yt/Fe*wt*Q*.55*et,P.v+=Mt*wt*Q*.55*et;let At=Math.atan2(Mt,-yt),Rt=Math.atan2(Math.sin(At-P.targetHeading),Math.cos(At-P.targetHeading));P.targetHeading+=Rt*et*Q*4.5,P.speed=a(P.speed,(1.45+.55*Te)*st,et),P.roll=a(P.roll,-.38*Te,et*Q*4.5)}}let _e=Math.atan2(Math.sin(P.targetHeading-P.heading),Math.cos(P.targetHeading-P.heading)),ge=1.65*Q*(.8+.2*st),ze=r(_e,-ge,ge);if(P.heading+=ze,P.turn=a(P.turn,r(ze/Math.max(Q,.001)*.35,-.65,.65),Q*6),P.roll=a(P.roll,-P.turn*.38,Q*5),P.u=r(P.u+Math.sin(P.heading)*P.speed*Q/(20*Fe),-.14,1.14),P.v=r(P.v+Math.cos(P.heading)*P.speed*Q/20,-.14,1.14),w.enforceBeachBoundary){let ke=w.enforceBeachBoundary(P.u,P.v,.12);ke.clamped&&(P.u=ke.u,P.v=ke.v,P.targetHeading=Math.atan2(.52-P.u,.46-P.v),P.heading=P.targetHeading)}P.z=a(P.z,-.72-.12*Math.sin(Le*.8+P.seed),Q*2.5),P.wakeTimer-=Q,P.wakeTimer<=0&&(P.wakeTimer=.22,w.addWaterImpulseUv(P.u,P.v,.016,-.1,N))}let ot=P.u,it=P.v,pt=P.z,me=P.roll,ue=P.pitch;if(at){let Ce=i.OceanMeteor.flight({u:P.u,v:P.v,z:P.z,roll:P.roll,flip:P.pitch},Ze,20+De,Fe);ot=Ce.u,it=Ce.v,pt=Ce.z,me=Ce.roll,ue=Ce.flip}let Ae=w.toWorld(ot,it,pt);if(U.mesh.position.set(Ae.x,Ae.y,Ae.z),U.mesh.rotation.set(ue,me,-P.heading,"ZYX"),U.mesh.scale.setScalar(P.scale),U.mat.uniforms.stroke.value=P.stroke,U.mat.uniforms.turn.value=P.turn,U.mat.uniforms.clock.value=Le,U.mat.uniforms.uWaterClarity.value=Pe,U.mat.uniforms.uCausticsIntensity.value=be,We<w.MAX_SHADOW_CASTERS){let{worldW:Ce,worldH:B}=w.getWorldSize(),W=(ot-.5)*Ce,V=(.5-it)*B;w.creatureShadowData[We].set(W,pt,V,P.scale*1.15),We++}}for(let De=0;De<f;De++){let U=pe[De],P=k[De];if(!P){U.mesh.visible=!1;continue}U.mesh.visible=!0;let at=i.OceanMeteor.isFlying(Ze,30+De);if(Qe(P,Ze,30+De,st,Fe),!at)if(P.flight){P.flight.elapsed+=Q;let Ce=r(P.flight.elapsed/P.flight.duration,0,1),B=Ce*Ce*(3-2*Ce);P.u=P.flight.startU+(P.flight.endU-P.flight.startU)*B,P.v=P.flight.startV+(P.flight.endV-P.flight.startV)*B;let W=-.62;P.z=2.4*(1-Ce)+W*Ce+Math.sin(Math.PI*Ce)*3.4;let V=(P.flight.endU-P.flight.startU)*Fe,re=P.flight.endV-P.flight.startV;P.heading=Math.atan2(V,re),P.pitch=a(.45,-.6,o(.15,.85,Ce)),P.roll=0,P.turn=0,P.stroke+=Q*9,Ce>=1&&(P.u=P.flight.endU,P.v=P.flight.endV,P.z=W,P.pitch=0,P.flight=null,P.airborne=!1,P.excited=2.4,w.spawnWaterSplashUv(P.u,P.v,1.35,b,N))}else if(P.airborne)P.vz=(P.vz||3.8)-11*Q,P.z+=P.vz*Q,P.stroke+=Q*12,P.pitch=a(P.pitch,.4,Q*4),P.roll=(P.roll||0)+Q*4.2,P.z<=-.22&&(P.airborne=!1,P.z=-.6,P.vz=0,w.spawnWaterSplashUv(P.u,P.v,1.5,b,N));else{if(P.excited=Math.max(0,P.excited-Q),P.excited>0)P.isGliding=!1,P.stroke+=Q*7.5;else if(P.glideTimer-=Q,P.glideTimer<=0&&(P.isGliding=!P.isGliding,P.glideTimer=P.isGliding?1.8+Math.random()*2.2:2.4+Math.random()*2.6),!P.isGliding)P.stroke+=Q*(2.8+P.speed*1.6);else{let ke=Math.round(P.stroke/c)*c+.22;P.stroke=a(P.stroke,ke,Q*2.2)}P.diveTimer-=Q,P.diveTimer<=0&&(P.targetDepth<-.32?(P.targetDepth=-.18-Math.random()*.08,P.diveTimer=4.5+Math.random()*3):(P.targetDepth=-.62-Math.random()*.24,P.diveTimer=18+Math.random()*22));let Ce=P.baseSpeed*st*(P.excited>0?2.1:P.isGliding?.72:1);P.speed=a(P.speed,Ce,Q*2);let B=P.u+Math.sin(P.heading)*2.2/(20*Fe),W=P.v+Math.cos(P.heading)*2.2/20,V=w.getUvBathymetry(B,W);P.u<-.01||P.u>1.01||P.v<-.01||P.v>1.01?P.offscreenTimer=(P.offscreenTimer||0)+Q:P.offscreenTimer=0;let ye=B<-.1||B>1.1||W<-.1||W>1.1||P.offscreenTimer>3.6;if((w.getShoreDistance?w.getShoreDistance(B,W):1)<.2||V<.65&&B<.38&&W>.52||ye){let ke=.54+(Math.random()-.5)*.26,nt=.48+(Math.random()-.5)*.26;P.targetHeading=Math.atan2((ke-P.u)*Fe,nt-P.v)+(Math.random()-.5)*.32}else Math.random()<Q*.4&&(P.targetHeading+=(Math.random()-.5)*.55);if(He){let ke=(Be.u-P.u)*Fe,nt=Be.v-P.v,je=Math.hypot(ke,nt),Ye=.12+.26*Te;if(je<Ye){let et=r((Ye-je)/(Ye*.45),0,1)*Te,Ke=.095+.03*((P.seed||1)%2),mt=je-Ke,wt=r(mt*2.5,-.5,1.6)*(.8+1.1*Te),yt=ke/Math.max(je,.001),Mt=nt/Math.max(je,.001);P.u+=yt/Fe*wt*Q*.5*et,P.v+=Mt*wt*Q*.5*et;let At=Math.atan2(Mt,-yt),Rt=Math.atan2(Math.sin(At-P.targetHeading),Math.cos(At-P.targetHeading));P.targetHeading+=Rt*et*Q*4.2,P.speed=a(P.speed,(1.1+.45*Te)*st,et),P.roll=a(P.roll,-.32*Te,et*Q*4)}}let _e=Math.atan2(Math.sin(P.targetHeading-P.heading),Math.cos(P.targetHeading-P.heading)),ge=1.35*Q*(.8+.2*st),ze=r(_e,-ge,ge);if(P.heading+=ze,P.turn=a(P.turn,r(ze/Math.max(Q,.001)*.38,-.6,.6),Q*5),P.roll=a(P.roll,-P.turn*.42,Q*4),P.u=r(P.u+Math.sin(P.heading)*P.speed*Q/(20*Fe),-.12,1.12),P.v=r(P.v+Math.cos(P.heading)*P.speed*Q/20,-.12,1.12),w.enforceBeachBoundary){let ke=w.enforceBeachBoundary(P.u,P.v,.12);ke.clamped&&(P.u=ke.u,P.v=ke.v,P.targetHeading=Math.atan2(.54-P.u,.48-P.v),P.heading=P.targetHeading)}P.z=a(P.z,P.targetDepth+.04*Math.sin(Le*.6+P.seed),Q*1.5),P.pitch=a(P.pitch,r((P.targetDepth-P.z)*.8,-.32,.32),Q*2),P.z>-.25&&Math.random()<Q*1.2&&w.addWaterImpulseUv(P.u,P.v,.012,-.06,N),P.wakeTimer-=Q,P.wakeTimer<=0&&!P.isGliding&&(P.wakeTimer=.35,w.addWaterImpulseUv(P.u,P.v,.014,-.08,N))}let ot=P.u,it=P.v,pt=P.z,me=P.roll,ue=P.pitch;if(at){let Ce=i.OceanMeteor.flight({u:P.u,v:P.v,z:P.z,roll:P.roll,flip:P.pitch},Ze,30+De,Fe);ot=Ce.u,it=Ce.v,pt=Ce.z,me=Ce.roll,ue=Ce.flip}let Ae=w.toWorld(ot,it,pt);if(U.mesh.position.set(Ae.x,Ae.y,Ae.z),U.mesh.rotation.set(ue,me,-P.heading,"ZYX"),U.mesh.scale.setScalar(P.scale),U.mat.uniforms.stroke.value=P.stroke,U.mat.uniforms.turn.value=P.turn,U.mat.uniforms.clock.value=Le,U.mat.uniforms.uWaterClarity.value=Pe,U.mat.uniforms.uCausticsIntensity.value=be,We<w.MAX_SHADOW_CASTERS){let{worldW:Ce,worldH:B}=w.getWorldSize(),W=(ot-.5)*Ce,V=(.5-it)*B;w.creatureShadowData[We].set(W,pt,V,P.scale*1.05),We++}}I.uniforms.uTime.value=Le,I.uniforms.uWaterClarity.value=Pe,I.uniforms.uCausticsIntensity.value=be;let Xe=0;for(let De=0;De<fe.length;De++){let U=fe[De],P=i.OceanMeteor.isFlying(Ze,30+De%40);if(Qe(U,Ze,30+De%40,st,Fe),!P)if(U.flight){U.flight.elapsed+=Q;let Ae=r(U.flight.elapsed/U.flight.duration,0,1),Ce=Ae*Ae*(3-2*Ae);U.u=U.flight.startU+(U.flight.endU-U.flight.startU)*Ce,U.v=U.flight.startV+(U.flight.endV-U.flight.startV)*Ce;let B=U.group==="clown"?-1.05:U.group==="reef"?-.95:-.65;U.z=2.3*(1-Ae)+B*Ae+Math.sin(Math.PI*Ae)*3.3;let W=(U.flight.endU-U.flight.startU)*Fe,V=U.flight.endV-U.flight.startV;if(U.heading=Math.atan2(W,V),U.pitch=a(.55,-.72,o(.15,.85,Ae)),U.roll=0,U.bend=0,U.phase+=Q*24,Ae>=1){U.u=U.flight.endU,U.v=U.flight.endV,U.z=B,U.pitch=0;let re=U.flight.splash;if(U.flight=null,U.airborne=!1,U.excited=2,re){let ye=U.group==="silver"?.75:.85;w.spawnWaterSplashUv(U.u,U.v,ye,b,N)}}}else if(U.airborne)U.vz=(U.vz||4.5)-12*Q,U.z+=U.vz*Q,U.u=r(U.u+(U.vx||0)*Q,.05,.95),U.v=r(U.v+(U.vy||0)*Q,.05,.95),U.pitch=(U.pitch||0)+Q*8.5,U.roll=(U.roll||0)+Q*7,U.phase+=Q*25,U.z<=-.15&&(U.airborne=!1,U.z=U.group==="clown"?-1.1:-.65,U.vz=0,w.spawnWaterSplashUv(U.u,U.v,.75,De===0?b:null,N));else{U.excited=Math.max(0,U.excited-Q);let Ae=U.u,Ce=U.v;if(U.group==="silver"){let ze=ve[U.schoolId%ve.length],ke=Le*.65+U.seed;Ae=ze.u+Math.cos(ke)*.08/Math.max(.4,ht),Ce=ze.v+Math.sin(ke)*.08/Math.max(.4,ht)}else if(U.group==="clown"){let ze=F[U.homeIndex%F.length],ke=Le*1.15+U.seed;Ae=ze.u+Math.cos(ke)*.028,Ce=ze.v+Math.sin(ke)*.028,Math.hypot((U.u-ze.u)*20*Fe,(U.v-ze.v)*20)<.38&&(ze.squish=Math.max(ze.squish,.28))}else{let ze=w.getCoralHeads&&w.getCoralHeads()||[],ke=ze.length>0?ze[U.homeIndex%ze.length]:{u:.5,v:.5},nt=Le*.55+U.seed;Ae=ke.u+Math.cos(nt)*.065,Ce=ke.v+Math.sin(nt)*.065;let je=Math.sin(Le*.16+U.seed*3.5);if(je>.65){let Ye=(je-.65)*.38;Ae+=Math.cos(U.seed*6.28)*Ye,Ce+=Math.sin(U.seed*6.28)*Ye}}let B=(Ae-U.u)*(U.group==="clown"?2.4:1.35*ht),W=(Ce-U.v)*(U.group==="clown"?2.4:1.35*ht);if(U.group==="silver")for(let ze=Math.max(0,De-12);ze<Math.min(fe.length,De+12);ze++){if(De===ze)continue;let ke=fe[ze],nt=(U.u-ke.u)*Fe,je=U.v-ke.v,Ye=nt*nt+je*je;if(Ye>1e-5&&Ye<.0022){let et=.0012/Math.sqrt(Ye);B+=nt/Fe*et*18,W+=je*et*18}}for(let ze of J){let ke=(U.u-ze.u)*Fe,nt=U.v-ze.v,je=Math.hypot(ke,nt);if(je<.13){let Ye=(.13-je)/.13*1.45;B+=ke/Math.max(je,.001)*Ye,W+=nt/Math.max(je,.001)*Ye}}for(let ze of k){let ke=(U.u-ze.u)*Fe,nt=U.v-ze.v,je=Math.hypot(ke,nt),Ye=.18;if(je<Ye){let et=(Ye-je)/Ye*1.85;B+=ke/Math.max(je,.001)*et,W+=nt/Math.max(je,.001)*et}}if(qe&&qe.active&&gt>.05){let ze=(U.u-qe.u)*Fe,ke=U.v-qe.v,nt=Math.hypot(ze,ke),je=.11*gt;if(nt<je){let Ye=(je-nt)/je*2.2*gt;B+=ze/Math.max(nt,.001)*Ye,W+=ke/Math.max(nt,.001)*Ye}}if(w.getShoreDistance){let ze=w.getShoreDistance(U.u,U.v);if(ze<.18){let ke=(.18-ze)*1.8;B+=ke*1.8,W-=ke*1.8}}else w.getUvBathymetry(U.u,U.v)<.45&&U.u<.38&&U.v>.52&&(B+=.85,W-=.85);let V=0;if(He){let ze=(Be.u-U.u)*Fe,ke=Be.v-U.v,nt=Math.hypot(ze,ke),je=.12+.26*Te;if(nt<je){V=r((je-nt)/(je*.45),0,1)*Te;let Ye=.02+.024*(De/fe.length)+.005*Math.sin(U.seed*7.5),et=nt-Ye,Ke=r(et*3.2,-.6,1.8)*(.95+1.25*Te),mt=ze/Math.max(nt,.001),wt=ke/Math.max(nt,.001),yt=wt,Mt=-mt,At=1.2+.7*Te;B=a(B,(mt*Ke+yt*At)*5,V),W=a(W,(wt*Ke+Mt*At)*5,V)}}U.u<.02?B+=(.02-U.u)*2.8:U.u>.98&&(B-=(U.u-.98)*2.8),U.v<.02?W+=(.02-U.v)*2.8:U.v>.98&&(W-=(U.v-.98)*2.8),U.vx=(U.vx+B*Q)*Math.pow(.18,Q),U.vy=(U.vy+W*Q)*Math.pow(.18,Q);let re=(U.group==="silver"?.075:U.group==="clown"?.052:.058)*st*(U.excited>0?1.9:1),ye=Math.hypot(U.vx*Fe,U.vy)+1e-4,Se=re*(1.85+1.65*V),Oe=r(ye,re*.55,Se);if(U.vx=U.vx/ye*Oe,U.vy=U.vy/ye*Oe,U.u=r(U.u+U.vx*Q,-.14,1.14),U.v=r(U.v+U.vy*Q,-.14,1.14),w.enforceBeachBoundary){let ze=w.enforceBeachBoundary(U.u,U.v,.08);if(ze.clamped){U.u=ze.u,U.v=ze.v;let ke=U.vx*ze.normalU+U.vy*ze.normalV;ke<0&&(U.vx-=ke*ze.normalU*1.6,U.vy-=ke*ze.normalV*1.6)}}let _e=Math.atan2(U.vx*Fe,U.vy),ge=Math.atan2(Math.sin(_e-U.heading),Math.cos(_e-U.heading));U.heading+=ge*Math.min(1,Q*8.5),U.bend=a(U.bend,r(-ge*.85,-.75,.75),Q*8),U.phase+=Q*(9.5+Oe*85),U.roll=U.excited>0&&U.group==="reef"?U.excited*c:-U.bend*.35}let at=U.u,ot=U.v,it=U.z,pt=U.roll,me=U.pitch;if(P){let Ae=i.OceanMeteor.flight({u:U.u,v:U.v,z:U.z,roll:U.roll,flip:U.pitch},Ze,30+De%40,Fe);at=Ae.u,ot=Ae.v,it=Ae.z,pt=Ae.roll,me=Ae.flip}let ue=w.toWorld(at,ot,it);we.position.set(ue.x,ue.y,ue.z),we.rotation.set(me,pt,-U.heading,"ZYX"),we.scale.setScalar(U.size*ft),we.updateMatrix(),K.setMatrixAt(Xe,we.matrix),C.setXYZW(Xe,U.phase,U.kind,U.bend,U.size*ft),Xe++}if(ne){ne.age+=Q;let De=ne.age,U=ne.routeTitle||"深海大巡游",P=ne.tourTier==="grand"?"【大环游】大半个海域宏大巡弋":ne.tourTier==="medium"?"【中环游】半海域开阔巡回":"【小环游】花式穿梭";ne.phase=De<54?\`鱼群穿境 · \${P}（自远海游入）\`:De<200?\`鱼群穿境 · \${P} · 1440尾银鱼舒展畅游\`:"鱼群穿境 · 鱼群巡游完毕，向大洋深处漫游散去";let at=0,ot=ne.branches,it=ot?ot.length:1;for(let pt=0;pt<ne.members.length;pt++){let me=ne.members[pt];if(me.progress+=me.speed*Q*(.85+.25*st),me.progress<0||me.progress>1)continue;let ue=me.progress,Ce=(ot?ot[me.branchId||0]:ne).waypoints,B=Ne(Ce,ue,Fe),W=.034*(.85+.45*Math.sin(ue*Math.PI)),V=Math.sin(Le*2.4+ue*16+me.lane*1.5)*.004,re=Math.sin(ue*9+Le*1.2)*.014+Math.cos(ue*19-Le*1.7)*.007,ye=Math.sin(Le*me.wanderFreq+me.wanderPhase)*.006,Oe=(me.lane+Math.sin(Le*.8+me.wanderPhase)*(me.laneDrift||.1))*W+V+re+ye,_e=B.u+B.normU*Oe,ge=B.v+B.normV*Oe,ze=Math.hypot(B.tu*Fe,B.tv)||1,ke=B.tu/ze,nt=B.tv/ze,je=.078*st;me.initialized||(me.u=_e,me.v=ge,me.vx=ke*je,me.vy=nt*je,me.heading=Math.atan2(me.vx*Fe,me.vy),me.bend=0,me.roll=0,me.initialized=!0);let Ye=(_e-me.u)*4.6,et=(ge-me.v)*4.6;Ye+=ke*je*5,et+=nt*je*5;let Ke=0;for(let Tt of J){let Pt=(me.u-Tt.u)*Fe,It=me.v-Tt.v,Nt=Math.hypot(Pt,It),ln=.16;if(Nt<ln){let Mn=(ln-Nt)/ln*4;Ye+=Pt/Math.max(Nt,.001)*Mn,et+=It/Math.max(Nt,.001)*Mn,Mn>Ke&&(Ke=Mn)}}for(let Tt of k){let Pt=(me.u-Tt.u)*Fe,It=me.v-Tt.v,Nt=Math.hypot(Pt,It),ln=.2;if(Nt<ln){let Mn=(ln-Nt)/ln*4.2;Ye+=Pt/Math.max(Nt,.001)*Mn,et+=It/Math.max(Nt,.001)*Mn}}if(qe&&qe.active&&gt>.05){let Tt=(me.u-qe.u)*Fe,Pt=me.v-qe.v,It=Math.hypot(Tt,Pt),Nt=.12*gt;if(It<Nt){let ln=(Nt-It)/Nt*2.5*gt;Ye+=Tt/Math.max(It,.001)*ln,et+=Pt/Math.max(It,.001)*ln}}let mt=0;if(He){let Tt=(Be.u-me.u)*Fe,Pt=Be.v-me.v,It=Math.hypot(Tt,Pt),Nt=.12+.26*Te;if(It<Nt){mt=r((Nt-It)/(Nt*.45),0,1)*Te;let ln=.022+.024*(me.index/Math.max(mCount,1)),Mn=It-ln,nr=r(Mn*3.2,-.6,1.8)*(.95+1.25*Te),Na=Tt/Math.max(It,.001),Ua=Pt/Math.max(It,.001),Ul=Ua,Oa=-Na,rs=1.2+.7*Te;Ye=a(Ye,(Na*nr+Ul*rs)*5,mt),et=a(et,(Ua*nr+Oa*rs)*5,mt)}}if(w.getShoreDistance){let Tt=w.getShoreDistance(me.u,me.v);if(Tt<.18){let Pt=(.18-Tt)*2.2;Ye+=Pt*2,et-=Pt*2}}else w.getUvBathymetry(me.u,me.v)<.45&&me.u<.38&&me.v>.52&&(Ye+=.95,et-=.95);if(Ke>.25&&(me.lane+=((me.u-_e)*B.normU*Fe+(me.v-ge)*B.normV)*Q*.55,me.lane=r(me.lane,-3.2,3.2),it>1&&Ke>.85&&Math.random()<.16*Q*60)){let Tt=((me.branchId||0)+1)%it,Pt=Ne(ot[Tt].waypoints,ue,Fe);Math.hypot((me.u-Pt.u)*Fe,me.v-Pt.v)<.35&&(me.branchId=Tt)}me.vx=(me.vx+Ye*Q)*Math.pow(.18,Q),me.vy=(me.vy+et*Q)*Math.pow(.18,Q);let wt=Math.hypot(me.vx*Fe,me.vy)+1e-4,yt=je*(1.75+1.65*mt),Mt=r(wt,je*.6,yt);if(me.vx=me.vx/wt*Mt,me.vy=me.vy/wt*Mt,me.u+=me.vx*Q,me.v+=me.vy*Q,w.enforceBeachBoundary&&me.u<.65&&me.v>.35&&me.v<=1){let Tt=w.enforceBeachBoundary(me.u,me.v,.08);if(Tt.clamped){me.u=Tt.u,me.v=Tt.v;let Pt=me.vx*Tt.normalU+me.vy*Tt.normalV;Pt<0&&(me.vx-=Pt*Tt.normalU*1.6,me.vy-=Pt*Tt.normalV*1.6)}}let At=Math.atan2(me.vx*Fe,me.vy),Rt=Math.atan2(Math.sin(At-me.heading),Math.cos(At-me.heading)),pn=5.2*Q;if(me.heading+=r(Rt,-pn,pn),me.bend=a(me.bend||0,r(-Rt*.85,-.75,.75),Q*8),me.roll=-me.bend*.35,me.phase+=Q*(12+Mt*75),Xe<u){let Tt=me.size*ft;me.airborne&&(me.vz=(me.vz||4)-12*Q,me.z+=me.vz*Q,me.u=r(me.u+(me.vx||0)*Q,.05,.95),me.v=r(me.v+(me.vy||0)*Q,.05,.95),me.roll=(me.roll||0)+Q*6,me.z<=-.62&&(me.airborne=!1,me.z=-.62,me.vz=0,Math.random()<.35&&w.spawnWaterSplashUv(me.u,me.v,.65,null,N)));let Pt=w.toWorld(me.u,me.v,me.z);we.position.set(Pt.x,Pt.y,Pt.z),we.rotation.set(0,me.roll,-me.heading,"ZYX"),we.scale.setScalar(Tt),we.updateMatrix(),K.setMatrixAt(Xe,we.matrix),C.setXYZW(Xe,me.phase,4,me.bend,Tt),Xe++,at++}}(De>=ne.duration||De>30&&at===0)&&(ne=null)}return K.count=Xe,K.visible=Xe>0,Xe>0&&(K.instanceMatrix.needsUpdate=!0,C.needsUpdate=!0),w.oceanMaterial.uniforms.uCreatureCount.value=We,We}function vt(Q,Le){let Me=new m.WebGLRenderTarget(192,136,{minFilter:m.LinearFilter,magFilter:m.LinearFilter,format:m.RGBAFormat}),Re=new m.Scene,Be=new m.PerspectiveCamera(34,192/136,.1,30),Ze=Le.createRayInstancedGeometry();Ze.instanceCount=1;let $e=new m.Mesh(Ze,Le.rayMaterial);Re.add($e);let Fe=Le.createJellyBellInstancedGeometry();Fe.instanceCount=1;let st=new m.Mesh(Fe,Le.jellyBellMaterial);Re.add(st);let ft=Le.NODES_PER_RIBBON,ht=new m.BufferGeometry,gt=new Float32Array(12*ft*2*3),N=new Float32Array(12*ft*2*2),Pe=new Float32Array(12*ft*2*4);ht.setIndex(new m.BufferAttribute(Le.ribbonIndices.slice(0,12*(ft-1)*6),1)),ht.setAttribute("position",new m.BufferAttribute(gt,3)),ht.setAttribute("uv",new m.BufferAttribute(N,2)),ht.setAttribute("aRibbonColor",new m.BufferAttribute(Pe,4));let be=new m.Mesh(ht,Le.ribbonMaterial);Re.add(be);let Te=p(m),He=new m.InstancedBufferAttribute(new Float32Array(48),4);Te.setAttribute("aFishState",He);let rt=new m.InstancedMesh(Te,I,12);Re.add(rt);let A=v(m),We=new m.InstancedBufferAttribute(new Float32Array([.5,0,.2,1]),4);A.setAttribute("aAnemoneData",We);let Xe=new m.InstancedMesh(A,O,1);Re.add(Xe);let De=new m.Mesh(G,M[0].mat);Re.add(De);let U=x(m),P=new m.Mesh(U,pe[0].mat);Re.add(P);let at=new m.Color;Q.getClearColor(at);let ot=Q.getClearAlpha(),it=new Uint8Array(26112*4),pt=e.createElement("canvas");pt.width=192,pt.height=136;let me=pt.getContext("2d");e.querySelectorAll("#dock .card[data-kind]").forEach(Ae=>{let Ce=Ae.dataset.kind,B=Ae.querySelector("img");if(!B)return;if($e.visible=!1,st.visible=!1,be.visible=!1,rt.visible=!1,Xe.visible=!1,De.visible=!1,P.visible=!1,Ce==="manta"||Ce==="eagle"||Ce==="stingray"){$e.visible=!0;let V=Ce==="manta"?0:Ce==="eagle"?1:2,re=Ce==="manta"?1.08:Ce==="eagle"?1.04:1.18;Ze.attributes.aInstAnim.setXYZW(0,.55,.75,V,.15),Ze.attributes.aInstState.setXYZW(0,-.18,-.2,0,re),Ze.attributes.aInstPose.setXYZW(0,0,.25,0,2.55),Ze.attributes.aInstAnim.needsUpdate=!0,Ze.attributes.aInstState.needsUpdate=!0,Ze.attributes.aInstPose.needsUpdate=!0,Be.position.set(.15,-1.35,3.8),Be.up.set(0,1,0),Be.lookAt(0,-.05,.2),Be.updateProjectionMatrix()}else if(Ce==="moon"||Ce==="nettle"){st.visible=!0,be.visible=!0;let V=Ce==="nettle",re=V?.84:.98,ye=new m.Vector3(.45,.85,.25).normalize();Fe.attributes.aInstPose.setXYZW(0,-.18,.52,0,re),Fe.attributes.aInstAxis.setXYZW(0,ye.x,ye.y,ye.z,.2),Fe.attributes.aInstMeta.setXYZW(0,V?1:0,.32,0,0),Fe.attributes.aInstPose.needsUpdate=!0,Fe.attributes.aInstAxis.needsUpdate=!0,Fe.attributes.aInstMeta.needsUpdate=!0,Be.position.set(0,-3.45,1.65),Be.up.set(0,0,1),Be.lookAt(.05,0,.15),Be.updateProjectionMatrix();let Se=0;for(let Oe=0;Oe<12;Oe++){let _e=Oe<4,ge=Oe/(_e?4:8)*c+(_e?.3:0),ze=_e?.18*re:.68*re,ke=-.18+Math.cos(ge)*ze,nt=.42,je=Math.sin(ge)*ze,Ye=V?_e?1.35:1.75:_e?.65:.42,et=_e?V?.15:.1:V?.032:.022,Ke=V?_e?1:.88:_e?.96:.8,mt=V?_e?.91:.38:_e?.68:.92,wt=V?_e?.76:.16:_e?.88:1;for(let yt=0;yt<ft;yt++){let Mt=yt/(ft-1),At=Math.sin(Mt*5+Oe*1.1)*.12*Mt,Rt=ke-ye.x*Mt*Ye+At,pn=nt-ye.y*Mt*Ye,Tt=je-ye.z*Mt*Ye,Pt=et*(1-Mt*.6);for(let It=0;It<2;It++){let Nt=It===0?-1:1;gt[Se*3]=Rt+Nt*Pt,gt[Se*3+1]=pn,gt[Se*3+2]=Tt,N[Se*2]=It,N[Se*2+1]=Mt,Pe[Se*4]=Ke,Pe[Se*4+1]=mt,Pe[Se*4+2]=wt,Pe[Se*4+3]=_e?0:1,Se++}}}ht.attributes.position.needsUpdate=!0,ht.attributes.uv.needsUpdate=!0,ht.attributes.aRibbonColor.needsUpdate=!0,ht.setDrawRange(0,12*(ft-1)*6)}else Ce==="silver"?(rt.visible=!0,rt.count=9,[[-.72,.28,.1],[-.18,.45,.2],[.38,.3,0],[-.58,-.05,-.1],[.02,.06,.15],[.58,.02,-.05],[-.36,-.36,0],[.22,-.3,.1],[.74,-.24,-.1]].forEach(([re,ye,Se],Oe)=>{we.position.set(re,ye,Se),we.rotation.set(.15,-.2,-1.15,"ZYX"),we.scale.setScalar(.54),we.updateMatrix(),rt.setMatrixAt(Oe,we.matrix),He.setXYZW(Oe,Oe*.9,0,.15,.54)}),rt.instanceMatrix.needsUpdate=!0,He.needsUpdate=!0,Be.position.set(0,-1.25,2.85),Be.up.set(0,1,0),Be.lookAt(0,0,0),Be.updateProjectionMatrix()):Ce==="reef"?(rt.visible=!0,rt.count=3,[{pos:[-.54,.24,.1],kind:1,scale:.78,rot:-1.1},{pos:[.14,-.1,.25],kind:2,scale:.84,rot:-1.25},{pos:[.58,.3,-.1],kind:3,scale:.74,rot:-1}].forEach((re,ye)=>{we.position.set(...re.pos),we.rotation.set(.2,-.25,re.rot,"ZYX"),we.scale.setScalar(re.scale),we.updateMatrix(),rt.setMatrixAt(ye,we.matrix),He.setXYZW(ye,ye*1.4,re.kind,.18,re.scale)}),rt.instanceMatrix.needsUpdate=!0,He.needsUpdate=!0,Be.position.set(0,-1.35,2.75),Be.up.set(0,1,0),Be.lookAt(.04,.08,.05),Be.updateProjectionMatrix()):Ce==="clown"?(Xe.visible=!0,rt.visible=!0,rt.count=2,we.position.set(-.24,-.18,-.25),we.rotation.set(.2,0,0),we.scale.setScalar(1.08),we.updateMatrix(),Xe.setMatrixAt(0,we.matrix),Xe.instanceMatrix.needsUpdate=!0,[{pos:[.2,.12,.35],scale:.88,rot:-1.18},{pos:[-.36,.28,.42],scale:.72,rot:-.85}].forEach((re,ye)=>{we.position.set(...re.pos),we.rotation.set(.18,-.22,re.rot,"ZYX"),we.scale.setScalar(re.scale),we.updateMatrix(),rt.setMatrixAt(ye,we.matrix),He.setXYZW(ye,ye*1.8,5,.22,re.scale)}),rt.instanceMatrix.needsUpdate=!0,He.needsUpdate=!0,Be.position.set(0,-1.42,2.78),Be.up.set(0,1,0),Be.lookAt(-.04,.05,.1),Be.updateProjectionMatrix()):Ce==="shark"?(De.visible=!0,De.position.set(.08,.02,0),De.rotation.set(.18,-.22,-1.18,"ZYX"),De.scale.setScalar(.84),M[0].mat.uniforms.stroke.value=.8,M[0].mat.uniforms.turn.value=.22,Be.position.set(0,-1.45,3.5),Be.up.set(0,1,0),Be.lookAt(0,0,.05),Be.updateProjectionMatrix()):Ce==="turtle"&&(P.visible=!0,P.position.set(.02,-.02,0),P.rotation.set(.24,-.26,-1.22,"ZYX"),P.scale.setScalar(.95),pe[0].mat.uniforms.stroke.value=.42,pe[0].mat.uniforms.turn.value=.12,Be.position.set(0,-1.45,3.2),Be.up.set(0,1,0),Be.lookAt(0,0,.04),Be.updateProjectionMatrix());Q.setClearColor(0,0),Q.setRenderTarget(Me),Q.clear(),Q.render(Re,Be),Q.readRenderTargetPixels(Me,0,0,192,136,it),Q.setRenderTarget(null);let W=me.createImageData(192,136);for(let V=0;V<136;V++){let re=(135-V)*192*4,ye=V*192*4;for(let Se=0;Se<768;Se++)W.data[ye+Se]=it[re+Se]}me.putImageData(W,0,0),B.src=pt.toDataURL("image/png")}),Q.setClearColor(at,ot),Me.dispose()}function xt(){fe.length=0,J.length=0,k.length=0,Ue()}function tt(){return{fish:fe.length,migration:ne?.active?ne.members.length:0,sharks:J.length,turtles:k.length}}return{residentFish:fe,sharks:J,turtles:k,anemoneSpots:F,syncCounts:de,clearAll:xt,spawnFromDock:R,throwFishFromDock:ie,startSchoolMigrationEvent:Ee,setMigrationBudget(Q){ee=Math.max(120,Math.min(h,Math.round(Q)))},stopSchoolMigrationEvent:Ue,getStreamEvent:()=>ne,interactAt:Ve,update:ct,getCounts:tt,renderAllDockThumbnails:vt}}i.OceanReefEcosystem={createReefEcosystem:g}})(s)}function z1(s=5.2){let e=Math.min(1.6,s*.5);return{reveal:Math.min(.7,e*.5),prelude:e}}function Iu(s,e=5.2){let{reveal:t,prelude:n}=z1(e),i=(r,a,o)=>{let c=Math.max(0,Math.min(1,(o-r)/(a-r)));return c*c*(3-2*c)};return{opacity:i(0,t,s),titleOpacity:i(t,t+(n-t)*.4,s)*(1-i(n,n+Math.min(.6,e*.15),s)),titleY:(1-i(t,n,s))*10,cameraProgress:Math.max(0,Math.min(1,(s-n)/(e-n)))}}function bp(s,e,t,n){(function(i){"use strict";let r=(c,l=0,h=1)=>Math.max(l,Math.min(h,c)),a=(c,l,h)=>{let u=r((h-c)/(l-c));return u*u*(3-2*u)};function o({camera:c,title:l,body:h=e.body}){let u=n("(prefers-reduced-motion: reduce)"),d={enabled:1,duration:5.2,intensity:1},f={zoom:c.zoom,x:c.position.x,y:c.position.y},p=!1,y=0,x=1,v=!1;function g(){if(h.style.setProperty("--intro-ui",String(a(.66,.98,x))),h.classList.toggle("intro-active",p),h.classList.toggle("intro-blocked",p),h.classList.remove("intro-pending"),l){l.hidden=!p;let O=Iu(y,d.duration);l.style.opacity=String(p?O.titleOpacity:0),l.style.transform=\`translateY(\${O.titleY}px)\`}}function m(){let O=Iu(y,d.duration).cameraProgress,ae=r(O*O*O*(O*(O*6-15)+10)),_=1+.42*d.intensity*(1-ae),E=(c.right-c.left)/(2*f.zoom),z=(c.top-c.bottom)/(2*f.zoom),D=1-1/_;c.zoom=f.zoom*_,c.position.x=f.x+E*D*(.48-.3*ae),c.position.y=f.y+z*D*(-.2+.48*Math.sin(Math.PI*ae)),c.updateProjectionMatrix(),c.updateMatrixWorld()}function S(){let O=p;p=!1,x=1,O&&(c.zoom=f.zoom,c.position.x=f.x,c.position.y=f.y,c.updateProjectionMatrix(),c.updateMatrixWorld()),g()}function w(O={}){Number.isFinite(O.enabled)&&(d.enabled=+(O.enabled>0)),Number.isFinite(O.duration)&&(d.duration=r(O.duration,1.5,12)),Number.isFinite(O.intensity)&&(d.intensity=r(O.intensity,0,2)),!d.enabled||u.matches?S():p&&m()}function b(O){v||(w(O),!(!d.enabled||u.matches)&&(p||(f.zoom=c.zoom,f.x=c.position.x,f.y=c.position.y),y=0,x=0,p=!0,m(),g()))}function F(O){if(p){if(y+=Math.max(0,O),x=r(y/d.duration),x>=1){S();return}m(),g()}}let L=()=>{u.matches&&S()};return u.addEventListener("change",L),{configure:w,replay:b,advance:F,finish:S,resize(){p&&m()},get active(){return p},snapshot:()=>({active:p,progress:x,elapsed:y,...d,zoom:c.zoom,cameraX:c.position.x,cameraY:c.position.y}),dispose(){S(),v=!0,u.removeEventListener("change",L)}}}i.OceanOpening={create:o}})(s)}function wp(s){let{window:e,document:t,matchMedia:n}=s;hp(e,t,e,n),dp(e,t,e,n),fp(e,t,e,n),pp(e,t,e,n),mp(e,t,e,n),gp(e,t,e,n),vp(e,t,e,n),xp(e,t,e,n),yp(e,t,e,n),bp(e,t,e,n)}var D1=Object.freeze([Object.freeze({name:"low",fps:60,maxDpr:.85,maxPixels:921600,shadows:16,particles:.35,migration:360}),Object.freeze({name:"medium",fps:60,maxDpr:1.1,maxPixels:2073600,shadows:32,particles:.65,migration:720}),Object.freeze({name:"high",fps:60,maxDpr:1.6,maxPixels:3686400,shadows:64,particles:1,migration:1440})]);function Mp(s=0){let e=0,t=1,n=0,i=0,r=0,a=0,o=0,c=0,l=0,h=()=>D1[t];function u(){i=0,r=0,a=0,o=0}function d(f){e=Number.isFinite(f)?Math.max(0,Math.min(3,Math.round(f))):0,t=e===0?1:e-1,n=0,c=20,u()}return d(s),{get profile(){return h()},setMode:d,resetClock(){n=0,u()},shouldRender(f){let p=1e3/h().fps;return n&&f+.75<n?!1:(n=n&&f-n<p*3?n+p:f+p,!0)},pixelRatio(f,p,y){return Math.min(Math.max(.1,f||1),h().maxDpr,Math.sqrt(h().maxPixels/Math.max(1,p*y)))},observe(f){if(!Number.isFinite(f)||f<=0||f>.25||(i+=f,r++,c=Math.max(0,c-f),i<4))return!1;let p=i/r;if(l=1/p,i=0,r=0,e!==0)return!1;let y=1/h().fps;a=p>y*1.35?a+1:0,o=p<y*1.08?o+1:0;let x=a>=2?Math.max(0,t-1):o>=3&&c===0?Math.min(2,t+1):t;return x===t?!1:(t=x,c=30,n=0,u(),!0)},snapshot(){return{mode:e,profile:h().name,targetFps:h().fps,observedFps:Math.round(l*10)/10,maxPixels:h().maxPixels,shadowBudget:h().shadows,particleScale:h().particles,migrationBudget:h().migration}}}}var Il=Object.freeze(["school","dolphin","storm"]),Fl=Object.freeze(["meteor","duo"]);function _p(s=Math.random){let e=180,t=0,n=0,i=null;return{advance(r,a,o=!1,c=[...Il,...Fl]){if(!a||!Number.isFinite(r)||r<=0||(e-=r,e>1e-9))return null;if(Math.abs(e)<1e-9&&(e=0),e=180- -e%180,o)return n++,null;if(t++,s()>=.5)return i={tier:null,event:null},null;let l=s()<.8,h=(l?Il:Fl).filter(d=>c.includes(d));if(!h.length)return i={tier:l?"common":"rare",event:null},null;let u=h[Math.floor(s()*h.length)];return i={tier:l?"common":"rare",event:u},u},snapshot:()=>({intervalSeconds:180,remainingSeconds:e,checks:t,skipped:n,last:i})}}function Sp(s,e,t){let n=new s.Raycaster,i=new s.Vector2,r=new s.Plane(new s.Vector3(0,0,1),0),a=new s.Vector3;return(o,c)=>(i.set(o*2-1,c*2-1),n.setFromCamera(i,e),n.ray.intersectPlane(r,a)?t(a.x,a.y):{u:o,v:c})}function Ap(s){let{window:e,document:t,requestAnimationFrame:n,setTimeout:i,clearTimeout:r,matchMedia:a,addEventListener:o,localStorage:c}=s,l=s.width,h=s.height,u=globalThis.devicePixelRatio;s.onSize=()=>{l=s.width,h=s.height};let{OceanObjectOcclusion:d,OceanDriftDuo:f,OceanPenguinIce:p,OceanVisitors:y,OceanMeteor:x,OceanAudioEngine:v,OceanWaterSeabed:g,OceanMarineLife:m,OceanReefEcosystem:S,OceanOpening:w}=e;return(()=>{let b=e.THREE;if(!b){t.querySelector("#loading span").textContent="Three.js could not load. Check your connection and reload.";return}let F=(B,W,V)=>Math.max(W,Math.min(V,B)),L=(B,W,V)=>B+(W-B)*V,O=48,ae=713802,_=()=>(ae=Math.imul(ae,1664525)+1013904223>>>0,ae/4294967296),E={defaultCreaturesEnabled:1,performanceMode:0,silverCount:72,reefCount:12,clownCount:6,sharkCount:2,turtleCount:2,beachSize:1,fishSpeed:1,fishSize:1.15,schoolCohesion:1,fleeRadius:.105,clarity:1.15,caustics:1.15,surfaceReflection:.3,sunGlint:1,foamIntensity:1,refractionScale:1,shadowIntensity:.65,swell:1,rippleStrength:1,waterSpeed:1,coralDensity:1.2,grassDensity:1.2,eventsEnabled:1,introEnabled:1,introDuration:5.2,introIntensity:1},z={defaultCreaturesEnabled:[0,1,1],performanceMode:[0,3,1],silverCount:[0,160,1],reefCount:[0,36,1],clownCount:[0,18,1],sharkCount:[0,8,1],turtleCount:[0,6,1],beachSize:[0,2,.05],fishSpeed:[0,3,.05],fishSize:[.5,2,.05],schoolCohesion:[.2,2.5,.05],fleeRadius:[.03,.25,.005],clarity:[.4,1.8,.05],caustics:[0,2.5,.05],surfaceReflection:[0,1.2,.05],sunGlint:[0,3,.1],foamIntensity:[0,2.5,.05],refractionScale:[0,2.5,.05],shadowIntensity:[0,1,.05],swell:[0,2,.05],rippleStrength:[0,2.5,.05],waterSpeed:[0,2,.05],coralDensity:[.3,2,.1],grassDensity:[0,2,.1],eventsEnabled:[0,1,1],introEnabled:[0,1,1],introDuration:[1.5,12,.1],introIntensity:[0,2,.05]},D="ocean-shallows2-settings-v1",C={...E};try{let B=JSON.parse(c.getItem(D)||"{}");for(let W in E)Number.isFinite(B[W])&&(C[W]=F(B[W],z[W][0],z[W][1]))}catch{}let I=t.querySelector("#sea"),K;try{K=new b.WebGLRenderer({canvas:I,antialias:!0,alpha:!1,powerPreference:"high-performance"})}catch{t.querySelector("#loading span").textContent="WebGL is unavailable on this device.";return}let G=l,oe=h,le=G/oe,M=Mp(C.performanceMode),q=M.pixelRatio(u,G,oe);K.setPixelRatio(q),K.setSize(G,oe,!1),K.setClearColor(206137,1);let se=new b.Scene,X=new b.OrthographicCamera(-10*le,10*le,10,-10,.1,80);X.position.set(0,-.01,35),X.up.set(0,1,0),X.lookAt(0,0,0);let pe=w.create({camera:X,title:t.querySelector("#intro-title")}),ve=()=>({enabled:C.introEnabled,duration:C.introDuration,intensity:C.introIntensity});se.add(new b.HemisphereLight(14678527,3894888,1.15));let fe=new b.DirectionalLight(16774360,1.35);fe.position.set(8,10,22),se.add(fe);let J=new v,k=g.createWaterAndSeabedSystem({THREE:b,renderer:K,scene:se,initialSettings:{beachSize:C.beachSize,coralDensity:C.coralDensity,grassDensity:C.grassDensity}});k.resize(le);function ne(B,W){return k.getUvBathymetry(B,W)*.16}function ce(B,W){B=F(B,.04,.96),W=F(W,.04,.96);for(let V=0;V<32&&k.getUvBathymetry(B,W)<.35;V++)B=F(B+.014,.04,.96),W=F(W-.012,.04,.96);return{u:B,v:W}}let H=m.createRaysAndJelliesSystem({THREE:b,scene:se,camera:X,waterSystem:k,sound:J}),j=S.createReefEcosystem({THREE:b,scene:se,waterSystem:k,sound:J}),he=d.create(b),de=y.createStage({THREE:b,scene:se,toWorld:(B,W)=>{let V=k.toWorld(B,W,0);return new b.Vector3(V.x,V.y,0)},aspect:()=>le,splash:(B,W)=>{k.spawnWaterSplashUv(B,W,.95,J,C.rippleStrength)},ripple:(B,W,V=.08,re=.012)=>{k.addWaterImpulseUv(B,W,Math.max(.008,re),-Math.abs(V)*1.8,C.rippleStrength)},breachSplash:(B,W,V)=>{let re=V==="in"?1.35:.95;k.spawnWaterSplashUv(B,W,re,J,C.rippleStrength)},surfaceDepth:null,layerCenters:he.texture,surfaceParticles:null}),ie=x.create(b),R=a("(prefers-reduced-motion: reduce)"),T=!1,te=C.beachSize;k.oceanMaterial.uniforms.uRecoveryReach.value=x.recoveryReach(ne),k.waterSurfaceMaterial.uniforms.uRecoveryReach.value=k.oceanMaterial.uniforms.uRecoveryReach.value;let $={whirl:!1,whirlStrength:0,sound:!1,hidden:!1,calmFactor:0,vortex:{u:.58,v:.46}},xe=null;function Z(B){let W=t.querySelector("#notice");W&&(W.textContent=B,r(xe),xe=i(()=>{W.textContent=""},2400))}function Ie(){let B=H.getCounts(),W=j.getCounts(),V=t.querySelector("#count");V&&(V.textContent=\`\${B.rays} rays · \${B.jellies} jellies · \${W.turtles} turtles · \${W.fish} fish · \${W.sharks} sharks\`)}function Ne(){j.syncCounts(C),Ie()}function ee(){let B=[["manta",.54,.7],["eagle",.38,.52],["stingray",.28,.36],["manta",.76,.34],["moon",.46,.8],["moon",.6,.34],["nettle",.72,.64],["moon",.33,.24],["nettle",.83,.48]];for(let[W,V,re]of C.defaultCreaturesEnabled?B:[]){let ye=ce(V,re),Se=H.uvToXZ(ye.u,ye.v);H.spawnCreature(W,{x:Se.x,z:Se.z,state:"swimming"})}Ne()}let Ee=(()=>{let B={current:null,story:null,serial:0},W=_p(_);function V(){B.current?.type==="school"&&j.stopSchoolMigrationEvent(),(B.current?.type==="storm"||$.storm)&&($.whirl=!1,$.whirlStrength=0,$.storm=null),B.current=null,B.story=null}function re(Se){if(B.current||![...Il,...Fl].includes(Se))return!1;let Oe={type:Se,age:0,id:++B.serial};if(B.current=Oe,Se==="meteor")return Oe.duration=x.DURATION,Oe.seed=Math.floor(Math.random()*1e9),Oe.phase="天外来客",!0;if(Se==="school"){let _e=j.startSchoolMigrationEvent();return Oe.duration=_e.duration,Oe.phase=_e.phase,!0}if(Se==="storm"){Oe.duration=36,Oe.phase="微风轻拂 · 细小微涡正在海面悄然凝聚...";let _e=.48+(Math.random()-.5)*.26,ge=.44+(Math.random()-.5)*.24;return $.storm={age:0,duration:36,u0:_e,v0:ge,dir:Math.random()*Math.PI*2},$.vortex.u=_e,$.vortex.v=ge,$.whirl=!0,$.whirlStrength=.05,!0}return B.story=y.create(Se,_,ce,le,ne),Oe.duration=B.story.duration,Oe.phase=B.story.phase,!0}function ye(Se,Oe,_e=Se){let ge=W.advance(_e,Oe,!!B.current,s.eventHooks?.included());ge&&re(ge)&&s.eventHooks?.started(ge),Se=F(Se,0,.05);let ze=B.current;if(ze){if(B.story){ze.age+=Se;let ke=y.step(B.story,Se,{aspect:le,splash:(nt,je)=>k.addWaterImpulseUv(nt,je,.016,-.25,C.rippleStrength)});ze.phase=B.story.phase,ke&&V();return}if(ze.age+=Se,ze.type==="meteor"){let ke=x.state(ze.age);ze.phase=ke.phase,Math.abs(ze.age-x.IMPACT)<Se*1.2&&k.spawnWaterSplashUv(.55,.5,2.2,J,C.rippleStrength)}else if(ze.type==="school"){let ke=j.getStreamEvent();if(ke&&ke.active!==!1)ze.phase=ke.phase;else{V();return}}else if(ze.type==="storm"&&$.storm){$.storm.age+=Se;let ke=$.storm,nt=Math.sin(ke.age*.22+ke.dir)*.16+Math.cos(ke.age*.11)*.05,je=Math.cos(ke.age*.18+ke.dir)*.16+Math.sin(ke.age*.09)*.05;$.vortex.u=F(ke.u0+nt,.4,.86),$.vortex.v=F(ke.v0+je,.18,.82),$.whirl=!0;let Ye=9,et=27,Ke=0;if(ke.age<Ye){let mt=ke.age/Ye;Ke=.08+.92*(mt*mt*(3-2*mt)),ke.age<3.5?ze.phase="微风轻拂 · 细小微涡正在海面悄然凝聚...":ze.phase="风暴集聚 · 小旋涡扩充为巨大引力深涡！"}else if(ke.age<et)Ke=1,ke.age<18?ze.phase="深海巨涡肆虐 · 万千生灵循体积分层盘旋！":ze.phase="潮涌回旋 · 鱼群与巨兽环绕风眼同心回旋";else{let mt=F((ke.age-et)/(ke.duration-et),0,1);Ke=1-mt*mt*(3-2*mt),ze.phase="风暴平息 · 巨涡消弭收缩归于安宁"}$.whirlStrength=Ke}ze.age>=ze.duration&&V()}}return{state:B,trigger:re,advance:ye,cancel:V,schedule:W.snapshot}})();function Ue(){return Ee.state.current?.type==="meteor"?Ee.state.current.age:-1}let Ve="";function we(){let B=t.querySelector("#event-status");if(!B)return;let W=Ee.state.current,V=Ee.state.story?.phase||W?.phase,re={school:"鱼群穿境",storm:"海原风暴",meteor:"巨陨归潮",...y.names};W?B.textContent=\`正在发生：\${re[W.type]||W.type}\${V?" · "+V:""}\${C.eventsEnabled?"":"（本次结束后暂停）"}\`:B.textContent=C.eventsEnabled?"静候下一次海洋事件":"随机事件已暂停"}function Qe(B){if(Ee.state.current&&Ee.cancel(),!Ee.trigger(B))Z("当前事件结束后，再预览下一种");else{let W={school:"鱼群穿境",meteor:"巨陨归潮",...y.names};Z(\`已触发事件：\${W[B]||B}\`)}we()}let ct=[{kind:"manta",title:"Manta",sub:"双吻前口蝠鲼",isFish:!1},{kind:"eagle",title:"Spotted Eagle Ray",sub:"斑点鹞鲼",isFish:!1},{kind:"stingray",title:"Blue-spotted Stingray",sub:"蓝斑条尾魟",isFish:!1},{kind:"turtle",title:"Sea Turtle",sub:"绿海龟 · +1",isFish:!0,settingKey:"turtleCount"},{kind:"moon",title:"Moon Jelly",sub:"海月水母",isFish:!1},{kind:"nettle",title:"Sea Nettle",sub:"太平洋黄金水母",isFish:!1},{kind:"silver",title:"Silver School",sub:"银色鱼群 · +12",isFish:!0,settingKey:"silverCount"},{kind:"reef",title:"Reef Fish",sub:"珊瑚彩色鱼 · +1",isFish:!0,settingKey:"reefCount"},{kind:"clown",title:"Clownfish",sub:"海葵小丑鱼 · +1",isFish:!0,settingKey:"clownCount"},{kind:"shark",title:"Blacktip Reef Shark",sub:"黑鳍礁鲨 · +1",isFish:!0,settingKey:"sharkCount"}],vt=t.querySelector("#dock"),xt={},tt=null,Q=Sp(b,X,k.worldToUv),Le=null;function Ge(B,W=!1){let V=s.pointerOrigin?.()??{left:0,top:0},re=(B.clientX-V.left)/Math.max(1,G),ye=1-(B.clientY-V.top)/Math.max(1,oe);if(W&&pe.active){let Se=Q(re,ye);return{u:F(Se.u,.01,.99),v:F(Se.v,.01,.99)}}return{u:F(re,.01,.99),v:F(ye,.01,.99)}}for(let B of ct){let W=t.createElement("button");W.className="card",W.dataset.kind=B.kind,W.dataset.species=B.kind,W.setAttribute("aria-label",\`Add \${B.title}. Drag to place.\`),W.innerHTML=\`<img alt="\${B.title}" draggable="false"><strong>\${B.title}</strong><small>\${B.sub}</small>\`,vt.append(W),xt[B.kind]=W,W.addEventListener("pointerdown",V=>{if(tt||V.button!==0)return;let re=Ge(V);if(B.isFish)V.preventDefault(),W.setPointerCapture(V.pointerId),tt={type:"fish-card",species:B.kind,settingKey:B.settingKey,id:V.pointerId,startX:V.clientX,startY:V.clientY,u:re.u,v:re.v,moved:!1};else{if(H.creatures.length>=O){Z("海域生物已达 48 只上限 · 可点击 Clear sea 清空");return}V.preventDefault(),W.setPointerCapture(V.pointerId);let ye=H.uvToXZ(re.u,re.v),Se=H.spawnCreature(B.kind,{x:ye.x,y:2.35,z:ye.z,state:"dragging"});Ie(),tt={type:"ray-card",creature:Se,id:V.pointerId,startX:V.clientX,startY:V.clientY,u:re.u,v:re.v,moved:!1}}})}t.querySelector("#dock-prev").onclick=()=>vt.scrollBy({left:-240,behavior:"smooth"}),t.querySelector("#dock-next").onclick=()=>vt.scrollBy({left:240,behavior:"smooth"});function qe(B,W=!1){if(!tt||tt.type!=="ray-card"&&tt.type!=="fish-card")return;let V=tt;if(tt=null,V.type==="fish-card"){let ye=xt[V.species]?.getBoundingClientRect(),Se=F(ye?(ye.left+ye.width/2)/Math.max(1,G):V.startX/Math.max(1,G),.06,.94),Oe=.06,_e;if(V.moved&&!W)_e=ce(V.u,V.v);else if(V.species==="clown"){let ze=j.anemoneSpots,ke=ze[Math.floor(_()*ze.length)]||{u:.58,v:.46};_e={u:F(ke.u+(_()-.5)*.04,.08,.92),v:F(ke.v+(_()-.5)*.04,.08,.92)}}else V.species==="shark"?_e=ce(.35+_()*.42,.28+_()*.44):V.species==="silver"?_e=ce(.3+_()*.46,.32+_()*.42):_e=ce(.26+_()*.48,.28+_()*.45);if(!j.throwFishFromDock(V.species,Se,Oe,_e.u,_e.v,C))Z("已达到这一类鱼的数量上限");else{if(J){let ze=V.species==="shark"?0:V.species==="silver"?1:V.species==="reef"?2:3;J.playChime(ze,.14)}gt(),N(),Ie()}return}let re=V.creature;if(re)if(V.moved&&!W){let ye=ce(V.u,V.v),Se=H.uvToXZ(ye.u,ye.v);re.x=Se.x,re.z=Se.z,re.state="falling",re.vy=-1.5,re.vx=0,re.vz=0}else{let ye=H.findOpenSeaUv(),Se=H.uvToXZ(ye.u,ye.v),Oe={u:F(V.startX/Math.max(1,G),.1,.9),v:.06},_e=H.uvToXZ(Oe.u,Oe.v);re.x=_e.x,re.z=_e.z,re.y=2.6;let ge=.86,ze=18.5;re.vx=(Se.x-_e.x)/ge,re.vz=(Se.z-_e.z)/ge,re.vy=(0-re.y+.5*ze*ge*ge)/ge,re.yaw=Math.atan2(re.vx,re.vz),re.targetYaw=re.yaw,re.state="thrown",J&&J.playChime(0,.12)}}o("pointerup",B=>qe(B,!1)),o("pointercancel",B=>qe(B,!0)),o("blur",B=>qe(B,!0));let Me={u:.5,v:.5,active:!1,until:0},Re=null,Be=null;function Ze(B,W){let V=H.uvToXZ(B,W),re=null,ye=1/0;for(let Se of H.creatures){if(Se.state==="dragging"||Se.state==="thrown"||Se.state==="falling")continue;let Oe=Math.hypot(Se.x-V.x,Se.z-V.z),_e=Se.isRay?1.45*Se.scale:.85*Se.scale;Oe<_e&&Oe<ye&&(ye=Oe,re=Se)}return re}I.addEventListener("pointerdown",B=>{if(pe.active||B.button!==0||Ue()>=18)return;J.unlock();let W=Ge(B);if(I.setPointerCapture(B.pointerId),($.whirl||$.whirlStrength>.05)&&Math.hypot((W.u-$.vortex.u)*le,W.v-$.vortex.v)<.14){tt={type:"vortex",id:B.pointerId};return}let V=de.hit(W.u,W.v),re=V?null:Ze(W.u,W.v);Be={id:B.pointerId,x:B.clientX,y:B.clientY,u:W.u,v:W.v,visitorHit:V,rjHit:re,moved:!1},Me.u=W.u,Me.v=W.v,Me.active=!0,Me.until=ot+.75,!V&&!re&&k.addWaterImpulseUv(W.u,W.v,.02,-.36,C.rippleStrength),Re=W}),I.addEventListener("pointermove",B=>{let W=Ge(B,!0);if(pe.active){(!Le||Math.hypot((W.u-Le.u)*le,W.v-Le.v)>.008)&&(k.addWaterImpulseUv(W.u,W.v,.013,-.18,C.rippleStrength),Le=W);return}if(Le&&(Re=null,Le=null),Be&&Math.hypot(B.clientX-Be.x,B.clientY-Be.y)>7&&(Be.moved=!0),tt?.type==="vortex"){$.vortex.u=F(W.u,.08,.92),$.vortex.v=F(W.v,.08,.92);return}if(Me.u=W.u,Me.v=W.v,Me.active=!0,Me.until=ot+.65,!Re||Math.hypot((W.u-Re.u)*le,W.v-Re.v)>.008){Re&&de.pointer(W.u,W.v,W.u-Re.u,W.v-Re.v),k.addWaterImpulseUv(W.u,W.v,.013,-.18,C.rippleStrength);let V=H.uvToXZ(W.u,W.v),re=C.fleeRadius/.105*2.2;for(let ye of H.creatures)ye.isRay&&(ye.state==="swimming"||ye.state==="resting")&&Math.hypot(ye.x-V.x,ye.z-V.z)<re&&H.startleRay(ye,V.x,V.z,C.rippleStrength);Re=W}}),I.addEventListener("pointerup",B=>{let W=Be;if(Be=null,pe.active)return;if(!W||W.id!==B.pointerId||W.moved||Math.hypot(B.clientX-W.x,B.clientY-W.y)>=7){tt?.type==="vortex"&&(tt=null);return}if(W.visitorHit){de.interact(W.visitorHit.index),J&&J.playChime(3,.11);return}if(W.rjHit){let re=W.rjHit;if(re.species==="manta"||re.species==="eagle")H.triggerRayBreach(re,C.rippleStrength);else if(re.species==="stingray"){let ye=H.uvToXZ(W.u,W.v);H.startleRay(re,ye.x+.2,ye.z+.2,C.rippleStrength)}else re.phase=.02,re.speed=re.baseSpeed*2.4,k.addWaterImpulseUv(W.u,W.v,.016,-.24,C.rippleStrength),J&&J.playChime(1,.1);return}let V=j.interactAt(W.u,W.v,C.rippleStrength);V&&Z(V)}),I.addEventListener("pointercancel",()=>{Be=null,tt?.type==="vortex"&&(tt=null)}),I.addEventListener("pointerleave",()=>{Re=null,Le=null}),o("pointermove",B=>{if(tt&&(tt.type==="ray-card"||tt.type==="fish-card")){let W=Ge(B);if(Math.hypot(B.clientX-tt.startX,B.clientY-tt.startY)>6&&(tt.moved=!0),tt.u=W.u,tt.v=W.v,tt.type==="ray-card"&&tt.creature){let V=H.uvToXZ(W.u,W.v);tt.creature.x=V.x,tt.creature.z=V.z,tt.creature.y=2.35}}});function $e(B=!0){H.creatures.length=0,j.clearAll&&j.clearAll(),k.clearParticles(),Ee.cancel(),de.render(null,0),B&&(C.defaultCreaturesEnabled=0,C.silverCount=0,C.reefCount=0,C.clownCount=0,C.sharkCount=0,C.turtleCount=0,Ne(),gt(),N()),Ie(),Z("已清除海域所有生物")}function Fe(B){J.unlock(),B==="reset-population"?($e(!1),ee()):B==="whirl"?$.whirl=!$.whirl:B==="calm"?($.whirl=!1,$.whirlStrength=0,$.calmFactor=1):B==="clear"?($e(!0),Z("已清空海域生物")):B==="sound"?$.sound=J.toggleSound():B==="hide"&&($.hidden=!$.hidden,t.body.classList.toggle("hidden-ui",$.hidden)),t.querySelector('[data-action="whirl"]')?.setAttribute("aria-pressed",String($.whirl)),t.querySelector('[data-action="sound"]')?.setAttribute("aria-pressed",String($.sound));let W=t.querySelector("#vortex-label");W&&(W.style.display=$.whirl?"block":"none"),t.querySelector("#hint").textContent=$.whirl?"Whirlpool · drag its centre to move it":"Touch the water · drag a creature into the sea"}t.querySelectorAll("[data-action]").forEach(B=>{B.addEventListener("click",()=>Fe(B.dataset.action))}),t.querySelector("#restore").onclick=()=>Fe("hide"),o("keydown",B=>{if(B.repeat||B.ctrlKey||B.metaKey||/input|textarea|select/i.test(B.target.tagName))return;let W={w:"whirl",c:"calm",m:"sound",h:"hide"}[B.key.toLowerCase()];W&&(B.preventDefault(),Fe(W))});let st=[["开场 · 掠海入湾",[["introDuration","开场时长（秒）"],["introIntensity","镜头展开幅度"]]],["鱼群与生态互动",[["silverCount","银色鱼群数量"],["reefCount","珊瑚彩色鱼数量"],["clownCount","海葵小丑鱼数量"],["sharkCount","黑鳍礁鲨数量"],["turtleCount","绿海龟数量"],["fishSpeed","鱼类游动速度"],["fishSize","小鱼体型"],["schoolCohesion","鱼群聚集程度"],["fleeRadius","互动惊扰半径"]]],["水面反光与波浪",[["surfaceReflection","水面反射强度"],["sunGlint","太阳耀斑与高光亮度"],["foamIntensity","海浪与岸线泡沫"],["swell","自然涌浪强度"],["rippleStrength","互动波纹强度"],["waterSpeed","涌浪与焦散速度"]]],["水体光学与折射",[["clarity","海水通透度"],["caustics","水底焦散亮度"],["refractionScale","水底折射扭曲"],["shadowIntensity","生物水底阴影深度"]]],["海岸与海床地貌",[["beachSize","沙滩面积"],["coralDensity","珊瑚密度"],["grassDensity","海草密度"]]],["随机自然事件",[]]],ft=null;function ht(){r(ft),ft=i(()=>{if(k.rebuildSeabed({beachSize:C.beachSize,coralDensity:C.coralDensity,grassDensity:C.grassDensity}),te!==C.beachSize){te=C.beachSize;let B=x.recoveryReach(ne);k.oceanMaterial.uniforms.uRecoveryReach.value=B,k.waterSurfaceMaterial.uniforms.uRecoveryReach.value=B}},140)}function gt(){try{c.setItem(D,JSON.stringify(C))}catch{}}function N(){for(let B in C){let W=t.querySelector(\`[data-setting="\${B}"]\`);if(!W)continue;if(W.type==="checkbox"){W.checked=!!C[B];continue}W.value=C[B];let V=W.parentElement.querySelector("output");if(V){let re=z[B][2];V.textContent=Number(C[B]).toFixed(re===1?0:B==="fleeRadius"?3:2)}}we()}let Pe=["silverCount","reefCount","clownCount","sharkCount","turtleCount"],be;function Te(){r(be),be=i(()=>{if(k.rebuildSeabed({beachSize:C.beachSize,coralDensity:C.coralDensity,grassDensity:C.grassDensity}),te!==C.beachSize){te=C.beachSize;let B=x.recoveryReach(ne);k.oceanMaterial.uniforms.uRecoveryReach.value=B,k.waterSurfaceMaterial.uniforms.uRecoveryReach.value=B}},120)}function He(B,W,V=!0){if(!z[B])return;let[re,ye,Se]=z[B];C[B]=F(Se===1?Math.round(W):W,re,ye),B==="performanceMode"&&(M.setMode(C.performanceMode),We(),P("quality-selection")),B.startsWith("intro")&&pe.configure(ve()),Pe.includes(B)&&Ne(),B==="beachSize"&&k.setBeachSize(C.beachSize),(B==="coralDensity"||B==="grassDensity")&&Te(),V&&(B==="beachSize"||B==="coralDensity"||B==="grassDensity")&&ht(),V&&gt(),N()}let rt=t.querySelector("#parameter-fields");for(let[B,W]of st){let V=t.createElement("h3");V.textContent=B,rt.append(V);for(let[re,ye]of W){let Se=t.createElement("label");Se.textContent=ye;let Oe=t.createElement("output"),_e=t.createElement("input");_e.type="range",_e.min=z[re][0],_e.max=z[re][1],_e.step=z[re][2],_e.dataset.setting=re,_e.setAttribute("aria-label",ye),Se.append(Oe,_e),rt.append(Se),_e.addEventListener("input",()=>He(re,+_e.value,!1)),_e.addEventListener("change",()=>He(re,+_e.value,!0))}}t.querySelector('[data-setting="eventsEnabled"]').onchange=B=>{He("eventsEnabled",Number(B.target.checked))},t.querySelector('[data-setting="introEnabled"]').onchange=B=>{He("introEnabled",Number(B.target.checked))},t.querySelector("#replay-intro").onclick=()=>{A(!1),pe.replay(ve())},t.querySelectorAll("[data-preview]").forEach(B=>{B.onclick=()=>Qe(B.dataset.preview)});function A(B){t.querySelector("#parameters").hidden=!B,t.querySelector("#settings-toggle").setAttribute("aria-expanded",String(B))}t.querySelector("#settings-toggle").onclick=()=>{A(t.querySelector("#parameters").hidden)},t.querySelector("#settings-close").onclick=()=>A(!1),t.querySelector("#clear-ocean")?.addEventListener("click",()=>{$e(!0)}),t.querySelector("#reset-settings").onclick=()=>{Object.assign(C,E),pe.configure(ve()),H.creatures.length===0?ee():Ne(),k.setBeachSize(C.beachSize),ht(),gt(),N(),Z("已恢复默认参数")};function We(){j.setMigrationBudget(M.profile.migration),k.setParticleBudget(M.profile.particles)}We();let Xe=!1,De="initial",U={resizeRequests:0,bufferResizes:0,redundantResizes:0,qualityChanges:0,longFrames:0,maxFrameMs:0,lastFrameMs:0,lastResize:null};function P(B="viewport"){De=typeof B=="string"?B:"viewport",Xe=!0,U.resizeRequests++}function at(){Xe=!1;let B=l,W=h,V=M.pixelRatio(globalThis.devicePixelRatio,B,W);if(!(G!==B||oe!==W||q!==V)){U.redundantResizes++;return}let ye={width:I.width,height:I.height,pixelRatio:q},Se=q!==V;G=l,oe=h,le=G/oe,q=V,K.setDrawingBufferSize(G,oe,q),U.bufferResizes++,Se&&U.qualityChanges++,U.lastResize={reason:De,previous:ye,width:I.width,height:I.height,pixelRatio:q,frame:ue+1},X.left=-10*le,X.right=10*le,X.top=10,X.bottom=-10,X.updateProjectionMatrix(),k.resize(le),pe.resize()}o("resize",P),P(),k.setBeachSize(C.beachSize),ee(),N(),pe.replay(ve());let ot=0,it=0,pt=performance.now(),me=0,ue=0,Ae=!1;t.addEventListener("visibilitychange",()=>{Ae=t.hidden,pt=performance.now(),me=0,M.resetClock()});function Ce(B){if(n(Ce),Ae){pt=B;return}if(ue>0&&!M.shouldRender(B))return;Xe&&at();let W=Math.max(0,(B-pt)/1e3);pt=B;let V=Math.min(W,.05);pe.advance(W),ot+=V,it+=V*C.waterSpeed,ue++,U.lastFrameMs=Math.round(W*1e4)/10,U.maxFrameMs=Math.max(U.maxFrameMs,U.lastFrameMs),W>.05&&U.longFrames++,me+=V,Me.active&&ot>Me.until&&(Me.active=!1),$.calmFactor>0&&($.calmFactor=Math.max(0,$.calmFactor-V*1.4)),Ee.advance(V,C.eventsEnabled,W);let re=Ee.state;de.render(re.story,re.current?.id||0);let ye=Ue(),Se=(re.current?.seed||0)%1e3;I.style.pointerEvents=ye>=18?"none":"";let Oe=x.impact(ye);!R.matches&&(Oe.shakeX||Oe.shakeY)?(I.style.transform=\`translate(\${Oe.shakeX*Math.min(3,G*.0018)}px,\${Oe.shakeY*Math.min(3,oe*.0018)}px) scale(1.014)\`,T=!0):T&&(I.style.transform="",T=!1);let _e=\`\${re.current?.id||0}:\${re.story?.phase||re.current?.phase||""}:\${C.eventsEnabled}\`;if(Ve!==_e&&(Ve=_e,we()),!$.storm){let yt=$.whirl?1:0,Mt=$.whirl?.35:.65;$.whirlStrength=L($.whirlStrength,yt,F(V*Mt*3,0,1)),!$.whirl&&$.whirlStrength<.005&&($.whirlStrength=0)}let ge=0;for(;me>=1/60&&ge<3;)k.stepWaterSimulation(it,$.whirlStrength,$.vortex,$.calmFactor),me-=1/60,ge++;ge===3&&(me=0);let ze=k.getSwashState(it,C.swell);J.update(it,ze.phase,$.whirlStrength,C.beachSize),k.updateParticles(V);let ke=H.update(V,ot,{isWhirlpool:$.whirlStrength>.01,whirlStrength:$.whirlStrength,whirlpoolUv:$.vortex,swimSpeedMult:C.fishSpeed,rippleStrengthMult:C.rippleStrength,waterClarity:F(C.clarity*.78,.15,1),causticsIntensity:C.caustics,meteorAge:ye}),nt=j.update(V,ot,{settings:{...C,fleeRadius:C.fleeRadius/.105},pointerUv:Me,isWhirlpool:$.whirlStrength>.01,whirlStrength:$.whirlStrength,whirlpoolUv:$.vortex,meteorAge:ye,shadowOffset:ke}),je=k.getHeightMapTexture(),Ye=F(C.clarity*.78,.15,1),et=ye>=0?x.state(ye):{dry:0,recovery:0},Ke=k.oceanMaterial.uniforms;Ke.uHeightMap.value=je,Ke.uTime.value=it,Ke.uSwellTime.value=it,Ke.uSwashRunup.value=ze.runup,Ke.uWetReach.value=Math.max(.12,ze.runup*.18+.12),Ke.uWhirlpool.value.set($.vortex.u,$.vortex.v,$.whirlStrength,it),Ke.uCreatureCount.value=Math.min(nt,M.profile.shadows),Ke.uWaterClarity.value=Ye,Ke.uCausticsIntensity.value=C.caustics,Ke.uRefractionScale.value=C.refractionScale,Ke.uShadowIntensity.value=C.shadowIntensity,Ke.uSwellScale.value=C.swell,Ke.uBeachSize.value=C.beachSize,Ke.uDry.value=et.dry||0,Ke.uRecoveryFront.value=et.recovery||0;let mt=k.waterSurfaceMaterial.uniforms;if(mt.uHeightMap.value=je,mt.uTime.value=it,mt.uSwellTime.value=it,mt.uSwashRunup.value=ze.runup,mt.uWhirlpool.value.set($.vortex.u,$.vortex.v,$.whirlStrength,it),mt.uSwellScale.value=C.swell,mt.uBeachSize.value=C.beachSize,mt.uSurfaceReflection.value=C.surfaceReflection,mt.uSunGlintIntensity.value=C.sunGlint,mt.uFoamIntensity.value=C.foamIntensity,mt.uDry.value=et.dry||0,mt.uRecoveryFront.value=et.recovery||0,K.setRenderTarget(null),K.clear(),s.offscreen){let yt=T?1.014:1,Mt=T?Oe.shakeX*Math.min(3,G*.0018):0,At=T?Oe.shakeY*Math.min(3,oe*.0018):0;K.setViewport(Mt-G*(yt-1)/2,-At-oe*(yt-1)/2,G*yt,oe*yt)}K.render(se,X),de.renderSurface(K,X),ie.render(K,ye,le,re.current?.seed||1,M.profile.particles),ue===1&&(s.firstFrame(),pt=performance.now(),t.querySelector("#loading")?.remove());let wt=t.querySelector("#vortex-label");$.whirlStrength>.05&&wt?(wt.style.display="block",wt.style.opacity=String(F(($.whirlStrength-.05)*2.5,0,1)),wt.style.left=\`\${$.vortex.u*G}px\`,wt.style.top=\`\${(1-$.vortex.v)*oe-28}px\`):wt&&!$.whirl&&(wt.style.display="none"),M.observe(W)&&(We(),P("automatic-quality"))}n(Ce),e.ocean={disposeScene(){pe.dispose(),Ee.cancel(),de.dispose(),J.enabled=!1,J.ctx&&J.ctx.close().catch(()=>{})},addCreature(B,W=.5,V=.5){let re=ct.find(Se=>Se.kind===B);if(!re)throw Error("Unknown marine species");let ye=ce(W,V);if(re.isFish)j.spawnFromDock(B,ye.u,ye.v,C),gt();else{if(H.creatures.length>=O)throw Error("Marine creature limit reached (48)");let Se=H.uvToXZ(ye.u,ye.v);H.spawnCreature(B,{x:Se.x,y:1.6,z:Se.z,state:"falling"})}Ie()},glError:()=>K.getContext().getError(),frameCount:()=>ue,audioSuspend(){J.ctx&&J.ctx.suspend().catch(()=>{})},audioResume(){J.ctx&&J.enabled&&J.ctx.resume().catch(()=>{})},get stats(){let B=H.getCounts(),W=j.getCounts();return{version:"2.0.0",events:{...Ee.schedule(),active:Ee.state.current?.type??null},three:b.REVISION,rays:B.rays,jellies:B.jellies,fish:W.fish,sharks:W.sharks,turtles:W.turtles,quality:q,performance:{...M.snapshot(),drawingWidth:I.width,drawingHeight:I.height,migrationFish:W.migration},presentation:{...U,pendingResize:Xe,pendingResizeReason:Xe?De:null},time:ot,state:{whirl:$.whirl,sound:$.sound}}},action:Fe,intro:{replay:()=>pe.replay(ve()),skip:()=>pe.finish(),snapshot:()=>pe.snapshot()},parameters:()=>({...C}),setParameter:He,previewEvent:Qe,cancelEvent:()=>{Ee.cancel(),de.render(null,0),we()},shore:ne,state:$,reefEcosystem:j,raysAndJellies:H,waterSystem:k}})(),e.ocean}var Tp=\`
<canvas id="sea" aria-label="Interactive tropical lagoon. Move to ripple the water and gently chase fish. Click a creature for its special action."></canvas>
<div id="intro-title" hidden aria-hidden="true"><span>O C E A N &nbsp; S H A L L O W S</span><b>浅海来信</b><i></i></div>

<header class="ui">
  <h1>Ocean Shallows</h1>
  <p>A tropical lagoon · seen from above</p>
  <span id="count">4 rays · 5 jellies · 2 turtles · 90 fish · 2 sharks</span>
</header>

<div id="hint" class="glass ui">Touch the water · drag a creature into the sea</div>
<div id="dock" class="glass ui" aria-label="Add a marine creature"></div>
<button id="dock-prev" class="dock-arrow ui" aria-label="上一组生物">‹</button>
<button id="dock-next" class="dock-arrow ui" aria-label="下一组生物">›</button>

<nav id="controls" class="glass ui" aria-label="Lagoon controls">
  <button id="settings-toggle" aria-expanded="false" aria-controls="parameters">参数调节 <span>☷</span></button>
</nav>

<div id="credit" class="ui">
  An independently coded ocean study.<br>
  Prompt reference: <a href="https://github.com/Jehuge/prompt-collection/blob/main/prompts/ocean-shallows.md" target="_blank" rel="noreferrer">Jehuge / prompt-collection</a>
</div>

<aside id="parameters" class="glass ui" hidden aria-label="浅海参数面板">
  <div class="panel-head">
    <h2>浅海 · 参数</h2>
    <button id="settings-close" aria-label="关闭参数面板">✕</button>
  </div>
  <label class="event-toggle"><input type="checkbox" data-setting="introEnabled" aria-label="启用开场动画">启用开场动画</label>
  <button id="replay-intro">重播开场动画</button>
  <p>镜头从真实海床近景沿弧线缓缓拉远，展开完整海湾。下方可调时长与镜头幅度，重播可立即预览。</p>
  <div id="parameter-fields"></div>
  <label class="event-toggle">
    <input type="checkbox" data-setting="eventsEnabled" aria-label="启用随机事件">启用随机事件
  </label>
  <p id="event-status" role="status"></p>
  <div class="event-previews" aria-label="预览随机事件">
    <button data-preview="school">鱼群穿境</button>
    <button data-preview="storm">海原风暴 · 36s</button>
    <button data-preview="dolphin">好奇的海豚</button>
    <button data-preview="duo">海绵宝宝与派大星</button>
    <button data-preview="meteor">巨陨归潮 · 稀有</button>
  </div>
  <p>四种常规事件随机轮换（鱼群穿境、海原风暴、好奇海豚、海绵宝宝与派大星），每次一种。海原风暴持续 36 秒，微小旋涡逐渐酝酿扩大为引力巨涡，持续牵引海洋生灵汇聚风眼，并按体积分层永续同心回旋。极稀有「巨陨归潮」：自动开启满 10 分钟后每次抽选 1%，触发后冷却 30 分钟；可手动预览。关闭自动事件后本次自然结束；预览按钮仍可使用。</p>
  <button id="clear-ocean" class="clear-btn">清除海域所有生物</button>
  <button id="reset-settings" class="reset">恢复默认参数</button>
  <p>参数自动保存。沙滩面积：0 无沙滩，1 原大小，2 扩大；调整后同步更新海岸与海床。密度松开滑块后更新。</p>
</aside>

<button id="restore" class="glass">Show UI · H</button>
<div id="notice" role="status"></div>

<div id="loading"><b>Ocean Shallows</b><span>Growing a little reef…</span></div>

\`,Ep=\`
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#174f69;color:#f1fcfa;font-family:'Nunito Sans',sans-serif}
#sea{display:block;width:100%;height:100%;touch-action:none}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,a:focus-visible{outline:2px solid #fff;outline-offset:5px}
.glass{background:linear-gradient(145deg,#e5ffff30,#c5f7ff12);border:1px solid #e8ffff55;box-shadow:0 10px 45px #062c4933,inset 0 1px #ffffff35;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
header{position:absolute;right:35px;top:25px;text-align:right;pointer-events:none;text-shadow:0 2px 14px #09355277;z-index:4}
h1{font:italic 38px/1.1 'Fraunces',serif;margin:0 0 8px}
header p{font-size:9px;letter-spacing:2.3px;margin:0 0 14px;text-transform:uppercase}
#count{font-size:11px;padding:7px 13px;border-radius:30px;background:#123d6755;display:inline-block}
#hint{position:absolute;left:50%;top:24px;transform:translateX(-50%);padding:9px 17px;border-radius:30px;font-size:11px;white-space:nowrap;pointer-events:none;transition:opacity .4s;z-index:4}
#dock{position:absolute;left:calc(50% - 70px);bottom:24px;transform:translateX(-50%);display:flex;gap:5px;padding:8px;border-radius:23px;max-width:calc(100% - 195px);overflow-x:auto;scrollbar-width:thin;z-index:4}
.card{flex:0 0 86px;width:86px;padding:0 5px 10px;border:1px solid transparent;border-radius:16px;background:#c1f4f90a;touch-action:none;user-select:none;transition:background .2s,transform .2s;text-align:center}
.card:hover{background:#d6fffd33;transform:translateY(-4px);border-color:#e1ffff44}
.card img{display:block;width:74px;height:65px;margin:0 auto;object-fit:contain;pointer-events:none}
.card strong{display:block;font-size:10px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card small{display:block;font-size:7px;letter-spacing:.8px;opacity:.68;margin-top:4px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#controls{position:absolute;right:25px;bottom:25px;border-radius:19px;padding:4px;display:flex;z-index:4}
#controls button{border:0;border-radius:15px;background:none;text-align:center;padding:10px 16px;font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600}
#controls button:hover{background:#dfffff22}
#controls button[aria-pressed=true],#controls button[aria-expanded=true]{background:#e8fffae8;color:#155d6e;box-shadow:0 2px 9px #062b4720}
kbd{font:9px 'Nunito Sans',sans-serif;border:1px solid currentColor;opacity:.5;border-radius:4px;padding:0 4px}
#credit{position:absolute;left:20px;bottom:180px;font-size:9px;color:#dcffffaa;max-width:180px;line-height:1.7;z-index:3}
#credit a{color:inherit}
#restore{display:none;position:absolute;right:15px;bottom:15px;border-radius:24px;padding:10px 16px;z-index:6}
body.hidden-ui .ui{display:none!important}
body.hidden-ui #restore{display:block}
#loading{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-content:center;text-align:center;z-index:10;pointer-events:none;text-shadow:0 2px 14px #062c49}
#loading b{font:italic 26px 'Fraunces',serif}
#loading span{font-size:12px;margin-top:14px;opacity:.7}
#intro-title{position:fixed;inset:0;display:grid;align-content:center;justify-items:center;gap:17px;text-align:center;pointer-events:none;z-index:7;color:#e5f8ee;text-shadow:0 2px 24px #063d4a66;will-change:opacity,transform}
#intro-title[hidden]{display:none}
#intro-title span{font-size:9px;letter-spacing:5px;text-indent:5px;opacity:.65}
#intro-title b{font:400 clamp(28px,5vw,46px)/1.4 'Fraunces','Songti SC','SimSun',serif;letter-spacing:.22em;text-indent:.22em}
#intro-title i{width:38px;height:1px;background:linear-gradient(90deg,transparent,#c9e9da99,transparent)}
body.intro-pending .ui{opacity:0;pointer-events:none}
body.intro-active header,body.intro-active #hint,body.intro-active #credit{opacity:var(--intro-ui,0)}
body.intro-active #dock,body.intro-active #controls,body.intro-active .dock-arrow{opacity:var(--intro-ui,0);translate:0 calc((1 - var(--intro-ui,0)) * 14px)}
body.intro-blocked .ui,body.intro-blocked #sea{pointer-events:none}
@media(prefers-reduced-motion:reduce){#intro-title{display:none}body.intro-pending .ui{opacity:1}}
#notice{position:absolute;left:50%;top:65px;transform:translateX(-50%);font-size:12px;text-shadow:0 1px 6px #000;pointer-events:none;z-index:5;transition:opacity .25s}
#vortex-label{position:absolute;pointer-events:none;transform:translate(-50%,-50%);font-size:10px;opacity:.78;display:none;z-index:3;text-shadow:0 1px 4px #032030;background:#0a354888;padding:4px 9px;border-radius:999px;border:1px solid #aef6ff44}
#parameters{position:absolute;right:174px;top:115px;bottom:180px;width:300px;border-radius:18px;padding:18px;overflow:auto;background:linear-gradient(145deg,#123b4bef,#0c2838ee);z-index:5;color-scheme:dark;scrollbar-width:thin;scrollbar-color:#6d9b9b transparent}
#parameters[hidden]{display:none}
#parameters h2{font-size:16px;margin:0 0 18px}
#parameters h3{font-size:11px;letter-spacing:1px;color:#9acbc7;margin:22px 0 13px}
#parameters label{display:block;font-size:11px;margin:13px 0}
#parameters output{float:right;color:#bdeee0;font-variant-numeric:tabular-nums}
#parameters input{width:100%;accent-color:#a1e3d1;display:block;margin-top:9px}
#parameters button{background:#ffffff16;border:1px solid #ffffff30;border-radius:8px;padding:7px 10px;font-size:11px;transition:background .15s}
#parameters button:hover{background:#ffffff2b}
#parameters .panel-head{display:flex;justify-content:space-between;align-items:baseline}
#parameters p{font-size:10px;color:#a3bdbd;line-height:1.6}
#parameters .clear-btn{width:100%;margin:16px 0 0;background:rgba(235,87,87,0.18);border:1px solid rgba(235,87,87,0.42);color:#ffc2c2;font-weight:500;cursor:pointer}
#parameters .clear-btn:hover{background:rgba(235,87,87,0.32);border-color:rgba(235,87,87,0.70);color:#ffffff}
#parameters .reset{width:100%;margin:8px 0 0}
#parameters .event-toggle{display:flex;align-items:center;gap:9px}
#parameters .event-toggle input{width:16px;height:16px;margin:0}
#parameters .event-previews{display:flex;gap:5px;flex-wrap:wrap}
#parameters .event-previews button{flex:1;padding:8px 5px;white-space:nowrap}
#event-status{min-height:16px;color:#c9f5ec!important}
.dock-arrow{display:none}
@media(max-width:760px){
  header{right:18px;top:20px}
  h1{font-size:29px}
  header p{font-size:7px;letter-spacing:1.5px}
  #hint{top:120px;font-size:10px}
  #dock{left:50%;bottom:18px;gap:0;padding:5px;width:calc(100% - 20px);max-width:calc(100% - 20px);border-radius:18px}
  .card{flex-basis:79px;width:79px;padding:0 1px 8px}
  .card img{width:67px;height:61px}
  .card strong{font-size:8px}
  .card small{font-size:6px;letter-spacing:.2px}
  #controls{right:10px;bottom:155px;width:auto}
  #controls button{font-size:10px;padding:7px 8px}
  #credit{left:12px;bottom:150px;font-size:8px;max-width:135px}
  #count{font-size:10px}
  #parameters{right:10px;top:160px;bottom:155px;width:min(300px,calc(100% - 20px))}
  .dock-arrow{display:block;position:absolute;z-index:5;bottom:74px;width:25px;height:34px;border-radius:12px;background:#174658c9;border:1px solid #c6fff84a}
  #dock-prev{left:10px}
  #dock-next{right:10px}
}
\`;var I1=/(token|cookie|password|secret|credential|authorization|apikey)/i,F1=/^(content|text|body|prompt|messages|title|filename|name|raw|data|database64|commandline|sessionid|accountid|threadid|projectid)$|(?:path|url|uri)$/i;function Ai(s){return s.slice(0,8e3).replace(/\\b[A-Za-z][A-Za-z0-9+.-]*:\\/\\/[^\\s"'<>]+/g,t=>{try{let n=new URL(t);if(["127.0.0.1","localhost","[::1]"].includes(n.hostname)&&!n.username&&!n.password&&["/json/version","/json/list","/"].includes(n.pathname))return\`\${n.origin}\${n.pathname}\`}catch{}return"[url]"}).replace(/(?:\\b[A-Za-z]:[\\\\/]|\\\\\\\\|\\/(?:Users|home|tmp|var|etc|opt|mnt)\\/|~\\/)[^\\r\\n"'<>]*/g,"[path]").replace(/\\b(?:Bearer\\s+\\S+|(?:authorization|password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|cookie)\\s*[:=]\\s*[^,;\\r\\n]+)/gi,"[credential]").replace(/\\bsk-[A-Za-z0-9_-]{8,}|\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/g,"[credential]").replace(/\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/g,"[email]").slice(0,4e3)+(s.length>8e3?" [truncated]":"")}function Cp(s){let e=256,t=new WeakSet,n=(i,r)=>{if(--e<0||r>6)return"[truncated]";if(typeof i=="string")return Ai(i);if(i===null||typeof i=="boolean"||typeof i=="number")return i;if(typeof i!="object")return"[unsupported]";if(t.has(i))return"[circular]";if(t.add(i),i instanceof Error)return{name:Ai(i.name),message:Ai(i.message)};if(Array.isArray(i))return i.slice(0,128).map(o=>n(o,r+1));let a=Object.create(null);for(let[o,c]of Object.entries(i).slice(0,128)){let l=o.replace(/[^a-z0-9]/gi,"");a[Ai(o).slice(0,160)]=I1.test(l)||F1.test(l)?"[redacted]":n(c,r+1)}return a};try{return n(s,0)}catch{return{redactionFailed:!0}}}var B1=Symbol.for("code-codex:runtime-events:v1"),k1=window,Bl=k1[B1]??={events:[],dropped:0};function Pp(s,e,t,n={}){let i={source:Ai(s).slice(0,160),action:Ai(e).slice(0,160),outcome:Ai(t).slice(0,160),details:{...Cp(n),observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}},r=new TextEncoder().encode(JSON.stringify(i)).length;r>7e3&&(i.details={truncated:!0,originalBytes:r,observedAt:Date.now(),documentElapsedMs:Math.round(performance.now())}),Bl.events.push(i),Bl.events.length>1e3&&(Bl.events.splice(0,200),Bl.dropped+=200)}var N1=Symbol.for("code-codex:background-startup-hold:v1");function Fu(){let s=window;return s[N1]??={active:!1,layers:new Set,next:-1,pending:new Map,painted:new WeakSet,openings:new WeakMap}}function U1(s){return s.closest("[data-code-codex-particle-layer]")}function O1(s,e){e.native=requestAnimationFrame(t=>{let n=Fu();e.native=void 0,n.pending.has(s)&&(n.active&&n.painted.has(e.layer)||(n.pending.delete(s),n.active&&(n.painted.add(e.layer),n.layers.add(e.layer),Pp("background-opening","initial frame","prepared")),e.callback(t)))})}function Lp(s,e){let t=U1(s);if(!t)return requestAnimationFrame(e);let n=Fu(),i=n.next--,r={layer:t,callback:e};return n.pending.set(i,r),O1(i,r),i}function Bu(s){if(s>=0){cancelAnimationFrame(s);return}let e=Fu(),t=e.pending.get(s);t?.native!==void 0&&cancelAnimationFrame(t.native),e.pending.delete(s)}function Rp(s,e,t,n,i,r){let a=new ku(s,e,t,n,i);a.eventHooks=r;try{if(wp(a),a.api=Ap(a),!a.api)throw Error("Scene initialization did not return its API");a.start()}catch(o){a.fail(o)}return a}var ku=class{disposed=!1;active=!0;api;onSize;frames=new Map;timers=new Set;resources=new Set;events=new Map;sequence=0;first=!1;shown=!0;paused=!1;constructor(e,t,n,i,r){this.offscreen=typeof OffscreenCanvas=="function"&&t instanceof OffscreenCanvas,this.target=e,this.canvas=t,this.onError=i,this.onSettings=r,this.abort=new AbortController,this.ready=new Promise((u,d)=>{this.resolve=u,this.reject=d}),this.shell=globalThis.document.createElement("div"),this.shell.style.cssText="position:absolute;inset:0;pointer-events:none;overflow:hidden",e.append(this.shell);let a=this.shell.attachShadow({mode:"open"}),o=globalThis.document.createElement("style");o.textContent=Ep.replace(/\\bbody\\b/g,".scene-body")+\`
:host{display:block;width:100%;height:100%}.scene-body{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#174f69}.scene-body>.ui,.scene-body>#notice,.scene-body>#loading,.scene-body>#restore,.scene-body>#vortex-label{display:none!important}#sea{position:absolute;inset:0;display:block;width:100%;height:100%}\`,this.body=globalThis.document.createElement("div"),this.body.className="scene-body",this.body.innerHTML=Tp,a.append(o,this.body),this.body.querySelector("#sea").replaceWith(t),t.id="sea",t.setPointerCapture=()=>{},t.releasePointerCapture=()=>{},this.matchMedia=globalThis.matchMedia.bind(globalThis),this.motion=this.matchMedia("(prefers-reduced-motion: reduce)");let c=this;this.document={body:this.body,createElement:globalThis.document.createElement.bind(globalThis.document),querySelector:u=>a.querySelector(u),querySelectorAll:u=>a.querySelectorAll(u),get hidden(){return!c.active},addEventListener:(u,d)=>this.listen(u,d)};let l={};for(let[u,d]of Object.entries(Du))l[u]=typeof d=="function"&&!d.prototype?.isScene&&(u==="WebGLRenderer"||typeof d.prototype?.dispose=="function")?new Proxy(d,{construct(f,p,y){let x=Reflect.construct(f,p,y);c.resources.add(x);let v=x.dispose;return x.dispose=function(...g){return c.resources.delete(x),v.apply(this,g)},x}}):d;this.window={THREE:l,AudioContext:globalThis.AudioContext,webkitAudioContext:globalThis.webkitAudioContext,get innerWidth(){return c.width},get innerHeight(){return c.height}},this.localStorage={getItem:()=>JSON.stringify(n),setItem:(u,d)=>{try{this.onSettings?.(JSON.parse(d))}catch(f){this.fail(f)}}},this.requestAnimationFrame=u=>{let d=++this.sequence;return this.frames.set(d,{fn:u,handle:0}),this.schedule(d),d},this.setTimeout=(u,d)=>{let f=globalThis.setTimeout(()=>{if(this.timers.delete(f),!this.disposed)try{u()}catch(p){this.fail(p)}},d);return this.timers.add(f),f},this.clearTimeout=u=>{globalThis.clearTimeout(u),this.timers.delete(u)},this.addEventListener=(u,d)=>{u==="resize"&&this.listen(u,d)},this.resize=new ResizeObserver(()=>{this.onSize?.(),this.emit("resize")}),this.resize.observe(e),this.intersection=new IntersectionObserver(u=>{this.shown=u[0]?.isIntersecting??!0,this.refreshActivity()}),this.intersection.observe(e);let h=this.abort.signal;globalThis.document.addEventListener("visibilitychange",()=>this.refreshActivity(),{signal:h}),this.motion.addEventListener("change",()=>this.refreshActivity(),{signal:h}),t.addEventListener("webglcontextlost",u=>{u.preventDefault(),this.fail(new Error("WebGL context was lost. Disable and enable the background to retry."))},{signal:h}),this.deadline=globalThis.setTimeout(()=>this.fail(new Error("Scene did not render its first frame within 30 seconds")),3e4)}get width(){return Math.max(1,this.target.clientWidth)}get height(){return Math.max(1,this.target.clientHeight)}listen(e,t){let n=this.events.get(e)??[];n.push(t),this.events.set(e,n)}emit(e){for(let t of this.events.get(e)??[])t()}schedule(e){let t=this.frames.get(e);!t||t.handle||this.disposed||!this.active||(t.handle=Lp(this.target,n=>{if(this.frames.delete(e),!this.disposed&&this.active)try{t.fn(n)}catch(i){this.fail(i)}}))}refreshActivity(){let e=!globalThis.document.hidden&&this.shown&&(!this.first||!this.paused&&!this.motion.matches);if(e!==this.active){if(this.active=e,!e){for(let t of this.frames.values())Bu(t.handle),t.handle=0;this.api?.audioSuspend()}if(this.emit("visibilitychange"),e){this.api?.audioResume();for(let t of this.frames.keys())this.schedule(t)}}}firstFrame(){this.first||(this.first=!0,globalThis.clearTimeout(this.deadline),this.resolve(),queueMicrotask(()=>this.refreshActivity()))}start(){this.refreshActivity()}setPaused(e){this.paused=e,this.refreshActivity()}fail(e){if(this.disposed)return;let t=new Error("SHALLOW_OCEAN_RENDER_FAILED: "+String(e?.message??e));this.reject(t),this.onError?.(t.message),this.dispose()}setParameters(e){if(this.disposed)return;let t=this.api.parameters();for(let[n,i]of Object.entries(e))t[n]!==i&&this.api.setParameter(n,i,!1)}replay(){this.emit("visibilitychange"),this.api?.intro.replay()}snapshot(){return this.api?{...this.api.stats,parameters:this.api.parameters(),intro:this.api.intro.snapshot(),frames:this.api.frameCount(),glError:this.api.glError(),paused:!this.active,resourceCount:this.resources.size}:null}dispose(){if(this.disposed)return;this.disposed=!0,globalThis.clearTimeout(this.deadline),this.abort.abort(),this.resize.disconnect(),this.intersection.disconnect();for(let t of this.frames.values())Bu(t.handle);this.frames.clear();for(let t of this.timers)globalThis.clearTimeout(t);this.timers.clear();try{this.api?.disposeScene()}catch{}this.api=void 0,delete this.window.ocean,this.reject(new DOMException("Scene disposed","AbortError"));let e=[...this.resources].filter(t=>typeof t.forceContextLoss=="function"&&typeof t.getContext=="function");for(let t of this.resources)if(!e.includes(t))try{t.dispose()}catch{}for(let t of e){try{t.dispose()}catch{}try{t.forceContextLoss()}catch{}}this.resources.clear(),this.events.clear(),this.shell.remove()}};var is=class s extends EventTarget{style={setProperty(){},removeProperty(){}};dataset={};children=[];hidden=!1;classes=new Set;classList={add:(...e)=>e.forEach(t=>this.classes.add(t)),remove:(...e)=>e.forEach(t=>this.classes.delete(t)),toggle:(e,t)=>{let n=t??!this.classes.has(e);return n?this.classes.add(e):this.classes.delete(e),n},contains:e=>this.classes.has(e)};static sea;slots=new Map;parentElement=this;append(...e){for(let t of e)t.parentElement=this,this.children.push(t)}appendChild(e){return this.append(e),e}querySelector(e){return e==="#sea"?s.sea:(this.slots.has(e)||this.slots.set(e,new s),this.slots.get(e))}querySelectorAll(){return[]}attachShadow(){return this}setAttribute(){}getAttribute(){return null}remove(){}replaceWith(){}scrollBy(){}},Nu=["addCreature","previewEvent","action","cancelEvent","includeEvents"];function Uu(s,e,t,n){let i=globalThis.document;is.sea=e,i.createElement=f=>f==="canvas"?new OffscreenCanvas(1,1):new is;let r=new is,a=new is;r.attachShadow=()=>a;let o=i.createElement,c=0;i.createElement=f=>f==="div"&&c++===0?r:o(f),a.slots.set("#sea",e);let l=s.append;s.append=()=>{};let h=["school","dolphin","storm","meteor","duo"],u;for(let f of["pointerdown","pointerup"])e.addEventListener(f,p=>{u?.api?.intro.snapshot().active&&p.stopImmediatePropagation()});u=Rp(s,e,t,n,void 0,{included:()=>h,started:f=>si("ocean-event",f)}),u.pointerOrigin=()=>e.getBoundingClientRect(),s.append=l,u.ready.catch(()=>{});let d=setInterval(()=>{let f=u.snapshot();f&&si("ocean-snapshot",f)},1e3);return{setSettings(f){u.setParameters(f),si("ocean-snapshot",u.snapshot())},replay(){u.replay(),si("ocean-opening",u.api.intro.snapshot())},addCreature(f,p,y){return u.api?.addCreature(f,p,y),u.snapshot()},previewEvent(f){u.api?.previewEvent(f),si("ocean-snapshot",u.snapshot())},action(f){u.api?.action(f),si("ocean-snapshot",u.snapshot())},cancelEvent(){u.api?.cancelEvent(),si("ocean-snapshot",u.snapshot())},includeEvents(f){h=f},dispose(){clearInterval(d),u.dispose()}}}var ka=globalThis,kl="",zp=0,Dp=!1,tr,Vn,Ou=0,Ip=!1,Fp=0,Hn=(s,e={})=>ka.postMessage({v:1,session:kl,type:s,...e}),Nl=s=>Hn("failed",{code:"BG_WORKER_RENDER_FAILED",message:String(s instanceof Error?s.message:s).slice(0,1500)});ka.addEventListener("error",s=>Nl(s.error??s.message));ka.addEventListener("unhandledrejection",s=>Nl(s.reason));ka.addEventListener("message",s=>{let e=s.data;if(!(Dp||!e||e.v!==1||typeof e.session!="string"))try{if(e.type==="init"){if(kl||!(e.canvas instanceof OffscreenCanvas)||e.session.length>100)throw Error("BG_INIT_INVALID: Invalid or duplicate background initialization.");kl=e.session,Hu((n,i)=>Hn("event",{event:n,value:Ga(i)}));let t=Gl(e.viewport,e.viewport.dpr);Vn=Wu(e.canvas,t,()=>{Ou++,Ip||(Ip=!0,Hn("first-frame",{frames:Ou}),e.held===!0&&queueMicrotask(()=>Vn?.visibility(!1)));let n=performance.now();n-Fp>=1e3&&(Fp=n,Hn("sample",{frames:Ou,at:n}))}),Vn.motion(e.reduced===!0),tr=Uu(Vn.host,Vn.canvas,ir(e.settings),n=>{n&&Nl(n)});return}if(e.session!==kl||!Number.isSafeInteger(e.seq)||e.seq<=zp)return;if(zp=e.seq,e.type==="state"){if(e.settings!==void 0){let t=ir(e.settings);tr.setSettings?tr.setSettings(t):tr.updateSettings?.(t)}if(e.viewport&&Vn?.viewport(Gl(e.viewport,e.viewport.dpr)),typeof e.reduced=="boolean"&&Vn?.motion(e.reduced),typeof e.visible=="boolean"&&Vn?.visibility(e.visible),e.input){let{type:t,...n}=e.input;if(!["pointermove","pointerdown","pointerup","pointercancel","pointerleave","wheel","keydown"].includes(t))throw Error("BG_INPUT_METHOD: Unsupported background input.");Vn?.input(t,ir(n))}Hn("ack",{seq:e.seq});return}if(e.type==="replay"){tr.replay?.(),Hn("ack",{seq:e.seq});return}if(e.type==="call"){if(typeof e.method!="string"||!Nu.includes(e.method)||!Array.isArray(e.args)||e.args.length>8||!Number.isSafeInteger(e.callId))throw Error("BG_KERNEL_COMMAND: The visual kernel command is not supported.");let t=Ga(e.args);Hn("ack",{seq:e.seq}),Promise.resolve().then(()=>tr[e.method](...t)).then(n=>Hn("result",{callId:e.callId,value:Ga(n??null)}),n=>Hn("result",{callId:e.callId,error:String(n).slice(0,1500)}));return}if(e.type==="dispose"){Dp=!0;try{tr?.dispose()}finally{Vn?.dispose(),Hn("disposed"),setTimeout(()=>ka.close(),0)}return}throw Error("BG_WORKER_METHOD: Unsupported background command.")}catch(t){Nl(t)}});})();
`,...r)}},ce=Symbol.for("code-codex:background-modules:v1");(window[ce]??=new Map).set("shallow-ocean",{id:"shallow-ocean",api:1,version:"1.0.17",exports:{ShallowOceanRenderer:Z},startup(r,i){let n=document.createElement("canvas");return n.style.cssText="width:100%;height:100%;display:block",r.append(n),new Z(r,n,Y(),i,!1)}});})();
