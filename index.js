import fs from "fs";
import path from "path";
import basicFtp from "basic-ftp";

const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV DEBUG (SAFE)
// ==============================
const ENV = process.env;

function mask(v) {
    if (!v) return "MISSING";
    return v.slice(0, 4) + "****" + v.slice(-4);
}

console.log("\n==============================");
console.log("🚀 BOT STARTING (STABLE NITRADO API MODE)");
console.log("==============================");

console.log("🧠 NODE:", process.version);

console.log("\n📦 ENV DEBUG (masked):");
console.log({
    API_TOKEN: mask(ENV.API_TOKEN),
    SERVICE_ID: ENV.SERVICE_ID || "MISSING",
    FTP_HOST: ENV.FTP_HOST || "MISSING",
    FTP_USER: mask(ENV.FTP_USER),
    FTP_PASS: mask(ENV.FTP_PASS)
});

// ==============================
// API CALL
// ==============================
async function api(pathUrl) {
    try {
        const res = await fetch(`${API_BASE}${pathUrl}`, {
            headers: {
                Authorization: `Bearer ${ENV.API_TOKEN}`,
                Accept: "application/json"
            }
        });

        const json = await res.json();

        console.log("\n🌐 API CALL:", pathUrl);
        console.log("📡 STATUS OK:", res.ok);

        return json;

    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// GET FILE LIST (API)
// ==============================
async function getFiles() {
    console.log("\n🔍 FETCHING FILE LIST...");

    const res = await api(`/services/${ENV.SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("📂 FILES FOUND:", files.length);

    return files;
}

// ==============================
// TRIGGERS
// ==============================
function scanLine(file, line) {
    const lower = line.toLowerCase();

    if (lower.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT:");
        console.log("📄 FILE:", file);
        console.log(line);
    }

    if (lower.includes("killed by")) {
        console.log("\n💀 KILL EVENT:");
        console.log("📄 FILE:", file);
        console.log(line);
    }
}

// ==============================
// FTP READ (ROBUST VERSION)
// ==============================
async function ftpRead(filePath) {
    const client = new basicFtp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: ENV.FTP_HOST,
            user: ENV.FTP_USER,
            password: ENV.FTP_PASS,
            secure: false
        });

        const tmp = path.join("/tmp", `log_${Date.now()}.txt`);

        console.log("📥 FTP READ:", filePath);

        await client.downloadTo(tmp, filePath);

        const data = fs.readFileSync(tmp, "utf8");

        client.close();

        return data;

    } catch (err) {
        client.close();

        // ✔ IMPORTANT: ignore missing file errors
        if (err.message.includes("550")) {
            console.log("⚠️ FILE NOT FOUND (SKIP):", filePath);
            return null;
        }

        console.log("❌ FTP ERROR:", err.message);
        return null;
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

    console.log("\n🔌 LOOP END");
}

// ==============================
// START
// ==============================
run();
setInterval(run, 60000);
