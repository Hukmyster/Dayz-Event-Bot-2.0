const fs = require("fs");
const { Client } = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

if (!API_TOKEN || !SERVICE_ID || !FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.log("❌ Missing ENV - stopping");
  process.exit(1);
}

// ==============================
// STATE (NO DUPLICATES)
// ==============================
const lastLineIndex = {};

// ==============================
// API
// ==============================
async function api(path) {
  const res = await fetch(`https://api.nitrado.net${path}`, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json"
    }
  });

  return res.json();
}

// ==============================
// FILE LIST
// ==============================
async function getFiles() {
  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  return res?.data?.gameserver?.game_specific?.log_files || [];
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
    client.close();
    return null;
  }
}

// ==============================
// PROCESS (ONLY NEW LINES)
// ==============================
function process(file, content) {
  const lines = content.split("\n");

  const start = lastLineIndex[file] || 0;

  let newHits = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;

    const lower = line.toLowerCase();

    if (lower.includes("lootmax")) {
      console.log("\n🔥 LOOT EVENT");
      console.log(file);
      console.log(line.trim());
      newHits++;
    }

    if (lower.includes("killed by")) {
      console.log("\n💀 KILL EVENT");
      console.log(file);
      console.log(line.trim());
      newHits++;
    }
  }

  lastLineIndex[file] = lines.length;

  return newHits;
}

// ==============================
// LOOP
// ==============================
async function run() {
  const files = await getFiles();

  let total = 0;

  for (const file of files) {
    if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

    const content = await readFile(file);
    if (!content) continue;

    total += process(file, content);
  }

  if (total > 0) {
    console.log(`⚡ NEW EVENTS: ${total}`);
  }
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (FULL EVENT MODE)");
console.log("==============================");

run();
setInterval(run, 120000);
