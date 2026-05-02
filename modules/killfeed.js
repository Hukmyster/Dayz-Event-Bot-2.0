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

const state = {
  running: false,
  timer: null,
  inFlight: false,
  retryQueue: new Set(),
  fileMeta: new Map(),
  lastEvents: new Set(),
  cycle: 0,
  startedAt: new Date().toISOString(),
  newestFile: null,
  initializedFiles: new Set(),
  initializedNewest: false
};

function log(...args) {
  if (DEBUG) console.log("[killfeed]", ...args);
}

function ensureConfig() {
  const missing = [];
  if (!FTP_HOST) missing.push("FTP_HOST");
  if (!FTP_USER) missing.push("FTP_USER");
  if (!FTP_PASS) missing.push("FTP_PASS");
  if (missing.length) throw new Error(`Missing killfeed env vars: ${missing.join(", ")}`);
}

function joinRemote(dir, name) {
  const d = String(dir || "").replace(/\/+$/, "");
  return `${d}/${name}`;
}

function extractTimestamp(filename) {
  const m = String(filename).match(/_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.ADM$/i);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s] = m;
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`) || 0;
}

async function listAdmFiles() {
  const client = new Client();
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    const list = await client.list(REMOTE_DIR);
    const files = list
      .filter(item => item.isFile)
      .map(item => item.name)
      .filter(name => name.toUpperCase().endsWith(".ADM"))
      .sort((a, b) => extractTimestamp(a) - extractTimestamp(b));

    const fullPaths = files.map(name => joinRemote(REMOTE_DIR, name));
    log("ftp list", { dir: REMOTE_DIR, count: fullPaths.length, files: fullPaths });
    return fullPaths;
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = new Client();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    log("ftp download start", remotePath);
    await client.downloadTo(localTmp, remotePath);
    const content = fs.readFileSync(localTmp, "utf8");
    const lines = content.split(/\r?\n/);
    log("ftp download ok", { file: remotePath, bytes: Buffer.byteLength(content, "utf8"), totalLines: lines.length });
    return content;
  } finally {
    try { fs.unlinkSync(localTmp); } catch {}
    client.close();
  }
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function fingerprint(content) {
  const lines = content.split(/\r?\n/);
  return {
    lineCount: lines.length,
    lastLine: normalizeLine(lines[lines.length - 1] || ""),
    firstLine: normalizeLine(lines[0] || "")
  };
}

function getState(file) {
  if (!state.fileMeta.has(file)) {
    state.fileMeta.set(file, { lineCount: 0, lastLine: "", firstLine: "" });
  }
  return state.fileMeta.get(file);
}

async function safePostWebhook(payload) {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    log("webhook post", { status: res.status, ok: res.ok });
    return res.ok;
  } catch (err) {
    log("webhook error", err.message);
    return false;
  }
}

function cleanNpcName(name) {
  const n = String(name || "").trim();
  if (!n || n === `"` || n === `""`) return "NPC";
  return n;
}

function buildEventMessage(event) {
  return [
    "💀 **KILL CONFIRMED**",
    `Victim: ${event.victim}`,
    `Killer: ${event.killer}`,
    `Weapon: ${event.weapon}`,
    `Distance: ${event.distance}m`,
    `Time: ${event.time}`
  ].join("\n");
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
    victim: cleanNpcName(victimRaw && victimRaw[1] ? victimRaw[1] : "NPC"),
    killer: killerMatch && killerMatch[1] ? killerMatch[1] : "Unknown",
    weapon: weaponMatch && weaponMatch[1] ? weaponMatch[1].trim() : "Unknown",
    distance: distanceMatch && distanceMatch[1] ? distanceMatch[1] : "0.0",
    raw: line
  };
}

function processFile(file, content, skipExisting = false) {
  const current = fingerprint(content);
  const previous = getState(file);
  const rotated = previous.lineCount > current.lineCount && current.lineCount > 0;
  const reset = rotated || (previous.lastLine && current.firstLine && previous.lastLine !== current.firstLine && current.lineCount <= previous.lineCount);
  const lines = content.split(/\r?\n/);
  const startIndex = skipExisting || (!reset && current.lineCount >= previous.lineCount) ? previous.lineCount : 0;
  const events = [];
  const newLines = Math.max(0, lines.length - startIndex);

  log("file cycle", {
    file,
    previousLines: previous.lineCount,
    currentLines: current.lineCount,
    newLines,
    startIndex,
    rotated,
    reset,
    firstLine: current.firstLine,
    lastLine: current.lastLine
  });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${file}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      log("dedupe skip", { file, type: event.type, line });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 2000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    log("trigger match", { file, type: event.type, line });
    events.push({ ...event, file });
  }

  state.fileMeta.set(file, current);
  return events;
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    log("event parsed", evt);
    log("discord payload", content);
    await safePostWebhook({ content });
  }
}

async function pollOnce() {
  if (state.inFlight) return;
  state.inFlight = true;
  state.cycle += 1;

  try {
    ensureConfig();
    const remoteFiles = await listAdmFiles();
    const newestFile = remoteFiles[remoteFiles.length - 1] || null;
    state.newestFile = newestFile;

    log("cycle start", {
      cycle: state.cycle,
      remoteCount: remoteFiles.length,
      newestFile,
      initializedNewest: state.initializedNewest
    });

    if (!newestFile) {
      log("no adm files found", { dir: REMOTE_DIR });
      return;
    }

    let content = null;
    try {
      content = await readRemoteFile(newestFile);
    } catch (err) {
      log("read failed", { file: newestFile, error: err.message });
      if (String(err.message || "").includes("550")) state.retryQueue.add(newestFile);
      return;
    }

    if (!state.initializedNewest) {
      state.initializedNewest = true;
      state.fileMeta.set(newestFile, fingerprint(content));
      state.initializedFiles.add(newestFile);
      log("initialized newest file without posting", newestFile);
      return;
    }

    if (!state.initializedFiles.has(newestFile)) {
      state.initializedFiles.add(newestFile);
      state.fileMeta.set(newestFile, fingerprint(content));
      log("new newest file detected, baseline stored", newestFile);
      return;
    }

    const events = processFile(newestFile, content, false);
    if (events.length) {
      log("events found", { file: newestFile, count: events.length });
      await handleEvents(events);
    } else {
      log("no events", newestFile);
    }

    log("cycle end", {
      cycle: state.cycle,
      processedFiles: 1,
      retryQueue: state.retryQueue.size,
      newestFile: state.newestFile
    });
  } finally {
    state.inFlight = false;
  }
}

function scheduleNext() {
  if (!state.running) return;
  state.timer = setTimeout(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[killfeed] poll error:", err);
    } finally {
      scheduleNext();
    }
  }, LOOP_INTERVAL);
}

function start() {
  if (state.running) return;
  state.running = true;
  log("start", {
    loopInterval: LOOP_INTERVAL,
    debug: DEBUG,
    webhookEnabled: !!WEBHOOK_URL,
    remoteDir: REMOTE_DIR
  });
  pollOnce().catch(err => console.error("[killfeed] initial poll error:", err)).finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

module.exports = { start, stop, pollOnce, state };
