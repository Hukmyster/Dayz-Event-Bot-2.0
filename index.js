const fs = require("fs");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 5 * 60 * 1000; // 5 min
const STALL_THRESHOLD = 40 * 60 * 1000; // 40 min

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
  retryQueue: new Map(), // file -> timestamp added
  lastSuccessTime: Date.now(),
  lastProcessedFile: null,
  lastProcessedAt: Date.now(),
};

// ==============================
// LOG HELPERS
// ==============================
const log = (msg) => console.log(msg);

// ==============================
// API FETCH (ALWAYS FRESH)
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
// FTP SESSION
// ==============================
async function ftpBatch(files, mode = "normal") {
  const client = new Client();
  const sessionId = Math.random().toString(36).slice(2, 8);

  console.log(`\n🔌 FTP SESSION START ${sessionId} (${mode})`);
  console.log(`REMOTE HOST: ${FTP_HOST}`);

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    for (const file of files) {
      await handleFile(client, file, sessionId);
    }

  } catch (err) {
    console.log(`❌ FTP SESSION ERROR [${sessionId}]`);
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
      console.log(`🆕 NEW FILE REGISTERED: ${file}`);
      state.knownFiles.add(file);
    }

    state.lastProcessedFile = file;
    state.lastProcessedAt = Date.now();
    state.lastSuccessTime = Date.now();

    processFile(file, content);

  } catch (err) {
    const msg = err?.message || String(err);

    console.log(`❌ FTP FAIL: ${file}`);
    console.log(`   ↳ ${msg}`);

    // store retry WITH timestamp (so it expires)
    state.retryQueue.set(file, Date.now());

    // keep raw error for debug visibility
    console.log(`⚠️ FTP RAW ERROR STORED FOR ANALYSIS`);
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

    // ADM ONLY "killed by"
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
// STALL RECOVERY LOGIC
// ==============================
async function stallCheckAndRecover() {
  const now = Date.now();
  const stallTime = now - state.lastSuccessTime;

  if (stallTime < STALL_THRESHOLD) return;

  console.log("\n⚠️ STALL DETECTED (40+ min no successful file processing)");
  console.log(`Last success: ${new Date(state.lastSuccessTime).toISOString()}`);

  const retryFiles = Array.from(state.retryQueue.keys());

  if (retryFiles.length === 0) {
    console.log("🧪 RECOVERY SWEEP: forcing API + FTP refresh");
    const files = await fetchFiles();
    await ftpBatch(files, "STALL_RECOVERY");
    return;
  }

  console.log(`🧪 RETRY QUEUE SIZE: ${retryFiles.length}`);
  await ftpBatch(retryFiles, "STALL_RETRY");

  console.log("✅ RECOVERY ATTEMPT COMPLETE");
}

// ==============================
// LOOP
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log("🔄 LOOP", new Date().toISOString());
  console.log("==============================");

  const apiFiles = await fetchFiles();

  // expire old retry entries (prevents infinite stuck files)
  const now = Date.now();
  for (const [file, ts] of state.retryQueue.entries()) {
    if (now - ts > 60 * 60 * 1000) {
      state.retryQueue.delete(file);
    }
  }

  const retryFiles = Array.from(state.retryQueue.keys());

  const allFiles = [...apiFiles, ...retryFiles];

  if (allFiles.length === 0) {
    console.log("🟡 NO FILES THIS CYCLE");
    return;
  }

  await ftpBatch(allFiles);

  await stallCheckAndRecover();

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT STARTED (STABLE + SELF HEAL MODE)");
loop();
setInterval(loop, LOOP_INTERVAL);
