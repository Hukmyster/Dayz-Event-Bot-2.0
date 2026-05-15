const { getFiles, start: startServerState } = require("../serverstate");

const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL || "";
const DEBUG_ENABLED = String(process.env.RAID_DEBUG || "false").toLowerCase() === "true";
const CHUNK_SIZE = 1800;

const state = {
  started: false,
  running: false,
  startedAt: new Date().toISOString(),
  fileState: new Map(),
  sentEventIds: new Set(),
  collected: [],
  emittedOnce: false
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

function getLineKind(line) {
  const s = String(line || "").toLowerCase();
  if (!s) return null;
  if (s.includes("killed by") || s.includes("committed suicide") || s.includes("died.")) return "death";
  if (s.includes("hit by explosion") || s.includes("explosion")) return "explosion";
  if (s.includes("hit by")) return "hit";
  if (s.includes("built ") || s.includes("placed ") || s.includes("dismantled ") || s.includes("destroyed ")) return "base_action";
  if (s.includes("is unconscious") || s.includes("regained consciousness")) return "consciousness";
  if (s.includes("connecting") || s.includes("connected") || s.includes("disconnected")) return "connection";
  if (s.includes("playerlist log")) return "playerlist";
  return "other";
}

function signatureOf(line) {
  const s = normalizeLine(line)
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d{3})?\b/g, "<time>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<num>")
    .replace(/pos=<[^>]+>/gi, "pos=<coords>")
    .replace(/id=[^)]+\)/gi, "id=<player>)")
    .replace(/"[^"]+"/g, '"<name>"');

  return `${getLineKind(line)}|${s}`;
}

function parseLine(line, filePath) {
  const normalized = normalizeLine(line);
  if (!normalized) return null;
  return {
    kind: getLineKind(normalized),
    signature: signatureOf(normalized),
    file: filePath,
    line: normalized,
    raw: normalized
  };
}

function buildEventId(fileName, evt) {
  return [fileName, evt.signature, evt.raw].join("|");
}

function parseFile(file) {
  const lines = String(file.content || "")
    .split(/\r?\n/)
    .filter((l, i, a) => !(i === a.length - 1 && l === ""));

  const events = [];

  for (const line of lines) {
    const evt = parseLine(line, file.path);
    if (!evt) continue;

    const id = buildEventId(file.path.split("/").pop() || file.path, evt);
    if (state.sentEventIds.has(id)) continue;

    state.sentEventIds.add(id);

    if (!state.collected.some(x => x.signature === evt.signature)) {
      state.collected.push({
        kind: evt.kind,
        signature: evt.signature,
        file: file.path,
        line: evt.raw
      });
    }

    events.push(evt);
  }

  state.fileState.set(file.path, {
    lineCount: lines.length,
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  });

  dbg("EVENTS_FOUND", { file: file.path, count: events.length });
  return events;
}

function formatCollectedText() {
  const grouped = new Map();

  for (const item of state.collected) {
    if (!grouped.has(item.kind)) grouped.set(item.kind, []);
    grouped.get(item.kind).push(item);
  }

  const lines = [];
  lines.push(`Raid sweep complete.`);
  lines.push(`Unique layouts: ${state.collected.length}`);
  lines.push(`Files scanned: ${state.fileState.size}`);
  lines.push("");

  for (const [kind, items] of grouped.entries()) {
    lines.push(`## ${kind.toUpperCase()} (${items.length})`);
    for (const item of items) {
      lines.push(`- [${item.file}] ${item.line}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function chunkText(text, size = CHUNK_SIZE) {
  const out = [];
  let buf = "";

  for (const line of String(text || "").split(/\r?\n/)) {
    const candidate = buf ? `${buf}\n${line}` : line;
    if (candidate.length > size && buf) {
      out.push(buf);
      buf = line;
    } else {
      buf = candidate;
    }
  }

  if (buf) out.push(buf);
  return out;
}

async function postWebhook(content) {
  if (!ADMIN_WEBHOOK_URL) {
    dbg("WEBHOOK_SKIP", { reason: "missing ADMIN_WEBHOOK_URL" });
    return;
  }

  const chunks = chunkText(content, CHUNK_SIZE);
  for (const chunk of chunks) {
    const res = await fetch(ADMIN_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 250)}`);
    }
  }
}

async function runOnce() {
  if (state.emittedOnce) return;
  state.running = true;

  try {
    const files = getFiles();
    let total = 0;

    for (const file of files) {
      if (!/\.adm$/i.test(file.path || "")) continue;
      const events = parseFile(file);
      total += events.length;
    }

    dbg("run:done", { total, unique: state.collected.length });

    state.emittedOnce = true;
    await postWebhook(formatCollectedText());
    dbg("WEBHOOK_SENT", { unique: state.collected.length });
  } finally {
    state.running = false;
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  startServerState();
  runOnce().catch(err => dbg("START_ERROR", { error: err?.message || String(err) }));
}

function stop() {
  state.running = false;
  state.started = false;
}

function getRaidState() {
  return {
    collected: [...state.collected],
    fileState: [...state.fileState.entries()]
  };
}

module.exports = { start, stop, state, getRaidState };
