import { build, context } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

await mkdir(resolve(root, "dist/demo"), { recursive: true });

const options = {
  absWorkingDir: root,
  bundle: true,
  charset: "utf8",
  legalComments: "none",
  logLevel: "info",
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
  console.log("Watching explorer and demo bundles…");
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
