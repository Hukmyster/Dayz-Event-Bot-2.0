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
const HUNT_RETRIES = Number(process.env.KILLFEED_HUNT_RETRIES || 4);
const HUNT_DELAY_MS = Number(process.env.KILLFEED_HUNT_DELAY_MS || 15000);
const HUNT_STALE_CYCLES = Number(process.env.KILLFEED_HUNT_STALE_CYCLES || 2);

const state = {
  running: false,
  timer: null,
  inFlight: false,
  cycle: 0,
  currentFile: null,
  currentLineCount: 0,
  lastKnownLastLine: "",
  lastEvents: new Set(),
  retryQueue: new Set(),
  lastFileMeta: null,
  lastContentBytes: 0,
  staleCycles: 0,
  huntActive: false,
  huntCounter: 0,
  lastList: []
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
    log("ftp list", { dir: REMOTE_DIR, count: files.length, files });
    return files;
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = await ftpClient();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  try {
    log("ftp download start", remotePath);
    await client.downloadTo(localTmp, remotePath);
    const content = fs.readFileSync(localTmp, "utf8");
    const stat = fs.statSync(localTmp);
    const lines = content.split(/\r?\n/);

    log("ftp download ok", {
      file: remotePath,
      bytes: stat.size,
      totalLines: lines.length,
      firstLine: lines[0] || "",
      lastLine: lines[lines.length - 1] || ""
    });

    return { content, bytes: stat.size, lines };
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

function resetFileState(reason, file) {
  log("file reset", {
    reason,
    file: file?.fullPath || file?.name || null,
    state: {
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

function processFile(file, content, bytes) {
  const lines = content.split(/\r?\n/);
  const currentLineCount = lines.length;
  const firstLine = normalizeLine(lines[0] || "");
  const lastLine = normalizeLine(lines[lines.length - 1] || "");
  const modifiedAt = file.modifiedAt || null;
  const size = file.size || bytes || 0;

  const sameFile = state.currentFile === file.fullPath;
  const fileChanged = !state.lastFileMeta || state.lastFileMeta.fullPath !== file.fullPath || state.lastFileMeta.modifiedAt !== modifiedAt || state.lastFileMeta.size !== size;
  const countGrew = currentLineCount > state.currentLineCount;
  const countSame = currentLineCount === state.currentLineCount;
  const countShrank = currentLineCount < state.currentLineCount;
  const bytesGrew = bytes > state.lastContentBytes;
  const lastLineChanged = lastLine !== state.lastKnownLastLine;
  const firstLineChanged = firstLine && state.lastFileMeta && firstLine !== state.lastFileMeta.firstLine;

  log("file snapshot", {
    file: file.fullPath,
    sameFile,
    fileChanged,
    currentLineCount,
    previousLineCount: state.currentLineCount,
    bytes,
    previousBytes: state.lastContentBytes,
    firstLine,
    lastLine,
    modifiedAt,
    previousMeta: state.lastFileMeta,
    countGrew,
    countSame,
    countShrank,
    bytesGrew,
    lastLineChanged,
    firstLineChanged
  });

  if (!sameFile) {
    state.currentFile = file.fullPath;
    resetFileState("switched-file", file);
  } else if (countShrank || (state.lastFileMeta && state.lastFileMeta.size && size < state.lastFileMeta.size)) {
    resetFileState("shrank-or-rotated", file);
  }

  const afterResetCurrent = state.currentLineCount;
  const noAdvance = sameFile && countSame && !bytesGrew && !lastLineChanged;

  if (noAdvance) {
    state.staleCycles += 1;
    log("stale cycle", {
      file: file.fullPath,
      staleCycles: state.staleCycles,
      currentLineCount,
      bytes,
      modifiedAt,
      lastLine,
      currentState: {
        currentLineCount: afterResetCurrent,
        lastKnownLastLine: state.lastKnownLastLine,
        lastContentBytes: state.lastContentBytes
      }
    });
  } else {
    state.staleCycles = 0;
  }

  let startIndex = state.currentLineCount;
  if (countShrank || startIndex > currentLineCount || !sameFile) startIndex = 0;
  if (state.staleCycles >= HUNT_STALE_CYCLES) startIndex = 0;

  const events = [];
  log("scan start", { file: file.fullPath, startIndex, currentLineCount, staleCycles: state.staleCycles, huntActive: state.huntActive });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;

    log("scan line", { index: i, line });
    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${file.fullPath}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      log("dedupe skip", { file: file.fullPath, index: i, line });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 1000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    log("trigger match", { file: file.fullPath, index: i, event });
    events.push(event);
  }

  state.currentLineCount = currentLineCount;
  state.lastKnownLastLine = lastLine;
  state.lastContentBytes = bytes;
  state.lastFileMeta = { fullPath: file.fullPath, modifiedAt, size, firstLine, lastLine, currentLineCount };

  return { events, changed: fileChanged || countGrew || bytesGrew || lastLineChanged };
}

async function handleEvents(events) {
  for (const evt of events) {
    const content = buildEventMessage(evt);
    log("event parsed", evt);
    log("discord payload", content);
    await safePostWebhook({ content });
  }
}

async function huntForUpdates(targetFile) {
  state.huntActive = true;

  for (let i = 1; i <= HUNT_RETRIES; i++) {
    log("hunt attempt", { attempt: i, of: HUNT_RETRIES, targetFile, waitMs: HUNT_DELAY_MS });
    await new Promise(r => setTimeout(r, HUNT_DELAY_MS));

    const files = await listAdmFiles();
    const newest = files[0];
    log("hunt list", { attempt: i, newest, targetFile });

    if (!newest) continue;

    if (newest.fullPath !== targetFile) {
      log("hunt found new file", { old: targetFile, newest: newest.fullPath });
      state.huntActive = false;
      return newest;
    }

    const snap = await readRemoteFile(targetFile);
    const result = processFile(newest, snap.content, snap.bytes);

    log("hunt compare", {
      attempt: i,
      changed: result.changed,
      events: result.events.length,
      state: {
        currentLineCount: state.currentLineCount,
        lastKnownLastLine: state.lastKnownLastLine,
        lastContentBytes: state.lastContentBytes,
        staleCycles: state.staleCycles
      }
    });

    if (result.events.length) {
      await handleEvents(result.events);
      state.huntActive = false;
      return newest;
    }

    if (result.changed) {
      state.huntActive = false;
      return newest;
    }
  }

  state.huntActive = false;
  return null;
}

async function pollOnce() {
  if (state.inFlight) return;
  state.inFlight = true;
  state.cycle += 1;

  try {
    ensureConfig();

    log("poll start", {
      cycle: state.cycle,
      currentFile: state.currentFile,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      staleCycles: state.staleCycles,
      huntActive: state.huntActive
    });

    const files = await listAdmFiles();
    const newest = files[0] || null;

    log("cycle start", {
      cycle: state.cycle,
      remoteCount: files.length,
      newest,
      retryQueue: [...state.retryQueue]
    });

    if (!newest) {
      log("no ADM files found", { remoteDir: REMOTE_DIR });
      return;
    }

    if (state.currentFile && state.currentFile !== newest.fullPath) {
      log("newest file changed", { previous: state.currentFile, newest: newest.fullPath });
      resetFileState("newest-file-changed", newest);
    }

    const fileToRead = newest;
    const snap = await readRemoteFile(fileToRead.fullPath);
    const result = processFile(fileToRead, snap.content, snap.bytes);

    log("post-process", {
      file: fileToRead.fullPath,
      events: result.events.length,
      changed: result.changed,
      state: {
        currentFile: state.currentFile,
        currentLineCount: state.currentLineCount,
        lastKnownLastLine: state.lastKnownLastLine,
        lastContentBytes: state.lastContentBytes,
        staleCycles: state.staleCycles
      }
    });

    if (result.events.length) await handleEvents(result.events);

    if (!result.changed && state.staleCycles >= HUNT_STALE_CYCLES) {
      const hunted = await huntForUpdates(fileToRead.fullPath);
      if (hunted && hunted.fullPath !== fileToRead.fullPath) {
        log("hunt switched active file", { from: fileToRead.fullPath, to: hunted.fullPath });
        state.currentFile = hunted.fullPath;
        resetFileState("hunt-switch", hunted);
      }
    }

    log("cycle end", {
      cycle: state.cycle,
      currentFile: state.currentFile,
      currentLineCount: state.currentLineCount,
      lastKnownLastLine: state.lastKnownLastLine,
      lastContentBytes: state.lastContentBytes,
      staleCycles: state.staleCycles
    });
  } catch (err) {
    console.error("[killfeed] poll error:", err);
    log("poll error", { message: err.message, stack: err.stack });
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

  log("start", {
    loopInterval: LOOP_INTERVAL,
    debug: DEBUG,
    webhookEnabled: !!WEBHOOK_URL,
    remoteDir: REMOTE_DIR,
    huntRetries: HUNT_RETRIES,
    huntDelayMs: HUNT_DELAY_MS,
    huntStaleCycles: HUNT_STALE_CYCLES
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
