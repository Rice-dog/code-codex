import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {sourcePackage} from './plugin-source-definition.mjs';
export async function buildLiquidAscii(root,options,outputRoot=resolve(root,'dist/plugins')){
 const id='liquid-ascii',definition=sourcePackage(id),version=definition.version,asset=`CodeCodex-background-liquid-ascii-${version}.js`,dir=resolve(outputRoot,'appearance',id);
 await mkdir(dir,{recursive:true});
 const worker=await build({...options,entryPoints:[resolve(root,'src/effects/liquid-ascii/worker.ts')],write:false,minify:true,sourcemap:false,metafile:true,format:'iife'});
 const source=worker.outputFiles[0].text;
 const result=await build({...options,minify:true,sourcemap:false,metafile:true,stdin:{contents:`import {WorkerBackgroundRenderer} from './core/background-runtime/worker-renderer';
 import {readLiquidAsciiSettings} from './effects/liquid-ascii/model';
 class LiquidAsciiRenderer extends WorkerBackgroundRenderer {constructor(host,canvas,settings,onError,interactive=true){super('liquid-ascii',${JSON.stringify(source)},host,canvas,settings,onError,{interactive});}}
 const key=Symbol.for('code-codex:background-modules:v1');(window[key]??=new Map()).set('liquid-ascii',{id:'liquid-ascii',api:1,version:${JSON.stringify(version)},exports:{LiquidAsciiRenderer},startup(target,onError){const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);return new LiquidAsciiRenderer(target,canvas,readLiquidAsciiSettings(),onError,false);}});`,resolveDir:resolve(root,'src'),sourcefile:'liquid-ascii-package.ts',loader:'ts'},outfile:resolve(dir,asset)});
 Object.assign(result.metafile.inputs,worker.metafile.inputs);
 await writeFile(resolve(dir,`${id}.metafile.json`),JSON.stringify(result.metafile));
 const bytes=await readFile(resolve(dir,asset));
 const descriptor={...definition,asset,relativePath:asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),resources:[],source:'https://github.com/Rice-dog/code-codex'};
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
 await writeFile(resolve(dir,'README.md'),'# Liquid ASCII Background\n\nIndependent FLIP/PIC implementation from the user-owned liquid-ascii-background-effect. Canvas 2D in an isolated Worker, no React runtime or external assets. Visual reference only: React Bits Pro Liquid ASCII.\n');
 await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),await readFile(resolve(root,'../../THIRD_PARTY_NOTICES_EN.md'),'utf8'));
 return descriptor;
}
