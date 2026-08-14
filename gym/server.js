require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db/database');
const { dbEvents } = require('./db/database');
const { requireAuth, requirePageAuth } = require('./middleware/auth');
const { startScheduler, sendSMS, notifyMember, initSMS } = require('./cron/notifier');
const hikvision = require('./services/hikvisionService');
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function saveBase64Image(base64Data, filenamePrefix = 'logistics') {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return null;
  }
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const contentType = matches[1];
  const extension = contentType.split('/')[1] || 'png';
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');
  const filename = `${filenamePrefix}_${Date.now()}.${extension}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'gym-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Block direct access to dashboard.html to enforce authentication via /dashboard route
app.use((req, res, next) => {
  if (req.path === '/dashboard.html') {
    return res.redirect('/dashboard');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Seed Admin ─────────────────────────────────────────────
db.seedAdmin(
  process.env.ADMIN_USERNAME || 'admin',
  process.env.ADMIN_PASSWORD || 'admin123'
);

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const admin = db.getAdminByUsername(username);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = bcrypt.compareSync(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.admin = { id: admin.id, username: admin.username };
  res.json({ success: true, admin: { id: admin.id, username: admin.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ admin: req.session.admin });
});

// ═══════════════════════════════════════════════════════════
// MEMBER ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/members', requireAuth, (req, res) => {
  const search = req.query.search || '';
  const status = req.query.status || '';
  const members = db.getAllMembers(search, status);
  
  const membersWithExpiry = members.map(m => {
    if (!m.expiry_date) return { ...m, days_remaining: 0 };
    const expiry = new Date(m.expiry_date + 'T00:00:00');
    const now = new Date();
    expiry.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return {
      ...m,
      days_remaining: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
    };
  });

  res.json(membersWithExpiry);
});

app.get('/api/members/expiring', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || parseInt(process.env.NOTIFY_DAYS_BEFORE) || 3;
  const members = db.getMembersExpiringSoon(days);
  res.json(members);
});

app.get('/api/members/:id', requireAuth, (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  res.json(member);
});

app.post('/api/members', requireAuth, (req, res) => {
  const { 
    full_name, phone, email, address, join_date, duration_months, expiry_date, plan_type, notes, avatar_base64,
    date_of_birth, gender, emergency_contact_name, emergency_contact_phone,
    amount_paid_initial, payment_method, transaction_reference, payment_due_date
  } = req.body;

  if (!full_name || !phone || !join_date || !duration_months) {
    return res.status(400).json({ error: 'Name, phone, join date, and duration are required.' });
  }

  try {
    let avatar_path = '';
    if (avatar_base64) {
      avatar_path = saveBase64Image(avatar_base64, 'avatar');
    }

    const computedExpiry = db.getExpiryDate(join_date, duration_months).toISOString().split('T')[0];
    const finalExpiry = expiry_date || computedExpiry;

    const member = db.addMember({
      full_name, phone, email, address, join_date,
      duration_months: parseInt(duration_months),
      expiry_date: finalExpiry,
      plan_type: plan_type || 'Monthly',
      notes,
      avatar_path,
      date_of_birth,
      gender,
      first_joining_date: join_date,
      emergency_contact_name,
      emergency_contact_phone,
      is_active: 1
    });

    let plan = db.db.prepare('SELECT id, regular_price FROM plans WHERE plan_name = ?').get(plan_type);
    let planId = plan ? plan.id : null;
    let price = plan ? plan.regular_price : 0;

    const membershipDetails = {
      start_date: join_date,
      end_date: finalExpiry,
      original_price: price,
      discount_type: 'NONE',
      discount_amount: 0,
      final_payable_amount: price,
      payment_due_date: payment_due_date || finalExpiry,
      plan_name_snapshot: plan_type || 'Monthly',
      notes: 'Initial membership on onboarding'
    };

    const paymentDetails = {
      amount_paid: parseFloat(amount_paid_initial || 0),
      payment_method: payment_method || 'Cash',
      transaction_reference: transaction_reference || '',
      notes: 'Initial onboarding payment'
    };

    const adminUser = req.session && req.session.adminUsername ? req.session.adminUsername : 'Admin';
    db.createMembership(member.id, planId, membershipDetails, paymentDetails, adminUser);

    hikvision.syncMemberToDevice(member);

    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getMemberById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const { 
    full_name, phone, email, address, join_date, duration_months, expiry_date, plan_type, status, notes, avatar_base64,
    date_of_birth, gender, emergency_contact_name, emergency_contact_phone, is_active
  } = req.body;

  try {
    let avatar_path = existing.avatar_path;
    if (avatar_base64 !== undefined) {
      if (existing.avatar_path && existing.avatar_path.startsWith('/uploads/')) {
        const oldFilepath = path.join(__dirname, 'public', existing.avatar_path);
        if (fs.existsSync(oldFilepath)) {
          try { fs.unlinkSync(oldFilepath); } catch (e) {}
        }
      }
      if (avatar_base64) {
        avatar_path = saveBase64Image(avatar_base64, 'avatar');
      } else {
        avatar_path = '';
      }
    }

    const updatedJoinDate = join_date || existing.join_date;
    const updatedDuration = duration_months ? parseInt(duration_months) : existing.duration_months;

    let finalExpiry = existing.expiry_date;
    if (expiry_date) {
      finalExpiry = expiry_date;
    } else if (join_date || duration_months) {
      finalExpiry = db.getExpiryDate(updatedJoinDate, updatedDuration).toISOString().split('T')[0];
    }

    let finalStatus = status || existing.status;
    const protectedNames = ['saurav kunwar', 'ashim pandey'];
    if (protectedNames.includes(existing.full_name.toLowerCase()) || (full_name && protectedNames.includes(full_name.toLowerCase()))) {
      finalStatus = 'active';
    }

    const member = db.updateMember(id, {
      full_name: full_name || existing.full_name,
      phone: phone || existing.phone,
      email: email !== undefined ? email : existing.email,
      address: address !== undefined ? address : existing.address,
      join_date: updatedJoinDate,
      duration_months: updatedDuration,
      expiry_date: finalExpiry,
      plan_type: plan_type || existing.plan_type,
      status: finalStatus,
      notes: notes !== undefined ? notes : existing.notes,
      avatar_path,
      member_code: existing.member_code,
      date_of_birth: date_of_birth !== undefined ? date_of_birth : existing.date_of_birth,
      gender: gender !== undefined ? gender : existing.gender,
      first_joining_date: existing.first_joining_date,
      emergency_contact_name: emergency_contact_name !== undefined ? emergency_contact_name : existing.emergency_contact_name,
      emergency_contact_phone: emergency_contact_phone !== undefined ? emergency_contact_phone : existing.emergency_contact_phone,
      is_active: is_active !== undefined ? parseInt(is_active) : existing.is_active
    });

    // Sync to Hikvision automatically
    hikvision.syncMemberToDevice(member);

    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getMemberById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const protectedNames = ['saurav kunwar', 'ashim pandey'];
  if (protectedNames.includes(existing.full_name.toLowerCase())) {
    return res.status(403).json({ error: 'Saurav Kunwar and Ashim Pandey are protected members and cannot be deleted.' });
  }

  try {
    if (existing.avatar_path && existing.avatar_path.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, 'public', existing.avatar_path);
      if (fs.existsSync(filepath)) {
        try { fs.unlinkSync(filepath); } catch (e) {}
      }
    }

    db.deleteMember(id);
    res.json({ success: true, message: 'Member deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// NOTIFICATION ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/members/:id/notify', requireAuth, async (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  try {
    const result = await notifyMember(member, req.body.type || 'expiry_warning', true);
    if (result && result.success === false) {
      return res.status(400).json({ error: result.error || 'Failed to send notification.' });
    }
    res.json({ success: true, message: `Notification sent to ${member.full_name}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send notification: ' + err.message });
  }
});

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.getNotifications(parseInt(req.query.limit) || 50);
  res.json(notifications);
});

app.delete('/api/notifications/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  db.deleteNotification(id);
  res.json({ success: true, message: 'Notification deleted.' });
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', requireAuth, (req, res) => {
  const stats = db.getDashboardStats();
  stats.todayAttendance = db.getTodayAttendanceCount();
  res.json(stats);
});

// ═══════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════

app.put('/api/admin/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.getAdminByUsername(req.session.admin.username);

  if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.updateAdminPassword(admin.id, hash);
  res.json({ success: true, message: 'Password updated successfully.' });
});

// ═══════════════════════════════════════════════════════════
// ATTENDANCE ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/attendance/checkin', requireAuth, (req, res) => {
  const { member_id, phone } = req.body;

  let member;
  if (member_id) {
    member = db.getMemberById(parseInt(member_id));
  } else if (phone) {
    const allMembers = db.getAllMembers('', 'all');
    member = allMembers.find(m => String(m.phone).replace(/\D/g, '') === String(phone).replace(/\D/g, ''));
  }

  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const result = db.recordAttendance(member.id);

  if (result.duplicate) {
    return res.status(409).json({
      error: `${member.full_name} is already checked in for the ${result.shift} shift today.`,
      shift: result.shift,
      member_name: member.full_name
    });
  }

  res.status(201).json({
    success: true,
    message: `${member.full_name} checked in for ${result.shift} shift.`,
    attendance: {
      ...result,
      member_name: member.full_name,
      phone: member.phone
    }
  });
});

app.get('/api/attendance', requireAuth, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const shift = req.query.shift || 'all';
  const records = db.getAttendanceByDate(date, shift);
  res.json(records);
});

app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const success = db.deleteAttendance(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Record not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/attendance/summary', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const summary = db.getAttendanceSummary(days);
  res.json(summary);
});

// ─── SERVER-SENT EVENTS (SSE) ────────────────────────────────
const sseClients = new Set();
app.get('/api/attendance/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sseClients.add(sendEvent);

  req.on('close', () => {
    sseClients.delete(sendEvent);
  });
});

dbEvents.on('attendance', (data) => {
  const member = db.getMemberById(data.memberId);
  const eventData = { ...data, member_name: member ? member.full_name : 'Unknown' };
  sseClients.forEach(client => client(eventData));
});

// ═══════════════════════════════════════════════════════════
// LOGISTICS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/logistics', requireAuth, (req, res) => {
  try {
    const search = req.query.search || '';
    const items = db.getAllLogistics(search);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logistics/transactions', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const transactions = db.getLogisticsTransactions(limit);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logistics', requireAuth, (req, res) => {
  const { name, price, quantity, image_base64 } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required.' });
  }

  try {
    let image_path = '';
    if (image_base64) {
      image_path = saveBase64Image(image_base64);
    }

    const item = db.addLogisticsItem({
      name,
      price: parseFloat(price),
      quantity: parseInt(quantity) || 0,
      image_path
    });

    if (item.quantity > 0) {
      db.recordLogisticsTransaction(item.id, 'restock', item.quantity, item.price, 'Initial stock setup');
    }

    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/logistics/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { name, price, quantity, image_base64 } = req.body;

  try {
    let image_path = existing.image_path;
    if (image_base64) {
      if (existing.image_path && existing.image_path.startsWith('/uploads/')) {
        const oldFilepath = path.join(__dirname, 'public', existing.image_path);
        if (fs.existsSync(oldFilepath)) {
          try { fs.unlinkSync(oldFilepath); } catch (e) {}
        }
      }
      image_path = saveBase64Image(image_base64);
    }

    const updatedQty = quantity !== undefined ? parseInt(quantity) : existing.quantity;
    const prevQty = existing.quantity;

    const item = db.updateLogisticsItem(id, {
      name: name || existing.name,
      price: price !== undefined ? parseFloat(price) : existing.price,
      quantity: updatedQty,
      image_path
    });

    if (updatedQty !== prevQty) {
      const diff = updatedQty - prevQty;
      const type = diff > 0 ? 'restock' : 'sale';
      db.recordLogisticsTransaction(id, type, Math.abs(diff), item.price, 'Stock adjusted via edit');
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/logistics/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  try {
    if (existing.image_path && existing.image_path.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, 'public', existing.image_path);
      if (fs.existsSync(filepath)) {
        try { fs.unlinkSync(filepath); } catch (e) {}
      }
    }

    db.deleteLogisticsItem(id);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logistics/:id/sell', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { quantity, notes } = req.body;
  const qtyToSell = parseInt(quantity);

  if (isNaN(qtyToSell) || qtyToSell <= 0) {
    return res.status(400).json({ error: 'Valid quantity is required.' });
  }

  if (qtyToSell > existing.quantity) {
    return res.status(400).json({ error: `Not enough stock. Available: ${existing.quantity}` });
  }

  try {
    const updatedQty = existing.quantity - qtyToSell;
    db.updateLogisticsItem(id, {
      name: existing.name,
      price: existing.price,
      quantity: updatedQty,
      image_path: existing.image_path
    });

    db.recordLogisticsTransaction(id, 'sale', qtyToSell, existing.price, notes || 'Product sold');
    res.json({ success: true, message: `${qtyToSell} units sold.`, available: updatedQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logistics/:id/restock', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getLogisticsById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const { quantity, notes } = req.body;
  const qtyToAdd = parseInt(quantity);

  if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
    return res.status(400).json({ error: 'Valid quantity is required.' });
  }

  try {
    const updatedQty = existing.quantity + qtyToAdd;
    db.updateLogisticsItem(id, {
      name: existing.name,
      price: existing.price,
      quantity: updatedQty,
      image_path: existing.image_path
    });

    db.recordLogisticsTransaction(id, 'restock', qtyToAdd, existing.price, notes || 'Stock replenishment');
    res.json({ success: true, message: `${qtyToAdd} units added.`, available: updatedQty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PLANS & FINANCIALS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/plans', requireAuth, (req, res) => {
  try {
    res.json(db.getAllPlans());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans', requireAuth, (req, res) => {
  const { plan_name, description, duration_value, duration_type, regular_price } = req.body;
  if (!plan_name || !duration_value || isNaN(regular_price)) {
    return res.status(400).json({ error: 'Plan name, duration, and price are required.' });
  }
  try {
    const plan = db.addPlan({
      plan_name: plan_name.trim(),
      description: description || '',
      duration_value: parseInt(duration_value),
      duration_type: duration_type || 'MONTH',
      regular_price: parseFloat(regular_price)
    });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/plans/:id', requireAuth, (req, res) => {
  try {
    db.deletePlan(parseInt(req.params.id));
    res.json({ success: true, message: 'Plan deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backward compatible package endpoints
app.get('/api/packages', requireAuth, (req, res) => {
  try {
    const plans = db.getAllPlans();
    const pkgs = plans.map(p => ({
      id: p.id,
      name: p.plan_name,
      duration_months: p.duration_value,
      price: p.regular_price
    }));
    res.json(pkgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/packages', requireAuth, (req, res) => {
  const { name, duration_months, price } = req.body;
  try {
    const plan = db.addPlan({
      plan_name: name.trim(),
      description: 'Migrated package',
      duration_value: parseInt(duration_months),
      duration_type: 'MONTH',
      regular_price: parseFloat(price)
    });
    res.status(201).json({
      id: plan.id,
      name: plan.plan_name,
      duration_months: plan.duration_value,
      price: plan.regular_price
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/packages/:id', requireAuth, (req, res) => {
  try {
    db.deletePlan(parseInt(req.params.id));
    res.json({ success: true, message: 'Package deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:id/profile', requireAuth, (req, res) => {
  try {
    const profile = db.getMemberProfile(parseInt(req.params.id));
    if (!profile) return res.status(404).json({ error: 'Member not found.' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:id/memberships', requireAuth, (req, res) => {
  try {
    const history = db.getMembershipHistory(parseInt(req.params.id));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:id/payments', requireAuth, (req, res) => {
  try {
    const payments = db.getPaymentHistory(parseInt(req.params.id));
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members/:id/renew', requireAuth, (req, res) => {
  const memberId = parseInt(req.params.id);
  const { 
    plan_id, start_date, end_date, original_price, discount_type, discount_amount, 
    final_payable_amount, payment_due_date, notes, amount_paid, payment_method, 
    transaction_reference, payment_notes 
  } = req.body;

  if (!start_date || !end_date || isNaN(final_payable_amount)) {
    return res.status(400).json({ error: 'Start date, end date, and final payable amount are required.' });
  }

  try {
    let planName = 'Custom Plan';
    if (plan_id) {
      const plan = db.db.prepare('SELECT plan_name FROM plans WHERE id = ?').get(plan_id);
      if (plan) planName = plan.plan_name;
    }

    const details = {
      start_date,
      end_date,
      original_price: parseFloat(original_price || final_payable_amount),
      discount_type: discount_type || 'NONE',
      discount_amount: parseFloat(discount_amount || 0),
      final_payable_amount: parseFloat(final_payable_amount),
      payment_due_date: payment_due_date || end_date,
      plan_name_snapshot: planName,
      notes: notes || 'Membership renewal'
    };

    const paymentDetails = {
      amount_paid: parseFloat(amount_paid || 0),
      payment_method: payment_method || 'Cash',
      transaction_reference: transaction_reference || '',
      notes: payment_notes || 'Renewal payment'
    };

    const adminUser = req.session && req.session.adminUsername ? req.session.adminUsername : 'Admin';
    const membershipId = db.renewMembership(memberId, plan_id, details, paymentDetails, adminUser);
    
    // Update main member expiration dates back to members table for UI
    db.db.prepare('UPDATE members SET join_date = ?, duration_months = ?, expiry_date = ?, plan_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(start_date, details.discount_type === 'PERCENT' ? 12 : 3, end_date, planName, memberId);

    res.status(201).json({ success: true, membershipId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments', requireAuth, (req, res) => {
  const { member_id, membership_id, amount, payment_method, transaction_reference, notes } = req.body;
  if (!member_id || !membership_id || isNaN(amount) || !payment_method) {
    return res.status(400).json({ error: 'Member, membership, amount, and method are required.' });
  }

  try {
    const adminUser = req.session && req.session.adminUsername ? req.session.adminUsername : 'Admin';
    const receiptNum = db.recordPayment(parseInt(member_id), parseInt(membership_id), parseFloat(amount), {
      payment_method,
      transaction_reference,
      notes
    }, adminUser);
    res.status(201).json({ success: true, receiptNum });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/payments/:id/reverse', requireAuth, (req, res) => {
  const paymentId = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ error: 'Reversal reason is required.' });
  }

  try {
    const adminUser = req.session && req.session.adminUsername ? req.session.adminUsername : 'Admin';
    db.reversePayment(paymentId, reason, adminUser);
    res.json({ success: true, message: 'Payment reversed.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/memberships/:id/freeze', requireAuth, (req, res) => {
  const membershipId = parseInt(req.params.id);
  const { days, reason } = req.body;
  if (!days || isNaN(days) || !reason) {
    return res.status(400).json({ error: 'Days and reason are required.' });
  }

  try {
    const adminUser = req.session && req.session.adminUsername ? req.session.adminUsername : 'Admin';
    db.freezeMembership(membershipId, parseInt(days), reason, adminUser);
    res.json({ success: true, message: 'Membership frozen.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/dues', requireAuth, (req, res) => {
  try {
    res.json(db.getOutstandingDues());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// HIKVISION ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/hikvision/settings', requireAuth, (req, res) => {
  const config = hikvision.getHikvisionConfig();
  // Don't send back password directly for security, just send a flag if it's set
  const responseConfig = {
    ...config,
    password: config.password ? '********' : '',
    laptopIp: db.getSetting('laptop_ip', '')
  };
  res.json(responseConfig);
});

app.post('/api/hikvision/settings', requireAuth, async (req, res) => {
  const { ip, port, username, password } = req.body;
  
  if (ip !== undefined) db.setSetting('hikvision_ip', ip);
  if (port !== undefined) db.setSetting('hikvision_port', port);
  if (username !== undefined) db.setSetting('hikvision_username', username);
  if (password && password !== '********') db.setSetting('hikvision_password', password);

  // Automatically configure the Hikvision device to talk back to this PC!
  let setupMsg = '';
  if (ip !== undefined) {
    const setupResult = await hikvision.setupLanConnection();
    if (!setupResult.success) {
      console.error('[Hikvision] Auto-setup LAN failed:', setupResult.message);
      setupMsg = ' However, auto-configuring the device failed. Please ensure the device is online.';
    }
  }

  res.json({ success: true, message: 'Hikvision settings updated successfully.' + setupMsg });
});

app.post('/api/hikvision/test', requireAuth, async (req, res) => {
  // Use provided config or fetch from DB
  const ip = req.body.ip || db.getSetting('hikvision_ip', '');
  const port = req.body.port || db.getSetting('hikvision_port', '80');
  const username = req.body.username || db.getSetting('hikvision_username', 'admin');
  const password = req.body.password && req.body.password !== '********' 
    ? req.body.password 
    : db.getSetting('hikvision_password', '');

  if (!ip) {
    return res.status(400).json({ success: false, message: 'IP Address is required.' });
  }

  const result = await hikvision.testHikvisionConnection(ip, port, username, password);
  res.json(result);
});

app.post('/api/hikvision/setup-lan', requireAuth, async (req, res) => {
  const laptopIp = req.body.laptopIp || db.getSetting('laptop_ip', '192.168.1.115');
  if (req.body.laptopIp) db.setSetting('laptop_ip', req.body.laptopIp); // Save it if provided here
  const result = await hikvision.setupLanConnection(laptopIp);
  res.json(result);
});

// ─── REAL-TIME AUTH CHECK (called by Hikvision BEFORE opening door) ──────────
// The device POSTs to this endpoint when someone scans their fingerprint.
// We check DB and respond 200 (allow) or 401 (deny).
app.post('/api/hikvision/auth', async (req, res) => {
  try {
    const body = req.body;
    // Extract Employee No from various Hikvision event formats
    let employeeNo =
      (body.AccessControllerEvent && body.AccessControllerEvent.employeeNoString) ||
      body.employeeNo ||
      body.EmployeeNo ||
      (body.UserInfo && body.UserInfo.employeeNo);

    if (!employeeNo) {
      console.log('[Hikvision Auth] Request received but employeeNo missing:', JSON.stringify(body));
      return res.status(400).json({ success: false, message: 'employeeNo not found' });
    }

    const phoneDigits = String(employeeNo).replace(/\D/g, '');
    const allMembers = db.getAllMembers('', 'all');
    const member = allMembers.find(m => String(m.phone).replace(/\D/g, '') === phoneDigits);
    const eventTime = body.time || body.dateTime || null;

    if (!member) {
      console.log(`[Hikvision Auth] DENIED - Employee ID ${phoneDigits} not found in database.`);
      return res.status(401).json({ success: false, message: 'Member not found', action: 'deny' });
    }

    if (member.status === 'active') {
      // Auto-record attendance on successful access
      const attendance = db.recordAttendance(member.id, eventTime);
      const shiftMsg = attendance.duplicate ? '(already checked in)' : `(${attendance.shift} shift)`;
      console.log(`[Hikvision Auth] GRANTED - ${member.full_name} (${phoneDigits}) - Active member. Attendance: ${shiftMsg}`);
      return res.status(200).json({ success: true, message: 'Access granted', action: 'open' });
    } else {
      console.log(`[Hikvision Auth] DENIED - ${member.full_name} (${phoneDigits}) - Status: ${member.status}`);
      return res.status(401).json({ success: false, message: 'Membership expired', action: 'deny' });
    }
  } catch (err) {
    console.error('[Hikvision Auth] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Legacy event webhook (fires AFTER door opens - kept for logging)
app.post('/api/hikvision/event', async (req, res) => {
  // Usually this does not requireAuth because it comes directly from the device
  const eventData = req.body;
  
  // Extract employeeNo depending on the exact payload structure your Hikvision sends
  // This is a placeholder extraction based on common ISAPI event structures
  let employeeNo = null;
  let eventTime = null;
  
  if (eventData && eventData.AccessControllerEvent && eventData.AccessControllerEvent.employeeNoString) {
    employeeNo = eventData.AccessControllerEvent.employeeNoString;
    eventTime = eventData.dateTime || eventData.time || null;
  } else if (eventData && eventData.employeeNo) {
    employeeNo = eventData.employeeNo;
    eventTime = eventData.time || null;
  }

  if (!employeeNo) {
    return res.status(400).json({ success: false, message: 'employeeNo not found in event payload' });
  }

  const result = await hikvision.handleFingerprintEvent(employeeNo, eventTime);
  res.json(result);
});

// Manual sync endpoint for attendance
app.get('/api/hikvision/sync', requireAuth, async (req, res) => {
  try {
    const result = await hikvision.pollAndRecordAttendance();
    res.json({ success: true, message: 'Sync complete', result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Aakash SMS Config Endpoints ────────────────────────────
app.get('/api/sms/settings', requireAuth, (req, res) => {
  const token = db.getSetting('aakash_sms_auth_token', '');
  res.json({
    token: token ? '********' : ''
  });
});

app.post('/api/sms/settings', requireAuth, (req, res) => {
  const { token } = req.body;
  if (token !== undefined && token !== '********') {
    db.setSetting('aakash_sms_auth_token', token);
    initSMS(); // Re-initialize immediately!
  }
  res.json({ success: true, message: 'Aakash SMS Token saved successfully.' });
});

// ─── Aakash SMS Diagnostics ─────────────────────────────────
app.get('/api/sms/diagnose', requireAuth, async (req, res) => {
  try {
    let publicIp = 'Unknown';
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        publicIp = ipData.ip;
      }
    } catch (e) {
      publicIp = 'Offline or could not fetch IP';
    }

    const activeToken = db.getSetting('aakash_sms_auth_token', '') || process.env.AAKASH_SMS_AUTH_TOKEN || '';
    const hasToken = !!activeToken;
    const tokenPart = hasToken 
      ? `${activeToken.substring(0, 6)}...${activeToken.slice(-4)}`
      : 'Not Configured';

    res.json({
      publicIp,
      configured: hasToken,
      tokenPreview: tokenPart,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sms/test-send', requireAuth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required for test SMS.' });
  }

  const token = db.getSetting('aakash_sms_auth_token', '') || process.env.AAKASH_SMS_AUTH_TOKEN;
  if (!token) {
    return res.status(400).json({ error: 'Aakash SMS Auth Token is not configured.' });
  }

  try {
    const body = {
      auth_token: token,
      to: phone,
      text: 'Fit24 Gym Test: This is a diagnostic test message from your GymPro system!'
    };
    
    const smsRes = await fetch('https://sms.aakashsms.com/sms/v3/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await smsRes.json();
    
    if (!smsRes.ok || data.error) {
      return res.status(400).json({
        success: false,
        error: data.message || 'Aakash SMS rejected the request.',
        details: data
      });
    }

    res.json({
      success: true,
      message: 'Test SMS sent successfully!',
      details: data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to connect to Aakash SMS API.'
    });
  }
});

// ─── Chatbot API Endpoint ────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  const mistralApiKey = process.env.MISTRAL_API_KEY ? process.env.MISTRAL_API_KEY.trim() : '';
  if (!mistralApiKey) {
    return res.status(400).json({ 
      error: 'Mistral API Key is not configured in .env. Please configure MISTRAL_API_KEY in the server environment.' 
    });
  }

  const agentId = process.env.MISTRAL_AGENT_ID ? process.env.MISTRAL_AGENT_ID.trim() : 'ag_019f9fef1481776097ed81bacbbca7fd';
  const url = 'https://api.mistral.ai/v1/agents/completions';

  try {
    const apiResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        agent_id: agentId,
        messages: messages
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('[Chat API Error]:', errorText);
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      const errMsg = errorJson?.message || errorJson?.detail || errorText || 'Failed to retrieve response from Mistral AI agent.';
      return res.status(apiResponse.status).json({ error: `Mistral API: ${errMsg}` });
    }

    const data = await apiResponse.json();
    res.json(data);
  } catch (err) {
    console.error('[Chat API Error]:', err);
    res.status(500).json({ error: err.message || 'Internal server error during chat.' });
  }
});

// ─── Serve Pages ────────────────────────────────────────────
app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏋️  GymPro Management System`);
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  console.log(`👤 Default login: admin / admin123\n`);

  // Start notification scheduler
  startScheduler();
});
