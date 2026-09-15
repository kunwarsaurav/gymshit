// Authentication middleware - checks if admin is logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// Page authentication middleware - redirects to login if not authenticated
function requirePageAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect('/');
}

const db = require('../db/database');

// Device authentication middleware - ensures webhooks come from configured device, localhost, or active admin
function requireDeviceAuth(req, res, next) {
  const configuredDeviceIp = db.getSetting ? db.getSetting('hikvision_ip', '') : '';
  const rawIp = req.ip || (req.socket && req.socket.remoteAddress) || '';
  const clientIp = rawIp.replace(/^.*:/, ''); // Normalize IPv6 mapped IPv4 like ::ffff:192.168.1.182

  if (
    clientIp === '127.0.0.1' ||
    clientIp === 'localhost' ||
    (configuredDeviceIp && clientIp === configuredDeviceIp)
  ) {
    return next();
  }

  if (req.session && req.session.admin) {
    return next();
  }

  console.warn(`[Security Alert] Unauthorized access attempt to device API from IP: ${clientIp}`);
  return res.status(403).json({ error: 'Forbidden: Device IP not authorized' });
}

module.exports = { requireAuth, requirePageAuth, requireDeviceAuth };
