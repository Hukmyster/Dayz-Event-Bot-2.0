const ftpLib = require("basic-ftp");

const {
    API_TOKEN,
    FTP_HOST,
    FTP_USER,
    FTP_PASS,
    SERVICE_ID
} = process.env;

console.log("🚀 BOT STARTING (FTP FIXED MODE)");
console.log("==============================");

if (!API_TOKEN || !FTP_HOST || !FTP_USER || !FTP_PASS) {
    console.log("❌ ENV MISSING:");
    console.log({
        API_TOKEN: !!API_TOKEN,
        FTP_HOST: !!FTP_HOST,
        FTP_USER: !!FTP_USER,
        FTP_PASS: !!FTP_PASS
    });
    process.exit?.(1);
}

let seen = new Set();
let loopCount = 0;

// -----------------------------
// FTP CONNECT
// -----------------------------
async function connectFTP() {
    const client = new ftpLib.Client();
    client.ftp.verbose = true;

    try {
        console.log("🔌 CONNECTING FTP...");
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASS,
            secure: false
        });

        console.log("✅ FTP CONNECTED");
        return client;

    } catch (err) {
        console.log("❌ FTP CONNECT ERROR:", err.message);
        return null;
    }
}

// -----------------------------
// FIXED FILE READ (CRITICAL FIX HERE)
// -----------------------------
async function readFile(client, filePath) {
    console.log("📥 TRY READ:", filePath);

    try {
        let data = "";

        // 🔥 FIX: correct usage of downloadTo
        const stream = {
            write(chunk) {
                data += chunk.toString();
            },
            end() {},
            once() {},   // <-- prevents your crash (important workaround)
            emit() {}
        };

        await client.downloadTo(stream, filePath);

        if (!data) {
            console.log("⚠️ EMPTY FILE:", filePath);
            return null;
        }

        return data;

    } catch (err) {
        console.log("❌ FTP READ ERROR:");
        console.log("FILE:", filePath);
        console.log("MESSAGE:", err.message);
        console.log("STACK:", err.stack);
        return null;
    }
}

// -----------------------------
// LIST FILES DYNAMICALLY
// -----------------------------
async function listFiles(client) {
    try {
        console.log("🔍 LISTING FILES...");

        const list = await client.list("/dayzps/config");

        const files = list
            .filter(f => f.name.endsWith(".RPT") || f.name.endsWith(".ADM"))
            .map(f => `/dayzps/config/${f.name}`);

        console.log("📂 FILES FOUND:", files.length);
        return files;

    } catch (err) {
        console.log("❌ FILE LIST ERROR:", err.message);
        return [];
    }
}

// -----------------------------
// PROCESS LINE (DELTA MODE)
// -----------------------------
function processLine(line) {
    if (seen.has(line)) return false;
    seen.add(line);

    if (line.includes("lootmax")) {
        console.log("🔥 LOOTMAX:");
        console.log(line);
        return true;
    }

    if (line.includes("killed by")) {
        console.log("💀 KILL:");
        console.log(line);
        return true;
    }

    return false;
}

// -----------------------------
// LOOP
// -----------------------------
async function loop() {
    loopCount++;
    console.log("==============================");
    console.log(`🔄 LOOP #${loopCount}`);

    const client = await connectFTP();
    if (!client) return;

    const files = await listFiles(client);

    for (const file of files) {
        console.log("🔍 FILE:", file);

        const data = await readFile(client, file);

        if (!data) {
            console.log("⚠️ SKIP EMPTY:", file);
            continue;
        }

        const lines = data.split("\n");

        let hits = 0;

        for (const line of lines) {
            if (processLine(line)) hits++;
        }

        console.log(`📊 HITS: ${hits}`);
    }

    try {
        client.close();
    } catch {}

    console.log("🔌 LOOP END");
}

// -----------------------------
// RUN EVERY 60 SECONDS
// -----------------------------
setInterval(loop, 60000);
loop();
