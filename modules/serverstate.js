const fs = require("fs");
const path = require("path");
const debug = require("../utils/debug");

const LOG_DIR = process.env.DAYZ_LOG_DIR || path.join(__dirname, "../logs");
const RPT_FILES = [".rpt", ".RPT"];
const ADM_FILES = [".adm", ".ADM"];
const PLAYERLIST_FILES = [".log", ".txt"];

let cache = {
  lastScanAt: null,
  files: {},
  capabilities: {
    rpt: false,
    adm: false,
    playerList: false,
    positions: false,
    connections: false,
    disconnects: false,
    adminEvents: false
  },
  players: [],
  recentEvents: [],
  raw: {}
};

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function safeListDir(dir) {
  try {
    return fs.readdirSync(dir).map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

function pickFiles() {
  const all = safeListDir(LOG_DIR);
  const rpt = all.filter(f => RPT_FILES.some(ext => f.endsWith(ext)));
  const adm = all.filter(f => ADM_FILES.some(ext => f.endsWith(ext)));
  const playerList = all.filter(f => /player|players|online|pos|position/i.test(path.basename(f)));
  return {
    rpt: rpt.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null,
    adm: adm.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null,
    playerList: playerList.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null
  };
}

function parseTimestampFromLine(line) {
  const m = line.match(/\b(\d{4})[-./](\d{2})[-./](\d{2})[ T](\d{2}):(\d{2}):(\d{2})\b/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function parsePlayerList(text) {
  const players = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const ts = parseTimestampFromLine(line);
    const name = line.match(/(?:player|name)[:=]\s*([^|,]+?)(?:\s*[|,]|$)/i)?.[1]?.trim();
    const x = line.match(/\bX[:=]\s*(-?\d+(?:\.\d+)?)\b/i)?.[1];
    const y = line.match(/\bY[:=]\s*(-?\d+(?:\.\d+)?)\b/i)?.[1];
    const z = line.match(/\bZ[:=]\s*(-?\d+(?:\.\d+)?)\b/i)?.[1];
    if (!name && !x && !y && !z) continue;
    players.push({
      name: name || null,
      timestamp: ts,
      location_x: x != null ? Number(x) : null,
      location_y: y != null ? Number(y) : null,
      location_z: z != null ? Number(z) : null,
      raw: line
    });
  }
  return players;
}

function parseRpt(text) {
  const events = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const ts = parseTimestampFromLine(line);
    if (/connected|login|join/i.test(line)) events.push({ type: "connect", timestamp: ts, raw: line });
    else if (/disconnected|logout|leave/i.test(line)) events.push({ type: "disconnect", timestamp: ts, raw: line });
  }
  return events;
}

function parseAdm(text) {
  const events = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const ts = parseTimestampFromLine(line);
    if (/admin|build|base|destroy|construction|placed/i.test(line)) events.push({ type: "admin", timestamp: ts, raw: line });
  }
  return events;
}

function refresh() {
  const files = pickFiles();
  const out = {
    lastScanAt: new Date().toISOString(),
    files: { ...files },
    capabilities: {
      rpt: !!files.rpt,
      adm: !!files.adm,
      playerList: !!files.playerList,
      positions: false,
      connections: false,
      disconnects: false,
      adminEvents: false
    },
    players: [],
    recentEvents: [],
    raw: {}
  };

  if (files.rpt && exists(files.rpt)) {
    const rptText = readText(files.rpt);
    out.raw.rpt = rptText;
    const rptEvents = parseRpt(rptText);
    out.recentEvents.push(...rptEvents);
    out.capabilities.connections = rptEvents.some(e => e.type === "connect");
    out.capabilities.disconnects = rptEvents.some(e => e.type === "disconnect");
  }

  if (files.adm && exists(files.adm)) {
    const admText = readText(files.adm);
    out.raw.adm = admText;
    const admEvents = parseAdm(admText);
    out.recentEvents.push(...admEvents);
    out.capabilities.adminEvents = admEvents.length > 0;
  }

  if (files.playerList && exists(files.playerList)) {
    const pText = readText(files.playerList);
    out.raw.playerList = pText;
    const players = parsePlayerList(pText);
    out.players = players;
    out.capabilities.positions = players.some(p => p.location_x != null && p.location_z != null);
  }

  out.recentEvents = out.recentEvents
    .filter(e => e.timestamp != null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 200);

  cache = out;
  debug.step("serverstate.refresh", {
    files: out.files,
    capabilities: out.capabilities,
    players: out.players.length,
    events: out.recentEvents.length
  });
  return out;
}

function getState() {
  return cache;
}

function getPlayers() {
  return cache.players || [];
}

function getPlayerByName(name) {
  const n = String(name || "").toLowerCase();
  return getPlayers().find(p => String(p.name || "").toLowerCase() === n) || null;
}

function getLastKnownLocation(name) {
  const p = getPlayerByName(name);
  if (!p) return null;
  return {
    name: p.name,
    x: p.location_x,
    y: p.location_y,
    z: p.location_z,
    timestamp: p.timestamp
  };
}

function getCapabilityReport() {
  return {
    logDir: LOG_DIR,
    files: cache.files,
    capabilities: cache.capabilities,
    lastScanAt: cache.lastScanAt,
    playersFound: (cache.players || []).length,
    eventsFound: (cache.recentEvents || []).length
  };
}

function init() {
  try {
    refresh();
  } catch (err) {
    debug.fail("serverstate.init", err, { logDir: LOG_DIR });
  }
}

init();

module.exports = {
  refresh,
  getState,
  getPlayers,
  getPlayerByName,
  getLastKnownLocation,
  getCapabilityReport
};
