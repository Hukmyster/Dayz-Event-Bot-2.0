const fs = require("fs");
const path = require("path");

const radarDir = "/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars";

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function createRadar(opts) {
  const { name, x, z, radius, channelId, createdBy } = opts;

  const filePath = path.join(radarDir, `${name}.json`);

  if (!name || !channelId || isNaN(x) || isNaN(z) || !radius) {
    return { reply: "Invalid radar data.", success: false };
  }

  try {
    fs.mkdirSync(radarDir, { recursive: true });

    const data = {
      name,
      x,
      z,
      radius,
      channelId,
      adminId: createdBy,        // single admin owner
      ignored: []
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    return {
      success: true,
      reply: `✅ Radar **${name}** created at ${x},${z} with radius ${radius}m.`
    };
  } catch (err) {
    console.error("radaradd error:", err);
    return { reply: "Failed to save radar config.", success: false };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radaradd")
    .setDescription("Create a new player radar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName("name").setDescription("Radar name").setRequired(true))
    .addNumberOption(o => o.setName("x").setDescription("Radar X coord").setRequired(true))
    .addNumberOption(o => o.setName("z").setDescription("Radar Z coord").setRequired(true))
    .addIntegerOption(o => o.setName("radius").setDescription("Radar radius in meters").setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString("name", true).trim();
    const x = interaction.options.getNumber("x", true);
    const z = interaction.options.getNumber("z", true);
    const radius = interaction.options.getInteger("radius", true);

    if (!name) return replyEphemeral(interaction, "Radar name is required.");
    if (radius < 100 || radius > 500) {
      return replyEphemeral(interaction, "Radius must be between 100 and 500.");
    }

    try {
      const res = await createRadar({
        name,
        x,
        z,
        radius,
        channelId: interaction.channelId,
        createdBy: interaction.user.id
      });

      if (!res.success) throw new Error(res.reply);

      return replyEphemeral(interaction, res.reply || `✅ Radar **${name}** created.`);
    } catch (err) {
      return replyEphemeral(interaction, err.message || "Failed to create radar.");
    }
  }
};
