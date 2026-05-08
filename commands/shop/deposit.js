const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Move money from your wallet to your bank')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to deposit')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
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

      const updated = await economy.transferWalletToBank(userId, guildId, amount, username, {
        notes: 'User deposit'
      });

      const embed = new EmbedBuilder()
        .setTitle('Deposit Successful')
        .setDescription(`Deposited **${economy.formatMoney(amount)}** into your bank.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('deposit command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while depositing money.',
        ephemeral: true
      });
    }
  }
};
