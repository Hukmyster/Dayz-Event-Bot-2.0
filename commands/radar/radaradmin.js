const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
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

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radaradmin')
    .setDescription('Add or remove radar admins.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a radar admin.')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to add').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a radar admin.')
        .addUserOption(opt =>
          opt.setName('user').setDescription('User to remove').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user', true);

    const radars = await loadRadars();
    const radar = radars.find(r => normalizeName(r.name) === 'default') || null;

    if (!radar) {
      return interaction.reply({ content: 'No radar config found.', ephemeral: true });
    }

    radar.admins = Array.isArray(radar.admins) ? radar.admins : [];
    const userId = user.id;

    if (sub === 'add') {
      if (radar.admins.includes(userId)) {
        return interaction.reply({ content: `${user.tag} is already a radar admin.`, ephemeral: true });
      }

      radar.admins.push(userId);
      await saveRadars(radars);

      return interaction.reply({
        content: `Added ${user.tag} as a radar admin.`,
        ephemeral: true
      });
    }

    if (sub === 'remove') {
      if (!radar.admins.includes(userId)) {
        return interaction.reply({ content: `${user.tag} is not a radar admin.`, ephemeral: true });
      }

      radar.admins = radar.admins.filter(id => id !== userId);
      await saveRadars(radars);

      return interaction.reply({
        content: `Removed ${user.tag} from radar admins.`,
        ephemeral: true
      });
    }
  }
};
