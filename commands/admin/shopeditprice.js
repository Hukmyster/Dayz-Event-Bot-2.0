const { SlashCommandBuilder } = require('discord.js');
const economy = require('../../modules/economy');
const shop = require('../../modules/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopeditprice')
    .setDescription('Change the price of an item')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item display name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('price')
        .setDescription('New price')
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== 'name') return interaction.respond([]);
      const results = await shop.autocomplete(focused.value);
      return interaction.respond(results);
    } catch (error) {
      console.error('shopeditprice autocomplete error:', error);
      return interaction.respond([]);
    }
  },

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use economy commands.',
          ephemeral: true
        });
      }

      const name = interaction.options.getString('name', true);
      const price = interaction.options.getInteger('price', true);

      if (price < 0) {
        return interaction.reply({
          content: 'Price must be zero or greater.',
          ephemeral: true
        });
      }

      const result = await shop.editPrice(name, price);

      return interaction.reply({
        content: result.reply || 'Price updated.',
        ephemeral: true
      });
    } catch (error) {
      console.error('shopeditprice command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while updating the price.',
        ephemeral: true
      });
    }
  }
};
