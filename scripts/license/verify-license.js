#!/usr/bin/env node
/**
 * Verifikasi lisensi untuk dipakai saat INSTALL (dan kapan saja setelahnya).
 *
 * Memeriksa hal yang sama seperti yang dilakukan RIS/PACS saat start — tanda tangan Ed25519,
 * masa berlaku, binding machineId, dan daftar modul — tapi dengan keluaran yang bisa dibaca
 * operator, bukan JSON mentah.
 *
 *   node scripts/license/verify-license.js --license /var/lib/vexapacs/license.lic \
 *        --public-key /var/lib/vexapacs/public.pem [--module RIS] [--json]
 *
 * Keluar dengan kode 0 bila valid, 2 bila tidak valid (dipakai installer untuk berhenti).
 */
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_MODULES,
  getMachineId,
  normalizeModules,
  verifyLicenseObject,
} = require('./licenseCore');
const { parseJsonOrBlock } = require('./licenseEnvelope');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) { args[key] = true; continue; }
    args[key] = next;
    index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const licensePath = path.resolve(args.license || process.env.VEXA_LICENSE_FILE || '/var/lib/vexapacs/license.lic');
const publicKeyPath = path.resolve(args['public-key'] || process.env.VEXA_LICENSE_PUBLIC_KEY_PATH || '/var/lib/vexapacs/public.pem');
const requiredModule = args.module && args.module !== true ? String(args.module).toUpperCase() : '';
const asJson = Boolean(args.json);

function fail(reason, detail) {
  const payload = { ok: false, reason, ...detail };
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(`HASIL: TIDAK VALID — ${reason}`);
    if (reason === 'LICENSE_MISSING' || reason === 'PUBLIC_KEY_MISSING') {
      console.error(`  berkas   : ${licensePath}`);
      console.error(`  public   : ${publicKeyPath}`);
      console.error('  langkah  : lihat docs/LICENSE-ON-LINUX.md (terbitkan lisensi untuk machineId di atas)');
    }
    if (reason === 'MACHINE_ID_MISMATCH') {
      console.error(`  machineId server ini : ${detail.machineId}`);
      console.error(`  machineId di lisensi : ${detail.licenseMachineId || '(kosong)'}`);
      console.error('  langkah  : terbitkan ulang lisensi untuk machineId di atas, atau pakai lisensi tanpa binding (machineId kosong)');
    }
  }
  process.exitCode = 2;
}

const machineId = getMachineId();
if (!fs.existsSync(licensePath)) {
  fail('LICENSE_MISSING', { machineId, licensePath, publicKeyPath });
} else if (!fs.existsSync(publicKeyPath)) {
  fail('PUBLIC_KEY_MISSING', { machineId, licensePath, publicKeyPath });
} else {
  const license = parseJsonOrBlock(fs.readFileSync(licensePath, 'utf8'));
  const result = verifyLicenseObject(license, fs.readFileSync(publicKeyPath, 'utf8'), {
    requiredModule,
    machineId,
  });
  const payload = result.payload || {};
  const licensedModules = normalizeModules(payload.modules || []);
  const moduleReport = DEFAULT_MODULES.map(name => `${name}=${licensedModules.includes(name) ? 'ok' : '-'}`);

  if (!asJson) {
    console.log('Verifikasi lisensi VEXAPACS');
    console.log(`  berkas        : ${licensePath}`);
    console.log(`  public key    : ${publicKeyPath}`);
    console.log(`  machineId ini : ${machineId}`);
    console.log(`  machineId lis : ${payload.machineId || '(tanpa binding)'}`);
    console.log(`  customer      : ${payload.customerName || '-'} (${payload.customerId || '-'})`);
    console.log(`  licenseId     : ${payload.licenseId || '-'}`);
    console.log(`  berlaku       : ${payload.notBefore || '-'} → ${payload.expiresAt || 'lifetime'}`);
    console.log(`  modul         : ${licensedModules.join(', ') || '-'}`);
    console.log(`  cek modul     : ${moduleReport.join('  ')}`);
    if (requiredModule) console.log(`  modul diminta : ${requiredModule}`);
  }

  if (result.ok) {
    if (!asJson) console.log('HASIL: VALID ✓');
    else console.log(JSON.stringify({ ok: true, reason: result.reason, machineId, licenseId: payload.licenseId, modules: licensedModules, expiresAt: payload.expiresAt || null }, null, 2));
  } else {
    fail(result.reason, { machineId, licenseMachineId: payload.machineId, licenseId: payload.licenseId, modules: licensedModules, expiresAt: payload.expiresAt || null });
  }
}
