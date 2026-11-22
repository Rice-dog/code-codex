import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {launchFixture} from './browser-fixture.mjs';

const ui = resolve('packages/explorer-ui');
const {build} = createRequire(resolve(ui, 'package.json'))('esbuild');
const bundle = await build({
  stdin: {resolveDir:ui, contents:`
    import {ManagedBackgroundController} from './src/plugin-host/backgrounds/managed';
    import {BackgroundActions} from './src/core/appearance/background-actions';
    import {AppearanceCoordinator} from './src/core/lifecycle/appearance-coordinator';
    window.createController = () => new ManagedBackgroundController({
      id:'test', packageId:'background', label:'Background', layerAttribute:'data-fixture-background',
      canvasClass:'fixture-canvas', defaults:{}, normalize:x=>x, read:()=>({}), persist:()=>{},
      color:()=> '#000000', deferPresentationUntilReady:true,
      create:()=>{window.canvasStarted++;return {ready:new Promise(resolve=>window.paint=resolve),
        replay(){},setSettings(){},dispose(){window.canvasReleased++;window.paint();}};}
    });
    window.BackgroundActions=BackgroundActions;window.AppearanceCoordinator=AppearanceCoordinator;
  `},
  bundle:true, format:'iife', write:false,
  define:{__CODE_CODEX_VERSION__:JSON.stringify('fixture'),__CODE_CODEX_PLUGIN_CATALOG__:'[]'},
  plugins:[{name:'controlled-official-appearance',setup(build) {
    build.onResolve({filter:/\/(theme-lease|plugin-load-diagnostics)$/}, args=>({path:args.path,namespace:'handoff-fixture'}));
    build.onLoad({filter:/.*/,namespace:'handoff-fixture'}, args=>({contents:args.path.endsWith('theme-lease')?`
      export const readCodexAppearanceTheme=async()=>window.theme;
      export const writeCodexAppearanceTheme=async value=>{
        if(value==='dark') await new Promise(resolve=>window.applyDark=resolve);
        window.theme=value;document.documentElement.dataset.theme=value;
      };
      export const readParticleThemeLease=()=>window.lease;
      export const writeParticleThemeLease=value=>{window.lease=value;};
      export const clearParticleThemeLease=()=>{window.lease=undefined;};
    `:`export const ensureBackgroundPackage=async()=>{window.packageLoads++;};`}));
  }}],
});
const browser = await launchFixture('data:text/html,%3C!doctype%20html%3E%3Cbody%3E');
try {
  await browser.evaluate(bundle.outputFiles[0].text);
  const first = await browser.evaluate(`(async()=>{
    window.theme='light';window.canvasStarted=window.canvasReleased=window.packageLoads=0;
    document.documentElement.dataset.theme='light';window.controller=createController();
    window.enableOperation=controller.enable(true);await new Promise(queueMicrotask);await new Promise(queueMicrotask);
    return {started:canvasStarted,requestDark:typeof window.applyDark==='function',presented:document.documentElement.hasAttribute('data-code-codex-particle-image-background')};
  })()`);
  assert.deepEqual(first,{started:1,requestDark:true,presented:false});
  const beforeFrame = await browser.evaluate(`(async()=>{
    applyDark();await new Promise(queueMicrotask);await new Promise(queueMicrotask);
    return {base:document.documentElement.style.getPropertyValue('--code-codex-particle-background'),opacity:document.querySelector('[data-fixture-background]').style.opacity,enabled:controller.enabled};
  })()`);
  assert.deepEqual(beforeFrame,{base:'#000000',opacity:'0',enabled:false});
  assert.deepEqual(await browser.evaluate(`(async()=>{
    paint();await enableOperation;const shown=controller.enabled&&document.querySelector('[data-fixture-background]').style.opacity==='1';
    await controller.disable();return {shown,theme,released:canvasReleased,loads:packageLoads,leftover:!!document.querySelector('[data-fixture-background]')||document.documentElement.hasAttribute('data-code-codex-particle-image-background')};
  })()`),{shown:true,theme:'light',released:1,loads:0,leftover:false});
  const handoff = await browser.evaluate(`(async()=>{
    const events=[],coordinator=new AppearanceCoordinator(),enabled=new Set(['old']);
    const former={enabled:true,async disable(){events.push('stop old');this.enabled=false;},async enable(){events.push('restore old');this.enabled=true;}};
    const next={enabled:false,async enable(prepared){events.push('enable new '+prepared);throw Error('fixture failure');}};
    const actions=new BackgroundActions({coordinator,enabled,connected:()=>true,entries:[{id:'old',label:'Old',runtime:former},{id:'new',label:'New',runtime:next}],prepare:async()=>{events.push('prepare');},ready:async()=>true,
      holdBacking:()=>{events.push('hold');return()=>events.push('release');},leaveNativeTransparency:async()=>{},reconcileNative:async()=>{},transferTheme:()=>{},committed:()=>{},changed:()=>{},suspendHealth:()=>{},resumeHealth:()=>{},failed:()=>{},announce:()=>{}});
    await actions.toggle('new');return {events,enabled:[...enabled]};
  })()`);
  assert.deepEqual(handoff,{events:['prepare','hold','stop old','enable new true','restore old','release'],enabled:['old']});
  console.log('PASS: parallel theme and canvas preparation, dark backing before first frame, once-only package preparation and failed handoff restoration.');
} finally {
  await browser.close();
}
