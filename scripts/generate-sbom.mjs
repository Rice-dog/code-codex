import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(process.argv[2] ?? resolve(repoRoot, "artifacts", "sbom.spdx.json"));

const cargoLock = await readFile(resolve(repoRoot, "Cargo.lock"), "utf8");
const cargoManifest = await readFile(resolve(repoRoot, "Cargo.toml"), "utf8");
const npmLock = JSON.parse(await readFile(resolve(repoRoot, "packages/explorer-ui/package-lock.json"), "utf8"));
const rustTarget = process.env.CLE_RUST_TARGET ?? "x86_64-pc-windows-msvc";
const workspaceVersion = cargoManifest.match(/^\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
if (!workspaceVersion) throw new Error("Unable to read workspace version from Cargo.toml");

const clean = (value) => value?.replace(/^"|"$/g, "").replace(/\\"/g, '"');
const idPart = (value) => value.replace(/[^A-Za-z0-9.-]/g, "-");
const packageKey = (manager, name, version) => `${manager}:${name}@${version}`;
const normalizeLicenseExpression = (value) => value?.replace(/\//g, " OR ");
const npmNameFromPath = (path) => {
  const marker = "node_modules/";
  const markerIndex = path.lastIndexOf(marker);
  return markerIndex >= 0 ? path.slice(markerIndex + marker.length) : path;
};
const npmPurlName = (name) => {
  if (!name.startsWith("@")) return encodeURIComponent(name);
  const separator = name.indexOf("/");
  if (separator <= 1 || separator === name.length - 1) {
    throw new Error(`Invalid scoped npm package name: ${name}`);
  }
  return `${encodeURIComponent(name.slice(0, separator))}/${encodeURIComponent(name.slice(separator + 1))}`;
};
const packages = new Map();
const cargoExecutable = (() => {
  if (process.env.CARGO) return process.env.CARGO;
  if (process.platform === "win32" && process.env.USERPROFILE) {
    const rustupCargo = join(process.env.USERPROFILE, ".cargo", "bin", "cargo.exe");
    if (existsSync(rustupCargo)) return rustupCargo;
  }
  return "cargo";
})();
const cargoMetadata = JSON.parse(execFileSync(
  cargoExecutable,
  ["metadata", "--locked", "--format-version", "1", "--filter-platform", rustTarget],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
));
const activeCargoTree = execFileSync(
  cargoExecutable,
  [
    "tree", "--locked", "--offline", "--package", "codex-live-explorer",
    "--target", rustTarget, "--edges", "normal,build", "--prefix", "none",
    "--format", "{p}",
  ],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const activeCargoKeys = new Set(activeCargoTree.split(/\r?\n/).filter(Boolean).map((line) => {
  const match = line.trim().match(/^([^\s]+) v([^\s]+)(?:\s|$)/);
  if (!match) throw new Error(`Unable to parse cargo tree package: ${line}`);
  return packageKey("cargo", match[1], match[2]);
}));
const cargoMetadataByKey = new Map(cargoMetadata.packages
  .filter((pkg) => pkg.source && activeCargoKeys.has(packageKey("cargo", pkg.name, pkg.version)))
  .map((pkg) => [packageKey("cargo", pkg.name, pkg.version), pkg]));
if (cargoMetadataByKey.size === 0) throw new Error("The production Cargo dependency tree is empty");

for (const block of cargoLock.split(/^\[\[package\]\]\s*$/m).slice(1)) {
  const fields = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([a-z]+)\s*=\s*(.+)$/);
    if (match) fields[match[1]] = clean(match[2]);
  }
  if (!fields.name || !fields.version || !fields.source) continue;
  const key = packageKey("cargo", fields.name, fields.version);
  const metadata = cargoMetadataByKey.get(key);
  if (!metadata) continue;
  packages.set(key, {
    SPDXID: `SPDXRef-Package-cargo-${idPart(fields.name)}-${idPart(fields.version)}`,
    name: fields.name,
    versionInfo: fields.version,
    downloadLocation: fields.source?.startsWith("registry+")
      ? fields.source.slice("registry+".length)
      : "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: normalizeLicenseExpression(metadata?.license) ?? "NOASSERTION",
    copyrightText: "NOASSERTION",
    externalRefs: [{
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: `pkg:cargo/${encodeURIComponent(fields.name)}@${encodeURIComponent(fields.version)}`,
    }],
    ...(fields.checksum?.match(/^[0-9a-f]{64}$/i)
      ? { checksums: [{ algorithm: "SHA256", checksumValue: fields.checksum }] }
      : {}),
  });
}

for (const [path, entry] of Object.entries(npmLock.packages ?? {})) {
  if (!path || !entry?.version) continue;
  const name = entry.name ?? npmNameFromPath(path);
  if (!name || name.includes("node_modules/")) {
    throw new Error(`Unable to derive npm package name from lockfile path: ${path}`);
  }
  const key = packageKey("npm", name, entry.version);
  const integrity = entry.integrity?.match(/^sha512-([A-Za-z0-9+/=]+)$/);
  packages.set(key, {
    SPDXID: `SPDXRef-Package-npm-${idPart(name)}-${idPart(entry.version)}`,
    name,
    versionInfo: entry.version,
    downloadLocation: entry.resolved ?? "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: normalizeLicenseExpression(entry.license) ?? "NOASSERTION",
    copyrightText: "NOASSERTION",
    externalRefs: [{
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: `pkg:npm/${npmPurlName(name)}@${encodeURIComponent(entry.version)}`,
    }],
    ...(integrity
      ? { checksums: [{ algorithm: "SHA512", checksumValue: Buffer.from(integrity[1], "base64").toString("hex") }] }
      : {}),
  });
}

const namespaceSeed = createHash("sha256")
  .update(cargoLock)
  .update(JSON.stringify(npmLock))
  .digest("hex")
  .slice(0, 24);
const rootId = "SPDXRef-Package-codex-live-explorer";
const dependencyPackages = [...packages.values()].sort((a, b) => a.SPDXID.localeCompare(b.SPDXID));

const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "Codex Live Explorer dependency SBOM",
  documentNamespace: `https://github.com/codex-live-explorer/codex-live-explorer/sbom/${namespaceSeed}`,
  creationInfo: {
    created: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    creators: ["Tool: scripts/generate-sbom.mjs"],
  },
  packages: [
    {
      SPDXID: rootId,
      name: "codex-live-explorer",
      versionInfo: workspaceVersion,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "MIT",
      licenseDeclared: "MIT",
      copyrightText: "Copyright (c) 2026 Codex Live Explorer contributors",
    },
    ...dependencyPackages,
  ],
  relationships: [
    { spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: rootId },
    ...dependencyPackages.map((dependency) => ({
      spdxElementId: rootId,
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: dependency.SPDXID,
    })),
  ],
  comment: `Generated for ${rustTarget} from Cargo.lock and ${basename(resolve(repoRoot, "packages/explorer-ui/package-lock.json"))}.`,
};

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote SPDX SBOM with ${dependencyPackages.length} dependencies to ${outputPath}`);
