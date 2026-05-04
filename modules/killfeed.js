const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const LOOP_MS = Number(process.env.KILLFEED_INTERNAL_MS || 30000);
const DEBUG_ENABLED = String(process.env.KILLFEED_DEBUG || "false").toLowerCase() === "true";

const EXPLOSIVE_KILLERS = new Set([
  "6-M7 Frag Grenade",
  "LandMineTrap",
  "Land Mine",
  "Grenade",
  "M67 Grenade"
]);

const MAX_FILES = 5;

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  fileState: new Map(),
  sentEventIds: new Set()
};

function logLoop(tag, data) {
  if (!DEBUG_ENABLED) return;
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function debugLog(tag, data) {
  if (!DEBUG_ENABLED) return;
  console.log(`[KILLFEED][${tag}]`, data);
}

function errorLog(tag, data) {
  console.log(`[KILLFEED][${tag}]`, data);
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\\\/g, "/").replace(/\\/+/g, "/");
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function cleanVictim(name) {
  const n = String(name || "").trim();
  return n ? n : "NPC";
}

function cleanKillerName(name) {
  const n = String(name || "").trim();
  return n ? n : "Unknown";
}

function isExplosiveKiller(killer) {
  return EXPLOSIVE_KILLERS.has(cleanKillerName(killer));
}

function extractLocation(line) {
  const m = line.match(/pos=<([^>]+)>/i);
  if (!m) return "";
  const parts = m[1].split(",").map(s => s.trim());
  if (parts.length < 2) return "";
  return `${parts[0]}, ${parts[1]}`;
}

function izurviveLinkFromLocation(location) {
  const parts = String(location || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (parts.length < 2) return location || "Unknown";

  const x = parts[0];
  const y = parts[1];
  const label = `${x}, ${y}`;
  return `[${label}](https://www.izurvive.com/chernarus/#location=${x};${y};5)`;
}

function parseKillLine(line) {
  if (!line.includes("killed by")) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)\s*\|\s*/);
  const victimMatch = line.match(/Player\s+"([^"]*)"\s+\(DEAD\)/i);

  const playerKillMatch = line.match(
    /killed by\s+Player\s+"([^"]*)"\s+\(id=.*?\)\s+with\s+(.+?)\s+from\s+([0-9.]+)\s+meters/i
  );

  const explosiveKillMatch = line.match(
    /killed by\s+(LandMineTrap|Land Mine|6-M7 Frag Grenade|Grenade|M67 Grenade)\s*$/i
  );

  const location = extractLocation(line);

  if (playerKillMatch) {
    const killer = cleanKillerName(playerKillMatch[1]);
    return {
      time: timeMatch ? timeMatch[1] : "unknown",
      victim: cleanVictim(victimMatch?.[1] || ""),
      killer,
      weapon: playerKillMatch[2].trim(),
      distance: playerKillMatch[3],
      location: "",
      explosive: isExplosiveKiller(killer),
      raw: line
    };
  }

  if (explosiveKillMatch) {
    const killer = cleanKillerName(explosiveKillMatch[1]);
    return {
      time: timeMatch ? timeMatch[1] : "unknown",
      victim: cleanVictim(victimMatch?.[1] || ""),
      killer,
      weapon: "",
      distance: "",
      location,
      explosive: true,
      raw: line
    };
  }

  return null;
}

function buildEventId(fileName, evt) {
  return [fileName, evt.time, evt.victim, evt.killer, evt.weapon, evt.distance, evt.location, evt.raw].join("|");
}

function formatEmbed(evt) {
  const fields = [
    { name: "Victim", value: evt.victim || "NPC", inline: true },
    { name: "Killer", value: evt.killer || "Unknown", inline: true }
  ];

  if (!evt.explosive) {
    fields.push({ name: "Weapon", value: evt.weapon || "Unknown", inline: true });
    fields.push({ name: "Distance", value: `${evt.distance || "0"}m`, inline: true });
  } else {
    if (evt.location) fields.push({ name: "Location", value: izurviveLinkFromLocation(evt.location), inline: true });
  }

  fields.push({ name: "Time", value: evt.time || "unknown", inline: true });

  return {
    title: "💀 KILL CONFIRMED",
    color: 0xc0392b,
    fields
  };
}

async function postWebhook(evt) {
  if (!WEBHOOK_URL) return;
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [formatEmbed(evt)] })
  });
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
  if (!res.ok) throw new Error(`Nitrado HTTP ${res.status}: ${text.slice(0, 250)}`);
  return JSON.parse(text);
}

async function fetchServerInfo() {
  return await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers`);
}

function parseLogTimestamp(filename) {
  const m = String(filename || "").match(/_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return 0;
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) || 0;
}

function collectCandidates(serverJson) {
  const gs = serverJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const list = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    const filename = base.split("/").pop();
    if (!/\.adm$/i.test(filename)) continue;

    const sortKey = parseLogTimestamp(filename);
    list.push({
      filename,
      sortKey,
      candidates: [
        `/games/${username}/noftp/dayzps/config/${filename}`,
        `/games/${username}/noftp/${base.replace(/^\/+/, "")}`,
        base
      ]
    });
  }

  list.sort((a, b) => b.sortKey - a.sortKey || a.filename.localeCompare(b.filename));
  const chosen = list.slice(0, MAX_FILES);

  return {
    username,
    paths: [...new Set(chosen.flatMap(x => x.candidates).map(normalizePath))]
  };
}

async function getDownloadToken(filePath) {
  const json = await nitradoRequest(`https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(filePath)}`);
  const tokenUrl = json?.data?.token?.url || null;
  const token = json?.data?.token?.token || null;
  return { tokenUrl, token };
}

async function fetchFile(tokenUrl, token) {
  const u = new URL(tokenUrl);
  if (token) u.searchParams.set("token", token);
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/octet-stream,*/*"
    }
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`Token fetch HTTP ${res.status}: ${text.slice(0, 250)}`);
  return text;
}

function candidateReadPaths(originalPath, username) {
  const filename = String(originalPath || "").split("/").pop();
  return [...new Set([
    `/games/${username}/noftp/dayzps/config/${filename}`,
    `/games/${username}/noftp/${filename}`,
    normalizePath(originalPath)
  ])];
}

async function readRemoteFile(remotePath, username) {
  const candidates = candidateReadPaths(remotePath, username);
  for (const candidate of candidates) {
    try {
      const { tokenUrl, token } = await getDownloadToken(candidate);
      if (!tokenUrl || !token) throw new Error("No token returned");
      const content = await fetchFile(tokenUrl, token);
      return { pathUsed: candidate, content };
    } catch {}
  }
  throw new Error(`All read attempts failed for ${remotePath}`);
}

function fingerprint(content) {
  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  return {
    lineCount: lines.length,
    firstLine: normalizeLine(lines[0] || ""),
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };
}

function processFile(remotePath, content) {
  const current = fingerprint(content);
  const previous = state.fileState.get(remotePath) || { lineCount: 0, lastLine: "" };

  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  let startIndex = 0;

  if (current.lineCount >= previous.lineCount && previous.lineCount > 0) {
    startIndex = previous.lineCount;
  }

  const events = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line.includes("killed by")) continue;

    const evt = parseKillLine(line);
    if (!evt) continue;

    const eventId = buildEventId(remotePath.split("/").pop() || remotePath, evt);
    const duplicate = state.sentEventIds.has(eventId);

    debugLog("MATCH", {
      file: remotePath,
      line,
      parsed: evt,
      duplicate
    });

    if (duplicate) continue;

    state.sentEventIds.add(eventId);
    events.push(evt);
  }

  state.fileState.set(remotePath, {
    lineCount: current.lineCount,
    lastLine: current.lastLine
  });

  return events;
}

async function loopOnce() {
  logLoop("loop:start", { loopMs: LOOP_MS });
  if (state.running) {
    logLoop("loop:end", { skipped: true });
    return;
  }

  state.running = true;
  try {
    const serverJson = await fetchServerInfo();
    const { username, paths } = collectCandidates(serverJson);
    state.username = username;

    let newEvents = 0;
    for (const remotePath of paths) {
      try {
        const result = await readRemoteFile(remotePath, username);
        const events = processFile(remotePath, result.content);
        for (const evt of events) {
          newEvents++;
          await postWebhook(evt);
        }
      } catch (err) {
        errorLog("READ_ERROR", {
          file: remotePath,
          error: err?.message || String(err)
        });
      }
    }

    logLoop("new:events", { count: newEvents });
  } finally {
    state.running = false;
    logLoop("loop:end", {});
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  loopOnce().catch(() => {});
  state.timer = setInterval(() => {
    loopOnce().catch(() => {});
  }, LOOP_MS);
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
  state.started = false;
}

module.exports = { start, stop, state };
