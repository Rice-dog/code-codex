import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const source=resolve(root,'packages/explorer-ui/dist/plugins');
const destination=resolve(root,process.argv[2]||'artifacts/plugin-release-stage');
if(!destination.startsWith(resolve(root,'artifacts')+'\\')&&!destination.startsWith(resolve(root,'artifacts')+'/'))throw Error('Plugin staging must be inside artifacts');
const catalog=JSON.parse(await readFile(resolve(source,'catalog.json'),'utf8'));
const inventory=[];
for(const p of catalog){
 const directory=resolve(destination,p.category,p.id);await mkdir(resolve(directory,'media'),{recursive:true});
 for(const asset of [...p.resources,p]){
  const relative=asset.relativePath||asset.asset;
  const bytes=await readFile(resolve(source,p.category,p.id,relative));
  if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error(`Plugin asset mismatch: ${p.id}/${relative}`);
  await mkdir(dirname(resolve(directory,relative)),{recursive:true});
  await copyFile(resolve(source,p.category,p.id,relative),resolve(directory,relative));
  inventory.push({assetName:asset.asset,path:`plugins/${p.category}/${p.id}/${relative}`,size:bytes.length,sha256:asset.sha256});
 }
 for(const file of ['manifest.json','README.md','THIRD_PARTY_NOTICES_EN.md'])await copyFile(resolve(source,p.category,p.id,file),resolve(directory,file));
}
await copyFile(resolve(source,'catalog.json'),resolve(destination,'catalog.json'));
const bytes=await readFile(resolve(source,'catalog.json'));
inventory.push({assetName:`CodeCodex-plugin-catalog-${JSON.parse(await readFile(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version}.json`,path:'plugins/catalog.json',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
await writeFile(resolve(destination,'README.md'),`# Code-Codex plugins\n\nThree categories: appearance, file-preview and developer-tools. One directory per plugin within its category, using the stable plugin ID. Each contains its main JavaScript, manifest, notices and original media. The startup player is downloaded too; a tiny core cache dispatcher loads its verified bytes before full UI preparation, with no network request during startup.\n\nGitHub Release assets use unique flat asset names; release-assets.json maps those names to this local directory tree. Download and offline import follow the embedded catalog. The core installer excludes this directory.\n`);
await writeFile(resolve(root,'artifacts/plugin-release-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
console.log(`Staged ${catalog.length} categorized plugins and ${catalog.reduce((n,p)=>n+p.resources.filter(r=>r.kind==='image').length,0)} original pictures.`);
