const { getFiles, start: startServerState } = require("./serverstate");

const WEBHOOK_URL = process.env.EVENTFEED_WEBHOOK_URL || "";
const LOOP_MS = 5 * 60 * 1000;
const EVENTFEED_DEBUG = String(process.env.EVENTFEED_DEBUG || "false").toLowerCase() === "true";

const MAX_FILES = 5;
const MAP_SIZE = 15360;

const TRIGGERS = {
  1: { type: "Crate", location: "NEAF", coords: "12326.443 141.268 12445.012" },
  2: { type: "Crate", location: "SWAF", coords: "5049.104 10.768 2440.176" },
  3: { type: "Crate", location: "NWAF", coords: "4704.286 340.096 9823.721" },

  4: { type: "Horde", location: "Cherno West", coords: "6561.959 2461.536" },
  5: { type: "Horde", location: "Cherno East", coords: "7624.959 3225.536" },
  6: { type: "Horde", location: "Berezino West", coords: "12275.959 9574.536" },
  7: { type: "Horde", location: "Berezino East", coords: "12840.959 9812.536" },
  8: { type: "Horde", location: "Electro", coords: "10489.959 2341.536" },
  9: { type: "Horde", location: "Svet", coords: "13946.959 13236.536" },
  10: { type: "Horde", location: "Novo", coords: "11495.959 14337.536" },
  11: { type: "Horde", location: "Sevrograd", coords: "7730.959 12587.536" },
  12: { type: "Horde", location: "Novoya", coords: "3455.959 13057.536" },
  13: { type: "Horde", location: "Lopatino", coords: "2770.959 9938.536" },
  14: { type: "Horde", location: "Pustoshka", coords: "3054.959 7865.536" },
  15: { type: "Horde", location: "Pavlovo", coords: "1726.959 3871.536" },

  16: { type: "AirDrop", location: "VMC", coords: "4293.901 314.482 8319.655" },
  17: { type: "AirDrop", location: "Altar", coords: "8164.277 474.996 9092.780" },
  18: { type: "AirDrop", location: "MB Kamensk", coords: "7999.17 341.301 14633.3" },
  19: { type: "AirDrop", location: "Tisy", coords: "1647.59 452.303 14007.204" },
  20: { type: "AirDrop", location: "NWAF", coords: "4166.85 339.750 10741.5" },
  21: { type: "AirDrop", location: "NEAF", coords: "12383 141.924 12410" },
  22: { type: "AirDrop", location: "Balota", coords: "5013.265 10.456 2472.806" },
  23: { type: "AirDrop", location: "Pavlovo", coords: "2075.365 110.525 3502.136" },
  24: { type: "AirDrop", location: "Green Mountain", coords: "3703.102 402.9561 5993.007" },
  25: { type: "AirDrop", location: "Myshkino West Tents", coords: "1160.616 186.296 7252.222" }
};

const TYPE_ICONS = {
  Crate: "📦",
  Horde: "🧟",
  AirDrop: "📦"
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

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function buildMessage(triggerNum) {
  const entry = TRIGGERS[triggerNum];
  if (!entry) return null;
  return `A ${entry.type} has been spotted in ${entry.location} get there quick before you miss out!`;
}

function parseTrigger(line) {
  const m = line.match(/lootmax:\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseEventLine(line) {
  const triggerNum = parseTrigger(line);
  if (!triggerNum || !TRIGGERS[triggerNum]) return null;

  const timeMatch = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)/);
  return {
    time: timeMatch ? timeMatch[1] : "unknown",
    trigger: `lootmax: ${triggerNum}`,
    triggerNum,
    type: TRIGGERS[triggerNum].type,
    location: TRIGGERS[triggerNum].location,
    coords: TRIGGERS[triggerNum].coords,
    message: buildMessage(triggerNum),
    raw: line
  };
}

function buildEventId(fileName, evt) {
  return [fileName, evt.time, evt.trigger, evt.message, evt.raw].join("|");
}

function parseDayzPoint(coords) {
  const parts = String(coords || "").trim().split(/\s+/).filter(Boolean).map(Number);
  if (parts.length < 2) return null;
  return { x: parts[0], y: parts.length >= 3 ? parts[2] : parts[1] };
}

function formatCoordsLink(coords) {
  const p = parseDayzPoint(coords);
  if (!p) return String(coords || "Unknown");

  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const url = `https://www.izurvive.com/chernarusplussatmap/#location=${x};${y};8`;
  return `[${x}, ${y}](${url})`;
}

function formatEmbed(evt) {
  return {
    title: `${TYPE_ICONS[evt.type] || "📡"} EVENT DETECTED`,
    color: evt.type === "AirDrop" ? 0x9b59b6 : evt.type === "Horde" ? 0xe67e22 : 0x3498db,
    description: evt.message || "Unknown",
    fields: [
      { name: "Type", value: evt.type || "Unknown", inline: true },
      { name: "Location", value: evt.location || "Unknown", inline: true },
      { name: "Coords", value: formatCoordsLink(evt.coords) || evt.coords || "Unknown", inline: false }
    ]
  };
}

async function postWebhook(evt) {
  if (!WEBHOOK_URL) {
    dbg("WEBHOOK_SKIP", { reason: "missing WEBHOOK_URL" });
    return;
  }

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [formatEmbed(evt)] })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 250)}`);
  }
}

function parseFileEvents(file) {
  const lines = String(file.content || "").split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const previous = state.fileState.get(file.path) || { lineCount: 0, lastLine: "" };
  const current = {
    lineCount: lines.length,
    firstLine: normalizeLine(lines[0] || ""),
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };
  const startIndex = current.lineCount >= previous.lineCount && previous.lineCount > 0 ? previous.lineCount : 0;
  const events = [];

  dbg("FILE_STATE", { remotePath: file.path, current, previous, startIndex });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    const evt = parseEventLine(line);
    if (!evt) continue;

    const id = buildEventId(file.path.split("/").pop() || file.path, evt);
    const duplicate = state.sentEventIds.has(id);

    dbg("MATCH", { file: file.path, line, parsed: evt, duplicate });

    if (duplicate) continue;
    state.sentEventIds.add(id);
    events.push(evt);
  }

  state.fileState.set(file.path, {
    lineCount: current.lineCount,
    lastLine: current.lastLine
  });

  dbg("EVENTS_FOUND", { remotePath: file.path, count: events.length });
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
    const files = getFiles();
    let newEvents = 0;

    for (const file of files) {
      if (!/\.rpt$/i.test(file.path || "")) continue;
      const events = parseFileEvents(file);
      for (const evt of events) {
        newEvents++;
        await postWebhook(evt);
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
  startServerState();
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
