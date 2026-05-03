// restart.js
const { Client, REST } = require("discord.js");
const axios = require("axios"); // or your preferred HTTP client
require("dotenv").config();

// ---------------------------------
// 1. CONFIGURATION
// ---------------------------------

// Local server time restart windows (bot schedule is 1–2 mins early).
// Example: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00.
const SCHEDULED_RESTART_TIMES = [
  { hour: 23, minute: 58 }, // 00:00 bot time → 00:00 server
  { hour: 2,  minute: 58 }, // 03:00
  { hour: 5,  minute: 58 }, // 06:00
  { hour: 8,  minute: 58 }, // 09:00
  { hour: 11, minute: 58 }, // 12:00
  { hour: 14, minute: 58 }, // 15:00
  { hour: 17, minute: 58 }, // 18:00
  { hour: 20, minute: 58 }, // 21:00
];

// How long to wait between upload attempts if the first fails.
const UPLOAD_RETRY_DELAY_MS = 10_000; // 10 seconds

// Where to store XML snippets (from shop.js).
const SHOP_SNIPPET_DIR = "./data/shop/snippets";

// Where to place the final compiled XMLs locally.
const LOCAL_OUTPUT_DIR = "./data/server_xml";

// Where the server expects the XML.
const SERVER_XML_PATH = "Config/EventSpawn.xml";

// Supabase / “archive failed XML” config (example).
// Replace with your own Supabase client and bucket/table.
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SUPABASE_BUCKET = "failed_xml";


// ---------------------------------
// 2. STATE / UTILITY
// ---------------------------------

let state = {
  running: false,
  started: false,
  timer: null,
  failedXmlArchiveWebhookId: null, // admin channel webhook for failed XML cycles.
};

// Read current time (UTC / server time) and check if we’re in a restart window.
function isCurrentlyInRestartWindow() {
  const now = new Date();
  const hour = now.getUTCHours(); // assuming server is on UTC
  const minute = now.getUTCMinutes();

  return SCHEDULED_RESTART_TIMES.some((w) => w.hour === hour && w.minute === minute);
}

// Build a single XML file from shop snippets.
// Each snippet has a comment like:
// <!-- player:U12345678 amount:100 -->
// which this process preserves.
async function buildXmlFromSnippets() {
  const fs = require("fs");
  const path = require("path");
  const snippets = fs.readdirSync(SHOP_SNIPPET_DIR).filter((f) => f.endsWith(".xml"));
  const xmlParts = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", "<cfgEventSpawn>"];

  for (const file of snippets) {
    const fullPath = path.join(SHOP_SNIPPET_DIR, file);
    const content = fs.readFileSync(fullPath, "utf8");
    xmlParts.push(content);
  }

  xmlParts.push("</cfgEventSpawn>");
  const finalXml = xmlParts.join("\n");

  // Write to local temp file.
  const outputPath = path.join(LOCAL_OUTPUT_DIR, "EventSpawn.xml");
  fs.writeFileSync(outputPath, finalXml, "utf8");

  return { path: outputPath, content: finalXml };
}


// ---------------------------------
// 3. NITRADO / API INTEGRATION (STUBS)
// ---------------------------------

// Upload XML to Nitrado via API (two‑step upload).
// You will need to replace this with your own Nitrado API call stack.
async function uploadXmlToServer(xmlPath) {
  // 1. Get upload URL + form from Nitrado API (step 1 of upload flow).
  // 2. POST file contents to the returned URL (step 2).
  //
  // If you want, you can paste your own Nitrado API integration code here.
  //
  // Example result shape:
  // { success: true, uploadUrl: "...", detail: "ok" }
  // { success: false, error: "..." }

  // STUB:
  const content = require("fs").readFileSync(xmlPath, "utf8");

  // This is where you call your Nitrado‑API‑wrapper function.
  // Example:
  // const res = await nitradoClient.uploadFile(SERVICE_ID, SERVER_XML_PATH, content);

  // For now, assume:
  const success = Math.random() > 0.5; // replace with real API call

  return {
    success,
    error: success ? null : "API: upload failed",
  };
}

// Trigger a server restart via Nitrado API.
// Example endpoint conceptually:
// POST /services/${SERVICE_ID}/restart
async function triggerRestart() {
  // STUB:
  // const res = await axios.post(
  //   `https://api.nitrado.net/services/${SERVICE_ID}/restart`,
  //   {},
  //   { headers: { Authorization: `Bearer ${API_TOKEN}` } }
  // );

  // For now:
  const success = Math.random() > 0.1; // replace with real API call
  return { success, error: success ? null : "API: restart failed" };
}


// ---------------------------------
// 4. SUPABASE ARCHIVE & WEBHOOK LOGIC
// ---------------------------------

// Save failed XML to Supabase bucket or table.
// Structure: XML + reason + timestamp + server time.
async function archiveFailedXml(xmlContent, reason) {
  // This is a conceptual stub.
  // You’ll want to:
  // 1. Generate a filename like `failed_xml_2026-05-04_23-58.xml`.
  // 2. Upload that file to your Supabase bucket.
  // 3. Insert a record into a table if you also want structured metadata.

  // Example:
  // 1. File:
  //    const filename = `failed_xml_${now.toISOString().replace(/[:.]/g, "-")}.xml`;
  // 2. Put file in SUPABASE_BUCKET.
  // 3. Insert record:
  //    { server_xml_path: SERVER_XML_PATH, reason, created_at: now }

  return {
    success: true,
    archiveId: "fake_archive_id_123",
  };
}

// Send a webhook to an admin‑only Discord channel when XML upload fails twice.
async function sendFailedXmlWebhook(sqlArchiveId, xmlContent, reason, restartTime) {
  if (!state.failedXmlArchiveWebhookId) return; // disable if not configured

  // Example:
  // const webhook = new WebhookClient({ url: WEBHOOK_URL });
  // await webhook.send({
  //   content: "XML upload failed twice, restarting server with old config.",
  //   embeds: [embed],
  // });
}

// -------------------------------
// 5. CORE RESTART & XML CYCLE
// -------------------------------

// Parse the XML and extract all reimbursement info.
// Look for comments like:
// <!-- player:U12345678 amount:100 -->
function extractReimbursementsFromXml(xmlContent) {
  const lines = xmlContent.split("\n");
  const reimburses = [];

  for (const line of lines) {
    const match = line.match(/<!-- player:U(\d+) amount:(\d+) -->/);
    if (match) {
      const playerId = "U" + match[1];
      const amount = parseInt(match[2], 10);

      if (!isNaN(amount)) {
        reimburses.push({ playerId, amount });
      }
    }
  }

  return reimburses;
}

// Actually reimburse players (via your economy module).
async function reimbursePlayers(reimbursements, client) {
  // This is a stub hook.
  // Call your economy module here:
  // for (const { playerId, amount } of reimbursements) {
  //   await economy.addAmount(playerId, amount);
  //   const user = await client.users.fetch(playerId);
  //   await user.send(`You've been refunded ${amount} dollars for a purchase that failed to apply to the server.`);
  // }

  // For now:
  console.log("[RESTART] Reimbursing players:", reimbursements);
}

// Main “XML build + upload + restart” loop step.
async function xmlCycleStep({ client, nitradoClient }) {
  if (!state.running) return;

  const now = new Date();
  const isoTimestamp = now.toISOString();

  console.log("[RESTART] Entered XML cycle at", isoTimestamp);

  try {
    // 1. Build XML from shop snippets.
    const { path: localXmlPath, content: xmlContent } = await buildXmlFromSnippets();

    // 2. Try to upload XML to server (first attempt).
    let upload1 = await uploadXmlToServer(localXmlPath);

    if (!upload1.success) {
      console.log("[RESTART] First upload failed:", upload1.error);
      console.log("[RESTART] Waiting before retry...");

      await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAY_MS));

      // 3. Second attempt.
      upload2 = await uploadXmlToServer(localXmlPath);
    } else {
      // Success on first try; no need for second attempt.
      console.log("[RESTART] XML upload succeeded on first try.");
    }

    // If we got a second attempt result, check it.
    const upload = upload1.success ? upload1 : (upload2 ? upload2 : null);

    if (upload && upload.success) {
      // 4. XML uploaded successfully.
      console.log("[RESTART] XML deployed successfully; triggering server restart.");

      // 5. Delete local XML.
      require("fs").unlinkSync(localXmlPath);

      // 6. Trigger restart.
      const restart = await triggerRestart();
      if (!restart.success) {
        console.warn("[RESTART] Restart request failed:", restart.error);
        // But you still want to log the outcome.
      }
    } else {
      // 7. Both uploads failed.
      console.warn("[RESTART] XML upload failed twice; restarting server with old config.");

      // 8. Parse XML to get reimbursements.
      const reimbursements = extractReimbursementsFromXml(xmlContent);

      // 9. Reimburse players.
      if (reimbursements.length > 0 && client) {
        await reimbursePlayers(reimbursements, client);
      }

      // 10. Archive XML to Supabase.
      const archive = await archiveFailedXml(xmlContent, upload1.error || "unknown");

      // 11. Notify admin via webhook.
      if (archive.success && state.failedXmlArchiveWebhookId) {
        await sendFailedXmlWebhook(archive.archiveId, xmlContent, upload1.error || "unknown", isoTimestamp);
      }

      // 12. Restart server anyway (for lag/dysync).
      const restart = await triggerRestart();
      if (!restart.success) {
        console.warn("[RESTART] Restart request failed after upload failure:", restart.error);
      }

      // 13. Delete local XML.
      require("fs").unlinkSync(localXmlPath);
    }
  } catch (err) {
    console.error("[RESTART][ERROR] XML cycle failed:", err);
  }
}

// Periodic checker that runs every ~10–30 seconds.
// You can tune CHECK_INTERVAL_MS to match your taste.
const CHECK_INTERVAL_MS = 30_000; // 30 seconds

async function checkAndRunRestartCycle({ client, nitradoClient }) {
  if (!isCurrentlyInRestartWindow()) return;
  if (state.running) return; // ensure only one cycle at a time.

  state.running = true;
  await xmlCycleStep({ client, nitradoClient });
  state.running = false;
}

// -------------------------------
// 6. MODULE INTERFACE
// -------------------------------

// Start the restart‑xml‑cycle module.
function start({ client, nitradoClient, failedXmlArchiveWebhookId }) {
  if (state.started) return;

  state.started = true;
  state.failedXmlArchiveWebhookId = failedXmlArchiveWebhookId;

  console.log("[RESTART] Started XML‑deployer‑and‑restart module.");

  state.timer = setInterval(() => {
    checkAndRunRestartCycle({ client, nitradoClient });
  }, CHECK_INTERVAL_MS);
}

// Stop the module.
function stop() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.running = false;
  state.started = false;
}

module.exports = {
  start,
  stop,
  state,
};
