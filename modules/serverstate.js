const fs = require("fs");
const path = require("path");
const debug = require("../utils/debug");

const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL || "";
const NITRADO_API_KEY = process.env.NITRADO_API_KEY || process.env.NITRADO_TOKEN || "";
const NITRADO_SERVICE_ID = process.env.NITRADO_SERVICE_ID || "";
const DAYZ_IP = process.env.DAYZ_IP || "";
const DAYZ_PORT = process.env.DAYZ_PORT || "";
const LOG_DIR = process.env.DAYZ_LOG_DIR || path.join(__dirname, "../logs");

let cache = {
  lastScanAt: null,
  sources: {},
  capabilities: {},
  report: [],
  raw: {},
  players: [],
  recentEvents: []
};

let webhookQueue = Promise.resolve();

function safe(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function chunkText(text, size = 1800) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

async function postWebhook(payload) {
  if (!ADMIN_WEBHOOK_URL) return false;
  const res = await fetch(ADMIN_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

function queueWebhook(payload) {
  webhookQueue = webhookQueue
    .catch(() => {})
    .then(() => postWebhook(payload))
    .catch(err => {
      debug.fail("serverstate.webhook", err, { hasWebhook: !!ADMIN_WEBHOOK_URL });
      return false;
    });
  return webhookQueue;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, text, json, headers: Object.fromEntries(res.headers.entries()) };
}

function addReport(report, source, ok, summary, data) {
  report.push({ source, ok, summary: summary || "", data: data || null });
}

function guessPublicUrls() {
  const urls = [];
  if (DAYZ_IP && DAYZ_PORT) {
    urls.push(`https://gamemonitoring.net/dayz/servers/${encodeURIComponent(DAYZ_IP)}/${encodeURIComponent(DAYZ_PORT)}/api`);
    urls.push(`https://www.battlemetrics.com/servers/dayz/${encodeURIComponent(DAYZ_IP)}:${encodeURIComponent(DAYZ_PORT)}`);
  }
  return urls;
}

function guessNitradoUrls() {
  if (!NITRADO_SERVICE_ID || !NITRADO_API_KEY) return [];
  const base = "https://api.nitrado.net";
  return [
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/status`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/settings`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/files`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/logs`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/players`
  ];
}

function authHeaders() {
  return NITRADO_API_KEY ? { Authorization: `Bearer ${NITRADO_API_KEY}`, "Content-Type": "application/json" } : {};
}

function extractInteresting(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const keys = ["game", "game_name", "ip", "port", "players", "player_count", "status", "status_text", "map", "name", "hostname", "server", "service", "services", "game_server", "settings", "files"];
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return Object.keys(out).length ? out : obj;
}

async function probeUrls(urls, headers = {}) {
  const out = {};
  for (const url of urls) {
    try {
      const res = await fetchJson(url, { method: "GET", headers });
      out[url] = {
        ok: res.ok,
        status: res.status,
        preview: res.json ? extractInteresting(res.json) : res.text.slice(0, 700)
      };
    } catch (err) {
      out[url] = { ok: false, error: err.message };
    }
  }
  return out;
}

function parseLocalFiles() {
  const result = { dir: LOG_DIR, exists: false, files: [] };
  try {
    result.exists = fs.existsSync(LOG_DIR);
    if (result.exists) result.files = fs.readdirSync(LOG_DIR).slice(0, 30);
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

function buildDiscordContent() {
  const lines = [];
  lines.push("**DayZ/Nitrado Discovery Scan**");
  lines.push(`Time: ${cache.lastScanAt}`);
  lines.push(`Local logs dir: ${cache.sources.local?.exists ? "found" : "missing"}`);
  lines.push(`Nitrado auth: ${NITRADO_API_KEY ? "present" : "missing"}`);
  lines.push(`Nitrado service id: ${NITRADO_SERVICE_ID ? "present" : "missing"}`);
  lines.push(`Public IP/port: ${DAYZ_IP && DAYZ_PORT ? `${DAYZ_IP}:${DAYZ_PORT}` : "missing"}`);
  lines.push(`Public status hits: ${cache.capabilities.publicStatus ? "yes" : "no"}`);
  lines.push(`Nitrado hits: ${cache.capabilities.nitrado ? "yes" : "no"}`);
  lines.push(`Any live data: ${cache.capabilities.anyData ? "yes" : "no"}`);
  return lines.join("\n");
}

async function sendLongWebhook(title, body) {
  const chunks = chunkText(body);
  for (let i = 0; i < chunks.length; i++) {
    await queueWebhook({
      username: "Server State",
      content: i === 0 ? `**${title}**\n\n${chunks[i]}` : chunks[i]
    });
  }
}

async function refresh() {
  const report = [];
  const sources = {};

  sources.local = parseLocalFiles();
  addReport(report, "local", true, sources.local.exists ? `logDir exists: ${LOG_DIR}` : `logDir missing: ${LOG_DIR}`, sources.local);

  sources.publicStatus = await probeUrls(guessPublicUrls());
  const publicOk = Object.values(sources.publicStatus).some(v => v && v.ok);
  addReport(report, "publicStatus", publicOk, publicOk ? "at least one public status source responded" : "no public status source responded", sources.publicStatus);

  sources.nitrado = await probeUrls(guessNitradoUrls(), authHeaders());
  const nitradoOk = Object.values(sources.nitrado).some(v => v && v.ok);
  addReport(report, "nitrado", nitradoOk, nitradoOk ? "at least one Nitrado endpoint responded" : "no Nitrado endpoint responded", sources.nitrado);

  const anyData = publicOk || nitradoOk || sources.local.exists;

  cache = {
    lastScanAt: new Date().toISOString(),
    sources,
    capabilities: {
      publicStatus: publicOk,
      nitrado: nitradoOk,
      localFiles: sources.local.exists,
      anyData
    },
    report,
    raw: sources,
    players: [],
    recentEvents: []
  };

  debug.step("serverstate.refresh", {
    capabilities: cache.capabilities,
    publicUrls: Object.keys(sources.publicStatus || {}).length,
    nitradoUrls: Object.keys(sources.nitrado || {}).length,
    localDir: sources.local.dir
  });

  if (ADMIN_WEBHOOK_URL) {
    await sendLongWebhook("DayZ/Nitrado Discovery Scan", `${buildDiscordContent()}\n\n${safe(report)}`);
  }

  return cache;
}

function getState() { return cache; }
function getPlayers() { return cache.players || []; }
function getPlayerByName(name) { return getPlayers().find(p => String(p.name || "").toLowerCase() === String(name || "").toLowerCase()) || null; }
function getLastKnownLocation(name) {
  const p = getPlayerByName(name);
  if (!p) return null;
  return { name: p.name, x: p.x ?? p.location_x, y: p.y ?? p.location_y, z: p.z ?? p.location_z, timestamp: p.timestamp };
}
function getCapabilityReport() { return { lastScanAt: cache.lastScanAt, capabilities: cache.capabilities, sources: Object.keys(cache.sources || {}) }; }

function init() {
  try { refresh(); } catch (err) { debug.fail("serverstate.init", err, { logDir: LOG_DIR }); }
}

init();

module.exports = { refresh, getState, getPlayers, getPlayerByName, getLastKnownLocation, getCapabilityReport };
