const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');

const CONFIG = {
  ftpHost: process.env.FTP_HOST,
  ftpPort: Number(process.env.FTP_PORT || 21),
  ftpUser: process.env.FTP_USER,
  ftpPass: process.env.FTP_PASS,
  ftpSecure: String(process.env.FTP_SECURE || 'false').toLowerCase() === 'true',
  remoteDir: process.env.KILLFEED_REMOTE_DIR || 'dayzpsconfig',
  pollIntervalMs: Number(process.env.KILLFEED_INTERNAL_MS || 300000),
  webhookUrl: process.env.KILLFEED_WEBHOOK_URL,
  debug: String(process.env.KILLFEED_DEBUG || 'true').toLowerCase() === 'true',
  stateFile: path.join(__dirname, 'killfeed-state.json')
};

function log(...args) { console.log(new Date().toISOString(), ...args); }
function dbg(...args) { if (CONFIG.debug) log('[killfeed]', ...args); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8')); }
  catch { return { newestFile: null, lastLineCount: 0, initialized: false }; }
}
function saveState(state) { fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2)); }
function normalizeLines(text) {
  return text.replace(/\u0000/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}
function pickNewestAdm(files) {
  const adm = files.filter(f => f.name && f.name.toLowerCase().endsWith('.adm'));
  if (!adm.length) return null;
  adm.sort((a, b) => {
    const at = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
    const bt = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.name.localeCompare(a.name);
  });
  return adm[0].name;
}
function isKillLine(line) {
  const s = line.toLowerCase();
  return s.includes('killed by') || s.includes('was killed') || s.includes('murdered') || s.includes('suicide') || s.includes('bleeding out') || s.includes('killed');
}
async function sendDiscord(content) {
  const res = await fetch(CONFIG.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!res.ok) throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}`);
}
async function downloadRemoteFile(client, remoteFile) {
  const chunks = [];
  const writable = new (require('stream').Writable)({
    write(chunk, enc, cb) { chunks.push(Buffer.from(chunk)); cb(); }
  });
  await client.downloadTo(writable, `${CONFIG.remoteDir}/${remoteFile}`);
  return Buffer.concat(chunks).toString('utf8');
}
async function pollOnce(state) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    dbg('cycle start');
    await client.access({
      host: CONFIG.ftpHost,
      port: CONFIG.ftpPort,
      user: CONFIG.ftpUser,
      password: CONFIG.ftpPass,
      secure: CONFIG.ftpSecure
    });
    const list = await client.list(CONFIG.remoteDir);
    dbg('ftp list count', list.length);
    const newestFile = pickNewestAdm(list);
    dbg('newest file', newestFile);
    if (!newestFile) return;
    const fileText = await downloadRemoteFile(client, newestFile);
    const lines = normalizeLines(fileText);
    dbg('file lines', lines.length);
    if (state.newestFile !== newestFile) {
      state.newestFile = newestFile;
      state.lastLineCount = lines.length;
      state.initialized = true;
      saveState(state);
      dbg('initialized new file without posting', newestFile, lines.length);
      return;
    }
    if (!state.initialized) {
      state.lastLineCount = lines.length;
      state.initialized = true;
      saveState(state);
      dbg('initialized current file without posting', newestFile);
      return;
    }
    if (lines.length <= state.lastLineCount) {
      dbg('no new lines');
      return;
    }
    const newLines = lines.slice(state.lastLineCount);
    dbg('new lines detected', newLines.length);
    for (const line of newLines) {
      if (!isKillLine(line)) continue;
      await sendDiscord(`**DayZ Killfeed**\n${line}`);
      dbg('posted line', line);
    }
    state.lastLineCount = lines.length;
    saveState(state);
  } finally { client.close(); }
}
async function main() {
  if (!CONFIG.ftpHost || !CONFIG.ftpUser || !CONFIG.ftpPass || !CONFIG.webhookUrl) {
    throw new Error('Missing required env vars: FTP_HOST, FTP_USER, FTP_PASS, KILLFEED_WEBHOOK_URL');
  }
  log('KILLFEED module started');
  log('poll interval', CONFIG.pollIntervalMs);
  let state = loadState();
  dbg('loaded state', state);
  const run = async () => {
    try { await pollOnce(state); }
    catch (err) { log('[killfeed] error', err.message || err); }
  };
  await run();
  setInterval(run, CONFIG.pollIntervalMs);
}
main().catch(err => { log('fatal', err.message || err); process.exit(1); });
