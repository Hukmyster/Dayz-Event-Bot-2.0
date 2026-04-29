// ==============================
// RAILWAY SAFE NITRADO BOT (HARDENED)
// ==============================

const API_BASE = "https://api.nitrado.net";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ftpPkg from "basic-ftp";

const { Client } = ftpPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================
// CONFIG
// ==============================
const INTERVAL_MS = 2 * 60 * 1000;
const DEBUG = false;

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
let seen = new Set();
let running = false;

// ==============================
// SAFE LOG
// ==============================
function log(msg) {
    console.log(`[BOT] ${msg}`);
}

// ==============================
// STARTUP
// ==============================
console.log("\n==============================");
console.log("🚀 BOT ONLINE (RAILWAY SAFE MODE)");
console.log("==============================");
console.log("NODE:", process.version);
console.log("ENV:", {
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID,
    FTP_HOST: !!FTP_HOST,
    FTP_USER: !!FTP_USER,
    FTP_PASS: !!FTP_PASS
});
console.log("==============================\n");

// ==============================
// CRASH PROTECTION (IMPORTANT)
// ==============================
process.on("uncaughtException", (err) => {
    console.log("🔥 CRASH CAUGHT:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("🔥 PROMISE ERROR:", err?.message || err);
});

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

        return await res.json();
    } catch (e) {
        if (DEBUG) log("API FAIL " + e.message);
        return null;
    }
}

// ==============================
// FILE LIST
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    log(`FILES: ${files.length}`);

    return files;
}

// ==============================
// TRIGGER
// ==============================
function scan(file, line) {
    const key = file + line;
    if (seen.has(key)) return;
    seen.add(key);

    const l = line.toLowerCase();

    if (l.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX");
        console.log(file);
        console.log(line);
    }

    if (l.includes("killed by")) {
        console.log("\n💀 KILL");
        console.log(file);
        console.log(line);
    }
}

// ==============================
// FTP READ (NO TEMP FILES)
// ==============================
async function ftpRead(filePath) {
    const client = new Client();

    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false,
            passive: true
        });

        let data = "";

        await client.downloadTo(
            {
                write: (chunk) => {
                    data += chunk.toString();
                }
            },
            filePath
        );

        client.close();
        return data;

    } catch (err) {
        try { client.close(); } catch {}

        if (DEBUG) log("FTP FAIL " + filePath);

        return null;
    }
}

// ==============================
// PROCESS
// ==============================
async function runOnce() {
    if (running) return;
    running = true;

    try {
        const files = await getFiles();

        for (const file of files) {
            if (!file.endsWith(".rpt") && !file.endsWith(".adm")) continue;

            const content = await ftpRead(file);
            if (!content) continue;

            const lines = content.split("\n");

            for (const line of lines) {
                scan(file, line);
            }
        }
    } catch (err) {
        log("RUN ERROR: " + err.message);
    }

    running = false;
}

// ==============================
// KEEP ALIVE LOOP (IMPORTANT)
// ==============================
setInterval(() => {
    runOnce();

    // heartbeat so Railway NEVER idles
    console.log("💓 heartbeat " + new Date().toISOString());

}, INTERVAL_MS);

// initial run
runOnce();
