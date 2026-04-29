const API_BASE = "https://api.nitrado.net";

const fs = require("fs");

const ENV = process.env;

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

console.log("\n==============================");
console.log("🚀 BOT STARTING (NITRADO API STABLE MODE)");
console.log("==============================");

console.log("🧠 NODE:", process.version);
console.log("🔑 AUTH CHECK:", {
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID
});

// ==============================
// STATE (DELTA SYSTEM)
// ==============================
const seenFiles = new Set();
const seenLines = new Set();

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

        if (!res.ok) {
            console.log("❌ API FAIL:", res.status, path);
            return null;
        }

        return await res.json();
    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

// ==============================
// FILE DISCOVERY (FIXED)
// ==============================
async function getFiles() {
    console.log("\n🔍 LIST FILES FROM API...");

    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const raw =
        res?.data?.gameserver?.file_browser?.files ||
        res?.data?.gameserver?.files ||
        res?.data ||
        "";

    let files = [];

    if (Array.isArray(raw)) {
        files = raw.map(f => f.name || f.path || f);
    } else if (typeof raw === "string") {
        files = raw
            .split("\n")
            .map(line => {
                const parts = line.split(";");
                return parts[parts.length - 1]?.trim();
            })
            .filter(Boolean);
    }

    console.log(`📂 FILES FOUND: ${files.length}`);

    files.forEach(f => console.log("📄", f));

    return files;
}

// ==============================
// SAFE TRIGGER ENGINE
// ==============================
function scanLine(file, line) {
    const key = `${file}:${line}`;

    if (seenLines.has(key)) return;
    seenLines.add(key);

    const lower = line.toLowerCase();

    if (lower.includes("lootmax")) {
        console.log("\n🔥 LOOTMAX TRIGGER");
        console.log("📄 FILE:", file);
        console.log("📌 LINE:", line);
    }

    if (lower.includes("killed by")) {
        console.log("\n💀 KILL TRIGGER");
        console.log("📄 FILE:", file);
        console.log("📌 LINE:", line);
    }
}

// ==============================
// OPTIONAL FTP FALLBACK (SAFE)
// ==============================
async function readFileFTP(filePath) {
    try {
        const { Client } = await import("basic-ftp");
        const client = new Client();

        await client.access({
            host: ENV.FTP_HOST,
            user: ENV.FTP_USER,
            password: ENV.FTP_PASS,
            secure: false
        });

        const tmp = `/tmp/${Date.now()}.log`;

        await client.downloadTo(tmp, filePath);

        client.close();

        return fs.readFileSync(tmp, "utf8");

    } catch (err) {
        console.log("⚠️ FTP READ FAILED:", filePath);
        console.log("   ", err.message);
        return null;
    }
}

// ==============================
// PROCESS FILE (DELTA SAFE)
// ==============================
async function processFile(file) {
    if (seenFiles.has(file)) {
        console.log("⏭️ SKIP OLD FILE:", file);
        return;
    }

    seenFiles.add(file);

    console.log("\n📥 PROCESSING FILE:", file);

    let content = await readFileFTP(file);

    if (!content) {
        console.log("⚠️ NO CONTENT:", file);
        return;
    }

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

        await processFile(file);
    }

    console.log("\n🔌 LOOP END");
}

run();
setInterval(run, 60000);
