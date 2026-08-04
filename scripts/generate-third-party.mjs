import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiRoot = resolve(repoRoot, "packages", "explorer-ui");
const noticesPath = resolve(process.argv[2] ?? resolve(repoRoot, "THIRD_PARTY.md"));
const licensesPath = resolve(process.argv[3] ?? resolve(repoRoot, "THIRD_PARTY_LICENSES.txt"));
const maxLicenseBytes = 2 * 1024 * 1024;
const maxLicenseFilesPerPackage = 24;
const maxCrateArchiveBytes = 16 * 1024 * 1024;
const maxCrateUnpackedBytes = 64 * 1024 * 1024;
const rustTarget = process.env.CLE_RUST_TARGET ?? "x86_64-pc-windows-msvc";
const compareText = (left, right) => left === right ? 0 : left < right ? -1 : 1;
const normalizeLicenseExpression = (value) => value?.replace(/\s*\/\s*/g, " OR ").replace(/\s+/g, " ").trim();
const licenseOverrides = new Map([
  [
    "windows-permissions@0.2.4",
    resolve(repoRoot, "scripts", "license-overrides", "windows-permissions-0.2.4-MIT.txt"),
  ],
]);
// react-pptx deliberately embeds these two static atlases in its published
// bundle and ships their ISC notice/license itself. Pin the composed source-map
// paths to that audited owner so an upstream layout or version change fails
// closed instead of silently dropping a bundled work.
const embeddedNpmSourceOwners = new Map([
  ["node_modules/@extend-ai/wasm/", "node_modules/@extend-ai/react-pptx"],
  [
    "node_modules/node_modules/.pnpm/us-atlas@3.0.1/node_modules/us-atlas/",
    "node_modules/@extend-ai/react-pptx",
  ],
  [
    "node_modules/node_modules/.pnpm/world-atlas@2.0.2/node_modules/world-atlas/",
    "node_modules/@extend-ai/react-pptx",
  ],
]);

const cargoExecutable = (() => {
  if (process.env.CARGO) return process.env.CARGO;
  if (process.platform === "win32" && process.env.USERPROFILE) {
    const rustupCargo = join(process.env.USERPROFILE, ".cargo", "bin", "cargo.exe");
    if (existsSync(rustupCargo)) return rustupCargo;
  }
  return "cargo";
})();

const metadata = JSON.parse(execFileSync(
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
const uiManifest = JSON.parse(await readFile(resolve(uiRoot, "package.json"), "utf8"));
const npmLock = JSON.parse(await readFile(resolve(uiRoot, "package-lock.json"), "utf8"));
const embeddedWasm = uiManifest.codeCodex?.embeddedWasm;
if (!embeddedWasm?.component || !Array.isArray(embeddedWasm.cargoPackages) ||
    embeddedWasm.cargoPackages.length !== 47 || !embeddedWasm.sourceCommit?.match(/^[0-9a-f]{40}$/)) {
  throw new Error("The embedded PowerPoint WASM license inventory is missing or incomplete");
}
const uiSourceMapPath = resolve(uiRoot, "dist", "explorer.js.map");
const uiSourceMap = JSON.parse(await readFile(uiSourceMapPath, "utf8"));
if (!Array.isArray(uiSourceMap.sources)) {
  throw new Error(`Embedded UI source map has no sources array: ${uiSourceMapPath}`);
}
const normalizedBundleSources = uiSourceMap.sources.map((source) =>
  String(source).replaceAll("\\", "/").replace(/^(?:\.\.\/)+/, ""),
);
const lockedNpmPaths = Object.keys(npmLock.packages ?? {})
  .filter((path) => path.startsWith("node_modules/"))
  .sort((left, right) => right.length - left.length);
const bundledNpmPaths = new Set();
for (const name of Object.keys(npmLock.packages?.[""]?.dependencies ?? {})) {
  const packagePath = `node_modules/${name}`;
  if (!npmLock.packages?.[packagePath]) {
    throw new Error(`Direct npm dependency is missing from package-lock.json: ${name}`);
  }
  // Composed source maps can retain an inner library's webpack:// paths and
  // erase the outer npm package path (notably pdfjs-dist). Direct runtime
  // dependencies are imported by the production UI and must always be listed.
  bundledNpmPaths.add(packagePath);
}
for (const source of normalizedBundleSources) {
  const packagePath = lockedNpmPaths.find((path) => source === path || source.startsWith(`${path}/`));
  if (packagePath) {
    const packageRemainder = source.slice(packagePath.length);
    if (packageRemainder.includes("/node_modules/")) {
      throw new Error(`Bundled nested npm source is missing from package-lock.json: ${source}`);
    }
    bundledNpmPaths.add(packagePath);
  } else if (source.includes("node_modules/")) {
    const owner = [...embeddedNpmSourceOwners].find(([prefix]) => source.startsWith(prefix))?.[1];
    if (!owner || !npmLock.packages?.[owner]) {
      throw new Error(`Bundled npm source is missing from package-lock.json: ${source}`);
    }
    bundledNpmPaths.add(owner);
  }
}

const cargoKey = (name, version) => `${name}@${version}`;
const activeCargoKeys = new Set(activeCargoTree.split(/\r?\n/).filter(Boolean).map((line) => {
  const match = line.trim().match(/^([^\s]+) v([^\s]+)(?:\s|$)/);
  if (!match) throw new Error(`Unable to parse cargo tree package: ${line}`);
  return cargoKey(match[1], match[2]);
}));
const rustPackages = metadata.packages
  .filter((pkg) => pkg.source && activeCargoKeys.has(cargoKey(pkg.name, pkg.version)))
  .sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version));
if (rustPackages.length === 0) throw new Error("The production Cargo dependency tree is empty");

const isLicenseName = (name) => /^(?:(?:third[-_. ]party[-_. ])?(?:licen[cs]e|notices?)|copying|copyright|unlicense)(?:$|[-_.])/i.test(name);
const isLicenseDirectoryName = (name) => /^(?:licen[cs]es?|third[-_. ]party[-_. ]licen[cs]es?)$/i.test(name);

async function containedRegularFile(packageRoot, candidate) {
  const absoluteCandidate = isAbsolute(candidate) ? candidate : resolve(packageRoot, candidate);
  const lexicalRelative = relative(resolve(packageRoot), absoluteCandidate);
  if (lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) return null;
  const [realRoot, info] = await Promise.all([realpath(packageRoot), lstat(absoluteCandidate)]);
  if (!info.isFile() || info.isSymbolicLink()) return null;
  const realCandidate = await realpath(absoluteCandidate);
  const relativeCandidate = relative(realRoot, realCandidate);
  if (relativeCandidate.startsWith("..") || isAbsolute(relativeCandidate)) return null;
  if (info.size > maxLicenseBytes) {
    throw new Error(`License file exceeds ${maxLicenseBytes} bytes: ${realCandidate}`);
  }
  return realCandidate;
}

async function licenseFilesFor(pkg) {
  const packageRoot = dirname(pkg.manifest_path);
  return licenseFilesUnder(packageRoot, pkg.name, pkg.version, pkg.license_file);
}

async function licenseFilesUnder(packageRoot, name, version, explicitLicenseFile) {
  const candidates = new Set();
  const entries = await readdir(packageRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && isLicenseName(entry.name)) candidates.add(join(packageRoot, entry.name));
    if (entry.isDirectory() && isLicenseDirectoryName(entry.name)) {
      for (const nested of await readdir(join(packageRoot, entry.name), { withFileTypes: true })) {
        if (nested.isFile()) {
          candidates.add(join(packageRoot, entry.name, nested.name));
        }
      }
    }
  }
  if (explicitLicenseFile) candidates.add(explicitLicenseFile);
  if (candidates.size > maxLicenseFilesPerPackage) {
    throw new Error(`Unexpected number of license files for ${name} ${version}`);
  }

  const files = [];
  for (const candidate of [...candidates].sort()) {
    try {
      const safePath = await containedRegularFile(packageRoot, candidate);
      if (safePath) files.push(safePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  if (files.length === 0) {
    const override = licenseOverrides.get(`${name}@${version}`);
    if (override) {
      const safePath = await containedRegularFile(repoRoot, override);
      if (!safePath) throw new Error(`Unsafe license override for ${name} ${version}`);
      files.push(safePath);
    }
  }
  if (files.length === 0) {
    throw new Error(`No distributable license or notice text found for ${name} ${version}`);
  }
  return files;
}

function tarText(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return Buffer.from(end >= 0 ? field.subarray(0, end) : field).toString("utf8").trim();
}

function tarOctal(bytes, offset, length, label) {
  const value = tarText(bytes, offset, length).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error(`Invalid ${label} in crate archive`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label} in crate archive`);
  return parsed;
}

function crateLicenseEntries(archive, pkg) {
  let unpacked;
  try {
    unpacked = gunzipSync(archive, { maxOutputLength: maxCrateUnpackedBytes });
  } catch {
    throw new Error(`Unable to unpack the verified crate archive for ${pkg.name} ${pkg.version}`);
  }
  const root = `${pkg.name}-${pkg.version}`;
  const result = [];
  const seen = new Set();
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= unpacked.byteLength) {
    const header = unpacked.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks >= 2) break;
      continue;
    }
    zeroBlocks = 0;
    const expectedChecksum = tarOctal(header, 148, 8, "tar checksum");
    let actualChecksum = 0;
    for (let index = 0; index < header.length; index += 1) {
      actualChecksum += index >= 148 && index < 156 ? 0x20 : header[index];
    }
    if (actualChecksum !== expectedChecksum) throw new Error(`Invalid tar checksum for ${pkg.name} ${pkg.version}`);
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const archivePath = `${prefix ? `${prefix}/` : ""}${name}`.replaceAll("\\", "/");
    const segments = archivePath.split("/");
    if (!archivePath || archivePath.startsWith("/") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error(`Unsafe path in the verified crate archive for ${pkg.name} ${pkg.version}`);
    }
    const size = tarOctal(header, 124, 12, "tar entry size");
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const nextOffset = dataStart + Math.ceil(size / 512) * 512;
    if (dataEnd > unpacked.byteLength || nextOffset > unpacked.byteLength) {
      throw new Error(`Truncated crate archive for ${pkg.name} ${pkg.version}`);
    }
    const type = String.fromCharCode(header[156] || 0);
    if ((type === "\0" || type === "0") && segments[0] === root && segments.length >= 2) {
      const fileName = segments.at(-1);
      const parentName = segments.at(-2);
      if (fileName && (isLicenseName(fileName) || (parentName && isLicenseDirectoryName(parentName)))) {
        const folded = archivePath.toLowerCase();
        if (seen.has(folded)) throw new Error(`Duplicate license path in ${pkg.name} ${pkg.version}`);
        if (size > maxLicenseBytes || result.length >= maxLicenseFilesPerPackage) {
          throw new Error(`License files exceed limits for ${pkg.name} ${pkg.version}`);
        }
        seen.add(folded);
        let content;
        try {
          content = new TextDecoder("utf-8", { fatal: true }).decode(unpacked.subarray(dataStart, dataEnd));
        } catch {
          throw new Error(`Non-UTF-8 license text in ${pkg.name} ${pkg.version}`);
        }
        result.push({ content, source: `crates.io/${archivePath}` });
      }
    }
    offset = nextOffset;
  }
  if (result.length === 0) throw new Error(`No license text found in ${pkg.name} ${pkg.version}`);
  return result;
}

async function downloadVerifiedCrate(pkg) {
  if (!/^[A-Za-z0-9_-]+$/.test(pkg.name) || !/^[0-9A-Za-z.+-]+$/.test(pkg.version) ||
      !pkg.checksum?.match(/^[0-9a-f]{64}$/)) {
    throw new Error(`Invalid embedded Cargo package metadata: ${pkg.name ?? "unknown"}`);
  }
  const archiveUrl = `https://static.crates.io/crates/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.name)}-${encodeURIComponent(pkg.version)}.crate`;
  const response = await fetch(archiveUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`Unable to download ${pkg.name} ${pkg.version} license source`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxCrateArchiveBytes) {
    throw new Error(`Crate archive exceeds limits for ${pkg.name} ${pkg.version}`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxCrateArchiveBytes) {
      await reader.cancel();
      throw new Error(`Crate archive exceeds limits for ${pkg.name} ${pkg.version}`);
    }
    chunks.push(Buffer.from(value));
  }
  const archive = Buffer.concat(chunks, total);
  const checksum = createHash("sha256").update(archive).digest("hex");
  if (checksum !== pkg.checksum) throw new Error(`Crate checksum mismatch for ${pkg.name} ${pkg.version}`);
  return crateLicenseEntries(archive, pkg);
}

async function cachedCrateLicenseEntries(pkg) {
  const cargoHome = process.env.CARGO_HOME
    ? resolve(process.env.CARGO_HOME)
    : process.env.USERPROFILE
      ? resolve(process.env.USERPROFILE, ".cargo")
      : null;
  if (!cargoHome) return null;
  const sourceRoot = resolve(cargoHome, "registry", "src");
  let indexes;
  try {
    indexes = await readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  for (const index of indexes) {
    if (!index.isDirectory() || index.isSymbolicLink()) continue;
    const archivePath = resolve(cargoHome, "registry", "cache", index.name, `${pkg.name}-${pkg.version}.crate`);
    let info;
    try {
      info = await lstat(archivePath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxCrateArchiveBytes) continue;
    const archive = await readFile(archivePath);
    if (createHash("sha256").update(archive).digest("hex") !== pkg.checksum) continue;
    return crateLicenseEntries(archive, pkg);
  }
  return null;
}

const texts = new Map();
function recordLicenseText(packageLabel, sourceLabel, sourceContent) {
  const content = sourceContent.replace(/\r\n/g, "\n").trimEnd();
  if (Buffer.byteLength(content, "utf8") > maxLicenseBytes) {
    throw new Error(`License text exceeds ${maxLicenseBytes} bytes: ${sourceLabel}`);
  }
  const hash = createHash("sha256").update(content).digest("hex");
  const record = texts.get(hash) ?? { content, packages: new Set(), files: new Set() };
  record.packages.add(packageLabel);
  record.files.add(sourceLabel);
  texts.set(hash, record);
  return hash.slice(0, 16);
}

const rustRows = [];
for (const pkg of rustPackages) {
  if (!pkg.license) throw new Error(`Cargo package has no declared license: ${pkg.name} ${pkg.version}`);
  const license = normalizeLicenseExpression(pkg.license);
  const files = await licenseFilesFor(pkg);
  const textIds = [];
  for (const file of files) {
    const content = (await readFile(file, "utf8")).replace(/\r\n/g, "\n").trimEnd();
    const hash = createHash("sha256").update(content).digest("hex");
    const textId = hash.slice(0, 16);
    textIds.push(textId);
    const record = texts.get(hash) ?? { content, packages: new Set(), files: new Set() };
    record.packages.add(`cargo:${pkg.name}@${pkg.version} (${license})`);
    const repositoryPath = relative(repoRoot, file);
    const sourceLabel = !repositoryPath.startsWith("..") && !isAbsolute(repositoryPath)
      ? `repository/${repositoryPath.replaceAll("\\", "/")}`
      : `${pkg.name}-${pkg.version}/${relative(dirname(pkg.manifest_path), file).replaceAll("\\", "/")}`;
    record.files.add(sourceLabel);
    texts.set(hash, record);
  }
  rustRows.push({
    name: pkg.name,
    version: pkg.version,
    license,
    source: pkg.repository ?? pkg.source,
    textIds: [...new Set(textIds)].sort(),
  });
}

const npmNameFromPath = (path) => {
  const marker = "node_modules/";
  const markerIndex = path.lastIndexOf(marker);
  return markerIndex >= 0 ? path.slice(markerIndex + marker.length) : path;
};
const npmPackages = new Map();
for (const [path, entry] of Object.entries(npmLock.packages ?? {})) {
  if (!path || !entry?.version) continue;
  const runtime = entry.dev !== true && bundledNpmPaths.has(path);
  const build = entry.dev === true;
  // npm lockfiles can contain Node-only or optional branches for browser
  // packages. Inventory direct runtime imports plus source-map-confirmed
  // transitives, while retaining development tools in the build table.
  if (!runtime && !build) continue;
  // PDF.js declares Node-only canvas helpers as optional dependencies. They
  // are not reachable from the browser IIFE and therefore are not part of the
  // distributed UI bundle.
  if (entry.optional === true && entry.dev !== true) continue;
  const packageRoot = resolve(uiRoot, path);
  if (!existsSync(packageRoot)) {
    // npm keeps platform-specific optional dependencies in package-lock.json
    // even when they are intentionally not installed on this host.
    if (entry.optional === true) continue;
    throw new Error(`Locked npm package is not installed: ${path}`);
  }
  const name = entry.name ?? npmNameFromPath(path);
  npmPackages.set(`${name}@${entry.version}`, {
    path,
    name,
    version: entry.version,
    license: normalizeLicenseExpression(entry.license) ?? "NOASSERTION",
    source: entry.resolved ?? "npm lockfile",
    runtime,
  });
}
const npmRows = [...npmPackages.values()]
  .sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version));
for (const row of npmRows) {
  if (!row.runtime) continue;
  if (row.license === "NOASSERTION") {
    throw new Error(`Runtime npm package has no declared license: ${row.name} ${row.version}`);
  }
  const packageRoot = resolve(uiRoot, row.path);
  const files = await licenseFilesUnder(packageRoot, row.name, row.version);
  const textIds = [];
  for (const file of files) {
    const content = (await readFile(file, "utf8")).replace(/\r\n/g, "\n").trimEnd();
    const hash = createHash("sha256").update(content).digest("hex");
    const textId = hash.slice(0, 16);
    textIds.push(textId);
    const record = texts.get(hash) ?? { content, packages: new Set(), files: new Set() };
    record.packages.add(`npm:${row.name}@${row.version} (${row.license})`);
    record.files.add(`${row.name}-${row.version}/${relative(packageRoot, file).replaceAll("\\", "/")}`);
    texts.set(hash, record);
  }
  row.textIds = [...new Set(textIds)].sort();
}

const embeddedPackageKeys = new Set();
const inactiveUpstreamPackages = new Set(["arbitrary@1.4.2", "crossbeam-utils@0.8.22", "derive_arbitrary@1.4.2"]);
for (const pkg of embeddedWasm.cargoPackages) {
  const key = cargoKey(pkg.name ?? "", pkg.version ?? "");
  if (!pkg.name || !pkg.version || !pkg.license || embeddedPackageKeys.has(key) || inactiveUpstreamPackages.has(key) ||
      (pkg.name !== "pptx-core" && !pkg.checksum?.match(/^[0-9a-f]{64}$/))) {
    throw new Error(`Invalid embedded PowerPoint Cargo package: ${key}`);
  }
  embeddedPackageKeys.add(key);
}

const embeddedOwnerRoot = resolve(uiRoot, "node_modules", "@extend-ai", "react-pptx");
const embeddedOwnerLicense = await containedRegularFile(embeddedOwnerRoot, resolve(embeddedOwnerRoot, "LICENSE"));
if (!embeddedOwnerLicense) throw new Error("The embedded PowerPoint workspace license is missing");
const embeddedOwnerLicenseText = await readFile(embeddedOwnerLicense, "utf8");
const embeddedSource = `https://github.com/extend-hq/react-pptx/tree/${embeddedWasm.sourceCommit}`;
const embeddedComponentLicense = normalizeLicenseExpression(embeddedWasm.component.license);
const embeddedComponentLabel = `embedded-cargo:${embeddedWasm.component.name}@${embeddedWasm.component.version} (${embeddedComponentLicense})`;
const embeddedComponentTextId = recordLicenseText(
  embeddedComponentLabel,
  `@extend-ai/react-pptx-${npmLock.packages["node_modules/@extend-ai/react-pptx"].version}/LICENSE`,
  embeddedOwnerLicenseText,
);
const embeddedRustRows = [{
  name: embeddedWasm.component.name,
  version: embeddedWasm.component.version,
  license: embeddedComponentLicense,
  source: `${embeddedSource}/crates/${embeddedWasm.component.name}`,
  textIds: [embeddedComponentTextId],
}];

for (const pkg of [...embeddedWasm.cargoPackages].sort((a, b) =>
  compareText(a.name, b.name) || compareText(a.version, b.version))) {
  const license = normalizeLicenseExpression(pkg.license);
  const packageLabel = `embedded-cargo:${pkg.name}@${pkg.version} (${license})`;
  let entries;
  let source;
  if (pkg.name === "pptx-core") {
    entries = [{
      content: embeddedOwnerLicenseText,
      source: `@extend-ai/react-pptx-${npmLock.packages["node_modules/@extend-ai/react-pptx"].version}/LICENSE`,
    }];
    source = `${embeddedSource}/crates/pptx-core`;
  } else {
    entries = await cachedCrateLicenseEntries(pkg) ?? await downloadVerifiedCrate(pkg);
    source = `https://crates.io/crates/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
  }
  const textIds = entries.map((entry) => recordLicenseText(packageLabel, entry.source, entry.content));
  embeddedRustRows.push({
    name: pkg.name,
    version: pkg.version,
    license,
    source,
    textIds: [...new Set(textIds)].sort(),
  });
}

const npmRuntimeRows = npmRows.filter((row) => row.runtime);
const npmBuildRows = npmRows.filter((row) => !row.runtime);

const markdownCell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const packageTable = (rows, includeTexts) => [
  "| Package | Version | Declared license | Source |" + (includeTexts ? " License text IDs |" : ""),
  "|---|---:|---|---|" + (includeTexts ? "---|" : ""),
  ...rows.map((row) => `| ${markdownCell(row.name)} | ${markdownCell(row.version)} | ${markdownCell(row.license)} | ${markdownCell(row.source)} |${includeTexts ? ` ${row.textIds.map((id) => `\`${id}\``).join(", ")} |` : ""}`),
].join("\n");

const notices = `# Third-party software

Code-Codex is independently implemented and does not copy, unpack, or
redistribute Codex Desktop application code or assets.

This inventory is generated from the ${rustTarget} production Cargo dependency graph and the
locked embedded-UI dependency graph, including the SHA-256-pinned PowerPoint WebAssembly
component. The runtime dependencies below can be linked or bundled into the distributed executable.
Their verbatim license and notice files are shipped in
\`THIRD_PARTY_LICENSES.txt\` and are identified by content hash.

## Rust dependencies linked into the executable

${packageTable(rustRows, true)}

## Rust dependencies compiled into the PowerPoint WebAssembly component

The component is pinned to react-pptx commit \`${embeddedWasm.sourceCommit}\`, Cargo.lock
SHA-256 \`${embeddedWasm.cargoLockSha256}\`, Rust ${embeddedWasm.rustVersion}, wasm-pack
${embeddedWasm.wasmPackVersion}, and target ${embeddedWasm.target}.

${packageTable(embeddedRustRows, true)}

## Frontend dependencies bundled into the executable

${packageTable(npmRuntimeRows, true)}

## Frontend build dependencies

These packages are used to build and test the embedded browser bundle; they are
not installed beside the application at runtime. They remain listed for supply
chain transparency.

${packageTable(npmBuildRows, false)}

## Trademarks

The application does not bundle Codex Desktop. OpenAI, ChatGPT, and Codex may be
trademarks of OpenAI. Their names are used only to describe compatibility.
`;

const licenseSections = [...texts.entries()]
  .sort(([left], [right]) => compareText(left, right))
  .map(([hash, record]) => [
    "=".repeat(80),
    `LICENSE TEXT ${hash.slice(0, 16)} (SHA-256 ${hash})`,
    "Used by:",
    ...[...record.packages].sort().map((pkg) => `- ${pkg}`),
    "Source files:",
    ...[...record.files].sort().map((file) => `- ${file}`),
    "-".repeat(80),
    record.content,
    "",
  ].join("\n"));
const licenses = [
  "THIRD-PARTY LICENSE AND NOTICE TEXTS",
  "",
  "These verbatim texts were read from the Cargo and npm packages used by the",
  "production bundles, including verified sources for the embedded PowerPoint",
  "WebAssembly component. Each section identifies the packages that use its text.",
  "",
  "PACKAGE AND PROVENANCE INVENTORY",
  "",
  notices.trimEnd(),
  "",
  "VERBATIM LICENSE AND NOTICE TEXTS",
  "",
  ...licenseSections,
].join("\n");

await Promise.all([
  mkdir(dirname(noticesPath), { recursive: true }),
  mkdir(dirname(licensesPath), { recursive: true }),
]);
await Promise.all([
  writeFile(noticesPath, notices, "utf8"),
  writeFile(licensesPath, `${licenses.trimEnd()}\n`, "utf8"),
]);
console.log(`Wrote ${rustRows.length} linked Rust, ${embeddedRustRows.length} embedded Rust, and ${npmRows.length} npm notices to ${noticesPath}`);
console.log(`Wrote ${texts.size} distinct license texts to ${licensesPath}`);
