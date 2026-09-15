const express = require('express');
const db = require('../db/database');
const { requireAuth, requireDeviceAuth } = require('../middleware/auth');
const hikvision = require('../device/hikvisionService');
const router = express.Router();

router.get('/settings', requireAuth, (req, res) => {
  const config = hikvision.getHikvisionConfig();
  const responseConfig = {
    ...config,
    password: config.password ? '********' : '',
    laptopIp: db.getSetting('laptop_ip', '')
  };
  res.json(responseConfig);
});

router.post('/settings', requireAuth, async (req, res) => {
  const { ip, port, username, password } = req.body;
  
  if (ip !== undefined) db.setSetting('hikvision_ip', ip);
  if (port !== undefined) db.setSetting('hikvision_port', port);
  if (username !== undefined) db.setSetting('hikvision_username', username);
  if (password && password !== '********') db.setSetting('hikvision_password', password);

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

router.post('/test', requireAuth, async (req, res) => {
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

router.post('/setup-lan', requireAuth, async (req, res) => {
  const laptopIp = req.body.laptopIp || db.getSetting('laptop_ip', '192.168.1.115');
  if (req.body.laptopIp) db.setSetting('laptop_ip', req.body.laptopIp);
  const result = await hikvision.setupLanConnection(laptopIp);
  res.json(result);
});

router.post('/auth', requireDeviceAuth, async (req, res) => {
  try {
    const body = req.body;
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

router.post('/event', requireDeviceAuth, async (req, res) => {
  const eventData = req.body;
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

router.get('/sync', requireAuth, async (req, res) => {
  try {
    const result = await hikvision.pollAndRecordAttendance();
    res.json({ success: true, message: 'Sync complete', result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
