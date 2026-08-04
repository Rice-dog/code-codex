import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sbomPath = resolve(process.argv[2] ?? "artifacts/sbom.spdx.json");
const document = JSON.parse(await readFile(sbomPath, "utf8"));
const uiRoot = resolve(repoRoot, "packages", "explorer-ui");
const uiManifest = JSON.parse(await readFile(resolve(uiRoot, "package.json"), "utf8"));
const embeddedManifest = uiManifest.codeCodex?.embeddedWasm;
const fail = (message) => { throw new Error(`Invalid SPDX SBOM: ${message}`); };

if (document.spdxVersion !== "SPDX-2.3") fail("unexpected SPDX version");
if (document.SPDXID !== "SPDXRef-DOCUMENT") fail("missing document identifier");
if (!Array.isArray(document.packages) || document.packages.length < 2) fail("dependency inventory is empty");

const ids = new Set();
for (const pkg of document.packages) {
  if (!pkg.SPDXID || ids.has(pkg.SPDXID)) fail(`duplicate or missing package ID: ${pkg.SPDXID}`);
  ids.add(pkg.SPDXID);
  if (!pkg.name || !pkg.versionInfo) fail(`package ${pkg.SPDXID} has no name or version`);
  if (!pkg.copyrightText) fail(`package ${pkg.SPDXID} has no copyright text`);
  if (pkg.licenseDeclared?.includes("/")) fail(`legacy non-SPDX license separator: ${pkg.licenseDeclared}`);
  if (pkg.name.includes("node_modules/")) fail(`lockfile path used as npm name: ${pkg.name}`);

  const packageReferences = pkg.externalRefs ?? [];
  if (packageReferences.some((reference) => reference.referenceLocator?.startsWith("pkg:cargo/")) &&
      (!pkg.licenseDeclared || pkg.licenseDeclared === "NOASSERTION")) {
    fail(`Cargo package has no declared license: ${pkg.name}@${pkg.versionInfo}`);
  }
  for (const reference of packageReferences) {
    if (reference.referenceType !== "purl") continue;
    const purl = reference.referenceLocator;
    if (purl.startsWith("pkg:npm/") && /%2f/i.test(purl)) {
      fail(`scoped npm namespace separator is percent-encoded: ${purl}`);
    }
    if (purl.startsWith("pkg:npm/") && pkg.name.startsWith("@")) {
      const separator = pkg.name.indexOf("/");
      const expectedName = `${encodeURIComponent(pkg.name.slice(0, separator))}/${encodeURIComponent(pkg.name.slice(separator + 1))}`;
      if (!purl.startsWith(`pkg:npm/${expectedName}@`)) fail(`incorrect scoped npm purl: ${purl}`);
    }
  }
}

for (const relationship of document.relationships ?? []) {
  if (!ids.has(relationship.relatedSpdxElement) && relationship.relatedSpdxElement !== "SPDXRef-DOCUMENT") {
    fail(`relationship points to unknown package: ${relationship.relatedSpdxElement}`);
  }
  if (!ids.has(relationship.spdxElementId) && relationship.spdxElementId !== "SPDXRef-DOCUMENT") {
    fail(`relationship starts at unknown package: ${relationship.spdxElementId}`);
  }
}

const dependencyIds = new Set((document.relationships ?? [])
  .filter((relationship) => relationship.relationshipType === "DEPENDS_ON")
  .map((relationship) => relationship.relatedSpdxElement));
for (const pkg of document.packages) {
  if (pkg.name !== "code-codex" && !dependencyIds.has(pkg.SPDXID)) {
    fail(`package has no dependency relationship: ${pkg.name}@${pkg.versionInfo}`);
  }
}

const embeddedWasm = document.packages.find((pkg) =>
  pkg.name === "pptx-wasm" &&
  pkg.externalRefs?.some((reference) => reference.referenceLocator?.startsWith("pkg:github/extend-hq/react-pptx@")),
);
if (!embeddedWasm?.checksums?.some((checksum) =>
  checksum.algorithm === "SHA256" && /^[0-9a-f]{64}$/.test(checksum.checksumValue))) {
  fail("embedded PowerPoint WASM component is missing or unhashed");
}
const embeddedRelationships = (document.relationships ?? []).filter((relationship) =>
  relationship.spdxElementId === embeddedWasm.SPDXID && relationship.relationshipType === "DEPENDS_ON",
);
if (!embeddedManifest || !Array.isArray(embeddedManifest.cargoPackages) || embeddedManifest.cargoPackages.length !== 47) {
  fail("embedded PowerPoint WASM source manifest is missing or incomplete");
}
const expectedEmbeddedIds = new Set();
for (const expected of embeddedManifest.cargoPackages) {
  const matches = document.packages.filter((pkg) => pkg.name === expected.name && pkg.versionInfo === expected.version);
  if (matches.length !== 1) fail(`embedded package is missing or ambiguous: ${expected.name}@${expected.version}`);
  const pkg = matches[0];
  if (pkg.licenseDeclared !== expected.license) fail(`embedded package license mismatch: ${expected.name}@${expected.version}`);
  if (expected.checksum && !pkg.checksums?.some((checksum) =>
    checksum.algorithm === "SHA256" && checksum.checksumValue === expected.checksum)) {
    fail(`embedded package checksum mismatch: ${expected.name}@${expected.version}`);
  }
  expectedEmbeddedIds.add(pkg.SPDXID);
}
const actualEmbeddedIds = new Set(embeddedRelationships.map((relationship) => relationship.relatedSpdxElement));
if (embeddedRelationships.length !== embeddedManifest.cargoPackages.length ||
    actualEmbeddedIds.size !== expectedEmbeddedIds.size ||
    [...expectedEmbeddedIds].some((id) => !actualEmbeddedIds.has(id))) {
  fail("embedded PowerPoint WASM dependency relationships do not match the pinned manifest");
}
if (!["arbitrary", "crossbeam-utils", "derive_arbitrary"].every((name) =>
  !embeddedRelationships.some((relationship) => document.packages.find((pkg) => pkg.SPDXID === relationship.relatedSpdxElement)?.name === name))) {
  fail("inactive upstream lockfile packages were incorrectly marked as embedded");
}
const [wasmBytes, workerBytes] = await Promise.all([
  readFile(resolve(uiRoot, embeddedManifest.file)),
  readFile(resolve(uiRoot, embeddedManifest.workerFile)),
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha256(wasmBytes) !== embeddedManifest.sha256 || sha256(workerBytes) !== embeddedManifest.workerSha256) {
  fail("embedded PowerPoint parser bytes do not match the pinned source manifest");
}
if (!embeddedWasm.sourceInfo?.includes(embeddedManifest.cargoLockSha256) ||
    !embeddedWasm.sourceInfo?.includes(`Rust ${embeddedManifest.rustVersion}`) ||
    !embeddedWasm.sourceInfo?.includes(`wasm-pack ${embeddedManifest.wasmPackVersion}`) ||
    !embeddedWasm.sourceInfo?.includes(embeddedManifest.target)) {
  fail("embedded PowerPoint build provenance is incomplete");
}

console.log(`Verified SPDX SBOM with ${document.packages.length - 1} dependencies: ${sbomPath}`);
