// services/storage.js
const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = 'dayzps_missions/dayzOffline.chernarusplus/custom/server';   // No leading /

console.log("[STORAGE] Target folder:", REMOTE_BASE);

async function ensureLocalDir() {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true }).catch(() => {});
}

async function testFtpConnection() {
  console.log("[FTP] Testing connection and folder creation...");
  const client = new ftp.Client();
  client.ftp.verbose = true;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    console.log(`[FTP] Connected! Current dir: ${await client.pwd()}`);

    await client.ensureDir(REMOTE_BASE);
    console.log(`[FTP] ✅ Folder ensured: ${REMOTE_BASE}`);

    const list = await client.list(REMOTE_BASE);
    console.log(`[FTP] Folder contents: ${list.length} items`);

    console.log("[FTP] ✅ Test successful!");
  } catch (err) {
    console.error("[FTP] ❌ Test failed:", err.message);
  } finally {
    client.close().catch(() => {});
  }
}

// Run test immediately when storage is loaded
testFtpConnection().catch(console.error);

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
    const client = new ftp.Client();
    await client.access({ host: process.env.FTP_HOST, user: process.env.FTP_USER, password: process.env.FTP_PASS });
    const remotePath = `${REMOTE_BASE}/${filename}`;
    await client.downloadTo(localPath, remotePath).catch(() => {});
    client.close();

    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.log(`[STORAGE] Creating new ${filename}`);
    const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
    await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
    // upload later when needed
    return defaultData;
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const filename = FILES[key] || `${key}.json`;
  const localPath = path.join(LOCAL_DATA_DIR, filename);

  await fs.writeFile(localPath, JSON.stringify(data, null, 2));
  // Upload logic can be expanded later
  console.log(`[STORAGE] Saved locally: ${filename}`);
}

module.exports = {
  loadJson,
  saveJson,
};
