const { SlashCommandBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopadditem')
    .setDescription('Add a new item to the shop')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item name')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('price')
        .setDescription('Item price')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Item description')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!economy.hasAccess(interaction.member)) {
        return interaction.reply({
          content: 'You do not have the required role to use this command.',
          ephemeral: true
        });
      }

      const member = interaction.member;
      const isAdmin = member.permissions?.has('Administrator');

      if (!isAdmin) {
        return interaction.reply({
          content: 'You do not have permission to use admin shop commands.',
          ephemeral: true
        });
      }

      const name = interaction.options.getString('name', true).trim();
      const price = interaction.options.getInteger('price', true);
      const description = interaction.options.getString('description') || null;

      const { data, error } = await economy.supabase
        .from('shop')
        .insert({
          name,
          price,
          description
        })
        .select()
        .single();

      if (error) throw error;

      return interaction.reply({
        content: `Added **${data.name}** to the shop for **${economy.formatMoney(data.price)}**.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('shopadditem error:', error);
      return interaction.reply({
        content: 'Something went wrong while adding that item.',
        ephemeral: true
      });
    }
  }
};
