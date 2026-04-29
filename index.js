const ftp = require("basic-ftp");

// ======================
// ENV
// ======================
const API_TOKEN = process.env.API_TOKEN || "";
const SERVICE_ID = process.env.SERVICE_ID || "";

const FTP_HOST = process.env.FTP_HOST || "";
const FTP_USER = process.env.FTP_USER || "";
const FTP_PASS = process.env.FTP_PASS || "";

// ======================
// STATE
// ======================
let firstRun = true;
const seen = new Set();

// ======================
// FTP CONNECT
// ======================
async function connectFTP() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    await client.access({
        host: FTP_HOST,
        user: FTP_USER,
        password: FTP_PASS,
        secure: false
    });

    return client;
}

// ======================
// READ FILE
// ======================
async function readFile(client, path) {
    let data = "";

    try {
        await client.downloadTo(
            {
                write: (chunk) => {
                    data += chunk.toString();
                }
            },
            path
        );

        return data;
    } catch (err) {
        console.log(`⚠️ FTP READ FAILED: ${path}`);
        return null;
    }
}

// ======================
// TRIGGER HANDLER
// ======================
function handleLine(line, type) {
    if (!line) return;

    const clean = line.trim();
    if (!clean) return;

    const key = `${type}:${clean}`;

    // FIRST RUN = SHOW EVERYTHING
    if (firstRun) {
        seen.add(key);
    }

    // ONLY NEW ON NEXT RUNS
    if (!seen.has(key)) {
        seen.add(key);

        if (type === "RPT" && clean.toLowerCase().includes("lootmax")) {
            console.log("🔥 RPT TRIGGER (LOOTMAX)");
            console.log(clean);
        }

        if (type === "ADM" && clean.toLowerCase().includes("killed by")) {
            console.log("💀 ADM TRIGGER (KILLED BY)");
            console.log(clean);
        }
    }
}

// ======================
// PROCESS FILE
// ======================
async function processFile(client, file) {
    const type = file.endsWith(".RPT") ? "RPT" : "ADM";

    const content = await readFile(client, file);

    if (!content) return;

    const lines = content.split("\n");

    for (const line of lines) {
        handleLine(line, type);
    }
}

// ======================
// LOOP
// ======================
async function loop() {
    console.log("==============================");
    console.log("🔄 LOOP START");

    try {
        const client = await connectFTP();

        const files = [
            "dayzps/config/DayZServer_PS4_x64_2026-04-29_02-10-12.RPT",
            "dayzps/config/DayZServer_PS4_x64_2026-04-29_00-25-29.RPT",
            "dayzps/config/DayZServer_PS4_x64_2026-04-29_02-10-12.ADM",
            "dayzps/config/DayZServer_PS4_x64_2026-04-29_00-25-29.ADM",
            "dayzps/config/DayZServer_PS4_x64_2026-04-28_23-04-17.ADM",
            "dayzps/config/DayZServer_PS4_x64_2026-04-28_20-07-27.ADM"
        ];

        for (const file of files) {
            await processFile(client, file);
        }

        client.close();

        if (firstRun) {
            console.log("🧠 BASELINE COMPLETE (future runs = new triggers only)");
            firstRun = false;
        }

    } catch (err) {
        console.log("❌ LOOP ERROR:", err.message);
    }

    console.log("🔌 LOOP END");
}

// ======================
// START
// ======================
console.log("🚀 BOT STARTING (60s DELTA MODE)");
loop();
setInterval(loop, 60000);
