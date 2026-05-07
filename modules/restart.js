const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Client: FTPClient } = require("basic-ftp");
const debug = require("./utils/debug");
const { buildJsonFile } = require("./modules/shopSnippetBuilder");

const RESTART_TIMER_MINUTES = Number(process.env.RESTART_TIMER || 180);
const RESTART_INTERVAL_MS = RESTART_TIMER_MINUTES * 60 * 1000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

const CUSTOM_DIR = path.join(__dirname, "custom");
const OUTPUT_FILE = path.join(CUSTOM_DIR, "shoppurchases.json");
const JSON_TABLE = "purchase_json_snippets";
const REMOTE_FILE = "dayzps_missions/dayzOffline.chernarusplus/custom/shoppurchases.json";

function ensureOutputDir() {
  if (!fs.existsSync(CUSTOM_DIR)) fs.mkdirSync(CUSTOM_DIR, { recursive: true });
}

async function fetchSnippets() {
  const { data, error } = await supabase
    .from(JSON_TABLE)
    .select("id, object_json, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
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
  if (!entries.length) return buildJsonFile([]);
  return buildJsonFile(entries);
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
  debug.step("restart.restartServer", { phase: "stub" });
}

async function clearProcessedSnippets(ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from(JSON_TABLE)
    .delete()
    .in("id", ids);

  if (error) throw error;
}

async function runRestartProcedure() {
  debug.step("restart.runRestartProcedure", { phase: "start" });

  const snippets = await fetchSnippets();
  const finalJson = buildFinalJson(snippets);

  await writeFiles(finalJson);
  await uploadToServer();

  if (snippets.length) {
    await clearProcessedSnippets(snippets.map(s => s.id));
  }

  await restartServer();

  debug.ok("restart.runRestartProcedure", {
    snippets: snippets.length,
    file: OUTPUT_FILE,
    remote: REMOTE_FILE
  });
}

function start() {
  debug.ok("restart.start", { intervalMs: RESTART_INTERVAL_MS, minutes: RESTART_TIMER_MINUTES });

  setInterval(async () => {
    try {
      await runRestartProcedure();
    } catch (error) {
      debug.fail("restart.loop", error);
    }
  }, RESTART_INTERVAL_MS);
}

module.exports = { start, runRestartProcedure };
