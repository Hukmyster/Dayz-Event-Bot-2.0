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
// STATE (line tracking)
// ==============================
// remembers how many lines we've already read per file
const fileLineTracker = new Map();

// ==============================
// START LOG
// ==============================
console.log("🚀 BOT ONLINE (LINE TRACKING MODE)");
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

        return await res.json().catch(() => null);
    } catch {
        return null;
    }
}

// ==============================
// GET FILE LIST
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);
    return res?.data?.gameserver?.game_specific?.log_files || [];
}

// ==============================
// FTP READ FILE
// ==============================
async function readFileFromFTP(filePath) {
    const client = new Client();
    client.ftp.verbose = false;

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
// PROCESS FILE (LINE TRACKING)
// ==============================
function processFile(file, content) {
    const lines = content.split("\n");

    const lastIndex = fileLineTracker.get(file) || 0;

    // first time → skip old lines
    if (!fileLineTracker.has(file)) {
        fileLineTracker.set(file, lines.length);
        return 0;
    }

    let newHits = 0;

    for (let i = lastIndex; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        // LOOTMAX
        if (file.endsWith(".RPT") && lower.includes("lootmax")) {
            console.log("\n🔥 LOOT EVENT");
            console.log("📄", file);
            console.log(line);
            newHits++;
        }

        // KILL FEED
        if (file.endsWith(".ADM") && lower.includes("killed by")) {
            console.log("\n💀 KILL EVENT");
            console.log("📄", file);
            console.log(line);
            newHits++;
        }
    }

    // update tracker
    fileLineTracker.set(file, lines.length);

    return newHits;
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

        // QUIET MODE
        if (totalHits > 0) {
            console.log(`\n✅ NEW EVENTS FOUND: ${totalHits}`);
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
