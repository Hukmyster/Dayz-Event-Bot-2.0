const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const debug = require("./utils/debug");
const { buildJsonFile } = require("./modules/shopSnippetBuilder");

const RESTART_INTERVAL_MS = 3 * 60 * 60 * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CUSTOM_DIR = path.join(__dirname, "custom");
const OUTPUT_FILE = path.join(CUSTOM_DIR, "shopobjects.json");
const JSON_TABLE = "purchase_json_snippets";

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
  const entries = snippets
    .map(parseSnippet)
    .filter(Boolean);

  return buildJsonFile(entries);
}

async function writeFiles(jsonObject) {
  ensureOutputDir();
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(jsonObject, null, 2), "utf8");
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
  if (!snippets.length) {
    debug.step("restart.runRestartProcedure", { phase: "no-snippets" });
    return;
  }

  const finalJson = buildFinalJson(snippets);
  await writeFiles(finalJson);
  await clearProcessedSnippets(snippets.map(s => s.id));

  debug.ok("restart.runRestartProcedure", {
    snippets: snippets.length,
    file: OUTPUT_FILE
  });
}

function start() {
  debug.ok("restart.start", { intervalMs: RESTART_INTERVAL_MS });
  setInterval(async () => {
    try {
      await runRestartProcedure();
    } catch (error) {
      debug.fail("restart.loop", error);
    }
  }, RESTART_INTERVAL_MS);
}

module.exports = { start, runRestartProcedure };
