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

function countLines(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const txt = fs.readFileSync(filePath, "utf8");
  if (!txt) return 0;
  return txt.split(/\r?\n/).filter(Boolean).length;
}

function getAdmRegex() {
  return /\.ADM$/i;
}

async function listFiles(remoteDir) {
  const serviceId = process.env.SERVICE_ID;
  const token = process.env.API_TOKEN;
  const url = `https://api.nitrado.net/services/${serviceId}/gameservers/file_server/list?dir=${encodeURIComponent(remoteDir)}`;
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

function normalizeDir(dir) {
  if (!dir) return "";
  let out = String(dir).trim();
  if (!out.startsWith("/")) out = `/${out}`;
  out = out.replace(/\/+/g, "/");
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function candidateDirs() {
  const base = normalizeDir(process.env.KILLFEED_REMOTE_DIR || "");
  const dirs = [];
  if (base) dirs.push(base);
  if (base) dirs.push(`${base}/logs`);
  dirs.push("/logs");
  dirs.push("/");
  return [...new Set(dirs)];
}

async function recursiveFindAdm(startDir, depth = 0, maxDepth = 5, seen = new Set()) {
  const dir = normalizeDir(startDir);
  if (!dir || seen.has(dir) || depth > maxDepth) return [];
  seen.add(dir);

  let entries = [];
  try {
    entries = await listFiles(dir);
  } catch {
    return [];
  }

  const results = [];
  for (const e of entries) {
    const name = e?.name;
    const type = e?.type;
    if (!name) continue;

    const fullPath = `${dir === "/" ? "" : dir}/${name}`.replace(/\/+/g, "/");

    if (type === "file" && /\.ADM$/i.test(name)) {
      results.push({ dir, name, fullPath, entry: e });
    }

    if (type === "dir" || type === "folder") {
      const nested = await recursiveFindAdm(fullPath, depth + 1, maxDepth, seen);
      if (nested.length) results.push(...nested);
    }
  }

  return results;
}

async function findWorkingAdm() {
  const dirs = candidateDirs();
  for (const dir of dirs) {
    const found = await recursiveFindAdm(dir);
    if (found.length) {
      found.sort((a, b) => String(b.name).localeCompare(String(a.name)));
      return found[0];
    }
  }
  return null;
}

async function mirrorLatest() {
  const found = await findWorkingAdm();
  if (!found) throw new Error("No ADM file found in any candidate directory");
  console.log(`[proof] found path: ${found.fullPath}`);
  await downloadFile(found.fullPath);
  fs.copyFileSync(STAGING_LOG, LOCAL_LOG);
  const stats = fs.statSync(LOCAL_LOG);
  return {
    name: found.name,
    bytes: stats.size,
    lines: countLines(LOCAL_LOG),
    remoteDir: found.dir,
    remotePath: found.fullPath
  };
}

async function loopWatcher() {
  ensureLogsDir();

  const cycleMs = parseInt(process.env.KILLFEED_INTERNAL_MS || "35000", 10);
  const staleLimit = parseInt(process.env.KILLFEED_STALE_LIMIT || "2", 10);
  const standbyAfterSuccess = String(process.env.KILLFEED_STANDBY_AFTER_SUCCESS || "true").toLowerCase() === "true";

  let lastName = null;
  let lastBytes = 0;
  let lastLines = 0;
  let staleHits = 0;
  let everSucceeded = false;
  let lastObservedLines = 0;

  console.log("[proof] starting ADM watcher");

  try {
    const snap = await mirrorLatest();
    lastName = snap.name;
    lastBytes = snap.bytes;
    lastLines = snap.lines;
    lastObservedLines = snap.lines;
    everSucceeded = true;
    console.log(`[BRAg] brag: initial ADM snapshot ok | dir=${snap.remoteDir} file=${lastName} bytes=${lastBytes} lines=${lastLines}`);
  } catch (err) {
    console.log("[proof] initial snapshot failed", err.message || err);
  }

  while (running) {
    await sleep(cycleMs);

    try {
      const snap = await mirrorLatest();
      const newLinesThisCycle = Math.max(0, snap.lines - lastObservedLines);

      console.log(`[proof] files found: 1`);
      console.log(`[proof] lines found: ${snap.lines}`);
      console.log(`[proof] new lines this cycle: ${newLinesThisCycle}`);

      const nameChanged = snap.name !== lastName;
      const grew = snap.bytes > lastBytes || snap.lines > lastLines;

      if (nameChanged || grew) {
        staleHits = 0;
        const reason = nameChanged ? "new ADM file" : "new lines in existing ADM";
        console.log(`[BRAg] brag: ${reason} | dir=${snap.remoteDir} file=${snap.name} bytes=${snap.bytes} lines=${snap.lines}`);
        lastName = snap.name;
        lastBytes = snap.bytes;
        lastLines = snap.lines;
        lastObservedLines = snap.lines;
        everSucceeded = true;
      } else {
        staleHits += 1;
        if (staleHits >= staleLimit) {
          staleHits = 0;
          if (standbyAfterSuccess && everSucceeded) {
            console.log("[proof] standby after success");
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
