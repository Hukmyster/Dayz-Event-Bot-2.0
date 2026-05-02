const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send money to another member')
    .addUserOption(option =>
      option
        .setName('member')
        .setDescription('The member to send money to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Amount to send')
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const targetUser = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const username = interaction.user.username;

      if (targetUser.bot) {
        return interaction.reply({
          content: 'You cannot send money to a bot.',
          ephemeral: true
        });
      }

      if (targetUser.id === userId) {
        return interaction.reply({
          content: 'You cannot send money to yourself.',
          ephemeral: true
        });
      }

      if (amount <= 0) {
        return interaction.reply({
          content: 'Amount must be greater than 0.',
          ephemeral: true
        });
      }

      const sender = await economy.getOrCreateAccount(userId, guildId, username);
      if (Number(sender.wallet || 0) < amount) {
        return interaction.reply({
          content: `You only have ${economy.formatMoney(sender.wallet)} in your wallet.`,
          ephemeral: true
        });
      }

      const receiver = await economy.getOrCreateAccount(targetUser.id, guildId, targetUser.username);

      const updatedSender = await economy.updateAccount(userId, guildId, {
        wallet: Number(sender.wallet || 0) - amount
      });

      const updatedReceiver = await economy.updateAccount(targetUser.id, guildId, {
        wallet: Number(receiver.wallet || 0) + amount
      });

      await economy.logTransaction({
        guildId,
        userId,
        username,
        type: 'send',
        amount: -amount,
        balanceAfter: updatedSender.wallet,
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        notes: `Sent to ${targetUser.username}`
      });

      await economy.logTransaction({
        guildId,
        userId: targetUser.id,
        username: targetUser.username,
        type: 'receive',
        amount,
        balanceAfter: updatedReceiver.wallet,
        targetUserId: userId,
        targetUsername: username,
        notes: `Received from ${username}`
      });

      const embed = new EmbedBuilder()
        .setTitle('Transfer Successful')
        .setDescription(`Sent **${economy.formatMoney(amount)}** to **${targetUser.username}**.`)
        .addFields(
          { name: 'Your Wallet', value: economy.formatMoney(updatedSender.wallet), inline: true },
          { name: 'Their Wallet', value: economy.formatMoney(updatedReceiver.wallet), inline: true }
        )
        .setColor(0x2ecc71)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('send command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while sending money.',
        ephemeral: true
      });
    }
  }
};
