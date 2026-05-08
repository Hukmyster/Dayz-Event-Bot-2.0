const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw money from bank to wallet')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to withdraw')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    try {
      const amount = interaction.options.getInteger('amount');
      const result = await economy.transferBankToWallet(
        interaction.user.id,
        interaction.guild.id,
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

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('withdraw error:', error);
      await interaction.reply({ content: error.message || 'Withdrawal failed.', ephemeral: true });
    }
  }
};
