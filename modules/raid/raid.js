const { getFiles, start: startServerState } = require("../serverstate");

const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL || "";
const CHUNK_SIZE = 1800;
const INITIAL_DELAY_MS = 120000;

const state = {
  started: false,
  running: false,
  startedAt: new Date().toISOString(),
  fileState: new Map(),
  sentEventIds: new Set(),
  collected: [],
  emittedOnce: false
};

function log(tag, data) {
  const ts = new Date().toISOString();
  const payload = data !== undefined ? ` ${JSON.stringify(data)}` : "";
  console.log(`[RAID][${ts}][${tag}]${payload}`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  return normalizeLine(line)
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d{3})?\b/g, "<time>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<num>")
    .replace(/pos=<[^>]+>/gi, "pos=<coords>")
    .replace(/id=[^)]+\)/gi, "id=<player>)")
    .replace(/"[^"]+"/g, '"<name>"');
}

function parseLine(line, filePath) {
  const normalized = normalizeLine(line);
  if (!normalized) return null;
  const kind = getLineKind(normalized);
  return {
    kind,
    signature: `${kind}|${signatureOf(normalized)}`,
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

  const previous = state.fileState.get(file.path) || { lineCount: 0, lastLine: "" };
  const current = {
    lineCount: lines.length,
    lastLine: normalizeLine(lines[lines.length - 1] || "")
  };

  log("FILE_START", { file: file.path, lineCount: lines.length, previous, current });

  if (!lines.length) {
    log("FILE_EMPTY", { file: file.path });
    state.fileState.set(file.path, current);
    return [];
  }

  const events = [];

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeLine(lines[i]);
    if (!line) {
      log("LINE_EMPTY", { file: file.path, index: i });
      continue;
    }

    const evt = parseLine(line, file.path);
    if (!evt) {
      log("LINE_PARSE_NULL", { file: file.path, index: i });
      continue;
    }

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

  state.fileState.set(file.path, current);
  log("FILE_DONE", { file: file.path, count: events.length });
  return events;
}

function formatCollectedText() {
  const grouped = new Map();

  for (const item of state.collected) {
    if (!grouped.has(item.kind)) grouped.set(item.kind, []);
    grouped.get(item.kind).push(item);
  }

  const lines = [];
  lines.push("Raid sweep complete.");
  lines.push(`Unique layouts: ${state.collected.length}`);
  lines.push(`Files scanned: ${state.fileState.size}`);
  lines.push("");

  for (const [kind, items] of grouped.entries()) {
    lines.push(`## ${kind.toUpperCase()} (${items.length})`);
    for (const item of items) lines.push(`- [${item.file}] ${item.line}`);
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
    log("WEBHOOK_MISSING", { reason: "ADMIN_WEBHOOK_URL is empty" });
    return false;
  }

  const chunks = chunkText(content, CHUNK_SIZE);
  log("WEBHOOK_CHUNKS", { chunks: chunks.length });

  for (const chunk of chunks) {
    const res = await fetch(ADMIN_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log("WEBHOOK_FAIL", { status: res.status, body: text.slice(0, 250) });
      return false;
    }
  }

  return true;
}

async function runOnce() {
  if (state.emittedOnce) {
    log("SKIP", { reason: "already_emitted" });
    return;
  }

  if (state.running) {
    log("SKIP", { reason: "already_running" });
    return;
  }

  state.running = true;

  try {
    log("RUN_START", { startedAt: state.startedAt, webhook: Boolean(ADMIN_WEBHOOK_URL) });
    log("DELAY_START", { ms: INITIAL_DELAY_MS });
    await delay(INITIAL_DELAY_MS);
    log("DELAY_END", { ms: INITIAL_DELAY_MS });

    const files = getFiles();
    log("FILES_RECEIVED", { count: files.length, paths: files.map(f => f && f.path).filter(Boolean) });

    if (!files.length) {
      log("NO_FILES", { reason: "getFiles returned empty array" });
      return;
    }

    let total = 0;
    let matchedFiles = 0;

    for (const file of files) {
      if (!file || !file.path) {
        log("BAD_FILE", { file });
        continue;
      }

      if (!/\.adm$/i.test(file.path)) {
        log("SKIP_FILE", { file: file.path, reason: "not adm" });
        continue;
      }

      matchedFiles++;
      const events = parseFile(file);
      total += events.length;
    }

    log("RUN_DONE", { total, unique: state.collected.length, matchedFiles });

    if (!matchedFiles) {
      log("NO_MATCHED_FILES", { reason: "no adm files matched" });
      return;
    }

    if (!state.collected.length) {
      log("NO_COLLECTED", { reason: "parsed files but no unique lines collected" });
      return;
    }

    const sent = await postWebhook(formatCollectedText());
    if (sent) {
      state.emittedOnce = true;
      log("WEBHOOK_SENT", { unique: state.collected.length });
    }
  } catch (err) {
    log("RUN_ERROR", { error: err?.message || String(err), stack: err?.stack?.split("\n").slice(0, 3) });
  } finally {
    state.running = false;
    log("RUN_END", {});
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  log("MODULE_START", { webhook: Boolean(ADMIN_WEBHOOK_URL) });
  startServerState();
  runOnce().catch(err => log("START_ERROR", { error: err?.message || String(err) }));
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
