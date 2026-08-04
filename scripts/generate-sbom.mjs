import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(process.argv[2] ?? resolve(repoRoot, "artifacts", "sbom.spdx.json"));

const cargoLock = await readFile(resolve(repoRoot, "Cargo.lock"), "utf8");
const cargoManifest = await readFile(resolve(repoRoot, "Cargo.toml"), "utf8");
const uiRoot = resolve(repoRoot, "packages", "explorer-ui");
const uiManifest = JSON.parse(await readFile(resolve(uiRoot, "package.json"), "utf8"));
const npmLock = JSON.parse(await readFile(resolve(uiRoot, "package-lock.json"), "utf8"));
const rustTarget = process.env.CLE_RUST_TARGET ?? "x86_64-pc-windows-msvc";
const workspaceVersion = cargoManifest.match(/^\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
if (!workspaceVersion) throw new Error("Unable to read workspace version from Cargo.toml");

const embeddedWasm = uiManifest.codeCodex?.embeddedWasm;
if (!embeddedWasm || !Array.isArray(embeddedWasm.cargoPackages) || embeddedWasm.cargoPackages.length < 1) {
  throw new Error("The embedded PowerPoint WASM inventory is missing from package.json");
}
const embeddedWasmPath = resolve(uiRoot, embeddedWasm.file ?? "");
const embeddedWasmRelative = relative(uiRoot, embeddedWasmPath);
const embeddedWorkerPath = resolve(uiRoot, embeddedWasm.workerFile ?? "");
const embeddedWorkerRelative = relative(uiRoot, embeddedWorkerPath);
if (!embeddedWasm.file || embeddedWasmRelative.startsWith("..") || isAbsolute(embeddedWasmRelative) ||
    !embeddedWasm.workerFile || embeddedWorkerRelative.startsWith("..") || isAbsolute(embeddedWorkerRelative)) {
  throw new Error("An embedded PowerPoint parser path escapes the UI package");
}
const [embeddedWasmBytes, embeddedWorkerBytes] = await Promise.all([
  readFile(embeddedWasmPath),
  readFile(embeddedWorkerPath),
]);
const embeddedWasmSha256 = createHash("sha256").update(embeddedWasmBytes).digest("hex");
const embeddedWorkerSha256 = createHash("sha256").update(embeddedWorkerBytes).digest("hex");
if (!embeddedWasm.sha256?.match(/^[0-9a-f]{64}$/) || embeddedWasmSha256 !== embeddedWasm.sha256) {
  throw new Error("The embedded PowerPoint WASM does not match its audited SHA-256");
}
if (!embeddedWasm.workerSha256?.match(/^[0-9a-f]{64}$/) || embeddedWorkerSha256 !== embeddedWasm.workerSha256) {
  throw new Error("The embedded PowerPoint worker does not match its audited SHA-256");
}
if (!embeddedWasm.sourceCommit?.match(/^[0-9a-f]{40}$/) ||
    !embeddedWasm.cargoLockSha256?.match(/^[0-9a-f]{64}$/) ||
    !embeddedWasm.rustVersion || !embeddedWasm.wasmPackVersion || embeddedWasm.target !== "wasm32-unknown-unknown" ||
    !embeddedWasm.component?.name || !embeddedWasm.component?.version || !embeddedWasm.component?.license) {
  throw new Error("The embedded PowerPoint WASM component metadata is invalid");
}
if (npmLock.packages?.["node_modules/@extend-ai/react-pptx"]?.version !== "0.1.2") {
  throw new Error("The embedded PowerPoint WASM inventory is pinned to @extend-ai/react-pptx 0.1.2");
}

const clean = (value) => value?.replace(/^"|"$/g, "").replace(/\\"/g, '"');
const idPart = (value) => value.replace(/[^A-Za-z0-9.-]/g, "-");
const packageKey = (manager, name, version) => `${manager}:${name}@${version}`;
const normalizeLicenseExpression = (value) => value?.replace(/\s*\/\s*/g, " OR ").replace(/\s+/g, " ").trim();
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
    "tree", "--locked", "--offline", "--package", "code-codex",
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

const embeddedComponentId = `SPDXRef-Package-embedded-${idPart(embeddedWasm.component.name)}-${idPart(embeddedWasm.component.version)}`;
const embeddedSource = `https://github.com/extend-hq/react-pptx/tree/${embeddedWasm.sourceCommit}`;
packages.set(`embedded:${embeddedWasm.component.name}@${embeddedWasm.component.version}`, {
  SPDXID: embeddedComponentId,
  name: embeddedWasm.component.name,
  versionInfo: embeddedWasm.component.version,
  downloadLocation: `${embeddedSource}/crates/pptx-wasm`,
  filesAnalyzed: false,
  licenseConcluded: "NOASSERTION",
  licenseDeclared: normalizeLicenseExpression(embeddedWasm.component.license),
  copyrightText: "Copyright (c) the react-pptx contributors and respective dependency authors",
  checksums: [{ algorithm: "SHA256", checksumValue: embeddedWasmSha256 }],
  externalRefs: [{
    referenceCategory: "PACKAGE-MANAGER",
    referenceType: "purl",
    referenceLocator: `pkg:github/extend-hq/react-pptx@${embeddedWasm.sourceCommit}#crates/pptx-wasm`,
  }],
  sourceInfo: `Built from Cargo.lock SHA-256 ${embeddedWasm.cargoLockSha256} with Rust ${embeddedWasm.rustVersion}, wasm-pack ${embeddedWasm.wasmPackVersion}, target ${embeddedWasm.target}.`,
  comment: `Precompiled WebAssembly embedded by @extend-ai/react-pptx 0.1.2 as ${embeddedWasm.file}; parser worker ${embeddedWasm.workerFile} has SHA-256 ${embeddedWorkerSha256}.`,
});

const embeddedDependencyIds = new Set();
for (const dependency of embeddedWasm.cargoPackages) {
  if (!dependency?.name || !dependency?.version || !dependency?.license ||
      (dependency.checksum !== undefined && !dependency.checksum.match(/^[0-9a-f]{64}$/))) {
    throw new Error("The embedded PowerPoint WASM Cargo inventory contains an invalid package");
  }
  const key = packageKey("cargo", dependency.name, dependency.version);
  const license = normalizeLicenseExpression(dependency.license);
  const existing = packages.get(key);
  if (existing) {
    const existingChecksum = existing.checksums?.find((checksum) => checksum.algorithm === "SHA256")?.checksumValue;
    if (existing.licenseDeclared !== license || (dependency.checksum && existingChecksum !== dependency.checksum)) {
      throw new Error(`Embedded PowerPoint dependency conflicts with the workspace inventory: ${dependency.name}@${dependency.version}`);
    }
    embeddedDependencyIds.add(existing.SPDXID);
    continue;
  }
  const localUpstreamPackage = dependency.checksum === undefined;
  const packageRecord = {
    SPDXID: `SPDXRef-Package-embedded-cargo-${idPart(dependency.name)}-${idPart(dependency.version)}`,
    name: dependency.name,
    versionInfo: dependency.version,
    downloadLocation: localUpstreamPackage
      ? `${embeddedSource}/crates/${dependency.name}`
      : "https://github.com/rust-lang/crates.io-index",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: license,
    copyrightText: "NOASSERTION",
    externalRefs: [{
      referenceCategory: "PACKAGE-MANAGER",
      referenceType: "purl",
      referenceLocator: localUpstreamPackage
        ? `pkg:github/extend-hq/react-pptx@${embeddedWasm.sourceCommit}#crates/${dependency.name}`
        : `pkg:cargo/${encodeURIComponent(dependency.name)}@${encodeURIComponent(dependency.version)}`,
    }],
    ...(dependency.checksum
      ? { checksums: [{ algorithm: "SHA256", checksumValue: dependency.checksum }] }
      : {}),
    comment: "Dependency compiled into the audited pptx_wasm_bg.wasm component.",
  };
  packages.set(key, packageRecord);
  embeddedDependencyIds.add(packageRecord.SPDXID);
}

const namespaceSeed = createHash("sha256")
  .update(cargoLock)
  .update(JSON.stringify(npmLock))
  .update(JSON.stringify(embeddedWasm))
  .update(embeddedWasmSha256)
  .digest("hex")
  .slice(0, 24);
const rootId = "SPDXRef-Package-code-codex";
const dependencyPackages = [...packages.values()].sort((a, b) => a.SPDXID.localeCompare(b.SPDXID));

const document = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "Code-Codex dependency SBOM",
  documentNamespace: `https://github.com/code-codex/code-codex/sbom/${namespaceSeed}`,
  creationInfo: {
    created: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    creators: ["Tool: scripts/generate-sbom.mjs"],
  },
  packages: [
    {
      SPDXID: rootId,
      name: "code-codex",
      versionInfo: workspaceVersion,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "MIT",
      licenseDeclared: "MIT",
      copyrightText: "Copyright (c) 2026 Code-Codex contributors",
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
    ...[...embeddedDependencyIds].sort().map((dependencyId) => ({
      spdxElementId: embeddedComponentId,
      relationshipType: "DEPENDS_ON",
      relatedSpdxElement: dependencyId,
    })),
  ],
  comment: `Generated for ${rustTarget} from Cargo.lock, ${basename(resolve(uiRoot, "package-lock.json"))}, and the SHA-256-pinned embedded PowerPoint WASM inventory.`,
};

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Wrote SPDX SBOM with ${dependencyPackages.length} dependencies to ${outputPath}`);
