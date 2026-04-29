const ftp = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const seen = new Set();

const POLL_MS = 60000;

// =======================
// API CALL
// =======================
async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: "application/json",
        },
    });

    const json = await res.json().catch((e) => {
        console.log("❌ API JSON PARSE FAIL:", e.message);
        return null;
    });

    return json;
}

// =======================
// GET FILES (DYNAMIC)
// =======================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("📂 FILES FROM API:", files.length);
    return files;
}

// =======================
// FTP CONNECT (DEBUG MODE)
// =======================
async function connectFTP() {
    const client = new ftp.Client();

    client.ftp.verbose = true; // 🔥 FULL DEBUG ENABLED

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false,
            passive: true, // 🔥 IMPORTANT FIX
        });

        console.log("✅ FTP CONNECTED");
        return client;
    } catch (err) {
        console.log("❌ FTP CONNECT FAILED");
        console.log(err);
        return null;
    }
}

// =======================
// FIX PATH
// =======================
function fixPath(p) {
    // FORCE ROOT SLASH (CRITICAL FIX)
    if (!p.startsWith("/")) return `/${p}`;
    return p;
}

// =======================
// READ FILE SAFELY
// =======================
async function readFile(client, file) {
    const path = fixPath(file);

    console.log("📥 TRY READ:", path);

    try {
        let data = "";

        await client.downloadTo(
            {
                write: (chunk) => {
                    data += chunk.toString();
                },
            },
            path
        );

        console.log("✅ READ OK:", path, "bytes:", data.length);
        return data;
    } catch (err) {
        console.log("❌ FTP READ ERROR:");
        console.log("FILE:", path);
        console.log("MESSAGE:", err.message);
        console.log("STACK:", err.stack);
        return null;
    }
}

// =======================
// PROCESS LINES
// =======================
function processLines(text, file) {
    if (!text) return;

    const lines = text.split("\n");

    for (const line of lines) {
        if (!line) continue;

        const id = `${file}:${line}`;

        if (seen.has(id)) continue;
        seen.add(id);

        // RPT
        if (file.endsWith(".RPT") && line.includes("lootmax")) {
            console.log("🔥 RPT TRIGGER (LOOTMAX)");
            console.log(line);
        }

        // ADM
        if (file.endsWith(".ADM") && line.includes("killed by")) {
            console.log("💀 ADM TRIGGER (KILLED BY)");
            console.log(line);
        }
    }
}

// =======================
// LOOP
// =======================
async function loop() {
    console.log("\n==============================");
    console.log("🔄 LOOP START");

    const files = await getFiles();

    let client = await connectFTP();
    if (!client) {
        console.log("❌ NO FTP CLIENT - SKIPPING LOOP");
        return;
    }

    for (const file of files) {
        console.log("🔍 PROCESS FILE:", file);

        const data = await readFile(client, file);

        if (!data) {
            console.log("⚠️ EMPTY OR FAILED:", file);
            continue;
        }

        processLines(data, file);
    }

    client.close();
    console.log("🔌 LOOP END");
}

// =======================
// START
// =======================
console.log("🚀 BOT STARTING (FULL FTP DEBUG MODE)");

loop();
setInterval(loop, POLL_MS);
