import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV
// ==============================
const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

// ==============================
// DEBUG ENV (masked)
// ==============================
console.log("\n==============================");
console.log("🚀 BOT STARTING (6 MIN STABLE LOOP MODE)");
console.log("==============================");

console.log("🧠 NODE:", process.version);

console.log("📦 ENV CHECK:", {
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID,
    FTP_HOST: !!FTP_HOST,
    FTP_USER: !!FTP_USER,
    FTP_PASS: !!FTP_PASS
});

console.log("==============================\n");

// ==============================
// MEMORY (CRITICAL)
// prevents duplicate hits
// ==============================
const seenLines = new Set();

// ==============================
// API CALL
// ==============================
async function api(endpoint) {
    try {
        console.log("🌐 API CALL:", endpoint);

        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: "application/json"
            }
        });

        const json = await res.json();

        console.log("📡 STATUS:", json?.meta?.status || "unknown");

        return json;
    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// GET FILE LIST
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("📂 FILES FOUND:", files.length);

    return files;
}

// ==============================
// TRIGGER SCANNER
// ==============================
function scanLine(file, line) {
    if (!line) return;

    const key = file + ":" + line;

    if (seenLines.has(key)) return;
    seenLines.add(key);

    const lower = line.toLowerCase();

    // ================= LOOTMAX =================
    if (file.endsWith(".RPT") && lower.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT:");
        console.log("📄 FILE:", file);
        console.log(line);
    }

    // ================= KILLFEED =================
    if (file.endsWith(".ADM") && lower.includes("killed by")) {
        console.log("\n💀 KILL EVENT:");
        console.log("📄 FILE:", file);
        console.log(line);
    }
}

// ==============================
// FTP READ SAFE
// ==============================
async function ftpRead(filePath) {
    const client = new Client();
    client.ftp.verbose = false;

    try {
        console.log("📥 FTP READ:", filePath);

        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false,
            passive: true
        });

        const tmpFile = path.join("/tmp", `log_${Date.now()}.txt`);

        await client.downloadTo(tmpFile, filePath);

        const data = fs.readFileSync(tmpFile, "utf8");

        return data;

    } catch (err) {
        console.log("❌ FTP ERROR:", err.message);
        return null;
    } finally {
        client.close();
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
// LOOP
// ==============================
async function run() {
    console.log("\n==============================");
    console.log("🔄 LOOP START");
    console.log("==============================");

    const files = await getFiles();

    if (!files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    for (const file of files) {
        const lower = file.toLowerCase();

        if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

        const content = await ftpRead(file);

        if (!content) continue;

        processFile(file, content);
    }

    console.log("🔌 LOOP END");
}

// ==============================
// START (6 MIN LOOP)
// ==============================
run();
setInterval(run, 6 * 60 * 1000);
