const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const hikvision = require('../device/hikvisionService');
const { saveBase64Image } = require('../utils/imageUtils');
const { notifyMember } = require('../cron/notifier');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
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

router.get('/expiring', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || parseInt(process.env.NOTIFY_DAYS_BEFORE) || 3;
  const members = db.getMembersExpiringSoon(days);
  res.json(members);
});

router.get('/:id', requireAuth, (req, res) => {
  const member = db.getMemberById(parseInt(req.params.id));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  res.json(member);
});

router.post('/', requireAuth, (req, res) => {
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

router.put('/:id', requireAuth, (req, res) => {
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
        const oldFilepath = path.join(__dirname, '..', '..', 'frontend', existing.avatar_path);
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
    if (existing.is_system_protected === 1 || existing.is_system_protected === '1') {
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

    hikvision.syncMemberToDevice(member);

    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.getMemberById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  if (existing.is_system_protected === 1 || existing.is_system_protected === '1') {
    return res.status(403).json({ error: 'System protected members cannot be deleted.' });
  }

  try {
    if (existing.avatar_path && existing.avatar_path.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', '..', 'frontend', existing.avatar_path);
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

router.get('/:id/profile', requireAuth, (req, res) => {
  try {
    const profile = db.getMemberProfile(parseInt(req.params.id));
    if (!profile) return res.status(404).json({ error: 'Member not found.' });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/memberships', requireAuth, (req, res) => {
  try {
    const history = db.getMembershipHistory(parseInt(req.params.id));
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/payments', requireAuth, (req, res) => {
  try {
    const payments = db.getPaymentHistory(parseInt(req.params.id));
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/renew', requireAuth, (req, res) => {
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
    
    db.db.prepare('UPDATE members SET join_date = ?, duration_months = ?, expiry_date = ?, plan_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(start_date, details.discount_type === 'PERCENT' ? 12 : 3, end_date, planName, memberId);

    res.status(201).json({ success: true, membershipId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/notify', requireAuth, async (req, res) => {
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

module.exports = router;
