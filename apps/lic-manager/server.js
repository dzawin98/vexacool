const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const session = require('express-session');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

const apiRoutes = require('./routes/api');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── 1. Core Middleware ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── 2. Session ───
app.use(session({
  secret: process.env.SESSION_SECRET || 'vexapacs-license-manager-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 8 * 60 * 60 * 1000,
  }
}));

// ─── 3. Static Files (priority tinggi, tanpa auth check) ───
// Serve file statis langsung, tidak peduli session
app.use(express.static(PUBLIC_DIR));

// ─── 4. Auth Routes (tidak perlu session untuk akses) ───
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = db.authenticateUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ ok: true, user: req.session.user });
  } else {
    res.json({ ok: false });
  }
});

// ─── 5. Auth Middleware for API ───
function requireApiAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  next();
}
app.use('/api', requireApiAuth);

// ─── 6. API Routes ───
app.use('/api', apiRoutes);

// ─── 7. Login Page ───
app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// ─── 8. SPA ───
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Catch-all selain static files: arahkan ke /
app.get('*', (req, res) => {
  // Cek apakah ini file statis yang ternyata tidak ditemukan
  const filePath = path.join(PUBLIC_DIR, req.path);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return res.sendFile(filePath);
  }
  // Cek apakah path seperti /something → redirect ke /
  res.redirect('/');
});

// ─── Error ───
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// Di Linux service ini internal (diakses lewat SSH tunnel atau Caddy), jadi default
// bind localhost. Windows membiarkan perilaku lama (semua interface).
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     VEXAPACS License Manager v1.0.0          ║
║     Running on: http://localhost:${PORT}        ║
╚══════════════════════════════════════════════╝
  `);
});
