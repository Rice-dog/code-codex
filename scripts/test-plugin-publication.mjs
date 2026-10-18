import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogAssets, checkPublication } from './check-plugin-publication.mjs';

const sha = 'a'.repeat(64);
const packageFixture = () => ({ id: 'fixture', releaseTag: 'v0.4.61',
  asset: 'CodeCodex-plugin-fixture-1.0.0.js', size: 3, sha256: sha,
  resources: [{ asset: 'CodeCodex-plugin-fixture-image.png', releaseTag: 'v0.3.96', size: 5, sha256: sha }] });
const published = (tag, catalog) => ({ release: { tag_name: tag, draft: false,
  assets: catalogAssets(catalog).filter(a => a.tag === tag).map(a => ({ name: a.name, state: 'uploaded', size: a.size, digest: `sha256:${a.sha256}` })) } });
const run = (catalog, options = {}) => checkPublication({ catalog, version: '0.4.61', getRelease: tag => published(tag, catalog), ...options });

test('standalone plugin assets can use a dated tag without changing application version semantics', async () => {
  const p = packageFixture(); p.releaseTag = 'plugin-assets-2026-10-18';
  const r = await run([p]);
  assert.equal(r.safeToDistribute, true);
  assert.equal(r.assets[0].tag, p.releaseTag);
  assert.equal(r.assets[1].tag, 'v0.3.96');
  const missing = await run([p], { candidate: true, getRelease: () => ({ error: 'RELEASE_NOT_FOUND' }) });
  assert.equal(missing.buildAllowed, false);
  assert.equal(missing.pending, 0);
  await assert.rejects(checkPublication({ catalog: [p], version: 'plugin-assets-2026-10-18' }), /target version/);
  for (const tag of ['plugin-assets-2026-10-18/escape', 'plugin-assets-2026-10-18%2fescape',
    'plugin-assets-2026-1-18', 'plugin-assets-2026-10-18\n', 'plugin-assets-latest', 'https://invalid/']) {
    await assert.rejects(run([{ ...p, releaseTag: tag }]), /descriptor/);
  }
});

test('old resource tags remain independent; each tag is queried once', async () => {
  const catalog = [packageFixture()], calls = [];
  const r = await run(catalog, { getRelease: tag => { calls.push(tag); return published(tag, catalog); } });
  assert.equal(r.safeToDistribute, true); assert.equal(r.verified, 2);
  assert.deepEqual(calls, ['v0.4.61', 'v0.3.96']);
});
test('strict check rejects absent current Release', async () => {
  const c = [packageFixture()];
  const r = await run(c, { getRelease: tag => tag === 'v0.4.61' ? { error: 'RELEASE_NOT_FOUND' } : published(tag, c) });
  assert.equal(r.buildAllowed, false); assert.equal(r.safeToDistribute, false);
  assert.equal(r.assets[0].code, 'RELEASE_NOT_FOUND'); assert.equal(r.verified, 1);
});
test('explicit candidate permits only missing current assets and remains non-distributable', async () => {
  const c = [packageFixture()];
  const r = await run(c, { candidate: true, getRelease: tag => tag === 'v0.4.61' ? { error: 'RELEASE_NOT_FOUND' } : published(tag, c) });
  assert.equal(r.buildAllowed, true); assert.equal(r.pending, 1); assert.equal(r.safeToDistribute, false);
});
test('candidate cannot bypass missing reused assets or network uncertainty', async () => {
  const c = [packageFixture()];
  for (const code of ['RELEASE_NOT_FOUND', 'RELEASE_QUERY_FAILED', 'RELEASE_ACCESS_DENIED_OR_RATE_LIMITED']) {
    const r = await run(c, { candidate: true, getRelease: tag => tag === 'v0.3.96' ? { error: code } : published(tag, c) });
    assert.equal(r.buildAllowed, false);
  }
  const r = await run(c, { candidate: true, getRelease: () => ({ error: 'RELEASE_ACCESS_DENIED_OR_RATE_LIMITED' }) });
  assert.equal(r.pending, 0); assert.equal(r.failed, 2);
});

test('an inherited candidate needs an exact reviewed identity; strict publication still rejects it', async () => {
  const c=[packageFixture()], inherited=catalogAssets(c).filter(a=>a.tag==='v0.3.96');
  const options={pendingAssets:inherited,getRelease:tag=>tag==='v0.3.96'?{error:'RELEASE_NOT_FOUND'}:published(tag,c)};
  const local=await run(c,{...options,candidate:true});
  assert.equal(local.buildAllowed,true);assert.equal(local.pending,1);assert.equal(local.safeToDistribute,false);
  assert.equal((await run(c,options)).buildAllowed,false);
  await assert.rejects(run(c,{...options,candidate:true,pendingAssets:[{...inherited[0],sha256:'b'.repeat(64)}]}),/pending-publication identity/);
  assert.equal((await run(c,{...options,candidate:true,getRelease:()=>({error:'RELEASE_QUERY_FAILED'})})).buildAllowed,false);
});
for (const [name, mutate, code] of [
  ['missing asset', r => { r.assets = []; }, 'ASSET_NOT_FOUND'],
  ['draft', r => { r.draft = true; }, 'RELEASE_IS_DRAFT'],
  ['wrong size', r => { r.assets[0].size++; }, 'ASSET_SIZE_MISMATCH'],
  ['wrong hash', r => { r.assets[0].digest = `sha256:${'b'.repeat(64)}`; }, 'ASSET_SHA256_MISMATCH'],
  ['incomplete upload', r => { r.assets[0].state = 'new'; }, 'ASSET_NOT_READY'],
  ['wrong tag', r => { r.tag_name = 'v0.1.0'; }, 'RELEASE_METADATA_INVALID'],
]) {
  test(`${name} is an explicit failure`, async () => {
    const c = [packageFixture()];
    const r = await run(c, { getRelease: tag => { const r = published(tag, c); mutate(r.release); return r; } });
    assert.equal(r.buildAllowed, false); assert.equal(r.assets[0].code, code);
  });
}
test('candidate never bypasses incorrect bytes', async () => {
  const c = [packageFixture()];
  const r = await run(c, { candidate: true, getRelease: tag => { const r = published(tag, c); r.release.assets[0].size++; return r; } });
  assert.equal(r.buildAllowed, false); assert.equal(r.pending, 0);
});
test('only current-tag missing attachments and drafts can be candidate pending', async () => {
  const c = [packageFixture()];
  for (const mutate of [r => { r.assets = []; }, r => { r.draft = true; }]) {
    const r = await run(c, { candidate: true, getRelease: tag => {
      const r = published(tag, c); if (tag === 'v0.4.61') mutate(r.release); return r;
    } });
    assert.equal(r.buildAllowed, true); assert.equal(r.pending, 1); assert.equal(r.safeToDistribute, false);
  }
});
test('requested full download verification does not trust metadata alone', async () => {
  const c = [packageFixture()]; let downloaded = 0;
  const r = await run(c, { verifyDownloads: true, getDigest: async () => { downloaded++; return sha; } });
  assert.equal(r.safeToDistribute, true); assert.equal(downloaded, 2);
});
test('missing GitHub digest requires actual download hash', async () => {
  const c = [packageFixture()]; let downloaded = 0;
  const r = await run(c, { getRelease: tag => { const r = published(tag, c); delete r.release.assets[0].digest; return r; },
    getDigest: async () => { downloaded++; return sha; } });
  assert.equal(r.safeToDistribute, true); assert.equal(downloaded, 2);
});
test('download failure or wrong downloaded bytes fails even in candidate mode', async () => {
  const c = [packageFixture()];
  for (const getDigest of [async () => 'b'.repeat(64), async () => { throw Error('ASSET_HTTP_404'); }]) {
    const r = await run(c, { candidate: true, verifyDownloads: true, getDigest });
    assert.equal(r.buildAllowed, false); assert.equal(r.failed, 2);
  }
});
test('duplicate/unsafe asset descriptors fail before network', async () => {
  for (const mutate of [p => { p.releaseTag = 'https://invalid/'; }, p => { p.asset = '../escape'; },
    p => { p.resources[0].asset = p.asset; }, p => { p.size = -1; }, p => { p.sha256 = 'invalid'; }]) {
    const p = packageFixture(); mutate(p);
    await assert.rejects(run([p]), /descriptor/);
  }
  assert.throws(() => catalogAssets([packageFixture(), packageFixture()]), /duplicate/);
});
test('package gate executes before release replacement; candidate switch is explicit', async () => {
  const source = await readFile(new URL('./package.ps1', import.meta.url), 'utf8');
  const gate = source.indexOf("'check-plugin-publication.mjs'");
  assert.ok(gate > source.indexOf('"build.ps1"'));
  assert.ok(gate < source.indexOf('Move-Item -LiteralPath $previousFull'));
  assert.ok(source.includes('[switch]$Candidate'));
  assert.ok(source.includes("if ($Candidate) { $publicationArgs += '--candidate' }"));
});
