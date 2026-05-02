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
const LOG_EXTENSIONS = [".RPT", ".ADM"];

const state = {
  running: false,
  timer: null,
  inFlight: false,
  retryQueue: new Set(),
  seenFiles: new Set(),
  fileMeta: new Map(),
  lastEvents: new Set(),
  startedAt: new Date().toISOString()
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

async function listFilesFromFtp() {
  const client = new Client();
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    const list = await client.list();
    return list
      .filter(item => item.isFile)
      .map(item => item.name)
      .filter(name => LOG_EXTENSIONS.some(ext => name.toUpperCase().endsWith(ext)));
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = new Client();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.log`);
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
    await client.downloadTo(localTmp, remotePath);
    return fs.readFileSync(localTmp, "utf8");
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
    return res.ok;
  } catch {
    return false;
  }
}

function cleanNpcName(name) {
  const n = String(name || "").trim();
  if (!n || n === `"` || n === `""`) return "Unknown NPC";
  return n;
}

function buildEventMessage(event) {
  if (event.type === "lootmax") return `🔥 **Lootmax** ${event.value} | ${event.time}`;
  if (event.type === "kill") {
    return `💀 **${event.victim}** killed by **${event.killer}** with **${event.weapon}** from **${event.distance}m** | ${event.time}`;
  }
  return "Event detected";
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

function parseRptLine(line) {
  if (!line) return null;
  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  const lootMatch = line.match(/lootmax\s*:\s*(\d+)/i);
  if (!lootMatch) return null;
  return {
    type: "lootmax",
    value: Number(lootMatch[1]),
    time: timeMatch ? timeMatch[1] : "unknown time",
    raw: line
  };
}

function processFile(file, content) {
  const current = fingerprint(content);
  const previous = getState(file);
  const rotated = previous.lineCount > current.lineCount && current.lineCount > 0;
  const reset = rotated || (previous.lastLine && current.firstLine && previous.lastLine !== current.firstLine && current.lineCount <= previous.lineCount);
  const lines = content.split(/\r?\n/);
  const startIndex = !reset && current.lineCount >= previous.lineCount ? previous.lineCount : 0;
  const events = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    const event = file.toUpperCase().endsWith(".ADM") ? parseAdmKillLine(line) : parseRptLine(line);
    if (!event) continue;

    const dedupeKey = `${file}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) continue;
    state.lastEvents.add(dedupeKey);

    if (state.lastEvents.size > 2000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    events.push({ ...event, file });
  }

  state.fileMeta.set(file, current);
  return events;
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    log("event", evt.file, content);
    await safePostWebhook({ content });
  }
}

async function pollOnce() {
  if (state.inFlight) return;
  state.inFlight = true;

  try {
    ensureConfig();
    const remoteFiles = await listFilesFromFtp();
    const targets = new Set([...remoteFiles, ...state.retryQueue]);
    state.retryQueue.clear();

    for (const file of targets) {
      const upper = file.toUpperCase();
      if (!LOG_EXTENSIONS.some(ext => upper.endsWith(ext))) continue;

      let content = null;
      try {
        content = await readRemoteFile(file);
      } catch (err) {
        log("read failed", file, err.message);
        if (String(err.message || "").includes("550")) state.retryQueue.add(file);
        continue;
      }

      if (!state.seenFiles.has(file)) {
        state.seenFiles.add(file);
        log("new file", file);
      }

      const events = processFile(file, content);
      if (events.length) await handleEvents(events);
    }
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
  pollOnce()
    .catch(err => console.error("[killfeed] initial poll error:", err))
    .finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

module.exports = {
  start,
  stop,
  pollOnce,
  state
};
