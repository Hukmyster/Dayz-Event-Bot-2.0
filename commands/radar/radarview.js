const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const { listRadars } = require("../../modules/playerradars");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarview")
    .setDescription("View all saved player radars.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const radars = await listRadars();

      if (!radars.length) {
        return interaction.reply({ content: "No radars are saved yet.", flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle("Player Radars")
        .setColor(0x3498db)
        .setDescription(
          radars.map(r => `• **${r.name}** — ${r.radius}m at <#${r.channelId || "unknown"}>`).join("\n")
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      return interaction.reply({
        content: err.message || "Failed to load radars.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
