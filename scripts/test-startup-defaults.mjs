import assert from 'node:assert/strict';
import {buildSync} from '../packages/explorer-ui/node_modules/esbuild/lib/main.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {launchFixture,delay} from './browser-fixture.mjs';
const root=resolve(import.meta.dirname,'..');
const expected={advancedOptions:false,project:null,videoClipDefaults:{},enabled:false,source:'video',backgroundId:'particle-image',backgroundFadeSeconds:3,minimumVisiblePercent:45,fadePercent:3,clipStart:29,clipEnd:60.093016,playbackRate:1,videoBrightness:1.4,videoFit:'cover',selectedVideoId:'selected',videoOrder:[],playbackMode:'sequence',nextVideoId:'selected',lastPlayedVideoId:'',videoProfiles:{}};
const source=buildSync({stdin:{contents:"import {DEFAULT_STARTUP_TRANSITION_SETTINGS,readStartupTransitionSettings,startupDefaultClip} from './startup-transition-plugin';window.defaultsFixture={defaults:DEFAULT_STARTUP_TRANSITION_SETTINGS,read:readStartupTransitionSettings,clip:startupDefaultClip};",resolveDir:resolve(root,'packages/explorer-ui/src'),loader:'ts'},bundle:true,write:false,format:'iife',define:{__CODE_CODEX_STARTUP_TRANSITION_CSS__:JSON.stringify(readFileSync(resolve(root,'packages/explorer-ui/src/startup-transition.css'),'utf8'))}}).outputFiles[0].text;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body>Settings fixture</body>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const report={version:JSON.parse(readFileSync(resolve(root,'packages/explorer-ui/package.json'),'utf8')).version,checks:[]};
const check=(name,value,expectedValue)=>{assert.deepEqual(value,expectedValue,name);report.checks.push({name,value});};
try{
 browser=await launchFixture(`http://127.0.0.1:${server.address().port}/`);
 for(let i=0;i<200&&!(await browser.evaluate('location.protocol==="http:"&&document.readyState==="complete"'));i++)await delay(40);
 await browser.evaluate(source);
 const nativeText=readFileSync(resolve(root,'crates/launcher/src/early_startup.rs'),'utf8');
 const queryLine=nativeText.split('\n').find(line=>line.includes('"expression"')&&line.includes('projectMode:'));
 const query=JSON.parse(queryLine.trim().slice('"expression":'.length).replace(/,$/,''));
 for(const [label,saved,expectedMode] of [['basic retained project',{advancedOptions:false,project:{version:1,tracks:[[],[]]}},false],['advanced enabled',{advancedOptions:true,project:{version:1,tracks:[[],[]]}},true],['legacy project migration',{project:{version:1,tracks:[[],[]]}},true],['old single video',{},false]]){
  await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',${JSON.stringify(JSON.stringify(saved))})`);
  check('native early selection '+label,(await browser.evaluate(query)).projectMode,expectedMode);
 }
 await browser.evaluate(`localStorage.removeItem('code-codex:startup-transition:v1')`);

 check('fresh installation uses current parameter defaults with enable controlled by user',await browser.evaluate('defaultsFixture.read()'),expected);
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1','{}')`);
 check('missing individual parameters use the same defaults',await browser.evaluate('defaultsFixture.read()'),expected);
 await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1','{broken')`);
 check('malformed settings recover to current defaults',await browser.evaluate('defaultsFixture.read()'),expected);
 const project={version:1,tracks:[[],[]]};
 for(const [name,flag,value] of [['existing project migrates advanced on',undefined,true],['explicit basic mode wins over retained project',false,false],['explicit advanced mode retained',true,true]]){
  await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',${JSON.stringify(JSON.stringify({project,advancedOptions:flag}))})`);
  check(name,await browser.evaluate('defaultsFixture.read().advancedOptions'),value);
 }
 for(const mode of ['fixed','random']){await browser.evaluate(`localStorage.setItem('code-codex:startup-transition:v1',JSON.stringify({playbackMode:'${mode}',selectedVideoId:'first',nextVideoId:'second'}))`);check('old '+mode+' preferences migrate to ordered looping',await browser.evaluate('defaultsFixture.read().playbackMode'),'sequence');check('native looping chooses same next source for old '+mode,(await browser.evaluate(query)).videoId,'second');}
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
