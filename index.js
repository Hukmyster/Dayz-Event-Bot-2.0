const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV DEBUG (DO NOT REMOVE)
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

// ==============================
// SAFETY CHECK
// ==============================
if (!API_TOKEN || !SERVICE_ID || !FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.log("❌ Missing ENV variables");
  process.exit(1);
}

// ==============================
// STATE (PREVENT DUPLICATES)
// ==============================
const lastSeenLine = {};

// ==============================
// API CALL
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

    return await res.json();
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return null;
  }
}

// ==============================
// GET FILE LIST
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  const files =
    res?.data?.gameserver?.game_specific?.log_files || [];

  console.log("📂 FILES:", files.length);

  return files;
}

// ==============================
// FTP READ
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

    return fs.readFileSync(tmp, "utf8");

  } catch (err) {
    console.log("❌ FTP ERROR:", filePath);
    console.log("   ↳", err.message);

    try { client.close(); } catch {}

    return null;
  }
}

// ==============================
// TRIGGERS (STRICT ONLY)
// ==============================
function isLootmax(line) {
  return line.toLowerCase().includes("lootmax");
}

function isKilledBy(line) {
  return line.toLowerCase().includes("killed by");
}

// ==============================
// PROCESS FILE (NEW LINES ONLY)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const last = lastSeenLine[file] || 0;

  let hits = 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // TRIGGER 1
    if (isLootmax(line)) {
      console.log("\n🔥 LOOTMAX TRIGGER");
      console.log("📄 FILE:", file);
      console.log(line.trim());
      hits++;
    }

    // TRIGGER 2
    if (isKilledBy(line)) {
      console.log("\n💀 KILL TRIGGER");
      console.log("📄 FILE:", file);
      console.log(line.trim());
      hits++;
    }
  }

  lastSeenLine[file] = lines.length;

  return hits;
}

// ==============================
// MAIN LOOP
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
    console.log("⚡ TOTAL EVENTS:", total);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT STARTED (STRICT TRIGGER MODE)");
console.log("⏱ LOOP: 120s");

run();
setInterval(run, 360000);
