import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

export function pluginAssetPath(directory,p,asset=p){return resolve(directory,p.category??'appearance',p.id,asset.relativePath||asset.asset);}
export function verifiedBytes(directory,p,asset=p){
 const bytes=readFileSync(pluginAssetPath(directory,p,asset));
 if(bytes.length!==asset.size||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error(`Plugin ${p.id} asset ${asset.asset} failed verification`);
 return bytes;
}
// Fixture mirrors the native conversion: PNG bytes never execute as scripts.
export function verifiedPluginSources(directory,p){
 const sources=[];
 const main=verifiedBytes(directory,p);
 {
  const verified=new Map((p.resources??[]).map(r=>[r.asset,verifiedBytes(directory,p,r)]));
  for(const r of p.resources??[]){
   if(r.kind==='thumbnail')continue;
   if(r.kind==='image'){
    const image={...r.image,data:verified.get(r.asset).toString('base64')};
    if(image.thumbnailAsset){image.thumbnail=verified.get(image.thumbnailAsset).toString('base64');delete image.thumbnailAsset;}
    sources.push(`(()=>{const key=Symbol.for('code-codex:default-galleries:v1');const registry=window[key]??(window[key]=new Map());let gallery=registry.get(${JSON.stringify(p.id)});if(!gallery||gallery.version!==${p.galleryVersion})registry.set(${JSON.stringify(p.id)},gallery={version:${p.galleryVersion},count:${p.defaultImageCount},images:new Map()});gallery.images.set(${JSON.stringify(r.sha256)},${JSON.stringify(image)});})();`);
   }else if(r.kind==='script'||!r.kind)sources.push(verified.get(r.asset).toString('utf8'));
   else if(['worker','wasm','style','binary'].includes(r.kind)){
    const bytes=verified.get(r.asset);
    const mimeType=r.mimeType||({worker:'application/javascript',wasm:'application/wasm',style:'text/css'}[r.kind]??'application/octet-stream');
    // Mirror native loading: workers/WASM remain verified data. In particular,
    // do not eval a Worker body in the renderer or decode WASM as JavaScript.
    for(let offset=0;offset<bytes.length;offset+=1024*1024){
     const init=offset===0?`let entry=registry.get(${JSON.stringify(p.id)});if(!entry||entry.version!==${JSON.stringify(p.version)})registry.set(${JSON.stringify(p.id)},entry={version:${JSON.stringify(p.version)},resources:new Map()});entry.resources.set(${JSON.stringify(r.relativePath)},{kind:${JSON.stringify(r.kind)},mimeType:${JSON.stringify(mimeType)},bytes:new Uint8Array(${bytes.length})});`:'';
     sources.push(`(()=>{const key=Symbol.for('code-codex:plugin-resources:v1');const registry=window[key]??(window[key]=new Map());${init}registry.get(${JSON.stringify(p.id)}).resources.get(${JSON.stringify(r.relativePath)}).bytes.set(Uint8Array.from(atob(${JSON.stringify(bytes.subarray(offset,offset+1024*1024).toString('base64'))}),c=>c.charCodeAt(0)),${offset});})();`);
    }
   }else throw Error(`Unsupported trusted resource kind: ${r.kind}`);
  }
 }
 sources.push(main.toString('utf8'));
 const fingerprint=[p.api,p.version,p.sha256,(p.resources??[]).map(resource=>resource.sha256)];
 sources.push(`(()=>{const id=${JSON.stringify(p.id)};const module=window[Symbol.for('code-codex:plugin-modules:v1')]?.get(id)??window[Symbol.for('code-codex:background-modules:v1')]?.get(id);if(module?.api===${p.api}&&module.version===${JSON.stringify(p.version)}){const key=Symbol.for('code-codex:verified-plugin-modules:v1');const registry=window[key]??(window[key]=new Map());registry.set(id,{fingerprint:JSON.stringify(${JSON.stringify(fingerprint)}),module});}})();`);

 if(sources.length>33||sources.some(source=>Buffer.byteLength(source)>4*1024*1024))throw Error(`Plugin ${p.id} exceeds the bounded native script batch`);
 return sources;
}
