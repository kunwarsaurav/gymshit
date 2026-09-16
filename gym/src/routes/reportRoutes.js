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

    const tempDir = os.tmpdir();
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(tempDir, cleanFilename);

    fs.writeFileSync(filePath, pureBase64, { encoding: 'base64' });

    // Create temporary PowerShell script file for clean execution
    const ps1Path = path.join(tempDir, `open_outlook_${Date.now()}.ps1`);
    const formattedFilePath = filePath.replace(/'/g, "''");
    const escapedEmail = email.replace(/'/g, "''");
    const reportTitle = cleanFilename.replace('.pdf', '').replace(/_/g, ' ');

    const psScript = `
$ErrorActionPreference = "Stop"
try {
  $ol = New-Object -ComObject Outlook.Application
  $mail = $ol.CreateItem(0)
  $mail.To = '${escapedEmail}'
  $mail.Subject = 'Fitness Hub - ${reportTitle}'
  $mail.Body = "Hello,\`r\`n\`r\`nPlease find attached the official Fitness Hub Gym Performance & Financial Audit Report for your review.\`r\`n\`r\`nReport: ${reportTitle}\`r\`nGenerated on: $(Get-Date -Format 'yyyy-MM-dd HH:mm')\`r\`n\`r\`nBest regards,\`r\`nFitness Hub Administration"
  $mail.Attachments.Add('${formattedFilePath}')
  $mail.Display()
  Write-Output "SUCCESS"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`;

    fs.writeFileSync(ps1Path, psScript, 'utf8');

    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1Path], (error, stdout, stderr) => {
      // Clean up ps1 file
      try { fs.unlinkSync(ps1Path); } catch (e) {}

      if (error) {
        console.error('PowerShell error:', stderr || error);
        return res.status(500).json({ error: 'Failed to launch Outlook. Please ensure Microsoft Outlook is configured.' });
      }
      res.json({ success: true, message: 'Outlook opened successfully' });
    });

  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to process PDF attachment.' });
  }
});

module.exports = router;
