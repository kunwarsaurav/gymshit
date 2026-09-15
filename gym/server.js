require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const db = require('./src/db/database');
const { requirePageAuth } = require('./src/middleware/auth');
const { startScheduler } = require('./src/cron/notifier');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const sessionDbDir = process.env.GYMPRO_DB_DIR || path.join(__dirname, 'src', 'db');
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: sessionDbDir,
    concurrentDB: true
  }),
  secret: process.env.SESSION_SECRET || 'gym-secret-key-fit24',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use((req, res, next) => {
  if (req.path === '/dashboard.html') {
    return res.redirect('/dashboard');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'frontend')));

// ─── Seed Admin ─────────────────────────────────────────────
db.seedAdmin(
  process.env.ADMIN_USERNAME || 'admin',
  process.env.ADMIN_PASSWORD || 'admin123'
);

// ─── Routes ─────────────────────────────────────────────────
app.use('/api', require('./src/routes/authRoutes'));
app.use('/api/members', require('./src/routes/memberRoutes'));
app.use('/api/attendance', require('./src/routes/attendanceRoutes'));
app.use('/api/logistics', require('./src/routes/logisticsRoutes'));
app.use('/api/plans', require('./src/routes/planRoutes'));
app.use('/api/hikvision', require('./src/routes/deviceRoutes'));
app.use('/api/sms', require('./src/routes/smsRoutes'));
app.use('/api/chat', require('./src/routes/chatRoutes'));
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/payments', require('./src/routes/paymentRoutes'));
app.use('/api/memberships', require('./src/routes/membershipRoutes'));
// Backward compatible packages route
app.use('/api', require('./src/routes/planRoutes')); // Since we put /packages in planRoutes but as relative router.get('/packages')

// ─── Serve Pages ────────────────────────────────────────────
app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏋️  GymPro Management System`);
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  console.log(`👤 Default login: admin / admin123\n`);

  startScheduler();
});
