// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = 'dayzps_missions/dayzOffline.chernarusplus/custom/server';   // No leading slash

console.log("[STORAGE] Target folder:", REMOTE_BASE);

async function ensureLocalDir() {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true }).catch(() => {});
}

async function getFtpClient() {
  if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS) {
    console.warn("[STORAGE] FTP not configured");
    return null;
  }

  const client = new ftp.Client();
  client.ftp.verbose = true;

  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: false,
  });

  console.log(`[FTP] Connected | Current dir: ${await client.pwd()}`);

  // Go to the custom folder first, then ensure 'server'
  await client.ensureDir('dayzps_missions/dayzOffline.chernarusplus/custom/server');
  console.log(`[FTP] ✅ Server folder ready`);

  return client;
}

// Upload / Download functions (same as before)
async function uploadFile(filename) {
  const client = await getFtpClient();
  if (!client) return;
  try {
    const localPath = path.join(LOCAL_DATA_DIR, filename);
    const remotePath = `dayzps_missions/dayzOffline.chernarusplus/custom/server/${filename}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${filename}`);
  } catch (err) {
    console.error(`[FTP] Upload failed:`, err.message);
  } finally {
    client.close().catch(() => {});
  }
}

async function downloadFile(filename) {
  const client = await getFtpClient();
  if (!client) return false;
  try {
    const localPath = path.join(LOCAL_DATA_DIR, filename);
    const remotePath = `dayzps_missions/dayzOffline.chernarusplus/custom/server/${filename}`;
    await client.downloadTo(localPath, remotePath);
    console.log(`[FTP] ✅ Downloaded ${filename}`);
    return true;
  } catch (err) {
    if (err.code === 550) return false;
    console.error(`[FTP] Download failed:`, err.message);
    return false;
  } finally {
    client.close().catch(() => {});
  }
}

// ... keep your existing loadJson and saveJson functions exactly as they are

const FILES = {
  radars: 'radars.json',
  economy: 'economy.json',
  shop: 'shop.json',
};

async function loadJson(key) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
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
    console.error(`[STORAGE] Load error:`, err.message);
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
    console.error(`[STORAGE] Save error:`, err.message);
  }
}

module.exports = {
  loadJson,
  saveJson,
  uploadFile,
  downloadFile,
};
