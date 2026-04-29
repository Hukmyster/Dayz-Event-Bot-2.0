const fs = require("fs");
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
// LOG BOOT
// ==============================
console.log("🚀 BOT ONLINE (FULL DEBUG MODE)");
console.log("==============================");
console.log("NODE:", process.version);
console.log("ENV:", {
  API_TOKEN: !!API_TOKEN,
  SERVICE_ID: !!SERVICE_ID,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS
});
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
// GET FILES
// ==============================
async function getFiles() {
  console.log("🌐 FETCH FILE LIST...");

  const res = await api(`/services/${SERVICE_ID}/gameservers`);

  const files = res?.data?.gameserver?.game_specific?.log_files || [];

  console.log("📂 FILE COUNT:", files.length);

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

    const data = fs.readFileSync(tmp, "utf8");

    if (!data || data.length === 0) {
      console.log("⚠️ EMPTY FILE:", filePath);
      return null;
    }

    return data;

  } catch (err) {
    console.log("❌ FTP ERROR:", filePath, err.message);
    client.close();
    return null;
  }
}

// ==============================
// EVENT DETECTOR
// ==============================
function checkLine(file, line) {
  if (!line) return 0;

  const clean = line.replace(/\r/g, "").trim();
  const lower = clean.toLowerCase();

  const id = file + clean;

  if (seen.has(id)) return 0;

  seen.add(id);

  let hit = false;

  // 🔥 LOOTMAX
  if (lower.includes("lootmax")) {
    console.log("\n🔥 LOOT EVENT");
    console.log("📄", file);
    console.log(clean);
    hit = true;
  }

  // 💀 KILL EVENT
  if (lower.includes("killed by")) {
    console.log("\n💀 KILL EVENT");
    console.log("📄", file);
    console.log(clean);
    hit = true;
  }

  return hit ? 1 : 0;
}

// ==============================
// PROCESS FILE
// ==============================
function process(file, content) {
  const lines = content.split("\n");

  let hits = 0;

  console.log("📄 PROCESSING:", file, "| lines:", lines.length);

  for (const line of lines) {
    hits += checkLine(file, line);
  }

  return hits;
}

// ==============================
// LOOP
// ==============================
async function run() {
  console.log("\n🔄 LOOP START");

  const files = await getFiles();

  if (!files.length) {
    console.log("⚠️ NO FILES");
    return;
  }

  let totalHits = 0;

  for (const file of files) {
    const lower = file.toLowerCase();

    if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

    console.log("📥 FILE:", file);

    const content = await readFile(file);

    if (!content) continue;

    totalHits += process(file, content);
  }

  if (firstRun) {
    console.log(`🧠 INITIAL SWEEP COMPLETE (${totalHits} events)`);
    firstRun = false;
    return;
  }

  if (totalHits > 0) {
    console.log(`⚡ NEW EVENTS: ${totalHits}`);
  }
}

// ==============================
// START
// ==============================
run();
setInterval(run, 120000);

// heartbeat
setInterval(() => {
  console.log("💓 heartbeat", new Date().toISOString());
}, 120000);
