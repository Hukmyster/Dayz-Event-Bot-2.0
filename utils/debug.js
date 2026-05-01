const fs = require("fs");
const path = require("path");

const DEBUG_FILE = path.join(__dirname, "../logs/debug-trace.log");
const VERBOSE = true;

function ensureDebugFile() {
  const dir = path.dirname(DEBUG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  return new Date().toISOString();
}

function safeStringify(data) {
  try {
    return typeof data === "string" ? data : JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function write(level, label, data) {
  ensureDebugFile();
  const payload = safeStringify(data);
  const out = `[${stamp()}] [${level}] [${label}] ${payload}\n`;
  fs.appendFileSync(DEBUG_FILE, out);
  const prefix = `[${level}] [${label}]`;
  if (level === "FAIL" || level === "ERROR") console.error(prefix, data);
  else console.log(prefix, data);
}

function start(command, meta = {}) {
  write("DEBUG", command, {
    step: "start",
    ...meta,
    pid: process.pid,
    cwd: process.cwd(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_KEY,
      hasDiscordToken: !!process.env.DISCORD_TOKEN,
      hasGuildId: !!process.env.GUILD_ID
    }
  });
}

function step(command, meta = {}) {
  write("DEBUG", command, meta);
}

function ok(command, meta = {}) {
  write("OK", command, meta);
}

function fail(command, err, meta = {}) {
  write("FAIL", command, { ...meta, error: err?.stack || err?.message || String(err) });
}

function reply(command, meta = {}) {
  write("REPLY", command, meta);
}

function supabase(command, action, meta = {}) {
  write("SUPABASE", command, { action, ...meta });
}

function supabaseError(command, action, err, meta = {}) {
  write("SUPABASE_ERROR", command, {
    action,
    ...meta,
    error: err?.stack || err?.message || String(err),
    code: err?.code,
    details: err?.details,
    hint: err?.hint
  });
}

function init() {
  process.on("unhandledRejection", (err) => {
    write("ERROR", "unhandledRejection", { error: err?.stack || err?.message || String(err) });
  });
  process.on("uncaughtException", (err) => {
    write("ERROR", "uncaughtException", { error: err?.stack || err?.message || String(err) });
  });
  write("OK", "debug", { message: "debug logger initialized" });
}

init();

module.exports = {
  start,
  step,
  ok,
  fail,
  reply,
  supabase,
  supabaseError
};
