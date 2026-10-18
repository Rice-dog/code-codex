import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import ts from '../packages/explorer-ui/node_modules/typescript/lib/typescript.js';
import {prepareLockedPlugins,validateLock,digest,inputDigest} from '../packages/explorer-ui/scripts/plugin-distribution.mjs';
import {cycles,checkArchitecture} from './check-architecture.mjs';
import {generateInstaller} from './generate-installer.mjs';
import {fingerprintBuildMetadata} from '../packages/explorer-ui/scripts/plugin-build-inputs.mjs';

const source=await readFile(new URL('../packages/explorer-ui/src/core/lifecycle/resource-scope.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {ResourceScope,LatestIntent}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('resource owner releases once in reverse order and continues after cleanup failure',()=>{
 const released=[],errors=[],scope=new ResourceScope(e=>errors.push(e.message)),target=new EventTarget();let calls=0;
 scope.listen(target,'change',()=>calls++);scope.own(()=>released.push('first'));scope.own(()=>{released.push('second');throw Error('cleanup fixture');});
 target.dispatchEvent(new Event('change'));scope.dispose();scope.dispose();target.dispatchEvent(new Event('change'));
 assert.deepEqual(released,['second','first']);assert.deepEqual(errors,['cleanup fixture']);assert.equal(calls,1);assert.equal(scope.signal.aborted,true);
 let late=0;scope.own(()=>late++);scope.listen(target,'change',()=>calls++);target.dispatchEvent(new Event('change'));assert.equal(late,1);assert.equal(calls,1);
});
test('superseded or cancelled intent cannot accept late completion',()=>{const intent=new LatestIntent(),a=intent.begin(),b=intent.begin();assert.equal(intent.current(a),false);assert.equal(intent.current(b),true);intent.cancel();assert.equal(intent.current(b),false);});
test('source line endings are portable while artifact and binary hashes remain exact',()=>{const lf=Buffer.from('one\ntwo\n'),crlf=Buffer.from('one\r\ntwo\r\n');assert.equal(inputDigest(lf,'source.ts','lf-v1'),inputDigest(crlf,'source.ts','lf-v1'));assert.notEqual(digest(lf),digest(crlf));assert.notEqual(inputDigest(lf,'media.png','lf-v1'),inputDigest(crlf,'media.png','lf-v1'));assert.notEqual(inputDigest(lf,'source.ts'),inputDigest(crlf,'source.ts'));});
test('invalid API 1 exports fail before invoking a factory or constructing a runtime',async()=>{
 const source=await readFile(new URL('../packages/explorer-ui/src/plugin-host/api1.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const {requireCallable,requireConstructor}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 let calls=0;class Runtime{constructor(){calls++;}}
 assert.equal(requireConstructor('fixture','Runtime',Runtime),Runtime);assert.equal(calls,0);
 const f=()=>1;assert.equal(requireCallable('fixture','f',f),f);
 for(const value of [undefined,null,{},'wrong'])assert.throws(()=>requireCallable('fixture','f',value),e=>e.code==='PLUGIN_EXPORT_TYPE');
 assert.throws(()=>requireConstructor('fixture','Runtime',f),e=>e.code==='PLUGIN_EXPORT_TYPE');
});
test('a broken diagnostic observer cannot prevent remaining cleanup',()=>{const released=[],scope=new ResourceScope(()=>{throw Error('diagnostic fixture');});scope.own(()=>released.push('released'));scope.own(()=>{throw Error('release fixture');});scope.dispose();assert.deepEqual(released,['released']);});
test('workspace authority rejects late context, bridge and generation completions independently',async()=>{
 const source=await readFile(new URL('../packages/explorer-ui/src/core/session/workspace-session.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const {WorkspaceSession}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const session=new WorkspaceSession(),bridge={},context={threadId:'local'};
 session.bridge=bridge;session.context=context;session.threadId='local';
 assert.equal(session.matches(bridge,context,0),true);
 session.generation++;assert.equal(session.matches(bridge,context,0),false);
 assert.equal(session.matches(bridge,context,1),true);
 session.bridge={};assert.equal(session.matches(bridge,context,1),false);
 session.bridge=bridge;session.context={...context};assert.equal(session.matches(bridge,context,1),false);
 session.context=context;session.threadId='other';assert.equal(session.matches(bridge,context,1),false);
});
test('runtime graph rejects cycles and current contracts have no implementation dependencies',async()=>{assert.equal(cycles(new Map([['a',['b']],['b',['a']]])).length,1);assert.equal(cycles(new Map([['a',['a']]])).length,1);assert.equal(cycles(new Map([['a',['b']],['b',[]]])).length,0);assert.equal((await checkArchitecture()).cycles,0);});
test('all three standalone workers exactly match shared sources and language/storage contracts',()=>{assert.equal(generateInstaller().length,3);});
test('native failure correlation stays bounded and never replaces raw error evidence',async()=>{
 const source=await readFile(new URL('../packages/explorer-ui/src/host/bridge/fault-correlation.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const {nativeFailureCorrelation}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const data={fault:{schema:2,failureRef:'bridge-3-cle-42',requestRef:'cle-42',lifecycleEpoch:3}};
 assert.deepEqual(nativeFailureCorrelation({data}),{failureRef:'bridge-3-cle-42',requestRef:'cle-42',lifecycleEpoch:3,propagatedFailure:true});
 assert.deepEqual(nativeFailureCorrelation({data:{fault:{schema:2,failureRef:'x'.repeat(500)}}}),{});
 assert.deepEqual(nativeFailureCorrelation(new Error('original failure')),{});
});
async function fixture(){const repo=await mkdtemp(resolve(tmpdir(),'cc-distribution-')),root=resolve(repo,'packages/ui'),bytes=Buffer.from('verified fixture asset');await mkdir(resolve(repo,'resources'),{recursive:true});await mkdir(resolve(repo,'releases/plugins/appearance/fixture'),{recursive:true});await mkdir(resolve(root,'src'),{recursive:true});await writeFile(resolve(root,'src/plugin.ts'),'fixture-source');await writeFile(resolve(repo,'releases/plugins/appearance/fixture/fixture.js'),bytes);const p={id:'fixture',name:'Fixture',category:'appearance',api:1,version:'1.0.0',releaseTag:'v0.1.0',asset:'fixture.js',size:bytes.length,sha256:digest(bytes),resources:[]};const lock={schema:1,packages:[{descriptor:p,inputs:{'src/plugin.ts':digest(Buffer.from('fixture-source'))},artifactRoot:'releases/plugins/appearance/fixture'}]};await writeFile(resolve(repo,'resources/plugin-distribution.lock.json'),JSON.stringify(lock));return{repo,root,lock};}

test('build metadata excludes the application version and unrelated plugin declarations',async()=>{
 const f=await fixture();try{
  await mkdir(resolve(f.root,'default-media'),{recursive:true});await mkdir(resolve(f.root,'node_modules/esbuild'),{recursive:true});
  await writeFile(resolve(f.root,'default-media/manifest.json'),'{"version":1,"plugins":{}}');
  await writeFile(resolve(f.root,'node_modules/esbuild/package.json'),'{"version":"0.25.8"}');
  const definition=f.lock.packages[0].descriptor,path=resolve(f.repo,'resources/plugin-definitions.json');
  await writeFile(path,JSON.stringify({plugins:[definition]}));await writeFile(resolve(f.root,'package.json'),'{"version":"0.1.0"}');
  const before=await fingerprintBuildMetadata(f.root,'fixture');
  await writeFile(resolve(f.root,'package.json'),'{"version":"99.0.0"}');await writeFile(path,JSON.stringify({plugins:[definition,{...definition,id:'other',version:'2.0.0'}]}));
  assert.deepEqual(await fingerprintBuildMetadata(f.root,'fixture'),before);
  await writeFile(path,JSON.stringify({plugins:[{...definition,version:'1.0.1'}]}));
  assert.notEqual((await fingerprintBuildMetadata(f.root,'fixture')).definition,before.definition);
 }finally{await rm(f.repo,{recursive:true,force:true});}
});
test('core-only builds retain the exact old plugin tag/hash and verified cached bytes',async()=>{const f=await fixture();try{const a=await prepareLockedPlugins(f.root);await writeFile(resolve(f.root,'package.json'),'{"version":"99.0.0"}');const b=await prepareLockedPlugins(f.root);assert.deepEqual(a,b);assert.equal(b[0].releaseTag,'v0.1.0');assert.equal(digest(await readFile(resolve(f.root,'dist/plugins/appearance/fixture/fixture.js'))),f.lock.packages[0].descriptor.sha256);}finally{await rm(f.repo,{recursive:true,force:true});}});
test('a dated resource tag relocates unchanged assets without rebuilding them',async()=>{
 const f=await fixture();try{
  await prepareLockedPlugins(f.root);const bytes=await readFile(resolve(f.root,'dist/plugins/appearance/fixture/fixture.js'));
  f.lock.packages[0].descriptor.releaseTag='plugin-assets-2026-10-18';
  await writeFile(resolve(f.repo,'resources/plugin-distribution.lock.json'),JSON.stringify(f.lock));
  const next=await prepareLockedPlugins(f.root);assert.equal(next[0].releaseTag,'plugin-assets-2026-10-18');
  assert.deepEqual(await readFile(resolve(f.root,'dist/plugins/appearance/fixture/fixture.js')),bytes);
  for(const tag of ['plugin-assets-latest','plugin-assets-2026-10-18/escape','plugin-assets-2026-10-18\n']){
   const invalid=structuredClone(f.lock);invalid.packages[0].descriptor.releaseTag=tag;
   assert.throws(()=>validateLock(invalid),/locked plugin identity/);
  }
 }finally{await rm(f.repo,{recursive:true,force:true});}
});
test('changed source or corrupt asset fails before replacing the last complete output',async()=>{const f=await fixture();try{await prepareLockedPlugins(f.root);const prior=await readFile(resolve(f.root,'dist/plugins/catalog.json'),'utf8');await writeFile(resolve(f.root,'src/plugin.ts'),'changed');await assert.rejects(prepareLockedPlugins(f.root),/source input changed/);assert.equal(await readFile(resolve(f.root,'dist/plugins/catalog.json'),'utf8'),prior);await writeFile(resolve(f.root,'src/plugin.ts'),'fixture-source');await writeFile(resolve(f.repo,'releases/plugins/appearance/fixture/fixture.js'),'corrupt');await assert.rejects(prepareLockedPlugins(f.root),/size\/SHA/);assert.equal(await readFile(resolve(f.root,'dist/plugins/catalog.json'),'utf8'),prior);}finally{await rm(f.repo,{recursive:true,force:true});}});
test('duplicate or malformed distribution identity is rejected',async()=>{const f=await fixture();try{assert.throws(()=>validateLock({...f.lock,packages:[...f.lock.packages,...f.lock.packages]}),/duplicate/);const bad=structuredClone(f.lock);bad.packages[0].descriptor.sha256='0';assert.throws(()=>validateLock(bad),/asset identity/);}finally{await rm(f.repo,{recursive:true,force:true});}});


test('background lease rejects competing and superseded work without releasing a newer owner',async()=>{
 const source=await readFile(new URL('../packages/explorer-ui/src/core/lifecycle/appearance-coordinator.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const {AppearanceCoordinator}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const owner=new AppearanceCoordinator(),old=owner.acquire();assert.ok(old);assert.equal(owner.acquire(),undefined);
 owner.invalidate();const current=owner.acquire();assert.ok(current);assert.throws(()=>old.assertCurrent(),{name:'AbortError'});
 old.release();assert.equal(owner.busy,true);current.assertCurrent();current.release();current.release();assert.equal(owner.busy,false);
 owner.pluginPending=true;assert.equal(owner.acquire(),undefined);
});
