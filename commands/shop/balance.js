const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show your wallet and bank balance')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('View another member’s balance')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('member') || interaction.user;
      const guildId = interaction.guildId;

      const account = await economy.getOrCreateAccount(
        targetUser.id,
        guildId,
        targetUser.username
      );

      const total = Number(account.wallet || 0) + Number(account.bank || 0);

      const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Balance`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(account.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(account.bank), inline: true },
          { name: 'Total', value: economy.formatMoney(total), inline: true }
        )
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('balance command error:', error);
      return interaction.reply({
        content: 'Something went wrong while loading the balance.',
        ephemeral: true
      });
    }
  }
};
