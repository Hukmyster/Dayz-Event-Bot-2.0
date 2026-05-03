const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";
const WEBHOOK_URL = process.env.EVENTFEED_WEBHOOK_URL || "";
const LOOP_MS = 5 * 60 * 1000;
const EVENTFEED_DEBUG = String(process.env.EVENTFEED_DEBUG || "false").toLowerCase() === "true";

const MAX_FILES = 5;

const TRIGGERS = {
  "lootmax 1": { type: "Crate", location: "NEAF", coords: "12326.443 141.268 12445.012" },
  "lootmax 2": { type: "Crate", location: "SWAF", coords: "5049.104 10.768 2440.176" },
  "lootmax 3": { type: "Crate", location: "NWAF", coords: "4704.286 340.096 9823.721" },

  "lootmax 4": { type: "Horde", location: "Cherno West", coords: "6561.959 2461.536" },
  "lootmax 5": { type: "Horde", location: "Cherno East", coords: "7624.959 3225.536" },
  "lootmax 6": { type: "Horde", location: "Berezino West", coords: "12275.959 9574.536" },
  "lootmax 7": { type: "Horde", location: "Berezino East", coords: "12840.959 9812.536" },
  "lootmax 8": { type: "Horde", location: "Electro", coords: "10489.959 2341.536" },
  "lootmax 9": { type: "Horde", location: "Svet", coords: "13946.959 13236.536" },
  "lootmax 10": { type: "Horde", location: "Novo", coords: "11495.959 14337.536" },
  "lootmax 11": { type: "Horde", location: "Sevrograd", coords: "7730.959 12587.536" },
  "lootmax 12": { type: "Horde", location: "Novoya", coords: "3455.959 13057.536" },
  "lootmax 13": { type: "Horde", location: "Lopatino", coords: "2770.959 9938.536" },
  "lootmax 14": { type: "Horde", location: "Pustoshka", coords: "3054.959 7865.536" },
  "lootmax 15": { type: "Horde", location: "Pavlovo", coords: "1726.959 3871.536" },

  "lootmax 16": { type: "AirDrop", location: "VMC", coords: "4293.901 314.482 8319.655" },
  "lootmax 17": { type: "AirDrop", location: "Altar", coords: "8164.277 474.996 9092.780" },
  "lootmax 18": { type: "AirDrop", location: "MB Kamensk", coords: "7999.17 341.301 14633.3" },
  "lootmax 19": { type: "AirDrop", location: "Tisy", coords: "1647.59 452.303 14007.204" },
  "lootmax 20": { type: "AirDrop", location: "NWAF", coords: "4166.85 339.750 10741.5" },
  "lootmax 21": { type: "AirDrop", location: "NEAF", coords: "12383 141.924 12410" },
  "lootmax 22": { type: "AirDrop", location: "Balota", coords: "5013.265 10.456 2472.806" },
  "lootmax 23": { type: "AirDrop", location: "Pavlovo", coords: "2075.365 110.525 3502.136" },
  "lootmax 24": { type: "AirDrop", location: "Green Mountain", coords: "3703.102 402.9561 5993.007" },
  "lootmax 25": { type: "AirDrop", location: "Myshkino West Tents", coords: "1160.616 186.296 7252.222" }
};

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  fileState: new Map(),
  sentEventIds: new Set()
};

function dbg(tag, data) {
  if (!EVENTFEED_DEBUG) return;
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[eventfeed][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function normalizePath(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function buildMessage(triggerKey) {
  const entry = TRIGGERS[triggerKey];
  if (!entry) return null;
  return `A ${entry.type} has been spotted in ${entry.location} ${entry.coords} get there quick before you miss out!`;
}

function parseTrigger(line) {
  const m = line.match(/\blootmax\s*(?:[1-9]|1[0-9]|2[0-5])\b/i);
  if (!m) return null;
  const key = `lootmax ${m[0].match(/\d+/)[0]}`;
  return key.toLowerCase();
}

function parseEventLine(line) {
  const triggerKey = parseTrigger(line);
  if (!triggerKey) return null;

  const trigger = TRIGGERS[triggerKey];
  if (!trigger) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  return {
    time: timeMatch ? timeMatch[1] : "unknown",
    trigger: triggerKey,
    triggerLabel: `lootmax ${triggerKey.split(" ")[1]}`,
    type: trigger.type,
    location: trigger.location,
    coords: trigger.coords,
    message: buildMessage(triggerKey),
    raw: line
  };
}

function buildEventId(fileName, evt) {
  return [fileName, evt.time, evt.trigger, evt.message, evt.raw].join("|");
}

function formatEmbed(evt) {
  return {
    title: "📡 EVENT DETECTED",
    color: evt.type === "AirDrop" ? 0x9b59b6 : evt.type === "Horde" ? 0xe67e22 : 0x3498db,
    fields: [
      { name: "Trigger", value: evt.triggerLabel || evt.trigger || "unknown", inline: true },
      { name: "Type", value: evt.type || "unknown", inline: true },
      { name: "Location", value: evt.location || "unknown", inline: true },
      { name: "Coords", value: evt.coords || "unknown", inline: false },
      { name: "Message", value: evt.message || "Unknown", inline: false }
    ]
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
    if (!/\.rpt$/i.test(filename)) continue;

    list.push({
      filename,
      sortKey: parseLogTimestamp(filename),
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
  const startIndex = current.lineCount >= previous.lineCount && previous.lineCount > 0 ? previous.lineCount : 0;
  const events = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    const evt = parseEventLine(line);
    if (!evt) continue;

    const id = buildEventId(remotePath.split("/").pop() || remotePath, evt);
    const duplicate = state.sentEventIds.has(id);

    dbg("MATCH", { file: remotePath, line, parsed: evt, duplicate });

    if (duplicate) continue;
    state.sentEventIds.add(id);
    events.push(evt);
  }

  state.fileState.set(remotePath, {
    lineCount: current.lineCount,
    lastLine: current.lastLine
  });

  return events;
}

async function loopOnce() {
  dbg("loop:start", { loopMs: LOOP_MS });
  if (state.running) {
    dbg("loop:end", { skipped: true });
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
        if (EVENTFEED_DEBUG) {
          console.log("[EVENTFEED][READ_ERROR]", JSON.stringify({
            file: remotePath,
            error: err?.message || String(err)
          }));
        }
      }
    }

    dbg("new:events", { count: newEvents });
  } finally {
    state.running = false;
    dbg("loop:end", {});
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
