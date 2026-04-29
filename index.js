import ftp from "basic-ftp";

const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

// FTP CREDENTIALS (ADD IN RAILWAY ENV)
const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

const LOOP_TIME = 60 * 1000;

let lastRPT = "";
let lastADM = "";

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

    return await res.json();
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
 * FTP READ FILE
 * =========================
 */
async function readFTPFile(filePath) {
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
        console.log(`❌ FTP READ ERROR: ${filePath}`);
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
        console.log("\n🔥 LOOTMAX HIT (RPT)");
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes("killed by")) {
        console.log("\n💀 KILL EVENT (ADM)");
        console.log(line);
    }
}

/**
 * =========================
 * FIND NEWEST FILES
 * =========================
 */
function getLatest(files, ext) {
    const filtered = files.filter(f => f.toLowerCase().endsWith(ext));
    return filtered.length ? filtered[filtered.length - 1] : null;
}

/**
 * =========================
 * MAIN LOOP
 * =========================
 */
async function run() {
    console.log("\n==============================");
    console.log("🔄 FTP HYBRID LOOP");
    console.log("==============================");

    const files = await getFiles();

    const latestRPT = getLatest(files, ".rpt");
    const latestADM = getLatest(files, ".adm");

    console.log("📄 Latest RPT:", latestRPT);
    console.log("📄 Latest ADM:", latestADM);

    /**
     * =========================
     * RPT PROCESS
     * =========================
     */
    if (latestRPT && latestRPT !== lastRPT) {
        console.log(`🆕 NEW RPT: ${latestRPT}`);
        lastRPT = latestRPT;

        const content = await readFTPFile(latestRPT);

        if (content) {
            const lines = content.split("\n");
            for (const line of lines) scanRPT(line);
        }
    }

    /**
     * =========================
     * ADM PROCESS
     * =========================
     */
    if (latestADM && latestADM !== lastADM) {
        console.log(`🆕 NEW ADM: ${latestADM}`);
        lastADM = latestADM;

        const content = await readFTPFile(latestADM);

        if (content) {
            const lines = content.split("\n");
            for (const line of lines) scanADM(line);
        }
    }

    console.log("\n🔌 LOOP COMPLETE");
}

/**
 * START
 */
console.log("Bot starting (FTP HYBRID MODE)");
run();
setInterval(run, LOOP_TIME);
