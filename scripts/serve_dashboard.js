#!/usr/bin/env node
/**
 * serve_dashboard.js — tiny static file server for dashboard/
 * (fetch('data.json') needs http://, not file://)
 *
 * Usage: node scripts/serve_dashboard.js [port]   (default 5173)
 * Zero dependencies. Node 18+.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 5173;
const ROOT = path.join(__dirname, "..", "dashboard");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(ROOT, decodeURIComponent(urlPath.split("?")[0]));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`✓ dashboard running at http://localhost:${PORT}`);
});
