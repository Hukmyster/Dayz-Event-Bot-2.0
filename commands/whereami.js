const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whereami')
    .setDescription('Show your latest known location'),

  async execute(interaction) {
    try {
      const last = await getPlayerLastLocation(interaction.user.id, interaction.guildId);

      if (!last) {
        return interaction.reply({
          content: 'No recent location found for you.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('Your Latest Location')
        .setDescription(`You were last seen at:`)
        .addFields(
          { name: 'X', value: String(last.x), inline: true },
          { name: 'Y', value: String(last.y ?? 0), inline: true },
          { name: 'Z', value: String(last.z), inline: true }
        )
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('whereami command error:', error);
      return interaction.reply({
        content: 'Something went wrong while looking up your location.',
        ephemeral: true
      });
    }
  }
};


async function getPlayerLastLocation(userId, guildId) {
  const now = Date.now();
  const thirtyMinsAgo = now - 30 * 60 * 1000;

  const rows = await getNitradoLogEntries(userId, guildId, thirtyMinsAgo);
  const latest = rows
    .filter(r => r.timestamp >= thirtyMinsAgo)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  if (!latest) return null;

  return {
    x: Number(latest.location_x) || 0,
    y: Number(latest.location_y) || 0,
    z: Number(latest.location_z) || 0
  };
}

async function getNitradoLogEntries(userId, guildId, fromTimestamp) {
  return []; // stub your Nitrado log reader here
}
