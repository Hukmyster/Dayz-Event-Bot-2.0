const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { removeRadar } = require("../../modules/playerradars");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarremove")
    .setDescription("Remove an existing player radar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Radar name").setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString("name", true).trim();

    try {
      const res = await removeRadar(name);
      return replyEphemeral(interaction, res.reply || `✅ Radar **${name}** removed.`);
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to remove radar.");
    }
  }
};
