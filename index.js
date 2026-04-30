const fetch = global.fetch;

// ==============================
// CONFIG
// ==============================
const LOOP_INTERVAL = 0.5 * 60 * 1000;
const FAIL_THRESHOLD = 2; // loops before fallback

// ==============================
// ENV
// ==============================
const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

// ==============================
// STATE
// ==============================
const state = {
  knownFiles: new Set(),
  fileOffsets: {},

  failCount: 0,
  mode: "NORMAL", // NORMAL | DISCOVERY
};

// ==============================
// FETCH FILE LIST
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
// DOWNLOAD FILE (API)
// ==============================
async function downloadFile(file) {
  try {
    const url = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server/download?file=${encodeURIComponent(file)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    return text;

  } catch (err) {
    console.log(`❌ DOWNLOAD FAIL: ${file}`);
    console.log(`   ↳ ${err.message}`);
    return null;
  }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
  const lines = content.split("\n");
  const last = state.fileOffsets[file] || 0;

  let newData = false;

  for (let i = last; i < lines.length; i++) {
    const line = lines[i];

    if (file.endsWith(".ADM") && line.includes("killed by")) {
      console.log("\n💀 ADM TRIGGER");
      console.log(line.trim());
      newData = true;
    }

    if (file.endsWith(".RPT") && line.includes("lootmax")) {
      const match = line.match(/lootmax\s*:\s*(\d+)/i);

      if (match) {
        const val = parseInt(match[1]);

        if (val >= 1 && val <= 25) {
          console.log(`\n🔥 RPT TRIGGER ${val}`);
          console.log(line.trim());
          newData = true;
        }
      }
    }
  }

  state.fileOffsets[file] = lines.length;
  return newData;
}

// ==============================
// DISCOVERY HELPERS
// ==============================
function deepSearch(obj, results = []) {
  if (!obj) return results;

  if (typeof obj === "string") {
    if (
      obj.toLowerCase().includes(".rpt") ||
      obj.toLowerCase().includes(".adm") ||
      obj.toLowerCase().includes("log")
    ) {
      results.push(obj);
    }
  }

  if (typeof obj === "object") {
    for (const key in obj) {
      deepSearch(obj[key], results);
    }
  }

  return results;
}

async function apiCall(endpoint) {
  try {
    const res = await fetch(`https://api.nitrado.net${endpoint}`, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
    });

    const text = await res.text();

    console.log(`📡 ${endpoint} → ${res.status}`);

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// ==============================
// DISCOVERY MODE
// ==============================
async function runDiscovery() {
  console.log("\n🧠 ENTERING DISCOVERY MODE");

  const endpoints = [
    `/services/${SERVICE_ID}/gameservers`,
    `/services/${SERVICE_ID}/gameservers/file_server/list`,
    `/services/${SERVICE_ID}/file_server/list`,
    `/services/${SERVICE_ID}/gameservers/logs`,
  ];

  let discovered = [];

  for (const ep of endpoints) {
    const data = await apiCall(ep);
    if (!data) continue;

    const found = deepSearch(data);

    if (found.length) {
      console.log(`🔥 FOUND (${ep})`);
      found.forEach(f => console.log("   →", f));
      discovered.push(...found);
    }
  }

  if (discovered.length > 0) {
    console.log("✅ DISCOVERY FOUND DATA → RETURNING TO NORMAL MODE");
    state.mode = "NORMAL";
    state.failCount = 0;
  } else {
    console.log("❌ DISCOVERY FAILED → STILL NO ACCESS");
  }
}

// ==============================
// NORMAL MODE LOOP
// ==============================
async function runNormal() {
  const files = await fetchFiles();

  if (files.length === 0) {
    state.failCount++;
    return;
  }

  let success = false;

  for (const file of files) {
    const content = await downloadFile(file);
    if (!content) continue;

    if (!state.knownFiles.has(file)) {
      console.log(`🆕 NEW FILE: ${file}`);
      state.knownFiles.add(file);
    }

    const newData = processFile(file, content);
    if (newData) success = true;
  }

  if (success) {
    state.failCount = 0;
  } else {
    state.failCount++;
  }

  console.log(`⚠️ FAIL COUNT: ${state.failCount}`);

  if (state.failCount >= FAIL_THRESHOLD) {
    console.log("\n🚨 SWITCHING TO DISCOVERY MODE");
    state.mode = "DISCOVERY";
  }
}

// ==============================
// MAIN LOOP
// ==============================
async function loop() {
  console.log("\n==============================");
  console.log(`🔄 LOOP ${new Date().toISOString()}`);
  console.log(`🧭 MODE: ${state.mode}`);
  console.log("==============================");

  if (state.mode === "NORMAL") {
    await runNormal();
  } else {
    await runDiscovery();
  }

  console.log("🔌 LOOP END");
}

// ==============================
// START
// ==============================
console.log("🚀 HYBRID BOT (AUTO FALLBACK MODE)");
loop();
setInterval(loop, LOOP_INTERVAL);
