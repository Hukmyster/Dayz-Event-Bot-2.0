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

// === CORE DEBUG FUNCTIONS (KEEPING) ===
function start(command, meta = {}) {
  write("DEBUG", command, {
    step: "start",
    ...meta,
    pid: process.pid,
    cwd: process.cwd(),
    shopDebug: SHOP_DEBUG
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

// === NEW DIAGNOSTIC FUNCTIONS ===
function deadEnd(command, interaction = null, meta = {}) {
  const trace = {
    command: interaction?.commandName,
    user: interaction?.user?.tag,
    customId: interaction?.customId,
    interactionType: interaction?.type,
    replied: interaction?.replied,
    deferred: interaction?.deferred,
    file: __filename,
    ...meta
  };
  write("DEAD-END", command, trace);
}

function pathCheck(filePath, expected = null) {
  const result = {
    filePath,
    exists: fs.existsSync(filePath),
    expected,
    basename: path.basename(filePath),
    containsSupabase: filePath.toLowerCase().includes('supabase'),
    containsDb: filePath.toLowerCase().includes('db'),
    isCommandsAdmin: filePath.includes('commands/admin'),
    isToggle: filePath.includes('toggle') || filePath.includes('createtoggle')
  };
  write("PATH-CHECK", path.basename(filePath), result);
  return result;
}

function flagIssue(command, issue, details = {}) {
  write("ISSUE-FLAG", command, { issue, details });
}

// === SHOP DEBUG (KEEPING) ===
function debug(command, meta = {}) {
  if (!SHOP_DEBUG) return;
  write("DEBUG", command, meta);
}

// === GLOBAL ERROR HANDLERS (KEEPING) ===
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

init();

module.exports = {
  start,
  step,
  ok,
  fail,
  reply,
  deadEnd,        // NEW: traces dead ends
  pathCheck,      // NEW: file path validation
  flagIssue,      // NEW: flags issues
  debug,
  init,
  SHOP_DEBUG
};
