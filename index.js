const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 5 * 60 * 1000; // 2 min loop (change if needed)

// ==============================
// ENV SAFE LOAD
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

// ==============================
// STATE TRACKING
// ==============================
let previousFiles = [];
const fileOffsets = {};
const failedFiles = new Set();

// ==============================
// STARTUP
// ==============================
console.log("================================");
console.log("🚀 BOT STARTED (FULL DEBUG MODE)");
console.log("================================");

console.log("🧪 ENV CHECK:", {
  API_TOKEN: !!API_TOKEN,
  SERVICE_ID: !!SERVICE_ID,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS
});

console.log("⏱ LOOP INTERVAL:", LOOP_INTERVAL / 1000, "seconds");

// ==============================
// API CALL
// ==============================
async function api(pathUrl) {
  try {
    console.log("\n🌐 API REQUEST:", pathUrl);

    const res = await fetch(`https://api.nitrado.net${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    console.log("📡 API STATUS:", res.status);

    const data = await res.json();

    console.log("📦 API RESPONSE OK:", !!data);

    return data;
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

  console.log("📂 FILE COUNT:", files.length);

  if (files.length === 0) {
    console.log("⚠️ WARNING: API returned no files");
  }

  files.forEach(f => console.log(" -", f));

  return files;
}

// ==============================
// DETECT NEW FILES
// ==============================
function detectNewFiles(files) {
  const newFiles = [];

  for (const f of files) {
    if (!previousFiles.includes(f)) {
      console.log("🆕 NEW FILE:", f);
      newFiles.push(f);
    } else {
      newFiles.push(f);
    }
  }

  previousFiles = files;
  return newFiles;
}

// ==============================
// FTP READ (WITH SESSION DEBUG)
// ==============================
async function ftpRead(filePath) {
  const client = new Client();

  const sessionId = Math.random().toString(36).substring(2, 8);

  try {
    console.log("\n🔌 FTP SESSION START");
    console.log("   ID:", sessionId);
    console.log("   FILE:", filePath);
    console.log("   TIME:", new Date().toISOString());

    if (failedFiles.has(filePath)) {
      console.log("⏭️ SKIPPING PREVIOUSLY FAILED FILE");
      return null;
    }

    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    const sock = client.ftp.socket;

    if (sock) {
      console.log("   🌐 REMOTE:", sock.remoteAddress + ":" + sock.remotePort);
      console.log("   🧭 LOCAL PORT:", sock.localPort);
    }

    const tmp = path.join("/tmp", `log_${Date.now()}.txt`);

    await client.downloadTo(tmp, filePath);

    const content = fs.readFileSync(tmp, "utf8");

    console.log("📄 DOWNLOAD OK:", filePath);
    console.log("📏 SIZE:", content.length);

    client.close();

    console.log("🔌 FTP SESSION END:", sessionId);

    return content;

  } catch (err) {
    console.log("\n❌ FTP ERROR (FULL DEBUG)");
    console.log("   SESSION:", sessionId);
    console.log("   FILE:", filePath);
    console.log("   ERROR:", err.message);

    if (err.message.includes("550")) {
      console.log("⚠️ 550 DETECTED → file not available or rotated");
    }

    failedFiles.add(filePath);

    try { client.close(); } catch {}

    return null;
  }
}

// ==============================
// LOOTMAX PARSER (STRICT 1–25 ONLY)
// ==============================
function extractLootmax(line) {
  const match = line.match(/lootmax\s*:\s*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

// ==============================
// PROCESS FILE (LINE TRACKING)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const lastIndex = fileOffsets[file] || 0;

  console.log("\n🧠 PROCESSING:", file);
  console.log("   ↳ LAST INDEX:", lastIndex);
  console.log("   ↳ TOTAL LINES:", lines.length);

  let events = 0;

  for (let i = lastIndex; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // ADM TRIGGER (UNCHANGED)
    if (file.endsWith(".ADM") && lower.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER FOUND");
      console.log(line.trim());
      events++;
      continue;
    }

    // RPT LOOTMAX TRIGGER (STRICT 1–25)
    if (file.endsWith(".RPT") && lower.includes("lootmax")) {
      const val = extractLootmax(line);

      if (val && val >= 1 && val <= 25) {
        console.log(`\n🔥 RPT TRIGGER ${val} FOUND`);
        console.log(line.trim());
        events++;
      }
    }
  }

  fileOffsets[file] = lines.length;

  return events;
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
  console.log("\n==============================");
  console.log("🔄 LOOP START", new Date().toISOString());
  console.log("==============================");

  const files = await getFiles();

  const targets = detectNewFiles(files);

  let total = 0;

  for (const file of targets) {
    if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

    const content = await ftpRead(file);

    if (!content) continue;

    total += processFile(file, content);
  }

  if (total === 0) {
    console.log("\n🟡 NO NEW EVENTS THIS LOOP");
  } else {
    console.log("\n✅ TOTAL EVENTS:", total);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
run();
setInterval(run, LOOP_INTERVAL);