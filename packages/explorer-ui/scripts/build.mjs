import { build, context } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");
const legacyPowerPointAssets = resolve(root, "node_modules", "@extend-ai", "react-pptx", "dist");
const uiManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
if (typeof uiManifest.version !== "string" || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(uiManifest.version)) {
  throw new Error("The Code-Codex UI version is invalid");
}
const legacyPowerPointManifest = JSON.parse(await readFile(resolve(legacyPowerPointAssets, "..", "package.json"), "utf8"));
const embeddedWasm = uiManifest.codeCodex?.embeddedWasm;
if (!embeddedWasm || legacyPowerPointManifest.version !== "0.1.2" ||
    legacyPowerPointManifest.gitHead !== embeddedWasm.sourceCommit) {
  throw new Error("The installed legacy PowerPoint parser does not match its audited manifest");
}
const embeddedWorkerPath = resolve(root, embeddedWasm.workerFile ?? "");
const embeddedWasmPath = resolve(root, embeddedWasm.file ?? "");
if (embeddedWorkerPath !== resolve(legacyPowerPointAssets, "native-parser-worker.js") ||
    embeddedWasmPath !== resolve(legacyPowerPointAssets, "pptx_wasm_bg.wasm")) {
  throw new Error("The audited legacy PowerPoint parser paths are invalid");
}
const [legacyPowerPointWorkerBytes, legacyPowerPointWasm, legacyPowerPointStyles] = await Promise.all([
  readFile(embeddedWorkerPath),
  readFile(embeddedWasmPath),
  readFile(resolve(legacyPowerPointAssets, "index.css"), "utf8"),
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha256(legacyPowerPointWorkerBytes) !== embeddedWasm.workerSha256 ||
    sha256(legacyPowerPointWasm) !== embeddedWasm.sha256) {
  throw new Error("The installed legacy PowerPoint parser bytes failed the audited hash check");
}
const legacyPowerPointWorker = legacyPowerPointWorkerBytes.toString("utf8");
const browserStreamShim = {
  name: "code-codex-browser-stream-shim",
  setup(build) {
    build.onResolve({ filter: /^stream$/ }, () => ({ path: "stream", namespace: "code-codex-browser-shim" }));
    build.onLoad({ filter: /.*/, namespace: "code-codex-browser-shim" }, () => ({
      contents: "module.exports = {};",
      loader: "js",
    }));
  },
};

await mkdir(resolve(root, "dist/demo"), { recursive: true });

const options = {
  absWorkingDir: root,
  alias: {
    // JSZip's browser field points at an opaque Browserify bundle. Build its
    // audited source graph so every shipped transitive remains visible in the
    // production source map and third-party inventory.
    jszip: resolve(root, "node_modules", "jszip", "lib", "index.js"),
  },
  bundle: true,
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
  plugins: [browserStreamShim],
  define: {
    __CODE_CODEX_VERSION__: JSON.stringify(uiManifest.version),
    __CODE_CODEX_PPT_WORKER_SOURCE__: JSON.stringify(legacyPowerPointWorker),
    __CODE_CODEX_PPT_WASM_BASE64__: JSON.stringify(legacyPowerPointWasm.toString("base64")),
    __CODE_CODEX_PPT_VIEWER_STYLES__: JSON.stringify(legacyPowerPointStyles),
  },
  sourcemap: true,
  target: ["chrome120"],
};

if (watch) {
  const injector = await context({
    ...options,
    entryPoints: ["src/index.ts"],
    format: "iife",
    outfile: "dist/explorer.js",
  });
  const demo = await context({
    ...options,
    entryPoints: ["demo/demo.ts"],
    format: "esm",
    outfile: "dist/demo/demo.js",
  });
  await Promise.all([injector.watch(), demo.watch()]);
  await copyFile(resolve(root, "demo/index.html"), resolve(root, "dist/demo/index.html"));
  console.log("Watching explorer and demo bundles...");
} else {
  await Promise.all([
    build({
      ...options,
      entryPoints: ["src/index.ts"],
      format: "iife",
      minify: true,
      outfile: "dist/explorer.js",
    }),
    build({
      ...options,
      entryPoints: ["demo/demo.ts"],
      format: "esm",
      outfile: "dist/demo/demo.js",
    }),
  ]);
  await copyFile(resolve(root, "demo/index.html"), resolve(root, "dist/demo/index.html"));
}
