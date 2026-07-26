import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sbomPath = resolve(process.argv[2] ?? "artifacts/sbom.spdx.json");
const document = JSON.parse(await readFile(sbomPath, "utf8"));
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
  if (pkg.name !== "codex-live-explorer" && !dependencyIds.has(pkg.SPDXID)) {
    fail(`package has no dependency relationship: ${pkg.name}@${pkg.versionInfo}`);
  }
}

console.log(`Verified SPDX SBOM with ${document.packages.length - 1} dependencies: ${sbomPath}`);
