require("dotenv").config();
const axios = require("axios");

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const BASE_URL = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server`;

let seenLines = new Set();

const headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json"
};

// ------------------------------
// FETCH FILE LIST (NO FTP)
// ------------------------------
async function listFiles(path = "dayzps/config") {
    try {
        console.log("🔍 API LIST FILES:", path);

        const res = await axios.get(
            `${BASE_URL}/listing?dir=${encodeURIComponent(path)}`,
            { headers }
        );

        return res.data.data.entries || [];
    } catch (err) {
        console.error("❌ LIST ERROR:", err.response?.data || err.message);
        return [];
    }
}

// ------------------------------
// READ FILE CONTENT (API STREAM SAFE)
// ------------------------------
async function readFile(filePath) {
    try {
        console.log(`📥 API READ: ${filePath}`);

        const res = await axios.get(
            `${BASE_URL}/download?file=${encodeURIComponent(filePath)}`,
            {
                headers,
                responseType: "text"
            }
        );

        return res.data;
    } catch (err) {
        console.error("❌ READ ERROR:", filePath);
        console.error("DETAIL:", err.response?.data || err.message);
        return "";
    }
}

// ------------------------------
// TRIGGER PARSER
// ------------------------------
function parseTriggers(text, file) {
    const lines = text.split("\n");

    for (const line of lines) {
        if (!line.includes("[CE][SpawnRandomLoot]") &&
            !line.includes("killed by") &&
            !line.includes("Static")) continue;

        if (seenLines.has(line)) continue;
        seenLines.add(line);

        console.log("\n🔥 NEW TRIGGER:");
        console.log("FILE:", file);
        console.log(line);

        if (line.includes("lootmax")) {
            console.log("🎯 TYPE: LOOTMAX EVENT");
        }

        if (line.includes("killed by")) {
            console.log("💀 TYPE: PLAYER KILL");
        }
    }
}

// ------------------------------
// MAIN LOOP
// ------------------------------
async function loop() {
    console.log("\n==============================");
    console.log("🔄 LOOP START (API MODE)");
    console.log("==============================");

    const files = await listFiles("dayzps/config");

    console.log(`📂 FILES FOUND: ${files.length}`);

    for (const f of files) {
        if (!f.name) continue;

        const name = f.name;

        if (!name.includes("DayZServer_PS4")) continue;
        if (!name.endsWith(".RPT") && !name.endsWith(".ADM")) continue;

        const fullPath = `dayzps/config/${name}`;

        console.log("🔍 PROCESS:", fullPath);

        const content = await readFile(fullPath);

        if (!content || content.length < 10) {
            console.log("⚠️ EMPTY FILE:", fullPath);
            continue;
        }

        parseTriggers(content, name);
    }

    console.log("🔌 LOOP END");
}

// ------------------------------
// STARTUP
// ------------------------------
console.log("🚀 BOT STARTING (STABLE NITRADO API MODE)");
console.log("==============================");

loop();
setInterval(loop, 60000);
