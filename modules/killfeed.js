const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

const LOOP_INTERVAL = Number(process.env.KILLFEED_INTERVAL_MS || 5 * 60 * 1000);
const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;
const FTP_SECURE = String(process.env.FTP_SECURE || "false").toLowerCase() === "true";
const DEBUG = String(process.env.KILLFEED_DEBUG || "true").toLowerCase() === "true";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const REMOTE_DIR = process.env.KILLFEED_REMOTE_DIR || "/dayzps/config";
const HUNT_DELAY_MS = Number(process.env.KILLFEED_HUNT_DELAY_MS || 8000);
const STALE_LIMIT = Number(process.env.KILLFEED_STALE_LIMIT || 2);

const state = {
  running: false,
  timer: null,
  inFlight: false,
  cycle: 0,
  phase: "startup",
  currentFile: null,
  currentLineCount: 0,
  lastKnownLastLine: "",
  lastEvents: new Set(),
  lastFileMeta: null,
  lastContentBytes: 0,
  staleCycles: 0,
  huntActive: false,
  history: [],
  lastList: [],
  lastDecision: null,
  lastRead: null,
  sourceSwitches: 0,
  huntHits: 0,
  huntBackoff: HUNT_DELAY_MS,
  lastSuccessfulFile: null,
  lastSuccessfulAt: null,
  lastFailure: null
};

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function log(level, label, data) {
  if (!DEBUG) return;
  const ts = new Date().toISOString();
  const prefix = `[killfeed][${ts}][${level}] ${label}`;
  if (data === undefined) console.log(prefix);
  else console.log(prefix, data);
}

function trace(step, data) {
  const entry = { ts: new Date().toISOString(), phase: state.phase, step, data };
  state.history.push(entry);
  if (state.history.length > 60) state.history.shift();
  log("trace", step, data);
}

function stamp(reason) {
  const lines = state.history.map((h, i) => `${String(i + 1).padStart(2, "0")}. ${h.ts} | ${h.phase} | ${h.step} | ${safeJson(h.data)}`);
  const out = [
    "=== KILLFEED DEBUG STAMP ===",
    `reason: ${reason}`,
    `phase: ${state.phase}`,
    `cycle: ${state.cycle}`,
    `currentFile: ${state.currentFile}`,
    `currentLineCount: ${state.currentLineCount}`,
    `lastKnownLastLine: ${state.lastKnownLastLine}`,
    `lastContentBytes: ${state.lastContentBytes}`,
    `staleCycles: ${state.staleCycles}`,
    `sourceSwitches: ${state.sourceSwitches}`,
    `huntHits: ${state.huntHits}`,
    `huntBackoff: ${state.huntBackoff}`,
    `lastSuccessfulFile: ${state.lastSuccessfulFile}`,
    `lastSuccessfulAt: ${state.lastSuccessfulAt}`,
    `lastFailure: ${safeJson(state.lastFailure)}`,
    "--- HISTORY ---",
    ...lines,
    "=== END STAMP ==="
  ].join("\n");
  console.log(out);
  return out;
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

async function ftpClient() {
  const client = new Client();
  await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASS, secure: FTP_SECURE });
  return client;
}

async function listAdmFiles() {
  const client = await ftpClient();
  try {
    const list = await client.list(REMOTE_DIR);
    const files = list
      .filter(item => String(item.name || "").toUpperCase().endsWith(".ADM"))
      .map(item => ({
        name: item.name,
        size: Number(item.size || 0),
        modifiedAt: item.modifiedAt || item.modified || null,
        fullPath: joinRemote(REMOTE_DIR, item.name)
      }))
      .sort((a, b) => {
        const ta = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
        const tb = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        if (b.size !== a.size) return b.size - a.size;
        return b.name.localeCompare(a.name);
      });
    state.lastList = files;
    trace("ftp list", { dir: REMOTE_DIR, count: files.length, files });
    return files;
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = await ftpClient();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  try {
    trace("download start", { remotePath });
    await client.downloadTo(localTmp, remotePath);
    const content = fs.readFileSync(localTmp, "utf8");
    const stat = fs.statSync(localTmp);
    const lines = content.split(/\r?\n/);
    trace("download ok", {
      file: remotePath,
      bytes: stat.size,
      totalLines: lines.length,
      firstLine: lines[0] || "",
      lastLine: lines[lines.length - 1] || ""
    });
    return { content, bytes: stat.size, lines };
  } catch (err) {
    state.lastFailure = { at: new Date().toISOString(), where: "readRemoteFile", remotePath, message: err.message };
    trace("download failed", state.lastFailure);
    throw err;
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
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    trace("webhook post", { status: res.status, ok: res.ok });
    return res.ok;
  } catch (err) {
    state.lastFailure = { at: new Date().toISOString(), where: "safePostWebhook", message: err.message };
    trace("webhook error", state.lastFailure);
    return false;
  }
}

function resetFileState(reason, file) {
  trace("file reset", {
    reason,
    file: file?.fullPath || file?.name || null,
    previous: {
      currentFile: state.currentFile,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      lastFileMeta: state.lastFileMeta,
      staleCycles: state.staleCycles
    }
  });
  state.currentLineCount = 0;
  state.lastKnownLastLine = "";
  state.lastContentBytes = 0;
  state.lastFileMeta = null;
  state.lastEvents.clear();
  state.staleCycles = 0;
}

function setSource(file, reason) {
  if (state.currentFile !== file.fullPath) state.sourceSwitches += 1;
  state.currentFile = file.fullPath;
  resetFileState(reason, file);
}

function processFile(file, content, bytes) {
  const lines = content.split(/\r?\n/);
  const currentLineCount = lines.length;
  const firstLine = normalizeLine(lines[0] || "");
  const lastLine = normalizeLine(lines[lines.length - 1] || "");
  const modifiedAt = file.modifiedAt || null;
  const size = file.size || bytes || 0;

  const sameFile = state.currentFile === file.fullPath;
  const metaChanged = !state.lastFileMeta || state.lastFileMeta.fullPath !== file.fullPath || state.lastFileMeta.modifiedAt !== modifiedAt || state.lastFileMeta.size !== size;
  const countGrew = currentLineCount > state.currentLineCount;
  const countSame = currentLineCount === state.currentLineCount;
  const countShrank = currentLineCount < state.currentLineCount;
  const bytesGrew = bytes > state.lastContentBytes;
  const lastLineChanged = lastLine !== state.lastKnownLastLine;
  const firstLineChanged = firstLine && state.lastFileMeta && firstLine !== state.lastFileMeta.firstLine;

  trace("file snapshot", {
    file: file.fullPath,
    sameFile,
    metaChanged,
    currentLineCount,
    previousLineCount: state.currentLineCount,
    bytes,
    previousBytes: state.lastContentBytes,
    firstLine,
    lastLine,
    modifiedAt,
    countGrew,
    countSame,
    countShrank,
    bytesGrew,
    lastLineChanged,
    firstLineChanged
  });

  if (!sameFile) {
    setSource(file, "switched-file");
  } else if (countShrank || (state.lastFileMeta && state.lastFileMeta.size && size < state.lastFileMeta.size)) {
    resetFileState("shrank-or-rotated", file);
  }

  const noAdvance = sameFile && countSame && !bytesGrew && !lastLineChanged;
  if (noAdvance) {
    state.staleCycles += 1;
    trace("stale cycle", { file: file.fullPath, staleCycles: state.staleCycles, currentLineCount, bytes, modifiedAt, lastLine });
  } else {
    state.staleCycles = 0;
  }

  let startIndex = state.currentLineCount;
  if (countShrank || startIndex > currentLineCount || !sameFile) startIndex = 0;
  if (state.staleCycles >= STALE_LIMIT) startIndex = 0;

  const events = [];
  trace("scan start", { file: file.fullPath, startIndex, currentLineCount, staleCycles: state.staleCycles, phase: state.phase });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    trace("scan line", { index: i, line });
    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${file.fullPath}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      trace("dedupe skip", { file: file.fullPath, index: i, line });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 1000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    trace("trigger match", { file: file.fullPath, index: i, event });
    events.push(event);
  }

  state.currentLineCount = currentLineCount;
  state.lastKnownLastLine = lastLine;
  state.lastContentBytes = bytes;
  state.lastFileMeta = { fullPath: file.fullPath, modifiedAt, size, firstLine, lastLine, currentLineCount };

  return { events, changed: metaChanged || countGrew || bytesGrew || lastLineChanged };
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    state.lastSuccessfulFile = state.currentFile;
    state.lastSuccessfulAt = new Date().toISOString();
    trace("event parsed", evt);
    trace("discord payload", { content });
    await safePostWebhook({ content });
  }
}

async function huntForUpdates(targetFile) {
  state.phase = "hunt";
  state.huntActive = true;
  trace("enter hunt", { targetFile, delayMs: HUNT_DELAY_MS });

  while (state.running) {
    state.huntHits += 1;
    await new Promise(r => setTimeout(r, state.huntBackoff));

    const files = await listAdmFiles();
    const newest = files[0] || null;
    trace("hunt list", { targetFile, newest, huntHits: state.huntHits, huntBackoff: state.huntBackoff, sourceSwitches: state.sourceSwitches });

    if (!newest) {
      state.huntBackoff = Math.min(30000, Math.floor(state.huntBackoff * 1.1));
      continue;
    }

    if (newest.fullPath !== targetFile) {
      trace("hunt new file", { old: targetFile, newest: newest.fullPath });
      setSource(newest, "hunt-switch");
    }

    const currentTarget = state.currentFile || newest.fullPath;
    const snap = await readRemoteFile(currentTarget);
    const result = processFile({ ...newest, fullPath: currentTarget }, snap.content, snap.bytes);

    trace("hunt compare", {
      targetFile: currentTarget,
      changed: result.changed,
      events: result.events.length,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      staleCycles: state.staleCycles,
      huntBackoff: state.huntBackoff
    });

    if (result.events.length) {
      await handleEvents(result.events);
      state.phase = "standby";
      state.huntActive = false;
      stamp("success-found-during-hunt");
      return true;
    }

    if (result.changed) {
      state.huntMoves += 1;
      state.huntBackoff = Math.max(3000, Math.floor(state.huntBackoff * 0.85));
    } else {
      state.huntBackoff = Math.min(30000, Math.floor(state.huntBackoff * 1.15));
    }

    if (state.staleCycles >= STALE_LIMIT) {
      state.huntBackoff = Math.max(3000, Math.floor(state.huntBackoff * 0.9));
    }
  }

  state.huntActive = false;
  return false;
}

async function pollOnce() {
  if (state.inFlight) return;
  state.inFlight = true;
  state.cycle += 1;

  try {
    ensureConfig();
    trace("poll start", {
      cycle: state.cycle,
      phase: state.phase,
      currentFile: state.currentFile,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      staleCycles: state.staleCycles,
      huntActive: state.huntActive,
      sourceSwitches: state.sourceSwitches,
      lastSuccessfulFile: state.lastSuccessfulFile,
      lastSuccessfulAt: state.lastSuccessfulAt
    });

    const files = await listAdmFiles();
    const newest = files[0] || null;
    trace("cycle start", { cycle: state.cycle, remoteCount: files.length, newest });

    if (!newest) {
      state.lastFailure = { at: new Date().toISOString(), where: "pollOnce", message: "No ADM files found" };
      trace("no adm files", { remoteDir: REMOTE_DIR });
      return;
    }

    if (!state.currentFile) {
      setSource(newest, "startup-source");
    } else if (state.currentFile !== newest.fullPath) {
      trace("newest file changed", { previous: state.currentFile, newest: newest.fullPath });
      setSource(newest, "newest-file-changed");
    }

    const snap = await readRemoteFile(state.currentFile || newest.fullPath);
    state.lastRead = {
      at: new Date().toISOString(),
      file: state.currentFile || newest.fullPath,
      bytes: snap.bytes,
      lineCount: snap.lines.length,
      firstLine: snap.lines[0] || "",
      lastLine: snap.lines[snap.lines.length - 1] || ""
    };
    trace("read summary", state.lastRead);

    const result = processFile({ ...newest, fullPath: state.currentFile || newest.fullPath }, snap.content, snap.bytes);
    trace("post-process", { file: state.currentFile || newest.fullPath, events: result.events.length, changed: result.changed, state: { currentFile: state.currentFile, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, staleCycles: state.staleCycles, phase: state.phase } });

    if (result.events.length) {
      await handleEvents(result.events);
      state.phase = "standby";
      stamp("success-in-poll");
      return;
    }

    if (state.phase !== "hunt") {
      if (!result.changed || state.staleCycles >= STALE_LIMIT) {
        await huntForUpdates(state.currentFile || newest.fullPath);
      }
    }

    trace("cycle end", {
      cycle: state.cycle,
      phase: state.phase,
      currentFile: state.currentFile,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      staleCycles: state.staleCycles,
      sourceSwitches: state.sourceSwitches,
      huntHits: state.huntHits
    });
  } catch (err) {
    state.lastFailure = { at: new Date().toISOString(), where: "pollOnce", message: err.message, stack: err.stack };
    console.error("[killfeed] poll error:", err);
    trace("poll error", state.lastFailure);
  } finally {
    state.inFlight = false;
  }
}

function scheduleNext() {
  if (!state.running) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[killfeed] scheduled poll error:", err);
    } finally {
      scheduleNext();
    }
  }, LOOP_INTERVAL);
}

function start() {
  if (state.running) return;
  state.running = true;
  trace("start", { loopInterval: LOOP_INTERVAL, debug: DEBUG, webhookEnabled: !!WEBHOOK_URL, remoteDir: REMOTE_DIR, huntDelayMs: HUNT_DELAY_MS, staleLimit: STALE_LIMIT });
  pollOnce().catch(err => console.error("[killfeed] initial poll error:", err)).finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  stamp("stop");
}

module.exports = { start, stop, pollOnce, state };
