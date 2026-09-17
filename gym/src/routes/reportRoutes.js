const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

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

// POST /api/reports/send-email
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
