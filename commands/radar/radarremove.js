const fs = require("fs");
const path = require("path");

const radarDir = "/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars";

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function removeRadar(name) {
  const filePath = path.join(radarDir, `${name}.json`);

  try {
    await fs.promises.access(filePath);
    await fs.promises.unlink(filePath);

    return {
      reply: `✅ Radar **${name}** removed.`
    };
  } catch (err) {
    return { reply: `Could not find or delete radar "${name}".`, success: false };
  }
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
      if (!res.success && !res.reply.includes("remained")) return interaction.reply({
        content: res.reply,
        flags: MessageFlags.Ephemeral
      });

      return replyEphemeral(interaction, res.reply || `✅ Radar **${name}** removed.`);
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to remove radar.");
    }
  }
};
