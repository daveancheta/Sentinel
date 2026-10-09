import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const requested = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const file = path.resolve(root, `.${requested}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
  const candidates = [file, `${file}.html`];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) { res.writeHead(404).end("Not found"); return; }
  res.writeHead(200, { "Content-Type": mime[path.extname(found)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(found).pipe(res);
}).listen(4173, "127.0.0.1", () => console.log("Static test server on http://127.0.0.1:4173"));
