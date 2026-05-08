const ftp = require('basic-ftp');
const fs = require('fs').promises;
const path = require('path');

const LOCAL_DATA_DIR = path.join(__dirname, '../data');
const REMOTE_BASE = '/dayzps_missions/dayzOffline.chernarusplus/custom/server';
const RADARS_DIR = `${REMOTE_BASE}/radars`;

console.log("[STORAGE] Using path:", REMOTE_BASE);

const FILES = {
  economy: { name: 'economy.csv', format: 'csv' },
  shop: { name: 'shop.json', format: 'json' },
  radarsIndex: { name: 'radars.json', format: 'json' }
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
  let client;

  try {
    client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.downloadTo(localPath, remotePath).catch(() => {});
    const raw = await fs.readFile(localPath, 'utf8');
    console.log(`[STORAGE] ✅ Loaded ${file.name}`);
    return JSON.parse(raw);
  } catch (err) {
    console.log(`[STORAGE] Creating new file: ${file.name}`);
    const defaultData = (key === 'shop') ? [] : {};
    await fs.writeFile(localPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  } finally {
    if (client) client.close();
  }
}

async function saveJson(key, data) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.json`, format: 'json' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);
  let client;

  try {
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));
    client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${file.name}`);
  } catch (err) {
    console.error(`[STORAGE] Save failed for ${file.name}:`, err.message);
  } finally {
    if (client) client.close();
  }
}

async function loadTable(key, headers = []) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.csv`, format: 'csv' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);
  let client;

  try {
    client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.downloadTo(localPath, remotePath).catch(() => {});
    const raw = await fs.readFile(localPath, 'utf8').catch(() => '');
    if (!raw.trim()) return [];
    return parseCsv(raw);
  } catch (err) {
    if (headers.length) {
      const empty = headers.join(',') + '\n';
      await fs.writeFile(localPath, empty);
    }
    return [];
  } finally {
    if (client) client.close();
  }
}

async function saveTable(key, rows = [], headers = []) {
  await ensureLocalDir();
  const file = FILES[key] || { name: `${key}.csv`, format: 'csv' };
  const localPath = path.join(LOCAL_DATA_DIR, file.name);
  let client;

  try {
    const finalHeaders = headers.length ? headers : (rows[0] ? Object.keys(rows[0]) : []);
    const csv = toCsv(rows, finalHeaders);
    await fs.writeFile(localPath, csv);

    client = await getFtpClient();
    const remotePath = `${REMOTE_BASE}/${file.name}`;
    await client.uploadFrom(localPath, remotePath);
    console.log(`[FTP] ✅ Uploaded ${file.name}`);
  } catch (err) {
    console.error(`[STORAGE] Table save failed for ${file.name}:`, err.message);
  } finally {
    if (client) client.close();
  }
}

async function loadRadar(name) {
  await ensureLocalDir();
  const radarName = String(name || '').trim();
  if (!radarName) return null;
  const localPath = path.join(LOCAL_DATA_DIR, 'radars', `${radarName}.json`);
  let client;

  try {
    await fs.mkdir(path.join(LOCAL_DATA_DIR, 'radars'), { recursive: true }).catch(() => {});
    client = await getFtpClient();
    await client.ensureDir(RADARS_DIR);
    await client.downloadTo(localPath, `${RADARS_DIR}/${radarName}.json`).catch(() => {});
    const raw = await fs.readFile(localPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  } finally {
    if (client) client.close();
  }
}

async function saveRadar(name, data) {
  await ensureLocalDir();
  const radarName = String(name || '').trim();
  if (!radarName) throw new Error('Radar name is required');

  const dir = path.join(LOCAL_DATA_DIR, 'radars');
  const localPath = path.join(dir, `${radarName}.json`);
  let client;

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(localPath, JSON.stringify(data, null, 2));

    client = await getFtpClient();
    await client.ensureDir(RADARS_DIR);
    await client.uploadFrom(localPath, `${RADARS_DIR}/${radarName}.json`);
    console.log(`[FTP] ✅ Uploaded radars/${radarName}.json`);
  } catch (err) {
    console.error(`[STORAGE] Radar save failed for ${radarName}:`, err.message);
    throw err;
  } finally {
    if (client) client.close();
  }
}

async function deleteRadar(name) {
  await ensureLocalDir();
  const radarName = String(name || '').trim();
  if (!radarName) return;

  const localPath = path.join(LOCAL_DATA_DIR, 'radars', `${radarName}.json`);
  try {
    await fs.unlink(localPath).catch(() => {});
  } catch {}

  let client;
  try {
    client = await getFtpClient();
    await client.ensureDir(RADARS_DIR);
    await client.remove(`${RADARS_DIR}/${radarName}.json`).catch(() => {});
  } finally {
    if (client) client.close();
  }
}

async function listRadars() {
  const index = await loadJson('radarsIndex').catch(() => ({}));
  return index && typeof index === 'object' ? index : {};
}

async function saveRadarIndex(radars) {
  await saveJson('radarsIndex', radars);
}

module.exports = {
  loadJson,
  saveJson,
  loadTable,
  saveTable,
  loadRadar,
  saveRadar,
  deleteRadar,
  listRadars,
  saveRadarIndex
};
