const ftp = require("basic-ftp");

const API_BASE = "https://api.nitrado.net";

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const POLL_INTERVAL = 60 * 1000;

// memory for delta mode
const seenLines = new Set();

/**
 * API CALL
 */
async function api(path) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            Accept: "application/json",
        },
    });

    const json = await res.json().catch(() => null);
    return json;
}

/**
 * GET FILE LIST (FULLY DYNAMIC)
 */
async function getFiles() {
    const res = await api(`/services/${SERVICE_ID}/gameservers`);

    const files =
        res?.data?.gameserver?.game_specific?.log_files || [];

    return files;
}

/**
 * NORMALISE FTP PATH
 */
function cleanPath(p) {
    return p.startsWith("/") ? p : `/${p}`;
}

/**
 * CONNECT FTP (ONCE)
 */
async function connectFTP() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    await client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASS,
        secure: false,
    });

    return client;
}

/**
 * READ FILE
 */
async function readFile(client, file) {
    try {
        const path = cleanPath(file);
        let data = "";

        await client.downloadTo(
            {
                write: (chunk) => (data += chunk.toString()),
            },
            path
        );

        return data;
    } catch (err) {
        console.log(`⚠️ FTP READ FAILED: ${file}`);
        return null;
    }
}

/**
 * PROCESS LINES
 */
function processLines(text, file) {
    if (!text) return;

    const lines = text.split("\n");

    for (const line of lines) {
        if (!line) continue;

        const id = `${file}:${line}`;
        if (seenLines.has(id)) continue;

        // RPT TRIGGER
        if (file.endsWith(".RPT") && line.includes("lootmax")) {
            console.log("🔥 RPT TRIGGER (LOOTMAX)");
            console.log(line);
            seenLines.add(id);
        }

        // ADM TRIGGER
        if (file.endsWith(".ADM") && line.includes("killed by")) {
            console.log("💀 ADM TRIGGER (KILLED BY)");
            console.log(line);
            seenLines.add(id);
        }
    }
}

/**
 * MAIN LOOP
 */
async function loop() {
    console.log("🔄 LOOP START");

    let client;

    try {
        client = await connectFTP();
    } catch (e) {
        console.log("❌ FTP CONNECT FAILED");
        return;
    }

    const files = await getFiles();

    if (!files.length) {
        console.log("⚠️ NO FILES FOUND");
        return;
    }

    for (const file of files) {
        const data = await readFile(client, file);
        processLines(data, file);
    }

    client.close();
    console.log("🔌 LOOP END");
}

/**
 * START
 */
async function run() {
    console.log("🚀 BOT STARTING (60s DELTA MODE)");

    await loop();
    setInterval(loop, POLL_INTERVAL);
}

run();
