// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = '/dayzps_missions/dayzOffline.chernarusplus/custom/server';

console.log("[STORAGE] Using path:", REMOTE_BASE);

async function ensureLocalDir() {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true }).catch(() => {});
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
  return client;
}

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
    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${filename}`;
    
    await client.downloadTo(localPath, remotePath).catch(() => {}); // ignore if not exists
    client.close().catch(() => {});

    const raw = await fs.readFile(localPath, 'utf8');
    console.log(`[STORAGE] ✅ Loaded ${filename}`);
    return JSON.parse(raw);
  } catch (err) {
    console.log(`[STORAGE] Creating new file: ${filename}`);
    const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
    await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));

    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${filename}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${filename}`);
    client.close().catch(() => {});
  } catch (err) {
    console.error(`[STORAGE] Save failed for ${filename}:`, err.message);
  }
}

module.exports = {
  loadJson,
  saveJson,
};
