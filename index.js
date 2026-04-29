const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

console.log("🚀 BOT BOOTING (DEBUG MODE)");
console.log("==============================");
console.log("ENV CHECK:", {
  API_TOKEN: !!API_TOKEN,
  SERVICE_ID: !!SERVICE_ID,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS
});
console.log("==============================");

if (!API_TOKEN || !SERVICE_ID) {
  console.log("❌ Missing API ENV — stopping");
  process.exit(1);
}

// ==============================
// API CALL (NOW LOUD)
// ==============================
async function api(pathUrl) {
  console.log("🌐 API CALL:", pathUrl);

  try {
    const res = await fetch(`${API_BASE}${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    const json = await res.json();

    console.log("📡 API STATUS:", res.status);

    return json;

  } catch (err) {
    console.log("❌ API FAIL:", err.message);
    return null;
  }
}

// ==============================
// GET FILES (DEBUGGED HARD)
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  console.log("📦 RAW API RESPONSE EXISTS:", !!res);

  const files =
    res?.data?.gameserver?.game_specific?.log_files;

  console.log("📂 FILES RAW:", files);

  if (!files) {
    console.log("❌ FILES PATH FAILED (API STRUCTURE ISSUE)");
    return [];
  }

  console.log("📂 FILE COUNT:", files.length);

  return files;
}

// ==============================
// LOOP
// ==============================
async function run() {
  console.log("\n🔄 LOOP START");

  const files = await getFiles();

  if (!files.length) {
    console.log("⚠️ NO FILES RETURNED");
    return;
  }

  console.log("📥 FILE LIST:");
  for (const f of files) console.log(" -", f);

  console.log("🔄 LOOP END");
}

// ==============================
// START
// ==============================
run();
setInterval(run, 120000);

setInterval(() => {
  console.log("💓 heartbeat", new Date().toISOString());
}, 120000);
