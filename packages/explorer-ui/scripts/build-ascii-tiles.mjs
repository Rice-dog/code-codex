import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sourcePackage} from './plugin-source-definition.mjs';
import {buildBackgroundWorker} from './build-background-worker.mjs';
export async function buildAsciiTiles(root,options,outputRoot=resolve(root,'dist/plugins')){
 const id='ascii-tiles',definition=sourcePackage(id),version=definition.version,asset=`CodeCodex-background-ascii-tiles-${version}.js`,dir=resolve(outputRoot,'appearance',id);await mkdir(dir,{recursive:true});
 const worker=await buildBackgroundWorker(root,{...options,loader:{...options.loader,'.frag':'text'}},'src/effects/ascii-tiles/renderer.js','AsciiTilesRenderer');
 const result=await build({...options,loader:{...options.loader,'.frag':'text'},metafile:true,sourcemap:false,minify:true,stdin:{contents:`import {WorkerBackgroundRenderer} from './core/background-runtime/worker-renderer';const AsciiTilesRenderer=class extends WorkerBackgroundRenderer{constructor(host,canvas,settings,onError){super('ascii-tiles',${JSON.stringify(worker.source)},host,canvas,settings,onError);}};import {readAsciiTilesSettings} from './effects/ascii-tiles/model';const key=Symbol.for('code-codex:background-modules:v1');(window[key]??=new Map()).set('ascii-tiles',{id:'ascii-tiles',api:1,version:${JSON.stringify(version)},exports:{AsciiTilesRenderer},startup(target,onError){const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);return new AsciiTilesRenderer(target,canvas,readAsciiTilesSettings(),onError);}});`,resolveDir:resolve(root,'src'),sourcefile:'ascii-tiles-package.ts',loader:'ts'},outfile:resolve(dir,asset)});
 Object.assign(result.metafile.inputs,worker.inputs);
 await writeFile(resolve(dir,`${id}.metafile.json`),JSON.stringify(result.metafile));const bytes=await readFile(resolve(dir,asset));const descriptor={...definition,asset,relativePath:asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),resources:[],source:'https://github.com/Rice-dog/code-codex'};
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');await writeFile(resolve(dir,'README.md'),'# ASCII Tiles Background\n\nIndependent WebGL2 ASCII glass tiles with continuous neighbor-coupled spring waves. Adapted from the local independently implemented effect; no paid component source or external resources.\n');await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),(await readFile(resolve(root,'../../THIRD_PARTY_NOTICES_EN.md'),'utf8')).split('\n').map(line=>line.trimEnd()).join('\n'));return descriptor;
}
