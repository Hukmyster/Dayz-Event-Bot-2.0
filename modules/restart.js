const fs = require("fs");
const path = require("path");
const { Client: FTPClient } = require("basic-ftp");
const debug = require("./utils/debug");
const { buildJsonFile } = require("./modules/shopSnippetBuilder");
const { loadJson, saveJson } = require("./services/storage");

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

const CUSTOM_DIR = path.join(__dirname, "custom");
const OUTPUT_FILE = path.join(CUSTOM_DIR, "shoppurchases.json");
const SNIPPET_KEY = "purchase_json_snippets";
const REMOTE_FILE = "dayzps_missions/dayzOffline.chernarusplus/custom/shoppurchases.json";

const TIMEZONE = "America/Los_Angeles";
const TARGET_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const EARLY_MINUTES = 2;
const SCHEDULE_MINUTE = 58;

let schedulerTimer = null;
let runLock = false;
let nextAutoRunAt = null;

function ensureOutputDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function getPartsInTZ(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimezoneOffsetMs(date, timeZone) {
  const parts = getPartsInTZ(date, timeZone);
  const utcFromParts = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return utcFromParts - date.getTime();
}

function zonedDateToUtc(year, month, day, hour, minute, second, timeZone) {
  const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimezoneOffsetMs(approx, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - offset);
}

function getNextRunAt(now = new Date()) {
  const parts = getPartsInTZ(now, TIMEZONE);
  const localMinutes = parts.minute;
  const localSeconds = parts.second;
  const currentHour = parts.hour;

  let targetHour = TARGET_HOURS.find(h => h > currentHour || (h === currentHour && (localMinutes < SCHEDULE_MINUTE || (localMinutes === SCHEDULE_MINUTE && localSeconds === 0)))) ?? TARGET_HOURS[0];
  let dayOffset = 0;

  if (targetHour === TARGET_HOURS[0] && currentHour >= TARGET_HOURS[TARGET_HOURS.length - 1]) {
    dayOffset = 1;
  } else if (targetHour < currentHour) {
    dayOffset = 1;
  }

  if (targetHour === currentHour && (localMinutes > SCHEDULE_MINUTE || (localMinutes === SCHEDULE_MINUTE && localSeconds > 0))) {
    const idx = TARGET_HOURS.indexOf(currentHour);
    if (idx === TARGET_HOURS.length - 1) {
      targetHour = TARGET_HOURS[0];
      dayOffset = 1;
    } else {
      targetHour = TARGET_HOURS[idx + 1];
    }
  }

  const base = getPartsInTZ(now, TIMEZONE);
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset, targetHour, SCHEDULE_MINUTE, 0));
  const offset = getTimezoneOffsetMs(date, TIMEZONE);
  return new Date(date.getTime() - offset);
}

async function fetchSnippets() {
  const data = await loadJson(SNIPPET_KEY);
  return Array.isArray(data) ? data : [];
}

function parseSnippet(row) {
  if (!row) return null;
  if (row.object_json && typeof row.object_json === "object") return row.object_json;
  if (typeof row.object_json === "string") {
    try {
      return JSON.parse(row.object_json);
    } catch {
      return null;
    }
  }
  return null;
}

function buildFinalJson(snippets) {
  const entries = snippets.map(parseSnippet).filter(Boolean);
  return buildJsonFile(entries.length ? entries : []);
}

async function writeFiles(jsonObject) {
  ensureOutputDir();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(jsonObject, null, 2), "utf8");
}

async function uploadToServer() {
  if (!FTP_HOST || !FTP_USER || !FTP_PASS) {
    throw new Error("Missing FTP_HOST, FTP_USER, or FTP_PASS");
  }

  const client = new FTPClient();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    await client.uploadFrom(OUTPUT_FILE, REMOTE_FILE);
  } finally {
    client.close();
  }
}

async function restartServer() {
  return;
}

async function clearProcessedSnippets(ids) {
  if (!ids.length) return;
  const current = await fetchSnippets();
  const remaining = current.filter((_, idx) => !ids.includes(String(idx)));
  await saveJson(SNIPPET_KEY, remaining);
}

async function runRestartProcedure(source = "scheduled") {
  if (runLock) {
    debug.step("restart.runRestartProcedure", { phase: "skipped", source });
    return;
  }

  runLock = true;
  try {
    debug.step("restart.runRestartProcedure", { phase: "start", source });

    const snippets = await fetchSnippets();
    const finalJson = buildFinalJson(snippets);

    await writeFiles(finalJson);
    await uploadToServer();

    if (snippets.length) {
      await clearProcessedSnippets(snippets.map((_, i) => String(i)));
    }

    await restartServer();

    debug.ok("restart.runRestartProcedure", {
      source,
      snippets: snippets.length,
      file: OUTPUT_FILE,
      remote: REMOTE_FILE
    });
  } finally {
    runLock = false;
  }
}

function scheduleNextRun() {
  if (schedulerTimer) clearTimeout(schedulerTimer);

  nextAutoRunAt = getNextRunAt(new Date());
  const runAt = new Date(nextAutoRunAt.getTime() - EARLY_MINUTES * 60 * 1000);
  const delay = Math.max(1000, runAt.getTime() - Date.now());

  debug.ok("restart.scheduleNextRun", {
    timezone: TIMEZONE,
    nextAutoRunAt: nextAutoRunAt.toISOString(),
    runAt: runAt.toISOString(),
    delayMs: delay
  });

  schedulerTimer = setTimeout(async () => {
    try {
      await runRestartProcedure("scheduled");
    } catch (error) {
      debug.fail("restart.loop", error);
    } finally {
      scheduleNextRun();
    }
  }, delay);
}

function start() {
  debug.ok("restart.start", { timezone: TIMEZONE, earlyMinutes: EARLY_MINUTES });
  scheduleNextRun();
}

module.exports = { start, runRestartProcedure };
