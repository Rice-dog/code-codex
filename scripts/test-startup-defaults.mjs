import assert from 'node:assert/strict';
import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..');
const expected={enabled:false,source:'video',backgroundId:'particle-image',backgroundFadeSeconds:3,minimumVisiblePercent:45,fadePercent:3,clipStart:29,clipEnd:60.093016,playbackRate:1,videoBrightness:1.4,videoFit:'cover'};
const source=buildSync({stdin:{contents:"import {DEFAULT_STARTUP_TRANSITION_SETTINGS,readStartupTransitionSettings,startupDefaultClip} from './startup-transition-plugin';window.defaultsFixture={defaults:DEFAULT_STARTUP_TRANSITION_SETTINGS,read:readStartupTransitionSettings,clip:startupDefaultClip};",resolveDir:resolve(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,write:false,format:'iife',define:{__CODE_CODEX_STARTUP_TRANSITION_CSS__:JSON.stringify(readFileSync(resolve(root,'packages/explorer-ui/src/startup-transition.css'),'utf8'))}}).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body>Settings fixture</body>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const report={version:JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version,checks:[]};
const check=(name,value,expectedValue)=>{assert.deepEqual(value,expectedValue,name);report.checks.push({name,value});};
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
 for(let i=0;i<200&&!(await browser.evaluate('location.protocol==="http:"&&document.readyState==="complete"'));i++)await delay(40);
 await browser.evaluate(source);
 check('fresh installation uses current parameter defaults with enable controlled by user',await browser.evaluate('defaultsFixture.read()'),expected);
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1','{}')`);
 check('missing individual parameters use the same defaults',await browser.evaluate('defaultsFixture.read()'),expected);
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1','{broken')`);
 check('malformed settings recover to current defaults',await browser.evaluate('defaultsFixture.read()'),expected);
 const personal={...expected,enabled:true,source:'background',backgroundId:'milky-way',backgroundFadeSeconds:.7,minimumVisiblePercent:62,fadePercent:11,clipStart:2,clipEnd:17,playbackRate:1.5,videoBrightness:.65,videoFit:'contain'};
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',${JSON.stringify(JSON.stringify(personal))})`);
 check('existing personal settings are preserved',await browser.evaluate('defaultsFixture.read()'),personal);
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({clipStart:0,clipEnd:20,playbackRate:2,minimumVisibleMs:2500,exitDurationMs:1000}))`);
 const legacy=await browser.evaluate('defaultsFixture.read()');check('legacy millisecond timing retains its clip-relative meaning',[legacy.minimumVisiblePercent,legacy.fadePercent],[25,10]);
 for(const [duration,range]of [[undefined,[29,60.093016]],[120,[29,60.093016]],[60,[29,60]],[30,[29,30]],[29,[0,29]],[1.2,[0,1.2]],[.05,[0,.05]]]){
  const actual=await browser.evaluate(`defaultsFixture.clip(${duration??'undefined'})`);
  check(`default trim stays valid for duration ${duration}`,[actual.clipStart,actual.clipEnd],range);
 }
}catch(error){report.failure=error.stack;throw error;}
finally{await browser?.close();await new Promise(r=>server.close(r));mkdirSync(resolve(root,'artifacts/startup-defaults'),{recursive:true});writeFileSync(resolve(root,'artifacts/startup-defaults/result.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
