const fs = require("fs");
const path = require("path");

const DEBUG_FILE = path.join(__dirname, "../logs/debug-trace.log");

function ensureDebugFile() {
  const dir = path.dirname(DEBUG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  return new Date().toISOString();
}

function line(level, label, data) {
  ensureDebugFile();
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const out = `[${stamp()}] [${level}] [${label}] ${payload}
`;
  fs.appendFileSync(DEBUG_FILE, out);
  console.log(`[${level}] [${label}]`, data);
}

function start(command, meta = {}) {
  line("DEBUG", command, { step: "start", ...meta });
}

function step(command, meta = {}) {
  line("DEBUG", command, meta);
}

function ok(command, meta = {}) {
  line("OK", command, meta);
}

function fail(command, err, meta = {}) {
  line("FAIL", command, { ...meta, error: err?.stack || err?.message || String(err) });
}

function reply(command, meta = {}) {
  line("REPLY", command, meta);
}

module.exports = {
  start,
  step,
  ok,
  fail,
  reply
};
