import {sourcePackage} from './plugin-source-definition.mjs';
import {build} from 'esbuild';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const id='lan-remote';
export async function buildLanRemote(root,options,outputRoot=resolve(root,'dist/plugins')){
 const definition=sourcePackage(id),version=definition.version,dir=resolve(outputRoot,'developer-tools',id);
 await mkdir(resolve(dir,'resources'),{recursive:true});
 const asset=`CodeCodex-plugin-${id}-${version}.js`;
 const contents=`import * as exports from './lan-remote-runtime';const key=Symbol.for('code-codex:plugin-modules:v1');const registry=window[key]??(window[key]=new Map());registry.set(${JSON.stringify(id)},{id:${JSON.stringify(id)},api:1,version:${JSON.stringify(version)},exports});`;
 const result=await build({...options,stdin:{contents,resolveDir:resolve(root,'src'),sourcefile:'plugin-lan-remote.ts',loader:'ts'},format:'iife',minify:true,sourcemap:false,metafile:true,outfile:resolve(dir,asset)});
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 const bytes=await readFile(resolve(dir,asset)),engineAsset=`CodeCodex-plugin-${id}-${version}-x64.exe`,licenseAsset=`CodeCodex-plugin-${id}-${version}-COPYING.txt`;
 const engine=await readFile(resolve(root,'../../artifacts/lan-remote-native/code_codex_lan_remote.exe'));
 const viewer=await readFile(resolve(root,'../../artifacts/lan-remote-native/code_codex_remote_viewer.exe'));
 if(engine.length>64*1024*1024||engine.toString('ascii',0,2)!=='MZ')throw Error('LAN native engine is missing, oversized or invalid. Build it with native/lan-remote/build.ps1 first.');
 const receipt=JSON.parse((await readFile(resolve(root,'../../artifacts/lan-remote-native/build-manifest.json'),'utf8')).replace(/^\uFEFF/,''));
 if(receipt.schema!==1||receipt.size!==engine.length||receipt.sha256!==sha(engine))throw Error('LAN native build receipt does not match the actual binary.');
 if(receipt.viewer?.size!==viewer.length||receipt.viewer.sha256!==sha(viewer)||viewer.length>64*1024*1024)throw Error('LAN native viewer differs from its build receipt.');
 for(const [name,hash]of Object.entries(receipt.inputs))if(sha(await readFile(resolve(root,'../../native/lan-remote',name)))!==hash)throw Error('LAN native source changed after compilation: '+name);
 const license=await readFile(resolve(root,'../../native/lan-remote/COPYING'));
 await writeFile(resolve(dir,'resources',engineAsset),engine);await writeFile(resolve(dir,'resources',licenseAsset),license);
 const viewerAsset=`CodeCodex-plugin-${id}-${version}-viewer-x64.exe`;await writeFile(resolve(dir,'resources',viewerAsset),viewer);
 const descriptor={...definition,asset,relativePath:asset,size:bytes.length,sha256:sha(bytes),resources:[
  {asset:engineAsset,relativePath:'resources/'+engineAsset,kind:'native',size:engine.length,sha256:sha(engine)},
  {asset:viewerAsset,relativePath:'resources/'+viewerAsset,kind:'native',size:viewer.length,sha256:sha(viewer)},
  {asset:licenseAsset,relativePath:'resources/'+licenseAsset,kind:'binary',mimeType:'text/plain',size:license.length,sha256:sha(license)}],source:'https://github.com/Rice-dog/code-codex'};
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
 await writeFile(resolve(dir,'lan-remote.metafile.json'),JSON.stringify(result.metafile));
 await copyFile(resolve(root,'../../native/lan-remote/README.md'),resolve(dir,'README.md'));
 await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),'LAN Remote native engine: Aspia v3.3.5 by Dmitry Chapyshev and contributors, GPL-3.0-or-later.\nSource: https://github.com/dchapyshev/aspia/tree/v3.3.5\nAdapter and build scripts: native/lan-remote in https://github.com/Rice-dog/code-codex\nThe native engine is a separate optional process; no cloud router or unattended service is installed.\n');
 return descriptor;
}
