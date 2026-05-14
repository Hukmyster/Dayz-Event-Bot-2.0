const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send money to another player')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('Recipient')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to send')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const target = interaction.options.getUser('member');
      const amount = interaction.options.getInteger('amount', true);

      if (amount <= 0) {
        return interaction.reply({
          content: 'Amount must be greater than 0.',
          ephemeral: true
        });
      }

      if (amount > 500000) {
        return interaction.reply({
          content: 'Maximum transfer is 500,000.',
          ephemeral: true
        });
      }

      if (target.bot) {
        return interaction.reply({
          content: "You can't send money to a bot.",
          ephemeral: true
        });
      }

      if (target.id === interaction.user.id) {
        return interaction.reply({
          content: "You can't send money to yourself.",
          ephemeral: true
        });
      }

      await economy.transferWallet(
        interaction.user.id,
        target.id,
        interaction.guildId,
        amount,
        interaction.user.username,
        target.username
      );

      const embed = new EmbedBuilder()
        .setTitle('✅ Money Sent')
        .setDescription(`Sent **${economy.formatMoney(amount)}** to **${target.username}**.`)
        .setColor(0x00ff00);

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('send error:', error);
      return interaction.reply({
        content: error.message || 'Transfer failed.',
        ephemeral: true
      });
    }
  }
};
