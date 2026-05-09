const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const storage = require("../../services/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function removeRadar(name) {
  const radarName = String(name || "").trim();

  // Check if radar exists before deleting
  const radar = await storage.loadRadar(radarName);
  if (!radar) {
    return { reply: `Could not find radar "${radarName}".`, success: false };
  }

  await storage.deleteRadar(radarName);
  return { reply: `✅ Radar **${radarName}** removed.`, success: true };
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
      if (!res.success) return replyEphemeral(interaction, res.reply || `Could not remove radar "${name}".`);
      return replyEphemeral(interaction, res.reply || `✅ Radar **${name}** removed.`);
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to remove radar.");
    }
  }
};
