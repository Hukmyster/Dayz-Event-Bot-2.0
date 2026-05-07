const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOGGLE_FILE = path.join(__dirname, "../../data/toggles.json");

function ensureToggleFile() {
  const dir = path.dirname(TOGGLE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(TOGGLE_FILE)) fs.writeFileSync(TOGGLE_FILE, JSON.stringify({ panels: [] }, null, 2));
}

function loadToggles() {
  ensureToggleFile();
  try {
    return JSON.parse(fs.readFileSync(TOGGLE_FILE, "utf8") || '{"panels":[]}');
  } catch {
    return { panels: [] };
  }
}

function saveToggles(data) {
  ensureToggleFile();
  fs.writeFileSync(TOGGLE_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removetoggle")
    .setDescription("Remove a role toggle panel from this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const data = loadToggles();
    const matches = (data.panels || []).filter(p => p.guildId === interaction.guildId && p.channelId === interaction.channelId);

    if (!matches.length) {
      return interaction.reply({
        content: "No toggles found in this channel.",
        flags: MessageFlags.Ephemeral
      });
    }

    const removed = [];
    for (const panel of matches) {
      if (panel.messageId) {
        try {
          const msg = await interaction.channel.messages.fetch(panel.messageId);
          await msg.delete();
          removed.push(panel.roleName || panel.roleId);
        } catch {}
      }
    }

    data.panels = (data.panels || []).filter(p => !(p.guildId === interaction.guildId && p.channelId === interaction.channelId));
    saveToggles(data);

    await interaction.reply({
      content: `✅ Removed ${removed.length} toggle panel(s) from this channel.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
