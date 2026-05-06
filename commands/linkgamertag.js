const { SlashCommandBuilder } = require('discord.js');
const economy = require('../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('linkgamertag')
    .setDescription('Link your in‑game name to your Discord account')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Exact in‑game account name')
        .setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const discordId = interaction.user.id;
    const displayName = interaction.user.username;
    const inGameName = interaction.options.getString('name', true);

    try {
      const now = Date.now();
      const thirtyMinsAgo = now - 30 * 60 * 1000;

      const rows = await getRecentNitradoOnlineRecords(inGameName, thirtyMinsAgo);

      if (!rows.length) {
        return interaction.reply({
          content: `No player named \`${inGameName}\` was seen online in the last 30 minutes. Please enter the exact name as shown in‑game.`,
          ephemeral: true
        });
      }

      const latest = rows.sort((a, b) => b.timestamp - a.timestamp)[0];

      await economy.upsertGamertagLink({
        userId: discordId,
        guildId,
        username: displayName,
        gamertag: inGameName,
        lastSeenAt: latest.timestamp
      });

      const embed = new EmbedBuilder()
        .setTitle('Gamer tag linked')
        .setDescription(`\`${inGameName}\` has been linked to your Discord account.`)
        .setColor(0x2ecc71);

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('linkgamertag command error:', error);
      return interaction.reply({
        content: 'Something went wrong while linking your gamer tag.',
        ephemeral: true
      });
    }
  }
};


async function getRecentNitradoOnlineRecords(name, fromTimestamp) {
  return []; // stub your Nitrado log reader here
}
