#!/usr/bin/env node
/**
 * VEXA Admin — pengganti ringan VexaServiceMonitor.exe (Windows Forms) untuk Linux.
 *
 * Kenapa bukan port C#-nya: semua data yang ditampilkan utility Windows (health, storage,
 * ukuran DB, backup, status service, lisensi) sudah tersedia dari API RIS + systemd +
 * PostgreSQL, jadi cukup satu halaman web tanpa dependensi npm.
 *
 *   sudo -u vexa VEXA_ADMIN_TOKEN=rahasia node /opt/vexapacs/admin/server.js
 *
 * Env: VEXA_ADMIN_PORT (8899), VEXA_ADMIN_HOST (0.0.0.0; set 127.0.0.1 bila di belakang Caddy),
 *      VEXA_ADMIN_TOKEN (wajib, kecuali VEXA_ADMIN_ALLOW_ANY=1),
 *      VEXA_RIS_URL (http://127.0.0.1:3001), VEXA_LOG_DIR, VEXA_BACKUP_ROOT,
 *      VEXA_LICENSE_FILE, VEXA_LICENSE_PUBLIC_KEY_PATH, VEXA_APP_DIR
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const PORT = Number(process.env.VEXA_ADMIN_PORT || 8899);
// Di produksi admin diakses lewat Caddy di /adminVEXA, jadi cukup listen localhost.
const HOST = process.env.VEXA_ADMIN_HOST || '0.0.0.0';
const TOKEN = process.env.VEXA_ADMIN_TOKEN || '';
const ALLOW_ANY = process.env.VEXA_ADMIN_ALLOW_ANY === '1';
const RIS_URL = process.env.VEXA_RIS_URL || 'http://127.0.0.1:3001';
const LOG_DIR = process.env.VEXA_LOG_DIR || '/var/log/vexapacs';
const BACKUP_ROOT = process.env.VEXA_BACKUP_ROOT || '/srv/vexabackup';
const STORAGE_DIR = process.env.VEXA_STORAGE_DIR || '/srv/vexadata';
const DATA_DIR = process.env.VEXA_PROGRAM_DATA_DIR || '/var/lib/vexapacs';
const APP_DIR = process.env.VEXA_APP_DIR || '/opt/vexapacs';
const LICENSE_FILE = process.env.VEXA_LICENSE_FILE || path.join(DATA_DIR, 'license.lic');
const PUBLIC_KEY = process.env.VEXA_LICENSE_PUBLIC_KEY_PATH || path.join(DATA_DIR, 'public.pem');

// unit systemd -> nama log (dipakai juga oleh daftar service di UI)
const SERVICES = [
  { unit: 'vexa-ris-backend', label: 'RIS Backend', port: 3001, log: 'ris-backend' },
  { unit: 'vexa-ris-frontend', label: 'RIS Frontend', port: 8080, log: 'ris-frontend' },
  { unit: 'vexa-pacs', label: 'PACS DICOMweb + DIMSE', port: 5001, log: 'pacs' },
  { unit: 'vexa-viewer', label: 'Desktop Viewer (5994)', port: 5994, log: 'viewer' },
  { unit: 'vexa-viewer-mobile', label: 'Mobile Viewer', port: 5992, log: 'viewer-mobile' },
  { unit: 'vexa-ecg', label: 'ECG Viewer', port: 7771, log: 'ecg' },
  { unit: 'vexa-mwl', label: 'MWL SCP', port: 5656, log: 'mwl' },
  { unit: 'caddy', label: 'Caddy (reverse proxy)', port: 80, log: '' },
];

function sh(file, args, timeout = 15000) {
  return new Promise(resolve => {
    execFile(file, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error ? error.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(payload);
}

async function serviceStatus() {
  const rows = [];
  for (const entry of SERVICES) {
    const state = await sh('systemctl', ['show', '-p', 'ActiveState', '-p', 'SubState', '-p', 'ExecMainStartTimestamp', '--value', entry.unit]);
    const [active, sub, started] = state.stdout.split('\n');
    rows.push({ ...entry, installed: state.ok, active: active || 'unknown', sub: sub || '', since: started || '' });
  }
  return rows;
}

async function diskUsage() {
  const targets = [['storage DICOM', STORAGE_DIR], ['programData', DATA_DIR], ['backup', BACKUP_ROOT], ['/', '/']];
  const out = [];
  for (const [label, target] of targets) {
    const result = await sh('df', ['-Pk', target]);
    const line = result.stdout.trim().split('\n')[1];
    if (!line) { out.push({ label, target, size: null }); continue; }
    const parts = line.split(/\s+/);
    out.push({ label, target, sizeGb: +(parts[1] / 1024 / 1024).toFixed(1), usedGb: +(parts[2] / 1024 / 1024).toFixed(1), freeGb: +(parts[3] / 1024 / 1024).toFixed(1), usePercent: parts[4] });
  }
  return out;
}

async function databaseSizes() {
  const result = await sh('psql', ['-h', 'localhost', '-U', 'postgres', '-tAc',
    "SELECT datname||'='||pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname IN ('vexaris_db','vexapacs_db')"]);
  if (!result.ok) {
    return { available: false, hint: 'psql gagal (jalankan admin sebagai user yang boleh peer-auth postgres)' };
  }
  const sizes = {};
  for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
    const [name, size] = line.split('=');
    sizes[name] = size;
  }
  return { available: true, sizes };
}

async function risProxy(pathname) {
  try {
    const response = await fetch(`${RIS_URL}${pathname}`, {
      headers: { 'x-user-role': 'administrator', 'x-user-username': 'vexa-admin' },
    });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, body: JSON.stringify({ error: error.message }) };
  }
}

function verifyLicense() {
  if (!fs.existsSync(LICENSE_FILE)) {
    return { present: false, file: LICENSE_FILE };
  }
  let license;
  try {
    license = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch (error) {
    return { present: true, file: LICENSE_FILE, parseError: error.message };
  }
  const result = { present: true, file: LICENSE_FILE, kid: license.kid, alg: license.alg, payload: license.payload || null, signatureValid: null, expired: null, notYetActive: null };
  try {
    if (fs.existsSync(PUBLIC_KEY) && license.payload) {
      const canonical = value => {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
      };
      const signature = Buffer.from(String(license.signature).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      result.signatureValid = crypto.verify(null, Buffer.from(canonical(license.payload)), fs.readFileSync(PUBLIC_KEY, 'utf8'), signature);
    }
  } catch (error) {
    result.verifyError = error.message;
  }
  const now = Date.now();
  if (license.payload?.expiresAt) result.expired = now > Date.parse(license.payload.expiresAt);
  if (license.payload?.notBefore) result.notYetActive = now < Date.parse(license.payload.notBefore);
  return result;
}

function tailLog(name, lines) {
  const candidates = ['out', 'err'].map(kind => path.join(LOG_DIR, `${name}.${kind}.log`));
  const existing = candidates.filter(file => fs.existsSync(file));
  if (!existing.length) {
    return { available: false, hint: `Log tidak ada di ${LOG_DIR} (pakai journalctl -u <unit>)` };
  }
  const output = existing.map(file => {
    const content = fs.readFileSync(file, 'utf8').split('\n');
    return `--- ${path.basename(file)} (${content.length} baris) ---\n` + content.slice(-lines).join('\n');
  }).join('\n\n');
  return { available: true, content: output };
}

async function backupList() {
  if (!fs.existsSync(BACKUP_ROOT)) return { root: BACKUP_ROOT, entries: [] };
  const entries = fs.readdirSync(BACKUP_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const full = path.join(BACKUP_ROOT, entry.name);
      return { name: entry.name, sizeGb: +(fs.statSync(full).size / 1024 / 1024 / 1024).toFixed(2), modified: fs.statSync(full).mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(0, 20);
  return { root: BACKUP_ROOT, entries };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const authed = ALLOW_ANY || (TOKEN && (req.headers['x-admin-token'] === TOKEN || url.searchParams.get('token') === TOKEN));

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  if (!url.pathname.startsWith('/api/')) {
    res.writeHead(404).end('not found');
    return;
  }
  if (!authed) {
    return json(res, 401, { error: 'Token admin tidak valid (set VEXA_ADMIN_TOKEN dan kirim lewat header x-admin-token).' });
  }

  try {
    if (url.pathname === '/api/status') return json(res, 200, { services: await serviceStatus(), storage: await diskUsage() });
    if (url.pathname === '/api/metrics') {
      return json(res, 200, {
        storage: await diskUsage(),
        databases: await databaseSizes(),
        backups: await backupList(),
        pacsStats: await risProxy('/api/dicom/stats'),
        risHealth: await risProxy('/api/system/health'),
      });
    }
    if (url.pathname === '/api/license') return json(res, 200, verifyLicense());
    if (url.pathname === '/api/backups') return json(res, 200, await backupList());

    const logMatch = url.pathname.match(/^\/api\/logs\/([a-z-]+)$/);
    if (logMatch) {
      const entry = SERVICES.find(item => item.unit === logMatch[1]);
      if (!entry) return json(res, 404, { error: 'service tidak dikenal' });
      return json(res, 200, tailLog(entry.log || entry.unit, Number(url.searchParams.get('lines') || 200)));
    }

    const actionMatch = url.pathname.match(/^\/api\/service\/([a-z-]+)\/(start|stop|restart)$/);
    if (actionMatch && req.method === 'POST') {
      const unit = actionMatch[1];
      if (!SERVICES.some(item => item.unit === unit)) return json(res, 400, { error: 'service tidak dikenal' });
      const result = await sh('systemctl', [actionMatch[2], unit], 60000);
      return json(res, result.ok ? 200 : 500, { unit, action: actionMatch[2], ok: result.ok, output: (result.stdout + result.stderr).trim().slice(0, 2000) });
    }

    const backupRun = url.pathname.match(/^\/api\/backup\/(run|status)$/);
    if (backupRun) {
      if (backupRun[1] === 'run' && req.method === 'POST') {
        // Lewat unit oneshot supaya berjalan sebagai root (pg_dump/restore & storage butuh itu)
        // dan tercatat di /var/log/vexapacs/backup.log — polkit rule mengizinkan user vexa.
        const result = await sh('systemctl', ['start', '--wait', 'vexa-backup.service'], 7200000);
        return json(res, result.ok ? 200 : 500, { ok: result.ok, output: (result.stdout + result.stderr).slice(-4000) });
      }
      const timer = await sh('systemctl', ['show', '-p', 'NextElapseUSecRealtime', '-p', 'LastTriggerUSec', '--value', 'vexa-backup.timer']);
      return json(res, 200, { timer: timer.stdout.trim() });
    }

    if (url.pathname.startsWith('/api/ris/')) {
      const result = await risProxy(url.pathname.replace('/api/ris', '/api') + (url.search || ''));
      res.writeHead(result.status || 502, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(result.body);
    }

    return json(res, 404, { error: 'endpoint tidak dikenal' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

if (!TOKEN && !ALLOW_ANY) {
  console.error('VEXA_ADMIN_TOKEN belum diset. Set token atau jalankan dengan VEXA_ADMIN_ALLOW_ANY=1 (hanya untuk uji lokal).');
  process.exit(1);
}
server.listen(PORT, HOST, () => console.log(`VEXA Admin listening on http://${HOST}:${PORT} (RIS ${RIS_URL}) — di balik Caddy: /adminVEXA/`));
