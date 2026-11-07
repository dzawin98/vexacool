const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

let db = null;

function getDb() {
  if (db) return db;

  const dbPath = path.resolve(process.env.DB_PATH || './db/license.db');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
  }

  // Seed default admin user if not exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = crypto.createHash('sha256').update('VexaTeam12@#').digest('hex');
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  }

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// ─── User Queries ───

function authenticateUser(username, password) {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const user = getDb().prepare('SELECT id, username, role FROM users WHERE username = ? AND password = ?').get(username, hash);
  return user || null;
}

// ─── License Queries ───

function insertLicense(data) {
  const stmt = getDb().prepare(`
    INSERT INTO licenses (license_id, customer_name, customer_id, machine_id, hostname,
                          modules, expires_at, max_users, issued_at, metadata, request_raw, license_raw)
    VALUES (@licenseId, @customerName, @customerId, @machineId, @hostname,
            @modules, @expiresAt, @maxUsers, @issuedAt, @metadata, @requestRaw, @licenseRaw)
  `);
  return stmt.run(data);
}

function getAllLicenses(options = {}) {
  const { search, limit = 100, offset = 0 } = options;
  let query = 'SELECT * FROM licenses';
  const params = {};

  if (search) {
    query += ` WHERE customer_name LIKE @search OR license_id LIKE @search`;
    params.search = `%${search}%`;
  }

  query += ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';
  params.limit = limit;
  params.offset = offset;

  return getDb().prepare(query).all(params);
}

function getLicenseById(licenseId) {
  return getDb().prepare('SELECT * FROM licenses WHERE license_id = ?').get(licenseId);
}

function getLicenseByIdInternal(id) {
  return getDb().prepare('SELECT * FROM licenses WHERE id = ?').get(id);
}

function getLicenseStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM licenses').get();
  const active = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE expires_at IS NULL OR expires_at > datetime('now')").get();
  const expired = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").get();
  const thisMonth = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE created_at >= datetime('now', '-30 days')").get();
  const recent = db.prepare('SELECT license_id, customer_name, modules, created_at, expires_at FROM licenses ORDER BY created_at DESC LIMIT 10').all();

  // Warranty stats
  const warrantyExpiring = db.prepare("SELECT COUNT(*) as count FROM customers WHERE warranty_start IS NOT NULL AND date(warranty_start, '+' || warranty_years || ' years') BETWEEN datetime('now') AND datetime('now', '+30 days')").get();
  const warrantyExpired = db.prepare("SELECT COUNT(*) as count FROM customers WHERE warranty_start IS NOT NULL AND date(warranty_start, '+' || warranty_years || ' years') < datetime('now')").get();

  return {
    total: total.count,
    active: active.count,
    expired: expired.count,
    thisMonth: thisMonth.count,
    warrantyExpiring: warrantyExpiring.count,
    warrantyExpired: warrantyExpired.count,
    recent,
  };
}

// ─── Customer Queries ───

function upsertCustomer(name, notes = '', warrantyStart = null, warrantyYears = 1) {
  const existing = getDb().prepare('SELECT * FROM customers WHERE name = ?').get(name);
  if (existing) {
    const updateFields = [];
    const updateParams = { name };

    if (notes) { updateFields.push('notes = @notes'); updateParams.notes = notes; }
    if (warrantyStart !== undefined) { updateFields.push('warranty_start = @warrantyStart'); updateParams.warrantyStart = warrantyStart; }
    if (warrantyYears !== undefined) { updateFields.push('warranty_years = @warrantyYears'); updateParams.warrantyYears = warrantyYears; }

    if (updateFields.length > 0) {
      getDb().prepare(`UPDATE customers SET ${updateFields.join(', ')} WHERE name = @name`).run(updateParams);
    }
    return existing;
  }

  getDb().prepare('INSERT INTO customers (name, notes, warranty_start, warranty_years) VALUES (?, ?, ?, ?)').run(
    name, notes || '', warrantyStart || null, warrantyYears || 1
  );
  return { name, notes };
}

function getAllCustomers() {
  const customers = getDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM licenses l WHERE l.customer_name = c.name) as license_count,
      CASE
        WHEN c.warranty_start IS NULL THEN 'unknown'
        WHEN date(c.warranty_start, '+' || c.warranty_years || ' years') < datetime('now') THEN 'expired'
        WHEN date(c.warranty_start, '+' || c.warranty_years || ' years') BETWEEN datetime('now') AND datetime('now', '+30 days') THEN 'expiring'
        ELSE 'active'
      END as warranty_status,
      CASE
        WHEN c.warranty_start IS NOT NULL THEN date(c.warranty_start, '+' || c.warranty_years || ' years')
        ELSE NULL
      END as warranty_end,
      CASE
        WHEN c.warranty_start IS NOT NULL THEN julianday(date(c.warranty_start, '+' || c.warranty_years || ' years')) - julianday(datetime('now'))
        ELSE NULL
      END as warranty_days_left
    FROM customers c ORDER BY c.name ASC
  `).all();
  return customers;
}

function getCustomerLicenses(customerName) {
  return getDb().prepare('SELECT * FROM licenses WHERE customer_name = ? ORDER BY created_at DESC').all(customerName);
}

function getCustomerDetail(customerName) {
  const customer = getDb().prepare('SELECT * FROM customers WHERE name = ?').get(customerName);
  if (!customer) return null;

  // Calculate warranty info
  if (customer.warranty_start) {
    const endDate = new Date(customer.warranty_start);
    endDate.setFullYear(endDate.getFullYear() + customer.warranty_years);
    customer.warranty_end = endDate.toISOString().split('T')[0];

    const now = new Date();
    const diffMs = endDate - now;
    customer.warranty_days_left = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (customer.warranty_days_left < 0) {
      customer.warranty_status = 'expired';
    } else if (customer.warranty_days_left <= 30) {
      customer.warranty_status = 'expiring';
    } else {
      customer.warranty_status = 'active';
    }
  } else {
    customer.warranty_end = null;
    customer.warranty_days_left = null;
    customer.warranty_status = 'unknown';
  }

  return customer;
}

module.exports = {
  getDb,
  closeDb,
  authenticateUser,
  insertLicense,
  getAllLicenses,
  getLicenseById,
  getLicenseByIdInternal,
  getLicenseStats,
  upsertCustomer,
  getAllCustomers,
  getCustomerLicenses,
  getCustomerDetail,
};
