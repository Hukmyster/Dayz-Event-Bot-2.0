const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const storage = require("../../modules/storage");

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function normalizeRadar(name, data, channelId, createdBy, x, z, radius) {
  return {
    name,
    x: Number(x),
    z: Number(z),
    radius: Number(radius),
    channelId: channelId || data?.channelId || null,
    adminId: data?.adminId || createdBy || null,
    admins: Array.isArray(data?.admins) ? data.admins : [],
    ignore: Array.isArray(data?.ignore) ? data.ignore : [],
    ignored: Array.isArray(data?.ignored) ? data.ignored : [],
    webhookUrl: data?.webhookUrl || null,
    webhookId: data?.webhookId || null
  };
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

async function saveRadars(radars) {
  await storage.saveJson("radars", radars);
}

async function createRadar(opts) {
  const { name, x, z, radius, channelId, createdBy } = opts;
  const radarName = String(name || "").trim();
  const radarX = Number(x);
  const radarZ = Number(z);
  const radarRadius = Number(radius);

  if (!radarName || !channelId || Number.isNaN(radarX) || Number.isNaN(radarZ) || Number.isNaN(radarRadius)) {
    return { reply: "Invalid radar data.", success: false };
  }

  const radars = await loadRadars();

  if (radars[radarName]) {
    return { reply: `Radar **${radarName}** already exists.`, success: false };
  }

  radars[radarName] = normalizeRadar(radarName, null, channelId, createdBy, radarX, radarZ, radarRadius);
  await saveRadars(radars);

  return {
    success: true,
    reply: `✅ Radar **${radarName}** created at ${radarX},${radarZ} with radius ${radarRadius}m.`
  };
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
