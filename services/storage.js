// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');

// Remote folder on your Nitrado server
const REMOTE_BASE = 'dayzps_missions/dayzOffline.chernarusplus/custom/server';

const FILES = {
  radars: 'radars.json',
  economy: 'economy.json',
  shop: 'shop.json',
};

async function ensureLocalDir() {
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn("[STORAGE] Could not create local data dir (Railway ephemeral?)", err.message);
  }
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

  await client.ensureDir(REMOTE_BASE);
  console.log(`[FTP] ✅ Connected & ensured folder: ${REMOTE_BASE}`);

  return client;
}

async function uploadFile(filename) {
  if (!process.env.FTP_HOST) {
    console.warn(`[FTP] No FTP_HOST set - skipping upload of ${filename}`);
    return;
  }

  const client = await getFtpClient();
  try {
    const localPath = path.join(LOCAL_DATA_DIR, filename);
    const remotePath = `${REMOTE_BASE}/${filename}`;

    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${filename}`);
  } catch (err) {
    console.error(`[FTP] ❌ Upload failed ${filename}`, err.message);
  } finally {
    client.close();
  }
}

async function downloadFile(filename) {
  if (!process.env.FTP_HOST) return false;

  const client = await getFtpClient();
  try {
    const localPath = path.join(LOCAL_DATA_DIR, filename);
    const remotePath = `${REMOTE_BASE}/${filename}`;

    await client.downloadTo(localPath, remotePath);
    console.log(`[FTP] ✅ Downloaded ${filename}`);
    return true;
  } catch (err) {
    if (err.code === 550 || err.message?.includes('No such file')) {
      return false;
    }
    console.error(`[FTP] Download error ${filename}`, err.message);
    return false;
  } finally {
    client.close();
  }
}

async function loadJson(key) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  try {
    const downloaded = await downloadFile(filename);

    if (!downloaded) {
      const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
      await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
      console.log(`[STORAGE] Created new default file: ${filename}`);
    }

    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Load failed for ${key}`, err.message);
    return (key === 'shop' || key === 'radars') ? [] : {};
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));
    await uploadFile(filename);        // Always try to sync to Nitrado
  } catch (err) {
    console.error(`[STORAGE] Save failed for ${key}`, err.message);
  }
}

module.exports = {
  loadJson,
  saveJson,
  uploadFile,
  downloadFile,
};
