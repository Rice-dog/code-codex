import ts from '../packages/explorer-ui/node_modules/typescript/lib/typescript.js';
import {readFile, readdir} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'), ui=resolve(root,'packages/explorer-ui');
export function layerError(source,target) {
  source=source.replaceAll('\\','/');target=target.replaceAll('\\','/');
  if(/^src\/(?:core|features|plugin-host)\//.test(source)&&/^src\/app\//.test(target))return 'Domain imports application: '+source+' -> '+target;
  if(source.startsWith('src/features/plugin-settings/')&&target.startsWith('src/features/plugin-settings/')&&source!==target)return 'Settings imports sibling implementation: '+source+' -> '+target;
}
export function portErrors(source,file) {
  const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),errors=[];
  for(const it of sf.statements.filter(ts.isInterfaceDeclaration).filter(n=>/ControllerPorts$/.test(n.name.text))){
    for(const member of it.members)if(ts.isPropertySignature(member)&&!member.modifiers?.some(m=>m.kind===ts.SyntaxKind.ReadonlyKeyword))errors.push('Writable host field: '+file+'/'+member.name.getText(sf));
    for(const member of it.members)if(member.type?.kind===ts.SyntaxKind.AnyKeyword)errors.push('Untyped host capability: '+file+'/'+member.name.getText(sf));
    for(const member of it.members)if(member.type&&/\bExplorerBridge\b/.test(member.type.getText(sf)))errors.push('Feature requires concrete bridge instead of WorkspaceBridge: '+file+'/'+member.name.getText(sf));
    const owner={'particle':'particleBackgroundController','black-hole':'blackHoleBackgroundController','glow-horizon':'glowHorizonBackgroundController','heavenly-cloud':'heavenlyCloudBackgroundController','aurora-ionosphere':'auroraIonosphereBackgroundController','milky-way':'milkyWayBackgroundController','mountain':'mountainController','cloud-train':'cloudTrainController','pixel-sculpt':'pixelSculptController','blinking-squares':'blinkingSquaresController'}[file.split('/').at(-1).replace(/\.ts$/,'')];
    if(file.includes('/plugin-settings/')&&owner)for(const member of it.members)if(/Controller$/.test(member.name.getText(sf))&&member.name.getText(sf)!==owner)errors.push('Settings observes sibling runtime: '+file+'/'+member.name.getText(sf));
    if(owner)for(const member of it.members)if(member.name.getText(sf)===owner&&member.type&&ts.isTypeReferenceNode(member.type)&&/Controller$/.test(member.type.typeName.getText(sf)))errors.push('Concrete private runtime used as capability: '+file+'/'+owner);
  }
  const cl=sf.statements.find(ts.isClassDeclaration),methods=new Set(cl?.members.filter(ts.isMethodDeclaration).map(m=>m.name.getText(sf))??[]);
  function construction(node){if(ts.isNewExpression(node)&&node.expression.getText(sf)==='ExplorerBridge')errors.push('Feature constructs an authenticated bridge: '+file);ts.forEachChild(node,construction);}construction(sf);
  for(const it of sf.statements.filter(ts.isInterfaceDeclaration).filter(n=>/ControllerPorts$/.test(n.name.text)))for(const member of it.members)if(methods.has(member.name.getText(sf)))errors.push('Feature calls its own behavior through host: '+file+'/'+member.name.getText(sf));
  return errors;
}
export function unboundPortMethodErrors(source,checker) {
  const errors=[];
  function visit(node){
    if(ts.isGetAccessorDeclaration(node)&&ts.isObjectLiteralExpression(node.parent)&&node.body?.statements.length===1&&ts.isReturnStatement(node.body.statements[0])){
      const value=node.body.statements[0].expression;
      if(value&&ts.isPropertyAccessExpression(value)&&checker.getTypeAtLocation(value).getCallSignatures().length)errors.push('Unbound capability method: '+node.name.getText(source));
    }
    ts.forEachChild(node,visit);
  }
  visit(source);return errors;
}
async function files(directory) {
  return (await Promise.all((await readdir(directory,{withFileTypes:true})).map(e=>e.isDirectory()?files(resolve(directory,e.name)):/\.ts$/.test(e.name)?[resolve(directory,e.name)]:[]))).flat();
}
export function cycles(graph) {
  let sequence=0;const indexes=new Map(),low=new Map(),stack=[],active=new Set(),result=[];
  function visit(v){indexes.set(v,sequence);low.set(v,sequence++);stack.push(v);active.add(v);
    for(const w of graph.get(v)||[]){if(!graph.has(w))continue;if(!indexes.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));}else if(active.has(w))low.set(v,Math.min(low.get(v),indexes.get(w)));}
    if(low.get(v)===indexes.get(v)){const group=[];let w;do{w=stack.pop();active.delete(w);group.push(w);}while(w!==v);if(group.length>1||(graph.get(v)||[]).includes(v))result.push(group);}
  }
  for(const v of graph.keys())if(!indexes.has(v))visit(v);return result;
}
export async function checkArchitecture() {
  const paths=[...await files(resolve(ui,'src')),...await files(resolve(ui,'plugins'))],all=new Set(paths),graph=new Map(),errors=[];
  const config=ts.readConfigFile(resolve(ui,'tsconfig.json'),ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,ui),program=ts.createProgram(parsed.fileNames,parsed.options);
  errors.push(...unboundPortMethodErrors(program.getSourceFile(resolve(ui,'src/app/explorer-element.ts')),program.getTypeChecker()));
  for(const file of paths){
    const original=await readFile(file,'utf8'), relativeFile=relative(ui,file).replaceAll('\\','/');
    const raw=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true);
    for(const node of raw.statements)if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text.startsWith('.')){
      const target=relative(ui,resolve(dirname(file),node.moduleSpecifier.text+'.ts')).replaceAll('\\','/');const error=layerError(relativeFile,target);if(error)errors.push(error);
    }
    if(/^src\/features\/(?:workspace|plugin-settings)\//.test(relativeFile))errors.push(...portErrors(original,relativeFile));
    // Examine emitted imports: interfaces are not runtime dependencies, including
    // legacy imports whose syntax predates `import type`.
    const output=ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const sf=ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true),targets=[];
    const add=value=>{if(!value.startsWith('.'))return;const base=resolve(dirname(file),value),target=[base+'.ts',resolve(base,'index.ts')].find(p=>all.has(p));if(target)targets.push(target);};
    function walk(n){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))add(n.moduleSpecifier.text);if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0]))add(n.arguments[0].text);ts.forEachChild(n,walk);}walk(sf);
    graph.set(file,targets);
    if(file.includes('/contracts/')||file.includes('\\contracts\\'))for(const target of targets)if(!target.includes('/contracts/')&&!target.includes('\\contracts\\'))errors.push('Contract imports implementation: '+relative(ui,file)+' -> '+relative(ui,target));
  }
  for(const group of cycles(graph))errors.push('Runtime dependency cycle: '+group.map(p=>relative(ui,p)).join(' -> '));
  const contract=JSON.parse(await readFile(resolve(root,'resources/bridge-contract.json'),'utf8'));
  const router=await readFile(resolve(root,'crates/launcher/src/bridge/router.rs'),'utf8');
  const routed=[...new Set([...router.matchAll(/"(explorer\.[a-z]+(?:\.[a-z]+)*)"/g)].map(m=>m[1]))].sort();
  const declared=contract.methods.map(m=>m.name).sort();
  if(new Set(declared).size!==declared.length||JSON.stringify(routed)!==JSON.stringify(declared))errors.push('Native router and Bridge method contract differ.');
  const lock=JSON.parse(await readFile(resolve(root,'resources/plugin-distribution.lock.json'),'utf8'));
  const manifest=JSON.parse(await readFile(resolve(ui,'package.json'),'utf8'));
  if('pluginReleaseVersion' in (manifest.codeCodex??{})||'pluginReleaseOverrides' in (manifest.codeCodex??{}))errors.push('Application manifest must not own plugin distribution identities.');
  for(const item of lock.packages)for(const input of Object.keys(item.inputs))if(/(?:^|\/)src\/app\/|resources\/(?:i18n|localization)\//.test(input.replaceAll('\\','/')))errors.push('Optional package contains host composition or full language catalogs: '+item.descriptor.id+'/'+input);
  const bootstrap=resolve(ui,'src/app/composition.ts'), owner=resolve(ui,'src/app/explorer-element.ts');
  for(const file of paths.filter(p=>p.includes('plugins'+String.raw`\appearance`)||p.includes('/plugins/appearance/'))){
    const seen=new Set();function visit(p){if(seen.has(p))return;seen.add(p);for(const next of graph.get(p)||[])visit(next);}visit(file);
    for(const forbidden of [bootstrap,owner,resolve(ui,'src/core/localization/runtime.ts')])if(seen.has(forbidden))errors.push('Optional plugin imports host implementation: '+relative(ui,file)+' -> '+relative(ui,forbidden));
  }
  if(errors.length)throw Error(errors.join('\n'));
  return {files:paths.length,runtimeEdges:[...graph.values()].reduce((n,v)=>n+v.length,0),cycles:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkArchitecture().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
