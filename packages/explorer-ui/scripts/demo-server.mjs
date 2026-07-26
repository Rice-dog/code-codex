import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist/demo/", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".map": "application/json" };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const candidate = normalize(join(root, pathname === "/" ? "index.html" : pathname));
    if (!candidate.startsWith(root) || !(await stat(candidate)).isFile()) throw new Error("not found");
    response.writeHead(200, { "content-type": types[extname(candidate)] || "application/octet-stream" });
    response.end(await readFile(candidate));
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Demo: http://127.0.0.1:${port}`);
});
