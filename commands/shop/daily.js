const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

const DAILY_AMOUNT = Number(process.env.DAILY_AMOUNT || 100);
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const cooldowns = new Map();

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily bank reward'),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const key = `${interaction.guildId}:${interaction.user.id}`;
      const now = Date.now();
      const lastUsed = cooldowns.get(key) || 0;
      const elapsed = now - lastUsed;

      if (elapsed < DAILY_COOLDOWN_MS) {
        const remaining = DAILY_COOLDOWN_MS - elapsed;
        return interaction.reply({
          content: `You already claimed your daily reward. Try again in ${formatRemaining(remaining)}.`,
          ephemeral: true
        });
      }

      const updated = await economy.addBank(
        interaction.user.id,
        interaction.guildId,
        DAILY_AMOUNT,
        interaction.user.username,
        {
          notes: 'Daily reward',
          source: 'daily'
        }
      );

      cooldowns.set(key, now);

      const embed = new EmbedBuilder()
        .setTitle('Daily Claimed')
        .setDescription(`You received **${economy.formatMoney(DAILY_AMOUNT)}** into your bank.`)
        .addFields(
          { name: 'Bank', value: economy.formatMoney(updated.bank), inline: true },
          { name: 'Wallet', value: economy.formatMoney(updated.wallet), inline: true }
        )
        .setColor(0x9b59b6)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('daily command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while claiming daily.',
        ephemeral: true
      });
    }
  }
};
