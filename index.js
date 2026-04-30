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

  blockedFiles: new Map(), // 550 cooldown

  lastApiFiles: new Set(),

  lastFtpSuccessTime: Date.now(),
  lastAnyActivityTime: Date.now(),

  stallMode: false,
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
// COOLDOWN CHECK
// ==============================
function isBlocked(file) {
  const until = state.blockedFiles.get(file);

  if (!until) return false;

  if (Date.now() > until) {
    state.blockedFiles.delete(file);
    return false;
  }

  return true;
}

// ==============================
// FTP BATCH
// ==============================
async function ftpBatch(files, mode = "NORMAL") {
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

    for (const file of files) {
      if (!state.stallMode && isBlocked(file)) {
        console.log(`⏭ SKIP COOLDOWN: ${file}`);
        continue;
      }

      await handleFile(client, file, sessionId);
    }

  } catch (err) {
    console.log("❌ FTP SESSION ERROR");
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

    state.lastFtpSuccessTime = Date.now();
    state.lastAnyActivityTime = Date.now();

    processFile(file, content);

  } catch (err) {
    const msg = err?.message || String(err);

    console.log(`❌ FTP FAIL: ${file}`);
    console.log(`   ↳ ${msg}`);

    // immediate raw debug (as requested)
    console.log("\n📡 FTP RAW RESPONSE");
    console.log({
      sessionId,
      file,
      error: msg,
      host: FTP_HOST,
      time: new Date().toISOString()
    });

    if (msg.includes("550")) {
      state.blockedFiles.set(
        file,
        Date.now() + 20 * 60 * 1000
      );
    }
  }
}

// ==============================
// PARSER
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");
  const last = state.fileOffsets[file] || 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];

    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER");
      console.log(line.trim());
    }

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
// STALL v2 CHECK
// ==============================
async function checkStallV2(apiFiles) {
  const now = Date.now();
  const timeSinceFtp = now - state.lastFtpSuccessTime;

  const apiHasFiles = apiFiles && apiFiles.length > 0;

  if (!apiHasFiles || state.stallMode) return;

  if (timeSinceFtp < STALL_THRESHOLD) return;

  state.stallMode = true;

  console.log("\n🚨 STALL v2 DETECTED");
  console.log("🔧 API HAS FILES BUT NO FTP SUCCESS FOR 20 MIN");

  try {
    console.log("🔁 FORCE RECOVERY MODE STARTING...\n");

    await ftpBatch(apiFiles, "STALL_RECOVERY");

    console.log("\n✅ STALL RECOVERY SUCCESSFUL");
    console.log("🔄 RESUMING NORMAL MODE\n");

    state.lastFtpSuccessTime = Date.now();
    state.stallMode = false;

  } catch (err) {
    console.log("\n❌ STALL RECOVERY FAILED");
    console.log("🛑 STOPPING BOT");

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

  for (const f of apiFiles) {
    if (!state.lastApiFiles.has(f)) {
      console.log(`🆕 API NEW FILE: ${f}`);
    }
  }

  state.lastApiFiles = new Set(apiFiles);

  if (apiFiles.length === 0) {
    console.log("🟡 NO API FILES");
    return;
  }

  await ftpBatch(apiFiles);

  await checkStallV2(apiFiles);

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (STALL v2 + SELF HEAL ENGINE)");
loop();
setInterval(loop, LOOP_INTERVAL);
