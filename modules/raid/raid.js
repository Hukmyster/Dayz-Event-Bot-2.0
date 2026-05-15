const { getFiles, start: startServerState } = require("../serverstate");

const LOOP_MS = Number(process.env.RAID_INTERNAL_MS || 30000);
const DEBUG_ENABLED = String(process.env.RAID_DEBUG || "false").toLowerCase() === "true";

const state = {
  started: false,
  timer: null,
  running: false,
  startedAt: new Date().toISOString(),
  username: "",
  fileState: new Map(),
  sentEventIds: new Set(),
  raidActive: false,
  lastRaidEventAt: null,
  raidEvents: []
};

function dbg(tag, data) {
  if (!DEBUG_ENABLED) return;
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? JSON.stringify(data) : "";
  console.log(`[raid][${ts}][${tag}]${dataStr ? " " + dataStr : ""}`);
}

function normalizeLine(line) {
  return String(line || "").replace(/\r$/, "").trim();
}

function parseTime(line) {
  const m = line.match(/^([0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?)\s*\|/);
  return m ? m[1] : "unknown";
}

function parsePlayerName(line) {
  const m = line.match(/Player\s+"([^"]+)"/i);
  return m ? m[1] : "";
}

function parsePlayerId(line) {
  const m = line.match(/\(id=([^)]+)\)/i);
  return m ? m[1] : "";
}

function parsePos(line) {
  const m = line.match(/pos=<([^>]+)>/i);
  return m ? m[1] : "";
}

function buildEventId(fileName, line, kind) {
  return [fileName, kind, line].join("|");
}

function classifyLine(line) {
  const lower = line.toLowerCase();

  if (!line) return null;

  if (lower.includes("hit by explosion")) {
    return {
      kind: "explosion_hit",
      trigger: "hit by explosion",
      raid: true
    };
  }

  if (lower.includes("hit by")) {
    return {
      kind: "player_hit",
      trigger: "hit by",
      raid: true
    };
  }

  if (lower.includes("placed ")) {
    return {
      kind: "placement",
      trigger: "placed",
      raid: true
    };
  }

  if (lower.includes("built ") || lower.includes("dismantled ") || lower.includes("destroyed ")) {
    return {
      kind: "base_action",
      trigger: "base action",
      raid: true
    };
  }

  if (lower.includes("landmine") || lower.includes("grenade") || lower.includes("explosion")) {
    return {
      kind: "explosive",
      trigger: "explosive",
      raid: true
    };
  }

  return null;
}

function parseRaidLine(line) {
  const base = classifyLine(line);
  if (!base) return null;

  return {
    time: parseTime(line),
    player: parsePlayerName(line),
    playerId: parsePlayerId(line),
    pos: parsePos(line),
    kind: base.kind,
    trigger: base.trigger,
    raid: base.raid,
    raw: line
  };
}

function recordRaidEvent(evt) {
  state.raidActive = true;
  state.lastRaidEventAt = new Date().toISOString();
  state.raidEvents.push(evt);
  if (state.raidEvents.length > 200) state.raidEvents.shift();
}

function parseFile(file) {
  const lines = String(file.content || "")
    .split(/\r?\n/)
    .filter((l, i, a) => !(i === a.length - 1 && l === ""));

  const previous = state.fileState.get(file.path) || { lineCount: 0, lastLine: "" };
  const current = {
    lineCount: lines.length,
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };

  const startIndex = current.lineCount >= previous.lineCount && previous.lineCount > 0 ? previous.lineCount : 0;
  const events = [];

  dbg("FILE_STATE", { file: file.path, previous, current, startIndex });

  for (let i = startIndex; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    const evt = parseRaidLine(line);
    if (!evt) continue;

    const id = buildEventId(file.path.split("/").pop() || file.path, line, evt.kind);
    if (state.sentEventIds.has(id)) continue;

    state.sentEventIds.add(id);
    events.push(evt);
  }

  state.fileState.set(file.path, current);
  return events;
}

async function loopOnce() {
  if (state.running) return;
  state.running = true;

  try {
    const files = getFiles();
    let total = 0;

    for (const file of files) {
      if (!/\.adm$/i.test(file.path || "")) continue;
      const events = parseFile(file);

      for (const evt of events) {
        total++;
        recordRaidEvent(evt);
        dbg("RAID_HIT", { file: file.path, evt });
      }
    }

    dbg("loop:done", { total, raidActive: state.raidActive, lastRaidEventAt: state.lastRaidEventAt });
  } finally {
    state.running = false;
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

function getRaidState() {
  return {
    raidActive: state.raidActive,
    lastRaidEventAt: state.lastRaidEventAt,
    raidEvents: [...state.raidEvents]
  };
}

module.exports = { start, stop, state, getRaidState };
