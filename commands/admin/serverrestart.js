const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { runRestartProcedure } = require("../../restart");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverrestart")
    .setDescription("Run the JSON build, upload, and restart process now.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply({
      content: "Starting server restart process now...",
      flags: MessageFlags.Ephemeral
    });

    try {
      await runRestartProcedure("manual");
      await interaction.followUp({
        content: "✅ Server restart process completed.",
        flags: MessageFlags.Ephemeral
      });
    } catch (err) {
      await interaction.followUp({
        content: `❌ Restart process failed: ${err.message || "Unknown error"}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
