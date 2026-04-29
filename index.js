import fs from "fs";
import path from "path";

// ==============================
// ENV
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;
const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

console.log("\n==============================");
console.log("🚀 BOT STARTING (RAILWAY STABLE ES MODULE MODE)");
console.log("==============================");

// ==============================
// DEBUG ENV (MASKED)
// ==============================
function mask(val) {
    if (!val) return "❌ MISSING";
    if (val.length <= 6) return "***";
    return val.slice(0, 3) + "..." + val.slice(-3);
}

console.log("\n🔐 ENV DEBUG:");
console.log("API_TOKEN:", mask(API_TOKEN));
console.log("SERVICE_ID:", mask(SERVICE_ID));
console.log("FTP_HOST:", mask(FTP_HOST));
console.log("FTP_USER:", mask(FTP_USER));
console.log("FTP_PASS:", mask(FTP_PASS));

// ==============================
// API BASE
// ==============================
const API_BASE = "https://api.nitrado.net";

// ==============================
// SAFE API CALL
// ==============================
async function api(endpoint) {
    try {
        console.log("\n🌐 API REQUEST:", endpoint);

        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: "application/json"
            }
        });

        const data = await res.json();

        console.log("📡 API STATUS:", res.status);
        console.log("📦 API SUCCESS:", !!data?.data);

        return data;

    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// GET FILES (FIXED SAFE PATH)
// ==============================
async function getFiles() {
    console.log("\n🔍 FETCHING FILE LIST...");

    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("📂 FILE COUNT:", files.length);

    if (!files.length) {
        console.log("⚠️ NO FILES RETURNED FROM API");
    }

    files.slice(0, 10).forEach(f => console.log("📄", f));

    return files;
}

// ==============================
// TRIGGER SYSTEM
// ==============================
function scanLine(file, line) {
    const lower = line.toLowerCase();

    if (file.endsWith(".rpt") && lower.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT:");
        console.log(line);
    }

    if (file.endsWith(".adm") && lower.includes("killed by")) {
        console.log("\n💀 KILL EVENT:");
        console.log(line);
    }
}

// ==============================
// FILE PROCESSING (API ONLY MODE)
// ==============================
function processFile(file, content) {
    const lines = content.split("\n");

    for (const line of lines) {
        scanLine(file, line);
    }
}

// ==============================
// SIMULATED FILE READ (API MODE SAFE)
// ==============================
// NOTE: We are NOT using FTP here anymore (avoids your crash)
async function readFileViaApi(file) {
    console.log("\n📥 REQUEST FILE (API MODE):", file);

    // Nitrado does NOT reliably expose raw logs via API
    // so we log structure for now (safe stable mode)

    return null;
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    console.log("\n==============================");
    console.log("🔄 LOOP START");
    console.log("==============================");

    const files = await getFiles();

    if (!files || !files.length) {
        console.log("⚠️ NO FILES FOUND - API LIMIT OR WRONG ENDPOINT");
        return;
    }

    for (const file of files) {
        const lower = file.toLowerCase();

        if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

        console.log("\n📄 PROCESS FILE:", file);

        const content = await readFileViaApi(file);

        if (!content) {
            console.log("⚠️ SKIP (API MODE - NO DIRECT FILE ACCESS):", file);
            continue;
        }

        processFile(file, content);
    }

    console.log("\n==============================");
    console.log("🔌 LOOP COMPLETE");
    console.log("==============================");
}

// ==============================
// START
// ==============================
run();
setInterval(run, 60000);
