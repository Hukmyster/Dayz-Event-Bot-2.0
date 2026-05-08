const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your or another player\'s balance')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member to check')
        .setRequired(false)),

  async execute(interaction) {
    try {
      const target = interaction.options.getUser('member') || interaction.user;
      const guildId = interaction.guild.id;

      const account = await economy.getOrCreateAccount(target.id, guildId, target.username);

      const wallet = Number(account.wallet || 0);
      const bank = Number(account.bank || 0);
      const total = wallet + bank;

      const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Balance`)
        .setColor(0x3498db)
        .addFields(
          { name: '💵 Wallet', value: economy.formatMoney(wallet), inline: true },
          { name: '🏦 Bank', value: economy.formatMoney(bank), inline: true },
          { name: '💰 Total', value: economy.formatMoney(total), inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('balance command error:', error);
      await interaction.reply({
        content: 'Failed to retrieve balance.',
        ephemeral: true
      });
    }
  }
};
