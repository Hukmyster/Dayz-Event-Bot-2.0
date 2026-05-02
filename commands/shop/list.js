const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Show items available in the shop'),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use shop commands.',
          ephemeral: true
        });
      }

      const items = await economy.getShopItems();

      if (!items.length) {
        return interaction.reply({
          content: 'The shop is currently empty.',
          ephemeral: true
        });
      }

      const lines = items.map(item => {
        const price = economy.formatMoney(item.price);
        const desc = item.description ? ` — ${item.description}` : '';
        return `**${item.name}**: ${price}${desc}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('Shop Items')
        .setDescription(lines.join('\n'))
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('list command error:', error);
      return interaction.reply({
        content: 'Something went wrong while loading the shop.',
        ephemeral: true
      });
    }
  }
};
