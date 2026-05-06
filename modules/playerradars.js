const { EmbedBuilder } = require('discord.js');
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
  return String(line || '').replace(/\r$/, '').trim();
}

function cleanName(name) {
  const n = String(name || '').trim();
  return n ? n : 'Unknown';
}

function parsePlayerPos(line) {
  const m = String(line).match(/Player\s+"([^"]+)".*?pos=<\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*>/i);
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
    .filter(f => /\.adm$/i.test(f?.path || '') && typeof f?.content === 'string')
    .sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))[0] || null;
}

async function scanRadars() {
  if (state.running) return;
  state.running = true;

  try {
    const latestAdm = await getLatestAdmFile();
    if (!latestAdm?.content) return;

    const lines = String(latestAdm.content).split(/\r?\n/).filter(Boolean);
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

    for (const [name, radar] of Object.entries(radars)) {
      if (!radar || typeof radar.x !== 'number' || typeof radar.z !== 'number' || typeof radar.radius !== 'number') continue;
      if (!radar.webhookUrl) continue;

      const radarPos = { x: radar.x, z: radar.z };
      const hits = [];

      for (const player of players) {
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

async function handleAdd(interaction) {
  await loadRadars();

  const name = interaction.options.getString('name', true).trim();
  const x = interaction.options.getNumber('x', true);
  const z = interaction.options.getNumber('z', true);
  const radius = interaction.options.getString('radius', true);

  if (radars[name]) {
    return interaction.reply({ content: `Radar **${name}** already exists.`, ephemeral: true });
  }

  const webhook = await interaction.channel.createWebhook({
    name: `Radar - ${name}`,
    reason: 'Player radar detection webhook'
  });

  radars[name] = {
    x,
    z,
    radius: parseInt(radius, 10),
    webhookUrl: webhook.url,
    channelId: interaction.channelId,
    webhookId: webhook.id
  };

  await saveRadars();

  return interaction.reply({
    content: `✅ Radar **${name}** created for this channel.`,
    ephemeral: true
  });
}

async function handleRemove(interaction) {
  await loadRadars();

  const name = interaction.options.getString('name', true).trim();

  if (!radars[name]) {
    return interaction.reply({ content: `Radar **${name}** was not found.`, ephemeral: true });
  }

  delete radars[name];
  await saveRadars();

  return interaction.reply({
    content: `✅ Radar **${name}** removed.`,
    ephemeral: true
  });
}

async function handleView(interaction) {
  await loadRadars();

  const names = Object.keys(radars);

  if (!names.length) {
    return interaction.reply({ content: 'No radars are saved yet.', ephemeral: true });
  }

  const list = names
    .map(n => {
      const r = radars[n];
      return `• **${n}** — ${r.radius}m at ${coordLink(r.x, r.z, `${r.x}, ${r.z}`)}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Player Radars')
    .setColor(0x3498db)
    .setDescription(list);

  return interaction.reply({
    embeds: [embed],
    ephemeral: true
  });
}

function handleInteraction(interaction) {
  return;
}

async function init(client) {
  await loadRadars();
  startServerState();
  startScanning();

  if (!client.__playerradarInteractionBound) {
    client.__playerradarInteractionBound = true;
    client.on('interactionCreate', handleInteraction);
  }

  console.log('PlayerRadars module loaded');
}

module.exports = {
  init,
  stop: stopScanning,
  state,
  handleAdd,
  handleRemove,
  handleView
};
