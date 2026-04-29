require("dotenv").config();
const axios = require("axios");

const API_TOKEN = process.env.API_TOKEN;
const SERVICE_ID = process.env.SERVICE_ID;

const BASE_URL = `https://api.nitrado.net/services/${SERVICE_ID}/gameservers/file_server`;

let seenLines = new Set();
let lastFilesSnapshot = new Set();

const headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    "Content-Type": "application/json"
};

// ------------------------------
// LIST FILES (API)
// ------------------------------
async function listFiles(path = "dayzps/config") {
    try {
        console.log("🔍 LIST FILES:", path);

        const res = await axios.get(
            `${BASE_URL}/listing?dir=${encodeURIComponent(path)}`,
            { headers }
        );

        const entries = res.data?.data?.entries || [];

        console.log(`📂 FILE COUNT: ${entries.length}`);

        return entries;
    } catch (err) {
        console.error("❌ LIST ERROR:", err.response?.data || err.message);
        return [];
    }
}

// ------------------------------
// READ FILE CONTENT
// ------------------------------
async function readFile(filePath) {
    try {
        console.log("📥 READ:", filePath);

        const res = await axios.get(
            `${BASE_URL}/download?file=${encodeURIComponent(filePath)}`,
            {
                headers,
                responseType: "text"
            }
        );

        return res.data;
    } catch (err) {
        console.error("❌ READ FAILED:", filePath);
        console.error(err.response?.data || err.message);
        return "";
    }
}

// ------------------------------
// PARSE LOG LINES
// ------------------------------
function parseLog(text, file) {
    const lines = text.split("\n");

    for (const line of lines) {
        if (!line) continue;

        if (
            !line.includes("SpawnRandomLoot") &&
            !line.includes("killed by") &&
            !line.includes("CE")
        ) continue;

        if (seenLines.has(line)) continue;
        seenLines.add(line);

        console.log("\n🔥 NEW EVENT");
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
// LOOP
// ------------------------------
async function loop() {
    console.log("\n==============================");
    console.log("🔄 LOOP START");
    console.log("==============================");

    const files = await listFiles("dayzps/config");

    for (const file of files) {
        if (!file.name) continue;

        const name = file.name;

        if (
            !name.includes("DayZServer_PS4") &&
            !name.includes("script_") &&
            !name.includes("server.log")
        ) continue;

        const fullPath = `dayzps/config/${name}`;

        console.log("🔍 PROCESS:", fullPath);

        const content = await readFile(fullPath);

        if (!content || content.length < 10) {
            console.log("⚠️ EMPTY FILE:", name);
            continue;
        }

        parseLog(content, name);
    }

    console.log("🔌 LOOP END");
}

// ------------------------------
// START
// ------------------------------
console.log("🚀 BOT STARTING (STABLE NITRADO API MODE)");
console.log("==============================");

loop();
setInterval(loop, 60000);
