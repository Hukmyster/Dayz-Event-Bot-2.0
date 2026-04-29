const ftpLib = require("basic-ftp");
const fs = require("fs");
const path = require("path");

const {
    API_TOKEN,
    FTP_HOST,
    FTP_USER,
    FTP_PASS,
    SERVICE_ID
} = process.env;

console.log("🚀 BOT STARTING (HYBRID FINAL STABLE)");
console.log("==============================");

if (!API_TOKEN || !FTP_HOST || !FTP_USER || !FTP_PASS) {
    console.log("❌ MISSING ENV VARS:");
    console.log({ API_TOKEN: !!API_TOKEN, FTP_HOST: !!FTP_HOST, FTP_USER: !!FTP_USER, FTP_PASS: !!FTP_PASS });
    process.exit?.(1);
}

let seenLines = new Set();
let loopCount = 0;

// -----------------------------
// FTP CLIENT
// -----------------------------
async function connectFTP() {
    const client = new ftpLib.Client();
    client.ftp.verbose = false;

    try {
        console.log("🔌 CONNECTING FTP...");
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        console.log("✅ FTP CONNECTED");
        return client;

    } catch (err) {
        console.log("❌ FTP CONNECT ERROR:");
        console.log(err);
        return null;
    }
}

// -----------------------------
// SAFE FILE READ (FIXES STREAM BUGS)
// -----------------------------
async function readFile(client, filePath) {
    console.log("📥 TRY READ:", filePath);

    try {
        let data = "";

        await client.downloadTo(
            {
                write: (chunk) => {
                    data += chunk.toString();
                }
            },
            filePath
        );

        if (!data || data.length === 0) {
            console.log("⚠️ EMPTY FILE:", filePath);
            return null;
        }

        return data;

    } catch (err) {
        console.log("❌ FTP READ ERROR:");
        console.log("FILE:", filePath);
        console.log("MESSAGE:", err.message);
        console.log("STACK:", err.stack);

        return null;
    }
}

// -----------------------------
// DYNAMIC FILE DISCOVERY (NO HARDCODE)
// -----------------------------
async function listFiles(client) {
    try {
        console.log("🔍 LISTING FILES FROM FTP...");

        const list = await client.list("/dayzps/config");

        const files = list
            .filter(f =>
                f.name.endsWith(".RPT") ||
                f.name.endsWith(".ADM")
            )
            .map(f => `/dayzps/config/${f.name}`);

        console.log("📂 FILES FOUND:", files.length);
        return files;

    } catch (err) {
        console.log("❌ FILE LIST ERROR:", err.message);
        return [];
    }
}

// -----------------------------
// TRIGGER PROCESSING
// -----------------------------
function processLine(line, file) {
    if (seenLines.has(line)) return false;

    seenLines.add(line);

    if (line.includes("lootmax")) {
        console.log("🔥 RPT TRIGGER (LOOTMAX)");
        console.log(line);
        return true;
    }

    if (line.includes("killed by")) {
        console.log("💀 ADM TRIGGER (KILL)");
        console.log(line);
        return true;
    }

    return false;
}

// -----------------------------
// MAIN LOOP
// -----------------------------
async function loop() {
    loopCount++;
    console.log("==============================");
    console.log(`🔄 LOOP START #${loopCount}`);

    const client = await connectFTP();
    if (!client) return;

    const files = await listFiles(client);

    for (const file of files) {

        console.log("🔍 PROCESS FILE:", file);

        const data = await readFile(client, file);

        if (!data) {
            console.log("⚠️ SKIP FILE (NO DATA):", file);
            continue;
        }

        const lines = data.split("\n");

        let hits = 0;

        for (const line of lines) {
            if (processLine(line, file)) {
                hits++;
            }
        }

        console.log(`📊 FILE RESULT: ${file} → ${hits} triggers`);
    }

    try {
        client.close();
    } catch {}

    console.log("🔌 LOOP END");
}

// -----------------------------
// START INTERVAL (60s DELTA MODE)
// -----------------------------
setInterval(loop, 60000);

// initial run
loop();
