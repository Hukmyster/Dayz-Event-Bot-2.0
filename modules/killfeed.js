const DEBUG = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";

const state = {
  started: false,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  primaryPaths: [],
  readablePaths: [],
  seenEventKeys: new Set(),
  fileMeta: new Map()
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
    firstLine: normalizeLine(lines[0] || ""),
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };
}

function cleanNpcName(name) {
  const n = String(name || "").trim();
  if (!n || n === `"` || n === `""`) return "Unknown NPC";
  return n;
}

function parseKillLine(line) {
  const hasKill = /killed by|committed suicide|bled out|died\./i.test(line);
  if (!hasKill) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  const victimMatch = line.match(/Player\s+"([^"]*)"/i);
  const killerMatch = line.match(/killed by\s+(?:Player\s+"([^"]*)"|Infected|Wolf|Bear|Zombie|Fireplace|Vehicle|FallDamage|Explosion|Gas)/i);
  const weaponMatch = line.match(/\bwith\s+(.+?)(?:\s+from\s+[0-9.]+\s+meters|\s*$)/i);
  const distanceMatch = line.match(/from\s+([0-9.]+)\s+meters/i);

  if (!/killed by/i.test(line)) {
    return {
      type: "death",
      time: timeMatch ? timeMatch[1] : "unknown time",
      victim: cleanNpcName(victimMatch?.[1] || "Unknown NPC"),
      killer: "Environment",
      weapon: "Unknown",
      distance: "0.0",
      raw: line
    };
  }

  return {
    type: "kill",
    time: timeMatch ? timeMatch[1] : "unknown time",
    victim: cleanNpcName(victimMatch?.[1] || "Unknown NPC"),
    killer: cleanNpcName(killerMatch?.[1] || "Unknown"),
    weapon: weaponMatch?.[1]?.trim() || "Unknown",
    distance: distanceMatch?.[1] ? Number(distanceMatch[1]).toFixed(1) : "0.0",
    raw: line
  };
}

function buildEventMessage(event) {
  if (event.type === "death") return `☠️ **${event.victim}** died | ${event.time}`;
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
  const text = await res.text().catch(() => "");
  log("http:response", { url, status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`Nitrado HTTP ${res.status}: ${text.slice(0, 250)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchGameServerInfo() {
  return await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers`);
}

function collectPrimaryCandidates(serverJson) {
  const gs = serverJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const out = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    const filename = base.split("/").pop();
    out.push(`/games/${username}/noftp/dayzps/config/${filename}`);
    out.push(`/games/${username}/noftp/${base.replace(/^\/+/, "")}`);
    out.push(base);
  }

  return { username, paths: [...new Set(out.map(normalizePath))] };
}

async function getDownloadToken(filePath) {
  const json = await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`);
  const tokenUrl = json?.data?.token?.url || null;
  const token = json?.data?.token?.token || null;
  log("download:parsed", { filePath, hasTokenUrl: !!tokenUrl, hasToken: !!token, tokenUrl: tokenUrl || null });
  return { tokenUrl, token, raw: json };
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
  const text = await res.text().catch(() => "");
  log("token:response", { url: u.toString(), status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`Token fetch HTTP ${res.status}: ${text.slice(0, 250)}`);
  return text;
}

function candidateReadPaths(originalPath, username) {
  const filename = String(originalPath || "").split("/").pop();
  return [
    `/games/${username}/noftp/dayzps/config/${filename}`,
    `/games/${username}/noftp/${filename}`,
    normalizePath(originalPath)
  ];
}

async function readRemoteFileWithFallbacks(remotePath, username) {
  const candidates = [...new Set(candidateReadPaths(remotePath, username).filter(Boolean))];
  for (const candidate of candidates) {
    try {
      log("read:attempt", { path: candidate });
      const { tokenUrl, token } = await getDownloadToken(candidate);
      if (!tokenUrl || !token) throw new Error("No token URL/token returned");
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
    const event = parseKillLine(line);
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
  for (const evt of events) await safePostWebhook({ content: buildEventMessage(evt) });
}

async function run() {
  state.running = true;
  dbg("START", { debug: DEBUG, webhookEnabled: !!WEBHOOK_URL, source: "nitrado-api", serviceId: SERVICE_ID, startedAt: state.startedAt });

  const serverJson = await fetchGameServerInfo();
  const { username, paths } = collectPrimaryCandidates(serverJson);
  state.username = username;
  state.primaryPaths = paths;
  log("primary:paths", { username, count: paths.length, paths });

  const readable = [];

  for (const remotePath of paths) {
    try {
      const result = await readRemoteFileWithFallbacks(remotePath, username);
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

  state.readablePaths = [...new Set(readable)];
  console.log(JSON.stringify({
    username,
    primaryPaths: paths,
    readablePaths: state.readablePaths,
    totalDiscovered: state.readablePaths.length
  }, null, 2));

  state.running = false;
}

function start() {
  if (state.started) return;
  state.started = true;
  return run().catch(err => {
    warn("run:error", err.message);
    state.running = false;
    throw err;
  });
}

function stop() {
  state.running = false;
}

module.exports = { start, stop, state };
