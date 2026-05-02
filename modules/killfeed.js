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
  initializedNewest: false,
  pendingScan: new Map(),
  pendingConfirm: new Map()
};

function log(...args) {
  if (DEBUG) console.log("[killfeed]", ...args);
}

function dbg(tag, data) {
  if (DEBUG) console.log("[killfeed][debug]", tag, data);
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
    dbg("LIST_RESULT", { remoteDir: REMOTE_DIR, count: fullPaths.length, newest: fullPaths[fullPaths.length - 1] || null });
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

    log("ftp download ok", {
      file: remotePath,
      bytes: Buffer.byteLength(content, "utf8"),
      totalLines: lines.length
    });

    dbg("FILE_READ", {
      file: remotePath,
      bytes: Buffer.byteLength(content, "utf8"),
      lines: lines.length
    });

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
    dbg("WEBHOOK_POST", { status: res.status, ok: res.ok, contentLength: payload && payload.content ? String(payload.content).length : 0 });
    return res.ok;
  } catch (err) {
    log("webhook error", err.message);
    dbg("WEBHOOK_ERROR", { error: err.message });
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

  dbg("PROCESS_FILE", {
    file,
    previousLines: previous.lineCount,
    currentLines: current.lineCount,
    startIndex,
    newLines,
    rotated,
    reset,
    skipExisting,
    firstLine: current.firstLine,
    lastLine: current.lastLine
  });

  const candidateLines = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    candidateLines.push(line);

    const event = parseAdmKillLine(line);
    if (!event) {
      dbg("SKIP_LINE", { file, line });
      continue;
    }

    const dedupeKey = `${file}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      dbg("DEDupe_HIT", { file, raw: event.raw });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 2000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    log("trigger match", { file, type: event.type, line });
    events.push({ ...event, file });

    dbg("TRIGGER_HIT_NEW_LINES", {
      file,
      line,
      victim: event.victim,
      killer: event.killer,
      weapon: event.weapon,
      distance: event.distance,
      time: event.time
    });
  }

  dbg("NEW_LINES_SEEN", {
    file,
    candidateLines: candidateLines.length,
    newLines,
    startIndex,
    preview: candidateLines.slice(0, 3)
  });

  state.fileMeta.set(file, current);
  dbg("PROCESS_FILE_END", { file, events: events.length, stored: current });
  return events;
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    log("event parsed", evt);
    log("discord payload", content);
    dbg("WEBHOOK_SEND", { file: evt.file, victim: evt.victim, killer: evt.killer, time: evt.time });
    await safePostWebhook({ content });
  }
}

function confirmPending(file, currentFingerprint) {
  const pending = state.pendingScan.get(file);
  if (!pending) return null;

  if (
    pending.lineCount !== currentFingerprint.lineCount ||
    pending.lastLine !== currentFingerprint.lastLine ||
    pending.firstLine !== currentFingerprint.firstLine
  ) {
    dbg("PENDING_CHANGED", { file, pending, current: currentFingerprint });
    state.pendingScan.set(file, currentFingerprint);
    state.pendingConfirm.delete(file);
    return null;
  }

  const confirmCount = (state.pendingConfirm.get(file) || 0) + 1;
  state.pendingConfirm.set(file, confirmCount);
  dbg("PENDING_CONFIRM", { file, confirmCount, fingerprint: currentFingerprint });

  if (confirmCount < 2) return null;

  state.pendingConfirm.delete(file);
  state.pendingScan.delete(file);
  return pending;
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

    dbg("CYCLE_START", {
      cycle: state.cycle,
      remoteCount: remoteFiles.length,
      newestFile,
      initializedNewest: state.initializedNewest
    });

    if (!newestFile) {
      log("no adm files found", { dir: REMOTE_DIR });
      dbg("NO_FILES", { dir: REMOTE_DIR });
      return;
    }

    let content = null;
    try {
      content = await readRemoteFile(newestFile);
    } catch (err) {
      log("read failed", { file: newestFile, error: err.message });
      dbg("READ_FAILED", { file: newestFile, error: err.message });
      if (String(err.message || "").includes("550")) state.retryQueue.add(newestFile);
      return;
    }

    const fp = fingerprint(content);
    dbg("NEWEST_FINGERPRINT", { newestFile, fp });

    if (!state.initializedNewest) {
      state.initializedNewest = true;
      state.fileMeta.set(newestFile, fp);
      state.initializedFiles.add(newestFile);
      state.pendingScan.set(newestFile, fp);
      state.pendingConfirm.set(newestFile, 0);
      dbg("BASELINE_NEWEST", { newestFile, fp });
      log("initialized newest file without posting", newestFile);
      return;
    }

    if (!state.initializedFiles.has(newestFile)) {
      state.initializedFiles.add(newestFile);
      state.fileMeta.set(newestFile, fp);
      state.pendingScan.set(newestFile, fp);
      state.pendingConfirm.set(newestFile, 0);
      dbg("NEW_NEWEST_BASELINE", { newestFile, fp });
      log("new newest file detected, baseline stored", newestFile);
      return;
    }

    const confirmed = confirmPending(newestFile, fp);
    if (!confirmed) {
      dbg("PENDING_NOT_READY", { file: newestFile, fp, hasPending: state.pendingScan.has(newestFile) });
      return;
    }

    const previous = getState(newestFile);
    const appended = fp.lineCount > previous.lineCount;
    dbg("CONFIRMED_STABLE", { file: newestFile, previous, current: fp, appended });

    const events = processFile(newestFile, content, false);
    if (events.length) {
      log("events found", { file: newestFile, count: events.length });
      await handleEvents(events);
    } else {
      log("no events", newestFile);
    }

    dbg("CYCLE_END", {
      cycle: state.cycle,
      newestFile,
      retryQueue: state.retryQueue.size,
      storedMeta: state.fileMeta.get(newestFile)
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
  dbg("START_STATE", {
    loopInterval: LOOP_INTERVAL,
    remoteDir: REMOTE_DIR,
    debug: DEBUG,
    webhookEnabled: !!WEBHOOK_URL
  });
  pollOnce().catch(err => console.error("[killfeed] initial poll error:", err)).finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

module.exports = { start, stop, pollOnce, state };
