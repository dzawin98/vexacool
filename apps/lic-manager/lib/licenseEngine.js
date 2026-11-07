const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MODULES = Object.freeze([
  'RIS',
  'PACS_DIMSE',
  'PACS_MWL',
  'DESKTOP_VIEWER',
  'MOBILE_VIEWER',
  'ECG_VIEWER',
]);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function normalizeModules(modules) {
  const values = Array.isArray(modules)
    ? modules
    : String(modules || '').split(',');
  return [...new Set(values.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))].sort();
}

/**
 * Generate License ID yang unik
 */
function generateLicenseId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `VEXA-${date}-${rand}`;
}

/**
 * Sign payload dengan private key → return license object
 */
function createSignedLicense(payload, privateKeyPem, options = {}) {
  const licensePayload = {
    schema: 'vexapacs.license.v1',
    licenseId: payload.licenseId || generateLicenseId(),
    customerId: payload.customerId || '',
    customerName: payload.customerName || '',
    issuedAt: payload.issuedAt || new Date().toISOString(),
    notBefore: payload.notBefore || new Date().toISOString(),
    expiresAt: payload.expiresAt || null,
    machineId: payload.machineId || '',
    modules: normalizeModules(payload.modules || []),
    maxUsers: Number.isFinite(Number(payload.maxUsers)) ? Number(payload.maxUsers) : null,
    features: payload.features && typeof payload.features === 'object' ? payload.features : {},
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  };

  const signedData = canonicalJson(licensePayload);
  const signature = crypto.sign(null, Buffer.from(signedData), privateKeyPem);
  return {
    alg: 'Ed25519',
    kid: options.keyId || 'vexapacs-prod-1',
    payload: licensePayload,
    signature: base64url(signature),
  };
}

/**
 * Load keys from file system
 */
function loadPrivateKey(keyPath) {
  const resolvedPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Private key tidak ditemukan di: ${resolvedPath}`);
  }
  return fs.readFileSync(resolvedPath, 'utf8');
}

function loadPublicKey(keyPath) {
  const resolvedPath = path.resolve(keyPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Public key tidak ditemukan di: ${resolvedPath}`);
  }
  return fs.readFileSync(resolvedPath, 'utf8');
}

module.exports = {
  DEFAULT_MODULES,
  canonicalJson,
  base64url,
  fromBase64url,
  normalizeModules,
  generateLicenseId,
  createSignedLicense,
  loadPrivateKey,
  loadPublicKey,
};
