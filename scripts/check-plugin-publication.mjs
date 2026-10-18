import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'Rice-dog/code-codex';
const root = resolve(import.meta.dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const tagPattern = /^v\d+\.\d+\.\d+$/;
const pluginTagPattern = /^(?:v\d+\.\d+\.\d+|plugin-assets-\d{4}-\d{2}-\d{2})(?![\s\S])/;
const component = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function catalogAssets(catalog) {
  if (!Array.isArray(catalog) || !catalog.length || catalog.length > 64) throw Error('Invalid catalog count');
  const assets = [], ids = new Set(), names = new Set();
  for (const p of catalog) {
    if (!p || !component.test(p.id) || ids.has(p.id) || !Array.isArray(p.resources) || p.resources.length > 128) {
      throw Error('Invalid or duplicate package descriptor');
    }
    ids.add(p.id);
    for (const a of [p, ...p.resources]) {
      const tag = a.releaseTag || p.releaseTag;
      if (!pluginTagPattern.test(tag) || !component.test(a.asset) || names.has(a.asset) ||
          !(a.asset.startsWith(`CodeCodex-plugin-${p.id}-`) || a.asset.startsWith(`CodeCodex-background-${p.id}-`)) ||
          !Number.isSafeInteger(a.size) || a.size < 1 || a.size > 64 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(a.sha256)) {
        throw Error(`Invalid or duplicate asset descriptor: ${p.id}`);
      }
      names.add(a.asset);
      assets.push({ id: p.id, tag, name: a.asset, size: a.size, sha256: a.sha256 });
    }
  }
  return assets;
}

export function githubRelease(tag) {
  try {
    const release = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/tags/${tag}`], {
      encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
    return { release };
  } catch (error) {
    const detail = String(error.stderr || '');
    if (/HTTP 404/.test(detail)) return { error: 'RELEASE_NOT_FOUND' };
    if (/HTTP (401|403|429)/.test(detail)) return { error: 'RELEASE_ACCESS_DENIED_OR_RATE_LIMITED' };
    return { error: 'RELEASE_QUERY_FAILED' };
  }
}

export async function downloadDigest(asset) {
  const url = `https://github.com/${repository}/releases/download/${asset.tag}/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.body) throw Error(`ASSET_HTTP_${response.status}`);
  const hash = createHash('sha256');
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > asset.size) throw Error('ASSET_DOWNLOAD_SIZE_MISMATCH');
      hash.update(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (size !== asset.size) throw Error('ASSET_DOWNLOAD_SIZE_MISMATCH');
  return hash.digest('hex');
}

/** Candidate mode only permits absent current-version assets, never corrupt or unknown old dependencies. */
export async function checkPublication({ catalog, version, candidate = false, pendingAssets = [], getRelease = githubRelease, getDigest = downloadDigest, verifyDownloads = false }) {
  const assets = catalogAssets(catalog), currentTag = `v${version}`;
  // An inherited local candidate can precede the current app version. It must
  // be listed by exact identity, never by a wildcard tag or an ignored failure.
  for(const pending of pendingAssets)if(!assets.some(a=>a.id===pending.id&&a.tag===pending.tag&&a.name===pending.name&&a.size===pending.size&&a.sha256===pending.sha256))throw Error('Invalid pending-publication identity');
  if (!tagPattern.test(currentTag)) throw Error('Invalid target version');
  const results = [], releases = new Map();
  for (const asset of assets) {
    if (!releases.has(asset.tag)) {
      try { releases.set(asset.tag, await getRelease(asset.tag)); }
      catch { releases.set(asset.tag, { error: 'RELEASE_QUERY_FAILED' }); }
    }
    const lookup = releases.get(asset.tag);
    const r = { ...asset, status: 'failed', code: '' };
    if (lookup?.error) r.code = lookup.error;
    else if (!lookup?.release || lookup.release.tag_name !== asset.tag || !Array.isArray(lookup.release.assets)) r.code = 'RELEASE_METADATA_INVALID';
    else if (lookup.release.draft) r.code = 'RELEASE_IS_DRAFT';
    else {
      const matches = lookup.release.assets.filter(a => a.name === asset.name);
      const found = matches[0];
      if (!found) r.code = 'ASSET_NOT_FOUND';
      else if (matches.length !== 1 || found.state !== 'uploaded') r.code = 'ASSET_NOT_READY';
      else if (found.size !== asset.size) r.code = 'ASSET_SIZE_MISMATCH';
      else if (found.digest && found.digest !== `sha256:${asset.sha256}`) r.code = 'ASSET_SHA256_MISMATCH';
      else {
        try {
          if (verifyDownloads || !found.digest) {
            if (await getDigest(asset) !== asset.sha256) throw Error('ASSET_DOWNLOAD_SHA256_MISMATCH');
            r.verification = 'public-download-sha256';
          } else r.verification = 'github-sha256-digest';
          r.status = 'verified'; r.code = 'PUBLISHED';
        } catch (error) { r.code = /^ASSET_[A-Z0-9_]+$/.test(error.message) ? error.message : 'ASSET_DOWNLOAD_FAILED'; }
      }
    }
    const explicitPending=pendingAssets.some(a=>a.id===asset.id&&a.tag===asset.tag&&a.name===asset.name&&a.size===asset.size&&a.sha256===asset.sha256);
    if (candidate && (asset.tag === currentTag || explicitPending) && ['RELEASE_NOT_FOUND', 'ASSET_NOT_FOUND', 'RELEASE_IS_DRAFT'].includes(r.code)) r.status = 'pending-publication';
    results.push(r);
  }
  const failed = results.filter(r => r.status === 'failed');
  const pending = results.filter(r => r.status === 'pending-publication');
  return { schema: 1, version, candidate, repository, checkedAt: new Date().toISOString(),
    safeToDistribute: !failed.length && !pending.length,
    buildAllowed: !failed.length, verified: results.filter(r => r.status === 'verified').length,
    pending: pending.length, failed: failed.length, assets: results };
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--catalog', '--version', '--report', '--candidate', '--pending-manifest', '--verify-downloads']);
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.has(key) || key in values) throw Error(`Invalid or duplicate argument: ${key}`);
    values[key] = ['--candidate', '--verify-downloads'].includes(key) ? true : args[++i];
    if (!values[key] || String(values[key]).startsWith('--')) throw Error(`Missing argument: ${key}`);
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'packages/explorer-ui/package.json'), 'utf8'));
  const catalogPath = resolve(values['--catalog'] || resolve(root, 'releases/plugins/catalog.json'));
  const catalogBytes = await readFile(catalogPath);
  const pendingAssets=values['--pending-manifest']?JSON.parse(await readFile(resolve(values['--pending-manifest']),'utf8')).pendingPublicationAssets:[];
  if(!Array.isArray(pendingAssets))throw Error('Invalid pending-publication manifest');
  const report = await checkPublication({ catalog: JSON.parse(catalogBytes), version: values['--version'] || manifest.version,
    candidate: !!values['--candidate'], pendingAssets, verifyDownloads: !!values['--verify-downloads'] });
  report.catalogSha256 = digest(catalogBytes);
  const reportPath = resolve(values['--report'] || resolve(root, 'artifacts/plugin-publication-check.json'));
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Plugin publication: ${report.verified} verified, ${report.pending} pending, ${report.failed} failed; safeToDistribute=${report.safeToDistribute}`);
  for (const a of report.assets.filter(a => a.status !== 'verified')) console.error(`${a.code}: ${a.id}/${a.tag}/${a.name}`);
  if (!report.buildAllowed) process.exitCode = 1;
  else if (!report.safeToDistribute) console.error('CANDIDATE ONLY: publish the matching plugin assets and rerun without --candidate before distributing this installer.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`PLUGIN_PUBLICATION_CHECK_FAILED: ${error.message}`); process.exitCode = 1; });
}
