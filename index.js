const ftp = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

let lastRPT = null;
let lastADM = null;

/**
 * =========================
 * API CALL
 * =========================
 */
async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: "application/json"
        }
    });

    const json = await res.json().catch(() => null);
    return json;
}

/**
 * =========================
 * GET FILE LIST
 * =========================
 */
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    return res?.data?.gameserver?.game_specific?.log_files || [];
}

/**
 * =========================
 * FTP READ
 * =========================
 */
async function readFile(filePath) {
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
        console.log(`❌ FTP FAIL: ${filePath}`);
        client.close();
        return null;
    }
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
 * PROCESS FILE
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
    const filtered = files.filter(f =>
        f.toLowerCase().endsWith(ext)
    );

    return filtered.length ? filtered[filtered.length - 1] : null;
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

    console.log("📄 RPT:", rpt);
    console.log("📄 ADM:", adm);

    /**
     * RPT HANDLING
     */
    if (rpt && rpt !== lastRPT) {
        console.log(`🆕 NEW RPT: ${rpt}`);
        lastRPT = rpt;

        const content = await readFile(rpt);
        if (content) process(content, "RPT");
    }

    /**
     * ADM HANDLING
     */
    if (adm && adm !== lastADM) {
        console.log(`🆕 NEW ADM: ${adm}`);
        lastADM = adm;

        const content = await readFile(adm);
        if (content) process(content, "ADM");
    }

    console.log("==============================");
    console.log("🔌 LOOP END");
}

/**
 * =========================
 * START
 * =========================
 */
console.log("Bot starting (FINAL TRIGGER MODE)");

run();
setInterval(run, 60000);
