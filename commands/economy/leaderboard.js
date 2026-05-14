const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const economy = require("../../modules/economy");
const playerstats = require("../../modules/playerstats");
const storage = require("../../services/storage");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show economy or PvP leaderboards"),

  async execute(interaction) {
    try {
      if (!economy.hasAccess?.(interaction.member)) {
        return interaction.reply({
          content: "You do not have the required role to use this command.",
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("leaderboard:select")
        .setPlaceholder("Choose a leaderboard")
        .addOptions(
          { label: "Economy", description: "Richest players", value: "economy" },
          { label: "Week", description: "Weekly PvP leaderboard", value: "week" },
          { label: "Month", description: "Monthly PvP leaderboard", value: "month" },
          { label: "All Time", description: "All-time PvP leaderboard", value: "alltime" }
        );

      const row = new ActionRowBuilder().addComponents(menu);

      const embed = new EmbedBuilder()
        .setTitle("Leaderboard")
        .setDescription("Choose which leaderboard you want to view.")
        .setColor(0xf1c40f);

      return interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    } catch (error) {
      console.error("leaderboard command error:", error);
      return interaction.reply({
        content: "Something went wrong while loading the leaderboard menu.",
        ephemeral: true
      });
    }
  }
};
