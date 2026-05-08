const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const storage = require("../../modules/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function loadRadars() {
  const data = await storage.loadJson("radars");
  if (Array.isArray(data)) {
    const obj = {};
    for (const radar of data) {
      if (radar?.name) obj[radar.name] = radar;
    }
    return obj;
  }
  return data && typeof data === "object" ? data : {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarview")
    .setDescription("View all saved player radars.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const radars = await loadRadars();
      const names = Object.keys(radars);

      if (!names.length) {
        return replyEphemeral(interaction, "No radars are saved yet.");
      }

      const list = names.map(name => {
        const r = radars[name] || {};
        return `• **${name}** — ${Number(r.radius) || 0}m at ${r.channelId ? `<#${r.channelId}>` : "unknown channel"}`;
      }).join("\n");

      const embed = new EmbedBuilder()
        .setTitle("Player Radars")
        .setColor(0x3498db)
        .setDescription(list);

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to load radars.");
    }
  }
};
