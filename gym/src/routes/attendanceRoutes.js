const express = require('express');
const db = require('../db/database');
const { dbEvents } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/checkin', requireAuth, (req, res) => {
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

router.get('/', requireAuth, (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const shift = req.query.shift || 'all';
  const records = db.getAttendanceByDate(date, shift);
  res.json(records);
});

router.delete('/:id', requireAuth, (req, res) => {
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

router.get('/summary', requireAuth, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const summary = db.getAttendanceSummary(days);
  res.json(summary);
});

// ─── SERVER-SENT EVENTS (SSE) ────────────────────────────────
const sseClients = new Set();

router.get('/stream', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      sseClients.delete(sendEvent);
    }
  };

  sseClients.add(sendEvent);

  // Keep-alive heartbeat every 25 seconds to keep connection active and detect closed sockets
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (err) {
      clearInterval(keepAliveInterval);
      sseClients.delete(sendEvent);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    sseClients.delete(sendEvent);
  });
});

dbEvents.on('attendance', (data) => {
  try {
    const member = db.getMemberById(data.memberId);
    const eventData = { ...data, member_name: member ? member.full_name : 'Unknown' };
    sseClients.forEach(client => {
      try {
        client(eventData);
      } catch (e) {
        sseClients.delete(client);
      }
    });
  } catch (err) {
    console.error('[SSE Attendance Broadcast Error]:', err.message || err);
  }
});

module.exports = router;
