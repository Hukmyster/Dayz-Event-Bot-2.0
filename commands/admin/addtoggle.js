const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("createtoggle")
    .setDescription("Create a role toggle panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName("role").setDescription("Role to toggle").setRequired(true)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole("role", true);

    const button = new ButtonBuilder()
      .setCustomId(`toggle:${role.id}`)
      .setLabel(role.name)
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.channel.send({
      content: `Click to toggle **${role.name}**.`,
      components: [row]
    });

    await interaction.reply({
      content: `✅ Toggle created for **${role.name}**.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
