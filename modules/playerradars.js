const { EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { start: startServerState, getFiles } = require('./serverstate');

const RADARS_FILE = path.join(__dirname, 'radars.json');
const SCAN_INTERVAL = 6 * 60 * 1000;
const MAP_BASE = 'https://www.izurvive.com/chernarusplussatmap/#location=';

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

function normalizeLine(line) {
  return String(line || '').replace(/\\r$/, '').trim();
}

function cleanName(name) {
  const n = String(name || '').trim();
  return n ? n : 'Unknown';
}

function parsePlayerPos(line) {
  const m = String(line).match(/Player\\s+"([^"]+)".*?pos=<\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*>/i);
  if (!m) return null;

  return {
    name: cleanName(m[1]),
    x: Number(m[2]) || 0,
    y: Number(m[3]) || 0,
    z: Number(m[4]) || 0,
    raw: line
  };
}

function distance2d(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.z - b.z, 2));
}

async function loadRadars() {
  try {
    const data = await fs.readFile(RADARS_FILE, 'utf8');
    radars = JSON.parse(data) || {};
  } catch {
    radars = {};
  }
}

async function saveRadars() {
  await fs.writeFile(RADARS_FILE, JSON.stringify(radars, null, 2));
}

function normalizeRadar(radar) {
  if (!radar || typeof radar !== 'object') return null;
  radar.admins = Array.isArray(radar.admins) ? radar.admins : [];
  radar.ignore = Array.isArray(radar.ignore) ? radar.ignore : [];
  return radar;
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
  ].join('|');
}

function radarEmbed(radarName, radar, hits) {
  const embed = new EmbedBuilder()
    .setTitle(`⚠️ ${radarName} Detection`)
    .setColor(0xffa500)
    .setTimestamp(new Date())
    .setDescription(
      `Radar center: ${coordLink(radar.x, radar.z, `${radarName} center`)}\\n` +
      `Radius: ${radar.radius}m\\n` +
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
      name: 'More',
      value: `${hits.length - 10} additional player(s) detected.`,
      inline: false
    });
  }

  return embed;
}

async function getLatestAdmFile() {
  const files = getFiles() || [];
  return files
    .filter(f => /\\.adm$/i.test(f?.path || '') && typeof f?.content === 'string')
    .sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))[0] || null;
}

async function scanRadars() {
  if (state.running) return;
  state.running = true;

  try {
    const latestAdm = await getLatestAdmFile();
    if (!latestAdm?.content) return;

    const lines = String(latestAdm.content).split(/\\r?\\n/).filter(Boolean);
    const previous = state.fileState.get(latestAdm.path) || { lineCount: 0, lastLine: '' };
    const currentLineCount = lines.length;
    const startIndex = currentLineCount >= previous.lineCount && previous.lineCount > 0 ? previous.lineCount : 0;

    const players = [];
    for (let i = startIndex; i < lines.length; i++) {
      const line = normalizeLine(lines[i]);
      const parsed = parsePlayerPos(line);
      if (parsed) players.push(parsed);
    }

    state.fileState.set(latestAdm.path, {
      lineCount: currentLineCount,
      lastLine: normalizeLine(lines[lines.length - 1] || '')
    });

    for (const [name, rawRadar] of Object.entries(radars)) {
      const radar = normalizeRadar(rawRadar);
      if (!radar || typeof radar.x !== 'number' || typeof radar.z !== 'number' || typeof radar.radius !== 'number') continue;
      if (!radar.webhookUrl) continue;

      const radarPos = { x: radar.x, z: radar.z };
      const hits = [];

      for (const player of players) {
        if (radar.ignore.includes(player.name)) continue;

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [radarEmbed(name, radar, hits).toJSON()] })
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
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
    scanRadars().catch(err => console.error('[PLAYERRADAR] scan error:', err));
  }, SCAN_INTERVAL);

  scanRadars().catch(err => console.error('[PLAYERRADAR] initial scan error:', err));
}

function stopScanning() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.running = false;
}

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function handleAdd(interaction) {
  await loadRadars();

  const name = interaction.options.getString('name');
  const x = interaction.options.getNumber('x');
  const z = interaction.options.getNumber('z');
  const radius = interaction.options.getInteger('radius');

  if (!name || x === null || z === null || radius === null) {
    return replyEphemeral(interaction, 'Missing radar options.');
  }

  const radarName = name.trim();

  if (radars[radarName]) {
    return replyEphemeral(interaction, `Radar **${radarName}** already exists.`);
  }

  let webhook;
  try {
    webhook = await interaction.channel.createWebhook({
      name: `Radar - ${radarName}`,
      reason: 'Player radar detection webhook'
    });
  } catch (err) {
    if (err?.code === 50013) {
      return replyEphemeral(interaction, 'Discord blocked webhook creation in this channel. Check channel overrides and Manage Webhooks.');
    }
    throw err;
  }

  radars[radarName] = normalizeRadar({
    x,
    z,
    radius,
    webhookUrl: webhook.url,
    channelId: interaction.channelId,
    webhookId: webhook.id,
    admins: [],
    ignore: []
  });

  await saveRadars();

  return replyEphemeral(interaction, `✅ Radar **${radarName}** created for this channel.`);
}

async function handleRemove(interaction) {
  await loadRadars();

  const name = interaction.options.getString('name');
  if (!name) {
    return replyEphemeral(interaction, 'Missing radar name.');
  }

  const radarName = name.trim();

  if (!radars[radarName]) {
    return replyEphemeral(interaction, `Radar **${radarName}** was not found.`);
  }

  delete radars[radarName];
  await saveRadars();

  return replyEphemeral(interaction, `✅ Radar **${radarName}** removed.`);
}

async function handleView(interaction) {
  await loadRadars();

  const names = Object.keys(radars);

  if (!names.length) {
    return replyEphemeral(interaction, 'No radars are saved yet.');
  }

  const list = names
    .map(n => {
      const r = ensureRadar(n);
      return `• **${n}** — ${r.radius}m at ${coordLink(r.x, r.z, `${r.x}, ${r.z}`)}`;
    })
    .join('\\n');

  const embed = new EmbedBuilder()
    .setTitle('Player Radars')
    .setColor(0x3498db)
    .setDescription(list);

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function handleAdminList() {
  return { reply: 'Use /radaradmin add or /radaradmin remove.' };
}

async function addRadarAdmin(name, userId) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.` };

  if (!radar.admins.includes(userId)) radar.admins.push(userId);
  await saveRadars();
  return { reply: `✅ Added radar admin to **${name}**.` };
}

async function removeRadarAdmin(name, userId) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.` };

  radar.admins = radar.admins.filter(id => id !== userId);
  await saveRadars();
  return { reply: `✅ Removed radar admin from **${name}**.` };
}

async function addRadarIgnore(name, playerName) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.` };

  const key = String(playerName || '').trim();
  if (!key) return { reply: 'Missing player name.' };

  if (!radar.ignore.some(x => String(x).toLowerCase() === key.toLowerCase())) {
    radar.ignore.push(key);
  }
  await saveRadars();
  return { reply: `✅ Added **${key}** to ignore list for **${name}**.` };
}

async function removeRadarIgnore(name, playerName) {
  await loadRadars();
  const radar = ensureRadar(name);
  if (!radar) return { reply: `Radar **${name}** was not found.` };

  const key = String(playerName || '').trim().toLowerCase();
  radar.ignore = radar.ignore.filter(x => String(x).toLowerCase() !== key);
  await saveRadars();
  return { reply: `✅ Removed **${playerName}** from ignore list for **${name}**.` };
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
      ignore: r.ignore
    };
  });
}

async function createRadar({ name, x, z, radius, channelId, createdBy }) {
  await loadRadars();
  const radarName = String(name || '').trim();
  if (!radarName) return { reply: 'Missing radar name.' };
  if (radars[radarName]) return { reply: `Radar **${radarName}** already exists.` };

  radars[radarName] = normalizeRadar({
    x,
    z,
    radius,
    channelId,
    createdBy,
    admins: [],
    ignore: []
  });
  await saveRadars();
  return { reply: `✅ Radar **${radarName}** created.` };
}

async function removeRadar(name) {
  await loadRadars();
  const radarName = String(name || '').trim();
  if (!radars[radarName]) return { reply: `Radar **${radarName}** was not found.` };
  delete radars[radarName];
  await saveRadars();
  return { reply: `✅ Radar **${radarName}** removed.` };
}

async function init(client) {
  await loadRadars();
  startServerState();
  startScanning();
  console.log('PlayerRadars module loaded');
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
