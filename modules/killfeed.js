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
  cycle: 0,
  currentFile: null,
  currentLineCount: 0,
  lastKnownLastLine: "",
  lastEvents: new Set(),
  retryQueue: new Set()
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
  const d = String(dir || "").replace(/[\\/]+$/, "");
  return `${d}/${name}`;
}

async function listAdmFiles() {
  const client = new Client();
  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: FTP_SECURE
    });

    const list = await client.list(REMOTE_DIR);
    const files = list
      .filter(item => item.type === 1 || item.isFile || String(item.name || "").toUpperCase().endsWith(".ADM"))
      .map(item => ({
        name: item.name,
        modifiedAt: item.modifiedAt || item.modified || null,
        fullPath: joinRemote(REMOTE_DIR, item.name)
      }))
      .filter(item => item.name.toUpperCase().endsWith(".ADM"))
      .sort((a, b) => {
        const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
        const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return b.name.localeCompare(a.name);
      });

    log("ftp list", {
      dir: REMOTE_DIR,
      count: files.length,
      newest: files[0]?.fullPath || null
    });

    return files;
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = new Client();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: FTP_SECURE
    });

    log("ftp download start", remotePath);
    await client.downloadTo(localTmp, remotePath);

    const content = fs.readFileSync(localTmp, "utf8");
    const lines = content.split(/\r?\n/);

    log("ftp download ok", {
      file: remotePath,
      bytes: Buffer.byteLength(content, "utf8"),
      totalLines: lines.length
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
  const victimMatch = line.match(/Player\s+"([^"]*)"\s+\(DEAD\)/i);
  const killerMatch = line.match(/killed by Player\s+"([^"]*)"/i);
  const weaponMatch = line.match(/with\s+(.+?)\s+from\s+([0-9.]+)\s+meters/i);

  return {
    type: "kill",
    time: timeMatch ? timeMatch[1] : "unknown time",
    victim: cleanNpcName(victimMatch && victimMatch[1] ? victimMatch[1] : "Unknown NPC"),
    killer: killerMatch && killerMatch[1] ? killerMatch[1] : "Unknown",
    weapon: weaponMatch && weaponMatch[1] ? weaponMatch[1].trim() : "Unknown",
    distance: weaponMatch && weaponMatch[2] ? Number(weaponMatch[2]).toFixed(1) : "0.0",
    raw: line
  };
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

function getCurrentStateForFile(file) {
  if (state.currentFile !== file) {
    state.currentFile = file;
    state.currentLineCount = 0;
    state.lastKnownLastLine = "";
    state.lastEvents.clear();
    log("switched file", file);
  }
}

function processFile(file, content) {
  getCurrentStateForFile(file);

  const lines = content.split(/\r?\n/);
  const currentLineCount = lines.length;
  const rotated = currentLineCount < state.currentLineCount;
  const changedLastLine = normalizeLine(lines[lines.length - 1] || "") !== state.lastKnownLastLine;

  let startIndex = state.currentLineCount;

  if (rotated || startIndex > currentLineCount) {
    startIndex = 0;
    state.currentLineCount = 0;
    state.lastEvents.clear();
    log("file reset", { file, rotated, currentLineCount });
  }

  const newLines = lines.slice(startIndex);
  const events = [];

  log("file cycle", {
    file,
    previousLines: state.currentLineCount,
    currentLines: currentLineCount,
    newLines: newLines.length,
    startIndex,
    rotated,
    changedLastLine,
    lastKnownLastLine: state.lastKnownLastLine
  });

  for (const rawLine of newLines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${file}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      log("dedupe skip", { file, line });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 1000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    log("trigger match", { file, line });
    events.push(event);
  }

  state.currentLineCount = currentLineCount;
  state.lastKnownLastLine = normalizeLine(lines[lines.length - 1] || "");
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

    const files = await listAdmFiles();
    const targets = new Set();

    if (files[0]) targets.add(files[0].fullPath);
    for (const f of state.retryQueue) targets.add(f);
    state.retryQueue.clear();

    log("cycle start", {
      cycle: state.cycle,
      targetCount: targets.size,
      newest: files[0]?.fullPath || null
    });

    for (const file of targets) {
      let content;
      try {
        content = await readRemoteFile(file);
      } catch (err) {
        log("read failed", { file, error: err.message });
        if (String(err.message || "").includes("550")) state.retryQueue.add(file);
        continue;
      }

      const events = processFile(file, content);
      if (events.length) {
        log("events found", { file, count: events.length });
        await handleEvents(events);
      } else {
        log("no events", file);
      }
    }

    log("cycle end", {
      cycle: state.cycle,
      processedFiles: targets.size,
      retryQueue: state.retryQueue.size
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

  pollOnce()
    .catch(err => console.error("[killfeed] initial poll error:", err))
    .finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

module.exports = { start, stop, pollOnce, state };
