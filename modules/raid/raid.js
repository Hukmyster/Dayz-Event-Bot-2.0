const fs = require("fs");
const path = require("path");
const raidstate = require("./raidstate");

const CHUNK_SIZE = 1800;
const WAIT_MS = 120000;

const TRIGGERS = [
  { type: "damage", test: /hit by Player/i },
  { type: "death", test: /killed by Player/i },
  { type: "connection", test: /\bis connecting\b/i },
  { type: "connection", test: /\bis connected\b/i },
  { type: "disconnect", test: /\bhas been disconnected\b/i },
  { type: "playerlist", test: /PlayerList log:/i },
  { type: "placement", test: /\bplaced\b/i },
  { type: "construction", test: /\bbuilt\b/i },
  { type: "destruction", test: /\bdismantled\b/i },
  { type: "destruction", test: /\bdestroyed\b/i },
  { type: "raid_setup", test: /\bClaymore\b|\bImprovisedExplosive\b|\bLandMineTrap\b/i }
];

const state = {
  started: false,
  running: false,
  startedAt: new Date().toISOString(),
  emittedOnce: false,
  lastSummary: null
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

function classifyLine(line) {
  for (const trig of TRIGGERS) {
    if (trig.test.test(line)) return trig.type;
  }
  return null;
}

function parseFileContent(content, filePath) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .filter((l, i, a) => !(i === a.length - 1 && l === ""));

  const matched = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) continue;

    const type = classifyLine(line);
    if (!type) continue;

    const id = `${filePath}|${type}|${line}`;
    if (seen.has(id)) continue;
    seen.add(id);

    matched.push({
      file: filePath,
      type,
      line,
      raw: line
    });
  }

  return matched;
}

function scanAdmFiles(filePaths) {
  const results = [];

  for (const filePath of filePaths) {
    if (!/\.adm$/i.test(filePath)) continue;
    log("FILE_SCAN_START", { filePath });

    if (!fs.existsSync(filePath)) {
      log("FILE_MISSING", { filePath });
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const matches = parseFileContent(content, filePath);

    log("FILE_SCAN_DONE", { filePath, matches: matches.length });
    results.push(...matches);
  }

  return results;
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

async function postDiscord(content) {
  const url = process.env.ADMIN_WEBHOOK_URL || "";
  if (!url) {
    log("WEBHOOK_MISSING", {});
    return false;
  }

  const chunks = chunkText(content);
  log("WEBHOOK_CHUNKS", { chunks: chunks.length });

  for (const chunk of chunks) {
    const res = await fetch(url, {
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

function formatMatches(matches) {
  const grouped = new Map();

  for (const item of matches) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    grouped.get(item.type).push(item);
  }

  const out = [];
  out.push("Raid trigger scan complete.");
  out.push(`Matches: ${matches.length}`);
  out.push("");

  for (const [type, items] of grouped.entries()) {
    out.push(`## ${type.toUpperCase()} (${items.length})`);
    for (const item of items) out.push(`- [${item.file}] ${item.line}`);
    out.push("");
  }

  return out.join("\n").trim();
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
    log("RUN_START", { startedAt: state.startedAt });
    log("DELAY_START", { ms: WAIT_MS });
    await delay(WAIT_MS);
    log("DELAY_END", { ms: WAIT_MS });

    const uploaded = raidstate.getUploadedFiles();
    log("FILES_RECEIVED", { count: uploaded.length });

    if (!uploaded.length) {
      log("NO_FILES", {});
      return;
    }

    const matches = scanAdmFiles(uploaded);
    log("SCAN_DONE", { matches: matches.length });

    if (!matches.length) {
      log("NO_MATCHES", {});
      return;
    }

    raidstate.pushCandidates(matches);
    state.lastSummary = matches;

    const sent = await postDiscord(formatMatches(matches));
    if (sent) {
      state.emittedOnce = true;
      log("WEBHOOK_SENT", { matches: matches.length });
    }
  } catch (err) {
    log("RUN_ERROR", { error: err?.message || String(err) });
  } finally {
    state.running = false;
    log("RUN_END", {});
  }
}

function start() {
  if (state.started) return;
  state.started = true;
  log("MODULE_START", {});
  runOnce().catch(err => log("START_ERROR", { error: err?.message || String(err) }));
}

function stop() {
  state.started = false;
  state.running = false;
}

module.exports = { start, stop, state };
