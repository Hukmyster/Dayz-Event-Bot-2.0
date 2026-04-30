const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV
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
// STATE (PREVENT DUPES)
// ==============================
const lastLineIndex = {};

// ==============================
// API
// ==============================
async function api(path) {
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
// FILE LIST
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
    console.log("⚠️ FTP ERROR:", filePath);
    console.log("   ↳", err.message);

    try { client.close(); } catch {}

    return null;
  }
}

// ==============================
// LOOTMAX PARSER (1–25)
// ==============================
function getLootmax(line) {
  const match = line.match(/lootmax\s*[: ]\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function getTriggerNumber(value) {
  if (!value || value < 1) return null;
  if (value > 25) return 25;
  return value;
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");
  const last = lastLineIndex[file] || 0;

  let hits = 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const lower = line.toLowerCase();

    if (file.endsWith(".ADM") && lower.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER FOUND");
      console.log("Adm trigger found:", line.trim());
      hits++;
    }

    if (file.endsWith(".RPT") && lower.includes("lootmax")) {
      const value = getLootmax(line);
      const trigger = getTriggerNumber(value);

      if (trigger) {
        console.log(`\n🔥 RPT TRIGGER ${trigger} FOUND`);
        console.log(line.trim());
        hits++;
      }
    }
  }

  lastLineIndex[file] = lines.length;

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
    console.log("⚡ EVENTS THIS CYCLE:", total);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START (10 MIN LOOP)
// ==============================
console.log("🚀 BOT ONLINE (10 MIN STABLE MODE)");

run();
setInterval(run, 600000);
