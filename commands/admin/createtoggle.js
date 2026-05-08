const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createtoggle')
    .setDescription('Create a role toggle panel in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('role').setDescription('Role to toggle').setRequired(true)
    ),

  async execute(interaction) {
    try {
      if (!interaction.guild || !interaction.channel) {
        return interaction.reply({
          content: 'This command can only be used in a server channel.',
          ephemeral: true
        });
      }

      const role = interaction.options.getRole('role', true);

      const button = new ButtonBuilder()
        .setCustomId(`toggle:${role.id}`)
        .setLabel(role.name)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.channel.send({
        content: `Click to toggle **${role.name}**.`,
        components: [row]
      });

      return interaction.reply({
        content: `✅ Toggle created for **${role.name}**.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('createtoggle command error:', error);
      return interaction.reply({
        content: error.message || 'Failed to create the toggle panel.',
        ephemeral: true
      });
    }
  }
};
