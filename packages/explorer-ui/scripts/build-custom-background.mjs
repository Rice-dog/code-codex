import {sourcePackage} from './plugin-source-definition.mjs';
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export async function buildCustomBackground(root,options,outputRoot=resolve(root,'dist/plugins')){
 const id='custom-background',version=sourcePackage('custom-background').version,asset=`CodeCodex-background-custom-background-${version}.js`,dir=resolve(outputRoot,'appearance',id);
 await mkdir(dir,{recursive:true});
 const result=await build({...options,metafile:true,sourcemap:false,minify:true,stdin:{contents:`import {CustomBackground} from './custom-background';const key=Symbol.for('code-codex:background-modules:v1');(window[key]??=new Map()).set('custom-background',{id:'custom-background',api:1,version:${JSON.stringify(version)},exports:{CustomBackground}});`,resolveDir:resolve(root,'src'),sourcefile:'custom-background-package.ts',loader:'ts'},outfile:resolve(dir,asset)});
 await writeFile(resolve(dir,`${id}.metafile.json`),JSON.stringify(result.metafile));
 const bytes=await readFile(resolve(dir,asset)),info={id,name:'Custom Background',category:'appearance',api:1,version,releaseTag:sourcePackage(id).releaseTag,asset,relativePath:asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),resources:[],capabilities:['background','local-media','settings'],source:'https://github.com/Rice-dog/code-codex'};
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(info,null,2)+'\n');
 await writeFile(resolve(dir,'README.md'),'# Custom Background\n\nLocal images and muted looping videos. Per-media position, scale, rotation, opacity, blur, color adjustment and playback speed. Library and controls reuse Startup Transition styles. 32 items, 128 MB per item, 512 MB total. Original media is retained locally.\n');
 await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),await readFile(resolve(root,'../../THIRD_PARTY_NOTICES_EN.md')));
 return info;
}
