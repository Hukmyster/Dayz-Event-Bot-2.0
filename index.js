const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV + DEBUG (PERSISTENT)
// ==============================
const ENV = process.env || {};

console.log("================================");
console.log("🧪 ENV DEBUG (RAILWAY)");
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
  console.log("❌ MISSING ENV VARS — STOPPING");
  process.exit(1);
}

// ==============================
// STATE (NO DUPLICATE EVENTS)
// ==============================
const lastLineIndex = {};

// ==============================
// API CALL (DEBUG ALWAYS ON)
// ==============================
async function api(path) {
  console.log("🌐 API CALL:", path);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    console.log("📡 STATUS:", res.status);

    const json = await res.json();

    console.log("📦 RESPONSE OK:", !!json);

    return json;
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return null;
  }
}

// ==============================
// FILE LIST
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  const files =
    res?.data?.gameserver?.game_specific?.log_files || [];

  console.log("📂 FILE COUNT:", files.length);

  files.forEach(f => console.log(" -", f));

  return files;
}

// ==============================
// FTP READ (SAFE + DEBUG)
// ==============================
async function readFile(filePath) {
  console.log("📥 FTP READ:", filePath);

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

    const data = fs.readFileSync(tmp, "utf8");

    console.log("📄 SIZE:", data.length);

    return data;

  } catch (err) {
    console.log("❌ FTP FAIL:", filePath);
    console.log("   ↳", err.message);

    client.close();
    return null;
  }
}

// ==============================
// EVENT DETECTION (FIXED LOGIC)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const start = lastLineIndex[file] || 0;

  console.log("🧠 PROCESS:", file);
  console.log("   ↳ New lines:", lines.length - start);

  let hits = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const lower = line.toLowerCase();

    // ======================
    // LOOT DETECTION (FIXED)
    // ======================
    if (
      lower.includes("lootmax") ||
      lower.includes("loot max") ||
      (lower.includes("loot") && lower.includes("max")) ||
      lower.includes("containermaxsum")
    ) {
      console.log("\n🔥 LOOT EVENT");
      console.log("📄 FILE:", file);
      console.log("LINE:", line.trim());
      hits++;
    }

    // ======================
    // KILL DETECTION (EXPANDED)
    // ======================
    if (
      lower.includes("killed by") ||
      lower.includes("was killed") ||
      lower.includes("died") ||
      lower.includes("player") && lower.includes("dead")
    ) {
      console.log("\n💀 KILL EVENT");
      console.log("📄 FILE:", file);
      console.log("LINE:", line.trim());
      hits++;
    }
  }

  lastLineIndex[file] = lines.length;

  return hits;
}

// ==============================
// MAIN LOOP (2 MIN SAFE)
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
    console.log("🟡 NO NEW EVENTS");
  } else {
    console.log("⚡ TOTAL EVENTS:", total);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT STARTED (LOOT + KILL FIX MODE)");
console.log("⏱ LOOP: 120s");

run();
setInterval(run, 120000);
