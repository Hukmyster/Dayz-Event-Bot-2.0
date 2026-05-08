const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('Show your full economy account')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('View another member’s account')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
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

      const wallet = Number(account.wallet || 0);
      const bank = Number(account.bank || 0);
      const total = wallet + bank;

      const embed = new EmbedBuilder()
        .setTitle(`${targetUser.username}'s Account`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(bank), inline: true },
          { name: 'Total', value: economy.formatMoney(total), inline: true }
        )
        .setColor(0x1abc9c)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('account command error:', error);
      return interaction.reply({
        content: 'Something went wrong while loading the account.',
        ephemeral: true
      });
    }
  }
};
