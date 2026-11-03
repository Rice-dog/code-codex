import {buildAsciiTiles} from './build-ascii-tiles.mjs';
import {buildShallowOcean} from './build-shallow-ocean.mjs';
import {buildSignalHands} from './build-signal-hands.mjs';
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildBackgroundPackages} from './background-packages.mjs';
import {buildUtilityPackages} from './utility-packages.mjs';
import {buildFilePreviewPackages} from './file-preview-packages.mjs';
import {buildStartupPackage} from './build-startup-package.mjs';
import {buildCustomBackground} from './build-custom-background.mjs';
import {digest,inputDigest,validateLock} from './plugin-distribution.mjs';
import {sourcePackages} from './plugin-source-definition.mjs';
import {additionalBuildInputs,fingerprintBuildMetadata} from './plugin-build-inputs.mjs';

/** Explicit maintenance path: compile, compare actual bytes, reject identity reuse,
 * then commit reviewed local candidate artifacts and one complete lock. */
export async function rebuildPlugins(root,options,selection){
 const repo=resolve(root,'../..'),lockPath=resolve(repo,'resources/plugin-distribution.lock.json');
 const old=validateLock(JSON.parse(await readFile(lockPath,'utf8'))),ids=new Set(selection==='all'?sourcePackages.map(p=>p.id):selection.split(','));
 for(const id of ids)if(!sourcePackages.some(p=>p.id===id))throw Error(`Unknown requested plugin build: ${id}`);
 const stage=resolve(root,'dist',`.plugin-build-${randomUUID()}`),report=[];await mkdir(stage,{recursive:true});
 try{
  const catalog=await buildBackgroundPackages(root,options,stage);
  catalog.push(await buildAsciiTiles(root,options,stage));
  catalog.push(await buildShallowOcean(root,options,stage));
  catalog.push(await buildSignalHands(root,options,stage));
  catalog.push(await buildCustomBackground(root,options,stage));
  catalog.push(...await buildUtilityPackages(root,options,stage));
  catalog.push(await buildStartupPackage(root,options,stage));
  catalog.push(...await buildFilePreviewPackages(root,options,stage));
  const next=[];
  for(const previous of [...old.packages,...catalog.filter(p=>!old.packages.some(item=>item.descriptor.id===p.id)).map(descriptor=>({descriptor:{id:descriptor.id,version:null,resources:[]}}))]){const id=previous.descriptor.id,p=catalog.find(p=>p.id===id);
   if(!p)throw Error(`Builder lost a declared package: ${id}`);
   if(!ids.has(id)){if(!previous.artifactRoot)throw Error(`New plugin ${id} requires an explicit rebuild selection.`);next.push(previous);continue;}
   const same=p.sha256===previous.descriptor.sha256&&p.size===previous.descriptor.size&&p.version===previous.descriptor.version;
   if(!same&&p.version===previous.descriptor.version)report.push({id,status:'independent-version-required',oldVersion:p.version,newSha256:p.sha256,oldSha256:previous.descriptor.sha256});
   for(const resource of p.resources??[]){const prior=previous.descriptor.resources?.find(a=>a.asset===resource.asset&&a.size===resource.size&&a.sha256===resource.sha256);if(prior)resource.releaseTag=prior.releaseTag??previous.descriptor.releaseTag;}
   const descriptor=same?previous.descriptor:p,folder=resolve(stage,p.category,id);
   const meta=JSON.parse(await readFile(resolve(folder,`${id}.metafile.json`),'utf8')),inputs={};
   for(const file of new Set([...Object.keys(meta.inputs),...await additionalBuildInputs(root,p)])){try{inputs[file]=inputDigest(await readFile(resolve(root,file)),file,'lf-v1');}catch(e){if(e.code!=='ENOENT')throw e;}}
   next.push({descriptor,inputs,inputFormat:'lf-v1',buildMetadata:await fingerprintBuildMetadata(root,id),artifactRoot:`releases/plugins/${p.category}/${id}`});
   if(same)report.push({id,status:'same-bytes-identity-retained',sha256:p.sha256});
   else if(p.version!==previous.descriptor.version)report.push({id,status:'new-candidate-identity',from:previous.descriptor.version,to:p.version,releaseTag:p.releaseTag,sha256:p.sha256});
  }
  const reportPath=resolve(root,'dist/plugin-rebuild-report.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  if(report.some(x=>x.status==='independent-version-required'))throw Error('Plugin bytes changed under an existing version. Update only the affected explicit source identities and rebuild; see plugin-rebuild-report.json. Distribution lock was not changed.');
  for(const item of next){if(!ids.has(item.descriptor.id))continue;const p=item.descriptor,folder=resolve(stage,p.category,p.id),dest=resolve(repo,item.artifactRoot);
   await mkdir(dest,{recursive:true});await cp(folder,dest,{recursive:true});await writeFile(resolve(dest,'manifest.json'),JSON.stringify(p,null,2)+'\n');
  }
  // All artifacts are available before the authoritative identity/catalog changes.
  // A rebuilt candidate retires only its old exact pending identity. Preserve
  // unrelated pending assets, and explicitly list new bytes so Candidate mode
  // cannot silently waive missing, corrupt or mismatched published resources.
  const assets=next.flatMap(({descriptor:d})=>[d,...d.resources??[]].map(a=>({id:d.id,tag:a.releaseTag??d.releaseTag,name:a.asset,size:a.size,sha256:a.sha256})));
  const sameAsset=(a,b)=>['id','tag','name','size','sha256'].every(key=>a[key]===b[key]);
  const pendingPublicationAssets=(old.pendingPublicationAssets??[]).filter(a=>assets.some(b=>sameAsset(a,b)));
  for(const change of report.filter(r=>r.status==='new-candidate-identity')){
   const d=next.find(p=>p.descriptor.id===change.id).descriptor;
   const previous=old.packages.find(p=>p.descriptor.id===change.id)?.descriptor;
   for(const a of assets.filter(a=>a.id===change.id)){
    if(a.name!==d.asset&&previous?.resources?.some(r=>r.asset===a.name&&r.size===a.size&&r.sha256===a.sha256&&(r.releaseTag??previous.releaseTag)===a.tag))continue;
    if(!pendingPublicationAssets.some(b=>sameAsset(a,b)))pendingPublicationAssets.push(a);
   }
  }
  const temp=lockPath+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify({...old,packages:next,pendingPublicationAssets},null,2)+'\n');
  const {rename}=await import('node:fs/promises');await rename(temp,lockPath);
  await writeFile(resolve(repo,'releases/plugins/catalog.json'),JSON.stringify(next.map(x=>x.descriptor),null,2)+'\n');
  return report;
 }finally{await rm(stage,{recursive:true,force:true});}
}
