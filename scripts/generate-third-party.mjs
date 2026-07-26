import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const uiRoot = resolve(repoRoot, "packages", "explorer-ui");
const noticesPath = resolve(process.argv[2] ?? resolve(repoRoot, "THIRD_PARTY.md"));
const licensesPath = resolve(process.argv[3] ?? resolve(repoRoot, "THIRD_PARTY_LICENSES.txt"));
const maxLicenseBytes = 2 * 1024 * 1024;
const maxLicenseFilesPerPackage = 24;
const rustTarget = process.env.CLE_RUST_TARGET ?? "x86_64-pc-windows-msvc";
const compareText = (left, right) => left === right ? 0 : left < right ? -1 : 1;
const normalizeLicenseExpression = (value) => value?.replace(/\//g, " OR ");
const licenseOverrides = new Map([
  [
    "windows-permissions@0.2.4",
    resolve(repoRoot, "scripts", "license-overrides", "windows-permissions-0.2.4-MIT.txt"),
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
const npmLock = JSON.parse(await readFile(resolve(uiRoot, "package-lock.json"), "utf8"));

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

const isLicenseName = (name) => /^(?:licen[cs]e|copying|notice|copyright|unlicense)(?:$|[-_.])/i.test(name);

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
  const candidates = new Set();
  const entries = await readdir(packageRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && isLicenseName(entry.name)) candidates.add(join(packageRoot, entry.name));
    if (entry.isDirectory() && entry.name.toLowerCase() === "licenses") {
      for (const nested of await readdir(join(packageRoot, entry.name), { withFileTypes: true })) {
        if (nested.isFile() && isLicenseName(nested.name)) {
          candidates.add(join(packageRoot, entry.name, nested.name));
        }
      }
    }
  }
  if (pkg.license_file) candidates.add(pkg.license_file);
  if (candidates.size > maxLicenseFilesPerPackage) {
    throw new Error(`Unexpected number of license files for ${pkg.name} ${pkg.version}`);
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
    const override = licenseOverrides.get(`${pkg.name}@${pkg.version}`);
    if (override) {
      const safePath = await containedRegularFile(repoRoot, override);
      if (!safePath) throw new Error(`Unsafe license override for ${pkg.name} ${pkg.version}`);
      files.push(safePath);
    }
  }
  if (files.length === 0) {
    throw new Error(`No distributable license or notice text found for ${pkg.name} ${pkg.version}`);
  }
  return files;
}

const texts = new Map();
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
  const name = entry.name ?? npmNameFromPath(path);
  npmPackages.set(`${name}@${entry.version}`, {
    name,
    version: entry.version,
    license: normalizeLicenseExpression(entry.license) ?? "NOASSERTION",
    source: entry.resolved ?? "npm lockfile",
  });
}
const npmRows = [...npmPackages.values()]
  .sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version));

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
locked embedded-UI build toolchain. The Rust crates below can be linked into the
distributed executable. Their verbatim license and notice files are shipped in
\`THIRD_PARTY_LICENSES.txt\` and are identified by content hash.

## Rust dependencies linked into the executable

${packageTable(rustRows, true)}

## Frontend build dependencies

These packages are used to build and test the embedded browser bundle; they are
not installed beside the application at runtime. They remain listed for supply
chain transparency.

${packageTable(npmRows, false)}

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
  "These verbatim texts were read from the Cargo packages used by the production",
  "dependency graph. Package-to-text mappings are listed in THIRD_PARTY.md.",
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
console.log(`Wrote ${rustRows.length} Rust and ${npmRows.length} npm notices to ${noticesPath}`);
console.log(`Wrote ${texts.size} distinct license texts to ${licensesPath}`);
