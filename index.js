const fs = require("fs");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { Client } = require("basic-ftp");

// ==============================
// ENV
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

// ==============================
// CONFIG (ONLY CHANGE HERE)
// ==============================
const LOOP_INTERVAL = 10 * 60 * 1000; // 10 minutes

console.log("================================");
console.log("🚀 BOT STARTED (10 MIN LOOTMAX MODE)");
console.log("================================");

console.log("🧪 ENV DEBUG:");
console.log({
  API_TOKEN: !!API_TOKEN,
  SERVICE_ID: !!SERVICE_ID,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS
});

// ==============================
// STATE
// ==============================
const seenLines = new Set();

// ==============================
// API
// ==============================
async function api(pathUrl) {
  try {
    const res = await fetch(`https://api.nitrado.net${pathUrl}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json"
      }
    });

    console.log("🌐 API CALL:", pathUrl);
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

  console.log("📂 FILES FOUND:", files.length);

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

    client.close();
    return content;

  } catch (err) {
    console.log("❌ FTP ERROR:", filePath);
    console.log("   ↳", err.message);

    client.close();
    return null;
  }
}

// ==============================
// LOOTMAX PARSER (1–25)
// ==============================
function extractLootmax(line) {
  const match = line.match(/lootmax\s*:\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ==============================
// PROCESS LINE
// ==============================
function processLine(file, line) {
  if (!line || seenLines.has(line)) return;
  seenLines.add(line);

  const lower = line.toLowerCase();

  // ==========================
  // ADM TRIGGER
  // ==========================
  if (file.endsWith(".ADM") && lower.includes("killed by")) {
    console.log("\n💀 ADM TRIGGER FOUND");
    console.log(line);
    return;
  }

  // ==========================
  // RPT LOOTMAX 1–25
  // ==========================
  if (file.endsWith(".RPT") && lower.includes("lootmax")) {
    const value = extractLootmax(line);

    if (value && value >= 1 && value <= 25) {
      console.log(`\n🔥 RPT TRIGGER lootmax ${value} FOUND`);
      console.log(line);
    }
  }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  for (const line of lines) {
    processLine(file, line);
  }
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
  console.log("\n==============================");
  console.log("🔄 LOOP START", new Date().toISOString());
  console.log("==============================");

  const files = await getFiles();

  for (const file of files) {
    if (!file.endsWith(".rpt") && !file.endsWith(".adm")) continue;

    const content = await ftpRead(file);
    if (!content) continue;

    processFile(file, content);
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START (10 MIN LOOP)
// ==============================
run();
setInterval(run, LOOP_INTERVAL);
