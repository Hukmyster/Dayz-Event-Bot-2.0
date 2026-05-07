// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');

// Try without leading slash first (most common on Nitrado)
const REMOTE_BASE = 'dayzps_missions/dayzOffline.chernarusplus/custom/server';

console.log("[STORAGE] Initializing... Target path:", REMOTE_BASE);

async function ensureLocalDir() {
  try {
    await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
    console.log(`[STORAGE] Local folder ready: ${LOCAL_DATA_DIR}`);
  } catch (err) {
    console.warn("[STORAGE] Local dir issue:", err.message);
  }
}

async function getFtpClient() {
  if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS) {
    console.warn("[STORAGE] FTP credentials missing → local mode only");
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = true;   // Very verbose for debugging

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    console.log(`[FTP] Connected | Current dir: ${await client.pwd()}`);

    // Create folder step-by-step (more reliable than ensureDir with long path)
    const parts = REMOTE_BASE.split('/');
    let currentPath = '';

    for (const part of parts) {
      if (!part) continue;
      currentPath += (currentPath ? '/' : '') + part;
      await client.ensureDir(currentPath);
      console.log(`[FTP] Created/ensured: ${currentPath}`);
    }

    console.log(`[FTP] ✅ Full path ready: ${REMOTE_BASE}`);
    return client;
  } catch (err) {
    console.error("[FTP] ❌ Failed:", err.message);
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
    if (err.code === 550 || err.message?.includes('No such file')) return false;
    console.error(`[FTP] Download failed ${filename}:`, err.message);
    return false;
  } finally {
    client.close().catch(() => {});
  }
}

async function loadJson(key) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;   // Note: FILES is missing in your pasted code - fixed below
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  try {
    const downloaded = await downloadFile(filename);
    if (!downloaded) {
      const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
      await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
      console.log(`[STORAGE] Created default: ${filename}`);
    }
    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[STORAGE] Load error for ${key}:`, err.message);
    return (key === 'shop' || key === 'radars') ? [] : {};
  }
}

const FILES = {
  radars: 'radars.json',
  economy: 'economy.json',
  shop: 'shop.json',
};

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
