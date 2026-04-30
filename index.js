const fs = require("fs");
const { Client } = require("basic-ftp");

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 60 * 1000; // 🔥 1 MIN LOOP (IMPORTANT)

// ==============================
// ENV
// ==============================
const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

// ==============================
// STATE
// ==============================
const state = {
  activeFiles: {
    RPT: null,
    ADM: null,
  },
  offsets: {}, // byte offsets per file
};

// ==============================
// FETCH FILE LIST (API)
// ==============================
async function fetchFiles() {
  try {
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

    return data?.data?.gameserver?.game_specific?.log_files || [];
  } catch (err) {
    console.log("❌ API ERROR:", err.message);
    return [];
  }
}

// ==============================
// PICK LATEST FILES
// ==============================
function selectLatest(files) {
  const rpt = files
    .filter(f => f.endsWith(".RPT"))
    .sort()
    .pop();

  const adm = files
    .filter(f => f.endsWith(".ADM"))
    .sort()
    .pop();

  return { rpt, adm };
}

// ==============================
// PROCESS NEW DATA ONLY
// ==============================
function processLines(file, newContent) {
  const lines = newContent.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    // ADM
    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("\n💀 ADM EVENT");
      console.log(line.trim());
    }

    // RPT
    if (file.endsWith(".RPT") && line.includes("lootmax")) {
      const match = line.match(/lootmax\s*:\s*(\d+)/i);

      if (match) {
        const val = parseInt(match[1]);

        if (val >= 1 && val <= 25) {
          console.log(`\n🔥 LOOT EVENT ${val}`);
          console.log(line.trim());
        }
      }
    }
  }
}

// ==============================
// READ FILE (DELTA MODE)
// ==============================
async function readFileDelta(client, file) {
  try {
    const tmp = `/tmp/${Date.now()}.log`;

    await client.downloadTo(tmp, file);

    const stats = fs.statSync(tmp);
    const size = stats.size;

    const lastOffset = state.offsets[file] || 0;

    // 🔥 If file shrank → reset (new restart)
    if (size < lastOffset) {
      console.log(`🔄 FILE RESET DETECTED: ${file}`);
      state.offsets[file] = 0;
    }

    const buffer = fs.readFileSync(tmp);
    const newData = buffer.slice(state.offsets[file] || 0).toString();

    if (newData.length > 0) {
      console.log(`📥 NEW DATA: ${file}`);
      processLines(file, newData);
    }

    state.offsets[file] = size;

  } catch (err) {
    console.log(`❌ READ FAIL: ${file}`);
    console.log(`   ↳ ${err.message}`);
  }
}

// ==============================
// MAIN LOOP
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log("🔄 LOOP", new Date().toISOString());
  console.log("==============================");

  const files = await fetchFiles();

  if (!files.length) {
    console.log("🟡 NO FILES");
    return;
  }

  const { rpt, adm } = selectLatest(files);

  // Detect file switches
  if (rpt && state.activeFiles.RPT !== rpt) {
    console.log(`🆕 SWITCH RPT → ${rpt}`);
    state.activeFiles.RPT = rpt;
    state.offsets[rpt] = 0;
  }

  if (adm && state.activeFiles.ADM !== adm) {
    console.log(`🆕 SWITCH ADM → ${adm}`);
    state.activeFiles.ADM = adm;
    state.offsets[adm] = 0;
  }

  const client = new Client();

  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    if (state.activeFiles.RPT) {
      await readFileDelta(client, state.activeFiles.RPT);
    }

    if (state.activeFiles.ADM) {
      await readFileDelta(client, state.activeFiles.ADM);
    }

  } catch (err) {
    console.log("❌ FTP SESSION ERROR:", err.message);
  }

  client.close();

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 BOT ONLINE (LIVE TRACKING MODE)");
loop();
setInterval(loop, LOOP_INTERVAL);
