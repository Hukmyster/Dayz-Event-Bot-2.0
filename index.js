import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import basicFtp from "basic-ftp";

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV
// ==============================
const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

console.log("\n🚀 BOT STARTING (STABLE NITRADO API MODE)\n");

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
    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// GET FILE LIST (FIXED SAFE PATH)
// ==============================
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("\n📂 FILES FOUND:", files.length);

    return files;
}

// ==============================
// TRIGGERS
// ==============================
function scanLine(file, line) {
    const lower = line.toLowerCase();

    if (file.endsWith(".rpt") && lower.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT:");
        console.log(line);
    }

    if (file.endsWith(".adm") && lower.includes("killed by")) {
        console.log("\n💀 KILL LOG:");
        console.log(line);
    }
}

// ==============================
// FTP READ (STABLE STREAM FIX)
// ==============================
async function ftpRead(filePath) {
    const client = new basicFtp.Client();

    try {
        console.log("📥 FTP READ:", filePath);

        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        const tmpFile = path.join("/tmp", `log_${Date.now()}.txt`);

        await client.downloadTo(tmpFile, filePath);

        const content = fs.readFileSync(tmpFile, "utf8");

        return content;

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
    for (const line of lines) scanLine(file, line);
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    console.log("\n🔄 LOOP START");

    const files = await getFiles();

    if (!files?.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    for (const file of files) {
        const name = file.toLowerCase();

        if (!name.endsWith(".rpt") && !name.endsWith(".adm")) continue;

        const content = await ftpRead(file);

        if (!content) continue;

        processFile(file, content);
    }

    console.log("🔌 LOOP END");
}

// start
run();
setInterval(run, 60000);
