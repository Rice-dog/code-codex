import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,copyFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fingerprintBuildMetadata} from './plugin-build-inputs.mjs';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// Source line endings differ between Windows checkouts and other platforms.
// Artifact bytes are always hashed raw; only declared text INPUTS use LF form.
export const inputDigest=(bytes,name,format)=>digest(format==='lf-v1'&&/\.(?:[cm]?[jt]sx?|css|json|html|glsl|frag|vert|svg|txt)$/i.test(name)?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes);
async function moveOwnedDirectory(from,to){
 for(let attempt=0;;attempt++)try{return await rename(from,to);}catch(error){
  if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===8)throw error;
  await delay(50*(attempt+1));
 }
}
function within(root,part){const path=resolve(root,part);if(path!==root&&!path.startsWith(root+sep))throw Error(`Plugin asset path escapes its owned root: ${part}`);return path;}
export function validateLock(lock){
 if(lock?.schema!==1||!Array.isArray(lock.packages)||!lock.packages.length)throw Error('Plugin distribution lock has no supported schema/packages');
 const ids=new Set();
 for(const item of lock.packages){const p=item.descriptor;
  if(item.inputFormat!==undefined&&item.inputFormat!=='lf-v1')throw Error('Unsupported plugin input fingerprint format');
  if(!item.inputs||typeof item.inputs!=='object'||Array.isArray(item.inputs)||Object.entries(item.inputs).some(([name,hash])=>!name||!/^[a-f0-9]{64}$/.test(hash)))throw Error('Invalid plugin input fingerprint map');
  if(!p||ids.has(p.id)||!/^[-a-z0-9]+$/.test(p.id)||!['appearance','file-preview','developer-tools'].includes(p.category)||p.api!==1||!/^\d+\.\d+\.\d+$/.test(p.version)||!/^(?:v\d+\.\d+\.\d+|plugin-assets-\d{4}-\d{2}-\d{2})(?![\s\S])/.test(p.releaseTag))throw Error(`Invalid or duplicate locked plugin identity: ${p?.id}`);
  ids.add(p.id);
  for(const a of [p,...p.resources??[]])if(!Number.isSafeInteger(a.size)||a.size<1||!/^[a-f0-9]{64}$/.test(a.sha256)||!a.asset||/[\\/]/.test(a.asset))throw Error(`Invalid locked asset identity: ${p.id}/${a.asset}`);
 }
 return lock;
}
export async function prepareLockedPlugins(root,{verifyInputs=true}={}){
 const repo=resolve(root,'../..'),lock=validateLock(JSON.parse(await readFile(resolve(repo,'resources/plugin-distribution.lock.json'),'utf8')));
 const stage=resolve(root,'dist',`.plugins-stage-${randomUUID()}`),out=resolve(root,'dist/plugins'),backup=resolve(root,'dist',`.plugins-previous-${randomUUID()}`);await mkdir(stage,{recursive:true});
 const provenance=[];let swapped=false;
 try{
  for(const item of lock.packages){const p=item.descriptor;
   if(item.buildMetadata&&JSON.stringify(await fingerprintBuildMetadata(root,p.id))!==JSON.stringify(item.buildMetadata))throw Error(`Plugin build metadata changed: ${p.id}. Explicitly rebuild and audit the affected package.`);
   if(verifyInputs)for(const [name,sha]of Object.entries(item.inputs??{}))if(inputDigest(await readFile(within(repo,relative(repo,resolve(root,name)))),name,item.inputFormat)!==sha)throw Error(`Plugin source input changed: ${p.id}/${name}. Explicitly rebuild and audit this plugin; the application version cannot change its URL.`);
   const source=within(repo,item.artifactRoot),target=within(stage,`${p.category}/${p.id}`);await mkdir(target,{recursive:true});
   for(const a of [p,...p.resources??[]]){const file=a.relativePath??a.asset,bytes=await readFile(within(source,file));if(bytes.length!==a.size||digest(bytes)!==a.sha256)throw Error(`Locked plugin asset failed size/SHA verification: ${p.id}/${a.asset}`);await mkdir(dirname(within(target,file)),{recursive:true});await writeFile(within(target,file),bytes);}
   // Supporting provenance is part of the reviewed artifact, never a download fallback.
   for(const name of ['README.md','THIRD_PARTY_NOTICES_EN.md',`${p.id}.metafile.json`])try{await copyFile(within(source,name),within(target,name));}catch(e){if(e.code!=='ENOENT')throw e;}
   // Metafiles remain available to audit tools; release staging intentionally omits
   // them, so recover the matching pre-build file only when its identity agrees.
   const previous=resolve(out,p.category,p.id,`${p.id}.metafile.json`);
   try{if((await stat(previous)).isFile())await copyFile(previous,resolve(target,`${p.id}.metafile.json`));}catch(e){if(e.code!=='ENOENT')throw e;}
   await writeFile(resolve(target,'manifest.json'),JSON.stringify(p,null,2)+'\n');provenance.push({id:p.id,version:p.version,releaseTag:p.releaseTag,sha256:p.sha256,reused:true,inputs:Object.keys(item.inputs??{}).length});
  }
  const catalog=lock.packages.map(p=>p.descriptor);await writeFile(resolve(stage,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  try{await moveOwnedDirectory(out,backup);}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await moveOwnedDirectory(stage,out);swapped=true;}catch(e){try{await moveOwnedDirectory(backup,out);}catch(rollback){throw new AggregateError([e,rollback],'Plugin staging swap and rollback failed; preserve the previous directory for recovery.');}throw e;}
  await rm(backup,{recursive:true,force:true});await writeFile(resolve(root,'dist/plugin-input-provenance.json'),JSON.stringify({schema:1,lockSha256:digest(await readFile(resolve(repo,'resources/plugin-distribution.lock.json'))),packages:provenance},null,2)+'\n');return catalog;
 }finally{if(!swapped)await rm(stage,{recursive:true,force:true});}
}
