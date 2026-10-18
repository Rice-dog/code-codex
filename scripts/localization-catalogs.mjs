import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
export function mergedCatalog(locale){
 const manifest=JSON.parse(readFileSync(resolve(root,'resources/localization/domains.json'),'utf8'));
 assert.equal(manifest.schema,1);const merged={};
 for(const domain of manifest.domains){
  assert(/^[a-z-]+$/.test(domain),'Invalid localization domain');
  const source=readFileSync(resolve(root,'resources/localization/'+domain+'/'+locale+'.json'),'utf8'),data=JSON.parse(source);
  assert.equal((source.match(/^  "[^"\r\n]+":/gm)??[]).length,Object.keys(data).length,domain+'/'+locale+': duplicate key');
  for(const [key,value]of Object.entries(data)){assert(!Object.hasOwn(merged,key),'Localization key belongs to two domains: '+key);assert.equal(typeof value,'string');merged[key]=value;}
 }
 return Object.fromEntries(Object.entries(merged).sort(([a],[b])=>a.localeCompare(b,'en')));
}
export function verifyDomainCatalogs(write=false){
 const en=mergedCatalog('en'),zh=mergedCatalog('zh-CN');assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
 for(const [locale,data]of [['en',en],['zh-CN',zh]]){
  const path=resolve(root,'resources/i18n/'+locale+'.json'),source=JSON.stringify(data,null,2)+'\n';
  if(write)writeFileSync(path,source);else assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),data,'Generated compatibility catalog drift: '+locale);
 }
 return Object.keys(en).length;
}
if(process.argv[1]===import.meta.filename)console.log('Localization domain keys: '+verifyDomainCatalogs(process.argv.includes('--write')));
