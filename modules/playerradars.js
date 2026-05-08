const { EmbedBuilder, MessageFlags } = require("discord.js");
const { start: startServerState, getFiles } = require("./serverstate");
const storage = require("../services/storage");

const SCAN_INTERVAL = 6 * 60 * 1000;
const MAP_BASE = "https://www.izurvive.com/chernarusplussatmap/#location=";

const state = {
  started: false,
  timer: null,
  running: false,
  fileState: new Map(),
  sentEventIds: new Set()
};

let radars = {};

function coordLink(x, z, label) {
  const displayLabel = label || `${Math.round(x)}, ${Math.round(z)}`;
  return `[${displayLabel}](${MAP_BASE}${Number(x).toFixed(0)};${Number(z).toFixed(0)};8)`;
}

function normalizeRadar(radar) {
  if (!radar || typeof radar !== "object") return null;
  radar.name = String(radar.name || "").trim();
  radar.x = Number(radar.x);
  radar.z = Number(radar.z);
  radar.radius = Number(radar.radius);
  radar.channelId = radar.channelId || null;
  radar.webhookUrl = radar.webhookUrl || null;
  radar.webhookId = radar.webhookId || null;
  radar.adminId = radar.adminId || null;
  radar.admins = Array.isArray(radar.admins) ? radar.admins : [];
  radar.ignore = Array.isArray(radar.ignore) ? radar.ignore : [];
  radar.ignored = Array.isArray(radar.ignored) ? radar.ignored : [];
  return radar;
}

async function loadRadars() {
  const data = await storage.loadJson("radars");
  if (Array.isArray(data)) {
    const obj = {};
    for (const radar of data) {
      if (radar?.name) obj[radar.name] = radar;
    }
    radars = obj;
    return;
  }
  radars = data && typeof data === "object" ? data : {};
}

async function saveRadars() {
  await storage.saveJson("radars", radars);
}

function ensureRadar(name) {
  const radar = normalizeRadar(radars[name]);
  if (!radar) return null;
  radars[name] = radar;
  return radar;
}

function buildRadarEventId(radarName, player, radar) {
  return [
    radarName,
    player.name,
    Math.round(player.x),
    Math.round(player.z),
    radar.x,
    radar.z,
    radar.radius
  ].join("|");
}

function parsePlayerPos(line) {
  const m = String(line).match(/Player\s+"([^"]+)".*?pos=<\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*>/i);
  if (!m) return null;

  return {
    name: String(m[1] || "").trim() || "Unknown",
    x: Number(m[2]) || 0,
    y: Number(m[3]) || 0,
    z: Number(m[4]) || 0,
    raw: line
  };
}

function distance2d(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.z - b.z, 2));
}

function radarEmbed(radarName, radar, hits) {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${radarName} Detection`)
    .setColor(0xffa500)
    .setTimestamp(new Date())
    .setDescription(
      `Radar center: ${coordLink(radar.x, radar.z, `${radarName} center`)}\n` +
      `Radius: ${radar.radius}m\n` +
      `Hits: ${hits.length}`
    );

  const fields = hits.slice(0, 10).map(hit => ({
    name: hit.name,
    value: `${Math.round(hit.distance)}m away • ${coordLink(hit.x, hit.z, `${Math.round(hit.x)}, ${Math.round(hit.z)}`)}`,
    inline: false
  }));

  if (fields.length) embed.addFields(fields);
  if (hits.length > 10) {
    embed.addFields({
      name: "More",
      value: `${hits.length - 10} additional player(s) detected.`,
      inline: false
    });
  }

  return embed;
}

async function getLatestAdmFile() {
  const files = getFiles() || [];
  return files
    .filter(f => /\.adm$/i.test(f?.path || "") && typeof f?.content === "string")
    .sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))[0] || null;
}

async function scanRadars() {
  if (state.running) return;
  state.running = true;

  try {
    const latestAdm = await getLatestAdmFile();
    if (!latestAdm?.content) return;

    const lines = String(latestAdm.content).split(/\r?\n/).filter(Boolean);
    const previous = state.fileState.get(latestAdm.path) || { lineCount: 0, lastLine: "" };
    const currentLineCount = lines.length;
    const startIndex = currentLineCount >= previous.lineCount && previous.lineCount > 0 ? previous.lineCount : 0;

    const players = [];
    for (let i = startIndex; i < lines.length; i++) {
      const parsed = parsePlayerPos(lines[i]);
      if (parsed) players.push(parsed);
    }

    state.fileState.set(latestAdm.path, {
      lineCount: currentLineCount,
      lastLine: String(lines[lines.length - 1] || "").trim()
    });

    for (const [name, rawRadar] of Object.entries(radars)) {
      const radar = normalizeRadar(rawRadar);
      if (!radar || Number.isNaN(radar.x) || Number.isNaN(radar.z) || Number.isNaN(radar.radius)) continue;
      if (!radar.webhookUrl) continue;

      const radarPos = { x: radar.x, z: radar.z };
      const ignoredNames = new Set([
        ...(radar.ignore || []),
        ...(radar.ignored || [])
      ].map(v => String(v).toLowerCase()));

      const hits = [];

      for (const player of players) {
        if (ignoredNames.has(String(player.name).toLowerCase())) continue;

        const dist = distance2d(player, radarPos);
        if (dist <= radar.radius) {
          const eventId = buildRadarEventId(name, player, radar);
          if (state.sentEventIds.has(eventId)) continue;
          state.sentEventIds.add(eventId);

          hits.push({
            name: player.name,
            x: player.x,
            z: player.z,
            distance: dist
          });
        }
      }

      if (!hits.length) continue;

      const res = await fetch(radar.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [radarEmbed(name, radar, hits).toJSON()] })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Webhook HTTP ${res.status}: ${text.slice(0, 250)}`);
      }
    }
  } finally {
    state.running = false;
  }
}

function startScanning() {
  if (state.timer) return;

  state.timer = setInterval(() => {
    scanRadars().catch(err => console.error("[PLAYERRADAR] scan error:", err));
  }, SCAN_INTERVAL);

  scanRadars().catch(err => console.error("[PLAYERRADAR] initial scan error:", err));
}

function stopScanning() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
}

async function handleAdd(interaction) {
  await loadRadars();

  const name = String(interaction.options.getString("name") || "").trim();
  const x = interaction.options.getNumber("x");
  const z = interaction.options.getNumber("z");
  const radius = interaction.options.getInteger("radius");

  if (!name || x === null || z === null || radius === null) {
    return { reply: "Missing radar options.", success: false };
  }

  const radarName = name;
  if (radars[radarName]) {
    return { reply: `Radar **${radarName}** already exists.`, success: false };
  }

  let webhook;
  try {
    webhook = await interaction.channel.createWebhook({
      name: `Radar - ${radarName}`,
      reason: "Player radar detection webhook"
    });
  } catch (err) {
    if (err?.code === 50013) {
      return { reply: "Discord blocked webhook creation in this channel. Check Manage Webhooks.", success: false };
    }
    throw err;
  }

  radars[radarName] = normalizeRadar({
    name: radarName,
    x,
    z,
    radius,
    webhookUrl: webhook.url,
    channelId: interaction.channelId,
    webhookId: webhook.id,
    adminId: interaction.user.id,
    admins: [],
    ignore: [],
    ignored: []
  });

  await saveRadars();
  return { reply: `✅ Radar **${radarName}** created for this channel.`, success: true };
}

async function handleRemove(interaction) {
  await loadRadars();

  const name = String(interaction.options.getString("name") || "").trim();
  if (!name) return { reply: "Missing radar name.", success: false };

  if (!radars[name]) {
    return { reply: `Radar **${name}** was not found.`, success: false };
  }

  delete radars[name];
  await saveRadars();

  return { reply: `✅ Radar **${name}** removed.`, success: true };
}

async function handleView(interaction) {
  await loadRadars();

  const names = Object.keys(radars);
  if (!names.length) {
    return { reply: "No radars are saved yet.", success: false };
  }

  const list = names.map(n => {
    const r = ensureRadar(n);
    return `• **${n}** — ${r.radius}m at ${coordLink(r.x, r.z, `${r.x}, ${r.z}`)}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("Player Radars")
    .setColor(0x3498db)
    .setDescription(list);

  return { embeds: [embed], success: true };
}

async function addRadarAdmin(name, userId) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.`, success: false };

  radar.adminId = userId;
  if (!radar.admins.includes(userId)) radar.admins.push(userId);
  await saveRadars();
  return { reply: `✅ Added radar admin to **${name}**.`, success: true };
}

async function removeRadarAdmin(name, userId) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.`, success: false };

  const wasAdmin = radar.adminId === userId;
  radar.adminId = null;
  radar.admins = radar.admins.filter(id => id !== userId);
  await saveRadars();

  if (!wasAdmin) {
    return { reply: `❌ User is not currently an admin for this radar.`, success: false };
  }

  return { reply: `✅ Radar "${radar.name}" admin removed.`, success: true };
}

async function addRadarIgnore(name, playerName) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.`, success: false };

  const key = String(playerName || "").trim();
  if (!key) return { reply: "Missing player name.", success: false };

  if (!radar.ignore.includes(key)) radar.ignore.push(key);
  if (!radar.ignored.includes(key)) radar.ignored.push(key);

  await saveRadars();
  return { reply: `✅ Added **${key}** to ignore list for **${name}**.`, success: true };
}

async function removeRadarIgnore(name, playerName) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.`, success: false };

  const key = String(playerName || "").trim().toLowerCase();
  radar.ignore = radar.ignore.filter(x => String(x).toLowerCase() !== key);
  radar.ignored = radar.ignored.filter(x => String(x).toLowerCase() !== key);

  await saveRadars();
  return { reply: `✅ Removed **${playerName}** from ignore list for **${name}**.`, success: true };
}

async function listRadars() {
  await loadRadars();
  return Object.entries(radars).map(([name, radar]) => {
    const r = normalizeRadar(radar);
    return {
      name,
      x: r.x,
      z: r.z,
      radius: r.radius,
      channelId: r.channelId,
      admins: r.admins,
      ignore: r.ignore,
      ignored: r.ignored
    };
  });
}

async function createRadar({ name, x, z, radius, channelId, createdBy }) {
  await loadRadars();
  const radarName = String(name || "").trim();
  if (!radarName) return { reply: "Missing radar name.", success: false };
  if (radars[radarName]) return { reply: `Radar **${radarName}** already exists.`, success: false };

  radars[radarName] = normalizeRadar({
    name: radarName,
    x,
    z,
    radius,
    channelId,
    adminId: createdBy,
    admins: [createdBy],
    ignore: [],
    ignored: []
  });

  await saveRadars();
  return { reply: `✅ Radar **${radarName}** created.`, success: true };
}

async function removeRadar(name) {
  await loadRadars();
  const radarName = String(name || "").trim();
  if (!radars[radarName]) return { reply: `Radar **${radarName}** was not found.`, success: false };

  delete radars[radarName];
  await saveRadars();
  return { reply: `✅ Radar **${radarName}** removed.`, success: true };
}

async function init(client) {
  await loadRadars();
  startServerState();
  startScanning();
  console.log("PlayerRadars module loaded");
}

module.exports = {
  init,
  stop: stopScanning,
  state,
  handleAdd,
  handleRemove,
  handleView,
  addRadarAdmin,
  removeRadarAdmin,
  addRadarIgnore,
  removeRadarIgnore,
  listRadars,
  createRadar,
  removeRadar
};
