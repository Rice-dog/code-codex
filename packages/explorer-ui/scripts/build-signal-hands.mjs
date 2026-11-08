import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildBackgroundWorker } from './build-background-worker.mjs';
import { sourcePackage } from './plugin-source-definition.mjs';

export async function buildSignalHands(root, options, outputRoot = resolve(root, 'dist/plugins')) {
  const id = 'signal-hands';
  const definition = sourcePackage(id);
  const sources = resolve(root, 'plugins/appearance', id);
  const output = resolve(outputRoot, 'appearance', id);
  const asset = `CodeCodex-background-${id}-${definition.version}.js`;
  await mkdir(output, { recursive: true });

  const canvas2d = {
    name: 'signal-hands-canvas2d',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/worker-environment$/ }, () => ({ path: resolve(sources, 'canvas-environment.ts') }));
    },
  };
  const worker = await buildBackgroundWorker(root, {
    ...options, loader: { ...options.loader, '.webp': 'binary' }, plugins: [...options.plugins ?? [], canvas2d],
  }, '', '', "export {kernelMethods, createKernel} from './plugins/appearance/signal-hands/kernel.js';");
  const result = await build({
    ...options, define: { ...options.define, __SIGNAL_HANDS_WORKER__: JSON.stringify(worker.source),
      __SIGNAL_HANDS_VERSION__: JSON.stringify(definition.version) },
    entryPoints: [resolve(sources, 'package.ts')], outfile: resolve(output, asset),
    metafile: true, format: 'iife', sourcemap: false, minify: true,
  });
  Object.assign(result.metafile.inputs, worker.inputs);
  await writeFile(resolve(output, id + '.metafile.json'), JSON.stringify(result.metafile));
  const bytes = await readFile(resolve(output, asset));
  const descriptor = {
    ...definition, asset, relativePath: asset, size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    resources: [], source: 'https://github.com/Rice-dog/code-codex',
  };
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(descriptor, null, 2) + '\n');
  for (const name of ['README.md', 'THIRD_PARTY_NOTICES_EN.md']) {
    await copyFile(resolve(sources, name), resolve(output, name));
  }
  return descriptor;
}
