const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const storage = require("../../services/storage");
const ftp = require('basic-ftp');

function replyEphemeral(interaction, content) {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

async function listRadarFiles() {
  const client = new ftp.Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    await client.ensureDir('/dayzps_missions/dayzOffline.chernarusplus/custom/server/radars');
    const files = await client.list();
    
    return files
      .filter(item => item.name.endsWith('.json') && item.type === 'file')
      .map(item => item.name.replace('.json', ''));
  } finally {
    client.close();
  }
}

async function getRadarInfo(name) {
  const radar = await storage.loadRadar(name);
  return radar || null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("radarview")
    .setDescription("View all saved player radars.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const radarNames = await listRadarFiles();
      
      if (!radarNames.length) {
        return replyEphemeral(interaction, "No radars are saved yet.");
      }

      const radarInfos = [];
      for (const name of radarNames.slice(0, 25)) { // Limit to 25 to avoid timeout
        const radar = await getRadarInfo(name);
        if (radar) {
          radarInfos.push({
            name,
            radius: Number(radar.radius) || 0,
            channelId: radar.channelId
          });
        }
      }

      const list = radarInfos.map(r => 
        `• **${r.name}** — ${r.radius}m at ${r.channelId ? `<#${r.channelId}>` : "unknown channel"}`
      ).join("\n");

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
