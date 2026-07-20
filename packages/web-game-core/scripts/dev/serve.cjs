#!/usr/bin/env node
/* @jfun/web-game-core — the studio's dev static server.
 *
 * WHY THIS EXISTS (Rattle rattle-strength saga, 2026-07-19): every app used
 * `python3 -m http.server`, which serves 200 + Last-Modified but NO
 * Cache-Control. Chrome then HEURISTICALLY caches your .js — so a long-lived
 * dev server hands the browser your OLD engine.js after you edit it, and your
 * fix "does nothing" in the preview while Node sees it fine. That gap cost ~4
 * debugging probes chasing a phantom. This server sends `Cache-Control:
 * no-store` on EVERY response, so a plain reload always runs current code.
 * See docs/handbook/11-browser-verify.md.
 *
 * Zero deps. Usage:
 *   node packages/web-game-core/scripts/dev/serve.cjs [dir] [port]
 *   node .../serve.cjs web 8784        # serve ./web on :8784
 * Defaults: dir="web" if it exists else ".", port=8080. Binds 0.0.0.0 so a
 * paired phone on the LAN can load it (matches python http.server's default).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const DIR = path.resolve(args[0] || (fs.existsSync("web") ? "web" : "."));
const PORT = parseInt(args[1], 10) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".wasm": "application/wasm",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, headers) {
  // no-store is the whole point — never let the browser cache dev assets.
  res.writeHead(status, { "Cache-Control": "no-store, must-revalidate", ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { return send(res, 400, "bad request"); }

  // resolve inside DIR — reject traversal (…/../etc)
  let filePath = path.join(DIR, urlPath);
  if (path.relative(DIR, filePath).startsWith("..")) return send(res, 403, "forbidden");

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (e, data) => {
      const code = e ? (e.code === "ENOENT" ? 404 : 500) : 200;
      console.log(`${code} ${req.method} ${urlPath}`);          // visible in preview_logs
      if (e) return send(res, code, code === 404 ? "not found" : "read error");
      send(res, 200, data, { "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`serving ${DIR} → http://localhost:${PORT}  (Cache-Control: no-store)`);
});
