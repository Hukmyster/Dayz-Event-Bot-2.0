const ftp = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

const LOOP_TIME = 60000;

let lastRPT = null;
let lastADM = null;

/**
 * =========================
 * API CALL (FILE DISCOVERY)
 * =========================
 */
async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: "application/json"
        }
    });

    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
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

    return (
        res?.data?.gameserver?.game_specific?.log_files || []
    );
}

/**
 * =========================
 * FTP READ FILE
 * =========================
 */
async function readFile(filePath) {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        let content = "";

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
        console.log(`❌ FTP READ FAIL: ${filePath}`);
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
        console.log("\n🔥 LOOTMAX TRIGGER");
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes("killed by")) {
        console.log("\n💀 KILL TRIGGER");
        console.log(line);
    }
}

/**
 * =========================
 * GET LATEST FILE
 * =========================
 */
function getLatest(files, ext) {
    const filtered = files.filter(f =>
        f.toLowerCase().endsWith(ext)
    );

    return filtered.length
        ? filtered[filtered.length - 1]
        : null;
}

/**
 * =========================
 * MAIN LOOP
 * =========================
 */
async function run() {
    console.log("\n==============================");
    console.log("🔄 FTP HYBRID LOOP START");
    console.log("==============================");

    const files = await getFiles();

    if (!files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    const latestRPT = getLatest(files, ".rpt");
    const latestADM = getLatest(files, ".adm");

    console.log("📄 Latest RPT:", latestRPT);
    console.log("📄 Latest ADM:", latestADM);

    /**
     * =========================
     * RPT PROCESSING
     * =========================
     */
    if (latestRPT && latestRPT !== lastRPT) {
        console.log(`🆕 NEW RPT: ${latestRPT}`);
        lastRPT = latestRPT;

        const content = await readFile(latestRPT);

        if (content) {
            const lines = content.split("\n");

            for (const line of lines) {
                scanRPT(line);
            }
        }
    }

    /**
     * =========================
     * ADM PROCESSING
     * =========================
     */
    if (latestADM && latestADM !== lastADM) {
        console.log(`🆕 NEW ADM: ${latestADM}`);
        lastADM = latestADM;

        const content = await readFile(latestADM);

        if (content) {
            const lines = content.split("\n");

            for (const line of lines) {
                scanADM(line);
            }
        }
    }

    console.log("\n🔌 LOOP COMPLETE");
}

/**
 * =========================
 * START BOT
 * =========================
 */
console.log("Bot starting (FIXED FTP HYBRID MODE)");

run();
setInterval(run, LOOP_TIME);
