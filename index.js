const API_BASE = "https://api.nitrado.net";

/**
 * =========================
 * STARTUP DIAGNOSTICS (RAILWAY PROOF)
 * =========================
 */

console.log("\n==============================");
console.log("🚀 BOT STARTING (DIAGNOSTIC MODE)");
console.log("==============================");

console.log("🧠 NODE PROCESS INFO:");
console.log("process.title:", process.title);
console.log("node version:", process.version);

console.log("\n🔐 RAW ENV KEYS:");
console.log(Object.keys(process.env || {}));

/**
 * =========================
 * ENV VARIABLES
 * =========================
 */
const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

/**
 * =========================
 * ENV VALIDATION (CRITICAL)
 * =========================
 */
console.log("\n🔐 PARSED ENV CHECK:");
console.log("API_TOKEN:", API_TOKEN ? "OK" : "MISSING");
console.log("SERVICE_ID:", SERVICE_ID ? "OK" : "MISSING");
console.log("FTP_HOST:", FTP_HOST ? "OK" : "MISSING");
console.log("FTP_USER:", FTP_USER ? "OK" : "MISSING");
console.log("FTP_PASS:", FTP_PASS ? "OK" : "MISSING");

if (!API_TOKEN || !SERVICE_ID) {
    console.log("\n❌ FATAL: Missing required Railway variables");
    console.log("👉 Fix Railway Variables OR wrong service deployment");
    process.exit(1);
}

/**
 * =========================
 * API CALL
 * =========================
 */
async function api(path) {
    try {
        const res = await fetch(`${API_BASE}${path}`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: "application/json"
            }
        });

        const json = await res.json().catch(() => null);
        return json;

    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return null;
    }
}

/**
 * =========================
 * GET FILES
 * =========================
 */
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    console.log("\n📂 FILES FOUND:", files.length);

    return files;
}

/**
 * =========================
 * TRIGGERS
 * =========================
 */
function scanRPT(line) {
    if (line.toLowerCase().includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT:");
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes("killed by")) {
        console.log("\n💀 KILL HIT:");
        console.log(line);
    }
}

/**
 * =========================
 * FTP (OPTIONAL HYBRID)
 * =========================
 */
async function readFile(filePath) {
    try {
        const ftp = require("basic-ftp");
        const client = new ftp.Client();

        let content = "";

        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        await client.downloadTo(
            {
                write: (data) => (content += data.toString())
            },
            filePath
        );

        client.close();
        return content;

    } catch (err) {
        console.log("❌ FTP ERROR:", filePath);
        return null;
    }
}

/**
 * =========================
 * PROCESS FILES
 * =========================
 */
function process(content, type) {
    const lines = content.split("\n");

    for (const line of lines) {
        if (type === "RPT") scanRPT(line);
        if (type === "ADM") scanADM(line);
    }
}

/**
 * =========================
 * LATEST FILE PICKER
 * =========================
 */
function latest(files, ext) {
    const list = files.filter(f =>
        f.toLowerCase().endsWith(ext)
    );

    return list.length ? list[list.length - 1] : null;
}

/**
 * =========================
 * MAIN LOOP
 * =========================
 */
async function run() {
    console.log("\n==============================");
    console.log("🔄 LOOP START");
    console.log("==============================");

    const files = await getFiles();

    if (!files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    const rpt = latest(files, ".rpt");
    const adm = latest(files, ".adm");

    console.log("📄 RPT:", rpt || "NONE");
    console.log("📄 ADM:", adm || "NONE");

    if (rpt) {
        const content = await readFile(rpt);
        if (content) process(content, "RPT");
        else console.log("❌ RPT READ FAIL");
    }

    if (adm) {
        const content = await readFile(adm);
        if (content) process(content, "ADM");
        else console.log("❌ ADM READ FAIL");
    }

    console.log("==============================");
    console.log("🔌 LOOP END");
}

/**
 * =========================
 * START BOT
 * =========================
 */
run();
setInterval(run, 60000);
