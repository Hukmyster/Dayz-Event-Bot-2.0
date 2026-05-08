const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

const DAILY_AMOUNT = Number(process.env.DAILY_AMOUNT || 100);
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
      const account = await economy.getOrCreateAccount(interaction.user.id, interaction.guildId, interaction.user.username);
      const lastClaimValue = account.last_daily_claim_at;

      if (lastClaimValue) {
        const lastClaim = new Date(lastClaimValue).getTime();
        const elapsed = Date.now() - lastClaim;

        if (elapsed < DAILY_COOLDOWN_MS) {
          const remaining = DAILY_COOLDOWN_MS - elapsed;
          return interaction.reply({
            content: `You already claimed your daily reward. Try again in ${formatRemaining(remaining)}.`,
            flags: 64
          });
        }
      }

      const updated = await economy.addBank(
        interaction.user.id,
        interaction.guildId,
        DAILY_AMOUNT,
        interaction.user.username,
        { notes: 'Daily reward', source: 'daily' }
      );

      await economy.setDailyClaim(interaction.guildId, interaction.user.id, new Date().toISOString());

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
        flags: 64
      });
    }
  }
};
