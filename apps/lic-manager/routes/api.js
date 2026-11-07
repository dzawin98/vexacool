const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createSignedLicense, loadPrivateKey, loadPublicKey, normalizeModules } = require('../lib/licenseEngine');
const { encodeBlock, parseJsonOrBlock } = require('../lib/licenseEnvelope');
const db = require('../db/database');

// Multer config for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ─── Middleware ───
function requireKeys(req, res, next) {
  const privateKeyPath = path.resolve(process.env.PRIVATE_KEY_PATH || './keys/private.pem');
  const publicKeyPath = path.resolve(process.env.PUBLIC_KEY_PATH || './keys/public.pem');

  if (!fs.existsSync(privateKeyPath)) {
    return res.status(400).json({ error: 'Private key not uploaded. Please go to Settings > Upload Private Key.' });
  }
  if (!fs.existsSync(publicKeyPath)) {
    return res.status(400).json({ error: 'Public key not uploaded. Please go to Settings > Upload Public Key.' });
  }

  req.privateKeyPath = privateKeyPath;
  req.publicKeyPath = publicKeyPath;
  next();
}

function parseInstallRequestContent(content) {
  const data = parseJsonOrBlock(content);
  if (!data.schema || !data.machineId) {
    throw new Error('Invalid file format. Please ensure this is a VEXA install request file/code.');
  }
  return data;
}

// ─── POST /api/upload-request ───
router.post('/upload-request', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File install-request.json or install-request.txt is required.' });
    }

    const content = req.file.buffer.toString('utf8');
    let data;
    try {
      data = parseInstallRequestContent(content);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'File is not a valid VEXA install request.' });
    }

    res.json({ ok: true, request: data });
  } catch (err) {
    console.error('Upload request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/process-request ───
router.post('/process-request', (req, res) => {
  try {
    const { request } = req.body;
    
    if (!request) {
      return res.status(400).json({ error: 'Request data is required.' });
    }

    // Validate the request data
    if (!request.schema || !request.machineId) {
      return res.status(400).json({ error: 'Invalid request format. Please ensure this is a valid VEXA install request.' });
    }

    res.json({ ok: true, request });
  } catch (err) {
    console.error('Process request error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/sign ───
router.post('/sign', requireKeys, (req, res) => {
  try {
    const {
      requestRaw,
      customerName,
      customerId,
      licenseId,
      modules,
      expiresAt,
      maxUsers,
      note,
      warrantyStart,
      warrantyYears,
    } = req.body;

    if (!requestRaw) {
      return res.status(400).json({ error: 'Request data (install-request) is required.' });
    }
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Hospital name is required.' });
    }

    let requestData;
    try {
      requestData = typeof requestRaw === 'string' ? parseInstallRequestContent(requestRaw) : requestRaw;
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Request data is not valid.' });
    }

    const privateKey = loadPrivateKey(req.privateKeyPath);
    const keyId = process.env.KEY_ID || 'vexapacs-prod-1';

    const selectedModules = modules
      ? (Array.isArray(modules) ? modules : modules.split(','))
      : (requestData.requestedModules || []);

    const expiryValue = expiresAt && expiresAt.trim() ? expiresAt.trim() : null;

    const metadata = {
      ...(requestData.generatedAt ? { generatedFromRequestAt: requestData.generatedAt } : {}),
      generatedBy: 'License Manager Web',
      generatedAt: new Date().toISOString(),
    };
    if (note) metadata.note = note;

    const payload = {
      licenseId: licenseId && licenseId.trim() ? licenseId.trim() : undefined,
      customerId: customerId || '',
      customerName: customerName.trim(),
      machineId: requestData.machineId,
      modules: selectedModules,
      expiresAt: expiryValue,
      maxUsers: maxUsers ? parseInt(maxUsers, 10) : null,
      metadata,
    };

    const license = createSignedLicense(payload, privateKey, { keyId });
    const licenseCode = encodeBlock(license, 'license');

    const hostname = requestData.machine?.hostname || '';
    const insertData = {
      licenseId: license.payload.licenseId,
      customerName: customerName.trim(),
      customerId: customerId || '',
      machineId: requestData.machineId,
      hostname,
      modules: JSON.stringify(license.payload.modules),
      expiresAt: expiryValue,
      maxUsers: payload.maxUsers,
      issuedAt: license.payload.issuedAt,
      metadata: JSON.stringify(metadata),
      requestRaw: JSON.stringify(requestData),
      licenseRaw: JSON.stringify(license),
    };

    db.insertLicense(insertData);

    // Save customer with warranty info
    db.upsertCustomer(
      customerName.trim(),
      note || '',
      warrantyStart || null,
      warrantyYears ? parseInt(warrantyYears) : 1
    );

    // Save license file as backup
    const licensesDir = path.resolve(process.env.LICENSES_DIR || './licenses');
    if (!fs.existsSync(licensesDir)) {
      fs.mkdirSync(licensesDir, { recursive: true });
    }
    const licenseFile = path.join(licensesDir, `${license.payload.licenseId}.lic`);
    fs.writeFileSync(licenseFile, licenseCode, 'utf8');

    res.json({ ok: true, license, licenseCode });
  } catch (err) {
    console.error('Sign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/licenses ───
router.get('/licenses', (req, res) => {
  try {
    const { search, limit, offset } = req.query;
    const licenses = db.getAllLicenses({
      search,
      limit: parseInt(limit) || 100,
      offset: parseInt(offset) || 0,
    });
    res.json({ ok: true, licenses });
  } catch (err) {
    console.error('Get licenses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/licenses/:id ───
router.get('/licenses/:id', (req, res) => {
  try {
    const license = db.getLicenseById(req.params.id);
    if (!license) {
      return res.status(404).json({ error: 'License tidak ditemukan.' });
    }
    res.json({ ok: true, license });
  } catch (err) {
    console.error('Get license error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/licenses/:id/download ───
router.get('/licenses/:id/download', (req, res) => {
  try {
    const license = db.getLicenseById(req.params.id);
    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }


    const filename = `${license.license_id}.lic`;
    const licenseObj = JSON.parse(license.license_raw);
    const licenseCode = encodeBlock(licenseObj, 'license');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(licenseCode);
  } catch (err) {
    console.error('Download license error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/stats ───
router.get('/stats', (req, res) => {
  try {
    const stats = db.getLicenseStats();
    res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/customers ───
router.get('/customers', (req, res) => {
  try {
    const customers = db.getAllCustomers();
    res.json({ ok: true, customers });
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/customers/:name ───
router.get('/customers/:name', (req, res) => {
  try {
    const customer = db.getCustomerDetail(req.params.name);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json({ ok: true, customer });
  } catch (err) {
    console.error('Get customer detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/customers/:name/licenses ───
router.get('/customers/:name/licenses', (req, res) => {
  try {
    const licenses = db.getCustomerLicenses(req.params.name);
    res.json({ ok: true, licenses });
  } catch (err) {
    console.error('Get customer licenses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/customers/:name ───
router.put('/customers/:name', (req, res) => {
  try {
    const { notes, warrantyStart, warrantyYears } = req.body;
    db.upsertCustomer(
      req.params.name,
      notes || '',
      warrantyStart !== undefined ? warrantyStart : null,
      warrantyYears ? parseInt(warrantyYears) : 1
    );
    res.json({ ok: true, message: 'Customer updated successfully.' });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/key-info ───
router.get('/key-info', (req, res) => {
  try {
    const publicKeyPath = path.resolve(process.env.PUBLIC_KEY_PATH || './keys/public.pem');
    const privateKeyPath = path.resolve(process.env.PRIVATE_KEY_PATH || './keys/private.pem');

    const privateExists = fs.existsSync(privateKeyPath);
    const publicExists = fs.existsSync(publicKeyPath);

    const keyInfoPath = path.join(path.dirname(publicKeyPath), 'key-info.json');
    let keyInfo = null;
    if (fs.existsSync(keyInfoPath)) {
      keyInfo = JSON.parse(fs.readFileSync(keyInfoPath, 'utf8'));
    }

    res.json({ ok: true, keyInfo, privateExists, publicExists });
  } catch (err) {
    console.error('Key info error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/keys/private ───
router.post('/keys/private', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File private key wajib diupload.' });
    }

    const content = req.file.buffer.toString('utf8');
    if (!content.includes('BEGIN PRIVATE KEY')) {
      return res.status(400).json({ error: 'Invalid private key format. Please use a .pem file.' });
    }

    const keyPath = path.resolve(process.env.PRIVATE_KEY_PATH || './keys/private.pem');
    const keyDir = path.dirname(keyPath);
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true });
    }

    fs.writeFileSync(keyPath, content, { encoding: 'utf8', mode: 0o600 });
    res.json({
      ok: true,
      message: 'Private key uploaded successfully.',
    });
  } catch (err) {
    console.error('Upload private key error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/keys/public ───
router.post('/keys/public', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File public key wajib diupload.' });
    }

    const content = req.file.buffer.toString('utf8');
    if (!content.includes('BEGIN PUBLIC KEY')) {
      return res.status(400).json({ error: 'Invalid public key format. Please use a .pem file.' });
    }

    const keyPath = path.resolve(process.env.PUBLIC_KEY_PATH || './keys/public.pem');
    const keyDir = path.dirname(keyPath);
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true });
    }

    fs.writeFileSync(keyPath, content, 'utf8');
    res.json({
      ok: true,
      message: 'Public key uploaded successfully.',
    });
  } catch (err) {
    console.error('Upload public key error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
