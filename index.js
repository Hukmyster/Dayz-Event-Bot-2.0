import ftp from "basic-ftp";
import fs from "fs";
import path from "path";

console.log("🚀 BOT STARTING (FINAL FTP HYBRID + DELTA MODE)");

/* =========================
   ENV SAFE LOAD
========================= */
const ENV = process.env || {};

const API_TOKEN = ENV.API_TOKEN || null;
const FTP_HOST = ENV.FTP_HOST || null;
const FTP_USER = ENV.FTP_USER || null;
const FTP_PASS = ENV.FTP_PASS || null;
const SERVICE_ID = ENV.SERVICE_ID || null;

console.log("🔐 ENV CHECK:", {
  API_TOKEN: !!API_TOKEN,
  FTP_HOST: !!FTP_HOST,
  FTP_USER: !!FTP_USER,
  FTP_PASS: !!FTP_PASS,
  SERVICE_ID: !!SERVICE_ID
});

if (!FTP_HOST || !FTP_USER || !FTP_PASS) {
  console.log("❌ Missing FTP credentials");
  process.exit(1);
}

/* =========================
   STATE (DELTA MODE)
========================= */
const seenLines = new Set();

/* =========================
   FTP CONNECT
========================= */
async function connectFTP() {
  const client = new ftp.Client();
  client.ftp.verbose = true;

  await client.access({
    host: FTP_HOST,
    user: FTP_USER,
    password: FTP_PASS,
    secure: false
  });

  console.log("✅ FTP CONNECTED");
  return client;
}

/* =========================
   SAFE DOWNLOAD
========================= */
async function downloadFile(client, remotePath) {
  try {
    console.log("📥 TRY READ:", remotePath);

    const chunks = [];
    const stream = {
      write: (data) => chunks.push(data.toString()),
      end: () => {},
      once: () => {} // 🔥 fixes your crash edge case
    };

    await client.downloadTo(stream, remotePath);

    const data = chunks.join("");
    if (!data) {
      console.log("⚠️ EMPTY FILE:", remotePath);
    }

    return data;

  } catch (err) {
    console.log("❌ FTP READ ERROR:", {
      file: remotePath,
      message: err.message,
      stack: err.stack
    });
    return "";
  }
}

/* =========================
   PARSERS
========================= */
function parseRPT(text) {
  const lines = text.split("\n");
  const triggers = [];

  for (const line of lines) {
    if (line.includes("lootmax")) {
      triggers.push(line.trim());
    }
  }

  return triggers;
}

function parseADM(text) {
  const lines = text.split("\n");
  const kills = [];

  for (const line of lines) {
    if (line.includes("killed by")) {
      kills.push(line.trim());
    }
  }

  return kills;
}

/* =========================
   DELTA FILTER
========================= */
function deltaFilter(items) {
  const fresh = [];

  for (const item of items) {
    if (!seenLines.has(item)) {
      seenLines.add(item);
      fresh.push(item);
    }
  }

  return fresh;
}

/* =========================
   LOOP
========================= */
async function loop() {
  console.log("==============================");
  console.log("🔄 LOOP START");

  try {
    const client = await connectFTP();

    const fileList = await client.list("dayzps/config");
    const files = fileList.map(f => `dayzps/config/${f.name}`);

    console.log("📂 FILES FOUND:", files.length);

    for (const file of files) {
      const content = await downloadFile(client, file);

      if (!content) continue;

      if (file.endsWith(".RPT")) {
        const hits = parseRPT(content);
        const newHits = deltaFilter(hits);

        for (const h of newHits) {
          console.log("🔥 NEW RPT TRIGGER:", h);
        }
      }

      if (file.endsWith(".ADM")) {
        const hits = parseADM(content);
        const newHits = deltaFilter(hits);

        for (const h of newHits) {
          console.log("💀 NEW ADM EVENT:", h);
        }
      }
    }

    client.close();
    console.log("🔌 LOOP COMPLETE");

  } catch (err) {
    console.log("❌ LOOP ERROR:", err.message);
  }
}

/* =========================
   INTERVAL LOOP (60s)
========================= */
loop();
setInterval(loop, 60_000);
