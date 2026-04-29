const API_BASE = "https://api.nitrado.net";

/**
 * =========================
 * ENV SAFETY (RAILWAY FIX)
 * =========================
 */
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";

const FTP_HOST = process.env.FTP_HOST || "";
const FTP_USER = process.env.FTP_USER || "";
const FTP_PASS = process.env.FTP_PASS || "";

console.log("\n🔐 ENV CHECK:");
console.log("API_TOKEN:", API_TOKEN ? "OK" : "MISSING");
console.log("SERVICE_ID:", SERVICE_ID ? "OK" : "MISSING");
console.log("FTP_HOST:", FTP_HOST ? "OK" : "MISSING");
console.log("FTP_USER:", FTP_USER ? "OK" : "MISSING");
console.log("FTP_PASS:", FTP_PASS ? "OK" : "MISSING");

/**
 * =========================
 * SAFE API CALL
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

        const text = await res.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }

        return json;

    } catch (err) {
        console.log("❌ API ERROR:", err);
        return null;
    }
}

/**
 * =========================
 * GET FILE LIST
 * =========================
 */
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    return files;
}

/**
 * =========================
 * TRIGGERS
 * =========================
 */
function scanRPT(line) {
    if (line.toLowerCase().includes("lootmax")) {
        console.log("\n🔥 LOOTMAX HIT");
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes("killed by")) {
        console.log("\n💀 KILL HIT");
        console.log(line);
    }
}

/**
 * =========================
 * READ FILE VIA FTP
 * =========================
 */
async function readFile(filePath) {
    const ftp = require("basic-ftp");

    const client = new ftp.Client();
    client.ftp.verbose = false;

    let content = "";

    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        await client.downloadTo(
            {
                write: (data) => {
                    content += data.toString();
                }
            },
            filePath
        );

        client.close();
        return content;

    } catch (err) {
        console.log("❌ FTP FAIL:", filePath);
        client.close();
        return null;
    }
}

/**
 * =========================
 * PROCESS FILE CONTENT
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
 * GET LATEST FILE
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

    if (!API_TOKEN || !SERVICE_ID) {
        console.log("❌ MISSING API_TOKEN OR SERVICE_ID");
        return;
    }

    const files = await getFiles();

    console.log("📂 FILES FOUND:", files.length);

    if (!files.length) {
        console.log("⚠️ NO FILES RETURNED");
        return;
    }

    const rpt = latest(files, ".rpt");
    const adm = latest(files, ".adm");

    console.log("📄 RPT:", rpt);
    console.log("📄 ADM:", adm);

    /**
     * RPT PROCESSING
     */
    if (rpt) {
        console.log("\n📥 READING RPT:", rpt);
        const content = await readFile(rpt);

        if (content) process(content, "RPT");
        else console.log("❌ NO RPT CONTENT");
    }

    /**
     * ADM PROCESSING
     */
    if (adm) {
        console.log("\n📥 READING ADM:", adm);
        const content = await readFile(adm);

        if (content) process(content, "ADM");
        else console.log("❌ NO ADM CONTENT");
    }

    console.log("==============================");
    console.log("🔌 LOOP END");
}

/**
 * =========================
 * START BOT
 * =========================
 */
console.log("🚀 Bot starting (LOOTMAX + KILLFEED MODE)");

run();
setInterval(run, 60000);
