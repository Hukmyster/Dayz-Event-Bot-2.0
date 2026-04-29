const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV (SAFE)
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN || null;
const SERVICE_ID = ENV.SERVICE_ID || null;

const FTP_HOST = ENV.FTP_HOST || null;
const FTP_USER = ENV.FTP_USER || null;
const FTP_PASS = ENV.FTP_PASS || null;

// Hard stop if missing (prevents crash loops)
if (!API_TOKEN || !SERVICE_ID || !FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.log("❌ Missing ENV variables - bot stopped safely");
  console.log({
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID,
    FTP_HOST: !!FTP_HOST,
    FTP_USER: !!FTP_USER,
    FTP_PASS: !!FTP_PASS
  });
  process.exit(1);
}

// ==============================
// STATE (IMPORTANT FIX)
// ==============================
const lastSeenLineIndex = {}; // file -> last line index

// ==============================
// STARTUP
// ==============================
console.log("🚀 BOT STARTED (2 MIN STABLE DELTA MODE)");
console.log("==============================");
console.log("NODE:", process.version);
console.log("==============================");

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

  return files;
}

// ==============================
// FTP READ FILE
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
    client.close();
    return null;
  }
}

// ==============================
// LINE PARSER
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  let lastIndex = lastSeenLineIndex[file] || 0;
  let newEvents = 0;

  for (let i = lastIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const lower = line.toLowerCase();

    // LOOT EVENT
    if (lower.includes("lootmax")) {
      console.log("\n🔥 LOOT EVENT");
      console.log("📄", file);
      console.log(line.trim());
      newEvents++;
    }

    // KILL EVENT
    if (lower.includes("killed by")) {
      console.log("\n💀 KILL EVENT");
      console.log("📄", file);
      console.log(line.trim());
      newEvents++;
    }
  }

  // update pointer
  lastSeenLineIndex[file] = lines.length;

  return newEvents;
}

// ==============================
// LOOP
// ==============================
async function run() {
  const files = await getFiles();

  let total = 0;

  for (const file of files) {
    const lower = file.toLowerCase();

    if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

    const content = await readFile(file);
    if (!content) continue;

    total += processFile(file, content);
  }

  if (total > 0) {
    console.log(`⚡ NEW EVENTS: ${total}`);
  }
}

// ==============================
// START LOOP (2 MIN)
// ==============================
run();
setInterval(run, 120000);

// heartbeat (quiet)
setInterval(() => {
  console.log("💓 heartbeat", new Date().toISOString());
}, 120000);
