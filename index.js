const API_BASE = "https://api.nitrado.net";

/**
 * =========================
 * STARTUP DIAGNOSTICS (RAILWAY PROOF)
 * =========================
 */
console.log("\n==============================");
console.log("🚀 BOT STARTING (STABLE MODE)");
console.log("==============================");

console.log("🧠 NODE INFO:");
console.log("version:", process.version);
console.log("platform:", process.platform);

/**
 * =========================
 * ENV LOADING (SAFE)
 * =========================
 */
const env = process.env || {};

const API_TOKEN = env.API_TOKEN || null;
const SERVICE_ID = env.SERVICE_ID || null;
const FTP_HOST = env.FTP_HOST || null;
const FTP_USER = env.FTP_USER || null;
const FTP_PASS = env.FTP_PASS || null;

/**
 * =========================
 * FIX #1 — SHOW EXACT ENV STATE
 * =========================
 */
console.log("\n🔐 ENV DEBUG:");
console.log("RAW ENV KEYS:", Object.keys(env));

console.log("\nPARSED ENV:");
console.log({
    API_TOKEN: !!API_TOKEN,
    SERVICE_ID: !!SERVICE_ID,
    FTP_HOST: !!FTP_HOST,
    FTP_USER: !!FTP_USER,
    FTP_PASS: !!FTP_PASS
});

/**
 * =========================
 * FIX #2 — HARD STOP IF RAILWAY BROKEN
 * =========================
 */
if (!API_TOKEN || !SERVICE_ID) {
    console.log("\n❌ FATAL ERROR:");
    console.log("Missing Railway environment variables.");
    console.log("👉 Fix Variables tab OR wrong service deployment");
    process.exit(1);
}

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

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    return files;
}

/**
 * =========================
 * FIX #3 — TRIGGERS
 * =========================
 */
function scanRPT(line) {
    if (line.toLowerCase().includes("lootmax")) {
        console.log("\n🔥 RPT TRIGGER (LOOTMAX):");
        console.log(line);
    }
}

function scanADM(line) {
    if (line.toLowerCase().includes("killed by")) {
        console.log("\n💀 ADM TRIGGER (KILLED BY):");
        console.log(line);
    }
}

/**
 * =========================
 * FIX #4 — SAFE FILE PICKING
 * =========================
 */
function latest(files, ext) {
    const list = files.filter(f =>
        typeof f === "string" &&
        f.toLowerCase().endsWith(ext)
    );

    return list.length ? list[list.length - 1] : null;
}

/**
 * =========================
 * FILE PROCESSOR (SAFE)
 * =========================
 */
function process(content, type) {
    if (!content) return;

    const lines = content.split("\n");

    for (const line of lines) {
        if (type === "RPT") scanRPT(line);
        if (type === "ADM") scanADM(line);
    }
}

/**
 * =========================
 * API FILE FETCH
 * =========================
 */
async function getLatestFiles() {
    const files = await getFiles();

    console.log("\n📂 FILE COUNT:", files.length);

    const rpt = latest(files, ".rpt");
    const adm = latest(files, ".adm");

    console.log("📄 RPT:", rpt || "NONE");
    console.log("📄 ADM:", adm || "NONE");

    return { rpt, adm };
}

/**
 * =========================
 * MAIN LOOP (STABLE)
 * =========================
 */
let running = false;

async function run() {
    if (running) return; // prevents overlap loops
    running = true;

    try {
        console.log("\n==============================");
        console.log("🔄 LOOP START");
        console.log("==============================");

        const { rpt, adm } = await getLatestFiles();

        if (!rpt && !adm) {
            console.log("⚠️ NO FILES FOUND");
            return;
        }

        /**
         * NOTE:
         * We are NOT forcing FTP yet because your current issue is ENV.
         * Once env is fixed, we re-enable hybrid reading.
         */

        if (rpt) {
            console.log("📥 RPT DETECTED (not reading yet - env safe mode)");
        }

        if (adm) {
            console.log("📥 ADM DETECTED (not reading yet - env safe mode)");
        }

        console.log("==============================");
        console.log("🔌 LOOP END");

    } catch (err) {
        console.log("❌ LOOP ERROR:", err.message);
    }

    running = false;
}

/**
 * =========================
 * START BOT
 * =========================
 */
run();
setInterval(run, 60000);
