// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');   // Local folder (unchanged)

// Remote DayZ folder structure you requested
const REMOTE_BASE = 'dayzps_missions/dayzOffline.chernarusplus/custom/server';

const FILES = {
  radars: 'radars.json',
  economy: 'economy.json',
  shop: 'shop.json',
  // Add more files here later if needed
};

async function ensureLocalDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function getFtpClient() {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: false,
  });

  // Create the full folder structure automatically
  await client.ensureDir(REMOTE_BASE);
  console.log(`[FTP] ✅ Ensured remote folder: ${REMOTE_BASE}`);

  return client;
}

async function uploadFile(filename) {
  if (!process.env.FTP_HOST) return;

  const client = await getFtpClient();
  try {
    const localPath = path.join(DATA_DIR, filename);
    const remotePath = `${REMOTE_BASE}/${filename}`;

    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${filename} → ${remotePath}`);
  } catch (err) {
    console.error(`[FTP] ❌ Upload failed for ${filename}`, err.message);
  } finally {
    client.close();
  }
}

async function downloadFile(filename) {
  if (!process.env.FTP_HOST) return false;

  const client = await getFtpClient();
  try {
    const localPath = path.join(DATA_DIR, filename);
    const remotePath = `${REMOTE_BASE}/${filename}`;

    await client.downloadTo(localPath, remotePath);
    console.log(`[FTP] ✅ Downloaded ${filename}`);
    return true;
  } catch (err) {
    if (err.code === 550 || err.message?.includes('No such file')) {
      return false; // File doesn't exist yet
    }
    console.error(`[FTP] Download error for ${filename}`, err.message);
    return false;
  } finally {
    client.close();
  }
}

async function loadJson(key) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(DATA_DIR, filename);

  try {
    const downloaded = await downloadFile(filename);

    if (!downloaded) {
      // Create default file
      const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
      await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
      console.log(`[STORAGE] Created new file: ${filename}`);
    }

    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Failed to load ${key}`, err);
    return (key === 'shop' || key === 'radars') ? [] : {};
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(DATA_DIR, filename);

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));
    await uploadFile(filename);
  } catch (err) {
    console.error(`[STORAGE] Failed to save ${key}`, err);
  }
}

module.exports = {
  loadJson,
  saveJson,
  uploadFile,
  downloadFile,
};
