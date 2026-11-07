const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve('./db/license.db');
console.log('Migrating database:', dbPath);
const db = new Database(dbPath);

// Add warranty columns if they don't exist
try {
  db.exec("ALTER TABLE customers ADD COLUMN warranty_start TEXT");
  console.log('+ Added warranty_start column');
} catch(e) {
  if (e.message.includes('duplicate column')) console.log('  warranty_start already exists');
  else console.log('  warranty_start:', e.message);
}

try {
  db.exec("ALTER TABLE customers ADD COLUMN warranty_years INTEGER DEFAULT 1");
  console.log('+ Added warranty_years column');
} catch(e) {
  if (e.message.includes('duplicate column')) console.log('  warranty_years already exists');
  else console.log('  warranty_years:', e.message);
}

// Create users table
try {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  console.log('+ Users table ready');
} catch(e) {
  console.log('  users table:', e.message);
}

// Seed admin user
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existing) {
  const hash = crypto.createHash('sha256').update('VexaTeam12@#').digest('hex');
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('+ Admin user created (admin / VexaTeam12@#)');
} else {
  console.log('  Admin user already exists');
}

db.close();
console.log('Migration complete!');
