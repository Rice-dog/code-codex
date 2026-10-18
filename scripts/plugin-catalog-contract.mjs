import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from '../packages/explorer-ui/node_modules/typescript/lib/typescript.js';
const builders=[['background-packages.mjs','appearance','definitions'],['utility-packages.mjs',null,'definitions'],['file-preview-packages.mjs','file-preview','filePreviewDefinitions'],['build-startup-package.mjs','appearance','id'],['build-custom-background.mjs','appearance','id']];
export function declaredPluginCategories(root=resolve(import.meta.dirname,'..')){
 const ids=new Map();
 for(const [file,category,binding]of builders){
  const path=resolve(root,'packages/explorer-ui/scripts',file),source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);assert.equal(source.parseDiagnostics.length,0,`Builder syntax: ${file}`);let found=false;
  const add=(id,kind)=>{assert.ok(typeof id==='string'&&id.length&&typeof kind==='string',`Literal declaration: ${file}`);assert.ok(!ids.has(id),`Duplicate plugin declaration: ${id}`);ids.set(id,kind);};
  function visit(node){
   if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===binding){
    found=true;
    if(binding==='id'){assert.ok(node.initializer&&ts.isStringLiteral(node.initializer),`Literal ID: ${file}`);add(node.initializer.text,category);}
    else{assert.ok(node.initializer&&ts.isArrayLiteralExpression(node.initializer),`Literal definition list: ${file}`);for(const tuple of node.initializer.elements){assert.ok(ts.isArrayLiteralExpression(tuple)&&ts.isStringLiteral(tuple.elements[0]),`Literal tuple: ${file}`);const kind=category??tuple.elements[2]?.text;add(tuple.elements[0].text,kind);}}
   }
   ts.forEachChild(node,visit);
  }visit(source);assert.ok(found,`Missing declaration binding ${file}:${binding}`);
 }return ids;
}
export function assertCatalogMatchesDeclarations(catalog,root){
 assert.ok(Array.isArray(catalog)&&catalog.length,'Nonempty plugin catalog');const expected=declaredPluginCategories(root),seen=new Set();
 for(const item of catalog){assert.ok(!seen.has(item.id),`Duplicate catalog ID: ${item.id}`);seen.add(item.id);assert.ok(expected.has(item.id),`Undeclared catalog ID: ${item.id}`);assert.equal(item.category,expected.get(item.id),`Category mismatch: ${item.id}`);}
 assert.deepEqual([...seen].sort(),[...expected.keys()].sort(),'Catalog must contain every current builder declaration exactly once');return expected;
}
