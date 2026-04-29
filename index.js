const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV
// ==============================
const ENV = process.env;

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

// ==============================
// STATE
// ==============================
const seen = new Set();
let firstRun = true;

// ==============================
// START LOG
// ==============================
console.log("🚀 BOT STARTED (CLEAN 2 MIN MODE)");
console.log("ENV:", {
  API_TOKEN: !!API_TOKEN,
  SERVICE_ID: !!SERVICE_ID,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS
});

// ==============================
// API CALL
// ==============================
async function api(pathUrl) {
  try {
    const res = await fetch(`${API_BASE}${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    return await res.json().catch(() => null);
  } catch (err) {
    return null;
  }
}

// ==============================
// GET FILES
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);
  return res?.data?.gameserver?.game_specific?.log_files || [];
}

// ==============================
// FTP READ
// ==============================
async function ftpRead(filePath) {
  const client = new Client();

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    const tmpFile = `/tmp/${Date.now()}.txt`;

    await client.downloadTo(tmpFile, filePath);

    client.close();

    return fs.readFileSync(tmpFile, "utf8");

  } catch (err) {
    client.close();
    return null;
  }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");
  let newHits = 0;

  for (const line of lines) {
    if (!line) continue;

    const id = file + line;

    if (seen.has(id)) continue;

    seen.add(id);

    const lower = line.toLowerCase();

    // 🔥 LOOT EVENTS
    if (file.toLowerCase().endsWith(".rpt") && lower.includes("lootmax")) {
      console.log("\n🔥 LOOT EVENT");
      console.log("📄", file);
      console.log(line);
      newHits++;
    }

    // 💀 KILL EVENTS
    if (file.toLowerCase().endsWith(".adm") && lower.includes("killed by")) {
      console.log("\n💀 KILL EVENT");
      console.log("📄", file);
      console.log(line);
      newHits++;
    }
  }

  return newHits;
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
  let totalNew = 0;

  const files = await getFiles();

  if (!files.length) {
    console.log("⚠️ No files found");
    return;
  }

  for (const file of files) {
    const lower = file.toLowerCase();

    if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

    const content = await ftpRead(file);

    if (!content) continue;

    totalNew += processFile(file, content);
  }

  if (firstRun) {
    console.log(`🧠 INITIAL SWEEP COMPLETE (${totalNew} events)`);
    firstRun = false;
    return;
  }

  if (totalNew > 0) {
    console.log(`⚡ ${totalNew} NEW EVENTS`);
  }
}

// ==============================
// START LOOP
// ==============================
run();
setInterval(run, 120000);

// ==============================
// HEARTBEAT
// ==============================
setInterval(() => {
  console.log("💓 heartbeat", new Date().toISOString());
}, 120000);
