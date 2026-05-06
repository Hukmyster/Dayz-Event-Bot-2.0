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
    const gamertag = interaction.options.getString("gamertag", true).trim();

    try {
      const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
      if (!files.length) {
        return interaction.reply({
          content: "Server logs are still loading. Try again in a moment.",
          flags: MessageFlags.Ephemeral
        });
      }

      const matched = await findExactGamertagInServerstate(gamertag);
      if (!matched) {
        return interaction.reply({
          content: "Link failed, make sure you spelled it exactly and are in the server currently.",
          flags: MessageFlags.Ephemeral
        });
      }

      const { data: existing, error: selectError } = await economy.supabase
        .from("economy_accounts")
        .select("id")
        .eq("user_id", interaction.user.id)
        .eq("guild_id", interaction.guildId)
        .maybeSingle();

      if (selectError) throw selectError;

      if (existing) {
        const { error } = await economy.supabase
          .from("economy_accounts")
          .update({ gamertag })
          .eq("user_id", interaction.user.id)
          .eq("guild_id", interaction.guildId);
        if (error) throw error;
      } else {
        const { error } = await economy.supabase
          .from("economy_accounts")
          .insert([{
            user_id: interaction.user.id,
            guild_id: interaction.guildId,
            username: interaction.user.username,
            wallet: 0,
            bank: 0,
            last_daily_claim_at: null,
            gamertag
          }]);
        if (error) throw error;
      }

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

async function findExactGamertagInServerstate(gamertag) {
  const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
  const admFiles = files.filter(f => typeof f?.content === "string" && /\.adm$/i.test(f.path || ""));

  for (const file of admFiles.sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))) {
    const lines = String(file.content).split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (containsExactCaseSensitive(line, gamertag)) return true;
    }
  }

  return false;
}

function containsExactCaseSensitive(line, gamertag) {
  const escaped = gamertag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`(^|\\W)${escaped}(\\W|$)`);
  return exact.test(String(line));
}
