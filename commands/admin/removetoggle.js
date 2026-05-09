const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const storage = require("../../services/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removetoggle")
    .setDescription("Remove the saved role toggle panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      if (!interaction.guild || !interaction.channel) {
        return replyEphemeral(interaction, "This command can only be used in a server channel.");
      }

      const toggle = await storage.loadJson("toggle").catch(() => null);

      if (!toggle || !toggle.messageId) {
        return replyEphemeral(interaction, "No saved toggle was found.");
      }

      if (toggle.guildId && toggle.guildId !== interaction.guildId) {
        return replyEphemeral(interaction, "This toggle belongs to a different server.");
      }

      if (toggle.channelId && toggle.channelId !== interaction.channelId) {
        return replyEphemeral(interaction, "The saved toggle is in a different channel.");
      }

      try {
        const msg = await interaction.channel.messages.fetch(toggle.messageId);
        await msg.delete();
      } catch {}

      await storage.saveJson("toggle", {});

      return replyEphemeral(interaction, `✅ Removed the saved toggle panel for **${toggle.roleName || "that role"}**.`);
    } catch (error) {
      console.error("removetoggle command error:", error);
      return replyEphemeral(interaction, error.message || "Failed to remove the toggle panel.");
    }
  }
};
