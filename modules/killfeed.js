const path = require("path");

const DEBUG = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const ROOT_DIRS = ["/", "/dayzps", "/dayzps/config", "/dayzps/storage", "/server"];
const MAX_DEPTH = 12;

const state = {
  seenFiles: new Set(),
  foundPaths: new Set(),
  visitedDirs: new Set(),
  lastEvents: new Set(),
  startedAt: new Date().toISOString()
};

function dbg(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? (typeof data === "object" ? JSON.stringify(data) : String(data)) : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function log(tag, data) {
  if (DEBUG) dbg(tag, data);
}

function warn(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? (typeof data === "object" ? JSON.stringify(data) : String(data)) : "";
  console.warn(`[killfeed][${ts}][WARN:${tag}]${dataStr ? " " + dataStr : ""}`);
}

function ensureConfig() {
  const missing = [];
  if (!WEBHOOK_URL) missing.push("KILLFEED_WEBHOOK_URL");
  if (!API_TOKEN) missing.push("API_TOKEN");
  if (!SERVICE_ID) missing.push("SERVICE_ID");
  if (missing.length) throw new Error(`Missing killfeed env vars: ${missing.join(", ")}`);
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
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

function extractEntries(json) {
  const data = json?.data || json || {};
  return data.entries || data.items || data.files || [];
}

function entryPath(entry) {
  return normalizePath(entry?.path || entry?.filename || entry?.name || "");
}

function isDir(entry) {
  const t = String(entry?.type || entry?.kind || entry?.entry_type || "").toLowerCase();
  if (t.includes("dir")) return true;
  if (entry?.is_dir === true || entry?.directory === true) return true;
  return !entry?.name?.match(/\.[a-z0-9]+$/i) && !entry?.path?.match(/\.[a-z0-9]+$/i) && !entry?.size;
}

async function listDirectory(dir) {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/list?dir=${encodeURIComponent(dir)}`;
  const res = await nitradoRequest(url);
  const json = await res.json();
  return extractEntries(json);
}

async function discoverFromDir(dir, depth = 0) {
  const ndir = normalizePath(dir);
  if (depth > MAX_DEPTH) return;
  if (state.visitedDirs.has(ndir)) return;
  state.visitedDirs.add(ndir);

  log("scan:attempt", { dir: ndir, depth });

  let entries = [];
  try {
    entries = await listDirectory(ndir);
  } catch (err) {
    warn("discover:list-failed", { dir: ndir, error: err.message });
    return;
  }

  let loggedOne = false;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const p = entryPath(entry);
    const name = String(entry?.name || path.posix.basename(p) || "").trim();
    const looksAdm = /\.adm$/i.test(p) || /\.adm$/i.test(name);

    if (looksAdm) {
      state.foundPaths.add(p);
      if (!loggedOne) {
        log("found:adm", { path: p, dir: ndir });
        loggedOne = true;
      }
    }

    if (isDir(entry)) {
      const child = p || normalizePath(path.posix.join(ndir, name));
      if (child && child !== ndir) await discoverFromDir(child, depth + 1);
    }
  }
}

async function discoverAllAdmPaths() {
  state.visitedDirs.clear();
  state.foundPaths.clear();
  for (const root of ROOT_DIRS) await discoverFromDir(root, 0);
  const paths = [...state.foundPaths].sort();
  log("discover:done", { admPaths: paths.length, visitedDirs: state.visitedDirs.size });
  return paths;
}

async function readRemoteFile(remotePath) {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(remotePath)}`;
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

async function safePostWebhook(payload) {
  if (!WEBHOOK_URL) return false;
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return res.ok;
  } catch {
    return false;
  }
}

function processFile(remotePath, content, meta) {
  const current = fingerprint(content);
  const previous = state.fileMeta.get(remotePath) || { lineCount: 0, lastLine: "", firstLine: "", size: -1, modifiedAt: null };
  const rotated = previous.lineCount > current.lineCount && current.lineCount > 0;
  const reset = rotated || (previous.lastLine && current.firstLine && previous.lastLine !== current.firstLine && current.lineCount <= previous.lineCount);

  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const startIndex = !reset && current.lineCount >= previous.lineCount ? previous.lineCount : 0;
  const events = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) continue;
    const event = parseAdmKillLine(line);
    if (!event) continue;
    const dedupeKey = `${remotePath}|${event.type}|${event.raw}`;
    if (state.lastEvents.has(dedupeKey)) continue;
    state.lastEvents.add(dedupeKey);
    if (state.lastEvents.size > 2000) state.lastEvents.delete(state.lastEvents.values().next().value);
    events.push({ ...event, file: remotePath });
  }

  state.fileMeta.set(remotePath, { ...current, size: meta.size, modifiedAt: meta.modifiedAt });
  return events;
}

async function handleEvents(events) {
  for (const evt of events) await safePostWebhook({ content: buildEventMessage(evt) });
}

async function pollOnce() {
  ensureConfig();
  dbg("poll:start", { source: "nitrado-api" });
  const discovered = await discoverAllAdmPaths();

  let totalEvents = 0;
  for (const remotePath of discovered) {
    let content;
    try {
      content = await readRemoteFile(remotePath);
    } catch (err) {
      warn("poll:read-failed", { file: remotePath, error: err.message });
      continue;
    }

    const meta = { size: content.length, modifiedAt: null };
    state.seenFiles.add(remotePath);
    const events = processFile(remotePath, content, meta);
    totalEvents += events.length;
    if (events.length) {
      log("poll:events", { file: remotePath, count: events.length });
      await handleEvents(events);
    }
  }

  dbg("poll:end", { totalEvents, discovered: discovered.length, visitedDirs: state.visitedDirs.size });
  console.log(JSON.stringify({ admPaths: discovered, count: discovered.length }, null, 2));
}

function start() {
  return pollOnce();
}

function stop() {}

module.exports = { start, stop, pollOnce, state };
