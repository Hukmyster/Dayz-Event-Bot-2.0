const { SlashCommandBuilder } = require('discord.js');
const economy = require('../../modules/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopremoveitem')
    .setDescription('Remove an item from the shop')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item name to remove')
        .setRequired(true)
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

      const { data, error } = await economy.supabase
        .from('shop')
        .delete()
        .ilike('name', name)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return interaction.reply({
          content: `I could not find an item called "${name}".`,
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `Removed **${data.name}** from the shop.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('shopremoveitem error:', error);
      return interaction.reply({
        content: 'Something went wrong while removing that item.',
        ephemeral: true
      });
    }
  }
};
