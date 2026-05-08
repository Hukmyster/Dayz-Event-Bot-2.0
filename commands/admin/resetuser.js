const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetuser')
    .setDescription('Reset a member’s wallet and bank to zero')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to reset')
        .setRequired(true)
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
      const account = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);
      const wallet = Number(account.wallet || 0);
      const bank = Number(account.bank || 0);
      const total = wallet + bank;

      const updated = await economy.updateAccount(member.id, interaction.guildId, {
        wallet: 0,
        bank: 0
      });

      await economy.logTransaction({
        guildId: interaction.guildId,
        userId: member.id,
        username: member.username,
        type: 'reset_all',
        amount: total,
        balanceAfter: 0,
        notes: `Account reset by ${interaction.user.username}`,
        metadata: {
          old_wallet: wallet,
          old_bank: bank,
          admin: true
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('User Reset')
        .setDescription(`Reset **${member.username}** to zero.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true },
          { name: 'Removed', value: economy.formatMoney(total), inline: true }
        )
        .setColor(0xf39c12)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('resetuser command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while resetting the user.',
        ephemeral: true
      });
    }
  }
};
