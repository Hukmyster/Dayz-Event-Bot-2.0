const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the richest players in the server'),

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const guildId = interaction.guildId;

      // Get all accounts from storage
      const allAccounts = Object.values(economy.economyData || {}).filter(acc => acc.guild_id === guildId);

      if (!allAccounts.length) {
        return interaction.reply({
          content: 'No economy accounts found yet.',
          ephemeral: true
        });
      }

      const sorted = allAccounts
        .map(x => ({
          user_id: x.user_id,
          username: x.username || 'Unknown',
          total: Number(x.wallet || 0) + Number(x.bank || 0)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      const lines = sorted.map((user, index) => {
        return `${index + 1}. **${user.username}** — ${economy.formatMoney(user.total)}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('Economy Leaderboard')
        .setDescription(lines.join('\n'))
        .setColor(0xf1c40f)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('leaderboard command error:', error);
      return interaction.reply({
        content: 'Something went wrong while loading the leaderboard.',
        ephemeral: true
      });
    }
  }
};
