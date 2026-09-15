const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { initSMS } = require('../cron/notifier');
const router = express.Router();

router.get('/settings', requireAuth, (req, res) => {
  const token = db.getSetting('aakash_sms_auth_token', '');
  res.json({
    token: token ? '********' : ''
  });
});

router.post('/settings', requireAuth, (req, res) => {
  const { token } = req.body;
  if (token !== undefined && token !== '********') {
    db.setSetting('aakash_sms_auth_token', token);
    initSMS();
  }
  res.json({ success: true, message: 'Aakash SMS Token saved successfully.' });
});

router.get('/diagnose', requireAuth, async (req, res) => {
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

router.post('/test-send', requireAuth, async (req, res) => {
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

module.exports = router;
