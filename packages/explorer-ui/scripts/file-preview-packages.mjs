import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export const filePreviewDefinitions = [
 ['markdown-preview','Markdown Preview','code-codex.markdown-preview'],
 ['csv-preview','CSV Preview','code-codex.csv-preview'],
 ['diagram-preview','Diagram Preview','code-codex.diagram-preview'],
 ['image-preview','Image Preview','code-codex.image-preview'],
 ['video-preview','Video Preview','code-codex.video-preview'],
 ['pdf-preview','PDF Preview','code-codex.pdf-preview'],
 ['audio-preview','Audio Preview','code-codex.audio-preview'],
 ['office-preview','Office Preview','code-codex.office-preview'],
 ['notebook-preview','Jupyter Notebook Preview','code-codex.notebook-preview'],
 ['model-preview','3D Model Preview','code-codex.model-preview'],
];

/** Compile the actual viewer and only its reachable dependencies into each package.
 * The core imports contracts as types and dispatches through the verified runtime.
 * PDF's local fake worker and Office's audited local Worker/WASM are intentionally
 * part of their own packages, avoiding any browser-side unverified network load.
 */
export async function buildFilePreviewPackages(root,options,hostVersion) {
 const version='1.0.0', catalog=[];
 const notices=await readFile(resolve(root,'../..','THIRD_PARTY_NOTICES_EN.md'),'utf8');
 const banner=`/*! Code-Codex first-party file preview package.\nSource: https://github.com/Rice-dog/code-codex\n${notices.replaceAll('*/','* /')}\n*/`;
 for(const[id,name,hostId]of filePreviewDefinitions){
  const directory=resolve(root,'dist/plugins/file-preview',id);
  await mkdir(directory,{recursive:true});
  const resources=[];
  if(id==='office-preview'){
    await mkdir(resolve(directory,'resources'),{recursive:true});
    for(const[file,name,kind,mimeType]of [['native-parser-worker.js','parser.worker.js','worker','text/javascript'],['pptx_wasm_bg.wasm','parser.wasm','wasm','application/wasm']]){
      const data=await readFile(resolve(root,'node_modules/@extend-ai/react-pptx/dist',file));
      const resourceAsset=`CodeCodex-plugin-office-preview-${version}-${name}`;
      const relativePath=`resources/${resourceAsset}`;
      if(data.length>4*1024*1024)throw Error('Office parser resource exceeds the bounded asset channel');
      await writeFile(resolve(directory,relativePath),data);resources.push({asset:resourceAsset,relativePath,kind,mimeType,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});
    }
  }
  const asset=`CodeCodex-plugin-${id}-${version}.js`;
  const contents=`import {methods} from './file-preview/${id}';\nconst host=window;const key=Symbol.for('code-codex:plugin-modules:v1');const registry=host[key]??(host[key]=new Map());registry.set(${JSON.stringify(id)},{id:${JSON.stringify(id)},api:1,version:${JSON.stringify(version)},exports:methods});`;
  const result=await build({...options,banner:{js:banner},sourcemap:false,metafile:true,stdin:{contents,resolveDir:resolve(root,'src'),sourcefile:`${id}.entry.ts`,loader:'ts'},format:'iife',minify:true,outfile:resolve(directory,asset)});
  await writeFile(resolve(directory,`${id}.metafile.json`),JSON.stringify(result.metafile,null,2)+'\n');
  const bytes=await readFile(resolve(directory,asset));
  if(bytes.length>4*1024*1024)throw Error(`File preview ${id} exceeds the bounded 4 MiB script channel`);
  const descriptor={id,name,hostId,category:'file-preview',api:1,version,releaseTag:`v${hostVersion}`,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),asset,relativePath:asset,resources,defaultImageCount:0,capabilities:['file-preview'],source:'https://github.com/Rice-dog/code-codex',notices:'THIRD_PARTY_NOTICES_EN.md'};
  catalog.push(descriptor);
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
  await writeFile(resolve(directory,'README.md'),`# ${name}\n\nCategory: File Preview. API 1; immutable package ${version}. Main script: ${asset}.\n\nDownload and SHA-256 verification complete before activation. The already-open Codex window can use the viewer immediately, without restarting. The host retains its tabs, workspace capabilities, size budgets and cancellation generations; the downloaded module owns format parsing, rendering and resource cleanup. This package contains only this viewer's dependencies.\n\nNo screenshots or personal media are part of the plugin package. PDF and Office use local audited runtimes and do not fetch executable dependencies from the document.\n`);
  await writeFile(resolve(directory,'THIRD_PARTY_NOTICES_EN.md'),notices);
 }
 return catalog;
}
