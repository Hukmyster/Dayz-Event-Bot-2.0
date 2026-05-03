const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

const LOOP_INTERVAL = Number(process.env.KILLFEED_INTERVAL_MS || 5 * 60 * 1000);
const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;
const FTP_SECURE = String(process.env.FTP_SECURE || "false").toLowerCase() === "true";
const DEBUG = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const REMOTE_DIR = process.env.KILLFEED_REMOTE_DIR || "/dayzps/config";
const FTP_TIMEOUT_MS = 30_000;

const state = {
  running: false,
  timer: null,
  inFlight: false,
  retryQueue: new Set(),
  seenFiles: new Set(),
  fileMeta: new Map(),
  lastEvents: new Set(),
  cycle: 0,
  startedAt: new Date().toISOString()
};

function dbg(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined
    ? (typeof data === "object" ? JSON.stringify(data) : String(data))
    : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function log(tag, data) {
  if (DEBUG) dbg(tag, data);
}

function warn(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined
    ? (typeof data === "object" ? JSON.stringify(data) : String(data))
    : "";
  console.warn(`[killfeed][${ts}][WARN:${tag}]${dataStr ? " " + dataStr : ""}`);
}

function ensureConfig() {
  const missing = [];
  if (!FTP_HOST) missing.push("FTP_HOST");
  if (!FTP_USER) missing.push("FTP_USER");
  if (!FTP_PASS) missing.push("FTP_PASS");
  if (missing.length) throw new Error(`Missing killfeed env vars: ${missing.join(", ")}`);
}

function joinRemote(dir, name) {
  const d = String(dir || "").replace(/\/+$|\/$/, "");
  return `${d}/${name}`;
}

async function listAdmFiles() {
  const client = new Client();
  client.ftp.timeout = FTP_TIMEOUT_MS;
  log("ftp:list:start", { host: FTP_HOST, user: FTP_USER, secure: FTP_SECURE, dir: REMOTE_DIR });
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    log("ftp:list:connected", { host: FTP_HOST });

    const list = await client.list(REMOTE_DIR);
    log("ftp:list:raw", { totalEntries: list.length, dir: REMOTE_DIR });

    list.forEach(item => {
      log("ftp:list:entry", {
        name: item.name,
        isFile: item.isFile,
        size: item.size,
        modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : null,
        type: item.type
      });
    });

    const items = list
      .filter(item => item.isFile && item.name.toUpperCase().endsWith(".ADM"))
      .map(item => ({
        name: item.name,
        remotePath: joinRemote(REMOTE_DIR, item.name),
        size: item.size ?? -1,
        modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : null,
      }));

    log("ftp:list:done", { admCount: items.length, files: items.map(i => `${i.remotePath} size=${i.size} mod=${i.modifiedAt}`) });
    return items;
  } finally {
    try { client.close(); } catch {}
    log("ftp:list:closed", null);
  }
}

async function readRemoteFile(remotePath) {
  const client = new Client();
  client.ftp.timeout = FTP_TIMEOUT_MS;
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  log("ftp:download:start", { remotePath, localTmp });
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    log("ftp:download:connected", { remotePath });
    await client.downloadTo(localTmp, remotePath);
    const buf = fs.readFileSync(localTmp);
    const content = buf.toString("utf8");
    const rawLines = content.split(/\r?\n/);
    const trailingBlank = rawLines[rawLines.length - 1] === "";
    log("ftp:download:done", {
      remotePath,
      bytes: buf.length,
      rawLineCount: rawLines.length,
      trailingBlankLine: trailingBlank,
      firstLine: rawLines[0] ? rawLines[0].slice(0, 80) : "(empty)",
      lastNonEmptyLine: (rawLines.filter(l => l.trim()).slice(-1)[0] || "").slice(0, 80)
    });
    return content;
  } finally {
    try { fs.unlinkSync(localTmp); } catch {}
    try { client.close(); } catch {}
    log("ftp:download:closed", { remotePath });
  }
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function fingerprint(content) {
  const raw = content.split(/\r?\n/);
  const lines = raw[raw.length - 1] === "" ? raw.slice(0, -1) : raw;
  return {
    lineCount: lines.length,
    lastLine: normalizeLine(lines[lines.length - 1] || ""),
    firstLine: normalizeLine(lines[0] || "")
  };
}

function getState(file) {
  if (!state.fileMeta.has(file)) {
    state.fileMeta.set(file, { lineCount: 0, lastLine: "", firstLine: "", size: -1, modifiedAt: null });
  }
  return state.fileMeta.get(file);
}

function fileNeedsDownload(remotePath, ftpItem) {
  const prev = getState(remotePath);
  const isNew = !state.seenFiles.has(remotePath);

  if (isNew) {
    log("download:decision", { file: remotePath, reason: "NEW_FILE", ftpSize: ftpItem.size, ftpMod: ftpItem.modifiedAt });
    return true;
  }

  if (ftpItem.size > 0 && prev.size >= 0 && ftpItem.size > prev.size) {
    log("download:decision", { file: remotePath, reason: "SIZE_GREW", prevSize: prev.size, nowSize: ftpItem.size });
    return true;
  }

  if (ftpItem.modifiedAt && prev.modifiedAt && ftpItem.modifiedAt !== prev.modifiedAt) {
    log("download:decision", { file: remotePath, reason: "MODIFIED_AT_CHANGED", prev: prev.modifiedAt, now: ftpItem.modifiedAt });
    return true;
  }

  if (ftpItem.size <= 0 && !ftpItem.modifiedAt) {
    log("download:decision", { file: remotePath, reason: "NO_METADATA_FALLBACK" });
    return true;
  }

  log("download:decision", { file: remotePath, reason: "SKIP_UNCHANGED", ftpSize: ftpItem.size, prevSize: prev.size, ftpMod: ftpItem.modifiedAt, prevMod: prev.modifiedAt });
  return false;
}

async function safePostWebhook(payload) {
  if (!WEBHOOK_URL) {
    log("webhook:skip", "no WEBHOOK_URL configured");
    return false;
  }
  log("webhook:send", { contentPreview: (payload.content || "").slice(0, 80) });
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    log("webhook:result", { status: res.status, ok: res.ok });
    if (!res.ok) warn("webhook:http-error", { status: res.status });
    return res.ok;
  } catch (err) {
    warn("webhook:exception", err.message);
    return false;
  }
}

function cleanNpcName(name) {
  const n = String(name || "").trim();
  if (!n || n === `"` || n === `""`) return "Unknown NPC";
  return n;
}

function buildEventMessage(event) {
  return `💀 **${event.victim}** killed by **${event.killer}** with **${event.weapon}** from **${event.distance}m** | ${event.time}`;
}

function parseAdmKillLine(line) {
  if (!line.includes("killed by")) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  const victimRaw = line.match(/Player\s+"([^"]*)"\s+\(DEAD\)/i);
  const killerMatch = line.match(/killed by Player\s+"([^"]*)"/i);
  const weaponMatch = line.match(/with\s+(.+?)\s+from\s+[0-9.]+\s+meters/i);
  const distanceMatch = line.match(/from\s+([0-9.]+)\s+meters/i);

  return {
    type: "kill",
    time: timeMatch ? timeMatch[1] : "unknown time",
    victim: cleanNpcName(victimRaw && victimRaw[1] ? victimRaw[1] : "Unknown NPC"),
    killer: killerMatch && killerMatch[1] ? killerMatch[1] : "Unknown",
    weapon: weaponMatch && weaponMatch[1] ? weaponMatch[1].trim() : "Unknown",
    distance: distanceMatch && distanceMatch[1] ? Number(distanceMatch[1]).toFixed(1) : "0.0",
    raw: line
  };
}

function processFile(remotePath, content, ftpItem) {
  const current = fingerprint(content);
  const previous = getState(remotePath);
  const rotated = previous.lineCount > current.lineCount && current.lineCount > 0;
  const reset = rotated || (
    previous.lastLine &&
    current.firstLine &&
    previous.lastLine !== current.firstLine &&
    current.lineCount <= previous.lineCount
  );

  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const startIndex = !reset && current.lineCount >= previous.lineCount ? previous.lineCount : 0;
  const events = [];

  log("process:file", {
    file: remotePath,
    previousLines: previous.lineCount,
    currentLines: current.lineCount,
    newLines: Math.max(0, lines.length - startIndex),
    startIndex,
    rotated,
    reset,
    prevLastLine: previous.lastLine ? previous.lastLine.slice(0, 60) : "(none)",
    currFirstLine: current.firstLine ? current.firstLine.slice(0, 60) : "(none)"
  });

  let scanned = 0;
  let matched = 0;
  let duped = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    scanned++;

    const event = parseAdmKillLine(line);
    if (!event) continue;
    matched++;

    const dedupeKey = `${remotePath}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      duped++;
      log("process:dedupe", { file: remotePath, line: line.slice(0, 60) });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 2000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    log("process:event-found", { file: remotePath, killer: event.killer, victim: event.victim, weapon: event.weapon });
    events.push({ ...event, file: remotePath });
  }

  log("process:summary", { file: remotePath, scanned, matched, duped, emitted: events.length });

  state.fileMeta.set(remotePath, {
    ...current,
    size: ftpItem.size,
    modifiedAt: ftpItem.modifiedAt,
  });

  return events;
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    log("event:dispatch", { killer: evt.killer, victim: evt.victim, weapon: evt.weapon });
    await safePostWebhook({ content });
  }
}

async function pollOnce() {
  if (state.inFlight) {
    warn("poll:skip", `cycle ${state.cycle + 1} skipped — previous poll still running`);
    return;
  }
  state.inFlight = true;
  state.cycle += 1;
  dbg(`poll:start`, { cycle: state.cycle, seenFiles: state.seenFiles.size, retryQueue: state.retryQueue.size });

  try {
    ensureConfig();

    let ftpItems;
    try {
      ftpItems = await listAdmFiles();
    } catch (err) {
      warn("poll:list-failed", err.message);
      return;
    }

    const ftpMap = new Map(ftpItems.map(i => [i.remotePath, i]));

    for (const retryPath of state.retryQueue) {
      if (!ftpMap.has(retryPath)) {
        log("poll:retry-inject", retryPath);
        ftpMap.set(retryPath, { name: path.basename(retryPath), remotePath: retryPath, size: -1, modifiedAt: null });
      }
    }
    state.retryQueue.clear();

    dbg("poll:targets", { cycle: state.cycle, remoteAdmCount: ftpItems.length, totalTargets: ftpMap.size });

    let downloaded = 0;
    let skipped = 0;
    let totalEvents = 0;

    for (const [remotePath, ftpItem] of ftpMap) {
      if (!fileNeedsDownload(remotePath, ftpItem)) {
        skipped++;
        continue;
      }

      let content = null;
      try {
        content = await readRemoteFile(remotePath);
        downloaded++;
      } catch (err) {
        warn("poll:read-failed", { file: remotePath, error: err.message });
        if (String(err.message || "").includes("550")) state.retryQueue.add(remotePath);
        continue;
      }

      if (!state.seenFiles.has(remotePath)) {
        state.seenFiles.add(remotePath);
        dbg("poll:new-file-seen", remotePath);
      }

      const events = processFile(remotePath, content, ftpItem);
      totalEvents += events.length;

      if (events.length) {
        dbg("poll:events", { file: remotePath, count: events.length });
        await handleEvents(events);
      } else {
        log("poll:no-events", remotePath);
      }
    }

    dbg("poll:end", {
      cycle: state.cycle,
      downloaded,
      skipped,
      totalEvents,
      retryQueue: state.retryQueue.size,
      seenFiles: state.seenFiles.size
    });
  } finally {
    state.inFlight = false;
    dbg("poll:inFlight-cleared", { cycle: state.cycle });
  }
}

function scheduleNext() {
  if (!state.running) return;
  dbg("schedule:next", { inMs: LOOP_INTERVAL, nextAt: new Date(Date.now() + LOOP_INTERVAL).toISOString() });
  state.timer = setTimeout(async () => {
    try {
      await pollOnce();
    } catch (err) {
      warn("schedule:poll-error", err.message);
    } finally {
      scheduleNext();
    }
  }, LOOP_INTERVAL);
}

function start() {
  if (state.running) return;
  state.running = true;
  dbg("START", {
    loopIntervalMs: LOOP_INTERVAL,
    debug: DEBUG,
    webhookEnabled: !!WEBHOOK_URL,
    remoteDir: REMOTE_DIR,
    ftpHost: FTP_HOST,
    ftpUser: FTP_USER,
    ftpSecure: FTP_SECURE,
    ftpTimeoutMs: FTP_TIMEOUT_MS,
    startedAt: state.startedAt
  });
  pollOnce()
    .catch(err => warn("initial-poll-error", err.message))
    .finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  dbg("STOP", null);
}

module.exports = { start, stop, pollOnce, state };
