const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV (SAFE + DEBUG ALWAYS ON)
// ==============================
const ENV = process.env || {};

console.log("================================");
console.log("🧪 ENV DEBUG (RAW STATE)");
console.log({
  API_TOKEN: !!ENV.API_TOKEN,
  SERVICE_ID: !!ENV.SERVICE_ID,
  FTP_HOST: !!ENV.FTP_HOST,
  FTP_USER: !!ENV.FTP_USER,
  FTP_PASS: !!ENV.FTP_PASS
});
console.log("================================");

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

if (!API_TOKEN || !SERVICE_ID || !FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.log("❌ FATAL: Missing ENV variables - stopping bot");
  process.exit(1);
}

// ==============================
// STATE TRACKING (NO DUPLICATES)
// ==============================
const lastLineIndex = {};

// ==============================
// API CALL (DEBUG ENABLED)
// ==============================
async function api(path) {
  console.log("🌐 API REQUEST:", path);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    console.log("📡 API STATUS:", res.status);

    const json = await res.json();

    console.log("📦 API RESPONSE RECEIVED:", !!json);

    return json;

  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return null;
  }
}

// ==============================
// GET FILES (DEBUG ALWAYS ON)
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  const files =
    res?.data?.gameserver?.game_specific?.log_files || [];

  console.log("📂 FILES COUNT:", files.length);
  console.log("📂 FILE LIST:");
  files.forEach(f => console.log(" -", f));

  return files;
}

// ==============================
// FTP READ (DEBUG ENABLED)
// ==============================
async function readFile(filePath) {
  console.log("📥 FTP READ ATTEMPT:", filePath);

  const client = new Client();

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    const tmp = `/tmp/${Date.now()}.log`;

    await client.downloadTo(tmp, filePath);

    client.close();

    const content = fs.readFileSync(tmp, "utf8");

    console.log("📄 FILE SIZE:", content.length);

    return content;

  } catch (err) {
    console.log("❌ FTP ERROR:", filePath);
    console.log("   ↳", err.message);

    client.close();
    return null;
  }
}

// ==============================
// LINE PROCESSING (DEBUG SAFE)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const start = lastLineIndex[file] || 0;

  console.log(`🧠 PROCESSING: ${file}`);
  console.log(`   ↳ New lines since last run: ${lines.length - start}`);

  let hits = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const lower = line.toLowerCase();

    if (lower.includes("lootmax")) {
      console.log("\n🔥 LOOT EVENT DETECTED");
      console.log("📄 FILE:", file);
      console.log("LINE:", line.trim());
      hits++;
    }

    if (lower.includes("killed by")) {
      console.log("\n💀 KILL EVENT DETECTED");
      console.log("📄 FILE:", file);
      console.log("LINE:", line.trim());
      hits++;
    }
  }

  lastLineIndex[file] = lines.length;

  return hits;
}

// ==============================
// MAIN LOOP (DEBUG ALWAYS ON)
// ==============================
async function run() {
  console.log("\n==============================");
  console.log("🔄 LOOP START", new Date().toISOString());
  console.log("==============================");

  const files = await getFiles();

  let total = 0;

  for (const file of files) {
    if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

    const content = await readFile(file);
    if (!content) continue;

    total += processFile(file, content);
  }

  if (total === 0) {
    console.log("🟡 NO NEW EVENTS THIS CYCLE");
  } else {
    console.log(`⚡ TOTAL NEW EVENTS: ${total}`);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START (2 MIN LOOP)
// ==============================
console.log("🚀 BOT ONLINE (DEBUG PERSIST MODE)");
console.log("==============================");

run();
setInterval(run, 120000);
