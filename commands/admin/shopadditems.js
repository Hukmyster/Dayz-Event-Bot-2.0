const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const shop = require('../../modules/shop');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopadditem')
    .setDescription('Add a new item to the shop')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item display name')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Item type')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('price')
        .setDescription('Item price')
        .setRequired(true)
        .setMinValue(1)
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
      const type = interaction.options.getString('type', true);
      const price = interaction.options.getInteger('price', true);

      const result = await shop.addItem(name, type, price);

      return interaction.reply({
        content: result.reply || 'Item added.',
        ephemeral: true
      });
    } catch (error) {
      console.error('shopadditem command error:', error);
      return interaction.reply({
        content: error.message || 'Something went wrong while adding the item.',
        ephemeral: true
      });
    }
  }
};
