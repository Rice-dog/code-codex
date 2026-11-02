import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
/** Tests must address the actual compiled custom-element identity, not just semver. */
export function builtExplorerTag(root){
 const ui=resolve(root,'packages/explorer-ui'),version=JSON.parse(readFileSync(resolve(ui,'package.json'),'utf8')).version;
 const build=JSON.parse(readFileSync(resolve(ui,'dist/ui-build.json'),'utf8'));
 if(build.version!==version||!/^[a-f0-9]{12}$/.test(build.buildId))throw Error('UI build identity is absent or stale. Rebuild the renderer before running compiled UI tests.');
 return `code-codex-v${version.replaceAll('.','-')}-b${build.buildId}`;
}
