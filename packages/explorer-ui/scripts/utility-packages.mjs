import {build} from 'esbuild';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export async function buildUtilityPackages(root,options,hostVersion){
  const definitions=[
    ['surface-opacity','UI Surface Opacity','appearance','surface-opacity-runtime'],
    ['transparent-background','Transparent Background','appearance','transparent-background-runtime'],
    ['git-history','Git History','developer-tools','git-history-runtime'],
  ];
  const notices=await readFile(resolve(root,'../..','THIRD_PARTY_NOTICES_EN.md'),'utf8');
  const catalog=[];
  for(const [id,name,category,module] of definitions){
    const version='1.0.0',asset=`CodeCodex-plugin-${id}-${version}.js`,dir=resolve(root,'dist/plugins',category,id);
    await mkdir(resolve(dir,'resources'),{recursive:true});
    const contents=`import * as exports from './${module}';const key=Symbol.for('code-codex:plugin-modules:v1');const registry=window[key]??(window[key]=new Map());registry.set(${JSON.stringify(id)},{id:${JSON.stringify(id)},api:1,version:${JSON.stringify(version)},exports});`;
    const result=await build({...options,stdin:{contents,resolveDir:resolve(root,'src'),sourcefile:`plugin-${id}.ts`,loader:'ts'},format:'iife',minify:true,sourcemap:false,metafile:true,outfile:resolve(dir,asset)});
    const bytes=await readFile(resolve(dir,asset));
    if(bytes.length>4*1024*1024)throw Error(`Plugin ${id} exceeds bounded script size`);
    const descriptor={id,name,category,api:1,version,releaseTag:`v${hostVersion}`,asset,relativePath:asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),resources:[],capabilities:[category],source:'https://github.com/Rice-dog/code-codex'};
    catalog.push(descriptor);
    await writeFile(resolve(dir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
    await writeFile(resolve(dir,'README.md'),`# ${name}\n\nDownload this first-party plugin in Preview Market, then enable it without restarting Codex. Preferences are retained separately from the package. API 1, package ${version}.\n`);
    await writeFile(resolve(dir,'THIRD_PARTY_NOTICES_EN.md'),notices);
    await writeFile(resolve(dir,`${id}.metafile.json`),JSON.stringify(result.metafile));
  }
  return catalog;
}
