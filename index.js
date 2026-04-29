import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";

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
const fileLineTracker = new Map();
let firstRun = true;

// ==============================
// START LOG
// ==============================
console.log("🚀 BOT ONLINE (INITIAL SWEEP + LIVE TRACKING)");
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
// API
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
// FILE LIST
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);
    return res?.data?.gameserver?.game_specific?.log_files || [];
}

// ==============================
// FTP READ
// ==============================
async function readFileFromFTP(filePath) {
    const client = new Client();
    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        const tmpPath = `/tmp/${Date.now()}_${path.basename(filePath)}`;
        await client.downloadTo(tmpPath, filePath);

        const content = fs.readFileSync(tmpPath, "utf8");
        client.close();
        return content;
    } catch {
        client.close();
        return null;
    }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
    const lines = content.split("\n");

    let startIndex = 0;

    if (!firstRun) {
        startIndex = fileLineTracker.get(file) || 0;
    }

    let hits = 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        if (file.endsWith(".RPT") && lower.includes("lootmax")) {
            console.log("\n🔥 LOOT EVENT");
            console.log("📄", file);
            console.log(line);
            hits++;
        }

        if (file.endsWith(".ADM") && lower.includes("killed by")) {
            console.log("\n💀 KILL EVENT");
            console.log("📄", file);
            console.log(line);
            hits++;
        }
    }

    // update tracker AFTER processing
    fileLineTracker.set(file, lines.length);

    return hits;
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    try {
        const files = await getFiles();

        if (!files.length) {
            console.log("⚠️ No files found");
            return;
        }

        let totalHits = 0;

        for (const file of files) {
            if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

            const content = await readFileFromFTP(file);
            if (!content) continue;

            totalHits += processFile(file, content);
        }

        if (firstRun) {
            console.log(`\n🧠 INITIAL SWEEP COMPLETE (${totalHits} events)`);
            firstRun = false;
        } else if (totalHits > 0) {
            console.log(`\n✅ NEW EVENTS: ${totalHits}`);
        } else {
            console.log(`💓 heartbeat ${new Date().toISOString()}`);
        }

    } catch (err) {
        console.log("❌ LOOP ERROR:", err.message);
    }
}

// ==============================
// START LOOP (2 MIN)
// ==============================
run();
setInterval(run, 120000);
