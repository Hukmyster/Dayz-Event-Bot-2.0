const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw money from bank to wallet')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to withdraw')
        .setRequired(true)
        .setMinValue(1)
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

      if (amount <= 0) {
        return interaction.reply({
          content: 'Amount must be greater than 0.',
          ephemeral: true
        });
      }

      if (amount > 1000000) {
        return interaction.reply({
          content: 'Amount is too large (max 1,000,000).',
          ephemeral: true
        });
      }

      const result = await economy.transferBankToWallet(
        interaction.user.id,
        interaction.guildId,
        amount,
        interaction.user.username
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Withdrawal Successful')
        .setDescription(`Withdrew **${economy.formatMoney(amount)}** to your wallet.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(result.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(result.bank), inline: true }
        )
        .setColor(0x2ecc71);

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('withdraw error:', error);
      return interaction.reply({
        content: error.message || 'Withdrawal failed.',
        ephemeral: true
      });
    }
  }
};
