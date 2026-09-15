const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/:id/freeze', requireAuth, (req, res) => {
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

module.exports = router;
