// One source of truth for native, renderer and the removal helper left after EXE deletion.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {verifyDomainCatalogs} from './localization-catalogs.mjs';
export function checkCatalogs(write=false){
 verifyDomainCatalogs(write);
 const root=resolve(import.meta.dirname,'..');
 const load=name=>{
  const bytes=readFileSync(resolve(root,`resources/i18n/${name}.json`));
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes),data=JSON.parse(source);
  assert.equal((source.match(/^  "[^"\r\n]+":/gm)??[]).length,Object.keys(data).length,`${name}: duplicate or noncanonical keys`);
  return data;
 };
 const en=load('en'),zh=load('zh-CN');assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort());
 for(const key of Object.keys(en)){
  assert(typeof en[key]==='string'&&en[key].trim()&&typeof zh[key]==='string'&&zh[key].trim(),key);
  const parameters=s=>(s.match(/\{[A-Za-z][A-Za-z0-9]*\}/g)??[]).sort();
  assert.deepEqual(parameters(en[key]),parameters(zh[key]),`Parameters: ${key}`);
 }
 // PowerShell reverse lookup is case-insensitive; setup title aliases must agree.
 const setupKeys=Object.keys(en).filter(k=>en[k].toLowerCase()==='code-codex setup');
 assert.equal(new Set(setupKeys.map(k=>zh[k])).size,1,'Setup title aliases disagree in Chinese');
 const translations=Object.fromEntries(Object.keys(en).map(k=>[en[k].toLowerCase(),zh[k]]));
 const block=`# language-resources:start\n# Generated from resources/i18n by scripts/check-i18n.mjs --write.\n$script:RemovalUiText = @'\n${JSON.stringify(translations,null,2)}\n'@ | ConvertFrom-Json\n# language-resources:end`;
 const path=resolve(root,'installer/Finalize-Uninstall.ps1'),source=readFileSync(path,'utf8').replaceAll('\r\n','\n');
 const generated=source.replace(/# language-resources:start[\s\S]*?# language-resources:end/,block);
 if(write)writeFileSync(path,generated);else assert.equal(source,generated,'Removal language resources are stale; run node scripts/check-i18n.mjs --write');
 const nativeSource=readFileSync(resolve(root,'installer/SettingsCleanupCA.cpp'),'utf8');
 const wide=value=>'L'+JSON.stringify(value).replace(/[^\x00-\x7f]/gu,c=>c.codePointAt(0)>0xffff?'\\U'+c.codePointAt(0).toString(16).padStart(8,'0'):'\\u'+c.codePointAt(0).toString(16).padStart(4,'0'));
 const nativeKeys=Object.keys(en).filter(key=>nativeSource.includes('L'+JSON.stringify(en[key])));
 for(const match of nativeSource.matchAll(/ReportInstallerError\(\s*install,\s*L("(?:[^"\\]|\\.)*")/g))assert(Object.values(en).includes(JSON.parse(match[1])),`Untranslated MSI error: ${match[1]}`);
 const header='// Generated from resources/i18n; run node scripts/check-i18n.mjs --write.\n#pragma once\n#include <array>\n#include <string_view>\n#include <utility>\ninline constexpr std::array<std::pair<std::wstring_view,std::wstring_view>,'+nativeKeys.length+'> CodeCodexLanguageEntries{{\n'+nativeKeys.map(key=>'    {'+wide(en[key])+','+wide(zh[key])+'}').join(',\n')+'\n}};\n';
 const headerPath=resolve(root,'installer/LanguageResources.h');
 if(write)writeFileSync(headerPath,header);else assert.equal(readFileSync(headerPath,'utf8').replaceAll('\r\n','\n'),header,'MSI language resources are stale');
 return Object.keys(en).length;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))console.log(`Language catalogs: ${checkCatalogs(process.argv.includes('--write'))} aligned keys`);
