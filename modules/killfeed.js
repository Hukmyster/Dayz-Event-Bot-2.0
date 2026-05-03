require("dotenv").config();

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Client } = require("basic-ftp");

const LOCAL_DIR = path.resolve("./logs");
const LOCAL_LOG = path.join(LOCAL_DIR, "log.ADM");
const STAGING_LOG = path.join(LOCAL_DIR, "serverlog.ADM");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ensureLogsDir() {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

function parseIni(str) {
  const out = {};
  let section = out;
  String(str || "").split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) return;
    const sec = line.match(/^\[(.+?)\]$/);
    if (sec) {
      out[sec[1]] = out[sec[1]] || {};
      section = out[sec[1]];
      return;
    }
    const idx = line.indexOf("=");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    section[key] = val;
  });
  return out;
}

function stringifyIni(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`[${k}]`);
      for (const [kk, vv] of Object.entries(v)) lines.push(`${kk}=${vv}`);
    } else {
      lines.push(`${k}=${v}`);
    }
  }
  return lines.join("\n");
}

function log(msg, data) {
  if (data !== undefined) console.log(msg, data);
  else console.log(msg);
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

async function listFiles(dir) {
  const serviceId = process.env.SERVICE_ID;
  const token = process.env.API_TOKEN;
  const url = `https://api.nitrado.net/services/${serviceId}/gameservers/file_server/list?dir=${encodeURIComponent(dir)}`;
  const res = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
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
    lines: countLines(LOCAL_LOG)
  };
}

async function main() {
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

  log("[proof] starting ADM watcher");
  debug("[proof] remote dir", process.env.KILLFEED_REMOTE_DIR || getPlatformDir());
  debug("[proof] cycle ms", cycleMs);

  try {
    const snap = await mirrorLatest(admRegex);
    lastName = snap.name;
    lastBytes = snap.bytes;
    lastLines = snap.lines;
    everSucceeded = true;
    log(`[BRAg] brag: initial ADM snapshot ok | file=${lastName} bytes=${lastBytes} lines=${lastLines}`);
  } catch (err) {
    log("[proof] initial snapshot failed", err.message || err);
  }

  while (true) {
    await sleep(cycleMs);

    try {
      const snap = await mirrorLatest(admRegex);
      const nameChanged = snap.name !== lastName;
      const grew = snap.bytes > lastBytes || snap.lines > lastLines;

      if (nameChanged || grew) {
        staleHits = 0;
        const reason = nameChanged ? "new ADM file" : "new lines in existing ADM";
        log(`[BRAg] brag: ${reason} | file=${snap.name} bytes=${snap.bytes} lines=${snap.lines}`);
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
      log("[proof] poll failed", err.message || err);
    }
  }
}

process.on("unhandledRejection", err => {
  console.error("[proof] unhandledRejection", err);
});

process.on("uncaughtException", err => {
  console.error("[proof] uncaughtException", err);
});

main().catch(err => {
  console.error("[proof] fatal", err);
  process.exit(1);
});
