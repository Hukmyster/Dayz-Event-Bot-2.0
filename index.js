const fs = require("fs");
const path = require("path");
const { Client } = require("basic-ftp");

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
// CONFIG
// ==============================
const LOOP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ==============================
// STATE
// ==============================
const fileOffsets = {};

// ==============================
// START LOG
// ==============================
console.log("================================");
console.log("🚀 BOT STARTED (FIXED FETCH MODE)");
console.log("================================");

console.log("🧪 ENV:", {
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
    const res = await fetch(`https://api.nitrado.net${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    const data = await res.json();

    console.log("\n🌐 API CALL:", pathUrl);
    console.log("📡 STATUS:", res.status);
    console.log("📦 RESPONSE OK:", !!data);

    return data;
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return null;
  }
}

// ==============================
// GET FILES
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  const files = res?.data?.gameserver?.game_specific?.log_files || [];

  console.log("📂 FILE COUNT:", files.length);

  files.forEach(f => console.log(" -", f));

  return files;
}

// ==============================
// FTP READ
// ==============================
async function ftpRead(filePath) {
  const client = new Client();

  try {
    console.log("📥 FTP READ:", filePath);

    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    const tmp = path.join("/tmp", `log_${Date.now()}.txt`);

    await client.downloadTo(tmp, filePath);

    const content = fs.readFileSync(tmp, "utf8");

    console.log("📄 SIZE:", content.length);

    client.close();
    return content;

  } catch (err) {
    console.log("❌ FTP ERROR:", filePath);
    console.log("   ↳", err.message);

    try { client.close(); } catch {}

    return null;
  }
}

// ==============================
// LOOTMAX PARSE
// ==============================
function getLootmax(line) {
  const match = line.match(/lootmax\s*:\s*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  console.log(`📏 ${file} TOTAL LINES:`, lines.length);

  const lastIndex = fileOffsets[file] || 0;

  console.log(`📌 ${file} LAST INDEX:`, lastIndex);

  let newEvents = 0;

  for (let i = lastIndex; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // ADM trigger
    if (file.endsWith(".ADM") && lower.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER FOUND");
      console.log(line.trim());
      newEvents++;
      continue;
    }

    // RPT trigger
    if (file.endsWith(".RPT") && lower.includes("lootmax")) {
      const value = getLootmax(line);

      if (value && value >= 1 && value <= 25) {
        console.log(`\n🔥 RPT TRIGGER ${value} FOUND`);
        console.log(line.trim());
        newEvents++;
      }
    }
  }

  const newLineCount = lines.length - lastIndex;

  console.log(`📈 ${file} NEW LINES:`, newLineCount);

  fileOffsets[file] = lines.length;

  return {
    newEvents,
    newLineCount
  };
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
  console.log("\n==============================");
  console.log("🔄 LOOP START", new Date().toISOString());
  console.log("==============================");

  let totalEvents = 0;
  let totalNewLines = 0;

  const files = await getFiles();

  for (const file of files) {
    if (!file.toLowerCase().endsWith(".rpt") && !file.toLowerCase().endsWith(".adm")) continue;

    const content = await ftpRead(file);
    if (!content) continue;

    const result = processFile(file, content);

    totalEvents += result.newEvents;
    totalNewLines += result.newLineCount;
  }

  if (totalEvents === 0) {
    console.log("\n🟡 NO EVENTS THIS LOOP");
    console.log("🧪 DEBUG:");
    console.log(" - total new lines:", totalNewLines);
    console.log(" - tracked files:", Object.keys(fileOffsets).length);

    if (totalNewLines === 0) {
      console.log("⚠️ FILES NOT GROWING");
    } else {
      console.log("⚠️ FILES GROWING BUT NO TRIGGERS");
    }
  } else {
    console.log(`\n✅ EVENTS FOUND: ${totalEvents}`);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
run();
setInterval(run, LOOP_INTERVAL);