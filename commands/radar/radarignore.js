const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const RADAR_FILE = path.join(__dirname, 'radars.json');

async function loadRadars() {
  try {
    const raw = await fs.readFile(RADAR_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRadars(radars) {
  await fs.writeFile(RADAR_FILE, JSON.stringify(radars, null, 2), 'utf8');
}

function getRadar(radars) {
  return radars.find(r => String(r.name || '').trim().toLowerCase() === 'default') || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radarignore')
    .setDescription('Add or remove players from the radar ignore list.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Ignore a player.')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Player name').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Unignore a player.')
        .addStringOption(opt =>
          opt.setName('name').setDescription('Player name').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List ignored players.')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const radars = await loadRadars();
    const radar = getRadar(radars);

    if (!radar) {
      return interaction.reply({ content: 'No radar config found.', ephemeral: true });
    }

    radar.ignore = Array.isArray(radar.ignore) ? radar.ignore : [];

    if (sub === 'list') {
      const list = radar.ignore.length ? radar.ignore.join(', ') : 'None';
      return interaction.reply({ content: `Ignored players: ${list}`, ephemeral: true });
    }

    const name = interaction.options.getString('name', true).trim();
    const key = name.toLowerCase();
    const exists = radar.ignore.some(x => String(x).toLowerCase() === key);

    if (sub === 'add') {
      if (exists) {
        return interaction.reply({ content: `${name} is already ignored.`, ephemeral: true });
      }

      radar.ignore.push(name);
      await saveRadars(radars);

      return interaction.reply({
        content: `Added ${name} to radar ignore.`,
        ephemeral: true
      });
    }

    if (sub === 'remove') {
      if (!exists) {
        return interaction.reply({ content: `${name} is not on the ignore list.`, ephemeral: true });
      }

      radar.ignore = radar.ignore.filter(x => String(x).toLowerCase() !== key);
      await saveRadars(radars);

      return interaction.reply({
        content: `Removed ${name} from radar ignore.`,
        ephemeral: true
      });
    }
  }
};
