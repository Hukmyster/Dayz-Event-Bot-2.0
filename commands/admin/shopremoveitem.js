const { SlashCommandBuilder } = require('discord.js');
const shop = require('../../modules/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopremoveitem')
    .setDescription('Remove an item from the shop')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item display name')
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

      const name = interaction.options.getString('name', true);

      const result = await shop.deleteItem(name);

      return interaction.reply({
        content: result.reply || 'Item removed.',
        ephemeral: true
      });
    } catch (error) {
      console.error('shopremoveitem command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while removing the item.',
        ephemeral: true
      });
    }
  }
};
