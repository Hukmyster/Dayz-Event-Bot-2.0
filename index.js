const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 2 * 60 * 1000; // 2 min

const ENV = process.env || {};
const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

// ==============================
// STATE
// ==============================
let knownFiles = new Set();
let retryQueue = new Set();
let fileOffsets = {};

// ==============================
// LOG HELPERS
// ==============================
function log(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ==============================
// API FETCH
// ==============================
async function getFiles() {
  try {
    console.log("\n🌐 API FETCH START");

    const res = await fetch(
      `https://api.nitrado.net/services/${SERVICE_ID}/gameservers`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          Accept: "application/json"
        }
      }
    );

    console.log("📡 STATUS:", res.status);

    const data = await res.json();

    const files =
      data?.data?.gameserver?.game_specific?.log_files || [];

    console.log("📂 FILE COUNT:", files.length);

    return files;
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return [];
  }
}

// ==============================
// FTP READ (SAFE + RETRY AWARE)
// ==============================
async function ftpRead(filePath) {
  const client = new Client();
  const sessionId = Math.random().toString(36).slice(2, 8);

  try {
    console.log("\n🔌 FTP SESSION START", sessionId);
    console.log("FILE:", filePath);

    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    const tmp = path.join("/tmp", `log_${Date.now()}.txt`);

    await client.downloadTo(tmp, filePath);

    const content = fs.readFileSync(tmp, "utf8");

    client.close();

    console.log("📄 FTP SUCCESS:", filePath);

    return content;

  } catch (err) {
    console.log("❌ FTP FAIL:", filePath);
    console.log("   ↳", err.message);

    if (err.message.includes("550")) {
      console.log("⏳ QUEUED FOR RETRY:", filePath);
      retryQueue.add(filePath);
    }

    try { client.close(); } catch {}

    return null;
  }
}

// ==============================
// PARSER
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const last = fileOffsets[file] || 0;

  let events = 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];

    // ADM KILL EVENT (UNCHANGED)
    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER");
      console.log(line.trim());
      events++;
    }

    // RPT LOOTMAX ONLY
    if (file.endsWith(".RPT") && line.includes("lootmax")) {
      const match = line.match(/lootmax\s*:\s*(\d+)/i);

      if (match) {
        const val = parseInt(match[1]);

        if (val >= 1 && val <= 25) {
          console.log(`\n🔥 RPT TRIGGER ${val}`);
          console.log(line.trim());
          events++;
        }
      }
    }
  }

  fileOffsets[file] = lines.length;

  return events;
}

// ==============================
// MAIN LOOP
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log("🔄 LOOP START", new Date().toISOString());
  console.log("==============================");

  const files = await getFiles();

  let allTargets = new Set([...files, ...retryQueue]);
  retryQueue.clear();

  let total = 0;

  for (const file of allTargets) {
    if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

    const content = await ftpRead(file);

    if (!content) continue;

    if (!knownFiles.has(file)) {
      console.log("🆕 NEW FILE REGISTERED:", file);
      knownFiles.add(file);
    }

    total += processFile(file, content);
  }

  if (total === 0) {
    console.log("🟡 NO EVENTS THIS LOOP");
  } else {
    console.log("✅ EVENTS FOUND:", total);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (PIPELINE MODE)");
loop();
setInterval(loop, LOOP_INTERVAL);
