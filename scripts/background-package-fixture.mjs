// Existing background regressions deliberately represent an installed cache.
// Cold download/cancel/activation are exercised separately; this helper never
// changes the production bundle or embeds backgrounds in the installer.
import { pluginAssetPath } from './plugin-package-files.mjs';
import { verifiedPluginSources } from './plugin-package-files.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
export function installedBackgroundFixture(root,ids) {
  const directory=resolve(root,'packages/explorer-ui/dist/plugins');
  const all=JSON.parse(readFileSync(resolve(directory,'catalog.json'),'utf8'));
  if(ids&&ids.some(id=>!all.some(p=>p.id===id)))throw Error('Unknown installed fixture package');
  const catalog=ids?all.filter(p=>ids.includes(p.id)):all;
  const scripts=catalog.map(p=>{
    const bytes=readFileSync(pluginAssetPath(directory,p));
    if(bytes.length!==p.size||createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error(`Fixture package ${p.id} failed its production catalog`);
    return verifiedPluginSources(directory,p).join('\n');
  }).join('\n');
  return `${scripts}\n(()=>{const bridge=window.__codeCodex;if(!bridge?.request)return;const request=bridge.request;bridge.request=function(value){if(value.method==='explorer.plugins.status')return Promise.resolve(${JSON.stringify(catalog.map(p=>({id:p.id,installed:true})))});if(value.method==='explorer.plugins.load')return Promise.resolve({loaded:true});return request.call(this,value);};})();\n`;
}
