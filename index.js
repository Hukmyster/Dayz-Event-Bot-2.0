const fs = require("fs");
const path = require("path");
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
// STATE TRACKING
// ==============================
const seenLines = new Set();
let firstRun = true;

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

        return await res.json().catch(() => null);
    } catch {
        return null;
    }
}

// ==============================
// GET FILES
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    return res?.data?.gameserver?.game_specific?.log_files || [];
}

// ==============================
// FTP READ
// ==============================
async function ftpRead(filePath) {
    const client = new Client();

    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        const tmpFile = `/tmp/${Date.now()}.txt`;

        await client.downloadTo(tmpFile, filePath);
        client.close();

        return fs.readFileSync(tmpFile, "utf8");

    } catch {
        client.close();
        return null;
    }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
    const lowerFile = file.toLowerCase();
    const lines = content.split("\n");

    let newHits = 0;

    for (const line of lines) {
        const lower = line.toLowerCase();
        const key = file + line;

        if (seenLines.has(key)) continue;
        seenLines.add(key);

        // =========================
        // LOOT EVENTS
        // =========================
        if (lowerFile.endsWith(".rpt") && lower.includes("lootmax")) {
            if (!firstRun) {
                console.log("\n🔥 LOOT EVENT");
                console.log("📄", file);
                console.log(line);
            }
            newHits++;
        }

        // =========================
        // KILL EVENTS
        // =========================
        if (lowerFile.endsWith(".adm") && lower.includes("killed by")) {
            if (!firstRun) {
                console.log("\n💀 KILL EVENT");
                console.log("📄", file);
                console.log(line);
            }
            newHits++;
        }
    }

    return newHits;
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    let totalHits = 0;

    const files = await getFiles();

    for (const file of files) {
        const lowerFile = file.toLowerCase();

        if (!lowerFile.endsWith(".rpt") && !lowerFile.endsWith(".adm")) continue;

        const content = await ftpRead(file);
        if (!content) continue;

        totalHits += processFile(file, content);
    }

    // ==========================
    // FIRST RUN SUMMARY
    // ==========================
    if (firstRun) {
        console.log(`🧠 INITIAL SWEEP COMPLETE (${totalHits} events)`);
        firstRun = false;
        return;
    }

    // ==========================
    // QUIET MODE
    // ==========================
    if (totalHits > 0) {
        console.log(`\n⚡ ${totalHits} NEW EVENTS`);
    }
}

// ==============================
// START
// ==============================
console.log("🚀 BOT STARTED (CLEAN 2 MIN MODE)");

run();
setInterval(run, 120000);

// heartbeat so Railway stays alive
setInterval(() => {
    console.log("💓 heartbeat", new Date().toISOString());
}, 120000);
