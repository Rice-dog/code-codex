// Test-only instrumentation. Prepends GL probes to unchanged production worker
// source in isolated fixtures, mirroring the existing main-context GL probes.
export const workerGLProbe = `(()=>{
 const NativeWorker=Worker,create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
 window.Worker=class extends EventTarget{
  constructor(url,options){super();this.queue=[];this.dead=false;
   const label=window.fixtureCaseLabel??document.querySelector('[data-fixture-case]')?.dataset.fixtureCase??'unassigned';
   const blocked=window.fixtureBlockWebgl2===true;
   fetch(url).then(r=>r.text()).then(source=>{
    if(this.dead)return;
    const probe='('+(${function(blocked){
     let draws=0;const uniforms={},names=new WeakMap();
     if(blocked){const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args);};}
     for(const proto of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){
      const get=proto.getUniformLocation;proto.getUniformLocation=function(...args){const value=get.apply(this,args);if(value)names.set(value,args[1]);return value;};
      for(const name of ['uniform1f','uniform1i','uniform2f','uniform3f','uniform4f']){const fn=proto[name];proto[name]=function(location,...values){const key=names.get(location);if(key)uniforms[key]=values;return fn.call(this,location,...values);};}
      for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){const fn=proto[name];if(!fn)continue;proto[name]=function(...args){const result=fn.apply(this,args);draws++;const samples=[];if(draws<4){const rgba=new Uint8Array(4);for(let y=1;y<=5;y++)for(let x=1;x<=5;x++){this.readPixels(Math.floor(this.drawingBufferWidth*x/6),Math.floor(this.drawingBufferHeight*y/6),1,1,this.RGBA,this.UNSIGNED_BYTE,rgba);samples.push([...rgba]);}}postMessage({__fixtureGL:true,draws,uniforms,samples});return result;};}
     }
    }.toString()})+')('+JSON.stringify(blocked)+');';
    const own=create(new Blob([probe,source],{type:'text/javascript'}));this.worker=new NativeWorker(own,options);revoke(own);
    this.worker.addEventListener('message',e=>{if(e.data?.__fixtureGL){window.fixtureDraws[label]=e.data.draws;window.fixtureUniforms[label]=e.data.uniforms;if(e.data.samples.length)window.fixturePixelSamples[label]=e.data.samples;return;}this.dispatchEvent(new MessageEvent('message',{data:e.data}));});
    this.worker.addEventListener('error',e=>this.dispatchEvent(new ErrorEvent('error',{message:e.message})));
    for(const args of this.queue)this.worker.postMessage(...args);this.queue=[];
   }).catch(e=>this.dispatchEvent(new ErrorEvent('error',{message:String(e)})));
  }
  postMessage(...args){if(this.worker)this.worker.postMessage(...args);else this.queue.push(args);}
  terminate(){this.dead=true;this.queue=[];this.worker?.terminate();}
 };
})();`;
