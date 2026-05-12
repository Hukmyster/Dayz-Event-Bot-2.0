const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const economy = require("../../modules/economy");
const serverstate = require("../../modules/serverstate");
const playerstats = require("../../modules/playerstats");

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.match(/("([^"]|"")*"|[^,]+)/g) || [];
    const values = cols.map(v => v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/""/g, '"') : v);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function toCsv(rows, headers) {
  const headerLine = headers.join(',');
  const lines = rows.map(row => headers.map(h => escapeCsv(row[h])).join(','));
  return [headerLine, ...lines].join('\n');
}

function indexOf(matrix, key, value) {
  const idx = matrix.findIndex(row => row[key] === value);
  return idx < 0 ? matrix.length : idx;
}

function replaceOrPush(matrix, key, value, row) {
  const idx = indexOf(matrix, key, value);
  if (idx === matrix.length) {
    matrix.push(row);
  } else {
    Object.assign(matrix[idx], row);
  }
  return matrix;
}

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
    const userId = interaction.user.id;
    const username = interaction.user.username;

    try {
      const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
      if (!files.length) {
        return interaction.reply({
          content: "Server logs are still loading. Try again in a moment.",
          flags: MessageFlags.Ephemeral
        });
      }

      const matched = await findExactQuotedGamertagInServerstate(gamertag);
      if (!matched) {
        return interaction.reply({
          content: "Link failed, make sure you spelled it exactly and are in the server currently.",
          flags: MessageFlags.Ephemeral
        });
      }

      await economy.upsertGamertagLink({
        userId,
        guildId: interaction.guildId,
        username,
        gamertag,
        lastSeenAt: new Date()
      });

      await playerstats.linkPsn(gamertag, userId, username);

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

async function findExactQuotedGamertagInServerstate(gamertag) {
  const files = typeof serverstate.getFiles === "function" ? serverstate.getFiles() : [];
  const admFiles = files.filter(f => typeof f?.content === "string" && /\.adm$/i.test(f.path || ""));

  for (const file of admFiles.sort((a, b) => Number(b?.current?.lineCount || 0) - Number(a?.current?.lineCount || 0))) {
    const lines = String(file.content).split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const extracted = extractQuotedName(line);
      if (extracted === gamertag) return true;
    }
  }

  return false;
}

function extractQuotedName(line) {
  const m = String(line).match(/"([^"]+)"/);
  return m ? m[1] : "";
}
