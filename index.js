import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV
// ==============================
const {
    API_TOKEN,
    SERVICE_ID,
    FTP_HOST,
    FTP_USER,
    FTP_PASS
} = process.env;

// ==============================
// SETTINGS
// ==============================
const LOOP_INTERVAL = 120000; // 2 minutes
const DEBUG = false;

// ==============================
// STATE (prevents spam)
// ==============================
const seenLines = new Set();

// ==============================
// START LOG
// ==============================
console.log("==============================");
console.log("🚀 BOT ONLINE (STABLE HYBRID)");
console.log("==============================");
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

        const data = await res.json().catch(() => null);

        if (DEBUG) console.log("API:", pathUrl);

        return data;

    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// GET FILES
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    if (DEBUG) console.log("FILES:", files);

    return files;
}

// ==============================
// FTP READ (WORKING METHOD)
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

        const tmpFile = path.join(
            process.cwd(),
            `tmp_${Date.now()}.txt`
        );

        await client.downloadTo(tmpFile, filePath);
        client.close();

        const data = fs.readFileSync(tmpFile, "utf8");
        fs.unlinkSync(tmpFile);

        return data;

    } catch (err) {
        try { client.close(); } catch {}

        if (DEBUG) console.log("FTP FAIL:", filePath, err.message);

        return null;
    }
}

// ==============================
// SCAN LINE (NO DUPLICATES)
// ==============================
function scanLine(file, line) {
    const key = file + line;

    if (seenLines.has(key)) return;
    seenLines.add(key);

    const lower = line.toLowerCase();

    // LOOTMAX
    if (file.endsWith(".RPT") && lower.includes("lootmax")) {
        console.log("\n🔥 LOOT EVENT");
        console.log("📄", file);
        console.log(line);
    }

    // KILL
    if (file.endsWith(".ADM") && lower.includes("killed by")) {
        console.log("\n💀 KILL EVENT");
        console.log("📄", file);
        console.log(line);
    }
}

// ==============================
// PROCESS FILE
// ==============================
function processFile(file, content) {
    const lines = content.split("\n");

    for (const line of lines) {
        scanLine(file, line);
    }
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    const files = await getFiles();

    if (!files.length) {
        console.log("💓 heartbeat (no files)");
        return;
    }

    let foundSomething = false;

    // only scan newest few files (faster + cleaner)
    const recentFiles = files.slice(0, 3);

    for (const file of recentFiles) {
        if (!file.endsWith(".RPT") && !file.endsWith(".ADM")) continue;

        const content = await ftpRead(file);
        if (!content) continue;

        const beforeSize = seenLines.size;

        processFile(file, content);

        if (seenLines.size > beforeSize) {
            foundSomething = true;
        }
    }

    if (!foundSomething) {
        console.log("💓 heartbeat", new Date().toISOString());
    }
}

// ==============================
// START LOOP
// ==============================
run();
setInterval(run, LOOP_INTERVAL);
