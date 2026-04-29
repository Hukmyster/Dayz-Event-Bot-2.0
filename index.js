const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const FTP_HOST = process.env.FTP_HOST;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;

/**
 * =========================
 * SAFE API CALL
 * =========================
 */
async function api(path) {
    try {
        console.log(`🔌 API CALL: ${path}`);

        const res = await fetch(`${API_BASE}${path}`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
                Accept: "application/json"
            }
        });

        const text = await res.text();

        console.log(`📡 STATUS: ${res.status}`);

        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }

        console.log(`📦 RAW RESPONSE:`);
        console.log(text.slice(0, 500));

        return json;

    } catch (err) {
        console.log("❌ API ERROR:");
        console.log(err);
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

    console.log("\n==============================");
    console.log("🔍 PARSING FILE STRUCTURE");
    console.log("==============================");

    const files =
        res?.data?.gameserver?.game_specific?.log_files;

    console.log("📂 EXTRACTED FILES:");
    console.log(files);

    if (!files) {
        console.log("❌ log_files PATH DOES NOT EXIST");
        return [];
    }

    return files;
}

/**
 * =========================
 * MAIN LOOP
 * =========================
 */
async function run() {
    console.log("\n🚀 BOT LOOP START");
    console.log("==============================");

    if (!API_TOKEN || !SERVICE_ID) {
        console.log("❌ MISSING ENV VARIABLES");
        return;
    }

    console.log("✅ ENV OK");

    const files = await getFiles();

    console.log("\n==============================");
    console.log("📊 FILE RESULT SUMMARY");
    console.log("==============================");
    console.log("COUNT:", files?.length || 0);

    if (!Array.isArray(files) || files.length === 0) {
        console.log("⚠️ NO FILES FOUND OR INVALID RESPONSE");
        return;
    }

    console.log("\n📄 FILES:");
    files.forEach(f => console.log(" -", f));

    console.log("==============================");
    console.log("🔌 LOOP END");
}

/**
 * =========================
 * STARTUP
 * =========================
 */
console.log("Bot starting (FULL DEBUG MODE)");

run();
setInterval(run, 60000);
