const API_BASE = "https://api.nitrado.net";

/**
 * =========================
 * SAFE ENV HANDLING (RAILWAY FIX)
 * =========================
 */
const API_TOKEN = (typeof process !== "undefined" && process.env)
    ? process.env.API_TOKEN
    : undefined;

const SERVICE_ID = (typeof process !== "undefined" && process.env)
    ? process.env.SERVICE_ID
    : undefined;

const FTP_HOST = (typeof process !== "undefined" && process.env)
    ? process.env.FTP_HOST
    : undefined;

const FTP_USER = (typeof process !== "undefined" && process.env)
    ? process.env.FTP_USER
    : undefined;

const FTP_PASS = (typeof process !== "undefined" && process.env)
    ? process.env.FTP_PASS
    : undefined;

/**
 * =========================
 * STARTUP DEBUG (CRITICAL)
 * =========================
 */
console.log("\n==============================");
console.log("🚀 BOT STARTING (HYBRID MODE)");
console.log("==============================");

console.log("🔐 ENV CHECK:");
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
    if (!API_TOKEN) {
        console.log("❌ NO API TOKEN - skipping API call");
        return null;
    }

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
 * GET FILE LIST
 * =========================
 */
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    return res?.data?.gameserver?.game_specific?.log_files || [];
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
 * FTP READ (HYBRID)
 * =========================
 */
async function readFile(filePath) {
    let ftp;
    try {
        ftp = require("basic-ftp");
    } catch {
        console.log("❌ FTP MODULE NOT INSTALLED");
        return null;
    }

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

    const files = await getFiles();

    if (!files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    console.log("📂 FILE COUNT:", files.length);

    const rpt = latest(files, ".rpt");
    const adm = latest(files, ".adm");

    console.log("📄 RPT:", rpt || "NONE");
    console.log("📄 ADM:", adm || "NONE");

    /**
     * RPT PROCESS
     */
    if (rpt) {
        console.log("\n📥 READING RPT");
        const content = await readFile(rpt);

        if (content) {
            console.log("✅ RPT READ OK");
            process(content, "RPT");
        } else {
            console.log("❌ RPT EMPTY");
        }
    }

    /**
     * ADM PROCESS
     */
    if (adm) {
        console.log("\n📥 READING ADM");
        const content = await readFile(adm);

        if (content) {
            console.log("✅ ADM READ OK");
            process(content, "ADM");
        } else {
            console.log("❌ ADM EMPTY");
        }
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
