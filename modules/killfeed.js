const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

const LOOP_INTERVAL = Number(process.env.KILLFEED_INTERNAL_MS || 5 * 60 * 1000);
const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;
const FTP_SECURE = String(process.env.FTP_SECURE || "false").toLowerCase() === "true";
const DEBUG = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const REMOTE_DIR = process.env.KILLFEED_REMOTE_DIR || "/dayzps/config";
const FTP_TIMEOUT_MS = 30_000;
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";

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
  if (!WEBHOOK_URL) missing.push("KILLFEED_WEBHOOK_URL");
  if (!API_TOKEN) missing.push("API_TOKEN");
  if (!SERVICE_ID) missing.push("SERVICE_ID");
  if (missing.length) throw new Error(`Missing killfeed env vars: ${missing.join(", ")}`);
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

async function nitradoRequest(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nitrado HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function listAdmFilesFromNitrado() {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/list`;
  const res = await nitradoRequest(url);
  const json = await res.json();

  const raw = json?.data?.files || json?.data || json?.data?.items || [];
  const items = (Array.isArray(raw) ? raw : [])
    .map(item => {
      const name = item.filename || item.name || item.path?.split("/").pop() || "";
      const remotePath = item.path || item.filename || item.name || "";
      const size = item.size ?? -1;
      const modifiedAt = item.modified_at || item.modifiedAt || item.mtime || null;
      return {
        name,
        remotePath,
        size,
        modifiedAt: modifiedAt ? new Date(modifiedAt).toISOString() : null
      };
    })
    .filter(item => item.remotePath && item.remotePath.toUpperCase().endsWith(".ADM"))
    .sort((a, b) => {
      const am = a.modifiedAt || "";
      const bm = b.modifiedAt || "";
      if (am !== bm) return am.localeCompare(bm);
      return a.remotePath.localeCompare(b.remotePath);
    });

  log("source:list", { source: "nitrado-api", serviceId: SERVICE_ID, admCount: items.length, files: items.map(x => x.remotePath) });
  return items;
}

async function readRemoteFile(remotePath) {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(remotePath)}`;
  log("source:download", { source: "nitrado-api", remotePath });
  const res = await nitradoRequest(url);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await res.json();
    const maybe = json?.data?.content || json?.data?.file?.content || json?.data?.download || json?.data?.url;
    if (typeof maybe === "string" && maybe.startsWith("http")) {
      const r2 = await fetch(maybe);
      if (!r2.ok) throw new Error(`Download URL HTTP ${r2.status}`);
      return await r2.text();
    }
    if (typeof maybe === "string") return maybe;
    return JSON.stringify(json);
  }
  return await res.text();
}

function fileNeedsDownload(remotePath, ftpItem) {
  const prev = state.fileMeta.get(remotePath) || { lineCount: 0, lastLine: "", firstLine: "", size: -1, modifiedAt: null };
  const isNew = !state.seenFiles.has(remotePath);

  if (isNew) {
    log("download:decision", { file: remotePath, reason: "NEW_FILE", size: ftpItem.size, mod: ftpItem.modifiedAt });
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

  return false;
}

async function safePostWebhook(payload) {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) warn("webhook:http-error", { status: res.status });
    return res.ok;
  } catch (err) {
    warn("webhook:exception", err.message);
    return false;
  }
}

function processFile(remotePath, content, ftpItem) {
  const current = fingerprint(content);
  const previous = state.fileMeta.get(remotePath) || { lineCount: 0, lastLine: "", firstLine: "", size: -1, modifiedAt: null };
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

  const scanned = 0;
  const matched = 0;
  const duped = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;

    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${remotePath}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) continue;

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 2000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    events.push({ ...event, file: remotePath });
  }

  state.fileMeta.set(remotePath, {
    ...current,
    size: ftpItem.size,
    modifiedAt: ftpItem.modifiedAt
  });

  log("poll:file", {
    remotePath,
    previousLines: previous.lineCount,
    currentLines: current.lineCount,
    startIndex,
    reset: String(reset)
  });
  log("poll:summary", { remotePath, scanned: lines.length, matched: events.length, duped, emitted: events.length });

  return events;
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    await safePostWebhook({ content });
  }
}

async function pollOnce() {
  if (state.inFlight) return;
  state.inFlight = true;
  state.cycle += 1;
  dbg("poll:start", { cycle: state.cycle, seenFiles: state.seenFiles.size, retryQueue: state.retryQueue.size, source: "nitrado-api" });

  try {
    ensureConfig();

    let ftpItems;
    try {
      ftpItems = await listAdmFilesFromNitrado();
    } catch (err) {
      warn("poll:list-failed", err.message);
      return;
    }

    const ftpMap = new Map(ftpItems.map(i => [i.remotePath, i]));

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
        continue;
      }

      if (!state.seenFiles.has(remotePath)) {
        state.seenFiles.add(remotePath);
      }

      const events = processFile(remotePath, content, ftpItem);
      totalEvents += events.length;

      if (events.length) {
        dbg("poll:events", { file: remotePath, count: events.length });
        await handleEvents(events);
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
  }
}

function scheduleNext() {
  if (!state.running) return;
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
    source: "nitrado-api",
    serviceId: SERVICE_ID,
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
}

module.exports = { start, stop, pollOnce, state };
