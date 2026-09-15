const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/stats', requireAuth, (req, res) => {
  const stats = db.getDashboardStats();
  stats.todayAttendance = db.getTodayAttendanceCount();
  res.json(stats);
});

module.exports = router;
