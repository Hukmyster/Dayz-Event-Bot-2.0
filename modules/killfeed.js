const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const WEBHOOK_URL = process.env.KILLFEED_WEBHOOK_URL || "";
const LOOP_MS = Number(process.env.KILLFEED_INTERNAL_MS || 30000);

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  seenFiles: new Set(),
  fileMeta: new Map(),
  seenEvents: new Set()
};

function logLoop(tag, data) {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[killfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
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

function parseKillLine(line) {
  if (!line.includes("killed by")) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  const victimMatch = line.match(/Player\s+"([^"]*)"\s+\(DEAD\)/i);
  const killerMatch = line.match(/killed by\s+Player\s+"([^"]*)"/i);
  const weaponMatch = line.match(/with\s+(.+?)\s+from\s+([0-9.]+)\s+meters/i);

  if (!killerMatch) return null;

  return {
    time: timeMatch ? timeMatch[1] : "unknown",
    victim: cleanVictim(victimMatch?.[1] || ""),
    killer: killerMatch[1] || "Unknown",
    weapon: weaponMatch?.[1]?.trim() || "Unknown",
    distance: weaponMatch?.[2] || "0",
    raw: line
  };
}

function formatDiscordMessage(evt) {
  return [
    "💀 KILL CONFIRMED",
    `Victim: ${evt.victim}`,
    `Killer: ${evt.killer}`,
    `Weapon: ${evt.weapon}`,
    `Distance: ${evt.distance}m`,
    `Time: ${evt.time}`
  ].join("\n");
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

function collectCandidates(serverJson) {
  const gs = serverJson?.data?.gameserver || {};
  const username = gs?.username || "";
  const files = gs?.game_specific?.log_files || [];
  const paths = [];

  for (const item of Array.isArray(files) ? files : []) {
    const raw = typeof item === "string" ? item : (item?.path || item?.file || item?.name || item?.filename || "");
    const base = String(raw || "").trim();
    if (!base) continue;
    const filename = base.split("/").pop();
    paths.push(`/games/${username}/noftp/dayzps/config/${filename}`);
    paths.push(`/games/${username}/noftp/${base.replace(/^\/+/, "")}`);
    paths.push(base);
  }

  return { username, paths: [...new Set(paths.map(normalizePath))] };
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
  const previous = state.fileMeta.get(remotePath) || { lineCount: 0, firstLine: "", lastLine: "" };
  const rotated = previous.lineCount > current.lineCount && current.lineCount > 0;
  const reset = rotated || (previous.lastLine && current.firstLine && previous.lastLine !== current.firstLine && current.lineCount <= previous.lineCount);

  const lines = content.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const startIndex = !reset && current.lineCount >= previous.lineCount ? previous.lineCount : 0;
  const events = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line || !line.includes("killed by")) continue;
    const evt = parseKillLine(line);
    if (!evt) continue;
    const key = `${remotePath}|${evt.raw}`;
    if (state.seenEvents.has(key)) continue;
    state.seenEvents.add(key);
    events.push(evt);
  }

  state.fileMeta.set(remotePath, current);
  return events;
}

async function postWebhook(evt) {
  if (!WEBHOOK_URL) return;
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: formatDiscordMessage(evt) })
  });
}

async function loopOnce() {
  logLoop("loop:start", { startedAt: state.startedAt, loopMs: LOOP_MS });
  if (state.running) {
    logLoop("loop:end", { skipped: true });
    return;
  }

  state.running = true;
  try {
    const serverJson = await fetchServerInfo();
    const { username, paths } = collectCandidates(serverJson);
    state.username = username;

    const newFiles = [];
    for (const p of paths) {
      if (!state.seenFiles.has(p)) {
        state.seenFiles.add(p);
        newFiles.push(p);
      }
    }
    logLoop("new:files", { count: newFiles.length });

    let newEvents = 0;
    const allTargets = [...new Set([...newFiles, ...paths])];

    for (const remotePath of allTargets) {
      try {
        const result = await readRemoteFile(remotePath, username);
        const events = processFile(remotePath, result.content);
        for (const evt of events) {
          newEvents++;
          await postWebhook(evt);
        }
      } catch {}
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
