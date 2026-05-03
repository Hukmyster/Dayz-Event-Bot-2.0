require("dotenv").config();

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Client } = require("basic-ftp");

const LOCAL_DIR = path.resolve("./logs");
const LOCAL_LOG = path.join(LOCAL_DIR, "log.ADM");
const STAGING_LOG = path.join(LOCAL_DIR, "serverlog.ADM");

const sleep = ms => new Promise(r => setTimeout(r, ms));

let running = false;
let started = false;

function ensureLogsDir() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

function debug(msg, data) {
  if (process.env.KILLFEED_DEBUG === "true") {
    if (data !== undefined) console.log(msg, data);
    else console.log(msg);
  }
}

function getPlatformDir() {
  const platform = String(process.env.PLATFORM || "").toUpperCase();
  if (platform.includes("XBOX")) return "/noftp/dayzxb/config";
  if (platform.includes("PLAYSTATION") || platform.includes("PS4") || platform.includes("PS5")) return "/noftp/dayzps/config";
  return "/ftproot/dayzstandalone/config";
}

function getAdmRegex() {
  const platform = String(process.env.PLATFORM || "").toUpperCase();
  if (platform.includes("XBOX")) return /^DayZServer_X1_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
  if (platform.includes("PLAYSTATION") || platform.includes("PS4") || platform.includes("PS5")) return /^DayZServer_PS4_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
  return /^DayZServer_X1_x64_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.ADM$/;
}

function pickLatestAdm(entries, admRegex) {
  let best = null;
  let bestKey = null;
  for (const e of entries || []) {
    if (e.type !== "file" || typeof e.name !== "string") continue;
    const m = e.name.match(admRegex);
    if (!m) continue;
    const key = m[1].replace(/[-_]/g, "");
    if (bestKey === null || key > bestKey) {
      bestKey = key;
      best = e;
    }
  }
  return best;
}

function httpGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Bad JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on("error", reject);
  });
}

async function listFiles(dir) {
  const serviceId = process.env.SERVICE_ID;
  const token = process.env.API_TOKEN;
  const url = `https://api.nitrado.net/services/${serviceId}/gameservers/file_server/list?dir=${encodeURIComponent(dir)}`;
  const res = await httpGetJson(url, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  });
  return res.data?.data?.entries || [];
}

async function downloadFile(remotePath) {
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: String(process.env.FTP_SECURE).toLowerCase() === "true"
    });
    await client.downloadTo(STAGING_LOG, remotePath);
  } finally {
    client.close();
  }
}

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const txt = fs.readFileSync(filePath, "utf8");
  if (!txt) return 0;
  return txt.split(/\r?\n/).filter(Boolean).length;
}

async function mirrorLatest(admRegex) {
  const remoteDir = process.env.KILLFEED_REMOTE_DIR || getPlatformDir();
  debug("[proof] remote dir", remoteDir);
  const entries = await listFiles(remoteDir);
  const latest = pickLatestAdm(entries, admRegex);
  if (!latest) throw new Error(`No ADM file found in ${remoteDir}`);
  const remotePath = `${remoteDir}/${latest.name}`;
  await downloadFile(remotePath);
  fs.copyFileSync(STAGING_LOG, LOCAL_LOG);
  const stats = fs.statSync(LOCAL_LOG);
  return {
    name: latest.name,
    bytes: stats.size,
    lines: countLines(LOCAL_LOG),
    remoteDir
  };
}

async function loopWatcher() {
  ensureLogsDir();

  const admRegex = getAdmRegex();
  const cycleMs = parseInt(process.env.KILLFEED_INTERNAL_MS || "35000", 10);
  const staleLimit = parseInt(process.env.KILLFEED_STALE_LIMIT || "2", 10);
  const standbyAfterSuccess = String(process.env.KILLFEED_STANDBY_AFTER_SUCCESS || "true").toLowerCase() === "true";

  let lastName = null;
  let lastBytes = 0;
  let lastLines = 0;
  let staleHits = 0;
  let everSucceeded = false;

  console.log("[proof] starting ADM watcher");

  try {
    const snap = await mirrorLatest(admRegex);
    lastName = snap.name;
    lastBytes = snap.bytes;
    lastLines = snap.lines;
    everSucceeded = true;
    console.log(`[BRAg] brag: initial ADM snapshot ok | dir=${snap.remoteDir} file=${lastName} bytes=${lastBytes} lines=${lastLines}`);
  } catch (err) {
    console.log("[proof] initial snapshot failed", err.message || err);
  }

  while (running) {
    await sleep(cycleMs);

    try {
      const snap = await mirrorLatest(admRegex);
      const nameChanged = snap.name !== lastName;
      const grew = snap.bytes > lastBytes || snap.lines > lastLines;

      if (nameChanged || grew) {
        staleHits = 0;
        const reason = nameChanged ? "new ADM file" : "new lines in existing ADM";
        console.log(`[BRAg] brag: ${reason} | dir=${snap.remoteDir} file=${snap.name} bytes=${snap.bytes} lines=${snap.lines}`);
        lastName = snap.name;
        lastBytes = snap.bytes;
        lastLines = snap.lines;
        everSucceeded = true;
      } else {
        staleHits += 1;
        debug("[proof] no change", { file: snap.name, bytes: snap.bytes, lines: snap.lines, staleHits });
        if (staleHits >= staleLimit) {
          staleHits = 0;
          if (standbyAfterSuccess && everSucceeded) {
            debug("[proof] standing by after success");
          }
        }
      }
    } catch (err) {
      console.log("[proof] poll failed", err.message || err);
    }
  }
}

async function start() {
  if (started) return;
  started = true;
  running = true;
  try {
    await loopWatcher();
  } catch (err) {
    console.error("[proof] fatal", err);
  }
}

function stop() {
  running = false;
}

module.exports = {
  start,
  stop
};
