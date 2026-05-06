const fs = require("fs");
const path = require("path");

const DEBUG_FILE = path.join(__dirname, "../logs/debug-trace.log");
const VERBOSE = true;
const SHOP_DEBUG = String(process.env.SHOP_DEBUG || "false").toLowerCase() === "true";

let initialized = false;
let globalHandlersInstalled = false;

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
  if (level === "FAIL" || level === "ERROR" || level === "FATAL") console.error(prefix, data);
  else console.log(prefix, data);
}

function processErrorPayload(err) {
  return {
    error: err?.stack || err?.message || String(err),
    name: err?.name,
    code: err?.code,
    details: err?.details,
    hint: err?.hint
  };
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
      hasGuildId: !!process.env.GUILD_ID,
      shopDebug: SHOP_DEBUG
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
  write("FAIL", command, { ...meta, ...processErrorPayload(err) });
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
    ...processErrorPayload(err)
  });
}

function debug(command, meta = {}) {
  if (!SHOP_DEBUG) return;
  write("DEBUG", command, meta);
}

function installGlobalHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  process.on("unhandledRejection", (reason, promise) => {
    write("FATAL", "unhandledRejection", {
      promise: String(promise),
      ...processErrorPayload(reason)
    });
  });

  process.on("uncaughtException", (err) => {
    write("FATAL", "uncaughtException", {
      ...processErrorPayload(err)
    });
  });

  process.on("warning", (warning) => {
    write("WARN", "processWarning", {
      ...processErrorPayload(warning)
    });
  });
}

function init() {
  if (initialized) return;
  initialized = true;
  installGlobalHandlers();
  write("OK", "debug", { message: "debug logger initialized", shopDebug: SHOP_DEBUG });
}

function initGlobal() {
  installGlobalHandlers();
}

init();

module.exports = {
  start,
  step,
  ok,
  fail,
  reply,
  supabase,
  supabaseError,
  debug,
  init,
  initGlobal,
  SHOP_DEBUG
};
