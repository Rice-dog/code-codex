import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { launchFixture } from './browser-fixture.mjs';

const ui = resolve('packages/explorer-ui');
const { build } = createRequire(resolve(ui, 'package.json'))('esbuild');
const image = readFileSync(resolve(ui, 'src/assets/welcome-banner.webp')).toString('base64');
const bundle = await build({
  stdin: { resolveDir: resolve(ui, 'src'), loader: 'ts', contents: `
    import './core/localization/runtime';
    import { applyLanguage } from './i18n';
    import { connectApplicationMenu } from './host/bridge/application-menu';
    import { openWelcomeFromMenu, reconcileFirstRunWelcome } from './first-run-welcome';
    import { disposeQuickTour, openQuickTour } from './quick-tour';
    import { welcomeSurfaceState } from './welcome-surface';
    window.footer = document.querySelector('#tree').attachShadow({mode:'open'});
    footer.innerHTML = '<button class="preview-market-button">Market</button><button class="status-code">0.6.40</button>';
    window.controlClicks = 0;
    footer.addEventListener('click', () => controlClicks++);
    document.querySelector('#code-codex-application-menu-trigger').addEventListener('click', () => controlClicks++);
    window.startTour = () => openQuickTour({explorerRoot: () => footer, revealExplorer: () => document.querySelector('#tree').hidden = false});
    window.stopTour = disposeQuickTour;
    window.reconcile = pending => reconcileFirstRunWelcome(pending ? __CODE_CODEX_WELCOME_ART__ : undefined, startTour);
    window.openWelcome = () => openWelcomeFromMenu(__CODE_CODEX_WELCOME_ART__, startTour);
    window.surface = welcomeSurfaceState;
    window.claims = 0;
    window.locale = (locale,revision) => applyLanguage({schema:1,locale,revision,source:'menu'});
    connectApplicationMenu(async (method,params) => {
      if(method!=='explorer.welcome.consume'||Object.keys(params).length)throw Error('Unexpected request');
      claims++;
      return {consumed: claims===1 || window.isolatedNewInstall === true};
    });
  ` },
  define: { __CODE_CODEX_WELCOME_ART__: JSON.stringify('data:image/webp;base64,'+image) },
  bundle: true, write: false,
});
const html = '<!doctype html><meta charset="utf-8"><style>#tree{position:fixed;left:12px;bottom:12px}</style><body><button data-app-shell-sidebar-trigger>Sidebar</button><div data-code-codex-application-menu><button id="code-codex-application-menu-trigger">Code-Codex</button></div><aside class="app-shell-left-panel">Files</aside><main class="main-surface"></main><div id="tree"></div><script src="/fixture.js"></script>';
const server = createServer((req, res) => {
  const js = req.url === '/fixture.js';
  res.setHeader('Content-Type', js ? 'text/javascript' : 'text/html;charset=utf-8');
  res.end(js ? bundle.outputFiles[0].contents : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchFixture(`http://127.0.0.1:${server.address().port}/`);
  const evaluate = expression => browser.evaluate(expression);
  const settle = 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))';
  await evaluate(`locale('zh-CN',1);reconcile(false);${settle}`);
  assert.equal(await evaluate('claims'),0,'Older installation without a pending marker performs no consume call');
  await evaluate(`window.visibility='hidden';Object.defineProperty(document,'visibilityState',{get:()=>visibility});reconcile(true);${settle}`);
  assert.equal(await evaluate('surface()'),'waiting');
  await evaluate(`visibility='visible';document.dispatchEvent(new Event('visibilitychange'));${settle}`);
  assert.equal(await evaluate('surface()'),'unready');
  assert.equal(await evaluate('claims'),0,'The mounted shell must also have visible native content');
  await evaluate(`document.querySelector('main').innerHTML='<form><input></form><div data-app-startup-loading></div>';document.body.insertAdjacentHTML('beforeend','<div class="code-codex-startup-host" popover="manual"></div>');${settle}`);
  assert.equal(await evaluate('surface()'),'waiting');
  assert.equal(await evaluate('claims'),0,'A startup overlay delays the welcome until its existing completion signal');
  await evaluate(`document.querySelector('.code-codex-startup-host').remove();window.dispatchEvent(new Event('code-codex:background-hold-changed'));${settle}`);
  assert.equal(await evaluate('claims'),0,'The native loading marker still prevents opening after the splash');
  await evaluate(`document.querySelector('[data-app-startup-loading]').removeAttribute('data-app-startup-loading');${settle}`);
  assert.deepEqual(await evaluate(`(async()=>{const d=document.querySelector('[data-code-codex-welcome]');const root=d.firstElementChild.shadowRoot;await root.querySelector('img').decode();return {title:root.querySelector('h2').textContent,shown:d.open&&getComputedStyle(d).visibility==='visible',claims,image:root.querySelector('img').naturalWidth};})()`),
    { title:'欢迎使用 Code-Codex', shown:true, claims:1, image:1440 });
  await evaluate(`locale('en',2);${settle}`);
  assert.equal(await evaluate("document.querySelector('[data-code-codex-welcome]').firstElementChild.shadowRoot.querySelector('h2').textContent"),'Welcome to Code-Codex');
  await evaluate(`const d=document.querySelector('[data-code-codex-welcome]');d.dispatchEvent(new Event('cancel',{cancelable:true}));${settle}`);
  assert.equal(await evaluate("!!document.querySelector('[data-code-codex-welcome]')"),false);
  await evaluate(`reconcile(true);${settle}`);
  assert.equal(await evaluate('claims'),2,'A second document with a stale pending snapshot may request but cannot show');
  assert.equal(await evaluate("!!document.querySelector('[data-code-codex-welcome]')"),false);
  const tour = 'document.querySelector("[data-code-codex-quick-tour]")';
  const welcomeButtons = 'document.querySelector("[data-code-codex-welcome]").firstElementChild.shadowRoot';
  await evaluate(`window.isolatedNewInstall=true;locale('zh-CN',3);reconcile(true);${settle}`);
  assert.deepEqual(await evaluate(`[...${welcomeButtons}.querySelectorAll('footer button')].map(button=>button.textContent)`),['开始使用','快速介绍']);
  assert.deepEqual(await evaluate(`(() => {
    const dialog = document.querySelector('[data-code-codex-welcome]');
    const backdrop = getComputedStyle(dialog,'::backdrop');
    const node = ${welcomeButtons}.querySelector('[data-cancel]');
    const button = node.getBoundingClientRect();
    const cross = node.querySelector('svg').getBoundingClientRect();
    return {color:backdrop.backgroundColor,filter:backdrop.backdropFilter,dx:cross.x+cross.width/2-button.x-button.width/2,dy:cross.y+cross.height/2-button.y-button.height/2};
  })()`),{color:'rgba(0, 0, 0, 0)',filter:'none',dx:0,dy:0});
  await evaluate(`${welcomeButtons}.querySelector('[data-accept]').click()`);
  assert.equal(await evaluate(`!!${tour}`),false,'Start closes without starting the tour');
  await evaluate(`reconcile(true);${settle}`);
  await evaluate(`${welcomeButtons}.querySelector('[data-quick-tour]').click()`);
  assert.equal(await evaluate(`!!document.querySelector('[data-code-codex-welcome]')`),false);
  const inspect = () => evaluate(`(()=>{const t=${tour}.shadowRoot; const r=t.querySelector('.card').getBoundingClientRect();return {title:t.querySelector('h2').textContent,highlight:!t.querySelector('.highlight').hidden,fit:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}})()`);
  assert.deepEqual(await inspect(),{title:'插件市场',highlight:true,fit:true});
  assert.match(await evaluate(`getComputedStyle(${tour}.shadowRoot.querySelector('.highlight')).boxShadow`),/^rgba\(0, 0, 0, 0\.2\) 0px 0px 0px [1-9]\d+px$/);
  await browser.command('Emulation.setDeviceMetricsOverride',{width:320,height:300,deviceScaleFactor:1,mobile:false});
  await evaluate(`${tour}.shadowRoot.querySelector('[data-next]').click();${settle}`);
  assert.deepEqual(await inspect(),{title:'检查更新',highlight:true,fit:true});
  await evaluate(`${tour}.shadowRoot.querySelector('[data-next]').click()`);
  assert.deepEqual(await inspect(),{title:'Code-Codex 菜单',highlight:true,fit:true});
  await evaluate(`${tour}.shadowRoot.querySelector('[data-next]').click()`);
  assert.equal(await evaluate(`!!${tour}`),false);
  await evaluate(`document.querySelector('#tree').hidden=true;locale('en',4);startTour();${settle}`);
  assert.deepEqual(await inspect(),{title:'Plugin Market',highlight:false,fit:true});
  await evaluate(`${tour}.shadowRoot.querySelector('[data-reveal]').click();${settle}`);
  assert.deepEqual(await inspect(),{title:'Plugin Market',highlight:true,fit:true});
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
  assert.equal(await evaluate(`!!${tour}`),false);
  await evaluate(`startTour();${tour}.shadowRoot.querySelector('[data-skip]').click()`);
  assert.equal(await evaluate(`!!${tour}`),false);
  assert.equal(await evaluate('controlClicks'),0,'Tour did not click an update, market or menu target');
  await evaluate('startTour();startTour()');
  assert.equal(await evaluate('document.querySelectorAll("[data-code-codex-quick-tour]").length'),1);
  await evaluate('stopTour()');
  assert.equal(await evaluate(`!!${tour}`),false);
  const originalClaims = await evaluate('claims');
  await evaluate(`openWelcome();${settle}`);
  assert.equal(await evaluate(`!!${tour}`),false,'The menu welcome does not immediately start the guide');
  assert.deepEqual(await evaluate(`[...${welcomeButtons}.querySelectorAll('footer button')].map(button=>button.textContent)`),['Get started','Quick tour']);
  await evaluate(`${welcomeButtons}.querySelector('[data-accept]').click()`);
  assert.equal(await evaluate(`!!${tour} || !!document.querySelector('[data-code-codex-welcome]')`),false);
  await evaluate(`openWelcome();openWelcome();${settle}`);
  assert.equal(await evaluate('document.querySelectorAll("[data-code-codex-welcome]").length'),1);
  await evaluate(`${welcomeButtons}.querySelector('[data-quick-tour]').click()`);
  assert.deepEqual(await inspect(),{title:'Plugin Market',highlight:true,fit:true});
  await evaluate('stopTour()');
  assert.equal(await evaluate('claims'),originalClaims,'Manual welcome never claims the native first-install marker');
  console.log('First-run welcome and quick tour: admission, both actions, localization, three real anchors, narrow layout, folded tree, Escape, Skip, Done, replay and cleanup passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
