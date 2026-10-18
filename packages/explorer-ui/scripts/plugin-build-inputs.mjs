import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=async file=>JSON.parse(await readFile(file,'utf8'));

/** Virtual inputs are scoped to a package, excluding the application version. */
export async function fingerprintBuildMetadata(root,id) {
 const definitions=await json(resolve(root,'../../resources/plugin-definitions.json'));
 const matches=definitions.plugins.filter(p=>p.id===id);
 if(matches.length!==1)throw Error('Plugin definition identity is not unique: '+id);
 const media=await json(resolve(root,'default-media/manifest.json'));
 const result={definition:hash(matches[0]),compiler:(await json(resolve(root,'node_modules/esbuild/package.json'))).version};
 if(media.plugins[id])result.media=hash({version:media.version,images:media.plugins[id]});
 if(id==='office-preview')result.parser=hash((await json(resolve(root,'package.json'))).codeCodex.embeddedWasm);
 return result;
}
export async function additionalBuildInputs(root,p) {
 const builder=p.id==='custom-background'?'build-custom-background.mjs':p.id==='codex-startup-transition'?'build-startup-package.mjs':p.category==='file-preview'?'file-preview-packages.mjs':p.capabilities?.includes('background')?'background-packages.mjs':'utility-packages.mjs';
 const files=['scripts/'+builder,'scripts/build.mjs','scripts/rebuild-plugins.mjs','scripts/plugin-source-definition.mjs','scripts/plugin-build-inputs.mjs','scripts/plugin-distribution.mjs','../../THIRD_PARTY_NOTICES_EN.md'];
 if(p.id==='codex-startup-transition')files.push('src/startup-transition.css');
 if(p.id==='pixel-sculpt')files.push('src/pixel-sculpt-default.png');
 if(p.id==='office-preview')for(const name of ['native-parser-worker.js','pptx_wasm_bg.wasm'])files.push('node_modules/@extend-ai/react-pptx/dist/'+name);
 const media=await json(resolve(root,'default-media/manifest.json'));
 for(const item of media.plugins[p.id]??[])for(const name of [item.file,item.thumbnailFile])if(name)files.push('default-media/'+p.id+'/'+name);
 return files;
}
