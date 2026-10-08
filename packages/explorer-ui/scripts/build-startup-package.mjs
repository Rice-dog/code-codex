import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** Builds the optional player. dist/startup-early.js is a separate core loader only. */
export async function buildStartupPackage(root, options, hostVersion) {
  const id = 'codex-startup-transition', version = '1.0.0', category = 'appearance';
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
  if (bytes.length > 512 * 1024) throw new Error(`Startup player package exceeds its isolated 512 KiB budget: ${bytes.length}`);
  const descriptor = { id, name: 'Codex Startup Transition', category, api: 1, version,
    releaseTag: `v${hostVersion}`, asset, relativePath: asset, size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), resources: [],
    capabilities: ['startup', 'preview', 'video-storage'], networkDuringStartup: false,
    source: 'https://github.com/Rice-dog/code-codex', notices: 'THIRD_PARTY_NOTICES_EN.md' };
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(descriptor, null, 2) + '\n');
  await writeFile(resolve(directory, `${id}.metafile.json`), JSON.stringify(result.metafile));
  await writeFile(resolve(directory, 'README.md'), '# Codex Startup Transition\n\nDownloadable API 1 player. Its verified local cache is loaded before the native loading-page hook, with no network request during startup. Core embeds only a lightweight loader and settings contract; the downloaded package supplies playback, media storage and timeline helpers. Missing or invalid cache skips animation and preserves normal Codex startup. Existing local video, trim, minimum duration, fade and background handoff settings are preserved.\n');
  await writeFile(resolve(directory, 'resources/README.md'), 'Selected user videos remain in their existing IndexedDB library. No personal or official promotional video is bundled with this package. Background startup sources use their independently downloaded, verified caches.\n');
  await writeFile(resolve(directory, 'THIRD_PARTY_NOTICES_EN.md'), await readFile(resolve(root, '../..', 'THIRD_PARTY_NOTICES_EN.md'), 'utf8'));
  return descriptor;
}
