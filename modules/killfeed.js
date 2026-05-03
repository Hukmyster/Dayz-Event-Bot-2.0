const path = require("path");

const DEBUG = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";

const ROOT_DIRS = ["/", "/dayzps", "/dayzps/config", "/dayzps/storage", "/server"];
const MAX_DEPTH = 20;
const MAX_DIRS = 5000;

const state = {
  visitedDirs: new Set(),
  discoveredPaths: new Set(),
  seenEventKeys: new Set(),
  fileMeta: new Map(),
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

function joinChild(base, child) {
  return normalizePath(path.posix.join(normalizePath(base), String(child || "").replace(/^\/+/, "")));
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function fingerprint(content) {
  const raw = content.split(/\r?\n/);
  const lines = raw[raw.length - 1] === "" ? raw.slice(0, -1) : raw;
  return {
    lineCount: lines.length,
    firstLine: normalizeLine(lines[0] || ""),
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };
}

function cleanNpcName(name) {
  const n = String(name || "").trim();
  if (!n || n === `"` || n === `""`) return "Unknown NPC";
  return n;
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
    victim: cleanNpcName(victimRaw?.[1] || "Unknown NPC"),
    killer: killerMatch?.[1] || "Unknown",
    weapon: weaponMatch?.[1]?.trim() || "Unknown",
    distance: distanceMatch?.[1] ? Number(distanceMatch[1]).toFixed(1) : "0.0",
    raw: line
  };
}

function buildEventMessage(event) {
  return `💀 **${event.victim}** killed by **${event.killer}** with **${event.weapon}** from **${event.distance}m** | ${event.time}`;
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
    throw new Error(`Nitrado HTTP ${res.status}: ${text.slice(0, 250)}`);
  }
  return res;
}

async function fetchGameServerInfo() {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers`;
  const res = await nitradoRequest(url);
  return await res.json();
}

function collectPrimaryCandidates(gameServerJson) {
  const gs = gameServerJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const candidates = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    candidates.push(base);
    const filename = path.posix.basename(base);
    if (username) {
      candidates.push(`/games/${username}/noftp/${filename}`);
      candidates.push(`/games/${username}/noftp/${base.replace(/^\/+/, "")}`);
    }
  }

  return {
    username,
    paths: [...new Set(candidates.map(normalizePath))]
  };
}

function extractEntries(json) {
  const data = json?.data || json || {};
  return data.entries || data.items || data.files || data.children || [];
}

function entryPath(entry, fallbackDir) {
  const raw = entry?.path || entry?.filename || entry?.name || "";
  if (raw) return normalizePath(raw);
  return fallbackDir ? joinChild(fallbackDir, entry?.name || "") : "/";
}

function isDir(entry) {
  const t = String(entry?.type || entry?.kind || entry?.entry_type || "").toLowerCase();
  if (t.includes("dir")) return true;
  if (entry?.is_dir === true || entry?.directory === true) return true;
  const p = String(entry?.path || entry?.filename || entry?.name || "");
  return !/\.[a-z0-9]+$/i.test(p) && !entry?.size;
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
  if (state.visitedDirs.size >= MAX_DIRS) return;

  state.visitedDirs.add(ndir);
  log("scan:attempt", { dir: ndir, depth });

  let entries = [];
  try {
    entries = await listDirectory(ndir);
  } catch (err) {
    warn("scan:list-failed", { dir: ndir, error: err.message });
    return;
  }

  let loggedHit = false;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const p = entryPath(entry, ndir);
    const name = String(entry?.name || path.posix.basename(p) || "").trim();
    const looksAdm = /\.adm$/i.test(p) || /\.adm$/i.test(name);

    if (looksAdm) {
      state.discoveredPaths.add(p);
      if (!loggedHit) {
        log("found:adm", { path: p, dir: ndir });
        loggedHit = true;
      }
      continue;
    }

    if (isDir(entry)) {
      const child = p && p !== ndir ? p : joinChild(ndir, name);
      if (child && child !== ndir) {
        await discoverFromDir(child, depth + 1);
      }
    }
  }
}

async function fallbackRecursiveScan() {
  state.visitedDirs.clear();
  state.discoveredPaths.clear();
  for (const root of ROOT_DIRS) {
    await discoverFromDir(root, 0);
  }
  return [...state.discoveredPaths].sort();
}

async function discoverAllPaths() {
  ensureConfig();
  const serverJson = await fetchGameServerInfo();
  const { username, paths: primaryPaths } = collectPrimaryCandidates(serverJson);

  for (const p of primaryPaths) state.discoveredPaths.add(p);
  log("primary:log_files", { count: primaryPaths.length, username, sample: primaryPaths[0] || null });

  const fallbackPaths = await fallbackRecursiveScan();
  for (const p of fallbackPaths) state.discoveredPaths.add(p);

  const combined = [...state.discoveredPaths].sort();
  log("discover:done", {
    primaryCount: primaryPaths.length,
    fallbackCount: fallbackPaths.length,
    totalCount: combined.length,
    visitedDirs: state.visitedDirs.size
  });

  return { username, primaryPaths, fallbackPaths, combined };
}

async function getDownloadToken(filePath) {
  const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`;
  const res = await nitradoRequest(url);
  const json = await res.json();
  const tokenUrl = json?.data?.token?.url || null;
  const token = json?.data?.token?.token || null;
  return { json, tokenUrl, token };
}

async function fetchFileViaToken(tokenUrl, token) {
  const u = new URL(tokenUrl);
  if (token) u.searchParams.set("token", token);

  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/octet-stream,*/*"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token fetch HTTP ${res.status}: ${text.slice(0, 250)}`);
  }

  return await res.text();
}

function candidateReadPaths(originalPath, username) {
  const original = normalizePath(originalPath);
  const filename = path.posix.basename(original);
  return [...new Set([
    original,
    `/games/${username}/noftp/${filename}`,
    `/games/${username}/noftp/${original.replace(/^\/+/, "")}`,
    `/dayzps/config/${filename}`,
    `/dayzps/storage/${filename}`,
    `/server/${filename}`
  ].filter(Boolean))];
}

async function readRemoteFileWithFallbacks(remotePath, username) {
  const candidates = candidateReadPaths(remotePath, username);

  for (const candidate of candidates) {
    try {
      log("read:attempt", { path: candidate });
      const { tokenUrl, token } = await getDownloadToken(candidate);
      if (!tokenUrl || !token) throw new Error("No token URL/token returned");
      log("read:token", { path: candidate, tokenUrl: tokenUrl.slice(0, 80) });
      const content = await fetchFileViaToken(tokenUrl, token);
      return { pathUsed: candidate, content };
    } catch (err) {
      warn("read:failed", { path: candidate, error: err.message });
    }
  }

  throw new Error(`All read attempts failed for ${remotePath}`);
}

function processFile(remotePath, content) {
  const current = fingerprint(content);
  const previous = state.fileMeta.get(remotePath) || { lineCount: 0, firstLine: "", lastLine: "" };
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

    const key = `${remotePath}|${event.raw}`;
    if (state.seenEventKeys.has(key)) continue;
    state.seenEventKeys.add(key);

    events.push({ ...event, file: remotePath });
  }

  state.fileMeta.set(remotePath, current);
  return events;
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

async function handleEvents(events) {
  for (const evt of events) {
    await safePostWebhook({ content: buildEventMessage(evt) });
  }
}

async function run() {
  dbg("START", {
    debug: DEBUG,
    webhookEnabled: !!WEBHOOK_URL,
    source: "nitrado-api",
    serviceId: SERVICE_ID,
    startedAt: state.startedAt
  });

  const discovered = await discoverAllPaths();
  const readable = [];

  for (const remotePath of discovered.combined) {
    try {
      const result = await readRemoteFileWithFallbacks(remotePath, discovered.username);
      readable.push(result.pathUsed);
      const events = processFile(remotePath, result.content);
      if (events.length) {
        log("poll:events", { file: remotePath, count: events.length, readPath: result.pathUsed });
        await handleEvents(events);
      } else {
        log("read:ok", { path: remotePath, used: result.pathUsed, bytes: result.content.length });
      }
    } catch (err) {
      warn("read:all-failed", { path: remotePath, error: err.message });
    }
  }

  console.log(JSON.stringify({
    username: discovered.username,
    primaryPaths: discovered.primaryPaths,
    fallbackPaths: discovered.fallbackPaths,
    readablePaths: [...new Set(readable)],
    totalDiscovered: discovered.combined.length
  }, null, 2));
}

function start() {
  return run();
}

function stop() {}

module.exports = { start, stop };
