const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/', requireAuth, (req, res) => {
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

router.post('/:id/reverse', requireAuth, (req, res) => {
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

router.get('/dues', requireAuth, (req, res) => {
  try {
    res.json(db.getOutstandingDues());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
