const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

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

    await interaction.reply({
      content: `✅ Toggle setup requested for **${role.name}**. I’ll wire the panel logic next.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
