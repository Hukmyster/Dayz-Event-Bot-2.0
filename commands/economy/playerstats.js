const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const playerstats = require("../../modules/playerstats");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playerstats")
    .setDescription("View your PSN-based PvP stats (K/D, kills, deaths, weapon, etc.)")
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const discordId = interaction.user.id;
    const discordName = interaction.user.username;

    let linkedPsn = null;

    try {
      linkedPsn = await playerstats.getLinkedPsnByDiscordId(discordId);
    } catch (err) {
      console.error("playerstats link lookup error:", err);
      return interaction.editReply(
        "You haven't linked a PSN gamertag yet. Use `/linkgamertag <your-psn>` first."
      );
    }

    if (!linkedPsn) {
      return interaction.editReply(
        "You haven't linked a PSN gamertag yet. Use `/linkgamertag <your-psn>` first."
      );
    }

    let stats;
    try {
      stats = await playerstats.getPlayerStats(linkedPsn, discordId);
    } catch (err) {
      console.error("playerstats error:", err);
      return interaction.editReply("Error reading stats for this PSN.");
    }

    if (!stats) {
      return interaction.editReply(
        "This PSN is already linked to another Discord account."
      );
    }

    const kdText = Number.isFinite(stats.kd) ? stats.kd.toFixed(2) : "0.00";

    const embed = new EmbedBuilder()
      .setTitle(`PvP Stats for ${stats.psn}`)
      .setColor(0x00ff00)
      .addFields(
        { name: "Kills / Deaths", value: `\`${stats.kills} / ${stats.deaths}\``, inline: true },
        { name: "K/D Ratio", value: `\`${kdText}\``, inline: true },
        { name: "Favourite Weapon", value: `\`${stats.favoriteWeapon}\``, inline: true },
        {
          name: "Longest PvP Kill",
          value: stats.maxPvpDistance ? `\`${Number(stats.maxPvpDistance).toFixed(2)}m\`` : "`N/A`",
          inline: true
        },
        { name: "First PvP Kill", value: stats.firstKillAt ? `\`${stats.firstKillAt}\`` : "`N/A`", inline: true },
        { name: "Last PvP Kill", value: stats.lastKillAt ? `\`${stats.lastKillAt}\`` : "`N/A`", inline: true },
        { name: "Last Death", value: stats.lastDeathAt ? `\`${stats.lastDeathAt}\`` : "`N/A`", inline: true }
      )
      .setFooter({ text: `Linked to: ${discordName}` });

    return interaction.editReply({ embeds: [embed] });
  }
};
