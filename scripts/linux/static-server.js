#!/usr/bin/env node
/**
 * Static file server untuk RIS frontend + proxy /api ke backend RIS.
 *
 * Versi Windows memakai skrip PowerShell; di Linux cukup node tanpa dependensi supaya
 * unit systemd tidak perlu environment tambahan.
 *
 *   node static-server.js --root /opt/vexapacs/apps/RIS/frontend/dist --port 8080 \
 *        --proxy /api=http://127.0.0.1:3001
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function args() {
  const out = { root: '.', port: 8080, proxy: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--port') out.port = Number(argv[++i]);
    else if (argv[i] === '--proxy') out.proxy.push(argv[++i]);
  }
  return out;
}

const opts = args();
const root = path.resolve(opts.root);
const proxies = opts.proxy.map(entry => {
  const [prefix, target] = entry.split('=');
  const url = new URL(target);
  return { prefix, host: url.hostname, port: Number(url.port || 80) };
});

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function proxy(req, res, entry) {
  const upstream = http.request({
    host: entry.host, port: entry.port, method: req.method,
    path: req.url, headers: { ...req.headers, host: `${entry.host}:${entry.port}` },
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error', error => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `proxy gagal ke ${entry.host}:${entry.port}: ${error.message}` }));
  });
  req.pipe(upstream);
}

http.createServer((req, res) => {
  const match = proxies.find(entry => req.url.startsWith(entry.prefix));
  if (match) {
    return proxy(req, res, match);
  }
  const clean = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(root, path.normalize(clean).replace(/^([.]{2}[\\/])+/, ''));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (error, info) => {
    // SPA: rute tanpa berkas dilayani index.html supaya refresh di /viewer tidak 404
    if (error || info.isDirectory()) filePath = path.join(root, 'index.html');
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
      });
      res.end(data);
    });
  });
}).listen(opts.port, () => {
  console.log(`static-server: root=${root} port=${opts.port} proxy=${JSON.stringify(proxies)}`);
});
