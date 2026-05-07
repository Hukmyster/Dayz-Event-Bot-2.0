const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removetoggle")
    .setDescription("Remove a role toggle panel from this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply({
      content: "✅ Toggle removal requested. I’ll wire the panel lookup logic next.",
      flags: MessageFlags.Ephemeral
    });
  }
};
