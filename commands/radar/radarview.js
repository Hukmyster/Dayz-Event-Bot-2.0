const fs = require("fs");
const path = require("path");

const radarDir = "/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars";

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function listRadars() {
  try {
    const dirExistsStat = fs.statSync(radarDir);
    if (!dirExistsStat.isDirectory()) {
      return [];
    }
  } catch (errDir) {
    return [];
  }

  const files = await fs.promises.readdir(radarDir);

  const radars = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const filePath = path.join(radarDir, file);
    try {
      const text = await fs.promises.readFile(filePath, "utf8");
      const data = JSON.parse(text);

      if (data.name && data.x != null && data.z != null && data.radius) {
        radars.push(data);
      }
    } catch (err) {
      console.error("Failed to read radar file:", filePath, err);
    }
  }

  return radars;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarview")
    .setDescription("View all saved player radars.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const radars = await listRadars();

      if (!radars.length) {
        return interaction.reply({
          content: "No radars are saved yet.",
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("Player Radars")
        .setColor(0x3498db)
        .setDescription(
          radars
            .map(r => `• **${r.name}** — ${r.radius}m at ${r.channelId ? `<#${r.channelId}>` : "unknown channel"}`)
            .join("\n")
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
