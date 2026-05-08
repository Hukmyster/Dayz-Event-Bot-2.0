const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('Add money to a member’s wallet')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to give money to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to add')
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

      const updated = await economy.adminAdjustWallet(
        member.id,
        interaction.guildId,
        amount,
        member.username,
        { notes: `Admin addmoney by ${interaction.user.username}` }
      );

      const embed = new EmbedBuilder()
        .setTitle('Money Added')
        .setDescription(`Added **${economy.formatMoney(amount)}** to **${member.username}**.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('addmoney command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while adding money.',
        ephemeral: true
      });
    }
  }
};
