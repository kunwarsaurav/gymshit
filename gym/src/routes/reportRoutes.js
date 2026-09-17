const express = require('express');
const nodemailer = require('nodemailer');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Helper to create Nodemailer transporter from stored settings or env
function getMailTransporter() {
  const service = db.getSetting('smtp_service', process.env.SMTP_SERVICE || 'gmail');
  const user = db.getSetting('smtp_user', process.env.SMTP_USER || '');
  let pass = db.getSetting('smtp_pass', process.env.SMTP_PASS || '');
  const host = db.getSetting('smtp_host', process.env.SMTP_HOST || '');
  const port = parseInt(db.getSetting('smtp_port', process.env.SMTP_PORT || '587'), 10);
  const secure = port === 465;

  if (!user || !pass) {
    return null;
  }

  // Remove any spaces (Google App Passwords are shown with spaces like 'xxxx xxxx xxxx xxxx')
  pass = pass.replace(/\s+/g, '');

  if (service === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  } else if (service === 'outlook' || service === 'hotmail') {
    return nodemailer.createTransport({
      service: 'hotmail',
      auth: { user, pass }
    });
  } else {
    return nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port: port || 587,
      secure: secure,
      auth: { user, pass }
    });
  }
}

// GET /api/reports/smtp-config
router.get('/smtp-config', requireAuth, (req, res) => {
  try {
    const service = db.getSetting('smtp_service', 'gmail');
    const user = db.getSetting('smtp_user', '');
    const pass = db.getSetting('smtp_pass', '');
    const host = db.getSetting('smtp_host', 'smtp.gmail.com');
    const port = db.getSetting('smtp_port', '587');
    const senderName = db.getSetting('smtp_sender_name', 'Fitness Hub Management');

    res.json({
      service,
      user,
      hasPassword: !!pass,
      host,
      port,
      senderName,
      isConfigured: !!(user && pass)
    });
  } catch (err) {
    console.error('Error fetching SMTP config:', err);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

// POST /api/reports/smtp-config
router.post('/smtp-config', requireAuth, (req, res) => {
  try {
    const { service, user, pass, host, port, senderName } = req.body;
    if (service) db.setSetting('smtp_service', service);
    if (user !== undefined) db.setSetting('smtp_user', user.trim());
    if (pass) db.setSetting('smtp_pass', pass.trim());
    if (host !== undefined) db.setSetting('smtp_host', host.trim());
    if (port !== undefined) db.setSetting('smtp_port', String(port).trim());
    if (senderName !== undefined) db.setSetting('smtp_sender_name', senderName.trim());

    res.json({ success: true, message: 'Email delivery settings saved successfully!' });
  } catch (err) {
    console.error('Error saving SMTP config:', err);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

// POST /api/reports/test-smtp
router.post('/test-smtp', requireAuth, async (req, res) => {
  try {
    const { testEmail } = req.body;
    const recipient = testEmail || db.getSetting('smtp_user', '');
    if (!recipient) {
      return res.status(400).json({ error: 'Please provide a test recipient email.' });
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      return res.status(400).json({ 
        error: 'SMTP not configured', 
        message: 'Please enter and save your sender email & app password first.' 
      });
    }

    const senderName = db.getSetting('smtp_sender_name', 'Fitness Hub Management');
    const senderUser = db.getSetting('smtp_user', '');

    await transporter.verify();
    await transporter.sendMail({
      from: `"${senderName}" <${senderUser}>`,
      to: recipient,
      subject: '✅ Fitness Hub - SMTP Connection Test Successful',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #10b981;">Connection Successful!</h2>
          <p>This is a confirmation that your email sending credentials in <strong>Fitness Hub Gym Management</strong> are functioning perfectly.</p>
          <p style="color: #64748b; font-size: 13px;">Sent on: ${new Date().toLocaleString()}</p>
        </div>
      `
    });

    res.json({ success: true, message: `Test email sent successfully to ${recipient}!` });
  } catch (err) {
    console.error('SMTP test error:', err);
    let friendly = err.message || 'Failed to authenticate with SMTP server.';
    if (err.code === 'EAUTH' || (err.message && err.message.includes('535'))) {
      friendly = 'Google rejected login (BadCredentials). Please enter a 16-character Google App Password (not your regular Gmail password). 2-Step Verification must be ON.';
    }
    res.status(500).json({ error: friendly });
  }
});

// POST /api/reports/send-direct-email (Direct SMTP sending with attached PDF)
router.post('/send-direct-email', requireAuth, async (req, res) => {
  try {
    const { email, filename, pdfDataUri, subject, body } = req.body;
    if (!email || !filename || !pdfDataUri) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transporter = getMailTransporter();
    if (!transporter) {
      return res.status(400).json({ 
        error: 'SMTP_NOT_CONFIGURED',
        message: 'Direct email sending requires email credentials. Please configure your sender email in Settings first.'
      });
    }

    const pureBase64 = pdfDataUri.split(';base64,').pop();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const senderName = db.getSetting('smtp_sender_name', 'Fitness Hub Management');
    const senderUser = db.getSetting('smtp_user', '');

    const emailSubject = subject || `Fitness Hub - Executive Performance Report (${cleanFilename.replace('.pdf', '')})`;
    const emailBody = body || `Hello,\n\nPlease find attached the official Fitness Hub Gym Performance & Financial Audit Report for your review.\n\nGenerated on: ${new Date().toISOString().split('T')[0]}\n\nBest regards,\nFitness Hub Administration`;

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderUser}>`,
      to: email,
      subject: emailSubject,
      text: emailBody,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; max-width: 600px; padding: 20px; line-height: 1.6;">
          <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
            <h2 style="color: #0f172a; margin: 0;">Fitness Hub Gym Management</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Official Business Intelligence & Performance Report</p>
          </div>
          <p style="white-space: pre-line;">${emailBody}</p>
          <div style="margin-top: 20px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; color: #475569;">
            📎 <strong>Attachment:</strong> ${cleanFilename} (Executive PDF Report)
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
            This report was securely dispatched by the Fitness Hub Management Platform.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: cleanFilename,
          content: Buffer.from(pureBase64, 'base64'),
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({ 
      success: true, 
      messageId: info.messageId, 
      message: `Report PDF successfully delivered directly to ${email}!` 
    });

  } catch (err) {
    console.error('Direct email delivery error:', err);
    let friendly = err.message || 'Failed to dispatch email. Please check your SMTP settings.';
    if (err.code === 'EAUTH' || (err.message && err.message.includes('535'))) {
      friendly = 'Google rejected login (BadCredentials). Please enter a 16-character Google App Password (not your regular Gmail password).';
    }
    res.status(500).json({ 
      error: 'EMAIL_SEND_FAILED', 
      message: friendly 
    });
  }
});

// GET /api/reports/analytics
router.get('/analytics', requireAuth, (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    
    // Default to current month if not provided
    if (!startDate || !endDate) {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const pad = (n) => n.toString().padStart(2, '0');
      startDate = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-01`;
      endDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    }

    const reportData = db.getAnalyticsReport(startDate, endDate);
    res.json(reportData);
  } catch (err) {
    console.error('Error generating analytics report:', err);
    res.status(500).json({ error: 'Failed to generate analytics report.' });
  }
});

// POST /api/reports/send-email (Desktop Outlook / Mail client fallback)
router.post('/send-email', requireAuth, async (req, res) => {
  try {
    const { email, filename, pdfDataUri } = req.body;
    if (!email || !filename || !pdfDataUri) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pureBase64 = pdfDataUri.split(';base64,').pop();

    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const { execFile } = require('child_process');

    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    // Save to user's Downloads folder if possible, or fallback to tempDir
    const userDownloads = path.join(os.homedir(), 'Downloads');
    const targetDir = fs.existsSync(userDownloads) ? userDownloads : os.tmpdir();
    const filePath = path.join(targetDir, cleanFilename);

    fs.writeFileSync(filePath, pureBase64, { encoding: 'base64' });

    // Create temporary PowerShell script file for clean execution
    const ps1Path = path.join(os.tmpdir(), `open_email_${Date.now()}.ps1`);
    const formattedFilePath = filePath.replace(/'/g, "''");
    const escapedEmail = email.replace(/'/g, "''");
    const reportTitle = cleanFilename.replace('.pdf', '').replace(/_/g, ' ');

    const subjectEncoded = encodeURIComponent(`Fitness Hub - ${reportTitle}`);
    const bodyEncoded = encodeURIComponent(`Hello,\n\nPlease find attached the official Fitness Hub Gym Performance & Financial Audit Report for your review.\n\nReport File: ${cleanFilename}\nGenerated: ${new Date().toISOString().split('T')[0]}\n\nBest regards,\nFitness Hub Administration`);

    const psScript = `
$ErrorActionPreference = "SilentlyContinue"
$launched = $false

# 1. Try Classic Win32 Outlook COM Automation (if available)
try {
  $ol = New-Object -ComObject Outlook.Application
  if ($ol) {
    $mail = $ol.CreateItem(0)
    $mail.To = '${escapedEmail}'
    $mail.Subject = 'Fitness Hub - ${reportTitle}'
    $mail.Body = "Hello,\`r\`n\`r\`nPlease find attached the official Fitness Hub Gym Performance & Financial Audit Report for your review.\`r\`n\`r\`nReport File: ${cleanFilename}\`r\`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm')\`r\`n\`r\`nBest regards,\`r\`nFitness Hub Administration"
    $mail.Attachments.Add('${formattedFilePath}')
    $mail.Display()
    $launched = $true
    Write-Output "METHOD:COM"
  }
} catch {
  $launched = $false
}

# 2. If Classic COM is not available (New Outlook / Windows Mail), launch default mail client
if (-not $launched) {
  try {
    $mailtoUri = "mailto:${escapedEmail}?subject=${subjectEncoded}&body=${bodyEncoded}"
    Start-Process $mailtoUri
    $launched = $true
    Write-Output "METHOD:MAILTO"
  } catch {
    Write-Error $_.Exception.Message
    exit 1
  }
}

if ($launched) {
  Write-Output "SUCCESS"
} else {
  exit 1
}
`;

    fs.writeFileSync(ps1Path, psScript, 'utf8');

    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path], (error, stdout, stderr) => {
      // Clean up ps1 file
      try { fs.unlinkSync(ps1Path); } catch (e) {}

      if (error) {
        console.error('PowerShell error:', stderr || error);
        return res.status(500).json({ error: 'Failed to launch email client.' });
      }

      const isCom = stdout && stdout.includes('METHOD:COM');
      res.json({ 
        success: true, 
        method: isCom ? 'com' : 'mailto',
        filePath: filePath,
        message: isCom 
          ? 'Outlook opened with PDF attached!' 
          : 'Email draft opened in your default email client!'
      });
    });

  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to process PDF attachment.' });
  }
});

module.exports = router;

