const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription('Remove money from a member’s wallet')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to remove money from')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to remove')
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true
        });
      }

      const member = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);

      const target = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);
      if (Number(target.wallet || 0) < amount) {
        return interaction.reply({
          content: `${member.username} does not have enough money in their wallet.`,
          ephemeral: true
        });
      }

      const updated = await economy.adminAdjustWallet(
        member.id,
        interaction.guildId,
        -amount,
        member.username,
        { notes: `Admin removemoney by ${interaction.user.username}` }
      );

      const embed = new EmbedBuilder()
        .setTitle('Money Removed')
        .setDescription(`Removed **${economy.formatMoney(amount)}** from **${member.username}**.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
        )
        .setColor(0xe74c3c)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('removemoney command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while removing money.',
        ephemeral: true
      });
    }
  }
};
