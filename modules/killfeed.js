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
const HUNT_DELAY_MS = Number(process.env.KILLFEED_HUNT_DELAY_MS || 8000);
const STALE_LIMIT = Number(process.env.KILLFEED_STALE_LIMIT || 2);
const STANDBY_AFTER_SUCCESS = String(process.env.KILLFEED_STANDBY_AFTER_SUCCESS || "true").toLowerCase() === "true";

const state = {
  running: false,
  timer: null,
  inFlight: false,
  cycle: 0,
  phase: "initial",
  currentFile: null,
  currentLineCount: 0,
  lastKnownLastLine: "",
  lastEvents: new Set(),
  lastFileMeta: null,
  lastContentBytes: 0,
  staleCycles: 0,
  huntActive: false,
  successLatched: false,
  history: [],
  lastList: [],
  lastOutcome: null,
  huntHits: 0,
  huntMoves: 0,
  huntBackoff: HUNT_DELAY_MS,
  huntStartAt: null,
  huntLastChangeAt: null,
  huntLastFile: null
};

function log(level, label, data) {
  if (!DEBUG) return;
  if (state.phase === "hunt" && level !== "error") return;
  const ts = new Date().toISOString();
  const payload = data === undefined ? "" : ` ${safeJson(data)}`;
  console.log(`[killfeed][${ts}][${level}] ${label}${payload}`);
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function record(step, data) {
  const entry = { ts: new Date().toISOString(), phase: state.phase, step, data };
  state.history.push(entry);
  if (state.history.length > 40) state.history.shift();
  log("trace", step, data);
}

function historyStamp(reason) {
  const lines = state.history.map((h, i) => `${String(i + 1).padStart(2, "0")}. ${h.ts} | ${h.phase} | ${h.step} | ${safeJson(h.data)}`);
  const stamp = [
    "=== KILLFEED HUNT STAMP ===",
    `reason: ${reason}`,
    `phase: ${state.phase}`,
    `cycle: ${state.cycle}`,
    `currentFile: ${state.currentFile}`,
    `lineCount: ${state.currentLineCount}`,
    `bytes: ${state.lastContentBytes}`,
    `lastLine: ${state.lastKnownLastLine}`,
    `huntHits: ${state.huntHits}`,
    `huntMoves: ${state.huntMoves}`,
    `huntBackoff: ${state.huntBackoff}`,
    "--- HISTORY ---",
    ...lines,
    "=== END STAMP ==="
  ].join("\n");
  console.log(stamp);
  return stamp;
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
    record("ftp list", { dir: REMOTE_DIR, count: files.length, newest: files[0] || null });
    return files;
  } finally {
    client.close();
  }
}

async function readRemoteFile(remotePath) {
  const client = await ftpClient();
  const localTmp = path.join("/tmp", `killfeed_${Date.now()}_${Math.random().toString(36).slice(2)}.adm`);
  try {
    record("download start", { remotePath });
    await client.downloadTo(localTmp, remotePath);
    const content = fs.readFileSync(localTmp, "utf8");
    const stat = fs.statSync(localTmp);
    const lines = content.split(/\r?\n/);
    record("download ok", { file: remotePath, bytes: stat.size, totalLines: lines.length, firstLine: lines[0] || "", lastLine: lines[lines.length - 1] || "" });
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
  return { type: "kill", time: timeMatch ? timeMatch[1] : "unknown time", victim: cleanNpcName(victimMatch && victimMatch[1] ? victimMatch[1] : "Unknown NPC"), killer: killerMatch && killerMatch[1] ? killerMatch[1] : "Unknown", weapon: weaponMatch && weaponMatch[1] ? weaponMatch[1].trim() : "Unknown", distance: weaponMatch && weaponMatch[2] ? Number(weaponMatch[2]).toFixed(1) : "0.0", raw: line };
}

async function safePostWebhook(payload) {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    record("webhook post", { status: res.status, ok: res.ok });
    return res.ok;
  } catch (err) {
    record("webhook error", { message: err.message });
    return false;
  }
}

function resetFileState(reason, file) {
  record("file reset", { reason, file: file?.fullPath || file?.name || null, currentFile: state.currentFile, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, lastFileMeta: state.lastFileMeta, staleCycles: state.staleCycles });
  state.currentLineCount = 0;
  state.lastKnownLastLine = "";
  state.lastContentBytes = 0;
  state.lastFileMeta = null;
  state.lastEvents.clear();
  state.staleCycles = 0;
}

function phaseShift(next, reason, extra = {}) {
  const prev = state.phase;
  state.phase = next;
  state.lastOutcome = { at: new Date().toISOString(), from: prev, to: next, reason, ...extra };
  record("phase shift", state.lastOutcome);
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

  record("file snapshot", { file: file.fullPath, sameFile, fileChanged, currentLineCount, previousLineCount: state.currentLineCount, bytes, previousBytes: state.lastContentBytes, firstLine, lastLine, modifiedAt, countGrew, countSame, countShrank, bytesGrew, lastLineChanged, firstLineChanged });

  if (!sameFile) {
    state.currentFile = file.fullPath;
    resetFileState("switched-file", file);
  } else if (countShrank || (state.lastFileMeta && state.lastFileMeta.size && size < state.lastFileMeta.size)) {
    resetFileState("shrank-or-rotated", file);
  }

  const noAdvance = sameFile && countSame && !bytesGrew && !lastLineChanged;
  if (noAdvance) {
    state.staleCycles += 1;
    record("stale cycle", { file: file.fullPath, staleCycles: state.staleCycles, currentLineCount, bytes, modifiedAt, lastLine });
  } else {
    state.staleCycles = 0;
  }

  let startIndex = state.currentLineCount;
  if (countShrank || startIndex > currentLineCount || !sameFile) startIndex = 0;
  if (state.staleCycles >= STALE_LIMIT) startIndex = 0;

  const events = [];
  record("scan start", { file: file.fullPath, startIndex, currentLineCount, staleCycles: state.staleCycles, phase: state.phase });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    record("scan line", { index: i, line });
    const event = parseAdmKillLine(line);
    if (!event) continue;

    const dedupeKey = `${file.fullPath}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) {
      record("dedupe skip", { file: file.fullPath, index: i, line });
      continue;
    }

    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 1000) {
      const first = state.lastEvents.values().next().value;
      if (first) state.lastEvents.delete(first);
    }

    record("trigger match", { file: file.fullPath, index: i, event });
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
    record("event parsed", evt);
    record("discord payload", { content });
    await safePostWebhook({ content });
  }
}

async function huntForUpdates(targetFile) {
  phaseShift("hunt", "enter-hunt", { targetFile, delayMs: HUNT_DELAY_MS });
  state.huntActive = true;
  state.huntStartAt = state.huntStartAt || new Date().toISOString();

  while (state.running && !state.successLatched) {
    state.huntHits += 1;
    record("hunt attempt", { attempt: state.huntHits, targetFile, delayMs: state.huntBackoff, huntMoves: state.huntMoves, phase: state.phase });
    await new Promise(r => setTimeout(r, state.huntBackoff));

    const files = await listAdmFiles();
    const newest = files[0];
    record("hunt list", { newest, targetFile, huntBackoff: state.huntBackoff, huntHits: state.huntHits, huntMoves: state.huntMoves });

    if (!newest) continue;

    if (newest.fullPath !== targetFile) {
      state.huntMoves += 1;
      state.huntLastChangeAt = new Date().toISOString();
      record("hunt found new file", { old: targetFile, newest: newest.fullPath, huntMoves: state.huntMoves });
      const snap = await readRemoteFile(newest.fullPath);
      const result = processFile(newest, snap.content, snap.bytes);
      if (result.events.length) {
        await handleEvents(result.events);
        state.successLatched = true;
        state.huntActive = false;
        phaseShift("standby", "success-after-move", { file: newest.fullPath, events: result.events.length });
        historyStamp("success-after-move");
        return newest;
      }
      if (result.changed) {
        state.huntActive = false;
        phaseShift("standby", "new-file-no-event", { file: newest.fullPath });
        historyStamp("new file no event");
        return newest;
      }
    } else {
      const snap = await readRemoteFile(targetFile);
      const result = processFile(newest, snap.content, snap.bytes);
      record("hunt compare", { huntHits: state.huntHits, changed: result.changed, events: result.events.length, staleCycles: state.staleCycles, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, huntBackoff: state.huntBackoff });
      if (result.events.length) {
        await handleEvents(result.events);
        state.successLatched = true;
        state.huntActive = false;
        phaseShift("standby", "success", { file: newest.fullPath, events: result.events.length });
        historyStamp("success");
        return newest;
      }
      if (result.changed) {
        state.huntMoves += 1;
        state.huntLastChangeAt = new Date().toISOString();
        state.huntBackoff = Math.max(3000, Math.floor(state.huntBackoff * 0.85));
        record("hunt movement", { huntMoves: state.huntMoves, huntBackoff: state.huntBackoff, file: newest.fullPath });
      } else {
        state.huntBackoff = Math.min(30000, Math.floor(state.huntBackoff * 1.15));
        record("hunt no movement", { huntBackoff: state.huntBackoff, file: newest.fullPath, staleCycles: state.staleCycles });
      }
    }

    if (state.staleCycles >= STALE_LIMIT) {
      state.huntBackoff = Math.max(3000, Math.floor(state.huntBackoff * 0.9));
      record("hunt stale acceleration", { huntBackoff: state.huntBackoff, staleCycles: state.staleCycles });
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
    if (state.successLatched && STANDBY_AFTER_SUCCESS) {
      record("standby", { cycle: state.cycle, currentFile: state.currentFile, reason: "success-latched" });
      return;
    }

    if (state.phase === "initial") phaseShift("confirm", "first-pass-done", { cycle: state.cycle });

    record("poll start", { cycle: state.cycle, phase: state.phase, currentFile: state.currentFile, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, staleCycles: state.staleCycles, huntActive: state.huntActive });

    const files = await listAdmFiles();
    const newest = files[0] || null;
    record("cycle start", { cycle: state.cycle, remoteCount: files.length, newest });

    if (!newest) {
      record("no ADM files found", { remoteDir: REMOTE_DIR });
      return;
    }

    if (state.currentFile && state.currentFile !== newest.fullPath) {
      record("newest file changed", { previous: state.currentFile, newest: newest.fullPath });
      resetFileState("newest-file-changed", newest);
    }

    const snap = await readRemoteFile(newest.fullPath);
    const result = processFile(newest, snap.content, snap.bytes);

    record("post-process", { file: newest.fullPath, events: result.events.length, changed: result.changed, state: { currentFile: state.currentFile, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, staleCycles: state.staleCycles, phase: state.phase } });

    if (result.events.length) {
      await handleEvents(result.events);
      state.successLatched = true;
      phaseShift("standby", "success", { file: newest.fullPath, events: result.events.length });
      historyStamp("success");
      return;
    }

    if (state.phase === "confirm") {
      phaseShift("hunt", "secondary-pass-no-success", { file: newest.fullPath });
    }

    if (!result.changed || state.staleCycles >= STALE_LIMIT) {
      await huntForUpdates(newest.fullPath);
    }

    record("cycle end", { cycle: state.cycle, phase: state.phase, currentFile: state.currentFile, currentLineCount: state.currentLineCount, lastKnownLastLine: state.lastKnownLastLine, lastContentBytes: state.lastContentBytes, staleCycles: state.staleCycles });
  } catch (err) {
    console.error("[killfeed] poll error:", err);
    record("poll error", { message: err.message, stack: err.stack });
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
  phaseShift("initial", "start");
  record("start", { loopInterval: LOOP_INTERVAL, debug: DEBUG, webhookEnabled: !!WEBHOOK_URL, remoteDir: REMOTE_DIR, huntDelayMs: HUNT_DELAY_MS, staleLimit: STALE_LIMIT, standbyAfterSuccess: STANDBY_AFTER_SUCCESS });
  pollOnce().catch(err => console.error("[killfeed] initial poll error:", err)).finally(scheduleNext);
}

function stop() {
  state.running = false;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  historyStamp("stop");
}

module.exports = { start, stop, pollOnce, state };
