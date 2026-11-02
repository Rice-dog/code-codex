import {build} from 'esbuild';
import {resolve} from 'node:path';
/** Worker bytes are embedded in the containing hash-verified plugin. They never
 * come from an unpinned URL and are part of that package's exact input closure. */
export async function buildBackgroundWorker(root,options,module,renderer,factory){
 const result=await build({...options,sourcemap:false,write:false,metafile:true,minify:true,format:'iife',
  entryPoints:[resolve(root,'src/core/background-runtime/worker-entry.ts')],
  plugins:[...(options.plugins??[]),{name:'background-kernel',setup(builder){
   builder.onResolve({filter:/^code-codex:background-kernel$/},()=>({path:'kernel',namespace:'background-worker'}));
   builder.onLoad({filter:/.*/,namespace:'background-worker'},()=>({contents:factory??`import {${renderer}} from ${JSON.stringify(resolve(root,module))};export const kernelMethods=[];export function createKernel(host,canvas,settings,onError){return new ${renderer}(host,canvas,settings,onError);}`,loader:'ts',resolveDir:root}));
  }}]});
 return {source:result.outputFiles[0].text,inputs:result.metafile.inputs};
}
