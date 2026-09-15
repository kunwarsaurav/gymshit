const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', '..', 'frontend', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedMimes = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function saveBase64Image(base64Data, filenamePrefix = 'logistics') {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return null;
  }
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const contentType = matches[1].toLowerCase();
  const extension = allowedMimes[contentType] || 'png';
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('Image exceeds 10MB limit.');
  }

  const filename = `${filenamePrefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${extension}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

module.exports = { saveBase64Image, uploadsDir };
