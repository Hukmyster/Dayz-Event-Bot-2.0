// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = '/dayzps_missions/dayzOffline.chernarusplus/custom/server';

const FILES = {
  radars: 'radars.json',
  economy: 'economy.json',
  shop: 'shop.json',
};

console.log("[STORAGE] Service initializing...");

async function ensureLocalDir() {
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    console.log(`[STORAGE] Local data dir ready: ${LOCAL_DATA_DIR}`);
  } catch (err) {
    console.warn("[STORAGE] Could not create local data dir", err.message);
  }
}

async function getFtpClient() {
  if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS) {
    console.warn("[STORAGE] FTP credentials not fully set - running in local-only mode");
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = process.env.FTP_DEBUG === 'true';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    await client.ensureDir(REMOTE_BASE);
    console.log(`[FTP] ✅ Connected | Folder ensured: ${REMOTE_BASE}`);
    return client;
  } catch (err) {
    console.error("[FTP] ❌ Connection failed:", err.message);
    client.close().catch(() => {});
    throw err;
  }
}

async function uploadFile(filename) {
  const client = await getFtpClient();
  if (!client) return;

  try {
    const localPath = path.join(LOCAL_DATA_DIR, filename);
    const remotePath = `${REMOTE_BASE}/${filename}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${filename}`);
  } catch (err) {
    console.error(`[FTP] Upload failed for ${filename}:`, err.message);
  } finally {
    client.close().catch(() => {});
  }
}

async function downloadFile(filename) {
  const client = await getFtpClient();
  if (!client) return false;

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
    console.error(`[FTP] Download failed ${filename}:`, err.message);
    return false;
  } finally {
    client.close().catch(() => {});
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
      console.log(`[STORAGE] Created new default: ${filename}`);
    }

    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Load error for ${key}:`, err.message);
    return (key === 'shop' || key === 'radars') ? [] : {};
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));
    await uploadFile(filename);
  } catch (err) {
    console.error(`[STORAGE] Save error for ${key}:`, err.message);
  }
}

module.exports = {
  loadJson,
  saveJson,
  uploadFile,
  downloadFile,
};
