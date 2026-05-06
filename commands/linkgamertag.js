const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const economy = require("../../modules/economy");
const serverstate = require("../../modules/serverstate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("linkgamertag")
    .setDescription("Link your gamertag to your Discord account")
    .addStringOption(option =>
      option
        .setName("gamertag")
        .setDescription("Enter your exact gamertag")
        .setRequired(true)
    ),

  async execute(interaction) {
    const gamertag = interaction.options.getString("gamertag", true);

    try {
      const matched = await findGamertagInServerstate(gamertag);

      if (!matched) {
        return interaction.reply({
          content: "Link failed, make sure you spelled it exactly and are in the server currently.",
          flags: MessageFlags.Ephemeral
        });
      }

      const { error } = await economy.supabase
        .from("economy_accounts")
        .update({ gamertag })
        .eq("user_id", interaction.user.id)
        .eq("guild_id", interaction.guildId);

      if (error) throw error;

      return interaction.reply({
        content: `Gamertag linked: ${gamertag}`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("linkgamertag command error:", error);
      return interaction.reply({
        content: "Something went wrong while linking your gamertag.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function findGamertagInServerstate(gamertag) {
  const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
  const latestFile = files
    .filter(f => typeof f?.content === "string" && /\.adm$/i.test(f.path || ""))
    .sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))[0];

  if (!latestFile?.content) return false;

  const lines = String(latestFile.content).split(/\r?\n/).filter(Boolean);
  return lines.some(line => line.includes(gamertag));
}
