const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const economy = require("../../modules/economy");
const serverstate = require("../../modules/serverstate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whereami")
    .setDescription("Show your latest known location"),

  async execute(interaction) {
    try {
      const linked = await getLinkedGamertag(interaction.user.id, interaction.guildId);

      if (!linked) {
        return interaction.reply({
          content: "Link your gamertag first using /linkgamertag.",
          flags: MessageFlags.Ephemeral
        });
      }

      const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
      if (!files.length) {
        return interaction.reply({
          content: "Server logs are still loading. Try again in a moment.",
          flags: MessageFlags.Ephemeral
        });
      }

      const last = await getPlayerLastLocation(linked);

      if (!last) {
        return interaction.reply({
          content: "No location found yet. Stay on the server a little longer and try again.",
          flags: MessageFlags.Ephemeral
        });
      }

      const coordText = `${last.x}, ${last.y}, ${last.z}`;
      const mapLink = `https://www.izurvive.com/chernarusplussatmap/#location=${last.x};${last.z};8`;

      const embed = new EmbedBuilder()
        .setTitle("Your Latest Location")
        .setDescription(`Last seen for **${linked}**\n\n[${coordText}](${mapLink})`)
        .addFields(
          { name: "X", value: String(last.x), inline: true },
          { name: "Y", value: String(last.y ?? 0), inline: true },
          { name: "Z", value: String(last.z), inline: true }
        )
        .setColor(0x3498db)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      console.error("whereami command error:", error);
      return interaction.reply({
        content: "Something went wrong while looking up your location.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function getLinkedGamertag(userId, guildId) {
  const { data, error } = await economy.supabase
    .from("economy_accounts")
    .select("gamertag")
    .eq("user_id", userId)
    .eq("guild_id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data?.gamertag?.trim() || "";
}

async function getPlayerLastLocation(gamertag) {
  const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
  const latestFile = files
    .filter(f => typeof f?.content === "string" && /\.adm$/i.test(f.path || ""))
    .sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))[0];

  if (!latestFile?.content) return null;

  const lines = String(latestFile.content).split(/\r?\n/).filter(Boolean);
  const matches = [];

  for (const line of lines) {
    if (!containsExactCaseSensitive(line, gamertag)) continue;
    const parsed = parseLocationLine(line);
    if (parsed) matches.push(parsed);
  }

  if (!matches.length) return null;
  return matches[matches.length - 1];
}

function containsExactCaseSensitive(line, gamertag) {
  const escaped = gamertag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`(^|\\W)${escaped}(\\W|$)`);
  return exact.test(String(line));
}

function parseLocationLine(line) {
  const m = String(line).match(/pos=<\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*>/);
  if (!m) return null;

  return {
    x: Number(m[1]) || 0,
    y: Number(m[2]) || 0,
    z: Number(m[3]) || 0
  };
}
