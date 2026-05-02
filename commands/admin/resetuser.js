const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetuser')
    .setDescription('Reset a member’s wallet and bank to zero')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to reset')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!interaction.member.permissions?.has('Administrator')) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          ephemeral: true
        });
      }

      const member = interaction.options.getUser('member', true);

      const account = await economy.getOrCreateAccount(member.id, interaction.guildId, member.username);

      const updated = await economy.updateAccount(member.id, interaction.guildId, {
        wallet: 0,
        bank: 0
      });

      await economy.logTransaction({
        guildId: interaction.guildId,
        userId: member.id,
        username: member.username,
        type: 'reset',
        amount: 0,
        balanceAfter: 0,
        notes: `Account reset by ${interaction.user.username}`,
        metadata: {
          old_wallet: account.wallet,
          old_bank: account.bank,
          admin: true
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('User Reset')
        .setDescription(`Reset **${member.username}** to zero.`)
        .addFields(
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true },
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true }
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
