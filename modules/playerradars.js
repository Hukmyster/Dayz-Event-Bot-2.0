const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { nitradoApi } = require('./nitrado');
const { parseDayZLog } = require('./logParser');
require('dotenv').config();

const RADARS_FILE = path.join(__dirname, 'radars.json');
const SCAN_INTERVAL = 6 * 60 * 1000;
const MAP_BASE = 'https://www.izurvive.com/chernarusplussatmap/#location=';

let radars = {};

function coordLink(x, z, label) {
  const displayLabel = label || `${Math.round(x)}, ${Math.round(z)}`;
  return `[${displayLabel}](${MAP_BASE}${x.toFixed(0)};${z.toFixed(0)};8)`;
}

async function loadRadars() {
  try {
    const data = await fs.readFile(RADARS_FILE, 'utf8');
    radars = JSON.parse(data);
  } catch {
    radars = {};
  }
}

async function saveRadars() {
  await fs.writeFile(RADARS_FILE, JSON.stringify(radars, null, 2));
  try {
    await nitradoApi.uploadFile('radars.json', await fs.readFile(RADARS_FILE));
  } catch (e) {
    console.error("Failed to upload radars.json to Nitrado:", e);
  }
}

async function scanRadars(logContent) {
  const players = parseDayZLog(logContent);

  for (const [name, radar] of Object.entries(radars)) {
    const detections = players
      .filter(p => Math.sqrt(Math.pow(p.x - radar.x, 2) + Math.pow(p.z - radar.z, 2)) <= radar.radius)
      .map(p => `${p.name} - ${Math.round(Math.sqrt(Math.pow(p.x - radar.x, 2) + Math.pow(p.z - radar.z, 2)))}m`);

    if (detections.length > 0 && radar.webhookUrl) {
      try {
        await fetch(radar.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: `⚠️ ${name} Detection`,
              description: detections.join('\n'),
              color: 0xffa500,
              timestamp: new Date()
            }]
          })
        });
      } catch (e) {
        console.error(`Failed to post radar alert to webhook for ${name}:`, e);
      }
    }
  }
}

function startScanning(client) {
  setInterval(async () => {
    try {
      const logContent = await nitradoApi.getLatestLog();
      await scanRadars(logContent);
    } catch (e) {
      console.error("Radar scan error:", e);
    }
  }, SCAN_INTERVAL);
}

async function registerCommands(client) {
  const commands = [
    new SlashCommandBuilder()
      .setName('playerradaradd')
      .setDescription('Add a player radar in this channel')
      .addStringOption(o => o.setName('name').setDescription('Radar name').setRequired(true))
      .addNumberOption(o => o.setName('x').setDescription('X coord').setRequired(true))
      .addNumberOption(o => o.setName('z').setDescription('Z coord').setRequired(true))
      .addStringOption(o => o.setName('radius').setDescription('Radius in m').setRequired(true).addChoices(
        { name: '100m', value: '100' }, { name: '200m', value: '200' },
        { name: '300m', value: '300' }, { name: '400m', value: '400' }, { name: '500m', value: '500' }
      ))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('playerradarremove')
      .setDescription('Remove a radar')
      .addStringOption(o => o.setName('name').setDescription('Radar name').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
      .setName('playerradarview')
      .setDescription('View all radars')
  ].map(cmd => cmd.toJSON());

  await client.application.commands.set(commands);
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;

  await loadRadars();
  const { commandName } = interaction;

  try {
    if (commandName === 'playerradaradd') {
      const name = interaction.options.getString('name');
      if (radars[name]) throw new Error('Radar exists');

      const webhook = await interaction.channel.createWebhook({
        name: `Radar - ${name}`,
        reason: 'Radar detection webhook'
      });

      radars[name] = {
        x: interaction.options.getNumber('x'),
        z: interaction.options.getNumber('z'),
        radius: parseInt(interaction.options.getString('radius')),
        webhookUrl: webhook.url
      };

      await saveRadars();
      await interaction.reply(`✅ Radar **${name}** created for this channel.`);

    } else if (commandName === 'playerradarremove') {
      const name = interaction.options.getString('name');
      if (!radars[name]) throw new Error('Not found');
      delete radars[name];
      await saveRadars();
      await interaction.reply(`✅ Radar **${name}** removed.`);

    } else if (commandName === 'playerradarview') {
      await interaction.reply(Object.keys(radars).join(', '));
    }
  } catch (e) {
    await interaction.reply(`Error: ${e.message}`);
  }
}

async function init(client) {
  await loadRadars();
  await registerCommands(client);
  startScanning(client);
  client.on('interactionCreate', handleInteraction);
  console.log('PlayerRadars module loaded');
}

module.exports = { init };
