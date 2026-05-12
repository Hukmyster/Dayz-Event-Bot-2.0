const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "../logs/debug.log");

function ensureLogFile() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeLog(type, data) {
  ensureLogFile();

  const time = new Date().toISOString();
  const line = `[${time}] [${type}] ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`;

  fs.appendFileSync(LOG_FILE, line);
  console.log(`[${type}]`, data);
}

module.exports = {
  log: (msg) => writeLog("INFO", msg),
  info: (msg) => writeLog("INFO", msg),
  warn: (msg) => writeLog("WARN", msg),
  error: (msg, err) => writeLog("ERROR", { msg, err: err?.stack || err }),
  interaction: (data) => writeLog("INTERACTION", data),
  shop: (data) => writeLog("SHOP", data)
};
