const API_BASE = "https://api.nitrado.net";

// ==============================
// SAFE ENV LOADING
// ==============================
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN;
const SERVICE_ID = ENV.SERVICE_ID;

const FTP_HOST = ENV.FTP_HOST;
const FTP_USER = ENV.FTP_USER;
const FTP_PASS = ENV.FTP_PASS;

function logEnv() {
    console.log("\n==============================");
    console.log("🚀 BOT STARTING (HYBRID SCANNER)");
    console.log("==============================");
    console.log("ENV CHECK:");
    console.log({
        API_TOKEN: !!API_TOKEN,
        SERVICE_ID: !!SERVICE_ID,
        FTP_HOST: !!FTP_HOST,
        FTP_USER: !!FTP_USER,
        FTP_PASS: !!FTP_PASS
    });
}

// ==============================
// SAFE FETCH WRAPPER
// ==============================
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

        return { ok: res.ok, status: res.status, json, raw: text };
    } catch (err) {
        console.log("❌ API ERROR:", err.message);
        return { ok: false };
    }
}

// ==============================
// FILE DETECTION (WORKING PART)
// ==============================
async function getFileList() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res.json?.data?.gameserver?.game_specific?.log_files || [];

    console.log("\n📂 FILES DETECTED:");
    files.forEach(f => console.log("📄", f));

    return files;
}

// ==============================
// TRIGGER SCANNER
// ==============================
function scanFileContent(filePath, content) {
    const lines = content.split("\n");

    const isRPT = filePath.toLowerCase().endsWith(".rpt");
    const isADM = filePath.toLowerCase().endsWith(".adm");

    const triggers = [];

    for (const line of lines) {
        const lower = line.toLowerCase();

        if (isRPT && lower.includes("lootmax")) {
            triggers.push({ type: "RPT", line });
        }

        if (isADM && lower.includes("killed by")) {
            triggers.push({ type: "ADM", line });
        }
    }

    return triggers;
}

// ==============================
// FTP FALLBACK (OPTIONAL HYBRID)
// ==============================
async function ftpRead(filePath) {
    try {
        const ftp = (await import("basic-ftp")).Client;
        const client = new ftp();

        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        let data = "";
        await client.downloadTo(
            {
                write: chunk => (data += chunk.toString())
            },
            filePath
        );

        client.close();
        return data;
    } catch (err) {
        console.log("⚠️ FTP READ FAILED:", filePath);
        return null;
    }
}

// ==============================
// MAIN LOOP
// ==============================
async function run() {
    logEnv();

    if (!API_TOKEN || !SERVICE_ID) {
        console.log("\n❌ MISSING API VARIABLES - STOPPING SAFELY");
        return;
    }

    console.log("\n🔄 LOOP START");

    const files = await getFileList();

    for (const file of files) {
        const lower = file.toLowerCase();

        if (!lower.endsWith(".rpt") && !lower.endsWith(".adm")) continue;

        console.log("\n📥 READING:", file);

        // NOTE: API file reading often blocked → FTP fallback used
        let content = await ftpRead(file);

        if (!content) {
            console.log("⚠️ NO CONTENT (FTP FAILED):", file);
            continue;
        }

        const hits = scanFileContent(file, content);

        if (hits.length > 0) {
            console.log("\n🚨 TRIGGER HITS:", file);
            hits.forEach(h =>
                console.log(`[${h.type}]`, h.line)
            );
        } else {
            console.log("✅ NO TRIGGERS:", file);
        }
    }

    console.log("\n==============================");
    console.log("🔌 LOOP COMPLETE");
    console.log("==============================");
}

console.log("Bot starting...");
run();
