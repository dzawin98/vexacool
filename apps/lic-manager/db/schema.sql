CREATE TABLE IF NOT EXISTS licenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id    TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_id   TEXT DEFAULT '',
  machine_id    TEXT NOT NULL,
  hostname      TEXT DEFAULT '',
  modules       TEXT NOT NULL,
  expires_at    TEXT,
  max_users     INTEGER,
  issued_at     TEXT NOT NULL,
  metadata      TEXT DEFAULT '{}',
  request_raw   TEXT,
  license_raw   TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT UNIQUE NOT NULL,
  notes           TEXT DEFAULT '',
  warranty_start  TEXT,
  warranty_years  INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username  TEXT UNIQUE NOT NULL,
  password  TEXT NOT NULL,
  role      TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licenses_license_id ON licenses(license_id);
CREATE INDEX IF NOT EXISTS idx_licenses_customer_name ON licenses(customer_name);
CREATE INDEX IF NOT EXISTS idx_licenses_created_at ON licenses(created_at);
