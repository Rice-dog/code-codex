import {sourcePackage} from './plugin-source-definition.mjs';
import { build } from 'esbuild';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import {buildBackgroundWorker} from './build-background-worker.mjs';

export const definitions = [
  ['glow-horizon','Glow Horizon Background','GlowHorizonRenderer'],
  ['black-hole','Black Hole Background','BlackHoleRenderer'],
  ['heavenly-cloud','Heavenly Cloud Background','HeavenlyCloudRenderer'],
  ['aurora-ionosphere','Aurora Ionosphere Background','AuroraIonosphereRenderer'],
  ['milky-way','Milky Way Background','MilkyWayRenderer'],
  ['mountain','Layered Mountain Background','MountainRenderer'],
  ['cloud-train','Cloud Train Background','CloudTrainRenderer'],
  ['blinking-squares','Blinking Squares Background','BlinkingSquaresRenderer'],
  ['particle-image','Particle Image Background','ParticleImageRenderer'],
  ['pixel-sculpt','Pixel Sculpt Background','PixelSculptRenderer'],
];
export async function buildBackgroundPackages(root, options, outputRoot=resolve(root, 'dist/plugins')) {
  const dir = outputRoot;
  await rm(dir, { recursive:true, force:true });
  await mkdir(dir, { recursive: true });
  const catalog = [];
  const mediaManifest = JSON.parse(await readFile(resolve(root, 'default-media/manifest.json'), 'utf8'));
  const notices = await readFile(resolve(root, "../..", "THIRD_PARTY_NOTICES_EN.md"), "utf8");
  for (const [id, name, renderer] of definitions) {
    const banner=await readFile(resolve(root,'../../resources/plugin-banners',id+'.txt'),'utf8');
    const images = mediaManifest.plugins[id] ?? [];
    const packageVersion = sourcePackage(id).version;
    const releaseTag=sourcePackage(id).releaseTag;
    const pluginDir=resolve(dir,'appearance',id);
    await mkdir(resolve(pluginDir,'media'),{recursive:true});
    const resources = [];
    for (const item of images) {
      const original=await readFile(resolve(root,'default-media',id,item.file));
      if(original.length!==item.size||createHash('sha256').update(original).digest('hex')!==item.sha256)throw Error(`Default media ${id}/${item.file} failed verification`);
      const asset=`CodeCodex-background-${id}-image-${item.sha256.slice(0,16)}.png`;
      const relativePath=`media/${asset}`;
      const image={...item};delete image.file;delete image.thumbnailFile;delete image.thumbnailSha256;
      if(item.thumbnailFile){
        const thumbnail=await readFile(resolve(root,'default-media',id,item.thumbnailFile));
        if(createHash('sha256').update(thumbnail).digest('hex')!==item.thumbnailSha256)throw Error(`Thumbnail ${id} failed verification`);
        const thumbAsset=`CodeCodex-background-${id}-thumbnail-${item.sha256.slice(0,16)}.png`;
        const thumbPath=`media/${thumbAsset}`;
        await writeFile(resolve(pluginDir,thumbPath),thumbnail);
        resources.push({asset:thumbAsset,relativePath:thumbPath,kind:'thumbnail',size:thumbnail.length,sha256:item.thumbnailSha256});
        image.thumbnailAsset=thumbAsset;
      }
      await writeFile(resolve(pluginDir,relativePath),original);
      resources.push({asset,relativePath,kind:'image',size:original.length,sha256:item.sha256,image});
    }
    const module = id === 'particle-image' ? 'particle-image-startup' : id === 'pixel-sculpt' ? 'pixel-sculpt-renderer' : id === 'blinking-squares' ? 'blinking-squares-host' : 'startup-background-renderers';
    const helpers = id === 'glow-horizon' ? ',populateGlowHorizonLayer,readGlowHorizonBackgroundSettings' : '';
    const isolated=['black-hole','heavenly-cloud','aurora-ionosphere','milky-way','mountain','cloud-train','blinking-squares'].includes(id);
    const worker=id==='pixel-sculpt'?await buildBackgroundWorker(root,options,'','',`export {pixelMethods as kernelMethods,createPixelKernel as createKernel} from './src/core/background-runtime/pixel-kernel';`):id==='particle-image'?await buildBackgroundWorker(root,options,'','',`export {particleMethods as kernelMethods,createParticleKernel as createKernel} from './src/core/background-runtime/particle-kernel';`):isolated?await buildBackgroundWorker(root,options,id==='blinking-squares'?'src/blinking-squares-kernel.ts':id==='black-hole'?'src/core/background-runtime/black-hole-kernel.ts':`src/${module}.ts`,id==='blinking-squares'?'BlinkingSquaresKernel':renderer):undefined;
    const workerConstructor=id==='blinking-squares'?`constructor(host,settings,onError){const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';host.append(canvas);super(${JSON.stringify(id)},${JSON.stringify(worker?.source)},host,canvas,settings,onError);}`:`constructor(host,canvas,settings,onError){super(${JSON.stringify(id)},${JSON.stringify(worker?.source)},host,canvas,settings,onError);}`;
    const imports = id==='pixel-sculpt'?`import {PixelSculptRenderer as PixelHost} from './pixel-sculpt-renderer';import {PixelWorkerRenderer} from './core/background-runtime/pixel-worker-renderer';const PixelSculptRenderer=class extends PixelHost{constructor(layer,canvas,settings,onError,persist=true){super(layer,canvas,settings,onError,persist,(canvas,onError,state,emit)=>new PixelWorkerRenderer(${JSON.stringify(worker.source)},canvas,onError,state,emit));}};`:id==='particle-image'?`import {ParticleWorkerRenderer} from './core/background-runtime/particle-worker-renderer';const ParticleImageRenderer=class extends ParticleWorkerRenderer{constructor(canvas,onError,settings,transition,opening){super(${JSON.stringify(worker.source)},canvas,onError,settings,transition,opening);}};`:id==='black-hole'?`import {BlackHoleWorkerRenderer} from './core/background-runtime/black-hole-worker-renderer';const BlackHoleRenderer=class extends BlackHoleWorkerRenderer{constructor(host,canvas,settings,onError){super(${JSON.stringify(worker.source)},host,canvas,settings,onError);}};`:worker?`import {WorkerBackgroundRenderer} from './core/background-runtime/worker-renderer';const ${renderer}=class extends WorkerBackgroundRenderer{${workerConstructor}};`:`import {${renderer}${helpers}} from './${module}';`;
    let startup;
    let extra = '';
    if (id === 'particle-image') {
      extra = `import {mountParticleImageStartupBackground} from './particle-image-startup';`;
      startup = 'mountParticleImageStartupBackground(target,onError,ParticleImageRenderer)';
    } else if (id === 'pixel-sculpt') {
      extra = `import {mountPixelSculptStartupBackground} from './pixel-sculpt-renderer';`;
      startup = 'mountPixelSculptStartupBackground(target,canvas,onError,PixelSculptRenderer)';
    } else if (id === 'glow-horizon') {
      startup = '(populateGlowHorizonLayer(target,readGlowHorizonBackgroundSettings()),new GlowHorizonRenderer(target,readGlowHorizonBackgroundSettings()))';
    } else {
      const settings = { 'black-hole':'readBlackHoleBackgroundSettings','heavenly-cloud':'readHeavenlyCloudBackgroundSettings','aurora-ionosphere':'readAuroraIonosphereBackgroundSettings','milky-way':'readMilkyWayBackgroundSettings','mountain':'readMountainBackgroundSettings','cloud-train':'readCloudTrainBackgroundSettings','blinking-squares':'readBlinkingSquaresBackgroundSettings' }[id];
      extra = `import {${settings}} from './startup-background-renderers';`;
      startup = id === 'blinking-squares' ? `new ${renderer}(target,{...${settings}(),paused:false},onError)` : `new ${renderer}(target,canvas,{...${settings}(),paused:false},onError)`;
    }
    const needsCanvas = !['glow-horizon','blinking-squares','particle-image'].includes(id);
    const prepare = images.length ? `()=>prepareDefaultImageLibrary(${JSON.stringify(id)})` : '()=>Promise.resolve()';
    if (images.length) extra += `import {prepareDefaultImageLibrary} from './default-image-library';`;
    let contents = `${imports}${extra}\nconst host=window;const key=Symbol.for('code-codex:background-modules:v1');const registry=host[key]??(host[key]=new Map());const prepareDefaults=${prepare};registry.set(${JSON.stringify(id)},{id:${JSON.stringify(id)},api:1,version:${JSON.stringify(packageVersion)},prepareDefaults,exports:{${renderer}${id === 'glow-horizon' ? ',populateGlowHorizonLayer' : ''}},startup(target,onError){let instance,disposed=false;const ready=Promise.resolve().then(()=>{if(disposed)throw new Error('Startup background preparation was canceled');${needsCanvas ? "const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);" : ''}instance=${startup};return instance.ready;});void ready.catch(()=>{});return {ready,dispose(){disposed=true;instance?.dispose();}};}});`;
    if (!images.length) contents = `${imports}${extra}\nconst host=window;const key=Symbol.for('code-codex:background-modules:v1');const registry=host[key]??(host[key]=new Map());registry.set(${JSON.stringify(id)},{id:${JSON.stringify(id)},api:1,version:${JSON.stringify(packageVersion)},exports:{${renderer}${id === 'glow-horizon' ? ',populateGlowHorizonLayer' : ''}},startup(target,onError){${needsCanvas ? "const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);" : ''}return ${startup};}});`;
    const asset = `CodeCodex-background-${id}-${packageVersion}.js`;
    await build({ ...options, banner:{js:banner}, sourcemap:false, metafile:true, stdin: { contents, resolveDir:resolve(root,'src'), sourcefile:`background-${id}.ts`, loader:'ts' }, format:'iife', minify:true, outfile:resolve(pluginDir,asset) }).then(async result => { if(worker)Object.assign(result.metafile.inputs,worker.inputs);await writeFile(resolve(pluginDir,`${id}.metafile.json`),JSON.stringify(result.metafile)); });
    const bytes = await readFile(resolve(pluginDir,asset));
    if (bytes.length > 4 * 1024 * 1024) throw new Error(`Background ${id} exceeds the 4 MiB bounded script channel`);
    const descriptor = { id, name, category:"appearance", api:1, version:packageVersion, releaseTag, size:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), asset, relativePath:asset, resources, galleryVersion:mediaManifest.version, defaultImageCount:images.length, capabilities:["background", "startup", "preview"], source:"https://github.com/Rice-dog/code-codex", notices:"THIRD_PARTY_NOTICES_EN.md" };
    catalog.push(descriptor);
    await writeFile(resolve(pluginDir,'manifest.json'),JSON.stringify(descriptor,null,2)+'\n');
    await writeFile(resolve(pluginDir,'README.md'),`# ${name}\n\nAPI 1; package ${packageVersion}. Main script: ${asset}.\n\nThe media directory contains ${images.length} approved original PNG images and their thumbnails, independently pinned by manifest hashes. Downloads do not automatically enable a plugin. Startup uses the already verified cache with no network request.\n\nSource and visual provenance: https://github.com/Rice-dog/code-codex\n`);
    await writeFile(resolve(pluginDir,'THIRD_PARTY_NOTICES_EN.md'),notices);
  }
  await writeFile(resolve(dir,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
  return catalog;
}
