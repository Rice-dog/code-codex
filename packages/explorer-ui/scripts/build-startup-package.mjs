import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** Builds the optional player. dist/startup-early.js is a separate core loader only. */
export async function buildStartupPackage(root, options, hostVersion) {
  const id = 'codex-startup-transition', version = '1.1.18', category = 'appearance';
  const directory = resolve(root, 'dist/plugins', category, id);
  await mkdir(resolve(directory, 'resources'), { recursive: true });
  const asset = `CodeCodex-plugin-${id}-${version}.js`;
  const css = await readFile(resolve(root, 'src/startup-transition.css'), 'utf8');
  const result = await build({ ...options,
    define: { ...options.define, __CODE_CODEX_STARTUP_PACKAGE_VERSION__: JSON.stringify(version), __CODE_CODEX_STARTUP_TRANSITION_CSS__: JSON.stringify(css) },
    entryPoints: ['src/startup-transition-package-entry.ts'], format: 'iife', minify: true,
    sourcemap: false, metafile: true, outfile: resolve(directory, asset),
  });
  const bytes = await readFile(resolve(directory, asset));
  if (bytes.length > 1536 * 1024) throw new Error(`Startup player package exceeds its isolated 1.5 MiB budget: ${bytes.length}`);
  const descriptor = { id, name: 'Codex Startup Transition', category, api: 1, version,
    releaseTag: `v${hostVersion}`, asset, relativePath: asset, size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), resources: [],
    capabilities: ['startup', 'preview', 'video-storage'], networkDuringStartup: false,
    source: 'https://github.com/Rice-dog/code-codex', notices: 'THIRD_PARTY_NOTICES_EN.md' };
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(descriptor, null, 2) + '\n');
  await writeFile(resolve(directory, `${id}.metafile.json`), JSON.stringify(result.metafile));
  await writeFile(resolve(directory,'README.md'),'# Codex Startup Transition\n\nDownloadable API 1 player with the original video library, single-video preview and realtime trim, speed, brightness, fit and fade settings. Advanced tracks and Ctrl+S precomposition have been removed. Startup always plays the currently selected original local video without rotating library items or encoding a derived movie. Core retains a lightweight loading-page hook; playback failures preserve normal Codex startup.\n');
  await writeFile(resolve(directory,'resources/README.md'),'Original user videos and thumbnails stay in the existing local IndexedDB library and native media storage. No derived movie cache or advanced project is used. Default startup media remains independently downloadable.\n');
  await writeFile(resolve(directory,'THIRD_PARTY_NOTICES_EN.md'),await readFile(resolve(root,'../..','THIRD_PARTY_NOTICES_EN.md'),'utf8'));
  return descriptor;
}
