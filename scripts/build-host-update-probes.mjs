import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../packages/explorer-ui');
const {build}=createRequire(resolve(root,'package.json'))('esbuild');
// Separate embedded entry: not evaluated by renderer startup, switching or Send.
await build({absWorkingDir:root,bundle:true,target:'es2022',platform:'browser',format:'iife',globalName:'codeCodexHostUpdateProbe',minify:true,entryPoints:['src/host-update-probes.ts'],outfile:'dist/host-update-probes.js'});
