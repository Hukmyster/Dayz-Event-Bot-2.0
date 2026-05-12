// commands/economy/playerstats.js
const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

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

    // 1. You need to know which PSN this Discord user is linked to.
    //    This depends on your /linkgamertag system.
    //    For now, assume you have a helper `getLinkedPsn(discordId)` that returns a PSN string or throws.

    let linkedPsn = null;

    // EXAMPLE: pseudo‑call to your existing /linkgamertag map
    // You'll need to adapt this to your own storage.
    try {
      linkedPsn = await getLinkedPsn(discordId);
    } catch (err) {
      return interaction.editReply(
        "You haven't linked a PSN gamertag yet. Use `/linkgamertag <your-psn>` first."
      );
    }

    if (!linkedPsn) {
      return interaction.editReply(
        "You haven't linked a PSN gamertag yet. Use `/linkgamertag <your-psn>` first."
      );
    }

    // 2. Ask playerstats module for that PSN's data
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

    // 3. Build embed from computed values
    const kdText = stats.kd ? stats.kd.toFixed(2) : "0.00";

    const embed = {
      title: `PvP Stats for ${stats.psn}`,
      color: 0x00ff00,
      fields: [
        {
          name: "Kills / Deaths",
          value: `\`${stats.kills} / ${stats.deaths}\``, // K/D visible, but not raw K/D
          inline: true
        },
        {
          name: "K/D Ratio (computed)",
          value: `\`${kdText}\``,
          inline: true
        },
        {
          name: "Favourite Weapon",
          value: `\`${stats.favoriteWeapon}\``,
          inline: true
        },
        {
          name: "Longest PvP Kill",
          value: stats.maxPvpDistance
            ? `\`${stats.maxPvpDistance.toFixed(2)}m\``
            : "`N/A`",
          inline: true
        },
        {
          name: "First PvP Kill",
          value: stats.firstKillAt ? `\`${stats.firstKillAt}\`` : "`N/A`",
          inline: true
        },
        {
          name: "Last PvP Kill",
          value: stats.lastKillAt ? `\`${stats.lastKillAt}\`` : "`N/A`",
          inline: true
        },
        {
          name: "Last Death",
          value: stats.lastDeathAt ? `\`${stats.lastDeathAt}\`` : "`N/A`",
          inline: true
        }
      ],
      footer: {
        text: `Linked to: ${discordName}`
      }
    };

    await interaction.editReply({ embeds: [embed] });
  }
};

// ⚠️ Placeholder: replace this with your existing /linkgamertag logic
// You can either:
//  - move this helper into a service, or
//  - inline the lookup directly in your command file.
async function getLinkedPsn(discordId) {
  // This is an example; you must adapt it to your own storage / linking scheme.
  // e.g., reads a mapping JSON or checks playerstats/<psn>.json for userId.
  throw new Error("IMPLEMENT YOUR OWN getLinkedPsn()");
}
