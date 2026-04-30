const fs = require("fs");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 5 * 60 * 1000; // 5 min
const STALL_THRESHOLD = 20 * 60 * 1000; // 20 min

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
// STATE
// ==============================
const state = {
  knownFiles: new Set(),
  fileOffsets: {},
  retryQueue: new Map(),

  lastSuccessTime: Date.now(),
  stalled: false,
};

// ==============================
// API FETCH
// ==============================
async function fetchFiles() {
  try {
    console.log("\n🌐 API FETCH START");

    const res = await fetch(
      `https://api.nitrado.net/services/${SERVICE_ID}/gameservers`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          Accept: "application/json",
        },
      }
    );

    const data = await res.json();
    const files =
      data?.data?.gameserver?.game_specific?.log_files || [];

    console.log(`📂 FILES FROM API: ${files.length}`);

    return files;
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return [];
  }
}

// ==============================
// FTP BATCH
// ==============================
async function ftpBatch(files, mode = "normal") {
  const client = new Client();
  const sessionId = Math.random().toString(36).slice(2, 8);

  console.log(`\n🔌 FTP SESSION START ${sessionId} (${mode})`);

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    console.log(`🌐 FTP CONNECTED`);
    console.log(`REMOTE HOST: ${FTP_HOST}`);

    for (const file of files) {
      await handleFile(client, file, sessionId);
    }

  } catch (err) {
    console.log(`❌ FTP SESSION ERROR ${sessionId}`);
    console.log(err?.message || err);
  }

  client.close();
}

// ==============================
// FILE HANDLER
// ==============================
async function handleFile(client, file, sessionId) {
  try {
    const tmp = `/tmp/${Date.now()}_${Math.random()}.log`;

    await client.downloadTo(tmp, file);

    const content = fs.readFileSync(tmp, "utf8");

    if (!state.knownFiles.has(file)) {
      console.log(`🆕 NEW FILE: ${file}`);
      state.knownFiles.add(file);
    }

    state.lastSuccessTime = Date.now();

    processFile(file, content);

  } catch (err) {
    const msg = err?.message || String(err);

    console.log(`❌ FTP FAIL: ${file}`);
    console.log(`   ↳ ${msg}`);

    // 🔥 NEW: IMMEDIATE RAW FTP DEBUG OUTPUT
    console.log("\n📡 FTP RAW RESPONSE (IMMEDIATE DEBUG)");
    console.log({
      sessionId,
      file,
      error: msg,
      host: FTP_HOST,
      time: new Date().toISOString(),
    });

    state.retryQueue.set(file, Date.now());
  }
}

// ==============================
// PARSER (UNCHANGED RULES)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");
  const last = state.fileOffsets[file] || 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];

    // ADM ONLY
    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER");
      console.log(line.trim());
    }

    // RPT ONLY lootmax 1–25
    if (file.endsWith(".RPT") && line.includes("lootmax")) {
      const match = line.match(/lootmax\s*:\s*(\d+)/i);

      if (match) {
        const val = parseInt(match[1]);

        if (val >= 1 && val <= 25) {
          console.log(`\n🔥 RPT TRIGGER ${val}`);
          console.log(line.trim());
        }
      }
    }
  }

  state.fileOffsets[file] = lines.length;
}

// ==============================
// STALL CHECK
// ==============================
async function checkStall() {
  const now = Date.now();
  const diff = now - state.lastSuccessTime;

  if (diff < STALL_THRESHOLD || state.stalled) return;

  state.stalled = true;

  console.log("\n🚨 STALL DETECTED (20 MIN NO SUCCESS)");
  console.log("🔧 ENTERING STALL DEBUG MODE...\n");

  const files = await fetchFiles();

  try {
    await ftpBatch(files, "STALL_DEBUG");

    console.log("\n✅ STALL DEBUG SUCCESSFUL");
    console.log("🔄 RESUMING NORMAL OPERATION\n");

    state.lastSuccessTime = Date.now();
    state.stalled = false;

  } catch (err) {
    console.log("\n❌ STALL DEBUG FAILED");
    console.log("🛑 STOPPING BOT FOR DIAGNOSTICS");
    console.log(err?.message || err);

    process.exit(1);
  }
}

// ==============================
// LOOP
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log("🔄 LOOP", new Date().toISOString());
  console.log("==============================");

  const apiFiles = await fetchFiles();
  const retryFiles = Array.from(state.retryQueue.keys());

  const allFiles = [...apiFiles, ...retryFiles];

  if (allFiles.length === 0) {
    console.log("🟡 NO FILES THIS LOOP");
    await checkStall();
    return;
  }

  await ftpBatch(allFiles);

  await checkStall();

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (STALL SAFE MODE 20MIN + RAW FTP DEBUG)");
loop();
setInterval(loop, LOOP_INTERVAL);
