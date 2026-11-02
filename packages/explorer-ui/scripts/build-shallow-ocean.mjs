import {build} from 'esbuild';
import {buildBackgroundWorker} from './build-background-worker.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sourcePackage} from './plugin-source-definition.mjs';
export async function buildShallowOcean(root,options,outputRoot=resolve(root,'dist/plugins')){
 const id='shallow-ocean',definition=sourcePackage(id),version=definition.version,asset=`CodeCodex-background-shallow-ocean-${version}.js`,dir=resolve(outputRoot,'appearance',id);await mkdir(dir,{recursive:true});
 const worker=await buildBackgroundWorker(root,options,'','',`export {oceanMethods as kernelMethods,createOceanKernel as createKernel} from './src/core/background-runtime/ocean-kernel';`);
 const result=await build({...options,metafile:true,sourcemap:false,minify:true,stdin:{contents:`import {OceanWorkerRenderer} from './core/background-runtime/ocean-worker-renderer';const ShallowOceanRenderer=class extends OceanWorkerRenderer{constructor(...args){super(${JSON.stringify(worker.source)},...args);}};import {readSettings} from './effects/shallow-ocean/model';const key=Symbol.for('code-codex:background-modules:v1');(window[key]??=new Map()).set('shallow-ocean',{id:'shallow-ocean',api:1,version:${JSON.stringify(version)},exports:{ShallowOceanRenderer},startup(target,onError){const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);return new ShallowOceanRenderer(target,canvas,readSettings(),onError,false);}});`,resolveDir:resolve(root,'src'),sourcefile:'shallow-ocean-package.ts',loader:'ts'},outfile:resolve(dir,asset)});
 Object.assign(result.metafile.inputs,worker.inputs);
 await writeFile(resolve(dir,`${id}.metafile.json`),JSON.stringify(result.metafile));const bytes=await readFile(resolve(dir,asset));
 const descriptor={...definition,asset,relativePath:asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),resources:[],source:'https://github.com/Rice-dog/code-codex'};
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
 await writeFile(resolve(dir,'README.md'),'# Shallow Ocean Letters Background / 浅海来信\n\nNative scoped WebGL tropical lagoon adapted from the user-provided shallow ocean2 implementation. Opening camera, marine life, water and events preserve the procedural source. Independent per-instance lifecycle and no CDN/fonts/network at runtime. Public prompt reference: Ocean Shallows by @Vib3Coded. Regenerated, debugged and extended by the user with AI; no original author source/assets used.\n');
 await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),'Three.js 0.128.0 — MIT\n\n'+await readFile(resolve(root,'node_modules/three-ocean-r128/LICENSE'),'utf8'));
 return descriptor;
}
