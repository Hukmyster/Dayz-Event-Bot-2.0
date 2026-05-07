const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = '/dayzps_missions/dayzOffline.chernarusplus/custom/server';

console.log("[STORAGE] Using path:", REMOTE_BASE);

const FILES = {
  radars: { name: 'radars.json', format: 'json' },
  economy: { name: 'economy.csv', format: 'csv' }
};

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

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
    const values = cols.map(v => v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function toCsv(rows, headers) {
  const headerLine = headers.join(',');
  const lines = rows.map(row => headers.map(h => escapeCsv(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

async function loadJson(key) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.json`, format: 'json' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);

  try {
    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.downloadTo(localPath, remotePath).catch(() => {});
    client.close().catch(() => {});

    const raw = await fs.readFile(localPath, 'utf8');
    console.log(`[STORAGE] ✅ Loaded ${file.name}`);
    return JSON.parse(raw);
  } catch (err) {
    console.log(`[STORAGE] Creating new file: ${file.name}`);
    const defaultData = (key === 'shop' || key === 'radars') ? [] : {};
    await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.json`, format: 'json' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));

    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${file.name}`);
    client.close().catch(() => {});
  } catch (err) {
    console.error(`[STORAGE] Save failed for ${file.name}:`, err.message);
  }
}

async function loadTable(key, headers = []) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.csv`, format: 'csv' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);

  try {
    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.downloadTo(localPath, remotePath).catch(() => {});
    client.close().catch(() => {});

    const raw = await fs.readFile(localPath, 'utf8').catch(() => '');
    if (!raw.trim()) return [];
    return parseCsv(raw);
  } catch (err) {
    if (headers.length) {
      const empty = headers.join(',') + '\n';
      await fs.writeFile(localPath, empty);
    }
    return [];
  }
}

async function saveTable(key, rows = [], headers = []) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.csv`, format: 'csv' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);

  try {
    const finalHeaders = headers.length ? headers : (rows[0] ? Object.keys(rows[0]) : []);
    const csv = toCsv(rows, finalHeaders);
    await fs.writeFile(localPath, csv);

    const client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${file.name}`);
    client.close().catch(() => {});
  } catch (err) {
    console.error(`[STORAGE] Table save failed for ${file.name}:`, err.message);
  }
}

module.exports = {
  loadJson,
  saveJson,
  loadTable,
  saveTable
};
