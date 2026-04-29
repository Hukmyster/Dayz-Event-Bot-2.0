const API_BASE = "https://api.nitrado.net";

// ==============================
// ENV SAFE LOAD
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

console.log("\n==============================");
console.log("🚀 BOT STARTING (HYBRID FINAL STABLE)");
console.log("==============================");

console.log("🧠 NODE:", process.version);

console.log("📦 ENV CHECK:", {
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID,
    FTP_HOST: !!FTP_HOST,
    FTP_USER: !!FTP_USER,
    FTP_PASS: !!FTP_PASS
});

// ==============================
// API CALL
// ==============================
async function api(path) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: "application/json"
            }
        });

        return await res.json().catch(() => null);
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

    console.log("\n📂 FILES DETECTED:");
    files.forEach(f => console.log("📄", f));

    return files;
}

// ==============================
// TRIGGER SCANNER
// ==============================
function scanLine(file, line) {
    const lower = line.toLowerCase();

    if (file.toLowerCase().endsWith(".rpt") && lower.includes("lootmax")) {
        console.log("\n🔥 RPT TRIGGER (LOOTMAX)");
        console.log(line);
    }

    if (file.toLowerCase().endsWith(".adm") && lower.includes("killed by")) {
        console.log("\n💀 ADM TRIGGER (KILLED BY)");
        console.log(line);
    }
}

// ==============================
// FIXED FTP READ (REAL WORKING VERSION)
// ==============================
async function ftpRead(filePath) {
    try {
        const { Client } = await import("basic-ftp");
        const client = new Client();

        client.ftp.verbose = true;

        console.log("\n🔌 FTP CONNECTING...");
        console.log({
            host: FTP_HOST,
            user: FTP_USER,
            pass: FTP_PASS ? "SET" : "MISSING"
        });

        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false,
            passive: true
        });

        let data = "";

        // ✔ CORRECT STREAM HANDLING FOR basic-ftp
        const writable = {
            write(chunk) {
                data += chunk.toString("utf8");
            }
        };

        await client.downloadTo(writable, filePath);

        client.close();
        return data;

    } catch (err) {
        console.log("\n⚠️ FTP FAILED:");
        console.log("FILE:", filePath);
        console.log("ERROR:", err.message);
        return null;
    }
}

// ==============================
// PROCESS FILE CONTENT
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

    if (!files || !files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    for (const file of files) {
        const lower = file.toLowerCase();

        if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

        console.log("\n📥 READING:", file);

        const content = await ftpRead(file);

        if (!content) {
            console.log("⚠️ NO CONTENT:", file);
            continue;
        }

        processFile(file, content);
    }

    console.log("\n==============================");
    console.log("🔌 LOOP COMPLETE");
    console.log("==============================");
}

// ==============================
// START BOT
// ==============================
run();

// repeat every 60 seconds
setInterval(run, 60000);
