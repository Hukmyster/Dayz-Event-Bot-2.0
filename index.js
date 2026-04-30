const fs = require("fs");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 5 * 60 * 1000; // 5 min

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
  retryCount: {},   // NEW: controlled retries
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
          Accept: "application/json"
        }
      }
    );

    const data = await res.json();

    const files =
      data?.data?.gameserver?.game_specific?.log_files || [];

    console.log(`📂 FILE COUNT: ${files.length}`);

    return files;

  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return [];
  }
}

// ==============================
// FTP SESSION
// ==============================
async function ftpBatch(files) {
  const client = new Client();
  const sessionId = Math.random().toString(36).slice(2, 8);

  console.log(`\n🔌 FTP SESSION START ${sessionId}`);

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false
    });

    for (const file of files) {
      await handleFile(client, file, sessionId);
    }

  } catch (err) {
    console.log("❌ FTP SESSION ERROR:", err.message);
  }

  client.close();
}

// ==============================
// FILE HANDLER (FIXED LOGIC)
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

    // reset retry counter on success
    state.retryCount[file] = 0;

    processFile(file, content);

  } catch (err) {

    if (err.message.includes("550")) {

      state.retryCount[file] = (state.retryCount[file] || 0) + 1;

      console.log(`❌ FTP 550: ${file}`);
      console.log(`⏳ RETRY COUNT: ${state.retryCount[file]}/3`);

      // HARD LIMIT retries (prevents infinite loop bug)
      if (state.retryCount[file] <= 3) {
        setTimeout(() => {
          console.log(`🔁 RETRYING FILE: ${file}`);
          handleFile(client, file, sessionId);
        }, 15000); // 15s retry delay
      } else {
        console.log(`⛔ DROPPED FILE (unavailable): ${file}`);
      }

    } else {
      console.log(`❌ FILE ERROR: ${file}`);
    }
  }
}

// ==============================
// PARSER (UNCHANGED LOGIC)
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");

  const last = state.fileOffsets[file] || 0;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];

    // ADM KILL TRIGGER (UNCHANGED)
    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("💀 ADM TRIGGER");
      console.log(line.trim());
    }

    // RPT LOOTMAX 1–25 ONLY (UNCHANGED)
    if (file.endsWith(".RPT") && line.includes("lootmax")) {
      const match = line.match(/lootmax\s*:\s*(\d+)/i);

      if (match) {
        const val = parseInt(match[1]);

        if (val >= 1 && val <= 25) {
          console.log(`🔥 RPT TRIGGER ${val}`);
          console.log(line.trim());
        }
      }
    }
  }

  state.fileOffsets[file] = lines.length;
}

// ==============================
// LOOP (FIXED: API ALWAYS TRUTH)
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log("🔄 LOOP", new Date().toISOString());
  console.log("==============================");

  const apiFiles = await fetchFiles();

  if (!apiFiles.length) {
    console.log("🟡 NO FILES FROM API");
    return;
  }

  // IMPORTANT FIX:
  // API is the ONLY source of file list
  const filesToProcess = apiFiles;

  await ftpBatch(filesToProcess);

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (STABLE FIXED PIPELINE V3)");
loop();
setInterval(loop, LOOP_INTERVAL);
