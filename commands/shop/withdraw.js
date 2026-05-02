const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Move money from your bank to your wallet')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to withdraw')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const amount = interaction.options.getInteger('amount', true);
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const username = interaction.user.username;

      if (amount <= 0) {
        return interaction.reply({
          content: 'Amount must be greater than 0.',
          ephemeral: true
        });
      }

      const updated = await economy.transferBankToWallet(userId, guildId, amount, username, {
        notes: 'User withdraw'
      });

      const embed = new EmbedBuilder()
        .setTitle('Withdraw Successful')
        .setDescription(`Withdrew **${economy.formatMoney(amount)}** into your wallet.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('withdraw command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while withdrawing money.',
        ephemeral: true
      });
    }
  }
};
