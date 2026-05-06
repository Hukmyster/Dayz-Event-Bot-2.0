const fs = require("fs");
const path = require("path");
const debug = require("../utils/debug");

const ADMIN_WEBHOOK_URL = process.env.ADMIN_WEBHOOK_URL || "";
const DAYZ_IP = process.env.DAYZ_IP || "";
const DAYZ_PORT = process.env.DAYZ_PORT || "";
const NITRADO_SERVICE_ID = process.env.NITRADO_SERVICE_ID || "";
const NITRADO_API_KEY = process.env.NITRADO_API_KEY || "";
const NITRADO_REFRESH_URL = process.env.NITRADO_REFRESH_URL || "";
const LOG_DIR = process.env.DAYZ_LOG_DIR || path.join(__dirname, "../logs");

let cache = {
  lastScanAt: null,
  sources: {},
  capabilities: {},
  raw: {},
  report: [],
  players: [],
  recentEvents: []
};

let webhookQueue = Promise.resolve();

function safeJson(x) {
  try { return JSON.stringify(x); } catch { return String(x); }
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

function addReport(report, source, ok, summary, data) {
  report.push({
    source,
    ok,
    summary: summary || "",
    data: data || null
  });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: res.ok, status: res.status, text, json, headers: Object.fromEntries(res.headers.entries()) };
}

function guessQueryUrls() {
  const urls = [];
  if (DAYZ_IP && DAYZ_PORT) {
    urls.push(`https://api.gamemonitoring.net/dayz/servers/${encodeURIComponent(DAYZ_IP)}:${encodeURIComponent(DAYZ_PORT)}/api`);
    urls.push(`https://gamemonitoring.net/dayz/servers/${encodeURIComponent(DAYZ_IP)}/${encodeURIComponent(DAYZ_PORT)}/api`);
    urls.push(`https://www.battlemetrics.com/servers/dayz/${encodeURIComponent(DAYZ_IP)}:${encodeURIComponent(DAYZ_PORT)}`);
  }
  if (NITRADO_REFRESH_URL) urls.push(NITRADO_REFRESH_URL);
  return urls;
}

async function probePublicStatus() {
  const out = {};
  const urls = guessQueryUrls();
  for (const url of urls) {
    try {
      const res = await fetchJson(url, { method: "GET" });
      out[url] = {
        ok: res.ok,
        status: res.status,
        hasJson: !!res.json,
        preview: res.json ? res.json : res.text.slice(0, 500)
      };
    } catch (err) {
      out[url] = { ok: false, error: err.message };
    }
  }
  return out;
}

async function probeNitrado() {
  const out = {};
  if (!NITRADO_SERVICE_ID || !NITRADO_API_KEY) return out;

  const base = "https://api.nitrado.net";
  const headers = {
    Authorization: `Bearer ${NITRADO_API_KEY}`,
    "Content-Type": "application/json"
  };

  const urls = [
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/settings`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/status`,
    `${base}/services/${encodeURIComponent(NITRADO_SERVICE_ID)}/gameservers/files`
  ];

  for (const url of urls) {
    try {
      const res = await fetchJson(url, { method: "GET", headers });
      out[url] = {
        ok: res.ok,
        status: res.status,
        hasJson: !!res.json,
        preview: res.json ? res.json : res.text.slice(0, 500)
      };
    } catch (err) {
      out[url] = { ok: false, error: err.message };
    }
  }

  return out;
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function safeListDir(dir) {
  try {
    return fs.readdirSync(dir).map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

async function probeLocalFiles() {
  const files = {};
  const all = safeListDir(LOG_DIR);
  files.dirExists = !!all.length || exists(LOG_DIR);
  files.sample = all.slice(0, 25);
  return files;
}

async function refresh() {
  const report = [];
  const sources = {};

  sources.local = await probeLocalFiles();
  addReport(report, "local", true, `logDir=${LOG_DIR}`, sources.local);

  sources.publicStatus = await probePublicStatus();
  addReport(report, "publicStatus", true, "queried public/status endpoints", sources.publicStatus);

  sources.nitrado = await probeNitrado();
  addReport(report, "nitrado", true, "queried Nitrado endpoints", sources.nitrado);

  const capabilityHints = {
    publicStatus: Object.values(sources.publicStatus || {}).some(x => x && x.ok),
    nitrado: Object.values(sources.nitrado || {}).some(x => x && x.ok),
    anyData: false
  };

  const hasAnyData =
    capabilityHints.publicStatus ||
    capabilityHints.nitrado ||
    (sources.local && sources.local.dirExists);

  capabilityHints.anyData = hasAnyData;

  cache = {
    lastScanAt: new Date().toISOString(),
    sources,
    capabilities: capabilityHints,
    raw: {
      publicStatus: sources.publicStatus,
      nitrado: sources.nitrado,
      local: sources.local
    },
    report,
    players: [],
    recentEvents: []
  };

  const summaryLines = [
    `**DayZ/Nitrado discovery scan**`,
    `Local log dir: ${sources.local?.dirExists ? "found" : "not found"}`,
    `Public status hits: ${capabilityHints.publicStatus ? "yes" : "no"}`,
    `Nitrado hits: ${capabilityHints.nitrado ? "yes" : "no"}`
  ];

  if (ADMIN_WEBHOOK_URL) {
    queueWebhook({
      username: "Server State",
      content: summaryLines.join("\n"),
      embeds: [
        {
          title: "Discovery results",
          color: 0x2ecc71,
          fields: report.slice(0, 25).map(r => ({
            name: r.source,
            value: r.ok ? (r.summary || "ok") : "failed",
            inline: false
          }))
        }
      ]
    });
  } else {
    debug.step("serverstate.refresh", {
      capabilities: cache.capabilities,
      sources: Object.keys(sources)
    });
  }

  return cache;
}

function getState() {
  return cache;
}

function getPlayers() {
  return cache.players || [];
}

function getPlayerByName(name) {
  const n = String(name || "").toLowerCase();
  return getPlayers().find(p => String(p.name || "").toLowerCase() === n) || null;
}

function getLastKnownLocation(name) {
  const p = getPlayerByName(name);
  if (!p) return null;
  return {
    name: p.name,
    x: p.location_x,
    y: p.location_y,
    z: p.location_z,
    timestamp: p.timestamp
  };
}

function getCapabilityReport() {
  return {
    lastScanAt: cache.lastScanAt,
    capabilities: cache.capabilities,
    sources: Object.keys(cache.sources || {}),
    localLogDir: LOG_DIR
  };
}

function init() {
  try {
    refresh();
  } catch (err) {
    debug.fail("serverstate.init", err, { logDir: LOG_DIR });
  }
}

init();

module.exports = {
  refresh,
  getState,
  getPlayers,
  getPlayerByName,
  getLastKnownLocation,
  getCapabilityReport
};
